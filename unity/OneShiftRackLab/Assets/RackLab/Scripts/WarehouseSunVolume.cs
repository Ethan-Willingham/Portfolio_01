using UnityEngine;

namespace OneShift.RackLab
{
    // The window is a rectangle, extruded along the sunlight. An affine matrix
    // keeps its vertical opening intact instead of turning it into a spotlight.
    [ExecuteAlways]
    public sealed class WarehouseSunVolume : MonoBehaviour
    {
        public Vector3 windowCenter;
        public Vector3 windowRight;
        public Vector3 windowUp;
        public Vector3 travel;
        public int dustCount = 72;
        public int seed = 1;
        ParticleSystem dust;
        ParticleSystem.Particle[] particles;
        Vector3[] samples;
        Matrix4x4 volume;
        float clock;

        public Matrix4x4 VolumeMatrix()
        {
            var m = Matrix4x4.identity;
            m.SetColumn(0, new Vector4(windowRight.x, windowRight.y, windowRight.z, 0));
            m.SetColumn(1, new Vector4(windowUp.x, windowUp.y, windowUp.z, 0));
            m.SetColumn(2, new Vector4(travel.x, travel.y, travel.z, 0));
            var center = windowCenter + travel * .5f;
            m.SetColumn(3, new Vector4(center.x, center.y, center.z, 1));
            return m;
        }

        void OnEnable()
        {
            volume = VolumeMatrix();
            var properties = new MaterialPropertyBlock();
            properties.SetFloat("_UseVolumeMatrix", 1);
            properties.SetMatrix("_WorldToVolume", volume.inverse);
            GetComponent<Renderer>().SetPropertyBlock(properties);
            dust = GetComponentInChildren<ParticleSystem>();
            if (!Application.isPlaying || dust == null) return;
            var random = new System.Random(seed);
            particles = new ParticleSystem.Particle[dustCount];
            samples = new Vector3[dustCount];
            for (int i = 0; i < dustCount; i++)
            {
                samples[i] = new Vector3((float)random.NextDouble(), (float)random.NextDouble(), (float)random.NextDouble());
                particles[i].startSize = Mathf.Lerp(.006f, .018f, (float)random.NextDouble());
                particles[i].startColor = new Color(1f, .9f, .7f, Mathf.Lerp(.12f, .32f, (float)random.NextDouble()));
                particles[i].startLifetime = 10000;
                particles[i].remainingLifetime = 10000;
            }
            UpdateDust(0);
        }

        void Update()
        {
            if (!Application.isPlaying || !Application.isFocused || dust == null || particles == null) return;
            clock += Time.deltaTime;
            UpdateDust(clock);
        }

        void UpdateDust(float time)
        {
            for (int i = 0; i < particles.Length; i++)
            {
                var p = samples[i];
                p.x = Mathf.Repeat(p.x + Mathf.Sin(time * .16f + i * 1.7f) * .025f, 1) - .5f;
                p.y = Mathf.Repeat(p.y + time * .004f, 1) - .5f;
                p.z = Mathf.Repeat(p.z + Mathf.Sin(time * .11f + i) * .009f, 1) - .5f;
                particles[i].position = volume.MultiplyPoint3x4(p);
                particles[i].remainingLifetime = 10000;
            }
            dust.SetParticles(particles, particles.Length);
        }
    }
}
