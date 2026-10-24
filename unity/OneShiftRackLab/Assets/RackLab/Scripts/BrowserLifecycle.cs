using UnityEngine;
using UnityEngine.Scripting;

namespace OneShift.RackLab
{
    // The page owns its animation loop. This bridge freezes the simulation and
    // clears input before the page pauses Unity's exported main loop.
    [Preserve]
    public sealed class BrowserLifecycle : MonoBehaviour
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern void OneShiftRegisterBrowserLoop();
#endif
        bool pageActive = true;
        bool windowFocused = true;
        bool applicationPaused;
        bool suspended;
        float previousTimeScale = 1;
        bool previousAudioPause;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Install()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            if (Object.FindFirstObjectByType<BrowserLifecycle>() != null) return;
            OneShiftRegisterBrowserLoop();
            var bridge = new GameObject("BrowserLifecycle");
            DontDestroyOnLoad(bridge);
            bridge.AddComponent<BrowserLifecycle>();
            Application.targetFrameRate = 60;
            WebGLInput.captureAllKeyboardInput = false;
            WebGLInput.stickyCursorLock = false;
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
                rowOn = rowOn,
                playerPosition = new[] { position.x, position.y, position.z },
                browserSuspended = suspended,
                forkliftPosition = forklift != null ? new[] {forklift.transform.position.x, forklift.transform.position.y, forklift.transform.position.z} : null,
                forkliftUp = forklift != null ? new[] {forklift.transform.up.x, forklift.transform.up.y, forklift.transform.up.z} : null,
                forkliftSignedSpeed = forklift != null ? forklift.SignedSpeedMps : 0,
                forkliftThrottle = forklift != null ? forklift.ThrottleInput : 0,
                forkliftSteer = forklift != null ? forklift.SteerAngle : 0,
                forkliftGrounded = forklift != null ? forklift.GroundedWheelCount : 0,
                forkliftSprungMasses = sprungMasses,
                forkliftDriving = driver != null && driver.IsDriving,
                forkliftTraining = driver != null && driver.TrainingOpen,
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
            public float timeScale, fixedDeltaTime;
            public bool[] rowOn;
            public float[] playerPosition;
            public bool browserSuspended;
            public float[] forkliftPosition, forkliftUp, forkliftSprungMasses;
            public float forkliftSignedSpeed, forkliftThrottle, forkliftSteer;
            public int forkliftGrounded;
            public bool forkliftDriving, forkliftTraining, forkliftCaptured, forkliftParked, forkliftCabView;
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
            bool shouldSuspend = !pageActive || !windowFocused || applicationPaused;
            if (suspended == shouldSuspend) return;
            suspended = shouldSuspend;
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
        }

        void OnDestroy()
        {
            if (!suspended) return;
            Time.timeScale = previousTimeScale;
            AudioListener.pause = previousAudioPause;
        }
    }
}
