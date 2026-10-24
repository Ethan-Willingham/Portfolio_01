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
        public bool ControlsCaptured => captured && browserActive && focused && !awaitNeutral;
        Camera view;
        float originalNearClip;
        Transform originalCameraParent;
        Vector3 originalCameraPosition, spawnPosition;
        Quaternion originalCameraRotation, spawnRotation;
        Transform operatorEye;
        bool driving, trainingOpen, trained, captured, parkingBrake;
        bool browserActive = true, focused = true, awaitNeutral, applicationPaused;
        bool cabView;
        float orbitYaw, orbitPitch = 18, recoverHeld, noticeUntil;
        string notice;
        Vector3 cameraVelocity;
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
                    walking.SetVehicleMode(false);
                }
                else if (Input.GetKeyDown(KeyCode.Return)) { trained = true; EnterTruck(); }
                return;
            }
            if (!driving)
            {
                if (walking.CanControl && NearTruck() && Input.GetKeyDown(KeyCode.E))
                {
                    if (trained) EnterTruck();
                    else { trainingOpen = true; walking.SetVehicleMode(true); Capture(false); }
                }
                return;
            }
            if (Input.GetKeyDown(KeyCode.Escape)) Capture(false);
            if (!captured && Input.GetMouseButtonDown(0)) Capture(true);
            if (!captured) { vehicle.SetDriverInput(0, 0, true, parkingBrake, false); return; }
            if (Input.GetKeyDown(KeyCode.C)) { cabView = !cabView; cameraVelocity = Vector3.zero; }
            if (Input.GetKeyDown(KeyCode.F)) parkingBrake = !parkingBrake;
            if (Input.GetKeyDown(KeyCode.H)) effects.PlayOneShot(hornClip, .32f);
            if (Input.GetKeyDown(KeyCode.E)) { TryExit(); if (!driving) return; }

            float throttle = Input.GetAxisRaw("Vertical");
            float steer = Input.GetAxisRaw("Horizontal");
            bool brake = Input.GetKey(KeyCode.Space);
            if (awaitNeutral)
            {
                if (Mathf.Abs(throttle) < .01f && Mathf.Abs(steer) < .01f && !brake) awaitNeutral = false;
                throttle = steer = 0;
                brake = true;
            }
            vehicle.SetDriverInput(throttle, steer, brake, parkingBrake, Input.GetKey(KeyCode.LeftShift));
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
            parkingBrake = false;
            orbitYaw = 0; orbitPitch = 18; cabView = false;
            walking.SetVehicleMode(true);
            view.transform.SetParent(null, true);
            vehicle.SetOccupied(true);
            cameraVelocity = Vector3.zero;
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
            var obstruction = Physics.OverlapBox(spawnPosition + spawnRotation * new Vector3(0, 1.2f, .44f),
                new Vector3(.77f, 1.15f, 2.04f), spawnRotation, ~0, QueryTriggerInteraction.Ignore);
            foreach (var hit in obstruction)
                if (!hit.transform.IsChildOf(vehicle.transform)) { Tell("The parking bay is blocked. Clear it before recovering."); return; }
            vehicle.ResetVehicle(spawnPosition, spawnRotation);
            parkingBrake = true;
            awaitNeutral = true;
            UpdateCamera(true);
            Tell("Returned to the parking bay. F releases the parking brake.");
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
            Quaternion orbit = Quaternion.Euler(orbitPitch, yaw, 0);
            Vector3 direction = orbit * Vector3.back;
            float distance = 5.8f;
            foreach (var hit in Physics.SphereCastAll(focus, .18f, direction, distance, ~0, QueryTriggerInteraction.Ignore))
                if (!hit.transform.IsChildOf(vehicle.transform)) distance = Mathf.Min(distance, Mathf.Max(.12f, hit.distance - .12f));
            Vector3 desired = focus + direction * distance;
            // Pull in immediately at an obstruction; smooth only the return outward.
            bool obstructed = Vector3.Distance(view.transform.position, focus) > distance + .05f;
            view.transform.position = snap || obstructed ? desired : Vector3.SmoothDamp(view.transform.position, desired, ref cameraVelocity, .12f);
            view.transform.rotation = Quaternion.LookRotation(focus - view.transform.position, Vector3.up);
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
                Rect panel = new Rect((w-620)/2, (h-330)/2, 620, 330);
                Panel(panel);
                GUI.Label(new Rect(panel.x+24,panel.y+20,572,32), "FORKLIFT FAMILIARISATION", heading);
                GUI.Label(new Rect(panel.x+24,panel.y+68,572,170),
                    "W / S drive forward and reverse. Space brakes.\n\nThe rear wheels steer, and the tail swings wide. Slow for corners and ramps. One wheel riding high can roll the truck.\n\nShift gives a slow approach. F sets the parking brake. C changes between the rear and cab views.", copy);
                GUI.Label(new Rect(panel.x+24,panel.y+265,572,48), "Enter: begin driving     Escape: return to walking", copy);
            }
            else if (driving)
            {
                Panel(new Rect(18,18,310,85));
                string direction = vehicle.SignedSpeedMps < -.1f ? "REV" : vehicle.SignedSpeedMps > .1f ? "FWD" : "N";
                GUI.Label(new Rect(32,25,284,30), (vehicle.SpeedMps * 2.236936f).ToString("0.0") + " mph    " + direction, heading);
                GUI.Label(new Rect(32,60,284,25), parkingBrake ? "PARKING BRAKE" : "04 / YELLOW LPG", fine);
                Panel(new Rect(18,h-92,w-36,74));
                GUI.Label(new Rect(32,h-86,w-64,24), "W/S drive   A/D steer   Space brake   Shift slow   F park   E step out", fine);
                GUI.Label(new Rect(32,h-62,w-64,24), "Mouse look   C camera   V centre view   H horn   Hold R recover   Esc cursor", fine);
                string status = !captured ? "Click inside the game to drive." :
                    Time.unscaledTime < noticeUntil ? notice :
                    vehicle.IsOverturned ? "Forklift overturned. Hold R while stopped to recover." :
                    recoverHeld > 0 ? "Hold R to return to the parking bay..." :
                    "";
                if (status.Length > 0) { Panel(new Rect((w-620)/2,h-145,620,38)); GUI.Label(new Rect((w-590)/2,h-139,590,28),status,fine); }
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
