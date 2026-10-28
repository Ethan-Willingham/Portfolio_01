using UnityEngine;

namespace OneShift.RackLab
{
    // The existing walking camera becomes the driver's camera. The truck itself
    // always moves through the physics controller, including when it overturns.
    [DefaultExecutionOrder(-100)]
    public sealed class ForkliftPlayerInteraction : MonoBehaviour
    {
        public RackWalkController walking;
        public ForkliftDriveController vehicle;
        public Transform exitAnchor;
        public float interactionDistance = 3f;
        public bool IsDriving => driving;
        public bool TrainingOpen => driving && !trained;
        public string TrainingStep => trained ? "complete" : trainingStep == 0 ? "brake" : trainingStep == 1 ? "lift" : "center";
        public bool CabView => cabView;
        public bool ParkingBrake => parkingBrake;
        public bool ForkControlHeld { get; private set; }
        public float MouseLiftInput { get; private set; }
        public float ForkSliderNormalized => mouseLift.Position;
        public float RequestedForkSpeedMps => lift == null ? 0 : MouseLiftInput *
            (MouseLiftInput >= 0 ? lift.liftSpeed : lift.lowerSpeed);
        public bool ForkViewActive => placementView != null && placementView.Active;
        public string ForkViewTarget => placementView != null && placementView.Target != null ? placementView.Target.name : "";
        public bool AssistActive => ForkControlHeld;
        public string AssistStage => ForkControlHeld ? "Lever" : "Idle";
        public string AssistStatus => ForkControlHeld ? "Centre the lever to hold height. Release Left Shift to look around." : "Hold Left Shift to adjust the forks";
        public bool ControlsCaptured => captured && browserActive && focused && !applicationPaused && !awaitNeutral && Time.timeScale > 0;
        public string Notice => Time.unscaledTime < noticeUntil ? notice : "";
        public string ContextHintKey => !driving ? CanOfferEntry ? "E" : "" :
            !captured ? "Click" : awaitNeutral ? "" : vehicle.IsOverturned || recoverHeld > 0 ? "R" :
            exitRequested ? "" : mouseLift.NeedsRelease ? "Left Shift" : TrainingOpen ? trainingStep == 0 ? "Space" : "Left Shift" :
            ForkControlHeld ? "Mouse" : !hasDriven ? "W / S" : vehicle.SpeedMps < .2f ? "Left Shift" : "";
        public string ContextHint => !driving ? CanOfferEntry ? "Climb into the forklift" : "" :
            !captured ? "Take the wheel" : awaitNeutral ? "Release held controls" :
            exitRequested ? "Stopping before stepping out" : vehicle.IsOverturned ? "Hold to recover the forklift" :
            recoverHeld > 0 ? "Keep holding to return to the parking bay" :
            mouseLift.NeedsRelease ? "Release, then hold again to use the forks" :
            TrainingOpen ? TrainingHint : ForkControlHeld ? "Centre the lever to stop the forks" :
            !hasDriven ? "Drive towards the first pallet" :
            lift != null && lift.LiftHeightMeters > .65f && vehicle.SpeedMps > .8f ? "Carry low and turn slowly" :
            vehicle.SpeedMps < .2f ? "Adjust the forks" : "";
        bool CanOfferEntry => walking != null && vehicle != null && vehicle.isActiveAndEnabled && walking.CanControl &&
            !walking.CarryingObject && !walking.HasInteractionTarget && NearTruck();
        string TrainingHint => trainingStep == 0 ? "Press the brake before moving" :
            trainingStep == 1 ? "Hold and move the mouse up to raise the forks" :
            trainingCentered ? "Release to begin driving" : "Move the lever to the centre to stop";
        Camera view;
        float originalNearClip;
        Transform originalCameraParent;
        Vector3 originalCameraPosition, spawnPosition;
        Quaternion originalCameraRotation, spawnRotation;
        Transform operatorEye;
        ForkliftLiftController lift;
        ForkliftPlacementView placementView;
        bool driving, trained, captured, parkingBrake, hasDriven;
        bool browserActive = true, focused = true, awaitNeutral, applicationPaused;
        bool cabView;
        bool exitRequested;
        int trainingStep, captureQuietFrames;
        bool trainingCentered;
        float trainingBrakeHeld, trainingCenterHeld, trainingStartHeight;
        float orbitYaw, orbitPitch = 18, recoverHeld, noticeUntil, captureRequestedAt;
        string notice;
        readonly ForkliftCameraRigState cameraRig = new ForkliftCameraRigState();
        readonly ForkliftMouseLift mouseLift = new ForkliftMouseLift();
        readonly RaycastHit[] cameraHits = new RaycastHit[96];
        AudioSource engine, effects;
        AudioClip engineClip, hornClip, reverseClip;
        float nextReverseBeep;

        void Awake()
        {
            if (walking == null) walking = GetComponent<RackWalkController>();
            if (vehicle == null) vehicle = FindFirstObjectByType<ForkliftDriveController>();
            if (walking == null || walking.eyes == null || vehicle == null) { enabled = false; return; }
            view = walking.eyes;
            lift = vehicle.GetComponent<ForkliftLiftController>();
            if (lift != null) placementView = new ForkliftPlacementView(vehicle, lift, view);
            originalNearClip = view.nearClipPlane;
            originalCameraParent = view.transform.parent;
            originalCameraPosition = view.transform.localPosition;
            originalCameraRotation = view.transform.localRotation;
            spawnPosition = vehicle.transform.position;
            spawnRotation = vehicle.transform.rotation;
            foreach (var part in vehicle.GetComponentsInChildren<Transform>(true))
                if (part.name == "OperatorEye") { operatorEye = part; break; }
            MakeAudio();
        }

        void OnDisable()
        {
            Capture(false);
            if (vehicle != null) { vehicle.SetDriverInput(0, 0, true, true, false); vehicle.SetOccupied(false); }
            if (lift != null) { lift.ClearInput(); lift.SetOccupied(false); }
            if (engine != null) engine.Stop();
            if (effects != null) effects.Stop();
        }

        void OnDestroy()
        {
            placementView?.Dispose();
            if (engineClip != null) Destroy(engineClip);
            if (hornClip != null) Destroy(hornClip);
            if (reverseClip != null) Destroy(reverseClip);
        }

        void OnApplicationFocus(bool value)
        {
            focused = value;
            if (!value) Capture(false);
            RefreshAudioActivity();
        }

        void OnApplicationPause(bool value)
        {
            applicationPaused = value;
            if (value) Capture(false);
            RefreshAudioActivity();
        }

        public void SetBrowserActive(bool active)
        {
            browserActive = active;
            Capture(false);
            recoverHeld = 0;
            RefreshAudioActivity();
        }

        public void ResumeControlsFromUI()
        {
            if (!driving || !browserActive || !focused || applicationPaused || Time.timeScale <= 0) return;
            ClearForkControl();
            if (lift != null) lift.ClearInput();
            vehicle.SetDriverInput(0, 0, true, parkingBrake, false);
            Capture(true);
        }

        void RefreshAudioActivity()
        {
            bool audible = driving && browserActive && focused && !applicationPaused;
            if (engine != null) { if (audible) engine.UnPause(); else engine.Pause(); }
            if (effects != null) { if (audible) effects.UnPause(); else effects.Pause(); }
        }

        void Capture(bool active)
        {
            bool ownedCapture = captured;
            captured = active;
            awaitNeutral = active;
            if (active) { captureRequestedAt = Time.unscaledTime; captureQuietFrames = 2; }
            // An inactive driver shares the walker's camera. Browser resume
            // may already hold native lock for walking or a returning computer
            // transition, so only the previous owner may release that lock.
            if (active || ownedCapture)
            {
                Cursor.lockState = active ? CursorLockMode.Locked : CursorLockMode.None;
                Cursor.visible = !active;
            }
            if (vehicle != null && !active) vehicle.SetDriverInput(0, 0, true, parkingBrake, false);
            if (lift != null && !active) lift.ClearInput();
            if (!active) { ClearForkControl(); exitRequested = false; }
        }

        bool NearTruck()
        {
            return vehicle.SpeedMps < .35f && !vehicle.IsOverturned &&
                Vector3.Distance(view.transform.position, vehicle.transform.TransformPoint(new Vector3(0, 1, -.2f))) < interactionDistance;
        }

        void Update()
        {
            if (!browserActive || !focused || applicationPaused || Time.timeScale <= 0)
            {
                if (captured) Capture(false);
                recoverHeld = 0;
                return;
            }
            if (!driving)
            {
                if (CanOfferEntry && Input.GetKeyDown(KeyCode.E)) EnterTruck();
                return;
            }
            if (Input.GetKeyDown(KeyCode.Escape)) { exitRequested = false; Capture(false); }
            if (!captured && Input.GetMouseButtonDown(0)) Capture(true);
            if (!captured) { vehicle.SetDriverInput(0, 0, true, parkingBrake, false); if (lift != null) lift.ClearInput(); return; }
            if (Cursor.lockState != CursorLockMode.Locked)
            {
                ClearForkControl();
                vehicle.SetDriverInput(0, 0, true, parkingBrake, false);
                if (lift != null) lift.ClearInput();
                if (Time.unscaledTime - captureRequestedAt > .2f) Capture(false);
                return;
            }
            if (!awaitNeutral && Input.GetKeyDown(KeyCode.C)) { cabView = !cabView; cameraRig.Reset(); }
            if (trained && !awaitNeutral && Input.GetKeyDown(KeyCode.F)) parkingBrake = !parkingBrake;
            if (!awaitNeutral && Input.GetKeyDown(KeyCode.H)) effects.PlayOneShot(hornClip, .32f);
            if (!awaitNeutral && Input.GetKeyDown(KeyCode.E)) { exitRequested = true; ClearForkControl(); }

            float throttle = Input.GetAxisRaw("Vertical");
            float steer = Input.GetAxisRaw("Horizontal");
            bool brake = Input.GetKey(KeyCode.Space);
            float liftInput = (Input.GetKey(KeyCode.Q) ? 1 : 0) - (Input.GetKey(KeyCode.Z) ? 1 : 0);
            float tiltInput = (Input.GetKey(KeyCode.T) ? 1 : 0) - (Input.GetKey(KeyCode.G) ? 1 : 0);
            bool neutralThisFrame = awaitNeutral;
            if (awaitNeutral)
            {
                if (captureQuietFrames > 0) captureQuietFrames--;
                if (Mathf.Abs(throttle) < .01f && Mathf.Abs(steer) < .01f && !brake &&
                    !Input.GetKey(KeyCode.Q) && !Input.GetKey(KeyCode.Z) && !Input.GetKey(KeyCode.T) && !Input.GetKey(KeyCode.G) &&
                    !Input.GetKey(KeyCode.LeftShift) && !Input.GetKey(KeyCode.RightShift) && !Input.GetKey(KeyCode.B) &&
                    !Input.GetKey(KeyCode.E) && !Input.GetKey(KeyCode.R) &&
                    !Input.GetMouseButton(0) && !Input.GetMouseButton(1) && captureQuietFrames == 0) awaitNeutral = false;
                throttle = steer = liftInput = tiltInput = 0;
                brake = true;
            }
            if (exitRequested)
            {
                throttle = steer = liftInput = tiltInput = 0;
                brake = true;
                if (vehicle.SpeedMps < .3f) { TryExit(); exitRequested = false; if (!driving) return; }
            }
            // A fresh accelerator command releases the parking brake. Leaving
            // the seat and losing control still apply it automatically.
            if (trained && !awaitNeutral && !exitRequested && Mathf.Abs(throttle) > .05f) parkingBrake = false;
            bool leverRequested = Input.GetKey(KeyCode.LeftShift) && !awaitNeutral && !neutralThisFrame && !exitRequested && lift != null;
            // While the visible lever is active it alone controls vertical
            // flow, so its centre always means stop. Q/Z remains an alternate
            // when the lever is closed. Right Shift never opens this control.
            MouseLiftInput = mouseLift.Tick(leverRequested, Input.GetAxisRaw("Mouse Y"), Time.deltaTime);
            ForkControlHeld = leverRequested;
            if (leverRequested) liftInput = MouseLiftInput;
            bool trainingThisFrame = !trained;
            if (trainingThisFrame)
            {
                throttle = steer = tiltInput = 0;
                brake = parkingBrake = true;
                if (awaitNeutral || exitRequested || trainingStep == 0) liftInput = 0;
                else liftInput = ForkControlHeld ? MouseLiftInput : 0;
                if (!awaitNeutral && !neutralThisFrame && !exitRequested) UpdateTraining();
            }
            vehicle.SetDriverInput(throttle, steer, brake, parkingBrake, trained && Input.GetKey(KeyCode.B));
            if (lift != null) lift.SetInput(liftInput, tiltInput);
            if (!leverRequested && !neutralThisFrame)
            {
                orbitYaw += Input.GetAxisRaw("Mouse X") * 1.7f;
                orbitPitch = Mathf.Clamp(orbitPitch - Input.GetAxisRaw("Mouse Y") * 1.3f, cabView ? -55 : 6, cabView ? 65 : 55);
            }
            if (!awaitNeutral && !neutralThisFrame && Input.GetKeyDown(KeyCode.V)) { orbitYaw = 0; orbitPitch = 18; }
            if (trained && vehicle.SpeedMps > .3f) hasDriven = true;
            recoverHeld = !awaitNeutral && Input.GetKey(KeyCode.R) && vehicle.SpeedMps < .45f ? recoverHeld + Time.deltaTime : 0;
            if (recoverHeld >= 1.25f) { Recover(); recoverHeld = 0; }
            engine.pitch = Mathf.Lerp(engine.pitch, .78f + Mathf.Clamp01(vehicle.SpeedMps / 4f) * .53f + Mathf.Abs(throttle) * .17f, Time.deltaTime * 3);
            engine.volume = Mathf.Lerp(engine.volume, .10f + Mathf.Abs(throttle) * .06f, Time.deltaTime * 4);
            if (vehicle.SignedSpeedMps < -.12f && Time.time >= nextReverseBeep)
            {
                effects.PlayOneShot(reverseClip, .18f);
                nextReverseBeep = Time.time + .85f;
            }
        }

        void EnterTruck()
        {
            driving = true;
            exitRequested = false;
            parkingBrake = true;
            if (!trained)
            {
                trainingStep = 0;
                trainingBrakeHeld = trainingCenterHeld = 0;
                trainingCentered = false;
                trainingStartHeight = lift != null ? lift.LiftTravelMeters : 0;
            }
            orbitYaw = 0; orbitPitch = 18; cabView = false;
            walking.SetVehicleMode(true);
            view.transform.SetParent(null, true);
            vehicle.SetOccupied(true);
            if (lift != null) lift.SetOccupied(true);
            cameraRig.Reset();
            Capture(true);
            UpdateCamera(true);
            engine.Play();
        }

        void UpdateTraining()
        {
            // Familiarisation is performed on the actual parked truck. No
            // drive or steering torque is admitted until the brake and lever
            // have been used. Enter/E cannot dismiss an instruction card.
            if (mouseLift.NeedsRelease && trainingStep > 0) return;
            if (trainingStep == 0)
            {
                trainingBrakeHeld = Input.GetKey(KeyCode.Space) ? trainingBrakeHeld + Time.deltaTime : 0;
                if (trainingBrakeHeld >= .2f)
                {
                    trainingStep = lift != null ? 1 : 2;
                    trainingStartHeight = lift != null ? lift.LiftTravelMeters : 0;
                    if (lift == null) trainingCentered = true;
                    ClearForkControl();
                }
                return;
            }
            if (trainingStep == 1)
            {
                if (ForkControlHeld && MouseLiftInput > .03f && lift.LiftTravelMeters - trainingStartHeight >= .045f)
                    trainingStep = 2;
                return;
            }
            if (ForkControlHeld && Mathf.Abs(ForkSliderNormalized) <= ForkliftMouseLift.CentreDeadZone)
            {
                trainingCenterHeld += Time.deltaTime;
                if (trainingCenterHeld >= .12f) trainingCentered = true;
            }
            else if (ForkControlHeld) { trainingCenterHeld = 0; trainingCentered = false; }
            if (trainingCentered && !Input.GetKey(KeyCode.LeftShift))
            {
                trained = true;
                ClearForkControl();
                Tell("Ready. Carry loads low and turn slowly.");
                // A held accelerator cannot launch on the completion frame.
                awaitNeutral = true;
            }
        }

        void TryExit()
        {
            if (vehicle.SpeedMps > .3f) { Tell("Stop before stepping out."); return; }
            if (vehicle.IsOverturned) { Tell("Hold R to recover the forklift before stepping out."); return; }
            Vector3[] localExits = {new Vector3(-1.3f, .1f, -.15f), new Vector3(1.3f, .1f, -.15f), new Vector3(0, .1f, -2.05f)};
            foreach (var local in localExits)
            {
                Vector3 candidate = vehicle.transform.TransformPoint(local);
                if (!Physics.Raycast(candidate + Vector3.up * 2, Vector3.down, out var ground, 5f, ~0, QueryTriggerInteraction.Ignore) || ground.normal.y < .8f) continue;
                Vector3 feet = ground.point + Vector3.up * .045f;
                if (Physics.CheckCapsule(feet + Vector3.up * .27f, feet + Vector3.up * 1.51f, .25f, ~0, QueryTriggerInteraction.Ignore)) continue;
                parkingBrake = true;
                vehicle.SetDriverInput(0, 0, true, true, false);
                vehicle.SetOccupied(false);
                if (lift != null) { lift.ClearInput(); lift.SetOccupied(false); }
                driving = false;
                ClearForkControl();
                engine.Stop();
                view.transform.SetParent(originalCameraParent, false);
                view.transform.localPosition = originalCameraPosition;
                view.transform.localRotation = originalCameraRotation;
                view.nearClipPlane = originalNearClip;
                walking.ResumeFromVehicle(feet, Quaternion.Euler(0, vehicle.transform.eulerAngles.y, 0));
                captured = false;
                return;
            }
            Tell("No clear space to step out here. Move away from the obstacle.");
        }

        void Recover()
        {
            // Recovery preserves the mast's current lift and tilt. Enclose its
            // actual shape in truck space, including raised forks, before moving.
            // Mesh-local bounds avoid inflating an overturned truck's world AABB.
            var truckFromWorld = vehicle.transform.worldToLocalMatrix;
            Bounds clearance = default;
            bool hasBounds = false;
            foreach (var solid in vehicle.GetComponentsInChildren<Collider>())
            {
                if (!solid.enabled || solid.isTrigger || solid is WheelCollider) continue;
                Bounds shape;
                Matrix4x4 truckFromShape;
                if (solid is BoxCollider box)
                {
                    shape = new Bounds(box.center, box.size);
                    truckFromShape = truckFromWorld * box.transform.localToWorldMatrix;
                }
                else if (solid is MeshCollider mesh && mesh.sharedMesh != null)
                {
                    shape = mesh.sharedMesh.bounds;
                    truckFromShape = truckFromWorld * mesh.transform.localToWorldMatrix;
                }
                else
                {
                    shape = solid.bounds;
                    truckFromShape = truckFromWorld;
                }
                for (int corner = 0; corner < 8; corner++)
                {
                    var signs = new Vector3((corner & 1) == 0 ? -1 : 1,
                        (corner & 2) == 0 ? -1 : 1, (corner & 4) == 0 ? -1 : 1);
                    Vector3 point = truckFromShape.MultiplyPoint3x4(shape.center + Vector3.Scale(shape.extents, signs));
                    if (!hasBounds) { clearance = new Bounds(point, Vector3.zero); hasBounds = true; }
                    else clearance.Encapsulate(point);
                }
            }
            if (!hasBounds) { Tell("Cannot check the parking bay for this forklift."); return; }
            // A low forward-tilted fork can sit below the chassis origin. Lift
            // the recovery pose just enough to keep every solid above the floor.
            Vector3 recoveryPosition = spawnPosition;
            recoveryPosition.y += Mathf.Max(0, .02f - (recoveryPosition.y + clearance.min.y));
            var obstruction = Physics.OverlapBox(recoveryPosition + spawnRotation * clearance.center,
                clearance.extents + new Vector3(.01f, .005f, .01f), spawnRotation, ~0, QueryTriggerInteraction.Ignore);
            foreach (var hit in obstruction)
                if (!hit.transform.IsChildOf(vehicle.transform)) { Tell("The parking bay is blocked. Clear it before recovering."); return; }
            vehicle.ResetVehicle(recoveryPosition, spawnRotation);
            if (lift != null) lift.ClearInput();
            parkingBrake = true;
            awaitNeutral = true;
            UpdateCamera(true);
            ClearForkControl();
            Tell("Returned to the parking bay. W or S releases the parking brake.");
        }

        void Tell(string value) { notice = value; noticeUntil = Time.unscaledTime + 3; }
        void ClearForkControl() { ForkControlHeld = false; MouseLiftInput = 0; mouseLift.Clear(); placementView?.Clear(); }
        // Browser preflight renders the real overlay behind its loading screen.
        // This only submits graphics; it does not occupy, capture or actuate.
        public void WarmPlacementGraphics() { placementView?.Draw(); }
        public void ClearPlacementGraphics() { placementView?.Clear(); }
        void LateUpdate()
        {
            if (driving && browserActive && focused && !applicationPaused && Time.timeScale > 0)
            {
                UpdateCamera(false);
                if (ForkControlHeld && ControlsCaptured) placementView?.Draw(); else placementView?.Clear();
            }
            else placementView?.Clear();
        }

        void UpdateCamera(bool snap)
        {
            float yaw = vehicle.transform.eulerAngles.y + orbitYaw;
            if (cabView)
            {
                view.transform.position = operatorEye != null ? operatorEye.position : vehicle.transform.TransformPoint(new Vector3(0, 1.77f, -.22f));
                view.transform.rotation = vehicle.transform.rotation * Quaternion.Euler(orbitPitch - 6, orbitYaw, 0);
                view.fieldOfView = Mathf.Min(70, Camera.HorizontalToVerticalFieldOfView(95, view.aspect));
                view.nearClipPlane = .045f;
                return;
            }
            Vector3 focus = vehicle.transform.position - Quaternion.Euler(0, vehicle.transform.eulerAngles.y, 0) * Vector3.forward * .4f + Vector3.up * .95f;
            cameraRig.Aim(yaw, orbitPitch, Time.deltaTime, snap);
            float distance = ForkliftCameraRigState.MaximumDistance;
            int hitCount = Physics.SphereCastNonAlloc(focus, .18f, cameraRig.Direction, cameraHits,
                distance, ~0, QueryTriggerInteraction.Ignore);
            for (int i = 0; i < hitCount; i++)
                if (!cameraHits[i].transform.IsChildOf(vehicle.transform))
                    distance = Mathf.Min(distance, Mathf.Max(.12f, cameraHits[i].distance - .12f));
            var pose = cameraRig.Place(focus, distance, Time.deltaTime, snap);
            view.transform.SetPositionAndRotation(pose.position, pose.rotation);
            view.fieldOfView = Mathf.Min(65, Camera.HorizontalToVerticalFieldOfView(90, view.aspect));
            view.nearClipPlane = .08f;
        }

        void MakeAudio()
        {
            var sound = new GameObject("Forklift engine and controls");
            sound.transform.SetParent(vehicle.transform, false);
            engine = sound.AddComponent<AudioSource>();
            effects = sound.AddComponent<AudioSource>();
            engineClip = Tone("LPG idle", 2, 48, true);
            hornClip = Tone("Forklift horn", .32f, 390, false);
            reverseClip = Tone("Reversing signal", .22f, 930, false);
            engine.clip = engineClip; engine.loop = true; engine.playOnAwake = effects.playOnAwake = false;
            engine.spatialBlend = effects.spatialBlend = .65f;
            engine.minDistance = effects.minDistance = 2;
            engine.maxDistance = effects.maxDistance = 20;
            engine.dopplerLevel = effects.dopplerLevel = 0;
        }

        static AudioClip Tone(string name, float duration, float frequency, bool motor)
        {
            const int sampleRate = 22050;
            var samples = new float[Mathf.RoundToInt(duration * sampleRate)];
            for (int i = 0; i < samples.Length; i++)
            {
                float t = i / (float)sampleRate, a = 2 * Mathf.PI * frequency * t;
                float envelope = motor ? 1 : Mathf.Min(1, i / 130f, (samples.Length - 1 - i) / 260f);
                samples[i] = envelope * (motor ? .28f * Mathf.Sin(a) + .15f * Mathf.Sin(2*a) + .07f * Mathf.Sin(5*a) : .40f * Mathf.Sin(a) + .12f * Mathf.Sin(1.5f*a));
            }
            var clip = AudioClip.Create(name, samples.Length, 1, sampleRate, false);
            clip.SetData(samples, 0);
            return clip;
        }

    }
}
