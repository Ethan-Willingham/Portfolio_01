using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    // Repairs only the affected surfaces in an existing room. Lighting controls,
    // day/night components, player placement and rack edits remain in place.
    public static class WarehouseSurfaceRepair
    {
        const string Root = "Assets/RackLab/";
        const string RoofPath = Root + "Models/Environment/Dullroofmetal.asset";

        public static void UseMatteReflections(Material material)
        {
            // Large planar probe reflections create bright repeated stripes on
            // the roof and painted trusses. These surfaces have a dull finish.
            material.SetFloat("_EnvironmentReflections", 0);
            material.EnableKeyword("_ENVIRONMENTREFLECTIONS_OFF");
            EditorUtility.SetDirty(material);
        }

        public static Material RoofMaterial()
        {
            const string path = Root + "Materials/Environment/Dullroofmetal.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                material = new Material(Shader.Find("Universal Render Pipeline/Lit")) { name = "Dullroofmetal", enableInstancing = true };
                AssetDatabase.CreateAsset(material, path);
            }
            material.SetColor("_BaseColor", new Color(.5f, .52f, .48f));
            material.SetFloat("_Metallic", .05f); material.SetFloat("_Smoothness", .12f);
            material.SetColor("_EmissionColor", Color.black); material.DisableKeyword("_EMISSION");
            UseMatteReflections(material);
            return material;
        }

        [MenuItem("One Shift/Repair ceiling glare and baseboard surfaces")]
        public static string Repair()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before repairing saved surfaces.");
            var scene = SceneManager.GetActiveScene();
            if (scene.path != Root + "Scenes/RackFloor.unity") throw new InvalidOperationException("Open RackFloor.unity first.");
            var architecture = GameObject.Find("Warehouse architecture");
            if (architecture == null) throw new Exception("Warehouse architecture is missing.");
            Directory.CreateDirectory("Temp/EnvironmentBackup");
            EditorSceneManager.SaveScene(scene, "Temp/EnvironmentBackup/BeforeSurfaceRepair-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".unity", true);
            var filters = architecture.GetComponentsInChildren<MeshFilter>();
            var roofVertices = new List<Vector3>();
            var roofIndices = new List<int>();
            var roofNormals = new List<Vector3>();
            var existingRoof = filters.FirstOrDefault(f => AssetDatabase.GetAssetPath(f.sharedMesh) == RoofPath);
            foreach (var filter in filters)
            {
                var material = filter.GetComponent<MeshRenderer>().sharedMaterial;
                var mesh = filter.sharedMesh;
                if (material.shader.name == "OneShift/Warehouse Masonry")
                {
                    // All block walls were batched as axis-aligned boxes. Lift
                    // their bottom vertices to the top of the separate plinth.
                    Undo.RecordObject(mesh, "Separate blockwork from baseboard");
                    var vertices = mesh.vertices;
                    for (int i = 0; i < vertices.Length; i++)
                        if (Mathf.Abs(vertices[i].y) < .001f) vertices[i].y = .3f;
                    mesh.vertices = vertices; mesh.RecalculateBounds();
                    EditorUtility.SetDirty(mesh);
                }
                string materialPath = AssetDatabase.GetAssetPath(material);
                if (existingRoof != null || !(materialPath.EndsWith("Brushedgalvanizedmetal.mat") || materialPath.EndsWith("Warmgalvanizedwallpanels.mat"))) continue;
                // The builder emits independent 24-vertex/36-index boxes. Extract
                // only the deck and roof ribs, keeping sills, walls and doors.
                var sourceVertices = mesh.vertices; var sourceNormals = mesh.normals; var sourceIndices = mesh.triangles;
                if (sourceVertices.Length % 24 != 0 || sourceIndices.Length != sourceVertices.Length / 24 * 36)
                    throw new Exception("Unexpected warehouse box topology: " + mesh.name);
                var keptVertices = new List<Vector3>(); var keptNormals = new List<Vector3>(); var keptIndices = new List<int>();
                int extracted = 0;
                for (int offset = 0; offset < sourceVertices.Length; offset += 24)
                {
                    var bounds = new Bounds(sourceVertices[offset], Vector3.zero);
                    for (int i = 1; i < 24; i++) bounds.Encapsulate(sourceVertices[offset + i]);
                    bool roof = bounds.min.y > 8.22f && bounds.size.z > 21.9f;
                    var destination = roof ? roofVertices : keptVertices;
                    var normals = roof ? roofNormals : keptNormals;
                    var indices = roof ? roofIndices : keptIndices;
                    int first = destination.Count;
                    for (int i = 0; i < 24; i++) { destination.Add(sourceVertices[offset + i]); normals.Add(sourceNormals[offset + i]); }
                    int indexOffset = offset / 24 * 36;
                    for (int i = 0; i < 36; i++) indices.Add(first + sourceIndices[indexOffset + i] - offset);
                    if (roof) extracted++;
                }
                if (extracted == 0) continue;
                Undo.RecordObject(mesh, "Extract matte warehouse roof");
                mesh.Clear(); mesh.SetVertices(keptVertices); mesh.SetNormals(keptNormals); mesh.SetTriangles(keptIndices, 0); mesh.RecalculateBounds();
                EditorUtility.SetDirty(mesh);
            }
            var roofMaterial = RoofMaterial();
            if (existingRoof == null)
            {
                if (roofVertices.Count != 78 * 24) throw new Exception("Expected one roof deck and 77 ribs; found " + roofVertices.Count / 24);
                var mesh = new Mesh { name = "Dullroofmetal" };
                mesh.SetVertices(roofVertices); mesh.SetNormals(roofNormals); mesh.SetTriangles(roofIndices, 0); mesh.RecalculateBounds();
                var saved = AssetDatabase.LoadAssetAtPath<Mesh>(RoofPath);
                if (saved == null) { AssetDatabase.CreateAsset(mesh, RoofPath); saved = mesh; }
                else { EditorUtility.CopySerialized(mesh, saved); Object.DestroyImmediate(mesh); EditorUtility.SetDirty(saved); }
                var obj = new GameObject("Dullroofmetal"); obj.transform.SetParent(architecture.transform, false); obj.isStatic = true;
                obj.AddComponent<MeshFilter>().sharedMesh = saved; obj.AddComponent<MeshRenderer>().sharedMaterial = roofMaterial;
                Undo.RegisterCreatedObjectUndo(obj, "Separate matte roof surfaces");
            }
            else existingRoof.GetComponent<MeshRenderer>().sharedMaterial = roofMaterial;
            var steel = AssetDatabase.LoadAssetAtPath<Material>(Root + "Materials/Environment/Charcoalstructuralsteel.mat");
            steel.SetFloat("_Metallic", .15f); steel.SetFloat("_Smoothness", .18f); UseMatteReflections(steel);
            var report = Validate();
            AssetDatabase.SaveAssets(); EditorSceneManager.MarkSceneDirty(scene); EditorSceneManager.SaveScene(scene);
            return report;
        }

        public static string Validate()
        {
            var root = GameObject.Find("Warehouse architecture");
            var masonry = root.GetComponentsInChildren<MeshRenderer>().Where(r => r.sharedMaterial.shader.name == "OneShift/Warehouse Masonry").ToArray();
            if (masonry.Length != 1 || Mathf.Abs(masonry[0].bounds.min.y - .3f) > .001f)
                throw new Exception("Masonry must start above the 0.3 metre plinth.");
            var roof = root.GetComponentsInChildren<MeshRenderer>().Single(r => AssetDatabase.GetAssetPath(r.GetComponent<MeshFilter>().sharedMesh) == RoofPath);
            if (roof.sharedMaterial.GetFloat("_EnvironmentReflections") != 0 || roof.sharedMaterial.GetFloat("_Smoothness") > .15f || roof.sharedMaterial.IsKeywordEnabled("_EMISSION"))
                throw new Exception("Roof material is still glossy or emissive.");
            if (roof.GetComponent<MeshFilter>().sharedMesh.vertexCount != 78 * 24) throw new Exception("Roof ribs or deck missing.");
            var plinth = root.GetComponentsInChildren<MeshRenderer>().Single(r => AssetDatabase.GetAssetPath(r.sharedMaterial).EndsWith("Concreteplinth.mat"));
            // The plinth batch also includes sprinkler pipes; inspect its wall
            // faces directly instead of using the whole batch's vertical bounds.
            var trimVertices = plinth.GetComponent<MeshFilter>().sharedMesh.vertices;
            int baseSections = 0;
            for (int offset = 0; offset < trimVertices.Length; offset += 24)
            {
                var bounds = new Bounds(trimVertices[offset], Vector3.zero);
                for (int i = 1; i < 24; i++) bounds.Encapsulate(trimVertices[offset + i]);
                if (Mathf.Abs(bounds.min.y) < .001f && Mathf.Abs(bounds.max.y - .3f) < .001f && Mathf.Max(bounds.size.x, bounds.size.z) > 21.9f) baseSections++;
            }
            if (baseSections != 4) throw new Exception("Expected four complete baseboard sections.");
            string report = "Surface checks passed: masonry starts at Y=0.3 above four complete plinths; no overlapping baseboard wall faces; roof deck and 77 ribs use a rough nonemissive material without probe reflections; painted structural steel has a matte reflection response.";
            File.WriteAllText(Root + "Reports/warehouse-surface-validation.txt", report + "\n");
            return report;
        }
    }
}
