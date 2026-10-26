using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace OneShift.RackLab
{
    // A small depth-tested overlay of existing collision geometry. It never
    // changes scene materials, collision, cargo or the camera's culling mask.
    public sealed class ForkliftPlacementView : IDisposable
    {
        readonly ForkliftDriveController vehicle;
        readonly ForkliftLiftController lift;
        readonly Camera camera;
        readonly MeshCollider[] forks;
        readonly PalletCargo[] stock;
        readonly Dictionary<PalletCargo, Mesh> outlines = new Dictionary<PalletCargo, Mesh>();
        readonly Material forkMaterial, palletMaterial;
        public bool Active { get; private set; }
        public PalletCargo Target { get; private set; }
        public int DrawCalls { get; private set; }

        public ForkliftPlacementView(ForkliftDriveController truck, ForkliftLiftController mechanism, Camera view)
        {
            vehicle = truck; lift = mechanism; camera = view;
            var blades = new List<MeshCollider>();
            foreach (var collider in truck.GetComponentsInChildren<MeshCollider>())
                if (collider.name == "Solid tapered fork blade") blades.Add(collider);
            forks = blades.ToArray();
            stock = UnityEngine.Object.FindObjectsByType<PalletCargo>(FindObjectsSortMode.None);
            var shader = Resources.Load<Shader>("ForkliftPlacementOverlay");
            if (shader == null || !shader.isSupported) return;
            forkMaterial = new Material(shader) { name = "Hidden fork geometry", hideFlags = HideFlags.HideAndDontSave, renderQueue = 3051 };
            forkMaterial.SetColor("_Color", new Color(.78f, .25f, .055f, .94f));
            palletMaterial = new Material(shader) { name = "Hidden pallet board edges", hideFlags = HideFlags.HideAndDontSave, renderQueue = 3050 };
            palletMaterial.SetColor("_Color", new Color(.83f, .77f, .63f, .25f));
        }

        public void Clear() { Active = false; Target = null; DrawCalls = 0; }

        public void Draw()
        {
            Clear();
            if (forkMaterial == null || camera == null || lift.forkTips == null) return;
            Active = true;
            foreach (var fork in forks)
                if (fork != null && fork.enabled && fork.sharedMesh != null)
                    DrawMesh(fork.sharedMesh, fork.transform.localToWorldMatrix, forkMaterial);
            float nearest = 9f;
            foreach (var cargo in stock)
            {
                if (cargo == null || !cargo.gameObject.activeInHierarchy || cargo.gameObject.scene != vehicle.gameObject.scene) continue;
                Vector3 relative = cargo.transform.position - vehicle.transform.position;
                if (Vector3.Dot(relative, vehicle.transform.forward) < .5f || Mathf.Abs(Vector3.Dot(relative, vehicle.transform.right)) > 1.5f) continue;
                float distance = (cargo.transform.position - lift.forkTips.position).sqrMagnitude;
                if (distance < nearest) { nearest = distance; Target = cargo; }
            }
            if (Target == null) return;
            if (!outlines.TryGetValue(Target, out var mesh))
            {
                mesh = MakeBoardOutline(Target);
                outlines.Add(Target, mesh);
            }
            DrawMesh(mesh, Target.transform.localToWorldMatrix, palletMaterial);
        }

        void DrawMesh(Mesh mesh, Matrix4x4 pose, Material material)
        {
            Graphics.DrawMesh(mesh, pose, material, 0, camera, 0, null, ShadowCastingMode.Off, false, null, LightProbeUsage.Off);
            DrawCalls++;
        }

        static Mesh MakeBoardOutline(PalletCargo cargo)
        {
            var vertices = new List<Vector3>();
            var triangles = new List<int>();
            var corners = new Vector3[8];
            foreach (var board in cargo.GetComponentsInChildren<BoxCollider>())
            {
                if (!board.enabled || board.isTrigger || !(board.name == "Top board" || board.name == "Bottom board" || board.name.StartsWith("Stringer", StringComparison.Ordinal) || board.name == "Notch shoulder")) continue;
                var fromBoard = cargo.transform.worldToLocalMatrix * board.transform.localToWorldMatrix;
                for (int i = 0; i < 8; i++)
                    corners[i] = fromBoard.MultiplyPoint3x4(board.center + Vector3.Scale(board.size * .5f,
                        new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1)));
                for (int i = 0; i < 8; i++)
                    for (int axis = 1; axis <= 4; axis *= 2)
                        if ((i & axis) == 0) AddEdge(vertices, triangles, corners[i], corners[i | axis]);
            }
            var mesh = new Mesh { name = "Actual pallet board edge overlay", hideFlags = HideFlags.HideAndDontSave };
            mesh.SetVertices(vertices); mesh.SetTriangles(triangles, 0); mesh.RecalculateBounds();
            return mesh;
        }

        static void AddEdge(List<Vector3> vertices, List<int> triangles, Vector3 start, Vector3 end)
        {
            // Ordinary triangles work in WebGL and give the narrow edge a
            // physical thickness; no geometry shader or wide-line extension.
            Vector3 along = (end - start).normalized;
            Vector3 side = Vector3.Cross(along, Mathf.Abs(along.y) > .9f ? Vector3.right : Vector3.up).normalized * .0025f;
            Vector3 up = Vector3.Cross(along, side).normalized * .0025f;
            int first = vertices.Count;
            for (int i = 0; i < 8; i++) vertices.Add(((i & 4) == 0 ? start : end) + ((i & 1) == 0 ? -side : side) + ((i & 2) == 0 ? -up : up));
            int[] faces = { 0,2,1, 1,2,3, 4,5,6, 5,7,6, 0,1,4, 1,5,4, 2,6,3, 3,6,7, 0,4,2, 2,4,6, 1,3,5, 3,7,5 };
            foreach (int index in faces) triangles.Add(first + index);
        }

        public void Dispose()
        {
            Clear();
            foreach (var mesh in outlines.Values) Release(mesh);
            outlines.Clear(); Release(forkMaterial); Release(palletMaterial);
        }
        static void Release(UnityEngine.Object item)
        {
            if (item == null) return;
            if (Application.isPlaying) UnityEngine.Object.Destroy(item); else UnityEngine.Object.DestroyImmediate(item);
        }
    }
}
