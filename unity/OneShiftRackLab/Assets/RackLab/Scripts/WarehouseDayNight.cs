using UnityEngine;
using UnityEngine.Rendering;

namespace OneShift.RackLab
{
    [DefaultExecutionOrder(-100)]
    public sealed class WarehouseDayNight : MonoBehaviour
    {
        public const float MorningHour = 9;
        public const float AfternoonHour = 16;
        [Range(MorningHour, AfternoonHour)] public float startHour = MorningHour;
        [Tooltip("Real minutes from morning to afternoon, and the same duration back. No night phase.")]
        [Min(1)] public float dayLengthMinutes = 30;
        [Min(0)] public float peakSunIntensity = 2.35f;
        [Range(0, 1)] public float beamIntensity = .75f;
        [Range(0, 1)] public float daytimeAmbientIntensity = .9f;
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
        double daylightPhase;
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
            double legSeconds = Mathf.Max(1, dayLengthMinutes) * 60.0;
            // A cosine eases the sun to rest at each end before reversing.
            // Keep the phase in double precision so small frame steps agree
            // with large advances and a paused clock never loses its direction.
            daylightPhase = (daylightPhase + seconds / legSeconds) % 2.0;
            float progress = (float)((1.0 - System.Math.Cos(daylightPhase * System.Math.PI)) * .5);
            ApplyHour(Mathf.Lerp(MorningHour, AfternoonHour, progress), false);
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
            hour = Mathf.Clamp(hour, MorningHour, AfternoonHour);
            float progress = Mathf.InverseLerp(MorningHour, AfternoonHour, hour);
            daylightPhase = System.Math.Acos(1.0 - 2.0 * progress) / System.Math.PI;
            ApplyHour(hour, true);
        }

        void ApplyHour(float hour, bool changedManually)
        {
            // Manual changes can refresh an explicitly authored realtime probe;
            // ordinary clock progression never requests an extra capture.
            if (changedManually && Mathf.Abs(Mathf.DeltaAngle(Hour * 15, hour * 15)) > .75f) RequestReflection();
            Hour = Mathf.Clamp(hour, MorningHour, AfternoonHour);
            TowardSun = SunPosition(Hour, latitude);
            Daylight = Mathf.SmoothStep(0, 1, Mathf.InverseLerp(-.08f, .38f, TowardSun.y));
            float direct = Mathf.SmoothStep(0, 1, Mathf.InverseLerp(0, .32f, TowardSun.y));
            Color sunColor = Color.Lerp(new Color(1, .39f, .12f), new Color(1, .93f, .80f), direct);
            if (sun != null)
            {
                sun.transform.rotation = Quaternion.LookRotation(-TowardSun, Vector3.up);
                // Keep this as URP's main light so no ceiling fixture is
                // promoted into the directional-light slot.
                sun.enabled = true;
                sun.intensity = peakSunIntensity * direct;
                sun.color = sunColor;
                RenderSettings.sun = sun;
            }
            RenderSettings.ambientMode = AmbientMode.Trilight;
            // Broad bounced daylight keeps the unlit sides of brown cartons
            // readable without increasing direct fixture energy or shadow cost.
            RenderSettings.ambientSkyColor = new Color(.38f, .43f, .48f) * daytimeAmbientIntensity;
            RenderSettings.ambientEquatorColor = new Color(.34f, .36f, .35f) * daytimeAmbientIntensity;
            RenderSettings.ambientGroundColor = new Color(.25f, .255f, .235f) * daytimeAmbientIntensity;
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
                // browser preparation all preserve the same sky. The phase
                // follows the same smooth daylight reversal without another clock.
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
