using System;
using UnityEngine;

namespace OneShift.RackLab
{
    // One electrical circuit for a longitudinal row of four high-bay LED fixtures.
    // The fixture emits light only from below its real housing. No ambient fill is
    // added when a circuit is switched, so racks and stock can block its light.
    [ExecuteAlways]
    public sealed class WarehouseLightRow : MonoBehaviour
    {
        public int RowNumber = 1;
        public string RowLabel = "West";
        public Light[] FixtureLights = Array.Empty<Light>();
        public Renderer[] Diffusers = Array.Empty<Renderer>();
        [Min(0)] public float FixtureIntensity = 26f;
        [ColorUsage(false, true)] public Color EmissionColor = new Color(.84f, .80f, .70f);
        public Color LitDiffuserColor = new Color(.72f, .71f, .66f);
        public Color UnlitDiffuserColor = new Color(.43f, .45f, .43f);
        [SerializeField] bool isOn = true;
        MaterialPropertyBlock properties;

        public bool IsOn => isOn;
        public event Action<bool> StateChanged;

        void OnEnable() => Apply();
        void OnValidate() => Apply();

        public void Toggle() => SetOn(!isOn);

        public void SetOn(bool value)
        {
            bool changed = isOn != value;
            isOn = value;
            Apply();
            if (changed)
            {
                StateChanged?.Invoke(isOn);
                if (Application.isPlaying) FindFirstObjectByType<WarehouseDayNight>()?.RequestReflection();
            }
        }

        public void Apply()
        {
            foreach (var fixture in FixtureLights)
            {
                if (fixture == null) continue;
                fixture.intensity = FixtureIntensity;
                fixture.enabled = isOn;
            }
            if (properties == null) properties = new MaterialPropertyBlock();
            foreach (var diffuser in Diffusers)
            {
                if (diffuser == null) continue;
                diffuser.GetPropertyBlock(properties);
                properties.SetColor("_BaseColor", isOn ? LitDiffuserColor : UnlitDiffuserColor);
                properties.SetColor("_EmissionColor", isOn ? EmissionColor : Color.black);
                diffuser.SetPropertyBlock(properties);
            }
        }
    }
}
