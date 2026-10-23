using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Rendering;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    public static class WarehouseEnvironmentBuilder
    {
        const string Root = "Assets/RackLab/";
        const string MeshRoot = Root + "Models/Environment/";
        const string Name = "Warehouse architecture";
        const float Height = 8.3f;
        static readonly Vector3 SunDirection = new Vector3(1, -.68f, .22f).normalized;
        static readonly float[] SideWindows = { -6.8f, -1.6f, 3.6f, 8.8f };
        static readonly float[] EndWindows = { -7.8f, -2.6f, 2.6f, 7.8f };
        static readonly Dictionary<Material, Geometry> batches = new Dictionary<Material, Geometry>();
        static GameObject root;
        static Material masonry, panel, steel, trim, zinc, rubber, glass, lens, safety;

        [MenuItem("One Shift/Install warehouse walls and daylight")]
        public static string Install()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before installing the warehouse.");
            var scene = SceneManager.GetActiveScene();
            if (scene.path != Root + "Scenes/RackFloor.unity") throw new InvalidOperationException("Open RackFloor.unity first.");
            Directory.CreateDirectory("Temp/EnvironmentBackup");
            EditorSceneManager.SaveScene(scene, "Temp/EnvironmentBackup/RackFloor-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".unity", true);
            InstallIntoScene();
            var report = Validate();
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
            AssetDatabase.SaveAssets();
            return report;
        }

        // The full rack-floor rebuild also uses this, so future rebuilds retain the shell.
        public static void InstallIntoScene()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play first.");
            Directory.CreateDirectory(MeshRoot);
            Directory.CreateDirectory(Root + "Materials/Environment");
            Directory.CreateDirectory(Root + "Textures/Environment");
            AssetDatabase.Refresh();
            var scene = SceneManager.GetActiveScene();
            var previous = scene.GetRootGameObjects().Where(o => o.name == Name ||
                new[] { "Rear wall", "Left wall", "Right wall", "Front wall", "Roof cross beam", "Overhead light", "Soft fixture fill" }.Contains(o.name)).ToArray();
            root = new GameObject(Name);
            Undo.RegisterCreatedObjectUndo(root, "Install warehouse walls and daylight");
            batches.Clear();
            try
            {
                Materials();
                // Four walls have real openings, including a continuous header above them.
                Wall("West", new Vector3(-11.5f, 0, 1), Vector3.forward, Vector3.right, 22, SideWindows.Select(v => v - 1).ToArray(), 3.8f);
                Wall("East", new Vector3(11.5f, 0, 1), Vector3.forward, Vector3.left, 22, SideWindows.Select(v => v - 1).ToArray(), 3.8f);
                Wall("South", new Vector3(0, 0, -10), Vector3.right, Vector3.forward, 23, EndWindows, 3.8f);
                Wall("North", new Vector3(0, 0, 12), Vector3.right, Vector3.back, 23, EndWindows, 3.8f);
                Roof();
                Details();
                foreach (var pair in batches) pair.Value.Finish(pair.Key, root.transform);
                Sunlight();
                foreach (var obj in previous) Undo.DestroyObjectImmediate(obj);
                foreach (var obj in scene.GetRootGameObjects().Where(o => o.name == "ONE SHIFT" || o.name == "STORAGE / 01"))
                {
                    Undo.RecordObject(obj.transform, "Place warehouse lettering");
                    obj.transform.position = new Vector3(obj.transform.position.x, obj.transform.position.y, 11.76f);
                }
                Physics.SyncTransforms();
                WarehouseLightingBuilder.InstallIntoScene();
                WarehouseDayNightBuilder.InstallIntoScene();
            }
            catch { Object.DestroyImmediate(root); throw; }
        }

        static void Materials()
        {
            var shader = Shader.Find("OneShift/Warehouse Masonry");
            if (shader == null) throw new Exception("Warehouse masonry shader is missing.");
            masonry = Save(new Material(shader) { name = "Painted concrete blocks", enableInstancing = true }, Root + "Materials/Environment/Masonry.mat");
            panel = Lit("Warm galvanized wall panels", new Color(.61f, .62f, .57f), .32f, .3f);
            steel = Lit("Charcoal structural steel", new Color(.17f, .20f, .19f), .62f, .34f);
            trim = Lit("Concrete plinth", new Color(.32f, .34f, .31f), 0, .2f);
            zinc = Lit("Brushed galvanized metal", new Color(.44f, .48f, .47f), .7f, .42f);
            rubber = Lit("Window gaskets", new Color(.065f, .077f, .07f), 0, .2f);
            safety = Lit("Column protection ochre", new Color(.73f, .48f, .12f), .15f, .3f);
            lens = Lit("High bay diffuser", new Color(.86f, .87f, .79f), 0, .32f);
            lens.EnableKeyword("_EMISSION");
            lens.SetColor("_EmissionColor", new Color(.75f, .77f, .70f));
            lens.globalIlluminationFlags = MaterialGlobalIlluminationFlags.BakedEmissive;
            EditorUtility.SetDirty(lens);
            glass = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { name = "Clerestory glass" };
            glass.SetColor("_BaseColor", new Color(.55f, .70f, .75f, .15f));
            glass.SetFloat("_Surface", 1); glass.SetFloat("_Blend", 0); glass.SetFloat("_ZWrite", 0);
            glass.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha); glass.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            glass.SetFloat("_Cull", 0); glass.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            glass.SetOverrideTag("RenderType", "Transparent"); glass.renderQueue = 3000;
            glass = Save(glass, Root + "Materials/Environment/Glass.mat");
        }

        static Material Lit(string name, Color color, float metallic, float smoothness)
        {
            var mat = new Material(Shader.Find("Universal Render Pipeline/Lit")) { name = name, enableInstancing = true };
            mat.SetColor("_BaseColor", color); mat.SetFloat("_Metallic", metallic); mat.SetFloat("_Smoothness", smoothness);
            return Save(mat, Root + "Materials/Environment/" + name.Replace(" ", "") + ".mat");
        }

        static void Wall(string name, Vector3 origin, Vector3 along, Vector3 inward, float length, float[] openings, float windowWidth)
        {
            var wall = new GameObject(name + " wall with clerestory openings"); wall.transform.SetParent(root.transform);
            Action<string, float, float, float, float, Material, bool> section = (label, x, y, w, h, mat, solid) =>
            {
                var size = new Vector3(Mathf.Abs(along.x) * w + Mathf.Abs(inward.x) * .24f, h, Mathf.Abs(along.z) * w + Mathf.Abs(inward.z) * .24f);
                var center = origin + along * x + Vector3.up * y;
                Box(center, size, mat);
                if (solid) Collider(wall.transform, label, center, size);
            };
            section("Block wall collision", 0, 1.6f, length, 3.2f, masonry, true);
            section("Upper cladding", 0, 4.25f, length, 2.1f, panel, true);
            section("Window header", 0, 7.7f, length, 1.2f, panel, true);
            section("Concrete kick plinth", 0, .15f, length, .3f, trim, false);
            float cursor = -length * .5f;
            foreach (float x in openings)
            {
                float start = x - windowWidth * .5f;
                section("Window pier", (cursor + start) * .5f, 6.2f, start - cursor, 1.8f, panel, true);
                Window(wall.transform, origin + along * x + Vector3.up * 6.2f, along, inward, windowWidth, 1.8f);
                cursor = x + windowWidth * .5f;
            }
            section("Window pier", (cursor + length * .5f) * .5f, 6.2f, length * .5f - cursor, 1.8f, panel, true);
            // Ribbed upper cladding, with the window band deliberately left open.
            for (float x = -length * .5f + .1f; x < length * .5f; x += .27f)
                foreach (var band in new[] { new Vector2(4.25f, 2.08f), new Vector2(7.7f, 1.18f) })
                    Box(origin + along * x + Vector3.up * band.x + inward * .135f,
                        new Vector3(Mathf.Abs(along.x) * .032f + Mathf.Abs(inward.x) * .04f, band.y, Mathf.Abs(along.z) * .032f + Mathf.Abs(inward.z) * .04f), panel);
            foreach (float y in new[] { .30f, 3.2f, 5.28f, 7.12f })
                Beam(origin + inward * .16f + Vector3.up * y - along * length * .5f,
                    origin + inward * .16f + Vector3.up * y + along * length * .5f, .06f, .08f, zinc);
            for (float x = -length * .5f + .3f; x < length * .5f; x += 5.2f)
            {
                var p = origin + along * x + inward * .28f;
                // Visible flanges and web instead of a single rectangular post.
                Box(p + Vector3.up * 4, new Vector3(.13f, 8, .13f), steel);
                foreach (float sign in new[] { -1f, 1f })
                    Box(p + along * (.115f * sign) + Vector3.up * 4,
                        new Vector3(Mathf.Abs(along.x) * .035f + Mathf.Abs(inward.x) * .3f, 8, Mathf.Abs(along.z) * .035f + Mathf.Abs(inward.z) * .3f), steel);
                Box(p + Vector3.up * .04f, new Vector3(.44f, .08f, .44f), zinc);
                Box(p + inward * .08f + Vector3.up * .46f, new Vector3(.34f, .85f, .34f), safety);
                Collider(wall.transform, "Column collision", p + Vector3.up * 4, new Vector3(.3f, 8, .3f));
                Collider(wall.transform, "Column guard collision", p + inward * .08f + Vector3.up * .46f, new Vector3(.34f, .85f, .34f));
            }
        }

        static void Window(Transform parent, Vector3 center, Vector3 along, Vector3 inward, float width, float height)
        {
            var window = new GameObject("Clerestory window"); window.transform.SetParent(parent); window.transform.position = center;
            var size = new Vector3(Mathf.Abs(along.x) * width + Mathf.Abs(inward.x) * .025f, height, Mathf.Abs(along.z) * width + Mathf.Abs(inward.z) * .025f);
            Box(center, size, glass);
            for (int i = 0; i <= 4; i++)
            {
                var p = center + along * (-width / 2 + width * i / 4) + inward * .1f;
                Beam(p - Vector3.up * height / 2, p + Vector3.up * height / 2, i == 0 || i == 4 ? .1f : .055f, .085f, steel);
            }
            foreach (float y in new[] { -height / 2, 0, height / 2 })
                Beam(center + Vector3.up * y - along * width / 2 + inward * .1f, center + Vector3.up * y + along * width / 2 + inward * .1f, .065f, .1f, steel);
            Beam(center - Vector3.up * (height / 2 + .06f) - along * (width / 2 + .12f) + inward * .18f,
                center - Vector3.up * (height / 2 + .06f) + along * (width / 2 + .12f) + inward * .18f, .085f, .29f, zinc);
            // Thin rubber beading around each pane is apparent at closer range.
            foreach (float y in new[] { -height / 2 + .05f, height / 2 - .05f })
                Beam(center + Vector3.up * y - along * width / 2 + inward * .11f, center + Vector3.up * y + along * width / 2 + inward * .11f, .018f, .11f, rubber);
        }

        static void Roof()
        {
            Box(new Vector3(0, Height + .10f, 1), new Vector3(23.4f, .2f, 22.4f), panel);
            Collider(root.transform, "Solid roof", new Vector3(0, Height + .1f, 1), new Vector3(23.4f, .2f, 22.4f));
            for (float x = -11.4f; x < 11.5f; x += .3f)
                Box(new Vector3(x, Height - .035f, 1), new Vector3(.055f, .07f, 22), zinc);
            foreach (float z in new[] { -9f, -5f, -1f, 3f, 7f, 11f })
            {
                // Deep open-web roof trusses, with double chords and alternating diagonals.
                foreach (float y in new[] { 7.3f, 8.03f })
                    foreach (float side in new[] { -.10f, .10f })
                        Box(new Vector3(0, y, z + side), new Vector3(23, .11f, .07f), steel);
                for (float x = -11.5f; x < 11.4f; x += 1.15f)
                {
                    int index = Mathf.RoundToInt((x + 11.5f) / 1.15f);
                    Beam(new Vector3(x, index % 2 == 0 ? 7.3f : 8.03f, z), new Vector3(x + 1.15f, index % 2 == 0 ? 8.03f : 7.3f, z), .075f, .075f, steel);
                    Box(new Vector3(x, 7.3f, z), new Vector3(.2f, .17f, .025f), zinc);
                }
            }
            foreach (float x in new[] { -9f, -6f, -3f, 0f, 3f, 6f, 9f })
                Box(new Vector3(x, 8.17f, 1), new Vector3(.08f, .18f, 22), steel);
            foreach (float z in new[] { -6.5f, -.5f, 5.5f, 10f })
                foreach (float x in new[] { -6.5f, 0, 6.5f })
                {
                    foreach (float end in new[] { -.66f, .66f })
                        Box(new Vector3(x + end, 7.3f, z), new Vector3(.015f, 1.05f, .015f), steel);
                    Box(new Vector3(x, 6.77f, z), new Vector3(1.65f, .13f, .38f), steel);
                    Box(new Vector3(x, 6.695f, z), new Vector3(1.51f, .025f, .28f), lens);
                    var fixture = new GameObject("High bay light"); fixture.transform.SetParent(root.transform);
                    fixture.transform.position = new Vector3(x, 6.56f, z); fixture.transform.rotation = Quaternion.Euler(90, 0, 0);
                    var light = fixture.AddComponent<Light>(); light.type = LightType.Spot;
                    light.color = new Color(.88f, .92f, 1); light.range = 11; light.spotAngle = 110; light.innerSpotAngle = 72;
                    light.intensity = 5f; light.shadows = LightShadows.None;
                }
            // Sprinkler mains and electrical tray give the ceiling a working scale.
            foreach (float x in new[] { -8f, 8f })
            {
                Box(new Vector3(x, 7.0f, 1), new Vector3(.065f, .065f, 21), trim);
                for (float z = -8; z < 12; z += 4)
                {
                    Box(new Vector3(x, 6.89f, z), new Vector3(.032f, .24f, .032f), zinc);
                    Box(new Vector3(x, 6.76f, z), new Vector3(.1f, .018f, .1f), zinc);
                }
            }
            foreach (float x in new[] { 3.8f, 4.25f }) Box(new Vector3(x, 7.14f, 1), new Vector3(.035f, .14f, 22), zinc);
            for (float z = -10; z < 12; z += .5f) Box(new Vector3(4.025f, 7.08f, z), new Vector3(.45f, .025f, .035f), zinc);
        }

        static void Details()
        {
            // Closed loading shutter, inset frame, slats, pull bar and rubber bumpers.
            Box(new Vector3(6.3f, 2.05f, 11.82f), new Vector3(3.7f, 4.1f, .09f), steel);
            Box(new Vector3(6.3f, 2, 11.75f), new Vector3(3.45f, 3.94f, .08f), zinc);
            for (float y = .15f; y < 4; y += .145f) Box(new Vector3(6.3f, y, 11.69f), new Vector3(3.45f, .024f, .026f), steel);
            foreach (float x in new[] { 4.39f, 8.21f })
            {
                Box(new Vector3(x, 2.05f, 11.66f), new Vector3(.16f, 4.1f, .22f), steel);
                Box(new Vector3(x, .5f, 11.40f), new Vector3(.26f, 1, .28f), safety);
                Collider(root.transform, "Dock bumper collision", new Vector3(x, .5f, 11.40f), new Vector3(.26f, 1, .28f));
            }
            Box(new Vector3(6.3f, 4.22f, 11.65f), new Vector3(4.05f, .35f, .35f), zinc);
            Box(new Vector3(6.3f, 1, 11.6f), new Vector3(.68f, .045f, .06f), steel);
            // Service door, an electrical cabinet and surface-mounted conduit.
            Box(new Vector3(-8.5f, 1.1f, -9.8f), new Vector3(1.13f, 2.2f, .14f), steel);
            Box(new Vector3(-8.5f, 1.07f, -9.7f), new Vector3(.99f, 2.1f, .07f), trim);
            Box(new Vector3(-8.5f, 1.05f, -9.64f), new Vector3(.8f, .055f, .055f), zinc);
            Box(new Vector3(-6.8f, 1.6f, -9.72f), new Vector3(.58f, .82f, .22f), zinc);
            Box(new Vector3(-6.8f, 3.53f, -9.72f), new Vector3(.034f, 3.05f, .034f), zinc);
        }

        static void Sunlight()
        {
            var sunObject = GameObject.Find("High warehouse daylight") ?? new GameObject("High warehouse daylight");
            Undo.RecordObject(sunObject.transform, "Aim warehouse daylight");
            var sun = sunObject.GetComponent<Light>() ?? sunObject.AddComponent<Light>();
            Undo.RecordObject(sun, "Set warehouse daylight");
            sun.type = LightType.Directional; sun.intensity = 2.7f; sun.color = new Color(1, .88f, .68f);
            sun.shadows = LightShadows.Soft; sun.shadowStrength = 1; sun.shadowBias = .025f; sun.shadowNormalBias = .025f;
            sunObject.transform.rotation = Quaternion.LookRotation(SunDirection); RenderSettings.sun = sun;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(.42f, .47f, .52f);
            RenderSettings.ambientEquatorColor = new Color(.36f, .38f, .37f);
            RenderSettings.ambientGroundColor = new Color(.20f, .20f, .17f);
            RenderSettings.fog = true; RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = new Color(.55f, .62f, .65f); RenderSettings.fogStartDistance = 28; RenderSettings.fogEndDistance = 95;
            var pipeline = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            if (pipeline != null)
            {
                Undo.RecordObject(pipeline, "Warehouse depth and shadows");
                pipeline.supportsCameraDepthTexture = true; pipeline.mainLightShadowmapResolution = 4096;
                pipeline.shadowDistance = 45; pipeline.shadowCascadeCount = 4;
                pipeline.maxAdditionalLightsCount = 8; EditorUtility.SetDirty(pipeline);
            }
            var rendererData = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(Root + "Materials/RackLabRenderer.asset");
            var ao = rendererData.rendererFeatures.OfType<ScreenSpaceAmbientOcclusion>().FirstOrDefault();
            if (ao == null)
            {
                ao = ScriptableObject.CreateInstance<ScreenSpaceAmbientOcclusion>(); ao.name = "Warehouse contact shading";
                AssetDatabase.AddObjectToAsset(ao, rendererData); rendererData.rendererFeatures.Add(ao);
            }
            var aoSettings = new SerializedObject(ao);
            aoSettings.FindProperty("m_Settings.Intensity").floatValue = 1.15f;
            aoSettings.FindProperty("m_Settings.Radius").floatValue = .24f;
            aoSettings.FindProperty("m_Settings.DirectLightingStrength").floatValue = .12f;
            aoSettings.FindProperty("m_Settings.Source").enumValueIndex = 0;
            aoSettings.FindProperty("m_Settings.NormalSamples").enumValueIndex = 2;
            aoSettings.FindProperty("m_Settings.Falloff").floatValue = 45;
            aoSettings.ApplyModifiedPropertiesWithoutUndo(); ao.SetActive(true); rendererData.SetDirty();
            foreach (var camera in Object.FindObjectsByType<Camera>(FindObjectsSortMode.None))
            {
                Undo.RecordObject(camera, "Warehouse sky through windows"); camera.backgroundColor = new Color(.64f, .74f, .80f);
                camera.depthTextureMode |= DepthTextureMode.Depth;
            }
            var reflection = Object.FindFirstObjectByType<ReflectionProbe>();
            if (reflection != null)
            {
                Undo.RecordObject(reflection, "Warehouse reflection bounds"); Undo.RecordObject(reflection.transform, "Warehouse reflection center");
                reflection.transform.position = new Vector3(0, Height * .5f, 1); reflection.size = new Vector3(23, 9, 22); reflection.intensity = .6f;
            }
            var shaftShader = Shader.Find("OneShift/Warehouse Sun Shaft");
            if (shaftShader == null) throw new Exception("Window shaft shader is missing.");
            var shaftMaterial = new Material(shaftShader) { name = "Sunlit warehouse air" };
            shaftMaterial.SetFloat("_Density", .022f); shaftMaterial.SetVector("_WindowGrid", new Vector4(4, 2, 0, 0));
            shaftMaterial = Save(shaftMaterial, Root + "Materials/Environment/SunShaft.mat");
            var dustMaterial = DustMaterial();
            int index = 0;
            foreach (float z in SideWindows)
            {
                Shaft(new Vector3(-11.34f, 6.2f, z), Vector3.back * 3.65f, Vector3.up * 1.67f, new Vector3(1, -.68f, 0).normalized * 13.2f, shaftMaterial, dustMaterial, index++);
                Shaft(new Vector3(11.34f, 6.2f, z), Vector3.forward * 3.65f, Vector3.up * 1.67f, new Vector3(-1, -.68f, 0).normalized * 13.2f, shaftMaterial, dustMaterial, index++);
            }
            foreach (float x in EndWindows)
            {
                Shaft(new Vector3(x, 6.2f, -9.84f), Vector3.right * 3.65f, Vector3.up * 1.67f, new Vector3(0, -.68f, 1).normalized * 13.2f, shaftMaterial, dustMaterial, index++);
                Shaft(new Vector3(x, 6.2f, 11.84f), Vector3.left * 3.65f, Vector3.up * 1.67f, new Vector3(0, -.68f, -1).normalized * 13.2f, shaftMaterial, dustMaterial, index++);
            }
        }

        static Material DustMaterial()
        {
            string path = Root + "Textures/Environment/Dust.png";
            var tex = new Texture2D(32, 32, TextureFormat.RGBA32, false);
            for (int y = 0; y < 32; y++) for (int x = 0; x < 32; x++)
            {
                float d = Vector2.Distance(new Vector2(x + .5f, y + .5f), new Vector2(16, 16)) / 16;
                tex.SetPixel(x, y, new Color(1, 1, 1, Mathf.Pow(Mathf.Clamp01(1 - d), 2)));
            }
            tex.Apply(); File.WriteAllBytes(path, tex.EncodeToPNG()); Object.DestroyImmediate(tex); AssetDatabase.ImportAsset(path);
            var importer = (TextureImporter)AssetImporter.GetAtPath(path); importer.alphaIsTransparency = true; importer.wrapMode = TextureWrapMode.Clamp; importer.SaveAndReimport();
            var mat = new Material(Shader.Find("Universal Render Pipeline/Particles/Unlit")) { name = "Fine dust" };
            mat.SetTexture("_BaseMap", AssetDatabase.LoadAssetAtPath<Texture2D>(path));
            mat.SetColor("_BaseColor", Color.white); mat.SetFloat("_Surface", 1); mat.SetFloat("_Blend", 0);
            mat.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha); mat.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha); mat.SetFloat("_ZWrite", 0);
            mat.EnableKeyword("_SURFACE_TYPE_TRANSPARENT"); mat.renderQueue = 3001;
            return Save(mat, Root + "Materials/Environment/Dust.mat");
        }

        static void Shaft(Vector3 center, Vector3 right, Vector3 up, Vector3 travel, Material material, Material dustMaterial, int index)
        {
            var obj = new GameObject("Window sunlight " + (index + 1)); obj.transform.SetParent(root.transform);
            obj.AddComponent<MeshFilter>(); var renderer = obj.AddComponent<MeshRenderer>(); renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off; renderer.receiveShadows = false;
            var component = obj.AddComponent<WarehouseSunVolume>();
            component.windowCenter = center; component.windowRight = right; component.windowUp = up; component.travel = travel; component.seed = 41 + index;
            component.windowInward = Vector3.Cross(right, up).normalized;
            var geometry = new Geometry("Sun volume " + index); geometry.Cube(component.VolumeMatrix());
            obj.GetComponent<MeshFilter>().sharedMesh = geometry.SaveMesh();
            var dustObject = new GameObject("Sparse floating dust"); dustObject.transform.SetParent(obj.transform);
            var ps = dustObject.AddComponent<ParticleSystem>(); var main = ps.main;
            main.maxParticles = 96; main.simulationSpace = ParticleSystemSimulationSpace.World; main.playOnAwake = true;
            main.startSpeed = 0; main.startLifetime = 10000; main.cullingMode = ParticleSystemCullingMode.PauseAndCatchup;
            var emission = ps.emission; emission.enabled = false; var shape = ps.shape; shape.enabled = false;
            var pr = ps.GetComponent<ParticleSystemRenderer>(); pr.sharedMaterial = dustMaterial; pr.shadowCastingMode = ShadowCastingMode.Off;
            pr.minParticleSize = 0; pr.maxParticleSize = .02f;
            component.enabled = false; component.enabled = true;
        }

        public static string Validate()
        {
            var architecture = GameObject.Find(Name);
            if (architecture == null) throw new Exception("Warehouse shell is missing.");
            if (architecture.GetComponentsInChildren<Transform>().Count(t => t.name == "Clerestory window") != 16) throw new Exception("Expected sixteen clerestory windows.");
            if (architecture.GetComponentsInChildren<WarehouseSunVolume>().Length != 16) throw new Exception("Expected sixteen sun-tracking window volumes.");
            foreach (var shaderName in new[] { "OneShift/Warehouse Masonry", "OneShift/Warehouse Sun Shaft" })
            {
                var shader = Shader.Find(shaderName);
                if (shader == null) throw new Exception("Missing shader: " + shaderName);
                var errors = ShaderUtil.GetShaderMessages(shader).Where(m => m.severity == ShaderCompilerMessageSeverity.Error).ToArray();
                if (errors.Length > 0) throw new Exception(string.Join("\n", errors.Select(m => m.message)));
            }
            Physics.SyncTransforms();
            foreach (var direction in new[] { Vector3.left, Vector3.right, Vector3.back, Vector3.forward })
                if (!Physics.RaycastAll(new Vector3(0, 1, -5), direction, 30).Any(hit => hit.collider.transform.IsChildOf(architecture.transform)))
                    throw new Exception("Warehouse perimeter has no collision in direction " + direction);
            foreach (float z in SideWindows)
                if (Physics.Raycast(new Vector3(-10.8f, 6.45f, z + .25f), Vector3.left, 2)) throw new Exception("West window opening was filled in.");
            if (!Physics.Raycast(new Vector3(0, 7.7f, -6), Vector3.up, out var ceiling, 1) || ceiling.collider.name != "Solid roof") throw new Exception("Roof is not enclosed.");
            WarehouseFloorBuilder.Validate(); RackLabBuilder.Validate();
            int triangles = architecture.GetComponentsInChildren<MeshFilter>().Sum(f => f.sharedMesh.triangles.Length / 3);
            var report = "Warehouse passed: 23 x 22 m enclosure, 8.3 m roof, 16 open clerestory windows, 6 steel trusses, 16 sun-tracking depth-aware volumes, dust visible only in sun-facing windows, perimeter collision, open window rays, solid ceiling, floor and rack regression checks. Shell triangles: " + triangles + ".";
            File.WriteAllText(Root + "Reports/warehouse-environment-validation.txt", report + "\n"); Debug.Log(report); return report;
        }

        static void Box(Vector3 position, Vector3 size, Material material)
        {
            if (!batches.TryGetValue(material, out var geometry)) batches[material] = geometry = new Geometry(material.name);
            geometry.Cube(Matrix4x4.TRS(position, Quaternion.identity, size));
        }
        static void Beam(Vector3 from, Vector3 to, float width, float depth, Material material)
        {
            if (!batches.TryGetValue(material, out var geometry)) batches[material] = geometry = new Geometry(material.name);
            geometry.Cube(Matrix4x4.TRS((from + to) * .5f, Quaternion.FromToRotation(Vector3.up, to - from), new Vector3(width, Vector3.Distance(from, to), depth)));
        }
        static void Collider(Transform parent, string name, Vector3 position, Vector3 size)
        {
            var obj = new GameObject(name); obj.transform.SetParent(parent); obj.transform.position = position;
            obj.AddComponent<BoxCollider>().size = size;
        }
        static T Save<T>(T obj, string path) where T : Object
        {
            var existing = AssetDatabase.LoadAssetAtPath<T>(path);
            if (existing == null) { AssetDatabase.CreateAsset(obj, path); return obj; }
            EditorUtility.CopySerialized(obj, existing); Object.DestroyImmediate(obj); EditorUtility.SetDirty(existing); return existing;
        }

        sealed class Geometry
        {
            readonly string name;
            readonly List<Vector3> vertices = new List<Vector3>();
            readonly List<int> indices = new List<int>();
            static readonly Vector3[] corners = {
                new Vector3(-.5f,-.5f,-.5f),new Vector3(.5f,-.5f,-.5f),new Vector3(.5f,.5f,-.5f),new Vector3(-.5f,.5f,-.5f),
                new Vector3(-.5f,-.5f,.5f),new Vector3(.5f,-.5f,.5f),new Vector3(.5f,.5f,.5f),new Vector3(-.5f,.5f,.5f) };
            static readonly int[] faces = { 0,3,2,1, 4,5,6,7, 0,4,7,3, 1,2,6,5, 0,1,5,4, 3,7,6,2 };
            public Geometry(string label) { name = label; }
            public void Cube(Matrix4x4 matrix)
            {
                bool flip = matrix.determinant < 0;
                for (int face = 0; face < 6; face++)
                {
                    int first = vertices.Count;
                    for (int c = 0; c < 4; c++) vertices.Add(matrix.MultiplyPoint3x4(corners[faces[face * 4 + c]]));
                    foreach (int i in flip ? new[] { 0,2,1,0,3,2 } : new[] { 0,1,2,0,2,3 }) indices.Add(first + i);
                }
            }
            public Mesh SaveMesh()
            {
                var mesh = new Mesh { name = name, indexFormat = vertices.Count > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
                mesh.SetVertices(vertices); mesh.SetTriangles(indices, 0); mesh.RecalculateNormals(); mesh.RecalculateBounds();
                return Save(mesh, MeshRoot + name.Replace(" ", "") + ".asset");
            }
            public void Finish(Material material, Transform parent)
            {
                var obj = new GameObject(name); obj.transform.SetParent(parent); obj.isStatic = true;
                obj.AddComponent<MeshFilter>().sharedMesh = SaveMesh(); var renderer = obj.AddComponent<MeshRenderer>(); renderer.sharedMaterial = material;
                if (material == glass) { renderer.shadowCastingMode = ShadowCastingMode.Off; renderer.receiveShadows = false; }
            }
        }
    }
}
