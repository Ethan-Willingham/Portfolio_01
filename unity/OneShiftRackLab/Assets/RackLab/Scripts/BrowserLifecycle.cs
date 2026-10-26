using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.Scripting;

namespace OneShift.RackLab
{
    // The page owns its animation loop. This bridge freezes the simulation and
    // clears input before the page pauses Unity's exported main loop.
    [Preserve]
    public sealed class BrowserLifecycle : MonoBehaviour
    {
        public const int BuildVersion = 6;
#if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern void OneShiftRegisterBrowserLoop();
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern void OneShiftReportPlayerStats(int version, float framesPerSecond, float longestFrameMs, int frameCount);
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern void OneShiftReportGraphicsPreparation(int completed, int total, int ready);
#endif
        bool pageActive = true;
        bool windowFocused = true;
        bool applicationPaused;
        bool preparing;
        bool suspended;
        float previousTimeScale = 1;
        bool previousAudioPause;
        double sampleStart, previousRenderedAt;
        float longestFrameSeconds;
        int sampledFrames, lastRenderedFrame = -1;
        int completedRenderFrames;
        bool preparationFailed;

        void OnEnable()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            RenderPipelineManager.endContextRendering += OnFrameRendered;
#endif
        }

        void OnDisable()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            RenderPipelineManager.endContextRendering -= OnFrameRendered;
#endif
        }

        void OnFrameRendered(ScriptableRenderContext context, System.Collections.Generic.List<Camera> cameras)
        {
            if (!pageActive || !windowFocused || applicationPaused || Time.frameCount == lastRenderedFrame) return;
            bool renderedGame = false;
            foreach (var camera in cameras)
                if (camera != null && camera.cameraType == CameraType.Game) { renderedGame = true; break; }
            if (!renderedGame) return;
            lastRenderedFrame = Time.frameCount;
            completedRenderFrames++;
            if (suspended) return;
            double now = Time.realtimeSinceStartupAsDouble;
            if (sampleStart <= 0)
            {
                sampleStart = previousRenderedAt = now;
                return;
            }
            longestFrameSeconds = Mathf.Max(longestFrameSeconds, (float)(now - previousRenderedAt));
            previousRenderedAt = now;
            sampledFrames++;
            double elapsed = now - sampleStart;
            if (elapsed < .5) return;
#if UNITY_WEBGL && !UNITY_EDITOR
            OneShiftReportPlayerStats(BuildVersion, (float)(sampledFrames / elapsed), longestFrameSeconds * 1000, Time.frameCount);
#endif
            sampleStart = now;
            sampledFrames = 0;
            longestFrameSeconds = 0;
        }

        void ResetFrameSample()
        {
            sampleStart = previousRenderedAt = 0;
            sampledFrames = 0;
            longestFrameSeconds = 0;
            lastRenderedFrame = -1;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Install()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            if (Object.FindFirstObjectByType<BrowserLifecycle>() != null) return;
            OneShiftRegisterBrowserLoop();
            var bridge = new GameObject("BrowserLifecycle");
            DontDestroyOnLoad(bridge);
            var lifecycle = bridge.AddComponent<BrowserLifecycle>();
            Application.targetFrameRate = 60;
            WebGLInput.captureAllKeyboardInput = false;
            WebGLInput.stickyCursorLock = false;
            lifecycle.BeginGraphicsPreparation();
#endif
        }

        void BeginGraphicsPreparation()
        {
            // Preparation, page inactivity and manual pause share suspension
            // without replacing the original time scale on nested transitions.
            preparing = true;
            ApplyState();
            StartCoroutine(PrepareGraphics());
        }

        System.Collections.IEnumerator PrepareGraphics()
        {
            const int stages = 7;
            ReportPreparation(0, stages, 0);
            // Let scene Start methods place the delivery, with no physics step.
            yield return null;
            var walking = Object.FindFirstObjectByType<RackWalkController>();
            var dayNight = Object.FindFirstObjectByType<WarehouseDayNight>();
            var driver = Object.FindFirstObjectByType<ForkliftPlayerInteraction>();
            var forklift = Object.FindFirstObjectByType<ForkliftDriveController>();
            var receiving = Object.FindFirstObjectByType<WarehouseReceiving>();
            var camera = walking != null ? walking.eyes : Camera.main;
            if (camera == null || dayNight == null)
            {
                ReportPreparation(0, stages, -1);
                yield break;
            }
            var originalPosition = camera.transform.position;
            var originalRotation = camera.transform.rotation;
            float originalHour = dayNight.Hour;
            var rows = Object.FindObjectsByType<WarehouseLightRow>(FindObjectsSortMode.None);
            var rowStates = new bool[rows.Length];
            for (int i = 0; i < rows.Length; i++) rowStates[i] = rows[i].IsOn;
            bool completed = false;
            try
            {
                // Render actual scene variants into the real player targets.
                // Night, first sun, morning and afternoon include both banks
                // of window volumes, shadows and the time-sliced room probe.
                float[] hours = { originalHour, 6.05f, 9, 15 };
                for (int phase = 0; phase < hours.Length; phase++)
                {
                    dayNight.SetHour(hours[phase]);
                    dayNight.RequestReflection();
                    for (int view = 0; view < 5; view++)
                    {
                        if (view < 4)
                            camera.transform.SetPositionAndRotation(originalPosition,
                                Quaternion.Euler(0, view * 90, 0));
                        else
                        {
                            Vector3 truckPosition = receiving != null && receiving.truck != null
                                ? receiving.truck.position : new Vector3(0, 0, 24);
                            var eye = truckPosition + new Vector3(7, 4, 6);
                            camera.transform.SetPositionAndRotation(eye,
                                Quaternion.LookRotation(truckPosition + new Vector3(0, 2, 7) - eye));
                        }
                        yield return WaitForRenderedFrames(2);
                    }
                    yield return WaitForReflection(dayNight);
                    if (preparationFailed) yield break;
                    ReportPreparation(phase + 1, stages, 0);
                }
                // The first all-off switch state has different lighting variants.
                foreach (var row in rows) row.SetOn(false);
                camera.transform.SetPositionAndRotation(originalPosition, originalRotation);
                dayNight.SetHour(originalHour);
                yield return WaitForRenderedFrames(2);
                dayNight.SetHour(9);
                yield return WaitForRenderedFrames(2);
                yield return WaitForReflection(dayNight);
                if (preparationFailed) yield break;
                for (int i = 0; i < rows.Length; i++) rows[i].SetOn(rowStates[i]);
                ReportPreparation(5, stages, 0);

                if (driver != null && forklift != null)
                {
                    var eye = forklift.transform.TransformPoint(new Vector3(-2.4f, 1.4f, 3));
                    var forks = forklift.transform.TransformPoint(new Vector3(0, .35f, 1.5f));
                    camera.transform.SetPositionAndRotation(eye, Quaternion.LookRotation(forks - eye));
                    int target = completedRenderFrames + 3;
                    while (completedRenderFrames < target)
                    {
                        driver.WarmPlacementGraphics();
                        yield return null;
                    }
                    driver.ClearPlacementGraphics();
                }
                ReportPreparation(6, stages, 0);

                // Finish with the exact opening view, clock and reflection.
                // Cargo and the road truck have stayed frozen throughout.
                camera.transform.SetPositionAndRotation(originalPosition, originalRotation);
                dayNight.SetHour(originalHour);
                dayNight.RequestReflection();
                yield return WaitForRenderedFrames(2);
                yield return WaitForReflection(dayNight);
                if (preparationFailed) yield break;
                completed = true;
            }
            finally
            {
                camera.transform.SetPositionAndRotation(originalPosition, originalRotation);
                driver?.ClearPlacementGraphics();
                for (int i = 0; i < rows.Length; i++) rows[i].SetOn(rowStates[i]);
                if (!completed)
                {
                    dayNight.SetHour(originalHour);
                    ReportPreparation(0, stages, -1);
                }
            }
            preparing = false;
            ApplyState();
            ResetFrameSample();
            ReportPreparation(stages, stages, 1);
        }

        System.Collections.IEnumerator WaitForRenderedFrames(int count)
        {
            int target = completedRenderFrames + count;
            while (completedRenderFrames < target) yield return null;
        }

        System.Collections.IEnumerator WaitForReflection(WarehouseDayNight dayNight)
        {
            int limit = completedRenderFrames + 90;
            while (dayNight.ReflectionPending && completedRenderFrames < limit) yield return null;
            // A broken capture must leave the loading gate in place rather than
            // silently returning a game that will repeat its warmup on first use.
            preparationFailed = dayNight.ReflectionPending;
        }

        static void ReportPreparation(int completed, int total, int ready)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            OneShiftReportGraphicsPreparation(completed, total, ready);
#endif
        }

        [Preserve]
        public void SetBrowserActive(string value)
        {
            pageActive = value == "1";
            ApplyState();
        }

        [Preserve]
        public void ReportState(string unused)
        {
            var dayNight = Object.FindFirstObjectByType<WarehouseDayNight>();
            var player = Object.FindFirstObjectByType<RackWalkController>();
            var forklift = Object.FindFirstObjectByType<ForkliftDriveController>();
            var driver = Object.FindFirstObjectByType<ForkliftPlayerInteraction>();
            var lift = Object.FindFirstObjectByType<ForkliftLiftController>();
            var receiving = Object.FindFirstObjectByType<WarehouseReceiving>();
            var pipeline = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            var camera = player != null ? player.eyes : Camera.main;
            var cameraData = camera != null ? camera.GetComponent<UniversalAdditionalCameraData>() : null;
            var rowOn = new bool[3];
            foreach (var row in Object.FindObjectsByType<WarehouseLightRow>(FindObjectsSortMode.None))
                if (row.RowNumber >= 1 && row.RowNumber <= rowOn.Length) rowOn[row.RowNumber - 1] = row.IsOn;
            var position = player != null ? player.transform.position : Vector3.zero;
            var sprungMasses = new float[4];
            if (forklift != null && forklift.wheels != null)
                for (int i = 0; i < sprungMasses.Length && i < forklift.wheels.Length; ++i)
                    if (forklift.wheels[i] != null) sprungMasses[i] = forklift.wheels[i].sprungMass;
            Debug.Log("ONE_SHIFT_STATE " + JsonUtility.ToJson(new BrowserState
            {
                frameCount = Time.frameCount,
                hour = dayNight != null ? dayNight.Hour : -1,
                timeScale = Time.timeScale,
                fixedDeltaTime = Time.fixedDeltaTime,
                maximumDeltaTime = Time.maximumDeltaTime,
                buildVersion = BuildVersion,
                supportsStoreAndResolve = SystemInfo.supportsStoreAndResolveAction,
                pipelineMsaaSamples = pipeline != null ? pipeline.msaaSampleCount : 0,
                cameraAntialiasing = cameraData != null ? cameraData.antialiasing.ToString() : "None",
                rowOn = rowOn,
                playerPosition = new[] { position.x, position.y, position.z },
                playerWalkSpeed = player != null ? player.walkSpeed : 0,
                playerRunSpeed = player != null ? player.runSpeed : 0,
                receivingPhase = receiving != null ? receiving.Phase.ToString() : null,
                receivingDoorsOpen = receiving != null && receiving.DoorsOpen,
                receivingUnloaded = receiving != null ? receiving.DeliveredCount : 0,
                receivingStored = receiving != null ? receiving.StoredCount : 0,
                receivingTotal = receiving != null && receiving.cargo != null ? receiving.cargo.Length : 0,
                receivingProgress = receiving != null ? receiving.ArrivalProgress : 0,
                receivingWaiting = receiving != null && receiving.WaitingForClearance,
                receivingTruckPosition = receiving != null && receiving.truck != null ? new[] {receiving.truck.position.x, receiving.truck.position.y, receiving.truck.position.z} : null,
                receivingFirstPallet = receiving != null && receiving.cargo.Length > 0 ? new[] {receiving.cargo[0].transform.position.x, receiving.cargo[0].transform.position.y, receiving.cargo[0].transform.position.z} : null,
                browserSuspended = suspended,
                browserPreparing = preparing,
                forkliftPosition = forklift != null ? new[] {forklift.transform.position.x, forklift.transform.position.y, forklift.transform.position.z} : null,
                forkliftUp = forklift != null ? new[] {forklift.transform.up.x, forklift.transform.up.y, forklift.transform.up.z} : null,
                forkliftSignedSpeed = forklift != null ? forklift.SignedSpeedMps : 0,
                forkliftThrottle = forklift != null ? forklift.ThrottleInput : 0,
                forkliftSteer = forklift != null ? forklift.SteerAngle : 0,
                forkliftGrounded = forklift != null ? forklift.GroundedWheelCount : 0,
                forkliftSprungMasses = sprungMasses,
                forkliftLiftHeight = lift != null ? lift.LiftHeightMeters : -1,
                forkliftTiltDegrees = lift != null ? lift.TiltDegrees : 0,
                forkliftLiftInput = lift != null ? lift.LiftInput : 0,
                forkliftTiltInput = lift != null ? lift.TiltInput : 0,
                forkliftHydraulicPressure = lift != null ? lift.HydraulicPressure : 0,
                forkliftLiftStalled = lift != null && lift.IsStalled,
                forkliftDriving = driver != null && driver.IsDriving,
                forkliftTraining = driver != null && driver.TrainingOpen,
                forkliftAssistActive = driver != null && driver.AssistActive,
                forkliftAssistStage = driver != null ? driver.AssistStage : "Idle",
                forkliftAssistStatus = driver != null ? driver.AssistStatus : "",
                forkliftMouseLiftInput = driver != null ? driver.MouseLiftInput : 0,
                forkliftForkViewActive = driver != null && driver.ForkViewActive,
                forkliftForkViewTarget = driver != null ? driver.ForkViewTarget : null,
                forkliftCabView = driver != null && driver.CabView,
                forkliftCaptured = driver != null && driver.ControlsCaptured,
                forkliftParked = forklift != null && forklift.ParkingBrake
            }));
        }

        [System.Serializable, Preserve]
        sealed class BrowserState
        {
            public int frameCount;
            public float hour;
            public float timeScale, fixedDeltaTime, maximumDeltaTime;
            public int buildVersion, pipelineMsaaSamples;
            public bool supportsStoreAndResolve;
            public string cameraAntialiasing;
            public bool[] rowOn;
            public float[] playerPosition;
            public float playerWalkSpeed, playerRunSpeed;
            public string receivingPhase;
            public bool receivingDoorsOpen, receivingWaiting;
            public int receivingUnloaded, receivingStored, receivingTotal;
            public float receivingProgress;
            public float[] receivingTruckPosition, receivingFirstPallet;
            public bool browserSuspended, browserPreparing;
            public float[] forkliftPosition, forkliftUp, forkliftSprungMasses;
            public float forkliftSignedSpeed, forkliftThrottle, forkliftSteer;
            public float forkliftLiftHeight, forkliftTiltDegrees, forkliftLiftInput, forkliftTiltInput, forkliftHydraulicPressure;
            public bool forkliftLiftStalled;
            public int forkliftGrounded;
            public bool forkliftDriving, forkliftTraining, forkliftCaptured, forkliftParked, forkliftCabView;
            public bool forkliftAssistActive;
            public string forkliftAssistStage, forkliftAssistStatus;
            public float forkliftMouseLiftInput;
            public bool forkliftForkViewActive;
            public string forkliftForkViewTarget;
        }

        void OnApplicationFocus(bool focused)
        {
            windowFocused = focused;
            ApplyState();
        }

        void OnApplicationPause(bool paused)
        {
            applicationPaused = paused;
            ApplyState();
        }

        void ApplyState()
        {
            bool shouldSuspend = preparing || !pageActive || !windowFocused || applicationPaused;
            if (suspended == shouldSuspend) return;
            suspended = shouldSuspend;
            ResetFrameSample();
            if (suspended)
            {
                previousTimeScale = Time.timeScale;
                previousAudioPause = AudioListener.pause;
                Time.timeScale = 0;
                AudioListener.pause = true;
            }
            else
            {
                Time.timeScale = previousTimeScale;
                AudioListener.pause = previousAudioPause;
            }
            foreach (var walking in Object.FindObjectsByType<RackWalkController>(FindObjectsSortMode.None))
                walking.SetBrowserActive(!suspended);
            foreach (var forklift in Object.FindObjectsByType<ForkliftDriveController>(FindObjectsSortMode.None))
                forklift.SetBrowserActive(!suspended);
            foreach (var driver in Object.FindObjectsByType<ForkliftPlayerInteraction>(FindObjectsSortMode.None))
                driver.SetBrowserActive(!suspended);
            foreach (var lift in Object.FindObjectsByType<ForkliftLiftController>(FindObjectsSortMode.None))
                lift.SetBrowserActive(!suspended);
        }

        void OnDestroy()
        {
            if (!suspended) return;
            Time.timeScale = previousTimeScale;
            AudioListener.pause = previousAudioPause;
        }
    }
}
