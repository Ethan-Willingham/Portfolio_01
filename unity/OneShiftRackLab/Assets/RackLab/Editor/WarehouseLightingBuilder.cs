using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    public static class WarehouseLightingBuilder
    {
        public const string RootName = "Warehouse switchable lighting";
        const string AssetRoot = "Assets/RackLab/";
        const string MaterialRoot = AssetRoot + "Materials/Lighting/";
        static readonly float[] RowX = { -6.5f, 0, 6.5f };
        static readonly float[] FixtureZ = { -6.5f, -.5f, 5.5f, 10f };
        static readonly string[] RowNames = { "West", "Centre", "East" };
        static Material enclosure, face, gasket, zinc, label, diffuser, indicator;
        static Font font;

        [MenuItem("One Shift/Install switchable warehouse lighting")]
        public static void Install()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before installing warehouse lighting.");
            if (SceneManager.GetActiveScene().path != AssetRoot + "Scenes/RackFloor.unity")
                throw new InvalidOperationException("Open RackFloor.unity first.");
            InstallIntoScene();
            Validate();
            EditorSceneManager.SaveScene(SceneManager.GetActiveScene());
            AssetDatabase.SaveAssets();
        }

        public static void InstallIntoScene()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before installing warehouse lighting.");
            var architecture = GameObject.Find("Warehouse architecture");
            if (architecture == null) throw new InvalidOperationException("Install the warehouse architecture first.");
            var previous = GameObject.Find(RootName);
            var previousRows = previous == null ? Array.Empty<WarehouseLightRow>() : previous.GetComponentsInChildren<WarehouseLightRow>();
            var oldLights = architecture.GetComponentsInChildren<Light>(true).Where(l => l.name == "High bay light").ToArray();
            if (oldLights.Length != 0 && oldLights.Length != 12)
                throw new InvalidOperationException("Expected twelve original high-bay fixtures, found " + oldLights.Length + ".");
            var positions = oldLights.Select(l => l.transform.position).ToArray();
            if (positions.Length == 0)
                positions = previousRows.SelectMany(r => r.FixtureLights).Where(l => l != null).Select(l => l.transform.position).ToArray();
            if (positions.Length == 0)
                positions = RowX.SelectMany(x => FixtureZ.Select(z => new Vector3(x, 6.56f, z))).ToArray();
            if (positions.Length != 12) throw new InvalidOperationException("Expected twelve high-bay fixture positions.");
            bool[] states = RowX.Select((x, i) => previousRows.FirstOrDefault(r => r.RowNumber == i + 1)?.IsOn ?? true).ToArray();

            Materials();
            ConfigurePipeline();
            if (previous != null) Undo.DestroyObjectImmediate(previous);
            var root = new GameObject(RootName);
            Undo.RegisterCreatedObjectUndo(root, "Install three light circuits");

            // The original lenses were one combined draw. Leave the housing batch
            // intact, and give each physical diffuser its own circuit-controlled emission.
            foreach (var renderer in architecture.GetComponentsInChildren<MeshRenderer>(true))
                if (renderer.name == "High bay diffuser" || renderer.sharedMaterials.Any(m => m != null &&
                    AssetDatabase.GetAssetPath(m) == AssetRoot + "Materials/Environment/Highbaydiffuser.mat"))
                {
                    Undo.RecordObject(renderer, "Replace shared diffuser emission");
                    renderer.enabled = false;
                }
            foreach (var light in oldLights) Undo.DestroyObjectImmediate(light.gameObject);
            foreach (var light in Object.FindObjectsByType<Light>(FindObjectsSortMode.None))
                if (light.name == "Soft fixture fill" || light.name == "Overhead light") Undo.DestroyObjectImmediate(light.gameObject);

            for (int rowIndex = 0; rowIndex < 3; rowIndex++)
            {
                var rowObject = new GameObject("Row " + (rowIndex + 1) + " / " + RowNames[rowIndex]);
                rowObject.transform.SetParent(root.transform, false);
                var row = rowObject.AddComponent<WarehouseLightRow>();
                row.RowNumber = rowIndex + 1;
                row.RowLabel = RowNames[rowIndex];
                var rowPositions = positions.Where(p => Mathf.Abs(p.x - RowX[rowIndex]) < .1f).OrderBy(p => p.z).ToArray();
                if (rowPositions.Length != 4) throw new InvalidOperationException("Expected four fixtures in " + RowNames[rowIndex] + " row.");
                var lights = new List<Light>();
                var lenses = new List<Renderer>();
                for (int index = 0; index < rowPositions.Length; index++)
                {
                    var fixture = new GameObject("Row " + row.RowNumber + " fixture " + (index + 1));
                    fixture.transform.SetParent(rowObject.transform, false);
                    fixture.transform.position = rowPositions[index];
                    fixture.transform.rotation = Quaternion.Euler(90, 0, 0);
                    var light = fixture.AddComponent<Light>();
                    light.type = LightType.Spot;
                    light.lightmapBakeType = LightmapBakeType.Realtime;
                    light.color = Color.white;
                    light.useColorTemperature = true;
                    light.colorTemperature = 4200;
                    light.intensity = row.FixtureIntensity;
                    light.range = 13;
                    light.spotAngle = 108;
                    light.innerSpotAngle = 76;
                    light.shadows = LightShadows.Soft;
                    light.shadowStrength = 1;
                    light.shadowBias = .025f;
                    light.shadowNormalBias = .045f;
                    light.shadowNearPlane = .12f;
                    light.bounceIntensity = 0;
                    light.renderMode = LightRenderMode.ForcePixel;
                    var lightData = fixture.AddComponent<UniversalAdditionalLightData>();
                    lightData.usePipelineSettings = false;
                    var serialized = new SerializedObject(lightData);
                    serialized.FindProperty("m_AdditionalLightsShadowResolutionTier").intValue = 2;
                    serialized.ApplyModifiedPropertiesWithoutUndo();
                    lights.Add(light);
                    var lens = Primitive("Row " + row.RowNumber + " diffuser " + (index + 1), PrimitiveType.Cube,
                        rowObject.transform, rowPositions[index] + Vector3.up * .135f, new Vector3(1.51f, .025f, .28f), diffuser);
                    lens.GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
                    lenses.Add(lens.GetComponent<Renderer>());
                }
                row.FixtureLights = lights.ToArray();
                row.Diffusers = lenses.ToArray();
                row.SetOn(states[rowIndex]);
                Switch(root.transform, row, new Vector3(-5.45f + rowIndex * .49f, 1.45f, -9.80f));
            }
            Physics.SyncTransforms();
            EditorSceneManager.MarkSceneDirty(SceneManager.GetActiveScene());
        }

        static void ConfigurePipeline()
        {
            var pipeline = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            if (pipeline == null) throw new InvalidOperationException("The warehouse needs the Universal Render Pipeline.");
            Undo.RecordObject(pipeline, "Enable high-bay light shadows");
            var serialized = new SerializedObject(pipeline);
            serialized.FindProperty("m_AdditionalLightShadowsSupported").boolValue = true;
            serialized.FindProperty("m_AdditionalLightsRenderingMode").intValue = 1;
            serialized.FindProperty("m_AdditionalLightsShadowResolutionTierHigh").intValue = 1024;
            serialized.FindProperty("m_SoftShadowsSupported").boolValue = true;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            pipeline.additionalLightsShadowmapResolution = 4096;
            pipeline.maxAdditionalLightsCount = 8;
            EditorUtility.SetDirty(pipeline);
            var renderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(AssetRoot + "Materials/RackLabRenderer.asset");
            if (renderer == null) throw new InvalidOperationException("Warehouse renderer data is missing.");
            Undo.RecordObject(renderer, "Keep all twelve light sources on combined warehouse meshes");
            renderer.renderingMode = RenderingMode.ForwardPlus;
            renderer.SetDirty();
            EditorUtility.SetDirty(renderer);
        }

        static void Materials()
        {
            Directory.CreateDirectory(MaterialRoot);
            AssetDatabase.Refresh();
            font = Resources.Load<Font>("RackLabFont");
            enclosure = Material("Powder coated switch enclosure", new Color(.28f, .32f, .31f), .6f, .30f);
            face = Material("Switch brushed steel face", new Color(.55f, .57f, .53f), .72f, .36f);
            gasket = Material("Switch rubber seals", new Color(.037f, .045f, .040f), 0, .28f);
            zinc = Material("Switch nickel hardware", new Color(.65f, .67f, .63f), .82f, .55f);
            label = Material("Switch engraved plate", new Color(.77f, .76f, .67f), .08f, .25f);
            diffuser = Material("Switched high bay diffuser", new Color(.92f, .91f, .84f), 0, .28f, true);
            indicator = Material("Switch green pilot lens", new Color(.20f, .47f, .21f), .1f, .50f, true);
        }

        static Material Material(string name, Color color, float metal, float smoothness, bool emission = false)
        {
            string path = MaterialRoot + name.Replace(" ", "") + ".mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                material = new Material(Shader.Find("Universal Render Pipeline/Lit")) { name = name };
                AssetDatabase.CreateAsset(material, path);
            }
            material.enableInstancing = true;
            material.SetColor("_BaseColor", color);
            material.SetFloat("_Metallic", metal);
            material.SetFloat("_Smoothness", smoothness);
            // URP 17 validates _EMISSION using AnyEmissive. RealtimeEmissive
            // preserves the keyword without baking light from switched lenses.
            material.globalIlluminationFlags = emission ? MaterialGlobalIlluminationFlags.RealtimeEmissive : MaterialGlobalIlluminationFlags.None;
            if (emission) material.EnableKeyword("_EMISSION");
            // A nonzero material value retains the emission shader variant after
            // URP validates the asset; each circuit supplies the actual value via MPB.
            material.SetColor("_EmissionColor", emission ? Color.white : Color.black);
            EditorUtility.SetDirty(material);
            return material;
        }

        static void Switch(Transform parent, WarehouseLightRow row, Vector3 position)
        {
            var obj = new GameObject("Industrial switch / row " + row.RowNumber);
            obj.transform.SetParent(parent, false);
            obj.transform.position = position;
            var control = obj.AddComponent<WarehouseLightSwitch>();
            control.Row = row;
            var collision = obj.GetComponent<BoxCollider>();
            collision.center = new Vector3(0, .02f, .04f);
            collision.size = new Vector3(.31f, .53f, .22f);
            Primitive("Weather seal", PrimitiveType.Cube, obj.transform, new Vector3(0, 0, -.072f), new Vector3(.282f, .438f, .018f), gasket);
            Primitive("Cast metal enclosure", PrimitiveType.Cube, obj.transform, Vector3.zero, new Vector3(.27f, .426f, .14f), enclosure);
            Primitive("Brushed front plate", PrimitiveType.Cube, obj.transform, new Vector3(0, 0, .077f), new Vector3(.252f, .406f, .014f), face);
            foreach (float x in new[] { -.103f, .103f })
                foreach (float y in new[] { -.174f, .174f })
                {
                    var screw = Primitive("Captive screw", PrimitiveType.Cylinder, obj.transform,
                        new Vector3(x, y, .090f), new Vector3(.016f, .003f, .016f), zinc);
                    screw.transform.localRotation = Quaternion.Euler(90, 0, 0);
                    Primitive("Screw slot", PrimitiveType.Cube, obj.transform,
                        new Vector3(x, y, .094f), new Vector3(.011f, .002f, .001f), gasket);
                }
            var collar = Primitive("Toggle retaining collar", PrimitiveType.Cylinder, obj.transform,
                new Vector3(0, -.028f, .102f), new Vector3(.061f, .012f, .061f), zinc);
            collar.transform.localRotation = Quaternion.Euler(90, 0, 0);
            var lever = new GameObject("Spring toggle lever");
            lever.transform.SetParent(obj.transform, false);
            lever.transform.localPosition = new Vector3(0, -.028f, .119f);
            var stem = Primitive("Nickel toggle stem", PrimitiveType.Cylinder, lever.transform,
                new Vector3(0, 0, .031f), new Vector3(.016f, .034f, .016f), zinc);
            stem.transform.localRotation = Quaternion.Euler(90, 0, 0);
            Primitive("Ribbed insulating grip", PrimitiveType.Cube, lever.transform,
                new Vector3(0, 0, .075f), new Vector3(.039f, .029f, .035f), gasket);
            for (int i = 0; i < 3; i++)
                Primitive("Grip rib", PrimitiveType.Cube, lever.transform,
                    new Vector3(0, 0, .063f + i * .01f), new Vector3(.043f, .033f, .003f), enclosure);
            control.Lever = lever.transform;
            var pilotRim = Primitive("Pilot retaining rim", PrimitiveType.Cylinder, obj.transform,
                new Vector3(-.071f, .126f, .095f), new Vector3(.032f, .006f, .032f), zinc);
            pilotRim.transform.localRotation = Quaternion.Euler(90, 0, 0);
            var pilot = Primitive("Circuit pilot", PrimitiveType.Sphere, obj.transform,
                new Vector3(-.071f, .126f, .103f), new Vector3(.022f, .022f, .009f), indicator);
            control.Indicator = pilot.GetComponent<Renderer>();
            control.StateLabel = Text(obj.transform, "Circuit state", "ON", new Vector3(.023f, .126f, .089f), .03f);
            Text(obj.transform, "Up position marking", "I", new Vector3(0, .061f, .089f), .025f);
            Text(obj.transform, "Down position marking", "O", new Vector3(0, -.124f, .089f), .025f);
            Primitive("Engraved circuit plate", PrimitiveType.Cube, obj.transform,
                new Vector3(0, .282f, .014f), new Vector3(.36f, .081f, .012f), label);
            Text(obj.transform, "Circuit name", "ROW " + row.RowNumber + " / " + row.RowLabel.ToUpperInvariant(),
                new Vector3(0, .282f, .022f), .026f);
            // Surface conduit visibly supplies each box from the existing wall band.
            var conduit = Primitive("Galvanized circuit conduit", PrimitiveType.Cylinder, obj.transform,
                new Vector3(0, .96f, -.032f), new Vector3(.026f, .745f, .026f), zinc);
            foreach (float y in new[] { .47f, 1.43f })
                Primitive("Conduit saddle", PrimitiveType.Cube, obj.transform,
                    new Vector3(0, y, -.027f), new Vector3(.07f, .03f, .045f), enclosure);
            control.Refresh();
        }

        static GameObject Primitive(string name, PrimitiveType type, Transform parent, Vector3 position, Vector3 size, Material material)
        {
            var obj = GameObject.CreatePrimitive(type);
            obj.name = name;
            obj.transform.SetParent(parent, false);
            obj.transform.localPosition = position;
            obj.transform.localScale = size;
            Object.DestroyImmediate(obj.GetComponent<Collider>());
            var renderer = obj.GetComponent<Renderer>();
            renderer.sharedMaterial = material;
            renderer.receiveShadows = true;
            return obj;
        }

        static TextMesh Text(Transform parent, string name, string text, Vector3 position, float height)
        {
            var obj = new GameObject(name);
            obj.transform.SetParent(parent, false);
            obj.transform.localPosition = position;
            // TextMesh faces along local -Z; south-wall hardware faces into +Z.
            obj.transform.localRotation = Quaternion.Euler(0, 180, 0);
            var mesh = obj.AddComponent<TextMesh>();
            mesh.text = text;
            mesh.fontSize = 80;
            mesh.characterSize = height / 8;
            mesh.anchor = TextAnchor.MiddleCenter;
            mesh.alignment = TextAlignment.Center;
            mesh.color = name == "Circuit name" ? new Color(.025f, .03f, .025f) : new Color(.82f, .83f, .73f);
            if (font != null)
            {
                mesh.font = font;
                obj.GetComponent<MeshRenderer>().sharedMaterial = font.material;
            }
            obj.GetComponent<MeshRenderer>().shadowCastingMode = ShadowCastingMode.Off;
            return mesh;
        }

        public static string Validate()
        {
            var root = GameObject.Find(RootName);
            if (root == null) throw new Exception("Switchable warehouse lighting is missing.");
            var rows = root.GetComponentsInChildren<WarehouseLightRow>();
            var switches = root.GetComponentsInChildren<WarehouseLightSwitch>();
            if (rows.Length != 3 || switches.Length != 3) throw new Exception("Expected three lighting circuits and three wall switches.");
            foreach (var row in rows)
            {
                if (row.FixtureLights.Length != 4 || row.Diffusers.Length != 4) throw new Exception("Each circuit needs four lamps and four diffusers.");
                if (switches.Count(s => s.Row == row) != 1) throw new Exception("Each lighting row must have exactly one wall switch.");
                foreach (var light in row.FixtureLights)
                    if (light == null || light.type != LightType.Spot || light.shadows == LightShadows.None ||
                        light.lightmapBakeType != LightmapBakeType.Realtime || Vector3.Dot(light.transform.forward, Vector3.down) < .99f)
                        throw new Exception("High-bay fixtures need real-time shadowed downward light.");
            }
            var pipeline = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            var renderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(AssetRoot + "Materials/RackLabRenderer.asset");
            if (pipeline == null || !pipeline.supportsAdditionalLightShadows || pipeline.additionalLightsShadowmapResolution < 4096 ||
                renderer == null || renderer.renderingMode != RenderingMode.ForwardPlus)
                throw new Exception("Warehouse lighting needs Forward+ and a 4096 additional-light shadow atlas.");
            return "Three independent four-fixture LED circuits, twelve shadowed high-bay lights, three reachable industrial wall switches and individual emissive diffusers.";
        }
    }
}
