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
    // Deliberately ordinary light-industrial surroundings. Everything is authored
    // once into shared-material mesh chunks; there are no decorative Update loops.
    public static class WarehouseBusinessParkBuilder
    {
        const string Root = "Assets/RackLab/";
        const string Name = "Warehouse business park";
        const string MeshRoot = Root + "Models/BusinessPark/";
        const string MaterialRoot = Root + "Materials/BusinessPark/";
        static float Ground => -ReceivingTruckBuilder.FloorHeight;
        static Material asphalt, concrete, cream, dark, wall, blue, brick, glass, grass, leaf, bark, brown, lens;
        static Transform root;

        [MenuItem("One Shift/Install warehouse business park")]
        public static string Install()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before installing the business park.");
            var scene = SceneManager.GetActiveScene();
            if (scene.path != Root + "Scenes/RackFloor.unity") throw new InvalidOperationException("Open RackFloor.unity first.");
            Directory.CreateDirectory("Temp/BusinessParkBackup");
            EditorSceneManager.SaveScene(scene, "Temp/BusinessParkBackup/RackFloor-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".unity", true);
            InstallIntoScene();
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
            AssetDatabase.SaveAssets();
            return Validate();
        }

        public static void InstallIntoScene()
        {
            Directory.CreateDirectory(MeshRoot);
            Directory.CreateDirectory(MaterialRoot);
            AssetDatabase.Refresh();
            var existing = GameObject.Find(Name);
            if (existing != null) Object.DestroyImmediate(existing);
            root = new GameObject(Name).transform;
            Materials();
            BuildGround();
            BuildLandscape();
            Building("West units", new Vector3(-49, Ground, 4), -90, "MILLER SUPPLY", "04 - 06", blue);
            Building("East units", new Vector3(49, Ground, 6), 90, "PARKSIDE PRINT", "10 - 12", brick);
            Building("Southwest units", new Vector3(-42, Ground, -63), 180, "NORTHLINE PARTS", "01 - 03", brick);
            Building("Southeast units", new Vector3(43, Ground, -63), 180, "FIELD SERVICE", "14 - 16", blue);
            Building("Northwest units", new Vector3(-42, Ground, 88), 0, "COMMERCIAL STORAGE", "07 - 09", blue);
            Building("Northeast units", new Vector3(43, Ground, 88), 0, "PARKSIDE TRADE", "17 - 19", brick);
            BuildVehicles();
            BuildLights();
            foreach (var camera in Object.FindObjectsByType<Camera>(FindObjectsSortMode.None))
            {
                camera.farClipPlane = Mathf.Max(camera.farClipPlane, 180);
                EditorUtility.SetDirty(camera);
            }
            RenderSettings.fogStartDistance = 60;
            RenderSettings.fogEndDistance = 170;
            Physics.SyncTransforms();
            AssetDatabase.SaveAssets();
        }

        static void Materials()
        {
            asphalt = Lit("Warm asphalt", new Color(.17f, .19f, .18f), .04f);
            concrete = Lit("Weathered curb", new Color(.46f, .47f, .42f), .12f);
            cream = Lit("Faded road paint", new Color(.76f, .73f, .61f), .08f);
            dark = Lit("Charcoal fittings", new Color(.075f, .094f, .088f), .14f);
            wall = Lit("Business park stucco", new Color(.55f, .54f, .46f), .08f);
            blue = Lit("Faded green blue fascia", new Color(.21f, .32f, .32f), .14f);
            brick = Lit("Muted clay masonry", new Color(.42f, .27f, .20f), .08f);
            glass = Lit("Opaque storefront glazing", new Color(.15f, .23f, .24f), .42f);
            grass = Lit("Dry verge grass", new Color(.28f, .34f, .20f), .05f);
            leaf = Lit("Faceted olive foliage", new Color(.22f, .30f, .17f), .03f);
            bark = Lit("Tree bark", new Color(.27f, .23f, .17f), .04f);
            brown = Lit("Parcel van brown", new Color(.26f, .19f, .12f), .19f);
            lens = Lit("Warm wall pack lens", new Color(.85f, .76f, .55f), .18f);
            lens.EnableKeyword("_EMISSION"); lens.SetColor("_EmissionColor", new Color(.9f, .6f, .26f));
            lens.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            EditorUtility.SetDirty(lens);
        }

        static void BuildGround()
        {
            var chunk = new Chunk("Roads and forecourt", root);
            // The existing north yard stays a few millimetres above this base.
            chunk.Box("Business park ground", new Vector3(0, Ground - .18f, 12), new Vector3(244, .32f, 238), grass, true);
            chunk.Box("Front visitor parking", new Vector3(0, Ground - .07f, -28), new Vector3(44, .14f, 17), asphalt, true);
            chunk.Box("Front access street", new Vector3(0, Ground - .07f, -39), new Vector3(185, .14f, 11), asphalt, true);
            chunk.Box("North service street", new Vector3(0, Ground - .07f, 68), new Vector3(185, .14f, 11), asphalt, true);
            foreach (float side in new[] { -1f, 1f })
            {
                chunk.Box("Side access drive", new Vector3(side * 27, Ground - .07f, 15), new Vector3(9, .14f, 107), asphalt, true);
                chunk.Box("Warehouse side apron", new Vector3(side * 16.6f, Ground - .07f, .7f), new Vector3(10.2f, .14f, 20.6f), asphalt, true);
                chunk.Box("Front connecting apron", new Vector3(side * 17, Ground - .07f, -15.8f), new Vector3(10, .14f, 10), asphalt, true);
                chunk.Box("Street pavement", new Vector3(side * 63, Ground + .045f, -46), new Vector3(59, .09f, 2.4f), concrete, true);
            }
            // Keep the office landing and ramp reservation clear: x 5.3..7.7,
            // z -12.5..-22. Ground meets the ramp without a raised curb.
            chunk.Box("Front walk", new Vector3(0, Ground + .025f, -23.25f), new Vector3(44, .05f, 2.5f), concrete, true);
            chunk.Box("Front foundation apron", new Vector3(0, Ground - .07f, -16), new Vector3(24, .14f, 12), asphalt, true);
            for (int i = -6; i <= 6; i++)
                chunk.Box("Visitor parking stripe", new Vector3(i * 3, Ground + .008f, -28.3f), new Vector3(.10f, .016f, 5.7f), cream);
            for (int i = -6; i <= 5; i++)
            {
                float x = i * 3 + 1.5f;
                chunk.Box("Parking wheel stop", new Vector3(x, Ground + .075f, -25.1f), new Vector3(1.65f, .15f, .23f), concrete, true);
            }
            foreach (float z in new[] { -39f, 68f })
                for (int i = -8; i <= 8; i++)
                    chunk.Box("Street centre dash", new Vector3(i * 10, Ground + .009f, z), new Vector3(4, .018f, .10f), cream);
            foreach (float x in new[] { -20.5f, 20.5f })
                chunk.Box("Forecourt curb", new Vector3(x, Ground + .1f, -28), new Vector3(.24f, .2f, 6.5f), concrete, true);
            chunk.Finish();
        }

        static void BuildLandscape()
        {
            var chunk = new Chunk("Verge planting and utilities", root);
            foreach (float x in new[] { -18f, 18f })
            {
                chunk.Box("Grass island", new Vector3(x, Ground + .03f, -16.8f), new Vector3(4.5f, .06f, 6.4f), grass);
                foreach (float edge in new[] { -1f, 1f })
                    chunk.Box("Planting curb", new Vector3(x + edge * 2.3f, Ground + .09f, -16.8f), new Vector3(.17f, .18f, 6.6f), concrete, true);
                Tree(chunk, new Vector3(x, Ground, -16.3f), 1.0f);
                for (int i = 0; i < 3; i++) Shrub(chunk, new Vector3(x - 1.5f + i * 1.45f, Ground, -19.3f), .7f);
            }
            foreach (float side in new[] { -1f, 1f })
                for (int i = 0; i < 5; i++)
                    Tree(chunk, new Vector3(side * (77 + (i % 2) * 4), Ground, -28 + i * 23), .95f + i % 3 * .13f);
            foreach (float x in new[] { -18f, 18f }) Tree(chunk, new Vector3(x, Ground, 75.5f), 1.1f);
            chunk.Box("Park directory base", new Vector3(-17.7f, Ground + .3f, -32.8f), new Vector3(4.1f, .6f, .6f), brick, true);
            chunk.Box("Park directory board", new Vector3(-17.7f, Ground + 1.1f, -32.8f), new Vector3(4, 1.3f, .18f), blue, true);
            Label("PARKSIDE BUSINESS PARK", root, new Vector3(-17.7f, Ground + 1.37f, -32.91f), .105f, Quaternion.identity);
            Label("TRADE UNITS  /  01 - 19", root, new Vector3(-17.7f, Ground + .94f, -32.91f), .078f, Quaternion.identity);
            // Small service clutter, placed away from the dock and yard ramp.
            chunk.Box("Utility cabinet", new Vector3(-12.5f, Ground + .8f, 4), new Vector3(.65f, 1.6f, 1.2f), wall, true);
            chunk.Box("Utility cabinet door", new Vector3(-12.84f, Ground + .8f, 4), new Vector3(.025f, 1.32f, .98f), dark);
            chunk.Box("Waste bin", new Vector3(-15.4f, Ground + .65f, 7.2f), new Vector3(1.8f, 1.3f, 1.15f), blue, true);
            chunk.Box("Waste bin lid", new Vector3(-15.4f, Ground + 1.33f, 7.2f), new Vector3(1.9f, .13f, 1.24f), dark);
            chunk.Finish();
        }

        static void Tree(Chunk chunk, Vector3 position, float scale)
        {
            chunk.Box("Tree trunk", position + Vector3.up * 1.3f * scale, new Vector3(.23f, 2.6f, .23f) * scale, bark, true);
            chunk.Crown(position + new Vector3(0, 3.4f, 0) * scale, new Vector3(1.7f, 2.0f, 1.5f) * scale, leaf);
            chunk.Crown(position + new Vector3(.7f, 3.0f, .3f) * scale, new Vector3(1.3f, 1.25f, 1.2f) * scale, leaf);
        }

        static void Shrub(Chunk chunk, Vector3 position, float size)
        {
            chunk.Crown(position + Vector3.up * .55f * size, new Vector3(.85f, .65f, .7f) * size, leaf);
        }

        static void Building(string name, Vector3 position, float rotation, string tenant, string numbers, Material fascia)
        {
            var node = new GameObject(name).transform; node.SetParent(root, false);
            node.localPosition = position; node.localRotation = Quaternion.Euler(0, rotation, 0);
            var c = new Chunk(name, node);
            c.Box("Unit shell", new Vector3(0, 3.1f, 0), new Vector3(28, 6.2f, 18), wall, true);
            c.Box("Dark roof", new Vector3(0, 6.27f, 0), new Vector3(28.4f, .14f, 18.4f), dark);
            c.Box("Low masonry band", new Vector3(0, .65f, -9.06f), new Vector3(28.1f, 1.3f, .14f), brick);
            c.Box("Fascia", new Vector3(0, 4.8f, -9.12f), new Vector3(28.2f, 1.25f, .24f), fascia);
            c.Box("Forecourt", new Vector3(0, .005f, -13.1f), new Vector3(29, .09f, 8), asphalt, true);
            c.Box("Unit pavement", new Vector3(0, .065f, -10.0f), new Vector3(28.5f, .13f, 1.65f), concrete, true);
            foreach (float bay in new[] { -9f, 0f, 9f })
            {
                c.Box("Roller shutter", new Vector3(bay - 1.3f, 1.85f, -9.15f), new Vector3(4.6f, 3.7f, .1f), concrete);
                for (int seam = 1; seam < 10; seam++)
                    c.Box("Shutter seam", new Vector3(bay - 1.3f, seam * .36f, -9.21f), new Vector3(4.6f, .035f, .025f), dark);
                c.Box("Shopfront window", new Vector3(bay + 2.65f, 2.1f, -9.16f), new Vector3(2.1f, 2.15f, .12f), glass);
                c.Box("Shopfront mullion", new Vector3(bay + 2.65f, 2.1f, -9.23f), new Vector3(.06f, 2.2f, .05f), cream);
                c.Box("Shopfront lintel", new Vector3(bay + 2.65f, 3.2f, -9.23f), new Vector3(2.2f, .07f, .05f), cream);
                c.Box("Service door", new Vector3(bay + 4.1f, 1.13f, -9.17f), new Vector3(.75f, 2.25f, .1f), fascia);
                c.Box("Roof ventilator", new Vector3(bay, 6.65f, 1.6f), new Vector3(1.8f, .65f, 2.3f), concrete);
                c.Box("Ventilator cap", new Vector3(bay, 7.0f, 1.6f), new Vector3(1.9f, .10f, 2.4f), dark);
                for (int stripe = 0; stripe < 3; stripe++)
                    c.Box("Unit parking stripe", new Vector3(bay - 3 + stripe * 3, .063f, -13.6f), new Vector3(.09f, .018f, 4.3f), cream);
            }
            Label(tenant, node, new Vector3(-2, 4.95f, -9.27f), .22f, Quaternion.identity);
            Label(numbers, node, new Vector3(10.8f, 4.95f, -9.27f), .20f, Quaternion.identity);
            c.Finish();
        }

        static void BuildVehicles()
        {
            var c = new Chunk("Parked vehicles", root);
            Vector3 p = new Vector3(12, Ground, -28.5f);
            c.Box("Parcel van lower body", p + new Vector3(0, .75f, 0), new Vector3(2.05f, 1.05f, 5.35f), brown, true);
            c.Box("Parcel van cargo box", p + new Vector3(0, 1.64f, -.55f), new Vector3(2.02f, 1.0f, 3.95f), brown, true);
            c.Box("Parcel van cab", p + new Vector3(0, 1.53f, 1.51f), new Vector3(1.93f, 1.08f, 1.58f), cream, true);
            c.Box("Parcel van windscreen", p + new Vector3(0, 1.68f, 2.315f), new Vector3(1.67f, .62f, .025f), glass);
            c.Box("Parcel van grille", p + new Vector3(0, .64f, 2.70f), new Vector3(1.75f, .30f, .045f), dark);
            foreach (float side in new[] { -1f, 1f })
            {
                c.Box("Parcel van side glass", p + new Vector3(side * .978f, 1.72f, 1.53f), new Vector3(.03f, .57f, 1.14f), glass);
                c.Box("Parcel van cream stripe", p + new Vector3(side * 1.024f, 1.42f, -.6f), new Vector3(.025f, .23f, 3.75f), cream);
                c.Box("Parcel van headlamp", p + new Vector3(side * .73f, .98f, 2.69f), new Vector3(.39f, .20f, .045f), cream);
                foreach (float z in new[] { -1.85f, 1.8f })
                    c.Wheel(p + new Vector3(side * 1.025f, .36f, z), .36f, .22f, dark);
            }
            Label("PARCEL SERVICE", root, p + new Vector3(-1.044f, 1.75f, -.55f), .12f, Quaternion.Euler(0, 90, 0));
            foreach (var car in new[] { new Vector3(-10.5f, Ground, -28.2f), new Vector3(-4.5f, Ground, -28.5f) })
            {
                c.Box("Parked hatchback", car + Vector3.up * .62f, new Vector3(1.8f, .64f, 4.05f), blue, true);
                c.Box("Hatchback cabin", car + new Vector3(0, 1.12f, -.1f), new Vector3(1.59f, .58f, 2.2f), glass, true);
                c.Box("Hatchback roof", car + new Vector3(0, 1.43f, -.1f), new Vector3(1.61f, .10f, 2.25f), blue);
                foreach (float side in new[] { -1f, 1f }) foreach (float z in new[] { -1.28f, 1.3f })
                    c.Wheel(car + new Vector3(side * .91f, .30f, z), .30f, .19f, dark);
            }
            c.Finish();
        }

        static void BuildLights()
        {
            var c = new Chunk("Warehouse exterior fittings", root);
            var circuit = root.gameObject.AddComponent<WarehouseExteriorLights>();
            circuit.clock = Object.FindFirstObjectByType<WarehouseDayNight>();
            var lights = new List<Light>();
            Action<Vector3, Vector3> fixture = (position, outward) =>
            {
                Quaternion facing = Quaternion.LookRotation(outward, Vector3.up);
                c.Box("Wall pack housing", position, new Vector3(.55f, .38f, .20f), dark, false, facing);
                c.Box("Wall pack diffuser", position + outward * .115f - Vector3.up * .06f, new Vector3(.43f, .20f, .045f), lens, false, facing);
                var lightNode = new GameObject("Downward exterior wall pack"); lightNode.transform.SetParent(root, false);
                lightNode.transform.position = position + outward * .20f - Vector3.up * .13f;
                lightNode.transform.rotation = Quaternion.LookRotation(outward * .24f - Vector3.up * .97f);
                var light = lightNode.AddComponent<Light>(); light.type = LightType.Spot;
                light.color = new Color(1, .77f, .48f); light.intensity = circuit.intensity;
                light.range = 10; light.spotAngle = 90; light.innerSpotAngle = 60;
                light.shadows = LightShadows.None; light.lightmapBakeType = LightmapBakeType.Realtime;
                light.renderMode = LightRenderMode.Auto; lights.Add(light);
            };
            fixture(new Vector3(6.5f, 2.65f, -10.35f), Vector3.back);
            fixture(new Vector3(-8f, 3.1f, -10.3f), Vector3.back);
            fixture(new Vector3(-5.7f, 3.5f, 12.3f), Vector3.forward);
            fixture(new Vector3(5.7f, 3.5f, 12.3f), Vector3.forward);
            fixture(new Vector3(-11.8f, 3.0f, 0), Vector3.left);
            fixture(new Vector3(11.8f, 3.0f, 0), Vector3.right);
            c.Finish();
            circuit.fixtures = lights.ToArray();
            circuit.lenses = c.Renderers.Where(r => r.sharedMaterial == lens).Cast<Renderer>().ToArray();
            circuit.Refresh(true); EditorUtility.SetDirty(circuit);
        }

        public static string Validate()
        {
            var park = GameObject.Find(Name);
            if (park == null) throw new Exception("Business park is missing.");
            var exterior = park.GetComponent<WarehouseExteriorLights>();
            if (exterior == null || exterior.fixtures.Length != 6 || exterior.fixtures.Any(f => f == null || f.shadows != LightShadows.None))
                throw new Exception("The exterior must use six unshadowed fixtures.");
            int triangles = park.GetComponentsInChildren<MeshFilter>().Sum(m => m.sharedMesh.triangles.Length / 3);
            int renderers = park.GetComponentsInChildren<MeshRenderer>().Count(r => r.GetComponent<TextMesh>() == null);
            if (triangles > 18000 || renderers > 100) throw new Exception("Business park exceeded its geometry budget.");
            foreach (var filter in park.GetComponentsInChildren<MeshFilter>())
                if (string.IsNullOrEmpty(AssetDatabase.GetAssetPath(filter.sharedMesh))) throw new Exception("Unsaved business park mesh.");
            // This is the office's accessible ramp reservation. Decorative props
            // may not occupy its standing clearance at any point along the slope.
            foreach (var collider in park.GetComponentsInChildren<Collider>())
            {
                if (collider.bounds.max.y <= Ground + .06f) continue;
                if (collider.bounds.Intersects(new Bounds(new Vector3(6.5f, .3f, -17.3f), new Vector3(2.4f, 3.2f, 9.5f))))
                    throw new Exception("Business park obstructs the office ramp: " + collider.name);
            }
            string report = "PASS Six surrounding business units, visitor parking, roads, planted verges and a parcel van.\n" +
                "PASS Office ramp reservation and existing north receiving yard preserved.\n" +
                "PASS Six clock-linked exterior spotlights; no additional shadow maps or reflection probes.\n" +
                "PASS " + triangles + " static triangles in " + renderers + " material mesh chunks.\n";
            Directory.CreateDirectory(Root + "Reports");
            File.WriteAllText(Root + "Reports/warehouse-business-park-validation.txt", report);
            Debug.Log(report); return report;
        }

        static Material Lit(string name, Color color, float smoothness)
        {
            string path = MaterialRoot + name.Replace(" ", "") + ".mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null) { material = new Material(Shader.Find("Universal Render Pipeline/Lit")); AssetDatabase.CreateAsset(material, path); }
            material.name = name; material.enableInstancing = true;
            material.SetColor("_BaseColor", color); material.SetFloat("_Metallic", 0); material.SetFloat("_Smoothness", smoothness);
            WarehouseSurfaceRepair.UseMatteReflections(material); EditorUtility.SetDirty(material); return material;
        }

        static void Label(string text, Transform parent, Vector3 position, float size, Quaternion rotation)
        {
            var node = new GameObject(text); node.transform.SetParent(parent, false);
            node.transform.localPosition = position; node.transform.localRotation = rotation;
            var label = node.AddComponent<TextMesh>(); label.text = text;
            label.font = Resources.Load<Font>("RackLabFont"); label.fontSize = 80; label.characterSize = size / 8;
            label.anchor = TextAnchor.MiddleCenter; label.alignment = TextAlignment.Center; label.color = new Color(.85f, .81f, .69f);
            node.GetComponent<MeshRenderer>().sharedMaterial = label.font.material;
        }

        sealed class Chunk
        {
            readonly string name;
            readonly Transform parent;
            readonly Dictionary<Material, Geometry> geometry = new Dictionary<Material, Geometry>();
            public readonly List<MeshRenderer> Renderers = new List<MeshRenderer>();
            public Chunk(string name, Transform parent) { this.name = name; this.parent = parent; }
            Geometry For(Material material)
            {
                if (!geometry.TryGetValue(material, out var value)) geometry[material] = value = new Geometry();
                return value;
            }
            public void Box(string label, Vector3 center, Vector3 size, Material material, bool solid = false, Quaternion? rotation = null)
            {
                Quaternion turn = rotation ?? Quaternion.identity;
                For(material).Cube(Matrix4x4.TRS(center, turn, size));
                if (!solid) return;
                var node = new GameObject(label); node.transform.SetParent(parent, false);
                node.transform.localPosition = center; node.transform.localRotation = turn;
                node.AddComponent<BoxCollider>().size = size; node.isStatic = true;
            }
            public void Crown(Vector3 center, Vector3 size, Material material) => For(material).Crown(center, size);
            public void Wheel(Vector3 center, float radius, float width, Material material) => For(material).Wheel(center, radius, width);
            public void Finish()
            {
                foreach (var pair in geometry)
                {
                    string label = name + " " + pair.Key.name;
                    var mesh = pair.Value.Mesh(label);
                    string path = MeshRoot + label.Replace(" ", "") + ".asset";
                    var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
                    if (existing == null) AssetDatabase.CreateAsset(mesh, path);
                    else
                    {
                        // Retain the GUID and explicitly replace the native buffers.
                        var vertices = mesh.vertices; var normals = mesh.normals; var triangles = mesh.triangles;
                        existing.Clear();
                        existing.vertices = vertices; existing.normals = normals; existing.triangles = triangles;
                        existing.RecalculateBounds();
                        existing.UploadMeshData(false);
                        Object.DestroyImmediate(mesh); mesh = existing; EditorUtility.SetDirty(mesh);
                    }
                    var node = new GameObject(label); node.transform.SetParent(parent, false); node.isStatic = true;
                    node.AddComponent<MeshFilter>().sharedMesh = mesh;
                    var renderer = node.AddComponent<MeshRenderer>(); renderer.sharedMaterial = pair.Key;
                    renderer.receiveShadows = true;
                    renderer.shadowCastingMode = pair.Key == lens || pair.Key == glass ? ShadowCastingMode.Off : ShadowCastingMode.On;
                    Renderers.Add(renderer);
                }
            }
        }

        sealed class Geometry
        {
            readonly List<Vector3> vertices = new List<Vector3>();
            readonly List<int> indices = new List<int>();
            static readonly Vector3[] corners = {
                new Vector3(-.5f,-.5f,-.5f), new Vector3(.5f,-.5f,-.5f), new Vector3(.5f,.5f,-.5f), new Vector3(-.5f,.5f,-.5f),
                new Vector3(-.5f,-.5f,.5f), new Vector3(.5f,-.5f,.5f), new Vector3(.5f,.5f,.5f), new Vector3(-.5f,.5f,.5f) };
            static readonly int[] faces = { 0,3,2,1, 4,5,6,7, 0,4,7,3, 1,2,6,5, 0,1,5,4, 3,7,6,2 };
            void Triangle(Vector3 a, Vector3 b, Vector3 c)
            {
                int first = vertices.Count; vertices.Add(a); vertices.Add(b); vertices.Add(c);
                indices.Add(first); indices.Add(first + 1); indices.Add(first + 2);
            }
            public void Cube(Matrix4x4 matrix)
            {
                for (int face = 0; face < 6; face++)
                {
                    int first = vertices.Count;
                    for (int corner = 0; corner < 4; corner++) vertices.Add(matrix.MultiplyPoint3x4(corners[faces[face * 4 + corner]]));
                    foreach (int index in new[] { 0,1,2,0,2,3 }) indices.Add(first + index);
                }
            }
            public void Crown(Vector3 center, Vector3 size)
            {
                const int sides = 7;
                for (int i = 0; i < sides; i++)
                {
                    float a = i * Mathf.PI * 2 / sides, b = (i + 1) * Mathf.PI * 2 / sides;
                    var lowA = center + Vector3.Scale(new Vector3(Mathf.Cos(a) * .75f, -.3f, Mathf.Sin(a) * .75f), size);
                    var lowB = center + Vector3.Scale(new Vector3(Mathf.Cos(b) * .75f, -.3f, Mathf.Sin(b) * .75f), size);
                    var highA = center + Vector3.Scale(new Vector3(Mathf.Cos(a), .27f, Mathf.Sin(a)), size);
                    var highB = center + Vector3.Scale(new Vector3(Mathf.Cos(b), .27f, Mathf.Sin(b)), size);
                    Triangle(lowA, highA, highB); Triangle(lowA, highB, lowB);
                    Triangle(highA, center + Vector3.up * size.y, highB);
                    Triangle(lowA, lowB, center - Vector3.up * size.y * .6f);
                }
            }
            public void Wheel(Vector3 center, float radius, float width)
            {
                const int sides = 10;
                for (int i = 0; i < sides; i++)
                {
                    float a = i * Mathf.PI * 2 / sides, b = (i + 1) * Mathf.PI * 2 / sides;
                    var left = center - Vector3.right * width * .5f; var right = center + Vector3.right * width * .5f;
                    var da = new Vector3(0, Mathf.Cos(a) * radius, Mathf.Sin(a) * radius);
                    var db = new Vector3(0, Mathf.Cos(b) * radius, Mathf.Sin(b) * radius);
                    Triangle(left, left + db, left + da); Triangle(right, right + da, right + db);
                    Triangle(left + da, left + db, right + db); Triangle(left + da, right + db, right + da);
                }
            }
            public Mesh Mesh(string name)
            {
                var mesh = new Mesh { name = name, indexFormat = vertices.Count > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
                mesh.SetVertices(vertices); mesh.SetTriangles(indices, 0); mesh.RecalculateNormals(); mesh.RecalculateBounds(); return mesh;
            }
        }
    }
}
