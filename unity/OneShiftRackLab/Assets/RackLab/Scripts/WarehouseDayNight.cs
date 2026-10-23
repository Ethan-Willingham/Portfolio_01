using UnityEngine;
using UnityEngine.Rendering;

namespace OneShift.RackLab
{
    [DefaultExecutionOrder(-100)]
    public sealed class WarehouseDayNight : MonoBehaviour
    {
        [Range(0, 24)] public float startHour = 4.5f;
        [Min(1)] public float dayLengthMinutes = 12;
        [Range(0, 65)] public float latitude = 41;
        public bool paused;
        public Light sun;
        public Material sky;
        public WarehouseSunVolume[] windows;
        public ReflectionProbe roomReflection;
        public float Hour { get; private set; }
        public float Daylight { get; private set; }
        public Vector3 TowardSun { get; private set; }
        Material runtimeSky;
        float reflectionTimer;
        int reflectionRender = -1;
        bool reflectionRequested;
        Material previousSky;

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
            reflectionTimer += Time.deltaTime;
            // Time-sliced cubemaps capture the actual room, including switched rows.
            if (reflectionRequested || reflectionTimer >= 8) RefreshReflection();
        }

        public void Advance(float seconds)
        {
            if (seconds <= 0 || paused) return;
            SetHour(Hour + seconds * 24 / (Mathf.Max(1, dayLengthMinutes) * 60));
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
            if (Mathf.Abs(Mathf.DeltaAngle(Hour * 15, hour * 15)) > .75f) RequestReflection();
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
                sun.intensity = 3.1f * direct;
                sun.color = sunColor;
                RenderSettings.sun = sun;
            }
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = Color.Lerp(new Color(.017f, .023f, .038f), new Color(.34f, .40f, .46f), Daylight);
            RenderSettings.ambientEquatorColor = Color.Lerp(new Color(.012f, .017f, .025f), new Color(.22f, .25f, .26f), Daylight);
            RenderSettings.ambientGroundColor = Color.Lerp(new Color(.006f, .008f, .012f), new Color(.10f, .105f, .09f), Daylight);
            RenderSettings.ambientIntensity = 1;
            RenderSettings.reflectionIntensity = .65f;
            RenderSettings.fogColor = Color.Lerp(new Color(.009f, .014f, .027f), new Color(.54f, .65f, .73f), Daylight);
            var material = runtimeSky != null ? runtimeSky : sky;
            if (material != null)
            {
                material.SetVector("_SunDirection", TowardSun);
                material.SetFloat("_Daylight", Daylight);
                material.SetColor("_SunColor", sunColor);
                RenderSettings.skybox = material;
            }
            if (windows != null)
                foreach (var window in windows)
                    if (window != null) window.SetSunlight(-TowardSun, sunColor, direct);
        }

        public void RequestReflection() { reflectionRequested = true; }

        void RefreshReflection()
        {
            if (roomReflection == null || !roomReflection.enabled) return;
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
