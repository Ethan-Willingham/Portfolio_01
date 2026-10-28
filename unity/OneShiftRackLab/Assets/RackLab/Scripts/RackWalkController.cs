using UnityEngine;

namespace OneShift.RackLab
{
    [RequireComponent(typeof(CharacterController))]
    public sealed class RackWalkController : MonoBehaviour
    {
        public const float StandingHeight = 1.78f;
        public const float StandingEyeHeight = 1.65f;
        public const float BodyRadius = .25f;
        public const float HorizontalFieldOfView = 90f;
        public Camera eyes;
        public Vector3 spawnPosition;
        public float walkSpeed = 2.8f;
        public float runSpeed = 5.4f;
        public float sensitivity = 1.8f;
        [Min(1)] public float groundAcceleration = 18f;
        [Min(1)] public float groundDeceleration = 24f;
        [Min(0)] public float airAcceleration = 3f;
        [Min(0)] public float jumpHeight = .34f;
        CharacterController motor;
        float pitch, verticalSpeed;
        Vector3 horizontalVelocity, groundNormal = Vector3.up;
        Quaternion spawnRotation;
        bool captured, awaitNeutral;
        bool hadFocus = true;
        bool browserActive = true;
        bool externalControl = true;
        bool applicationPaused, vehicleMode;
        int suppressUseFrame = -1, captureQuietFrames;
        float lastGroundedAt = -10, jumpPressedAt = -10, walkedDistance, captureRequestedAt;
        public bool IsCaptured => captured;
        public bool CanControl => captured && !awaitNeutral && hadFocus && browserActive && externalControl &&
            !applicationPaused && !vehicleMode && Time.timeScale > 0;
        public bool VehicleMode => vehicleMode;
        public float HorizontalSpeedMps { get; private set; }
        public bool Grounded => motor != null && motor.enabled && motor.isGrounded;
        RackWearVariant target;
        WarehouseLightSwitch lightSwitch;
        WarehouseReceiving receiving;
        WarehouseOfficeDoor officeDoor;
        WarehouseParcel parcelTarget;
        WarehouseParcelService parcelDesk, parcelService;
        IWarehouseInteraction worldInteraction;
        public bool CarryingParcel => parcelService != null && parcelService.Carried != null;
        public bool HasInteractionTarget => lightSwitch != null || officeDoor != null ||
            (parcelDesk != null && CarryingParcel) || (parcelTarget != null && !CarryingParcel) ||
            (worldInteraction != null && !string.IsNullOrEmpty(worldInteraction.ActionKey)) || (target != null && receiving == null);
        public string InteractionTarget => lightSwitch != null ? "Light switch" :
            officeDoor != null ? "Office door" : parcelDesk != null && CarryingParcel ? "Parcel desk" :
            parcelTarget != null && !CarryingParcel ? "Parcel" : worldInteraction != null ? worldInteraction.Prompt :
            target != null && receiving == null ? "Rack finish" : "";
        public string ContextHintKey => !externalControl || vehicleMode ? "" :
            !captured ? "Click" : awaitNeutral ? "" :
            lightSwitch != null || officeDoor != null || (parcelDesk != null && CarryingParcel) ||
            (parcelTarget != null && !CarryingParcel) ? "E" : worldInteraction != null ? worldInteraction.ActionKey :
            target != null && receiving == null ? "E" : walkedDistance < 1.5f && !CarryingParcel ? "WASD" : "";
        public string ContextHint => !externalControl || vehicleMode ? "" :
            !captured ? "Look around the warehouse" : awaitNeutral ? "Release held controls" :
            lightSwitch != null ? lightSwitch.Prompt : officeDoor != null ? officeDoor.Prompt :
            parcelDesk != null && CarryingParcel ? "Receive parcel" :
            parcelTarget != null && !CarryingParcel ? "Carry parcel" :
            worldInteraction != null ? worldInteraction.Prompt :
            CarryingParcel ? "Bring this parcel to the office receiving desk" :
            target != null && receiving == null ? "Change rack finish" :
            walkedDistance < 1.5f ? "Walk through the warehouse" : "";

        void Awake()
        {
            motor = GetComponent<CharacterController>();
            spawnPosition = transform.position;
            spawnRotation = transform.rotation;
            receiving = Object.FindFirstObjectByType<WarehouseReceiving>();
            parcelService = Object.FindFirstObjectByType<WarehouseParcelService>();
            Application.targetFrameRate = 120;
            RefreshPerspective();
        }

        public void RefreshPerspective()
        {
            // Keep a stable horizon, eye height and field of view. Acceleration
            // belongs to the feet, without camera bob, roll or a sprint zoom.
            if (eyes != null)
                eyes.fieldOfView = Mathf.Min(65f, Camera.HorizontalToVerticalFieldOfView(HorizontalFieldOfView, eyes.aspect));
        }

        void LateUpdate() { if (!vehicleMode) RefreshPerspective(); }

        public void SetVehicleMode(bool active)
        {
            if (motor == null) motor = GetComponent<CharacterController>();
            vehicleMode = active;
            motor.enabled = !active;
            ClearMovement();
            ClearTargets();
            if (active)
            {
                // Transfer ownership to the driver without releasing the
                // browser's existing native pointer lock. A new lock request
                // from Unity's next frame has no trusted user gesture and
                // cannot reliably reacquire it after an intentional unlock.
                captured = false;
                awaitNeutral = false;
            }
            else Capture(false);
        }

        public void SetExternalControl(bool active)
        {
            externalControl = active;
            Capture(false);
            ClearTargets();
            Input.ResetInputAxes();
        }

        public void ResumeControlsFromUI()
        {
            if (!browserActive || !hadFocus || !externalControl || applicationPaused || vehicleMode || Time.timeScale <= 0) return;
            Capture(true);
        }

        public void ResumeFromVehicle(Vector3 position, Quaternion rotation)
        {
            if (motor == null) motor = GetComponent<CharacterController>();
            motor.enabled = false;
            transform.SetPositionAndRotation(position, rotation);
            pitch = 0;
            ClearMovement();
            eyes.transform.localRotation = Quaternion.identity;
            vehicleMode = false;
            motor.enabled = true;
            // The driver's Update runs first. Do not reuse its exit key press.
            suppressUseFrame = Time.frameCount;
            Capture(true);
        }

        void OnDisable() { Capture(false); }
        void OnApplicationFocus(bool focus)
        {
            hadFocus = focus;
            if (!focus) Capture(false);
        }
        void OnApplicationPause(bool value)
        {
            applicationPaused = value;
            if (value) Capture(false);
        }

        void Capture(bool value)
        {
            if (captured == value && !value) { ClearMovement(); return; }
            captured = value;
            awaitNeutral = value;
            if (value) { captureRequestedAt = Time.unscaledTime; captureQuietFrames = 2; }
            ClearMovement();
            Cursor.lockState = value ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !value;
        }

        void ClearMovement()
        {
            horizontalVelocity = Vector3.zero;
            verticalSpeed = HorizontalSpeedMps = 0;
            groundNormal = Vector3.up;
            lastGroundedAt = jumpPressedAt = -10;
        }

        void ClearTargets()
        {
            target = null; lightSwitch = null; officeDoor = null;
            parcelTarget = null; parcelDesk = null; worldInteraction = null;
        }

        public void SetBrowserActive(bool active)
        {
            browserActive = active;
            Capture(false);
            ClearTargets();
            Input.ResetInputAxes();
        }

        void ResolveTarget()
        {
            ClearTargets();
            if (eyes == null || !CanControl) return;
            if (!Physics.Raycast(eyes.transform.position, eyes.transform.forward, out var hit,
                5f, ~0, QueryTriggerInteraction.Ignore)) return;
            if (hit.distance <= 2.6f)
            {
                lightSwitch = hit.collider.GetComponentInParent<WarehouseLightSwitch>();
                officeDoor = hit.collider.GetComponentInParent<WarehouseOfficeDoor>();
                parcelTarget = hit.collider.GetComponentInParent<WarehouseParcel>();
                parcelDesk = hit.collider.GetComponentInParent<WarehouseParcelService>();
                worldInteraction = hit.collider.GetComponentInParent<IWarehouseInteraction>();
                if (parcelTarget != null && parcelTarget.Received) parcelTarget = null;
            }
            target = hit.collider.GetComponentInParent<RackWearVariant>();
        }

        void Update()
        {
            if (!browserActive || vehicleMode || !externalControl || applicationPaused || !hadFocus || Time.timeScale <= 0)
            {
                if (captured && !vehicleMode) Capture(false);
                return;
            }
            bool alreadyCaptured = captured;
            if (Input.GetKeyDown(KeyCode.Escape)) Capture(false);
            if (!captured && Input.GetMouseButtonDown(0)) Capture(true);
            if (captured)
            {
                // Browser pointer lock is asynchronous. Wait briefly for its
                // click request, but clear state if capture is later lost.
                if (Cursor.lockState != CursorLockMode.Locked)
                {
                    if (Time.unscaledTime - captureRequestedAt > .2f) Capture(false);
                    ClearTargets();
                    return;
                }
                if (awaitNeutral)
                {
                    // Drain the UI cursor movement queued while the engine
                    // was suspended. The frame that becomes neutral must not
                    // also rotate the view or reuse the menu's click.
                    if (captureQuietFrames > 0) captureQuietFrames--;
                    if (captureQuietFrames == 0 && ControlsNeutral()) awaitNeutral = false;
                    FallWithoutInput(Time.deltaTime);
                    ClearTargets();
                    return;
                }
                transform.Rotate(0, Input.GetAxisRaw("Mouse X") * sensitivity, 0);
                pitch = Mathf.Clamp(pitch - Input.GetAxisRaw("Mouse Y") * sensitivity, -85, 85);
                eyes.transform.localRotation = Quaternion.Euler(pitch, 0, 0);
                var input = Vector2.ClampMagnitude(new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical")), 1);
                var speed = Input.GetKey(KeyCode.LeftShift) ? runSpeed : walkSpeed;
                var desired = (transform.right * input.x + transform.forward * input.y) * speed;
                MoveFeet(desired, Time.deltaTime);
                if (Input.GetKeyDown(KeyCode.R)) ResetPosition();
                ResolveTarget();
                bool use = CanControl && Time.frameCount != suppressUseFrame &&
                    (Input.GetKeyDown(KeyCode.E) || (alreadyCaptured && Input.GetMouseButtonDown(0)));
                if (use && lightSwitch != null) lightSwitch.Toggle();
                else if (use && officeDoor != null) officeDoor.Toggle();
                else if (use && parcelDesk != null && CarryingParcel) parcelDesk.Receive();
                else if (use && parcelTarget != null && !CarryingParcel) parcelTarget.service.PickUp(parcelTarget);
                else if (use && worldInteraction != null && !string.IsNullOrEmpty(worldInteraction.ActionKey)) worldInteraction.Interact(this);
                else if (use && Input.GetKeyDown(KeyCode.E) && target != null && receiving == null) target.Cycle();
            }
            else
            {
                ClearTargets();
                // Releasing capture cannot leave a held walk or jump queued.
                FallWithoutInput(Time.deltaTime);
            }
            if (transform.position.y < -10) ResetPosition();
        }

        bool ControlsNeutral()
        {
            return Mathf.Abs(Input.GetAxisRaw("Horizontal")) < .01f && Mathf.Abs(Input.GetAxisRaw("Vertical")) < .01f &&
                !Input.GetKey(KeyCode.Space) && !Input.GetKey(KeyCode.LeftShift) && !Input.GetKey(KeyCode.RightShift) &&
                !Input.GetKey(KeyCode.E) && !Input.GetKey(KeyCode.R) &&
                !Input.GetMouseButton(0) && !Input.GetMouseButton(1);
        }

        void FallWithoutInput(float dt)
        {
            horizontalVelocity = Vector3.zero;
            HorizontalSpeedMps = 0;
            dt = Mathf.Min(dt, .05f);
            if (motor.isGrounded) { verticalSpeed = -2; return; }
            verticalSpeed += Physics.gravity.y * dt;
            motor.Move(Vector3.up * verticalSpeed * dt);
        }

        void MoveFeet(Vector3 desired, float dt)
        {
            // Bound integration after a stalled frame instead of taking a long
            // leap through the room. Physics still owns collision and slopes.
            dt = Mathf.Min(dt, .05f);
            bool grounded = motor.isGrounded;
            if (grounded) lastGroundedAt = Time.time;
            if (Input.GetKeyDown(KeyCode.Space)) jumpPressedAt = Time.time;
            horizontalVelocity = StepVelocity(horizontalVelocity, desired, grounded,
                groundAcceleration, groundDeceleration, airAcceleration, dt);
            if (grounded && verticalSpeed < 0) verticalSpeed = -2f;
            bool jump = Time.time - jumpPressedAt <= .12f && Time.time - lastGroundedAt <= .1f;
            if (jump)
            {
                verticalSpeed = Mathf.Sqrt(2f * Mathf.Abs(Physics.gravity.y) * jumpHeight);
                lastGroundedAt = jumpPressedAt = -10;
            }
            verticalSpeed += Physics.gravity.y * dt;
            Vector3 travel = grounded && !jump ? Vector3.ProjectOnPlane(horizontalVelocity, groundNormal) : horizontalVelocity;
            if (grounded && !jump && travel.sqrMagnitude > .0001f)
                travel = travel.normalized * horizontalVelocity.magnitude;
            Vector3 before = transform.position;
            groundNormal = Vector3.up;
            var flags = motor.Move((travel + Vector3.up * verticalSpeed) * dt);
            if ((flags & CollisionFlags.Above) != 0 && verticalSpeed > 0) verticalSpeed = 0;
            Vector3 actual = transform.position - before;
            HorizontalSpeedMps = dt > 0 ? new Vector2(actual.x, actual.z).magnitude / dt : 0;
            walkedDistance += new Vector2(actual.x, actual.z).magnitude;
            // A wall must not store full running speed for the next opening.
            if ((flags & CollisionFlags.Sides) != 0 && dt > 0)
                horizontalVelocity = new Vector3(actual.x, 0, actual.z) / dt;
        }

        public static Vector3 StepVelocity(Vector3 current, Vector3 desired, bool grounded,
            float acceleration, float deceleration, float airControl, float dt)
        {
            if (dt <= 0) return current;
            float response = !grounded ? airControl :
                desired.sqrMagnitude < current.sqrMagnitude || Vector3.Dot(current, desired) < 0 ? deceleration : acceleration;
            return Vector3.MoveTowards(current, desired, Mathf.Max(0, response) * dt);
        }

        void OnControllerColliderHit(ControllerColliderHit hit)
        {
            if (hit.normal.y > .55f) groundNormal = hit.normal;
        }

        public void ResetPosition()
        {
            if (vehicleMode || motor == null) return;
            motor.enabled = false;
            transform.SetPositionAndRotation(spawnPosition, spawnRotation);
            motor.enabled = true;
            pitch = 0;
            ClearMovement();
            eyes.transform.localRotation = Quaternion.identity;
        }
    }
}
