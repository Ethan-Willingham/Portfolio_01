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
        public Vector3 windowInward = Vector3.right;
        public int dustCount = 72;
        public int seed = 1;
        ParticleSystem dust;
        ParticleSystem.Particle[] particles;
        Vector3[] samples;
        Matrix4x4 volume;
        float clock;
        Renderer beamRenderer;
        ParticleSystemRenderer dustRenderer;
        MaterialPropertyBlock properties;
        Mesh movingMesh;
        Mesh originalMesh;
        Vector3[] unitVertices, vertices;
        float brightness = 1;
        Color tint = new Color(1, .9f, .7f);
        Vector3 movingTravel;

        public Matrix4x4 VolumeMatrix()
        {
            var m = Matrix4x4.identity;
            m.SetColumn(0, new Vector4(windowRight.x, windowRight.y, windowRight.z, 0));
            m.SetColumn(1, new Vector4(windowUp.x, windowUp.y, windowUp.z, 0));
            var extrusion = movingMesh != null ? movingTravel : travel;
            m.SetColumn(2, new Vector4(extrusion.x, extrusion.y, extrusion.z, 0));
            var center = windowCenter + extrusion * .5f;
            m.SetColumn(3, new Vector4(center.x, center.y, center.z, 1));
            return m;
        }

        void OnEnable()
        {
            volume = VolumeMatrix();
            properties = new MaterialPropertyBlock();
            properties.SetFloat("_UseVolumeMatrix", 1);
            properties.SetMatrix("_WorldToVolume", volume.inverse);
            beamRenderer = GetComponent<Renderer>();
            beamRenderer.SetPropertyBlock(properties);
            dust = GetComponentInChildren<ParticleSystem>();
            dustRenderer = dust != null ? dust.GetComponent<ParticleSystemRenderer>() : null;
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
            if (!Application.isPlaying || !Application.isFocused || brightness <= .001f || dust == null || particles == null) return;
            clock += Time.deltaTime;
            UpdateDust(clock);
        }

        // Update the sheared mesh and its inverse together. Moving only the
        // shader matrix leaves the original mesh bounds behind as the sun moves.
        public void SetSunlight(Vector3 direction, Color color, float energy)
        {
            if (beamRenderer == null) beamRenderer = GetComponent<Renderer>();
            if (properties == null) properties = new MaterialPropertyBlock();
            if (dust == null) dust = GetComponentInChildren<ParticleSystem>();
            if (dustRenderer == null && dust != null) dustRenderer = dust.GetComponent<ParticleSystemRenderer>();
            float incidence = Vector3.Dot(direction, windowInward);
            brightness = energy * Mathf.SmoothStep(0, 1, Mathf.InverseLerp(.025f, .18f, incidence));
            bool visible = brightness > .001f && direction.y < -.001f;
            beamRenderer.enabled = visible;
            if (dustRenderer != null) dustRenderer.enabled = visible;
            if (!visible) { ReleaseMesh(); return; }
            var filter = GetComponent<MeshFilter>();
            if (movingMesh == null)
            {
                if (filter.sharedMesh == null) return;
                originalMesh = filter.sharedMesh;
                unitVertices = originalMesh.vertices;
                var inverse = VolumeMatrix().inverse;
                for (int i = 0; i < unitVertices.Length; i++) unitVertices[i] = inverse.MultiplyPoint3x4(unitVertices[i]);
                vertices = new Vector3[unitVertices.Length];
                movingMesh = Instantiate(originalMesh);
                movingMesh.name = "Moving window sunlight";
                movingMesh.hideFlags = HideFlags.DontSave;
                movingMesh.MarkDynamic();
                filter.sharedMesh = movingMesh;
            }
            // Stop the bound just below the floor or at the room's opposite wall.
            // Camera depth and actual main-light shadows handle intervening stock.
            float distance = Mathf.Min(28, (windowCenter.y + windowUp.magnitude * .5f + .2f) / -direction.y);
            if (Mathf.Abs(direction.x) > .001f)
                distance = Mathf.Min(distance, Mathf.Abs(((direction.x > 0 ? 11.6f : -11.6f) - windowCenter.x) / direction.x));
            if (Mathf.Abs(direction.z) > .001f)
                distance = Mathf.Min(distance, Mathf.Abs(((direction.z > 0 ? 12.1f : -10.1f) - windowCenter.z) / direction.z));
            movingTravel = direction * Mathf.Max(.05f, distance);
            volume = VolumeMatrix();
            for (int i = 0; i < vertices.Length; i++) vertices[i] = volume.MultiplyPoint3x4(unitVertices[i]);
            movingMesh.vertices = vertices;
            movingMesh.RecalculateBounds();
            tint = color;
            properties.SetFloat("_UseVolumeMatrix", 1);
            properties.SetMatrix("_WorldToVolume", volume.inverse);
            properties.SetColor("_Tint", new Color(color.r, color.g, color.b, brightness));
            beamRenderer.SetPropertyBlock(properties);
            if (particles != null) UpdateDust(clock);
        }

        void OnDisable() { ReleaseMesh(); }

        void ReleaseMesh()
        {
            if (movingMesh == null) return;
            GetComponent<MeshFilter>().sharedMesh = originalMesh;
            if (Application.isPlaying) Destroy(movingMesh); else DestroyImmediate(movingMesh);
            movingMesh = null;
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
                particles[i].startColor = new Color(tint.r, tint.g, tint.b, brightness * Mathf.Lerp(.12f, .32f, samples[i].y));
            }
            dust.SetParticles(particles, particles.Length);
        }
    }
}
