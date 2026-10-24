using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    public static class ForkliftHandlingBuilder
    {
        const string Root = "Assets/RackLab/";
        const string SampleRootName = "Physical pallet handling examples";
        const string ContactPath = Root + "Materials/Forklift/PalletContact.physicMaterial";
        public static readonly string[] PalletPrefabPaths = {
            Root + "Prefabs/Pallet_01_Fresh_Pine.prefab", Root + "Prefabs/Pallet_02_Working_Wear.prefab",
            Root + "Prefabs/Pallet_03_Split_Battered.prefab", Root + "Prefabs/Pallet_04_Repaired.prefab"
        };
        public static readonly string[] SamplePrefabPaths = {
            Root + "Prefabs/Cargo_Light80.prefab", Root + "Prefabs/Cargo_Working800.prefab",
            Root + "Prefabs/Cargo_Heavy3500.prefab", Root + "Prefabs/Cargo_Offset800.prefab"
        };
        public static readonly float[] SampleMasses = { 80, 800, 3500, 800 };
        static PhysicsMaterial palletContact;
        static Material wood, steel, dark;

        [MenuItem("One Shift/Install physical pallet handling")]
        public static string InstallHandling()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before installing pallet handling.");
            var scene = SceneManager.GetActiveScene();
            if (scene.path != Root + "Scenes/RackFloor.unity") throw new InvalidOperationException("Open RackFloor.unity first.");
            if (!scene.GetRootGameObjects().Any(root => root.GetComponentInChildren<ForkliftDriveController>() != null))
                throw new InvalidOperationException("Install forklift driving first.");
            Directory.CreateDirectory("Temp/ForkliftHandlingBackup");
            EditorSceneManager.SaveScene(scene, "Temp/ForkliftHandlingBackup/RackFloor-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".unity", true);
            PrepareMaterials();
            UpgradePalletPrefabs();
            UpgradeRackPrefab();
            UpgradeForkliftPrefab();
            int rackCount = UpgradeRackLoads(scene.GetRootGameObjects().SelectMany(root => root.GetComponentsInChildren<PalletRackBay>()));
            CreateSamplePrefabs();
            var previous = scene.GetRootGameObjects().Where(o => o.name == SampleRootName).ToArray();
            var samples = new GameObject(SampleRootName);
            Undo.RegisterCreatedObjectUndo(samples, "Install physical pallet handling examples");
            var positions = new[] { new Vector3(-9, .006f, 6.7f), new Vector3(-7, .006f, 6.7f), new Vector3(-5, .006f, 6.7f), new Vector3(-5, .006f, 9.7f) };
            var headings = new[] { 0f, 0f, 0f, 90f };
            var names = new[] { "LIGHT / " + WeightText(80), "WORKING LOAD / " + WeightText(800), "TOO HEAVY / " + WeightText(3500), "OFF CENTRE / " + WeightText(800) };
            for (int i = 0; i < SamplePrefabPaths.Length; i++)
            {
                var source = AssetDatabase.LoadAssetAtPath<GameObject>(SamplePrefabPaths[i]);
                var instance = (GameObject)PrefabUtility.InstantiatePrefab(source, scene);
                instance.transform.SetParent(samples.transform, false);
                instance.transform.SetPositionAndRotation(positions[i], Quaternion.Euler(0, headings[i], 0));
                Vector3 labelPosition = positions[i] + instance.transform.rotation * new Vector3(0, 0, -1.0f);
                labelPosition.y = .013f;
                Label(names[i], samples.transform, labelPosition, instance.transform.rotation * Quaternion.Euler(90, 0, 0), .10f);
            }
            foreach (var old in previous) Undo.DestroyObjectImmediate(old);
            var allCargo = scene.GetRootGameObjects().SelectMany(root => root.GetComponentsInChildren<PalletCargo>()).ToArray();
            foreach (var cargo in allCargo)
            {
                cargo.ApplyMassProperties();
                SetContact(cargo.gameObject);
                EditorUtility.SetDirty(cargo);
                EditorUtility.SetDirty(cargo.GetComponent<Rigidbody>());
            }
            Physics.SyncTransforms();
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
            AssetDatabase.SaveAssets();
            string report = "Installed physical mast handling and " + allCargo.Length + " dynamic pallet packages: " + rackCount +
                " rack pallets and " + (allCargo.Length - rackCount) + " floor packages, including four mass examples (80, 800, 3500, and offset 800 kg). Fork pockets and original pallet art retained.";
            File.WriteAllText(Root + "Reports/forklift-handling-installation.txt", report + "\n");
            Debug.Log(report);
            return report;
        }

        public static GameObject CreateSampleForValidation(int index)
        {
            if (index < 0 || index >= SamplePrefabPaths.Length) throw new ArgumentOutOfRangeException(nameof(index));
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(SamplePrefabPaths[index]);
            if (prefab == null) throw new InvalidOperationException("Install physical pallet handling first.");
            var instance = Object.Instantiate(prefab);
            instance.GetComponent<PalletCargo>().ApplyMassProperties();
            return instance;
        }

        static void PrepareMaterials()
        {
            var contact = new PhysicsMaterial("Pallet contact") { staticFriction = .50f, dynamicFriction = .38f, bounciness = 0,
                frictionCombine = PhysicsMaterialCombine.Average, bounceCombine = PhysicsMaterialCombine.Minimum };
            palletContact = Save(contact, ContactPath);
            wood = AssetDatabase.LoadAssetAtPath<Material>(Root + "Materials/01_Fresh_Pine.mat");
            steel = AssetDatabase.LoadAssetAtPath<Material>(Root + "Materials/Forklift/Forklift___forged_steel.mat");
            dark = AssetDatabase.LoadAssetAtPath<Material>(Root + "Materials/Forklift/Forklift___black_enamel.mat");
            if (wood == null || steel == null || dark == null) throw new InvalidOperationException("Pallet or forklift materials are missing.");
        }

        static void UpgradePalletPrefabs()
        {
            for (int i = 0; i < PalletPrefabPaths.Length; i++)
            {
                var pallet = PrefabUtility.LoadPrefabContents(PalletPrefabPaths[i]);
                try
                {
                    ConfigureCargo(pallet, "Empty pallet", 0, Vector3.zero, Vector3.zero);
                    SetContact(pallet);
                    WeightTag(pallet.transform, WeightText(25), new Vector3(0, .071f, -.618f), .032f);
                    PrefabUtility.SaveAsPrefabAsset(pallet, PalletPrefabPaths[i]);
                }
                finally { PrefabUtility.UnloadPrefabContents(pallet); }
            }
        }

        static void UpgradeForkliftPrefab()
        {
            var truck = PrefabUtility.LoadPrefabContents(ForkliftBuilder.PrefabPath);
            try
            {
                var lift = truck.GetComponent<ForkliftLiftController>() ?? truck.AddComponent<ForkliftLiftController>();
                lift.BuildMechanism(truck.transform);
                lift.Initialize();
                truck.GetComponent<ForkliftDriveController>().Initialize();
                PersistGeneratedMeshes(truck);
                PrefabUtility.SaveAsPrefabAsset(truck, ForkliftBuilder.PrefabPath);
            }
            finally { PrefabUtility.UnloadPrefabContents(truck); }
        }

        static void UpgradeRackPrefab()
        {
            string path = Root + "Prefabs/ConnectedPalletRackRow.prefab";
            var rack = PrefabUtility.LoadPrefabContents(path);
            try
            {
                UpgradeRackLoads(rack.GetComponentsInChildren<PalletRackBay>(true));
                PrefabUtility.SaveAsPrefabAsset(rack, path);
            }
            finally { PrefabUtility.UnloadPrefabContents(rack); }
        }

        static int UpgradeRackLoads(IEnumerable<PalletRackBay> bays)
        {
            int count = 0;
            foreach (var bay in bays)
            foreach (var load in bay.exampleLoads)
            {
                if (load == null) continue;
                RemoveNestedBodies(load);
                bool loaded = load.GetComponentsInChildren<Collider>(true).Any(collider => collider.name == "Cartons");
                ConfigureCargo(load, loaded ? "Strapped warehouse cartons" : "Empty pallet", loaded ? 425 : 0,
                    new Vector3(0, .82365f, 0), new Vector3(.972f, 1.406f, 1.172f));
                SetContact(load);
                WeightTag(load.transform, WeightText(loaded ? 450 : 25),
                    new Vector3(0, loaded ? .45f : .071f, loaded ? -.592f : -.618f), loaded ? .055f : .032f);
                count++;
            }
            return count;
        }

        static void CreateSamplePrefabs()
        {
            for (int i = 0; i < SamplePrefabPaths.Length; i++)
            {
                var package = new GameObject(new[] { "Light crated goods 80 kg", "Strapped cartons 800 kg", "Steel billets 3500 kg", "Offset cartons 800 kg" }[i]);
                try
                {
                    var palletAsset = AssetDatabase.LoadAssetAtPath<GameObject>(PalletPrefabPaths[i == 2 ? 3 : 0]);
                    var pallet = (GameObject)PrefabUtility.InstantiatePrefab(palletAsset);
                    pallet.transform.SetParent(package.transform, false);
                    RemoveNestedBodies(package);
                    Vector3 centre, size;
                    if (i == 0)
                    {
                        size = new Vector3(.72f, .44f, .80f);
                        centre = new Vector3(0, PalletRackBay.PalletHeight + size.y * .5f, 0);
                        BuildCrate(package.transform, centre, size);
                    }
                    else if (i == 2)
                    {
                        size = new Vector3(.88f, .585f, .90f);
                        centre = new Vector3(0, PalletRackBay.PalletHeight + size.y * .5f, 0);
                        BuildSteel(package.transform);
                    }
                    else
                    {
                        float offset = i == 3 ? .18f : 0;
                        var cartons = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(Root + "Prefabs/CartonLoad.prefab"));
                        cartons.transform.SetParent(package.transform, false);
                        cartons.transform.localPosition = new Vector3(offset, 0, 0);
                        centre = new Vector3(offset, .82365f, 0);
                        size = new Vector3(.972f, 1.406f, 1.172f);
                    }
                    ConfigureCargo(package, package.name, SampleMasses[i] - 25, centre, size);
                    SetContact(package);
                    string tag = WeightText(SampleMasses[i]) + (i == 3 ? " / OFFSET" : "");
                    WeightTag(package.transform, tag, new Vector3(centre.x, i == 0 ? .34f : .47f, -size.z * .5f - .007f), .055f);
                    PrefabUtility.SaveAsPrefabAsset(package, SamplePrefabPaths[i]);
                }
                finally { Object.DestroyImmediate(package); }
            }
        }

        static PalletCargo ConfigureCargo(GameObject root, string description, float mass, Vector3 centre, Vector3 dimensions)
        {
            var cargo = root.GetComponent<PalletCargo>() ?? root.AddComponent<PalletCargo>();
            cargo.description = description;
            cargo.palletMass = 25;
            cargo.cargoMass = mass;
            cargo.cargoCentre = centre;
            cargo.cargoDimensions = dimensions;
            cargo.ApplyMassProperties();
            return cargo;
        }

        static void RemoveNestedBodies(GameObject root)
        {
            foreach (var nested in root.GetComponentsInChildren<PalletCargo>(true))
                if (nested.gameObject != root) Object.DestroyImmediate(nested);
            foreach (var nested in root.GetComponentsInChildren<Rigidbody>(true))
                if (nested.gameObject != root) Object.DestroyImmediate(nested);
            foreach (var label in root.GetComponentsInChildren<Transform>(true).Where(t => t.name == "Package weight tag").ToArray())
                Object.DestroyImmediate(label.gameObject);
        }

        static void SetContact(GameObject root)
        {
            foreach (var collider in root.GetComponentsInChildren<Collider>(true))
            {
                collider.sharedMaterial = palletContact;
                collider.contactOffset = .0015f;
            }
        }

        static void BuildCrate(Transform parent, Vector3 centre, Vector3 size)
        {
            var crate = new GameObject("Light timber crate"); crate.transform.SetParent(parent, false);
            var collider = crate.AddComponent<BoxCollider>(); collider.center = centre; collider.size = size;
            for (int row = 0; row < 4; row++)
            {
                float y = PalletRackBay.PalletHeight + .055f + row * .108f;
                foreach (float z in new[] { -.388f, .388f }) VisualBox("Crate face board", crate.transform, new Vector3(0, y, z), new Vector3(.72f, .10f, .024f), wood);
                foreach (float x in new[] { -.348f, .348f }) VisualBox("Crate side board", crate.transform, new Vector3(x, y, 0), new Vector3(.024f, .10f, .752f), wood);
            }
            foreach (float x in new[] { -.31f, .31f }) foreach (float z in new[] { -.35f, .35f })
                VisualBox("Crate corner cleat", crate.transform, new Vector3(x, centre.y, z), new Vector3(.04f, .42f, .04f), wood);
            for (int i = -3; i <= 3; i++) VisualBox("Crate lid board", crate.transform, new Vector3(i * .10f, PalletRackBay.PalletHeight + .428f, 0), new Vector3(.095f, .024f, .8f), wood);
            foreach (float x in new[] { -.24f, .24f }) VisualBox("Crate retaining band", crate.transform, new Vector3(x, centre.y, 0), new Vector3(.022f, .444f, .806f), dark);
        }

        static void BuildSteel(Transform parent)
        {
            for (int i = 0; i < 3; i++)
            {
                float y = PalletRackBay.PalletHeight + .0935f + i * .199f;
                var billet = VisualBox("Dense steel billet", parent, new Vector3(0, y, 0), new Vector3(.88f, .187f, .90f), steel);
                billet.AddComponent<BoxCollider>();
            }
            foreach (float x in new[] { -.31f, .31f }) VisualBox("Steel retaining band", parent, new Vector3(x, PalletRackBay.PalletHeight + .2925f, 0), new Vector3(.022f, .589f, .906f), dark);
        }

        static GameObject VisualBox(string name, Transform parent, Vector3 position, Vector3 size, Material material)
        {
            var node = GameObject.CreatePrimitive(PrimitiveType.Cube); node.name = name;
            Object.DestroyImmediate(node.GetComponent<Collider>());
            node.transform.SetParent(parent, false); node.transform.localPosition = position; node.transform.localScale = size;
            node.GetComponent<Renderer>().sharedMaterial = material;
            return node;
        }

        static void WeightTag(Transform parent, string text, Vector3 position, float size)
        {
            var old = parent.Find("Package weight tag");
            if (old != null) Object.DestroyImmediate(old.gameObject);
            var root = new GameObject("Package weight tag"); root.transform.SetParent(parent, false); root.transform.localPosition = position;
            float width = Mathf.Max(.18f, text.Length * size * .55f);
            VisualBox("Weight plaque", root.transform, Vector3.zero, new Vector3(width + .035f, size * 1.65f, .004f), dark);
            Label(text, root.transform, new Vector3(0, 0, -.003f), Quaternion.identity, size);
        }

        static string WeightText(float kilograms) =>
            Mathf.RoundToInt(kilograms * 2.20462262f).ToString("N0", CultureInfo.InvariantCulture) + " lb / " +
            kilograms.ToString("N0", CultureInfo.InvariantCulture) + " kg";

        static void Label(string value, Transform parent, Vector3 position, Quaternion rotation, float size)
        {
            var node = new GameObject(value); node.transform.SetParent(parent, false);
            node.transform.localPosition = position; node.transform.localRotation = rotation;
            var text = node.AddComponent<TextMesh>(); text.text = value; text.fontSize = 80; text.characterSize = size / 8;
            text.font = Resources.Load<Font>("RackLabFont"); text.anchor = TextAnchor.MiddleCenter; text.alignment = TextAlignment.Center;
            text.color = new Color(.94f, .91f, .81f);
            if (text.font != null) node.GetComponent<MeshRenderer>().sharedMaterial = text.font.material;
        }

        static void PersistGeneratedMeshes(GameObject root)
        {
            var replacements = new Dictionary<Mesh, Mesh>();
            int counter = 0;
            foreach (var filter in root.GetComponentsInChildren<MeshFilter>(true))
            {
                var mesh = filter.sharedMesh;
                if (mesh == null || EditorUtility.IsPersistent(mesh) || (mesh.hideFlags & HideFlags.DontSave) != 0) continue;
                if (!replacements.TryGetValue(mesh, out var saved))
                {
                    string slug = new string(mesh.name.Select(c => char.IsLetterOrDigit(c) ? c : '_').ToArray());
                    saved = Save(Object.Instantiate(mesh), Root + "Models/ForkliftRuntime/Handling_" + counter++ + "_" + slug + ".asset");
                    replacements.Add(mesh, saved);
                }
                filter.sharedMesh = saved;
            }
            foreach (var collider in root.GetComponentsInChildren<MeshCollider>(true))
                if (collider.sharedMesh != null && replacements.TryGetValue(collider.sharedMesh, out var saved)) collider.sharedMesh = saved;
        }

        static T Save<T>(T value, string path) where T : Object
        {
            var old = AssetDatabase.LoadAssetAtPath<T>(path);
            if (old == null) { AssetDatabase.CreateAsset(value, path); return value; }
            EditorUtility.CopySerialized(value, old); Object.DestroyImmediate(value); EditorUtility.SetDirty(old); return old;
        }
    }
}
