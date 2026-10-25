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
        public bool TrainingOpen => trainingOpen;
        public bool CabView => cabView;
        public bool ParkingBrake => parkingBrake;
        public bool AssistActive => assist != null && assist.IsRunning;
        public string AssistStage => assist != null ? assist.CurrentStage.ToString() : "Idle";
        public string AssistStatus => assist != null ? assist.Status : "";
        public bool ControlsCaptured => captured && browserActive && focused && !awaitNeutral;
        Camera view;
        float originalNearClip;
        Transform originalCameraParent;
        Vector3 originalCameraPosition, spawnPosition;
        Quaternion originalCameraRotation, spawnRotation;
        Transform operatorEye;
        ForkliftLiftController lift;
        ForkliftLoadAssist assist;
        bool driving, trainingOpen, trained, captured, parkingBrake;
        bool browserActive = true, focused = true, awaitNeutral, applicationPaused;
        bool cabView;
        bool helpOpen, exitRequested, guideStopping;
        float orbitYaw, orbitPitch = 18, recoverHeld, noticeUntil;
        float guideViewBlend;
        string notice;
        readonly ForkliftCameraRigState cameraRig = new ForkliftCameraRigState();
        readonly RaycastHit[] cameraHits = new RaycastHit[96];
        GUIStyle heading, copy, fine;
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
            if (lift != null) assist = new ForkliftLoadAssist(vehicle, lift);
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

        void RefreshAudioActivity()
        {
            bool audible = driving && browserActive && focused && !applicationPaused;
            if (engine != null) { if (audible) engine.UnPause(); else engine.Pause(); }
            if (effects != null) { if (audible) effects.UnPause(); else effects.Pause(); }
        }

        void Capture(bool active)
        {
            captured = active;
            awaitNeutral = active;
            Cursor.lockState = active ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !active;
            if (vehicle != null && !active) vehicle.SetDriverInput(0, 0, true, parkingBrake, false);
            if (lift != null && !active) lift.ClearInput();
            if (!active) { assist?.Cancel(); exitRequested = guideStopping = false; }
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
            if (trainingOpen)
            {
                if (Input.GetKeyDown(KeyCode.Escape))
                {
                    trainingOpen = false;
                    TryExit();
                    if (driving) trainingOpen = true;
                }
                else if (Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.E)) { trained = true; EnterTruck(); }
                return;
            }
            if (!driving)
            {
                if (walking.CanControl && NearTruck() && Input.GetKeyDown(KeyCode.E))
                {
                    EnterTruck();
                    if (!trained)
                    {
                        trainingOpen = true;
                        vehicle.SetOccupied(false);
                        if (lift != null) lift.SetOccupied(false);
                        Capture(false);
                        engine.Stop();
                    }
                }
                return;
            }
            if (Input.GetKeyDown(KeyCode.Escape)) { exitRequested = false; Capture(false); }
            if (!captured && Input.GetMouseButtonDown(0)) Capture(true);
            if (!captured) { vehicle.SetDriverInput(0, 0, true, parkingBrake, false); if (lift != null) lift.ClearInput(); return; }
            if (Input.GetKeyDown(KeyCode.C)) { cabView = !cabView; cameraRig.Reset(); }
            if (Input.GetKeyDown(KeyCode.Tab)) helpOpen = !helpOpen;
            if (Input.GetKeyDown(KeyCode.F)) parkingBrake = !parkingBrake;
            if (Input.GetKeyDown(KeyCode.H)) effects.PlayOneShot(hornClip, .32f);
            if (Input.GetKeyDown(KeyCode.E)) { exitRequested = true; assist?.Cancel(); }

            float throttle = Input.GetAxisRaw("Vertical");
            float steer = Input.GetAxisRaw("Horizontal");
            bool brake = Input.GetKey(KeyCode.Space);
            float liftInput = (Input.GetKey(KeyCode.Q) ? 1 : 0) - (Input.GetKey(KeyCode.Z) ? 1 : 0);
            float tiltInput = (Input.GetKey(KeyCode.T) ? 1 : 0) - (Input.GetKey(KeyCode.G) ? 1 : 0);
            if (awaitNeutral)
            {
                if (Mathf.Abs(throttle) < .01f && Mathf.Abs(steer) < .01f && !brake &&
                    !Input.GetKey(KeyCode.Q) && !Input.GetKey(KeyCode.Z) && !Input.GetKey(KeyCode.T) && !Input.GetKey(KeyCode.G) && !Input.GetKey(KeyCode.X)) awaitNeutral = false;
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
            if (!awaitNeutral && !exitRequested && Mathf.Abs(throttle) > .05f) parkingBrake = false;
            bool guideHeld = Input.GetKey(KeyCode.X) && !awaitNeutral && !exitRequested;
            bool manual = Mathf.Abs(throttle) > .01f || Mathf.Abs(steer) > .01f || brake || Mathf.Abs(liftInput) > .01f || Mathf.Abs(tiltInput) > .01f || Input.GetKeyDown(KeyCode.F);
            if (assist != null && guideHeld && !manual)
            {
                if (Input.GetKeyDown(KeyCode.X)) assist.Begin();
                if (assist.IsRunning)
                {
                    guideStopping = false;
                    parkingBrake = false;
                    assist.Tick(Time.deltaTime);
                }
                // A manual F cancels the guide and parks. Continuing to hold X
                // cannot undo that command; only a fresh successful guide or
                // accelerator input may release the parking brake again.
                else { vehicle.SetDriverInput(0, 0, true, parkingBrake, true); lift.ClearInput(); }
            }
            else
            {
                if (assist != null && assist.IsRunning)
                {
                    assist.Cancel(manual ? "Manual control. Hold X again when ready." : "Guide stopped. Hold X again to continue.");
                    guideStopping = !manual;
                }
                if (Input.GetKeyUp(KeyCode.X) && !manual) guideStopping = true;
                if (manual) guideStopping = false;
                if (guideStopping)
                {
                    brake = true;
                    if (vehicle.SpeedMps < .03f) guideStopping = false;
                }
                vehicle.SetDriverInput(throttle, steer, brake, parkingBrake, Input.GetKey(KeyCode.LeftShift));
                if (lift != null) lift.SetInput(liftInput, tiltInput);
            }
            orbitYaw += Input.GetAxisRaw("Mouse X") * 1.7f;
            orbitPitch = Mathf.Clamp(orbitPitch - Input.GetAxisRaw("Mouse Y") * 1.3f, cabView ? -55 : 6, cabView ? 65 : 55);
            if (Input.GetKeyDown(KeyCode.V)) { orbitYaw = 0; orbitPitch = 18; }
            recoverHeld = Input.GetKey(KeyCode.R) && vehicle.SpeedMps < .45f ? recoverHeld + Time.deltaTime : 0;
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
            trainingOpen = false;
            driving = true;
            exitRequested = false;
            parkingBrake = false;
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
            assist?.Cancel();
            Tell("Returned to the parking bay. W or S releases the parking brake.");
        }

        void Tell(string value) { notice = value; noticeUntil = Time.unscaledTime + 3; }
        void LateUpdate() { if (driving && browserActive && Time.timeScale > 0) UpdateCamera(false); }

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
            guideViewBlend = Mathf.MoveTowards(guideViewBlend, AssistActive ? 1 : 0, Time.deltaTime * 2.5f);
            if (lift != null && lift.forkTips != null)
                focus = Vector3.Lerp(focus, lift.forkTips.position - vehicle.transform.forward * .45f + Vector3.up * .55f, guideViewBlend * .55f);
            // A higher shoulder view exposes both pockets while the held guide
            // works. The same obstructed-camera solver still keeps it in the room.
            cameraRig.Aim(yaw + guideViewBlend * 22, Mathf.Lerp(orbitPitch, 31, guideViewBlend), Time.deltaTime, snap);
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

        void OnGUI()
        {
            if (vehicle == null || walking == null) return;
            if (heading == null)
            {
                var font = Resources.Load<Font>("RackLabFont");
                heading = new GUIStyle(GUI.skin.label) {font = font, fontSize = 22, fontStyle = FontStyle.Bold};
                copy = new GUIStyle(GUI.skin.label) {font = font, fontSize = 16, wordWrap = true};
                fine = new GUIStyle(copy) {fontSize = 14};
                heading.normal.textColor = copy.normal.textColor = fine.normal.textColor = new Color(.94f, .91f, .83f);
            }
            float scale = Mathf.Min(1, Screen.width / 1000f, Screen.height / 620f);
            var previous = GUI.matrix;
            GUI.matrix = Matrix4x4.TRS(Vector3.zero, Quaternion.identity, Vector3.one * scale);
            float w = Screen.width / scale, h = Screen.height / scale;
            if (trainingOpen)
            {
                Rect panel = new Rect((w-620)/2, (h-276)/2, 620, 276);
                Panel(panel);
                GUI.Label(new Rect(panel.x+24,panel.y+20,572,32), "YOUR FIRST DRIVE", heading);
                GUI.Label(new Rect(panel.x+24,panel.y+65,572,155),
                    "W / S drive. A / D steer. Space stops. E stops and steps out.\n\nFace a pallet end and hold X to line up and lift. Release X to stop. Hold it again to set the load down, then reverse out.\n\nCarry low and take corners slowly. The rear swings wide; a high or heavy load can tip the truck.", copy);
                GUI.Label(new Rect(panel.x+24,panel.y+230,572,32), "E or Enter: understood, start driving     Esc: step out", copy);
            }
            else if (driving)
            {
                Panel(new Rect(18,18,310,112));
                string direction = vehicle.SignedSpeedMps < -.1f ? "REV" : vehicle.SignedSpeedMps > .1f ? "FWD" : "N";
                GUI.Label(new Rect(32,25,284,30), (vehicle.SpeedMps * 2.236936f).ToString("0.0") + " mph    " + direction, heading);
                GUI.Label(new Rect(32,60,284,25), parkingBrake ? "PARKING BRAKE" : "04 / YELLOW LPG", fine);
                if (lift != null) GUI.Label(new Rect(32,86,284,25), "FORKS " + (lift.LiftHeightMeters * 3.28084f).ToString("0.0") + " ft" +
                    (lift.IsStalled ? "   LIFT LIMIT" : "   TILT " + lift.TiltDegrees.ToString("0") + " deg"), fine);
                if (WarehouseReceiving.Active != null)
                {
                    Panel(new Rect(342,84,w-360,64));
                    GUI.Label(new Rect(356,90,w-388,52), WarehouseReceiving.Active.StatusText, copy);
                }
                Panel(new Rect(18,h-88,w-36,70));
                GUI.Label(new Rect(32,h-82,w-64,24), "W/S drive   A/D steer   Space brake   E step out   C camera   Tab controls", fine);
                GUI.Label(new Rect(32,h-57,w-64,24), assist != null ? assist.Status : "Q/Z raise and lower the forks", fine);
                if (helpOpen)
                {
                    Panel(new Rect(18,h-190,640,92));
                    GUI.Label(new Rect(32,h-184,610,24), "Hold X: guide pickup / lower load   Release X: stop guide", fine);
                    GUI.Label(new Rect(32,h-160,610,24), "Q/Z raise/lower   T/G tilt   Shift slow   F park   V centre view", fine);
                    GUI.Label(new Rect(32,h-136,610,24), "Mouse look   H horn   Hold R recover   Esc cursor   Tab close", fine);
                }
                string status = !captured ? "Click inside the game to drive." :
                    Time.unscaledTime < noticeUntil ? notice :
                    exitRequested ? "Stopping to step out..." :
                    vehicle.IsOverturned ? "Forklift overturned. Hold R while stopped to recover." :
                    recoverHeld > 0 ? "Hold R to return to the parking bay..." :
                    "";
                if (status.Length > 0) { Panel(new Rect((w-620)/2,h-240,620,38)); GUI.Label(new Rect((w-590)/2,h-234,590,28),status,fine); }
                if (assist != null && assist.IsRunning && assist.Target != null)
                {
                    Vector3 pocket = view.WorldToScreenPoint(assist.PocketPoint);
                    if (pocket.z > 0)
                    {
                        float px = pocket.x / scale, py = (Screen.height - pocket.y) / scale;
                        GUI.color = new Color(.83f, .77f, .63f, .9f);
                        GUI.DrawTexture(new Rect(px-18,py-8,36,2), Texture2D.whiteTexture);
                        GUI.DrawTexture(new Rect(px-18,py+6,36,2), Texture2D.whiteTexture);
                        GUI.DrawTexture(new Rect(px-18,py-8,2,16), Texture2D.whiteTexture);
                        GUI.DrawTexture(new Rect(px+16,py-8,2,16), Texture2D.whiteTexture);
                        GUI.color = Color.white;
                    }
                }
            }
            else if (walking.CanControl && NearTruck())
            {
                Panel(new Rect((w-330)/2,h-120,330,36));
                GUI.Label(new Rect((w-300)/2,h-114,300,27), "E: drive the yellow forklift", copy);
            }
            GUI.matrix = previous;
        }

        static void Panel(Rect rect)
        {
            GUI.color = new Color(.08f,.10f,.09f,.92f);
            GUI.DrawTexture(rect, Texture2D.whiteTexture);
            GUI.color = Color.white;
        }
    }
}
