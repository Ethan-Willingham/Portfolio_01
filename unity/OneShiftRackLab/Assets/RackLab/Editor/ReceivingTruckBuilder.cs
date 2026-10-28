using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    // Derived runtime import of the owner's original 23 October 18-wheeler.
    // Its proportions, movable source hierarchy and Desktop originals are retained.
    public static class ReceivingTruckBuilder
    {
        const string Root = "Assets/RackLab/";
        const string Source = Root + "Models/18-wheeler.fbx";
        const string Materials = Root + "Materials/ReceivingTruck/";
        const string Meshes = Root + "Models/ReceivingTruck/";
        public const float FloorHeight = 1.3325f;
        public const float RearHinge = 16.0094f;
        public const float RoofClearance = 2.693f;
        static readonly Color[] Colors = {
            new Color(.026f,.105f,.18f),new Color(.82f,.83f,.80f),new Color(.62f,.67f,.7f),new Color(.39f,.44f,.47f),
            new Color(.028f,.038f,.043f),new Color(.018f,.022f,.024f),new Color(.007f,.01f,.012f),new Color(.022f,.065f,.09f),
            new Color(.58f,.018f,.012f),new Color(.95f,.24f,.018f),new Color(.78f,.86f,.84f),new Color(.74f,.67f,.49f),
            new Color(.29f,.17f,.075f),new Color(.36f,.23f,.12f),new Color(.65f,.66f,.59f),new Color(.004f,.006f,.008f)
        };
        static readonly float[] Metals = { .58f,.12f,.88f,.74f,.55f,0,0,.48f,.15f,.1f,.2f,.35f,0,0,.05f,0 };
        static readonly float[] Roughness = { .28f,.46f,.24f,.43f,.5f,.83f,.78f,.16f,.28f,.23f,.17f,.34f,.8f,.8f,.72f,.7f };

        public static void Build(WarehouseReceiving receiving, Transform parent)
        {
            Directory.CreateDirectory(Materials); Directory.CreateDirectory(Meshes); AssetDatabase.Refresh();
            var importer = AssetImporter.GetAtPath(Source) as ModelImporter;
            if (importer == null) throw new InvalidOperationException("The tracked original 18-wheeler FBX is missing.");
            importer.globalScale = 1; importer.bakeAxisConversion = true; importer.isReadable = true;
            importer.importCameras = importer.importLights = importer.importAnimation = false;
            importer.addCollider = false; importer.SaveAndReimport();
            var truck = Child("Original 18-wheeler delivery", parent);
            receiving.dockedPosition = new Vector3(0, -FloorHeight, 13.05f);
            truck.localPosition = receiving.dockedPosition;
            receiving.truck = truck.gameObject.AddComponent<Rigidbody>();
            receiving.truck.isKinematic = true; receiving.truck.mass = 14000;
            receiving.truck.interpolation = RigidbodyInterpolation.Interpolate;
            var axis = Child("Original model forward and rear datum", truck);
            axis.localPosition = new Vector3(0, 0, RearHinge);
            axis.localRotation = Quaternion.Euler(0, 180, 0);
            var visual = Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(Source), axis);
            visual.name = "Owner 18-wheeler source hierarchy";
            var transforms = visual.GetComponentsInChildren<Transform>();
            receiving.leftDoor = transforms.First(t => t.name == "Rear_Door_L");
            receiving.rightDoor = transforms.First(t => t.name == "Rear_Door_R");
            receiving.doorLocalAxis = Vector3.forward;
            receiving.leftDoorOpenDegrees = 270; receiving.rightDoorOpenDegrees = -270;
            receiving.roadWheels = transforms.Where(t => t.name.StartsWith("Wheel_", StringComparison.Ordinal)).ToArray();
            receiving.roadWheelRadius = .505f;
            receiving.steeringPivots = transforms.Where(t => t.name.StartsWith("Steer_Tractor_Steer_", StringComparison.Ordinal)).ToArray();
            var tractor = transforms.First(t => t.name == "Tractor_Root");
            var coupling = transforms.First(t => t.name == "Trailer_Coupling");
            // The trailer frame remains the root motion datum. Rotate the
            // original tractor and its colliders about its real fifth wheel.
            receiving.tractorPivot = Child("Original tractor kingpin articulation", truck);
            receiving.tractorPivot.position = coupling.position;
            tractor.SetParent(receiving.tractorPivot, true);
            receiving.arrivalSeconds = WarehouseTruckRoute.ArrivalDuration;
            receiving.departureSeconds = WarehouseTruckRoute.DepartureDuration;
            if (receiving.roadWheels.Length != 18) throw new Exception("Original truck must retain all eighteen wheel pivots.");
            ConvertMaterials(visual);
            foreach (var door in new[] { receiving.leftDoor, receiving.rightDoor })
            {
                var bounds = door.GetComponent<MeshFilter>().sharedMesh.bounds;
                var collider = door.gameObject.AddComponent<BoxCollider>();
                collider.center = bounds.center; collider.size = bounds.size;
                collider.contactOffset = .001f;
            }
            // Exact source floor and roof-bow dimensions, in the normalized
            // receiving frame. No road-truck scale change or ignored ceiling.
            Collision(truck, "Trailer deck", new Vector3(0, FloorHeight - .06f, 8.1322f), new Vector3(2.432f, .12f, 15.9844f));
            Collision(truck, "Trailer roof", new Vector3(0, FloorHeight + RoofClearance + .044f, 8.1322f), new Vector3(2.46f, .088f, 16.05f));
            foreach (float side in new[] { -1f, 1f })
            {
                Collision(truck, "Trailer side", new Vector3(side * 1.2649f, FloorHeight + 1.35f, 8.1f), new Vector3(.08f, 2.70f, 16.0f));
                Collision(truck, "Trailer rear frame", new Vector3(side * 1.272f, FloorHeight + 1.35f, .069f), new Vector3(.075f, 2.7f, .10f));
            }
            Collision(truck, "Trailer front bulkhead", new Vector3(0, FloorHeight + 1.35f, 16.1744f), new Vector3(2.51f, 2.7f, .08f));
            Collision(truck, "Trailer underframe", new Vector3(0, .95f, 8.1f), new Vector3(2.35f, .45f, 15.9f));
            Collision(truck, "Tractor chassis", new Vector3(0, .77f, RearHinge + 2.05f), new Vector3(1.15f, .65f, 9.0f)).SetParent(receiving.tractorPivot, true);
            Collision(truck, "Tractor cab and sleeper", new Vector3(0, 2.02f, RearHinge + 2.65f), new Vector3(2.16f, 2.0f, 4.0f)).SetParent(receiving.tractorPivot, true);
            Collision(truck, "Tractor long hood", new Vector3(0, 1.7f, RearHinge + 5.45f), new Vector3(1.75f, 1.3f, 2.65f)).SetParent(receiving.tractorPivot, true);
            foreach (var wheel in receiving.roadWheels)
            {
                var tyre = Collision(truck, "Road tyre contact", truck.InverseTransformPoint(wheel.position), new Vector3(.34f, 1.01f, 1.01f));
                if(wheel.IsChildOf(tractor)) tyre.SetParent(receiving.tractorPivot, true);
            }
            BatchFixed(tractor, "Tractor");
            BatchFixed(coupling, "Trailer");
            var floorSocket = transforms.First(t => t.name == "Socket_Cargo_Floor");
            if (Mathf.Abs(floorSocket.position.y - .0005f) > .002f || Mathf.Abs(receiving.leftDoor.position.z - 13.05f) > .002f)
                throw new Exception("Original truck import lost its metre scale or cargo-floor alignment.");
        }

        static void ConvertMaterials(GameObject visual)
        {
            var converted = new Dictionary<Material, Material>();
            foreach (var renderer in visual.GetComponentsInChildren<MeshRenderer>())
            {
                var materials = renderer.sharedMaterials;
                for (int i = 0; i < materials.Length; i++)
                {
                    var source = materials[i];
                    if (!converted.TryGetValue(source, out var material))
                    {
                        int index = int.Parse(source.name.Substring(0, 2)) - 1;
                        string path = Materials + "OwnerTruck" + (index + 1).ToString("00") + ".mat";
                        material = AssetDatabase.LoadAssetAtPath<Material>(path);
                        if (material == null) { material = new Material(Shader.Find("Universal Render Pipeline/Lit")); AssetDatabase.CreateAsset(material, path); }
                        material.name = source.name; material.enableInstancing = true;
                        material.SetColor("_BaseColor", Colors[index]); material.SetFloat("_Metallic", Metals[index]);
                        material.SetFloat("_Smoothness", 1 - Roughness[index]);
                        EditorUtility.SetDirty(material); converted.Add(source, material);
                    }
                    materials[i] = material;
                }
                renderer.sharedMaterials = materials;
            }
        }

        static void BatchFixed(Transform root, string prefix)
        {
            var renderers = root.GetComponentsInChildren<MeshRenderer>().Where(r => !r.name.StartsWith("Wheel_", StringComparison.Ordinal)
                && !r.name.StartsWith("Rear_Door_", StringComparison.Ordinal)).ToArray();
            var groups = new Dictionary<Material, List<CombineInstance>>();
            foreach (var renderer in renderers)
            {
                var mesh = renderer.GetComponent<MeshFilter>().sharedMesh;
                for (int i = 0; i < renderer.sharedMaterials.Length; i++)
                {
                    var material = renderer.sharedMaterials[i];
                    if (!groups.ContainsKey(material)) groups.Add(material, new List<CombineInstance>());
                    groups[material].Add(new CombineInstance { mesh = mesh, subMeshIndex = i,
                        transform = root.worldToLocalMatrix * renderer.transform.localToWorldMatrix });
                }
            }
            foreach (var pair in groups)
            {
                string name = prefix + "_" + pair.Key.name.Substring(0, 2);
                var mesh = new Mesh { name = name, indexFormat = IndexFormat.UInt32 };
                mesh.CombineMeshes(pair.Value.ToArray(), true, true); mesh.RecalculateBounds();
                string path = Meshes + name + ".asset";
                var saved = AssetDatabase.LoadAssetAtPath<Mesh>(path);
                if (saved != null) { EditorUtility.CopySerialized(mesh, saved); Object.DestroyImmediate(mesh); mesh = saved; }
                else AssetDatabase.CreateAsset(mesh, path);
                var group = Child(name, root);
                group.gameObject.AddComponent<MeshFilter>().sharedMesh = mesh;
                group.gameObject.AddComponent<MeshRenderer>().sharedMaterial = pair.Key;
            }
            foreach (var renderer in renderers)
            {
                Object.DestroyImmediate(renderer.GetComponent<MeshFilter>());
                Object.DestroyImmediate(renderer);
            }
        }

        static Transform Child(string name, Transform parent)
        { var item = new GameObject(name).transform; item.SetParent(parent, false); return item; }

        static Transform Collision(Transform parent, string name, Vector3 centre, Vector3 size)
        {
            var item = Child(name, parent); item.localPosition = centre;
            var collider = item.gameObject.AddComponent<BoxCollider>(); collider.size = size; collider.contactOffset = .001f;
            return item;
        }
    }
}
