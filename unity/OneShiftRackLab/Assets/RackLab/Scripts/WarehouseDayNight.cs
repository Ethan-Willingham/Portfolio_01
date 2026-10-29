using UnityEngine;
using UnityEngine.Rendering;

namespace OneShift.RackLab
{
    [DefaultExecutionOrder(-100)]
    public sealed class WarehouseDayNight : MonoBehaviour
    {
        public const float MorningHour = 7;
        public const float SunsetHour = 18;
        [Range(0, 24)] public float startHour = 4.5f;
        [Tooltip("Real minutes from 07:00 through sunset at 18:00.")]
        [Min(1)] public float dayLengthMinutes = 9;
        [Tooltip("Real minutes from sunset through the next morning. At 1.5 minutes, the initial 04:30 to 07:00 takes 17.3 seconds.")]
        [Min(.25f)] public float nightLengthMinutes = 1.5f;
        [Min(0)] public float peakSunIntensity = 2.35f;
        [Range(0, 1)] public float beamIntensity = .75f;
        [Range(0, 1)] public float daytimeAmbientIntensity = .8f;
        [Range(0, 65)] public float latitude = 41;
        public bool paused;
        public Light sun;
        public Material sky;
        public WarehouseSunVolume[] windows;
        public ReflectionProbe roomReflection;
        [Min(1)] public float reflectionIntervalSeconds = 8;
        public float Hour { get; private set; }
        public float Daylight { get; private set; }
        public Vector3 TowardSun { get; private set; }
        bool UsesRealtimeReflection => roomReflection != null && roomReflection.enabled &&
            roomReflection.mode == ReflectionProbeMode.Realtime;
        public bool ReflectionPending => UsesRealtimeReflection &&
            (reflectionRequested || (reflectionRender >= 0 && !roomReflection.IsFinishedRendering(reflectionRender)));
        Material runtimeSky;
        float reflectionTimer;
        int reflectionRender = -1;
        bool reflectionRequested;
        Material previousSky;
        static readonly int SunDirectionId = Shader.PropertyToID("_SunDirection");
        static readonly int SunColorId = Shader.PropertyToID("_SunColor");
        static readonly int DaylightId = Shader.PropertyToID("_Daylight");
        static readonly int CloudOffsetId = Shader.PropertyToID("_CloudOffset");

        void Awake()
        {
            previousSky = RenderSettings.skybox;
            if (sky != null) runtimeSky = new Material(sky);
            SetHour(startHour);
            RequestReflection();
        }

        void Update()
        {
            if (!Application.isFocused) return;
            if (!paused) Advance(Time.deltaTime);
            // The shipped room uses an Editor-captured cubemap. Only explicitly
            // authored realtime probes may schedule six-face render work.
            if (UsesRealtimeReflection)
            {
                reflectionTimer += Time.deltaTime;
                if (reflectionRequested || reflectionTimer >= reflectionIntervalSeconds) RefreshReflection();
            }
        }

        public void Advance(float seconds)
        {
            if (seconds <= 0 || paused) return;
            float daylightHours = SunsetHour - MorningHour;
            float nightHours = 24 - daylightHours;
            float daySeconds = Mathf.Max(1, dayLengthMinutes) * 60;
            float nightSeconds = Mathf.Max(.25f, nightLengthMinutes) * 60;
            float fromMorning = Mathf.Repeat(Hour - MorningHour, 24);
            // Map the two clock speeds onto one continuous real-time cycle.
            // Crossing sunrise, sunset or midnight consumes the entire delta,
            // so the pace is independent of frame rate and no hours are skipped.
            float elapsed = fromMorning < daylightHours
                ? fromMorning * daySeconds / daylightHours
                : daySeconds + (fromMorning - daylightHours) * nightSeconds / nightHours;
            elapsed = Mathf.Repeat(elapsed + seconds, daySeconds + nightSeconds);
            ApplyHour(elapsed < daySeconds
                ? MorningHour + elapsed * daylightHours / daySeconds
                : SunsetHour + (elapsed - daySeconds) * nightHours / nightSeconds, false);
        }

        public static Vector3 SunPosition(float hour, float latitudeDegrees)
        {
            float angle = (hour - 6) * Mathf.PI / 12;
            float latitudeRadians = latitudeDegrees * Mathf.Deg2Rad;
            return new Vector3(Mathf.Cos(angle), Mathf.Sin(angle) * Mathf.Cos(latitudeRadians),
                -Mathf.Sin(angle) * Mathf.Sin(latitudeRadians)).normalized;
        }

        public void SetHour(float hour)
        {
            ApplyHour(hour, true);
        }

        void ApplyHour(float hour, bool changedManually)
        {
            // Slow browser frames must not turn the accelerated opening dawn
            // into a request for another six-face room capture every frame.
            if (changedManually && Mathf.Abs(Mathf.DeltaAngle(Hour * 15, hour * 15)) > .75f) RequestReflection();
            Hour = Mathf.Repeat(hour, 24);
            TowardSun = SunPosition(Hour, latitude);
            Daylight = Mathf.SmoothStep(0, 1, Mathf.InverseLerp(-.08f, .38f, TowardSun.y));
            float direct = Mathf.SmoothStep(0, 1, Mathf.InverseLerp(0, .32f, TowardSun.y));
            Color sunColor = Color.Lerp(new Color(1, .39f, .12f), new Color(1, .93f, .80f), direct);
            if (sun != null)
            {
                sun.transform.rotation = Quaternion.LookRotation(-TowardSun, Vector3.up);
                // Keep this as URP's main light at night, with zero energy. Disabling
                // it would promote a ceiling fixture into the main-light slot.
                sun.enabled = true;
                sun.intensity = peakSunIntensity * direct;
                sun.color = sunColor;
                RenderSettings.sun = sun;
            }
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = Color.Lerp(new Color(.017f, .023f, .038f), new Color(.34f, .40f, .46f) * daytimeAmbientIntensity, Daylight);
            RenderSettings.ambientEquatorColor = Color.Lerp(new Color(.012f, .017f, .025f), new Color(.22f, .25f, .26f) * daytimeAmbientIntensity, Daylight);
            RenderSettings.ambientGroundColor = Color.Lerp(new Color(.006f, .008f, .012f), new Color(.10f, .105f, .09f) * daytimeAmbientIntensity, Daylight);
            RenderSettings.ambientIntensity = 1;
            RenderSettings.reflectionIntensity = .55f;
            RenderSettings.fogColor = Color.Lerp(new Color(.009f, .014f, .027f), new Color(.54f, .65f, .73f), Daylight);
            var material = runtimeSky != null ? runtimeSky : sky;
            if (material != null)
            {
                material.SetVector(SunDirectionId, TowardSun);
                material.SetFloat(DaylightId, Daylight);
                material.SetColor(SunColorId, sunColor);
                // Drift follows simulation time, so manual pause, inactivity and
                // browser preparation all preserve the same sky. A circular path
                // remains continuous across midnight without an extra clock.
                float cloudPhase = Hour * Mathf.PI / 12;
                material.SetVector(CloudOffsetId, new Vector4(Mathf.Cos(cloudPhase) * .65f,
                    Mathf.Sin(cloudPhase) * .65f, 0, 0));
                RenderSettings.skybox = material;
            }
            if (windows != null)
                foreach (var window in windows)
                    if (window != null) window.SetSunlight(-TowardSun, sunColor, direct * beamIntensity);
        }

        public void RequestReflection() { reflectionRequested = UsesRealtimeReflection; }

        void RefreshReflection()
        {
            if (!UsesRealtimeReflection) return;
            if (reflectionRender >= 0 && !roomReflection.IsFinishedRendering(reflectionRender)) return;
            reflectionRender = roomReflection.RenderProbe();
            reflectionTimer = 0;
            reflectionRequested = false;
        }

        void OnDestroy()
        {
            if (runtimeSky == null) return;
            if (RenderSettings.skybox == runtimeSky) RenderSettings.skybox = previousSky;
            Destroy(runtimeSky);
        }
    }
}
