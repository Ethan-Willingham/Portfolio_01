using UnityEngine;

namespace OneShift.RackLab
{
    /// <summary>
    /// Front drive and rear steering for the counterbalance truck. Tire contact,
    /// the hinged rear axle, gravity and the body's mass distribution determine
    /// its stability. This controller never levels the truck or writes velocity
    /// during normal driving.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class ForkliftDriveController : MonoBehaviour
    {
        [Header("Physical parts, FL / FR / RL / RR")]
        public Rigidbody body;
        public Rigidbody rearAxleBody;
        public Rigidbody[] additionalSupportedBodies = new Rigidbody[0];
        public WheelCollider[] wheels = new WheelCollider[4];

        [Header("Imported visual pivots")]
        public Transform[] wheelVisuals = new Transform[4];
        public Transform[] rearSteerVisuals = new Transform[2];
        public Transform rearAxleVisual;
        public Transform steeringWheelVisual;
        public Vector3 steeringWheelLocalAxis = Vector3.forward;
        public float steeringWheelTurnsLockToLock = 3;

        [Header("Powertrain")]
        [Min(0)] public float driveTorquePerWheel = 1100;
        [Min(0.1f)] public float maximumForwardSpeed = 4.3f;
        [Min(0.1f)] public float maximumReverseSpeed = 3;
        [Min(0.1f)] public float throttleResponse = 4.8f;
        [Min(0)] public float serviceBrakeTorque = 3300;
        [Min(0)] public float parkingBrakeTorque = 6000;
        [Min(0)] public float coastingBrakeTorque = 1200;
        [Min(0.01f)] public float reverseEngagementSpeed = 0.14f;
        [Range(0.05f, 0.8f)] public float inchingTorqueFraction = 0.24f;
        [Min(0.1f)] public float inchingSpeed = 0.8f;

        [Header("Steering")]
        [Min(0.1f)] public float wheelbase = 1.71f;
        [Min(0.1f)] public float rearTrack = 0.98f;
        [Range(5, 60)] public float maximumRearSteerAngle = 60;
        [Range(3, 35)] public float highSpeedRearSteerAngle = 12;
        [Min(1)] public float steeringRate = 210;
        [Min(1)] public float steeringReturnRate = 260;

        public bool Occupied { get; private set; }
        public float SpeedMps => body != null ? body.linearVelocity.magnitude : 0;
        public float SignedSpeedMps => body != null
            ? Vector3.Dot(body.linearVelocity, body.transform.forward) : 0;
        public float SteerAngle { get; private set; }
        public int GroundedWheelCount { get; private set; }
        public bool IsOverturned => body != null && Vector3.Dot(body.transform.up, Vector3.up) < 0.25f;
        public float ThrottleInput { get; private set; }
        public float SteeringInput { get; private set; }
        public bool ServiceBrake { get; private set; }
        public bool ParkingBrake { get; private set; } = true;
        public bool Inching { get; private set; }
        public bool BrakingForDirectionChange { get; private set; }
        public float AppliedDriveTorque { get; private set; }

        Quaternion[] wheelRotationOffsets = new Quaternion[4];
        Quaternion[] steerRotationOffsets = new Quaternion[2];
        Quaternion axleVisualRotationOffset;
        Vector3 axleVisualPositionOffset;
        Quaternion steeringWheelRestRotation;
        Vector3 axleRestPosition;
        Quaternion axleRestRotation;
        float filteredThrottle;
        bool initialized;
        bool browserActive = true;
        bool applicationFocused = true;
        bool applicationPaused;
        readonly float[] supportedMasses = new float[4];

        bool SimulationActive => browserActive && applicationFocused && !applicationPaused && Time.timeScale > 0;

        void Awake()
        {
            if (body == null) body = GetComponent<Rigidbody>();
        }

        void Start()
        {
            if (!initialized) Initialize();
        }

        /// <summary>Call after assigning all physics bodies and imported parts.</summary>
        public void Initialize()
        {
            if (body == null) body = GetComponent<Rigidbody>();
            if (body == null) return;
            for (int i = 0; i < 4; i++)
            {
                var wheel = Wheel(i);
                var visual = Visual(i);
                wheelRotationOffsets[i] = wheel != null && visual != null
                    ? Quaternion.Inverse(wheel.transform.rotation) * visual.rotation
                    : Quaternion.identity;
            }
            for (int i = 0; i < 2; i++)
            {
                var wheel = Wheel(i + 2);
                var visual = RearSteerVisual(i);
                steerRotationOffsets[i] = wheel != null && visual != null
                    ? Quaternion.Inverse(wheel.transform.rotation) * visual.rotation
                    : Quaternion.identity;
            }
            if (rearAxleBody != null)
            {
                axleRestPosition = body.transform.InverseTransformPoint(rearAxleBody.position);
                axleRestRotation = Quaternion.Inverse(body.rotation) * rearAxleBody.rotation;
                if (rearAxleVisual != null)
                {
                    axleVisualPositionOffset = rearAxleBody.transform.InverseTransformPoint(rearAxleVisual.position);
                    axleVisualRotationOffset = Quaternion.Inverse(rearAxleBody.rotation) * rearAxleVisual.rotation;
                }
            }
            if (steeringWheelVisual != null) steeringWheelRestRotation = steeringWheelVisual.localRotation;

            // The rear tires support the counterweight through the hinge, not
            // merely half the axle's own mass. PhysX uses these rest loads to
            // calibrate its tire forces. Keep the real rigidbody masses intact.
            float frontZ = (body.transform.InverseTransformPoint(Wheel(0).transform.position).z +
                body.transform.InverseTransformPoint(Wheel(1).transform.position).z) * .5f;
            float rearZ = (body.transform.InverseTransformPoint(Wheel(2).transform.position).z +
                body.transform.InverseTransformPoint(Wheel(3).transform.position).z) * .5f;
            float totalMass = body.mass + (rearAxleBody != null ? rearAxleBody.mass : 0);
            float massMoment = body.mass * body.centerOfMass.z;
            if (rearAxleBody != null)
                massMoment += rearAxleBody.mass * body.transform.InverseTransformPoint(rearAxleBody.worldCenterOfMass).z;
            foreach (var part in additionalSupportedBodies)
            {
                if (part == null || part == body || part == rearAxleBody) continue;
                totalMass += part.mass;
                massMoment += part.mass * body.transform.InverseTransformPoint(part.worldCenterOfMass).z;
            }
            float frontSupport = (massMoment - totalMass * rearZ) / (frontZ - rearZ);
            supportedMasses[0] = supportedMasses[1] = frontSupport * .5f;
            supportedMasses[2] = supportedMasses[3] = (totalMass - frontSupport) * .5f;

            // PhysX substeps each body separately: front wheels support the
            // chassis; rear wheel forces pass through the oscillating axle joint.
            if (Wheel(0) != null) Wheel(0).ConfigureVehicleSubsteps(3, 12, 8);
            if (Wheel(2) != null) Wheel(2).ConfigureVehicleSubsteps(3, 12, 8);
            initialized = true;
        }

        public void SetOccupied(bool occupied)
        {
            if (Occupied == occupied) return;
            Occupied = occupied;
            ClearDriverInput();
        }

        public void SetDriverInput(float throttle, float steer, bool serviceBrake, bool parkingBrake, bool inching)
        {
            if (!Occupied || !SimulationActive)
            {
                ClearDriverInput();
                return;
            }
            ThrottleInput = Mathf.Clamp(throttle, -1, 1);
            SteeringInput = Mathf.Clamp(steer, -1, 1);
            ServiceBrake = serviceBrake;
            ParkingBrake = parkingBrake;
            Inching = inching;
        }

        public void ClearDriverInput()
        {
            ThrottleInput = 0;
            SteeringInput = 0;
            ServiceBrake = false;
            ParkingBrake = true;
            Inching = false;
            filteredThrottle = 0;
            BrakingForDirectionChange = false;
            ClearActuators();
        }

        public void SetBrowserActive(bool active)
        {
            browserActive = active;
            if (!active) ClearDriverInput();
        }

        void OnApplicationFocus(bool focused)
        {
            applicationFocused = focused;
            if (!focused) ClearDriverInput();
        }

        void OnApplicationPause(bool paused)
        {
            applicationPaused = paused;
            if (paused) ClearDriverInput();
        }

        void OnDisable()
        {
            ClearDriverInput();
        }

        void Update()
        {
            // FixedUpdate does not run while time is paused. Clear the stored
            // torque here as well so resume cannot revive a held throttle.
            if (!SimulationActive) ClearDriverInput();
        }

        void FixedUpdate()
        {
            TickPhysics(Time.fixedDeltaTime);
        }

        /// <summary>Also used by the isolated physics validation scene.</summary>
        public void TickPhysics(float dt)
        {
            if (!initialized) Initialize();
            if (body == null || dt <= 0) return;
            // Native vehicle creation replaces values set before the first
            // simulation step. Reapply only when necessary, including after
            // Unity rebuilds a wheel's native state. The next step then uses
            // the complete jointed truck's static support distribution.
            for (int i = 0; i < 4; i++)
            {
                var wheel = Wheel(i);
                if (wheel != null && supportedMasses[i] > 0 &&
                    Mathf.Abs(wheel.sprungMass - supportedMasses[i]) > .1f)
                    wheel.sprungMass = supportedMasses[i];
            }
            GroundedWheelCount = 0;
            for (int i = 0; i < 4; i++)
                if (Wheel(i) != null && Wheel(i).isGrounded) GroundedWheelCount++;
            if (!SimulationActive)
            {
                ClearDriverInput();
                return;
            }

            float speed = SignedSpeedMps;
            float absoluteSpeed = Mathf.Abs(speed);
            float speedFraction = Mathf.InverseLerp(1.1f, maximumForwardSpeed, absoluteSpeed);
            float innerLimit = Mathf.Lerp(maximumRearSteerAngle, highSpeedRearSteerAngle,
                Mathf.SmoothStep(0, 1, speedFraction));
            // Apply the steering limit to the inside wheel, then derive the
            // central steering angle and distinct Ackermann wheel angles.
            float innerAngle = Mathf.Abs(SteeringInput) * innerLimit;
            float centreTarget = 0;
            if (Occupied && innerAngle > 0.001f)
            {
                float turnRadius = wheelbase / Mathf.Tan(innerAngle * Mathf.Deg2Rad) + rearTrack * 0.5f;
                centreTarget = -Mathf.Sign(SteeringInput) * Mathf.Atan(wheelbase / turnRadius) * Mathf.Rad2Deg;
            }
            bool returning = Mathf.Abs(centreTarget) < Mathf.Abs(SteerAngle) ||
                Mathf.Sign(centreTarget) != Mathf.Sign(SteerAngle);
            float turnRate = returning ? steeringReturnRate : steeringRate;
            SteerAngle = Mathf.MoveTowards(SteerAngle, centreTarget, turnRate * dt);
            ApplyRearSteering();

            bool parked = ParkingBrake || !Occupied;
            float request = Occupied && !parked && !ServiceBrake ? ThrottleInput : 0;
            BrakingForDirectionChange = Mathf.Abs(request) > 0.03f &&
                Mathf.Sign(request) * speed < -reverseEngagementSpeed;
            bool braking = ServiceBrake || BrakingForDirectionChange;
            // Releasing the accelerator closes the drive request immediately.
            // Acceleration still ramps through finite wheel torque, while
            // opposite direction selection retains the physical brake phase.
            if (braking || parked || Mathf.Abs(request) < .03f) filteredThrottle = 0;
            else filteredThrottle = Mathf.MoveTowards(filteredThrottle, request, throttleResponse * dt);

            float drive = 0;
            if (!parked && !braking && Mathf.Abs(filteredThrottle) > 0.001f)
            {
                float limit = filteredThrottle >= 0 ? maximumForwardSpeed : maximumReverseSpeed;
                if (Inching) limit = Mathf.Min(limit, inchingSpeed);
                float directionSpeed = speed * Mathf.Sign(filteredThrottle);
                // A governor reduces engine torque. Slopes, impacts and other
                // rigidbodies may still push the truck beyond this road speed.
                float governor = 1 - Mathf.SmoothStep(0, 1,
                    Mathf.InverseLerp(limit * 0.78f, limit, directionSpeed));
                drive = filteredThrottle * driveTorquePerWheel * governor *
                    (Inching ? inchingTorqueFraction : 1);
            }
            AppliedDriveTorque = drive;

            float brake = parked ? parkingBrakeTorque : braking ? serviceBrakeTorque : 0;
            if (Inching && !parked && !braking)
            {
                // An inching pedal disengages drive and progressively applies
                // the service brake, so engaging it while moving slows the
                // truck through tire forces instead of merely cutting power.
                float excessSpeed = Mathf.InverseLerp(inchingSpeed, inchingSpeed + .8f, absoluteSpeed);
                brake = Mathf.Max(brake, serviceBrakeTorque * .35f * Mathf.SmoothStep(0, 1, excessSpeed));
            }
            // PhysX treats the jointed rear axle as an unpowered vehicle and
            // can leave its low-speed tire constraints locked. Unity exposes
            // no acceleration-intent API, so a negligible torque wakes that
            // solver whenever parking is released, including neutral so the
            // truck can roll downhill under gravity without accelerator input.
            float rearWakeTorque = !parked
                ? Mathf.Sign(Mathf.Abs(speed) > .025f ? speed : request) * .001f : 0;
            for (int i = 0; i < 4; i++)
            {
                var wheel = Wheel(i);
                if (wheel == null) continue;
                // The service and parking brakes act on the drive axle.
                // The rear axle has no meaningful propulsion torque.
                float torque = i < 2 ? drive : rearWakeTorque;
                if (i < 2 && !parked && !braking && Mathf.Abs(request) < .03f)
                {
                    // Driveline drag opposes wheel rotation. Using brakeTorque
                    // for coasting makes PhysX hold a stationary truck on a
                    // slope even when that small brake cannot oppose gravity.
                    float rollingSpeed = wheel.rpm * Mathf.PI / 30 * wheel.radius;
                    torque = -coastingBrakeTorque * Mathf.Clamp(rollingSpeed / .4f, -1, 1);
                    if (Mathf.Abs(torque) < .0001f) torque = rearWakeTorque;
                }
                wheel.motorTorque = torque;
                wheel.brakeTorque = i < 2 ? brake : 0;
            }
        }

        void ApplyRearSteering()
        {
            if (Wheel(0) != null) Wheel(0).steerAngle = 0;
            if (Wheel(1) != null) Wheel(1).steerAngle = 0;
            float left = 0;
            float right = 0;
            if (Mathf.Abs(SteerAngle) > 0.001f)
            {
                float radius = wheelbase / Mathf.Tan(Mathf.Abs(SteerAngle) * Mathf.Deg2Rad);
                float halfTrack = rearTrack * 0.5f;
                float sign = Mathf.Sign(SteerAngle);
                // Rear wheels steer left for a forward right turn. In that
                // turn the right wheel follows the smaller-radius circle.
                bool turnRight = SteerAngle < 0;
                left = sign * Mathf.Atan(wheelbase / Mathf.Max(0.01f,
                    radius + (turnRight ? halfTrack : -halfTrack))) * Mathf.Rad2Deg;
                right = sign * Mathf.Atan(wheelbase / Mathf.Max(0.01f,
                    radius + (turnRight ? -halfTrack : halfTrack))) * Mathf.Rad2Deg;
            }
            if (Wheel(2) != null) Wheel(2).steerAngle = left;
            if (Wheel(3) != null) Wheel(3).steerAngle = right;
        }

        void LateUpdate()
        {
            UpdateVisuals();
        }

        public void UpdateVisuals()
        {
            if (!initialized) return;
            if (rearAxleBody != null && rearAxleVisual != null)
            {
                rearAxleVisual.SetPositionAndRotation(
                    rearAxleBody.transform.TransformPoint(axleVisualPositionOffset),
                    rearAxleBody.rotation * axleVisualRotationOffset);
            }
            for (int i = 0; i < 2; i++)
            {
                var wheel = Wheel(i + 2);
                var visual = RearSteerVisual(i);
                if (wheel == null || visual == null) continue;
                wheel.GetWorldPose(out var position, out _);
                visual.SetPositionAndRotation(position, wheel.transform.rotation *
                    Quaternion.AngleAxis(wheel.steerAngle, Vector3.up) * steerRotationOffsets[i]);
            }
            for (int i = 0; i < 4; i++)
            {
                var wheel = Wheel(i);
                var visual = Visual(i);
                if (wheel == null || visual == null) continue;
                wheel.GetWorldPose(out var position, out var rotation);
                visual.SetPositionAndRotation(position, rotation * wheelRotationOffsets[i]);
            }
            if (steeringWheelVisual != null)
            {
                float fullLockRadius = wheelbase / Mathf.Tan(maximumRearSteerAngle * Mathf.Deg2Rad) + rearTrack * .5f;
                float fullLockCentre = Mathf.Atan(wheelbase / fullLockRadius) * Mathf.Rad2Deg;
                float normalized = fullLockCentre > 0 ? -SteerAngle / fullLockCentre : 0;
                steeringWheelVisual.localRotation = steeringWheelRestRotation * Quaternion.AngleAxis(
                    normalized * steeringWheelTurnsLockToLock * 180, steeringWheelLocalAxis.normalized);
            }
        }

        /// <summary>Only an explicit recovery action may teleport and reset the truck.</summary>
        public void ResetVehicle(Vector3 position, Quaternion rotation)
        {
            if (!initialized) Initialize();
            if (body == null) return;
            ClearDriverInput();
            SteerAngle = 0;
            Vector3 previousPosition = body.position;
            Quaternion poseDelta = rotation * Quaternion.Inverse(body.rotation);
            var partPositions = new Vector3[additionalSupportedBodies.Length];
            var partRotations = new Quaternion[additionalSupportedBodies.Length];
            for (int i = 0; i < additionalSupportedBodies.Length; i++)
            {
                var part = additionalSupportedBodies[i];
                if (part == null || part == body || part == rearAxleBody) continue;
                partPositions[i] = position + poseDelta * (part.position - previousPosition);
                partRotations[i] = poseDelta * part.rotation;
            }
            body.position = position;
            body.rotation = rotation;
            body.linearVelocity = Vector3.zero;
            body.angularVelocity = Vector3.zero;
            for (int i = 0; i < additionalSupportedBodies.Length; i++)
            {
                var part = additionalSupportedBodies[i];
                if (part == null || part == body || part == rearAxleBody) continue;
                part.position = partPositions[i];
                part.rotation = partRotations[i];
                part.linearVelocity = Vector3.zero;
                part.angularVelocity = Vector3.zero;
                part.WakeUp();
            }
            if (rearAxleBody != null)
            {
                rearAxleBody.position = position + rotation * axleRestPosition;
                rearAxleBody.rotation = rotation * axleRestRotation;
                rearAxleBody.linearVelocity = Vector3.zero;
                rearAxleBody.angularVelocity = Vector3.zero;
                rearAxleBody.WakeUp();
            }
            ApplyRearSteering();
            body.WakeUp();
            var lift = GetComponent<ForkliftLiftController>();
            if (lift != null) lift.ResetHydraulics();
            GroundedWheelCount = 0;
            UpdateVisuals();
        }

        void ClearActuators()
        {
            AppliedDriveTorque = 0;
            for (int i = 0; i < 4; i++)
            {
                var wheel = Wheel(i);
                if (wheel == null) continue;
                wheel.motorTorque = 0;
                wheel.brakeTorque = 0;
            }
        }

        WheelCollider Wheel(int index) => wheels != null && index < wheels.Length ? wheels[index] : null;
        Transform Visual(int index) => wheelVisuals != null && index < wheelVisuals.Length ? wheelVisuals[index] : null;
        Transform RearSteerVisual(int index) => rearSteerVisuals != null && index < rearSteerVisuals.Length ? rearSteerVisuals[index] : null;
    }
}
