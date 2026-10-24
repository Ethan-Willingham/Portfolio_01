using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace OneShift.RackLab
{
    /// <summary>Cached rigid leaf links follow both tangent runs and the moving smooth sheave.</summary>
    [DisallowMultipleComponent]
    public sealed class ForkliftLeafChainVisual : MonoBehaviour
    {
        public ForkliftLiftController lift;
        public float pitch = .01905f;
        public float pinPathRadius = .105f;
        Mesh threePlate, fourPlate;
        Material material;
        readonly Matrix4x4[] oddMatrices = new Matrix4x4[1023];
        readonly Matrix4x4[] evenMatrices = new Matrix4x4[1023];
        readonly int[] linkCounts = new int[2];
        readonly Quaternion[] sheaveRestRotation = new Quaternion[2];
        bool ready;

        void Start() { Initialize(); }
        void LateUpdate()
        {
            if (!ready) Initialize();
            if (!ready) return;
            int even = 0, odd = 0;
            for (int side = 0; side < 2; side++)
            {
                var path = MakePath(side);
                int count = linkCounts[side];
                for (int j = 0; j < count; j++)
                {
                    Vector3 a = path.Point(path.length * j / count);
                    Vector3 b = path.Point(path.length * (j + 1) / count);
                    Vector3 along = (b - a).normalized;
                    var rotation = Quaternion.LookRotation(Vector3.Cross(lift.mastBody.transform.right, along), along);
                    var matrix = Matrix4x4.TRS((a + b) * .5f, rotation, Vector3.one);
                    if ((j & 1) == 0) evenMatrices[even++] = matrix;
                    else oddMatrices[odd++] = matrix;
                }
                lift.chainSheaves[side].localRotation = sheaveRestRotation[side] *
                    Quaternion.AngleAxis(lift.LiftTravelMeters * .5f / .095f * Mathf.Rad2Deg, Vector3.right);
            }
            // Two draw submissions for both chains. Arrays and link geometry are
            // allocated once; a moving mast only changes instance matrices.
            Graphics.DrawMeshInstanced(threePlate, 0, material, evenMatrices, even,
                null, ShadowCastingMode.On, true, gameObject.layer);
            Graphics.DrawMeshInstanced(fourPlate, 0, material, oddMatrices, odd,
                null, ShadowCastingMode.On, true, gameObject.layer);
        }

        void Initialize()
        {
            if (lift == null) lift = GetComponent<ForkliftLiftController>();
            if (lift == null || lift.mastBody == null || lift.chainSheaves[0] == null) return;
            Material source = null;
            foreach (var renderer in lift.GetComponentsInChildren<Renderer>(true))
                if (renderer.sharedMaterial != null && renderer.sharedMaterial.name.Contains("steel"))
                { source = renderer.sharedMaterial; break; }
            if (source == null) return;
            material = new Material(source) { name = "Moving leaf chain steel", enableInstancing = true };
            threePlate = MakeLink(3); fourPlate = MakeLink(4);
            for (int i = 0; i < 2; i++)
            {
                linkCounts[i] = Mathf.Clamp(Mathf.RoundToInt(MakePath(i).length / pitch), 2, 510);
                sheaveRestRotation[i] = lift.chainSheaves[i].localRotation;
            }
            ready = true;
        }

        struct ChainPath
        {
            public Vector3 a, b, centre, forward, up, tangentA, tangentB;
            public float radius, angleA, angleB, runA, arc, runB, length;
            public Vector3 Point(float distance)
            {
                if (distance <= runA) return Vector3.Lerp(a, tangentA, distance / Mathf.Max(runA, .0001f));
                if (distance <= runA + arc)
                {
                    float angle = angleA - (distance - runA) / radius;
                    return centre + (forward * Mathf.Cos(angle) + up * Mathf.Sin(angle)) * radius;
                }
                return Vector3.Lerp(tangentB, b, (distance - runA - arc) / Mathf.Max(runB, .0001f));
            }
        }

        ChainPath MakePath(int side)
        {
            var p = new ChainPath
            {
                a = lift.fixedChainAnchors[side].position,
                b = lift.carriageChainAnchors[side].position,
                centre = lift.chainSheaves[side].position,
                forward = lift.mastBody.transform.forward,
                up = lift.mastBody.transform.up,
                radius = pinPathRadius
            };
            Vector3 va = p.a - p.centre, vb = p.b - p.centre;
            p.angleA = Mathf.Atan2(Vector3.Dot(va, p.up), Vector3.Dot(va, p.forward)) -
                Mathf.Acos(Mathf.Clamp(p.radius / Mathf.Max(p.radius, va.magnitude), -1, 1));
            while (p.angleA < 0) p.angleA += Mathf.PI * 2;
            p.angleB = Mathf.Atan2(Vector3.Dot(vb, p.up), Vector3.Dot(vb, p.forward)) +
                Mathf.Acos(Mathf.Clamp(p.radius / Mathf.Max(p.radius, vb.magnitude), -1, 1));
            while (p.angleB > p.angleA) p.angleB -= Mathf.PI * 2;
            p.tangentA = p.centre + (p.forward * Mathf.Cos(p.angleA) + p.up * Mathf.Sin(p.angleA)) * p.radius;
            p.tangentB = p.centre + (p.forward * Mathf.Cos(p.angleB) + p.up * Mathf.Sin(p.angleB)) * p.radius;
            p.runA = Vector3.Distance(p.a, p.tangentA); p.runB = Vector3.Distance(p.b, p.tangentB);
            p.arc = p.radius * (p.angleA - p.angleB);
            p.length = p.runA + p.arc + p.runB;
            return p;
        }

        Mesh MakeLink(int plates)
        {
            var vertices = new List<Vector3>();
            var triangles = new List<int>();
            for (int layer = 0; layer < plates; layer++)
            {
                float x = (layer - (plates - 1) * .5f) * .0067f;
                var outline = new List<Vector2>();
                for (int j = 0; j <= 8; j++)
                {
                    float angle = Mathf.PI * j / 8;
                    outline.Add(new Vector2(pitch * .5f + Mathf.Sin(angle) * .00905f, Mathf.Cos(angle) * .00905f));
                }
                for (int j = 0; j <= 8; j++)
                {
                    float angle = Mathf.PI * j / 8;
                    outline.Add(new Vector2(-pitch * .5f - Mathf.Sin(angle) * .00905f, -Mathf.Cos(angle) * .00905f));
                }
                int first = vertices.Count, n = outline.Count;
                foreach (var point in outline) vertices.Add(new Vector3(x - .0016f, point.x, point.y));
                foreach (var point in outline) vertices.Add(new Vector3(x + .0016f, point.x, point.y));
                for (int j = 1; j < n - 1; j++)
                {
                    triangles.Add(first); triangles.Add(first + j + 1); triangles.Add(first + j);
                    triangles.Add(first + n); triangles.Add(first + n + j); triangles.Add(first + n + j + 1);
                }
                for (int j = 0; j < n; j++)
                {
                    int next = (j + 1) % n;
                    triangles.Add(first + j); triangles.Add(first + next); triangles.Add(first + n + next);
                    triangles.Add(first + j); triangles.Add(first + n + next); triangles.Add(first + n + j);
                }
            }
            // Every link contributes its first shared transverse pin.
            int pin = vertices.Count;
            for (int end = 0; end < 2; end++)
                for (int j = 0; j < 12; j++)
                {
                    float angle = j * Mathf.PI / 6;
                    vertices.Add(new Vector3((end == 0 ? -1 : 1) * .014f,
                        -pitch * .5f + Mathf.Cos(angle) * .00395f, Mathf.Sin(angle) * .00395f));
                }
            for (int j = 0; j < 12; j++)
            {
                int next = (j + 1) % 12;
                triangles.Add(pin + j); triangles.Add(pin + next); triangles.Add(pin + next + 12);
                triangles.Add(pin + j); triangles.Add(pin + next + 12); triangles.Add(pin + j + 12);
            }
            var mesh = new Mesh { name = plates + " plate rigid leaf link" };
            mesh.SetVertices(vertices); mesh.SetTriangles(triangles, 0);
            mesh.RecalculateNormals(); mesh.RecalculateBounds();
            return mesh;
        }

        void OnDestroy()
        {
            if (threePlate != null) Destroy(threePlate);
            if (fourPlate != null) Destroy(fourPlate);
            if (material != null) Destroy(material);
        }
    }
}
