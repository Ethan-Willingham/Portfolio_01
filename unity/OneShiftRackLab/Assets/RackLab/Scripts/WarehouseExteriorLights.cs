using System;
using UnityEngine;

namespace OneShift.RackLab
{
    // Six small, outward-facing pools share the existing clock. They do not
    // allocate another shadow atlas or trigger additional reflection captures.
    [ExecuteAlways]
    public sealed class WarehouseExteriorLights : MonoBehaviour
    {
        public WarehouseDayNight clock;
        public Light[] fixtures = Array.Empty<Light>();
        public Renderer[] lenses = Array.Empty<Renderer>();
        [Min(0)] public float intensity = 22;
        float applied = -1;
        MaterialPropertyBlock properties;

        void OnEnable() => Refresh();
        void OnValidate() { applied = -1; Refresh(); }
        void LateUpdate() => Refresh();

        public void Refresh(bool force = false)
        {
            if (clock == null) clock = FindFirstObjectByType<WarehouseDayNight>();
            float daylight = clock != null ? clock.Daylight : 0;
            float amount = 1 - Mathf.SmoothStep(0, 1, Mathf.InverseLerp(.12f, .62f, daylight));
            if (!force && Mathf.Abs(applied - amount) < .015f && amount != 0 && amount != 1) return;
            if (!force && Mathf.Approximately(applied, amount)) return;
            applied = amount;
            foreach (var fixture in fixtures)
            {
                if (fixture == null) continue;
                fixture.enabled = amount > .005f;
                fixture.intensity = intensity * amount;
            }
            if (properties == null) properties = new MaterialPropertyBlock();
            foreach (var lens in lenses)
            {
                if (lens == null) continue;
                lens.GetPropertyBlock(properties);
                properties.SetColor("_BaseColor", Color.Lerp(new Color(.34f, .33f, .27f), new Color(.85f, .76f, .55f), amount));
                properties.SetColor("_EmissionColor", new Color(1, .66f, .29f) * (.9f * amount));
                lens.SetPropertyBlock(properties);
            }
        }
    }
}
