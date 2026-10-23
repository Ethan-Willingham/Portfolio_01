using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Rendering;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace OneShift.RackLab
{
    // Blender owns the geometry and maps. Unity owns import settings, the URP
    // material and one continuous physics surface, including across saw cuts.
    public static class WarehouseFloorBuilder
    {
        const string Root = "Assets/RackLab/";
        const string TextureRoot = Root + "Textures/WarehouseFloor/warehouse-floor-";
        const string FloorName = "Warehouse concrete floor";

        [MenuItem("One Shift/Install concrete floor")]
        public static string Install()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play mode before installing the floor.");
            var scene = SceneManager.GetActiveScene();
            if (scene.path != Root + "Scenes/RackFloor.unity")
                throw new InvalidOperationException("Open RackFloor.unity before installing its floor.");
            // Keep a local scene snapshot before touching the surface. Other room
            // and rack objects are deliberately left in place.
            Directory.CreateDirectory("Temp/FloorBackup");
            EditorSceneManager.SaveScene(scene, "Temp/FloorBackup/RackFloor.unity", true);
            string report = ReplaceSurface();
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
            AssetDatabase.SaveAssets();
            return report;
        }

        // Also called by the room builder before its first scene save.
        public static string ReplaceSurface()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play mode before replacing the floor.");
            var scene = SceneManager.GetActiveScene();
            var previous = scene.GetRootGameObjects().Where(o =>
                o.name == FloorName || o.name == "Concrete floor" ||
                o.name == "Concrete expansion joint" || o.name == "Walkway marking" ||
                o.name == "Rack bay marking" ||
                ((o.name == "01" || o.name == "02" || o.name == "03") && o.GetComponent<TextMesh>() != null)).ToArray();
            // Build first, so an import failure leaves the old floor intact.
            var floor = CreateFloor();
            Undo.RegisterCreatedObjectUndo(floor, "Install warehouse concrete floor");
            foreach (var obj in previous) Undo.DestroyObjectImmediate(obj);
            Physics.SyncTransforms();
            return Validate();
        }

        public static GameObject CreateFloor()
        {
            Directory.CreateDirectory(Root + "Materials");
            Directory.CreateDirectory(Root + "Prefabs");
            AssetDatabase.Refresh();
            string path = Root + "Models/warehouse-floor.fbx";
            var model = AssetImporter.GetAtPath(path) as ModelImporter;
            if (model == null) throw new InvalidOperationException("Run tools/blender/build-warehouse-floor.py first.");
            model.materialImportMode = ModelImporterMaterialImportMode.None;
            model.importCameras = model.importLights = model.importAnimation = false;
            model.importNormals = ModelImporterNormals.Import;
            model.importTangents = ModelImporterTangents.CalculateMikk;
            model.meshCompression = ModelImporterMeshCompression.Off;
            model.addCollider = false;
            model.isReadable = false;
            model.globalScale = 1;
            model.SaveAndReimport();
            var albedo = ImportTexture("albedo", false, true, false, 4096);
            var metal = ImportTexture("metal-smooth", false, false, false, 2048);
            var normal = ImportTexture("normal", true, false, false, 2048);
            var detail = ImportTexture("detail-normal", true, false, true, 1024);
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) throw new InvalidOperationException("The floor requires URP/Lit.");
            var material = new Material(shader) { name = "Warehouse concrete", enableInstancing = true };
            material.SetColor("_BaseColor", Color.white);
            material.SetTexture("_BaseMap", albedo);
            material.SetFloat("_Metallic", 0);
            material.SetTexture("_MetallicGlossMap", metal);
            material.SetFloat("_Smoothness", 1);
            material.SetTexture("_BumpMap", normal);
            material.SetFloat("_BumpScale", .7f);
            material.SetTexture("_DetailNormalMap", detail);
            material.SetFloat("_DetailNormalMapScale", .6f);
            material.SetTextureScale("_DetailAlbedoMap", new Vector2(23f / 1.5f, 22f / 1.5f));
            material.EnableKeyword("_METALLICSPECGLOSSMAP");
            material.EnableKeyword("_NORMALMAP");
            material.EnableKeyword("_DETAIL_MULX2");
            material = Save(material, Root + "Materials/WarehouseConcrete.mat");
            var floor = new GameObject(FloorName);
            var asset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(asset);
            instance.transform.SetParent(floor.transform, false);
            foreach (var renderer in instance.GetComponentsInChildren<MeshRenderer>())
            {
                renderer.sharedMaterial = material;
                renderer.gameObject.isStatic = true;
            }
            var collider = floor.AddComponent<BoxCollider>();
            collider.center = new Vector3(0, -.12f, 1);
            collider.size = new Vector3(23, .24f, 22);
            floor.isStatic = true;
            PrefabUtility.SaveAsPrefabAsset(floor, Root + "Prefabs/WarehouseFloor.prefab");
            return floor;
        }

        static Texture2D ImportTexture(string suffix, bool normal, bool srgb, bool repeat, int size)
        {
            var path = TextureRoot + suffix + ".png";
            var importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer == null) throw new InvalidOperationException("Floor map missing: " + path);
            importer.textureType = normal ? TextureImporterType.NormalMap : TextureImporterType.Default;
            importer.convertToNormalmap = false;
            importer.sRGBTexture = srgb;
            importer.alphaSource = TextureImporterAlphaSource.FromInput;
            importer.alphaIsTransparency = false;
            importer.wrapMode = repeat ? TextureWrapMode.Repeat : TextureWrapMode.Clamp;
            importer.filterMode = FilterMode.Trilinear;
            importer.anisoLevel = 16;
            importer.mipmapEnabled = true;
            importer.maxTextureSize = size;
            importer.textureCompression = TextureImporterCompression.CompressedHQ;
            importer.isReadable = false;
            importer.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }

        static T Save<T>(T value, string path) where T : UnityEngine.Object
        {
            var old = AssetDatabase.LoadAssetAtPath<T>(path);
            if (old == null) { AssetDatabase.CreateAsset(value, path); return value; }
            EditorUtility.CopySerialized(value, old);
            UnityEngine.Object.DestroyImmediate(value);
            return old;
        }

        public static string Validate()
        {
            var floor = GameObject.Find(FloorName);
            if (floor == null) throw new Exception("Concrete floor is absent.");
            var renderers = floor.GetComponentsInChildren<MeshRenderer>();
            if (renderers.Length != 1) throw new Exception("The floor must use one renderer.");
            var mesh = renderers[0].GetComponent<MeshFilter>().sharedMesh;
            if (mesh.subMeshCount != 1 || mesh.GetIndexCount(0) / 3 != 650)
                throw new Exception("Unexpected floor geometry budget.");
            var bounds = renderers[0].bounds;
            if (Vector3.Distance(bounds.size, new Vector3(23, .24f, 22)) > .01f ||
                Vector3.Distance(bounds.center, new Vector3(0, -.12f, 1)) > .01f)
                throw new Exception("Floor export scale or axes do not match the room: " + bounds);
            var colliders = floor.GetComponentsInChildren<Collider>();
            if (colliders.Length != 1 || !(colliders[0] is BoxCollider))
                throw new Exception("Use one continuous box collider for the floor.");
            Physics.SyncTransforms();
            int samples = 0;
            foreach (float x in new[] { -11.4f, -7.5f, -3.5f, .5f, 4.5f, 8.5f, 11.4f })
                foreach (float z in new[] { -9.9f, -6f, -2f, 2f, 6f, 10f, 11.9f })
                {
                    if (!colliders[0].Raycast(new Ray(new Vector3(x, .5f, z), Vector3.down), out var hit, 1) ||
                        Mathf.Abs(hit.point.y) > .001f || hit.normal.y < .999f)
                        throw new Exception("Unsupported floor/joint at " + x + ", " + z);
                    samples++;
                }
            var mat = renderers[0].sharedMaterial;
            foreach (var property in new[] { "_BaseMap", "_MetallicGlossMap", "_BumpMap", "_DetailNormalMap" })
                if (mat.GetTexture(property) == null) throw new Exception("Floor map not bound: " + property);
            var errors = ShaderUtil.GetShaderMessages(mat.shader).Where(m => m.severity == ShaderCompilerMessageSeverity.Error).ToArray();
            if (errors.Length > 0) throw new Exception(string.Join("\n", errors.Select(e => e.message)));
            string report = "Concrete floor passed: 23 x 22 metres, top Y=0, 650 triangles, one renderer/material, one box collider, " +
                samples + " supported edge/joint samples, four PBR maps and no floor shader errors.";
            Directory.CreateDirectory(Root + "Reports");
            File.WriteAllText(Root + "Reports/warehouse-floor-validation.txt", report + "\n");
            Debug.Log(report);
            return report;
        }

        public static string CheckWalk()
        {
            if (!EditorApplication.isPlaying) throw new Exception("Enter Play mode before checking walking.");
            var player = UnityEngine.Object.FindFirstObjectByType<RackWalkController>();
            var motor = player.GetComponent<CharacterController>();
            Vector3 position = player.transform.position;
            Quaternion rotation = player.transform.rotation;
            try
            {
                motor.enabled = false;
                player.transform.position = new Vector3(-7.8f, .05f, -8.5f);
                motor.enabled = true;
                for (int i = 0; i < 20; i++) motor.Move(Vector3.down * .02f);
                for (int i = 0; i < 300; i++)
                {
                    motor.Move(new Vector3(.05f, -.02f, 0));
                    if (!motor.isGrounded || Mathf.Abs(player.transform.position.y) > .08f)
                        throw new Exception("Walking snagged or lost support across a joint.");
                }
                if (Mathf.Abs(player.transform.position.x - 7.2f) > .08f)
                    throw new Exception("Cross-floor travel distance is wrong.");
                string report = "Floor play check passed: 15 metres across five slab joints, grounded every step, no snags or falls.";
                File.WriteAllText(Root + "Reports/warehouse-floor-play-validation.txt", report + "\n");
                return report;
            }
            finally
            {
                motor.enabled = false;
                player.transform.SetPositionAndRotation(position, rotation);
                motor.enabled = true;
            }
        }
    }
}
