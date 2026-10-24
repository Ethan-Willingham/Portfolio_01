using System;
using UnityEngine;

namespace OneShift.RackLab
{
    /// <summary>Hydraulics and a reeved chain act on real jointed bodies. Cargo only touches the forks.</summary>
    [DisallowMultipleComponent]
    public sealed class ForkliftLiftController : MonoBehaviour
    {
        const float CylinderStiffness = 1200000;
        const float CylinderDamping = 140000;
        const float TiltStiffness = 400000;
        public Rigidbody chassisBody;
        public Rigidbody mastBody;
        public Rigidbody innerMastBody;
        public Rigidbody carriageBody;
        public HingeJoint mastHinge;
        public ConfigurableJoint innerSlide;
        public ConfigurableJoint carriageSlide;
        public Transform forkTips;
        public Transform[] fixedChainAnchors = new Transform[2];
        public Transform[] carriageChainAnchors = new Transform[2];
        public Transform[] chainSheaves = new Transform[2];
        public Transform[] tiltBarrels = new Transform[2];
        public Transform[] tiltRods = new Transform[2];
        public Transform[] tiltMastAnchors = new Transform[2];
        [SerializeField] Transform[] fullLengthTiltRods = new Transform[2];

        [Header("Travel and hydraulic limits")]
        [Min(.1f)] public float maximumLiftTravel = 3.9f;
        [Min(.01f)] public float liftSpeed = .5f;
        [Min(.01f)] public float lowerSpeed = .45f;
        [Min(0)] public float maximumLiftForce = 16285;
        [Min(0)] public float maximumTiltTorque = 25000;
        [Min(0)] public float forwardTiltLimit = 6;
        [Min(0)] public float backwardTiltLimit = 8;
        [Min(0)] public float tiltSpeed = 7;

        public float LiftInput { get; private set; }
        public float TiltInput { get; private set; }
        public bool Occupied { get; private set; }
        public float LiftTravelMeters => innerMastBody != null && carriageBody != null
            ? InnerTravel + CarriageRelativeTravel : 0;
        public float LiftHeightMeters => forkTips != null && chassisBody != null
            ? Vector3.Dot(forkTips.position - chassisBody.position, chassisBody.transform.up) : 0;
        public float TiltDegrees => mastBody != null && chassisBody != null
            ? Vector3.SignedAngle(chassisBody.rotation * Vector3.up, mastBody.rotation * Vector3.up, chassisBody.rotation * Vector3.right) : 0;
        public float HydraulicPressure { get; private set; }
        public bool IsStalled { get; private set; }
        public float AppliedLiftForce { get; private set; }
        public float AppliedTiltTorque { get; private set; }
        public float MaximumLiftForce => maximumLiftForce;

        [SerializeField] Vector3 innerRestPosition;
        [SerializeField] Vector3 carriageRestPosition;
        [SerializeField] float chainRestLength;
        [SerializeField] bool mechanismBuilt;
        float liftTarget, tiltTarget, liftIntegral, tiltIntegral, stalledTime;
        bool initialized, browserActive = true, focused = true, applicationPaused;
        Transform liftLever, tiltLever;
        Quaternion liftLeverRest, tiltLeverRest;
        float liftLeverPosition, tiltLeverPosition;
        readonly Vector3[] fixedAnchorLocal = new Vector3[2];
        readonly Vector3[] carriageAnchorLocal = new Vector3[2];
        readonly Vector3[] sheaveLocal = new Vector3[2];
        bool Active => browserActive && focused && !applicationPaused && Time.timeScale > 0;
        float InnerTravel => Vector3.Dot(innerMastBody.position - BodyPoint(mastBody, innerRestPosition), mastBody.rotation * Vector3.up);
        float CarriageRelativeTravel => Vector3.Dot(carriageBody.position - BodyPoint(innerMastBody, carriageRestPosition), innerMastBody.rotation * Vector3.up);

        static Vector3 BodyPoint(Rigidbody body, Vector3 local) => body.position + body.rotation * local;

        void CacheChainAnchors()
        {
            for (int i = 0; i < 2; i++)
            {
                fixedAnchorLocal[i] = mastBody.transform.InverseTransformPoint(fixedChainAnchors[i].position);
                carriageAnchorLocal[i] = carriageBody.transform.InverseTransformPoint(carriageChainAnchors[i].position);
                sheaveLocal[i] = innerMastBody.transform.InverseTransformPoint(chainSheaves[i].position);
            }
        }

        void Start() { if (!initialized) Initialize(); }
        void FixedUpdate() { TickPhysics(Time.fixedDeltaTime); }
        void LateUpdate() { UpdateVisuals(); }
        void Update() { if (!Active) ClearInput(); }
        void OnApplicationFocus(bool value) { focused = value; if (!value) ClearInput(); }
        void OnApplicationPause(bool value) { applicationPaused = value; if (value) ClearInput(); }
        void OnDisable() { ClearInput(); }

        public void SetOccupied(bool value) { Occupied = value; if (!value) ClearInput(); }
        public void SetBrowserActive(bool value) { browserActive = value; if (!value) ClearInput(); }
        public void SetInput(float lift, float tilt)
        {
            if (!Active || !Occupied) { ClearInput(); return; }
            CaptureNeutralTargets(lift, tilt);
            LiftInput = Mathf.Clamp(lift, -1, 1);
            TiltInput = Mathf.Clamp(tilt, -1, 1);
        }
        public void ClearInput()
        {
            CaptureNeutralTargets(0, 0);
            LiftInput = TiltInput = 0; stalledTime = 0; IsStalled = false;
        }

        void CaptureNeutralTargets(float lift, float tilt)
        {
            if (!initialized) return;
            // Closing a valve holds the attained position. Do this only on release,
            // so repeated neutral input does not discard the static hold correction.
            if (Mathf.Abs(LiftInput) > .0001f && Mathf.Abs(lift) <= .0001f)
            {
                float heldHeight = Mathf.Clamp(InnerTravel, 0, maximumLiftTravel * .5f);
                float gravityAlongMast = Mathf.Max(0, Vector3.Dot(-Physics.gravity, mastBody.rotation * Vector3.up));
                float emptyForce = (innerMastBody.mass + 2 * carriageBody.mass) * gravityAlongMast;
                float maximumCylinderForce = 2 * maximumLiftForce + innerMastBody.mass * Physics.gravity.magnitude;
                // Preserve the supporting pressure when the valve target changes.
                liftIntegral = Mathf.Clamp(liftIntegral + (liftTarget - heldHeight) * CylinderStiffness,
                    -emptyForce, maximumCylinderForce - emptyForce);
                liftTarget = heldHeight;
            }
            if (Mathf.Abs(TiltInput) > .0001f && Mathf.Abs(tilt) <= .0001f)
            {
                float heldAngle = Mathf.Clamp(TiltDegrees, -backwardTiltLimit, forwardTiltLimit);
                tiltIntegral = Mathf.Clamp(tiltIntegral + (tiltTarget - heldAngle) * Mathf.Deg2Rad * TiltStiffness,
                    -maximumTiltTorque, maximumTiltTorque);
                tiltTarget = heldAngle;
            }
        }

        /// <summary>Called by the handling installer before saving the derived prefab.</summary>
        public void BuildMechanism(Transform truckRoot)
        {
            chassisBody = truckRoot.GetComponent<Rigidbody>();
            if (chassisBody == null) throw new InvalidOperationException("Forklift chassis Rigidbody is required.");
            if (mechanismBuilt && mastBody != null) { EnsureTiltRodGeometry(); Initialize(); return; }
            var mastVisual = Find(truckRoot, "MastTilt_Pivot");
            var innerVisual = Find(truckRoot, "InnerMast_Lift");
            var carriageVisual = Find(truckRoot, "ForkCarriage_Lift");
            if (mastVisual == null || innerVisual == null || carriageVisual == null)
                throw new InvalidOperationException("The forklift's three mechanical pivots are required.");
            Vector3 previousMassMoment = chassisBody.mass * chassisBody.worldCenterOfMass;
            float previousMass = chassisBody.mass;
            mastBody = MakeBody("Outer mast physics", truckRoot, mastVisual.position, 220);
            innerMastBody = MakeBody("Inner mast physics", truckRoot, innerVisual.position, 140);
            carriageBody = MakeBody("Carriage and forks physics", truckRoot,
                carriageVisual.position - truckRoot.up * .04f, 160);
            mastVisual.SetParent(mastBody.transform, true);
            innerVisual.SetParent(innerMastBody.transform, true);
            carriageVisual.SetParent(carriageBody.transform, true);
            carriageVisual.position -= truckRoot.up * .04f;
            ExtendGeometry(mastVisual, mastBody.transform, -.265f, 1.45f);
            ExtendGeometry(innerVisual, innerMastBody.transform, -.18f, 1.45f);
            AttachCollision(truckRoot, "Outer mast compound collision", mastBody, -.265f, 1.45f, false);
            AttachCollision(truckRoot, "Inner mast compound collision", innerMastBody, -.18f, 1.45f, false);
            AttachCollision(truckRoot, "Carriage compound collision", carriageBody, 0, 1, true);
            AttachCollision(truckRoot, "Fork_Left collision", carriageBody, 0, 1, true);
            AttachCollision(truckRoot, "Fork_Right collision", carriageBody, 0, 1, true);
            foreach (var part in new[] { mastBody, innerMastBody, carriageBody })
                if (part.GetComponentsInChildren<Collider>().Length == 0)
                    throw new InvalidOperationException(part.name + " has no moving collision geometry.");
            forkTips = Find(carriageVisual, "ForkTips");
            for (int i = 0; i < 2; i++)
            {
                string side = i == 0 ? "L" : "R";
                fixedChainAnchors[i] = Find(mastVisual, "Chain_" + side + "_FixedAnchor");
                carriageChainAnchors[i] = Find(carriageVisual, "Chain_" + side + "_CarriageAnchor");
                chainSheaves[i] = Find(innerVisual, "ChainSheave_" + side + "_Pivot");
                // Rail extension moves the wheel centre, but the sheave stays round.
                var sheaveScale = chainSheaves[i].localScale;
                chainSheaves[i].localScale = new Vector3(sheaveScale.x, sheaveScale.y, sheaveScale.z / 1.45f);
                var oldChain = Find(mastVisual, "LeafChain_" + side);
                if (oldChain != null) foreach (var r in oldChain.GetComponentsInChildren<Renderer>()) r.enabled = false;
                tiltBarrels[i] = Find(truckRoot, "TiltCylinder_" + side + "_BarrelPivot");
                tiltRods[i] = Find(truckRoot, "TiltCylinder_" + side + "_RodEnd");
                tiltMastAnchors[i] = Find(mastVisual, "TiltCylinder_" + side + "_MastAnchor");
                AddLongPiston(innerMastBody.transform, Find(innerVisual, "LiftCylinder_" + side + "_Piston"));
            }
            innerRestPosition = mastBody.transform.InverseTransformPoint(innerMastBody.position);
            carriageRestPosition = innerMastBody.transform.InverseTransformPoint(carriageBody.position);
            mastHinge = mastBody.gameObject.AddComponent<HingeJoint>();
            mastHinge.connectedBody = chassisBody;
            mastHinge.autoConfigureConnectedAnchor = false;
            mastHinge.anchor = Vector3.zero;
            mastHinge.connectedAnchor = chassisBody.transform.InverseTransformPoint(mastBody.position);
            mastHinge.axis = Vector3.right;
            mastHinge.useLimits = true;
            mastHinge.limits = new JointLimits { min = -backwardTiltLimit, max = forwardTiltLimit, contactDistance = .2f };
            mastHinge.enableCollision = false;
            innerSlide = MakeSlide(innerMastBody, mastBody, maximumLiftTravel * .5f);
            carriageSlide = MakeSlide(carriageBody, innerMastBody, maximumLiftTravel * .5f);
            mastBody.ResetCenterOfMass(); innerMastBody.ResetCenterOfMass(); carriageBody.ResetCenterOfMass();
            mastBody.ResetInertiaTensor(); innerMastBody.ResetInertiaTensor(); carriageBody.ResetInertiaTensor();
            chassisBody.mass = previousMass - mastBody.mass - innerMastBody.mass - carriageBody.mass;
            var newMoment = mastBody.mass * mastBody.worldCenterOfMass + innerMastBody.mass * innerMastBody.worldCenterOfMass + carriageBody.mass * carriageBody.worldCenterOfMass;
            chassisBody.centerOfMass = chassisBody.transform.InverseTransformPoint((previousMassMoment - newMoment) / chassisBody.mass);
            chassisBody.ResetInertiaTensor();
            var drive = truckRoot.GetComponent<ForkliftDriveController>();
            if (drive != null) drive.additionalSupportedBodies = new[] { mastBody, innerMastBody, carriageBody };
            CacheChainAnchors();
            chainRestLength = ChainCoordinate();
            var chain = GetComponent<ForkliftLeafChainVisual>();
            if (chain == null) chain = gameObject.AddComponent<ForkliftLeafChainVisual>();
            chain.lift = this;
            mechanismBuilt = true;
            EnsureTiltRodGeometry();
            Initialize();
        }

        public void Initialize()
        {
            if (chassisBody == null) chassisBody = GetComponent<Rigidbody>();
            if (mastBody == null || innerMastBody == null || carriageBody == null) return;
            CacheChainAnchors();
            liftTarget = Mathf.Clamp(InnerTravel, 0, maximumLiftTravel * .5f);
            tiltTarget = TiltDegrees;
            liftIntegral = tiltIntegral = 0;
            if (liftLever == null)
            {
                liftLever = Find(transform, "LiftLever_Pivot");
                if (liftLever != null) liftLeverRest = liftLever.localRotation;
            }
            if (tiltLever == null)
            {
                tiltLever = Find(transform, "TiltLever_Pivot");
                if (tiltLever != null) tiltLeverRest = tiltLever.localRotation;
            }
            // Adjacent guide members overlap by design. Their joints transfer forces;
            // every external pallet, rack and ground collider still contacts them.
            var colliders = GetComponentsInChildren<Collider>();
            for (int a = 0; a < colliders.Length; a++)
                for (int b = a + 1; b < colliders.Length; b++)
                    if (!(colliders[a] is WheelCollider) && !(colliders[b] is WheelCollider) &&
                        colliders[a].attachedRigidbody != colliders[b].attachedRigidbody)
                        Physics.IgnoreCollision(colliders[a], colliders[b], true);
            initialized = true;
            UpdateVisuals();
        }

        public void TickPhysics(float dt)
        {
            if (!initialized) Initialize();
            if (!initialized || dt <= 0) return;
            if (!Active) { ClearInput(); innerSlide.xDrive = new JointDrive(); return; }
            var up = mastBody.rotation * Vector3.up;
            float height = InnerTravel;
            float velocity = Vector3.Dot(innerMastBody.GetPointVelocity(innerMastBody.position) -
                mastBody.GetPointVelocity(innerMastBody.position), up);
            float commandSpeed = LiftInput * (LiftInput >= 0 ? liftSpeed : lowerSpeed) * .5f;
            // Limit valve demand ahead of actual travel. A stalled cylinder cannot
            // accumulate metres of delayed motion that fires after the load is removed.
            liftTarget = Mathf.Clamp(liftTarget + commandSpeed * dt, Mathf.Max(0, height - .075f),
                Mathf.Min(maximumLiftTravel * .5f, height + .075f));
            float gravityAlongMast = Mathf.Max(0, Vector3.Dot(-Physics.gravity, up));
            float emptyForce = (innerMastBody.mass + 2 * carriageBody.mass) * gravityAlongMast;
            float maximumCylinderForce = 2 * maximumLiftForce + innerMastBody.mass * Physics.gravity.magnitude;
            float error = liftTarget - height;
            liftIntegral = Mathf.Clamp(liftIntegral + error * 480000 * dt, -emptyForce, maximumCylinderForce - emptyForce);
            float pressureDemand = emptyForce + liftIntegral + error * CylinderStiffness - velocity * CylinderDamping;
            // The native joint integrates cylinder damping with the guide and contact
            // constraints. Its force cap still lets an overloaded cylinder stall.
            innerSlide.xDrive = new JointDrive { positionSpring = CylinderStiffness, positionDamper = CylinderDamping,
                maximumForce = pressureDemand > 0 ? maximumCylinderForce : 0 };
            innerSlide.targetPosition = new Vector3(maximumLiftTravel * .25f - liftTarget -
                (emptyForce + liftIntegral) / CylinderStiffness, 0, 0);
            // PhysX excludes drive actuation from Joint.currentForce. Gauge pressure
            // follows the bounded spring/damper demand instead of guide reactions.
            // A negative pressure request vents the single-acting cylinder; gravity
            // lowers the forks instead of a powered downstroke pressing on the rack.
            float cylinderForce = Mathf.Clamp(pressureDemand, 0, maximumCylinderForce);
            ApplyChainTension(dt);
            AppliedLiftForce = cylinderForce;
            HydraulicPressure = cylinderForce / maximumCylinderForce;
            stalledTime = LiftInput > .1f && HydraulicPressure > .97f && Mathf.Abs(velocity) < .025f
                && height < maximumLiftTravel * .5f - .02f ? stalledTime + dt : 0;
            IsStalled = stalledTime > .25f;

            float angle = TiltDegrees;
            tiltTarget = Mathf.Clamp(tiltTarget + TiltInput * tiltSpeed * dt,
                Mathf.Max(-backwardTiltLimit, angle - 2), Mathf.Min(forwardTiltLimit, angle + 2));
            Vector3 axis = chassisBody.rotation * Vector3.right;
            float angularSpeed = Vector3.Dot(mastBody.angularVelocity - chassisBody.angularVelocity, axis);
            float angularError = (tiltTarget - angle) * Mathf.Deg2Rad;
            tiltIntegral = Mathf.Clamp(tiltIntegral + angularError * 300000 * dt, -maximumTiltTorque, maximumTiltTorque);
            float tiltTorque = Mathf.Clamp(angularError * TiltStiffness - angularSpeed * 30000 + tiltIntegral,
                -maximumTiltTorque, maximumTiltTorque);
            mastBody.AddTorque(axis * tiltTorque, ForceMode.Force);
            chassisBody.AddTorque(-axis * tiltTorque, ForceMode.Force);
            AppliedTiltTorque = tiltTorque;
        }

        float ChainCoordinate()
        {
            if (fixedChainAnchors[0] == null || carriageChainAnchors[0] == null || chainSheaves[0] == null) return 0;
            return Vector3.Dot(2 * BodyPoint(innerMastBody, sheaveLocal[0]) - BodyPoint(mastBody, fixedAnchorLocal[0]) -
                BodyPoint(carriageBody, carriageAnchorLocal[0]), mastBody.rotation * Vector3.up);
        }

        void ApplyChainTension(float dt)
        {
            Vector3 up = mastBody.rotation * Vector3.up;
            float stretch = ChainCoordinate() - chainRestLength;
            float speed = Vector3.Dot(2 * innerMastBody.GetPointVelocity(BodyPoint(innerMastBody, sheaveLocal[0])) -
                mastBody.GetPointVelocity(BodyPoint(mastBody, fixedAnchorLocal[0])) - carriageBody.GetPointVelocity(BodyPoint(carriageBody, carriageAnchorLocal[0])), up);
            // An implicit spring step keeps stiff steel-chain tension stable at the
            // production timestep. Compression is impossible: a slack chain pulls nothing.
            const float stiffness = 4000000;
            const float damping = 16000;
            float inverseMass = 4 / innerMastBody.mass + 1 / carriageBody.mass + 1 / chassisBody.mass;
            float tension = Mathf.Max(0, (stiffness * stretch + (damping + stiffness * dt) * speed) /
                (1 + (damping + stiffness * dt) * dt * inverseMass));
            for (int i = 0; i < 2; i++)
            {
                Vector3 halfForce = up * (tension * .5f);
                mastBody.AddForceAtPosition(halfForce, BodyPoint(mastBody, fixedAnchorLocal[i]), ForceMode.Force);
                carriageBody.AddForceAtPosition(halfForce, BodyPoint(carriageBody, carriageAnchorLocal[i]), ForceMode.Force);
                innerMastBody.AddForceAtPosition(-2 * halfForce, BodyPoint(innerMastBody, sheaveLocal[i]), ForceMode.Force);
            }
        }

        public void UpdateVisuals()
        {
            if (!initialized) return;
            for (int i = 0; i < 2; i++)
            {
                if (tiltBarrels[i] == null || tiltMastAnchors[i] == null) continue;
                Vector3 direction = (tiltMastAnchors[i].position - tiltBarrels[i].position).normalized;
                var aim = Quaternion.LookRotation(direction, chassisBody.transform.up);
                tiltBarrels[i].rotation = aim;
                if (tiltRods[i] != null) tiltRods[i].SetPositionAndRotation(tiltMastAnchors[i].position, aim);
                if (fullLengthTiltRods[i] != null)
                    fullLengthTiltRods[i].SetPositionAndRotation(tiltMastAnchors[i].position - direction * .275f,
                        Quaternion.FromToRotation(Vector3.up, direction));
            }
            liftLeverPosition = Mathf.MoveTowards(liftLeverPosition, LiftInput, Time.deltaTime * 8);
            tiltLeverPosition = Mathf.MoveTowards(tiltLeverPosition, TiltInput, Time.deltaTime * 8);
            if (liftLever != null) liftLever.localRotation = liftLeverRest * Quaternion.AngleAxis(liftLeverPosition * 15, Vector3.right);
            if (tiltLever != null) tiltLever.localRotation = tiltLeverRest * Quaternion.AngleAxis(tiltLeverPosition * 15, Vector3.right);
        }

        public void ResetHydraulics()
        {
            ClearInput();
            if (!initialized) Initialize();
            liftTarget = InnerTravel; tiltTarget = TiltDegrees;
            liftIntegral = tiltIntegral = 0;
        }

        static Rigidbody MakeBody(string name, Transform root, Vector3 position, float mass)
        {
            var node = new GameObject(name);
            node.transform.SetParent(root, false);
            node.transform.SetPositionAndRotation(position, root.rotation);
            var body = node.AddComponent<Rigidbody>();
            body.mass = mass; body.interpolation = RigidbodyInterpolation.Interpolate;
            body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            body.linearDamping = .01f; body.angularDamping = .04f;
            body.maxDepenetrationVelocity = 1.5f;
            return body;
        }

        static ConfigurableJoint MakeSlide(Rigidbody moving, Rigidbody support, float travel)
        {
            var joint = moving.gameObject.AddComponent<ConfigurableJoint>();
            joint.connectedBody = support;
            joint.autoConfigureConnectedAnchor = false;
            joint.anchor = Vector3.zero;
            joint.connectedAnchor = support.transform.InverseTransformPoint(moving.position + support.transform.up * (travel * .5f));
            joint.axis = Vector3.up; joint.secondaryAxis = Vector3.forward;
            joint.xMotion = ConfigurableJointMotion.Limited;
            joint.yMotion = joint.zMotion = ConfigurableJointMotion.Locked;
            joint.angularXMotion = joint.angularYMotion = joint.angularZMotion = ConfigurableJointMotion.Locked;
            joint.linearLimit = new SoftJointLimit { limit = travel * .5f, contactDistance = .002f };
            joint.enableCollision = false;
            joint.projectionMode = JointProjectionMode.None;
            return joint;
        }

        static void ExtendGeometry(Transform visual, Transform body, float baseHeight, float scale)
        {
            var extension = new GameObject("Extended mast geometry").transform;
            extension.SetParent(body, false);
            extension.localPosition = new Vector3(0, baseHeight, 0);
            visual.SetParent(extension, true);
            extension.localScale = new Vector3(1, scale, 1);
        }

        static void AttachCollision(Transform root, string name, Rigidbody target, float baseHeight, float stretch, bool lower)
        {
            var collision = Find(root, name);
            if (collision == null) throw new InvalidOperationException("Missing moving collision: " + name);
            if (collision.IsChildOf(target.transform)) return;
            if (lower) collision.position -= root.up * .04f;
            collision.SetParent(target.transform, true);
            if (Mathf.Abs(stretch - 1) > .001f)
                ExtendGeometry(collision, target.transform, baseHeight, stretch);
        }

        static void AddLongPiston(Transform support, Transform end)
        {
            if (end == null) return;
            var rod = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            rod.name = "Full stroke polished lift piston";
            var collision = rod.GetComponent<Collider>();
            if (Application.isPlaying) Destroy(collision); else DestroyImmediate(collision);
            rod.transform.SetParent(support, false);
            rod.transform.position = end.position - support.up * 1.25f;
            rod.transform.rotation = support.rotation;
            rod.transform.localScale = new Vector3(.048f, 1.25f, .048f);
            var candidates = support.GetComponentsInChildren<Renderer>();
            foreach (var candidate in candidates)
                if (candidate.sharedMaterial != null && candidate.sharedMaterial.name.Contains("polished"))
                { rod.GetComponent<Renderer>().sharedMaterial = candidate.sharedMaterial; break; }
        }

        void EnsureTiltRodGeometry()
        {
            for (int i = 0; i < 2; i++)
            {
                if (fullLengthTiltRods[i] != null || tiltRods[i] == null) continue;
                var oldRod = Find(tiltRods[i], "Tilt polished piston");
                Material material = null;
                if (oldRod != null && oldRod.TryGetComponent<Renderer>(out var renderer))
                { material = renderer.sharedMaterial; renderer.enabled = false; }
                if (material == null)
                    foreach (var candidate in tiltRods[i].GetComponentsInChildren<Renderer>())
                        if (candidate.sharedMaterial != null && candidate.sharedMaterial.name.Contains("polished"))
                        { material = candidate.sharedMaterial; candidate.enabled = false; break; }
                var rod = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                rod.name = "Full length tilt piston " + (i == 0 ? "L" : "R");
                var collision = rod.GetComponent<Collider>();
                if (Application.isPlaying) Destroy(collision); else DestroyImmediate(collision);
                rod.transform.SetParent(transform, false);
                rod.transform.localScale = new Vector3(.046f, .275f, .046f);
                if (material != null) rod.GetComponent<Renderer>().sharedMaterial = material;
                fullLengthTiltRods[i] = rod.transform;
            }
        }

        static Transform Find(Transform root, string name)
        {
            if (root.name == name) return root;
            for (int i = 0; i < root.childCount; i++)
            { var found = Find(root.GetChild(i), name); if (found != null) return found; }
            return null;
        }
    }
}
