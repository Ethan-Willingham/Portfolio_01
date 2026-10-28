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
    public static class WarehouseStartBuilder
    {
        const string Root = "Assets/RackLab/";
        const string Name = "Warehouse receiving start";
        const string MeshPath = Root + "Models/Receiving/";
        static Material concrete, steel, panel, rubber, safety, wood, cream;
        static Transform root;

        public static string RefreshRoadTiming()
        {
            if(EditorApplication.isPlaying)throw new InvalidOperationException("Stop Play before updating the saved route timing.");
            var receiving=Object.FindFirstObjectByType<WarehouseReceiving>();
            if(receiving==null)throw new Exception("Receiving start missing.");
            receiving.arrivalSeconds=WarehouseTruckRoute.ArrivalDuration;
            receiving.departureSeconds=WarehouseTruckRoute.DepartureDuration;
            EditorUtility.SetDirty(receiving);
            EditorSceneManager.MarkSceneDirty(SceneManager.GetActiveScene());
            EditorSceneManager.SaveScene(SceneManager.GetActiveScene());
            return "Street arrival "+receiving.arrivalSeconds.ToString("F2")+" s; departure "+receiving.departureSeconds.ToString("F2")+" s.";
        }

        [MenuItem("One Shift/Install receiving warehouse start")]
        public static string Install()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before installing the receiving start.");
            var scene = SceneManager.GetActiveScene();
            if (scene.path != Root + "Scenes/RackFloor.unity") throw new InvalidOperationException("Open RackFloor.unity first.");
            if (Object.FindFirstObjectByType<ForkliftDriveController>() == null) throw new InvalidOperationException("Install the physical forklift first.");
            Directory.CreateDirectory("Temp/ReceivingBackup");
            EditorSceneManager.SaveScene(scene, "Temp/ReceivingBackup/RackFloor-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".unity", true);
            Directory.CreateDirectory(MeshPath);
            Directory.CreateDirectory(Root + "Materials/Receiving");
            AssetDatabase.Refresh();
            var old = GameObject.Find(Name);
            if (old != null) Object.DestroyImmediate(old);
            root = new GameObject(Name).transform;
            var receiving = root.gameObject.AddComponent<WarehouseReceiving>();
            RetireDisplays();
            // Retain the existing authored lighting, rebuilding only its shell
            // meshes to cut a real north opening. Installers detect this marker.
            WarehouseEnvironmentBuilder.InstallIntoScene();
            Materials();
            BuildYard(receiving);
            var row = BuildStorage();
            receiving.storagePositions = row.GetComponentsInChildren<PalletRackBay>().SelectMany(b => b.palletPositions).ToArray();
            BuildDelivery(receiving);
            var walking = Object.FindFirstObjectByType<RackWalkController>();
            walking.walkSpeed = 2.8f; walking.runSpeed = 5.4f;
            EditorUtility.SetDirty(walking);
            Physics.SyncTransforms();
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
            AssetDatabase.SaveAssets();
            return Validate();
        }

        static void RetireDisplays()
        {
            var names = new[] { "Original green racks", "Four pallet finishes - full size", "Physical pallet handling examples", "Connected pallet rack - three bays", "Forklift aisle boundary", "FORKLIFT AISLE", "ONE SHIFT", "STORAGE / 01" };
            foreach (var item in SceneManager.GetActiveScene().GetRootGameObjects())
                if (names.Contains(item.name)) Object.DestroyImmediate(item);
            var trial = GameObject.Find("Forklift driving trial");
            if (trial != null)
            {
                foreach (Transform child in trial.transform.Cast<Transform>().ToArray())
                    if (child.GetComponent<ForkliftDriveController>() == null) Object.DestroyImmediate(child.gameObject);
                trial.name = "Warehouse forklift parking";
            }
            // Previous starter installation leaves this renamed wrapper intact.
            var forklift = Object.FindFirstObjectByType<ForkliftDriveController>();
            forklift.transform.position = ForkliftBuilder.ParkingPosition;
            forklift.transform.rotation = Quaternion.identity;
        }

        static void Materials()
        {
            concrete = AssetDatabase.LoadAssetAtPath<Material>(Root + "Materials/Environment/Concreteplinth.mat");
            if (concrete == null) concrete = AssetDatabase.LoadAssetAtPath<Material>(Root + "Materials/Concrete.mat");
            steel = AssetDatabase.LoadAssetAtPath<Material>(Root + "Materials/Environment/Charcoalstructuralsteel.mat");
            panel = AssetDatabase.LoadAssetAtPath<Material>(Root + "Materials/Environment/Warmgalvanizedwallpanels.mat");
            rubber = AssetDatabase.LoadAssetAtPath<Material>(Root + "Materials/Environment/Windowgaskets.mat");
            safety = AssetDatabase.LoadAssetAtPath<Material>(Root + "Materials/Environment/Columnprotectionochre.mat");
            wood = AssetDatabase.LoadAssetAtPath<Material>(Root + "Materials/01_Fresh_Pine.mat");
            cream = AssetDatabase.LoadAssetAtPath<Material>(Root + "Materials/Forklift/Forklift___cream_labels.mat");
        }

        static void BuildYard(WarehouseReceiving receiving)
        {
            var yard = Child("Parking lot and receiving dock", root);
            var asphalt = Lit("Yard asphalt", new Color(.19f, .21f, .19f), 0, .12f);
            float ground = -ReceivingTruckBuilder.FloorHeight;
            Box("Parking lot", yard, new Vector3(0, ground - .15f, 35.5f), new Vector3(45, .30f, 49), asphalt);
            Box("Raised warehouse foundation", yard, new Vector3(0, -.78f, 1), new Vector3(23, 1.3f, 22), concrete);
            foreach(float side in new[]{-1f,1f})
                Box("Receiving apron side",yard,new Vector3(side*6.3625f,-.65f,12.45f),new Vector3(10.275f,1.3f,.9f),concrete);
            Box("Receiving apron threshold",yard,new Vector3(0,-.65f,12.095f),new Vector3(2.45f,1.3f,.19f),concrete);
            // Recess the bridge seat. Its old full-width top coincided exactly
            // with the steel plate over .71 m of depth, producing dock flicker.
            Box("Recessed dock plate seat",yard,new Vector3(0,-.70f,12.545f),new Vector3(2.45f,1.2f,.71f),concrete);
            // The ramp joins apron and yard without a step. Its long slope also
            // gives the player an ordinary walking route to the parking lot.
            float rampAngle = Mathf.Atan2(ReceivingTruckBuilder.FloorHeight, 11.2f);
            var ramp = Box("Yard access ramp", yard, new Vector3(8.6f, ground * .5f - .1f * Mathf.Cos(rampAngle), 18.4f),
                new Vector3(3.5f, .20f, Mathf.Sqrt(11.2f * 11.2f + ground * ground)), concrete);
            ramp.localRotation = Quaternion.Euler(rampAngle * Mathf.Rad2Deg, 0, 0);
            for (int i = -3; i <= 3; i++)
            {
                float x = i * 2.9f;
                if (Mathf.Abs(x) < 4) continue;
                Box("Parking space line", yard, new Vector3(x, ground + .006f, 36.3f), new Vector3(.085f, .012f, 5.4f), cream, false);
            }
            Box("Parking end line", yard, new Vector3(0, ground + .006f, 39), new Vector3(23, .012f, .085f), cream, false);
            foreach (float side in new[] { -1f, 1f })
            {
                Box("Backing lane", yard, new Vector3(side * 1.8f, ground + .01f, 32), new Vector3(.09f, .014f, 38), safety, false);
                if(side<0) Box("Yard curb", yard, new Vector3(-22.35f, ground + .12f, 35.5f), new Vector3(.3f, .24f, 49), concrete);
                else Box("Yard curb", yard, new Vector3(22.35f, ground + .12f, 16), new Vector3(.3f, .24f, 10), concrete);
                Box("Receiving jamb", yard, new Vector3(side * 2.15f, 2.55f, 11.93f), new Vector3(.24f, 5.1f, .36f), steel);
                Box("Dock bumper", yard, new Vector3(side * 1.6f, -.47f, 13.01f), new Vector3(.30f, .92f, .24f), rubber);
                Box("Door guard", yard, new Vector3(side * 2.25f, .55f, 11.45f), new Vector3(.28f, 1.1f, .28f), safety);
                // Protect the raised edge, leaving the trailer and access ramp clear.
                float x = side < 0 ? -7.1f : 4.7f;
                float width = side < 0 ? 7.9f : 3.2f;
                foreach (float y in new[] { .5f, 1.03f }) Box("Apron safety rail", yard, new Vector3(x, y, 12.76f), new Vector3(width, .065f, .065f), safety);
                for (float railX = x - width * .5f; railX <= x + width * .5f + .01f; railX += width * .5f)
                    Box("Apron rail post", yard, new Vector3(railX, .52f, 12.76f), new Vector3(.075f, 1.04f, .075f), safety);
            }
            Box("Receiving lintel", yard, new Vector3(0, 4.96f, 11.98f), new Vector3(4.45f, .7f, .3f), panel);
            // This independent doorway reaches the yard even while a delivery
            // occupies the dock. The trailer doors must not trap the player.
            foreach (float x in new[] { 7.62f, 9.58f })
                Box("Yard doorway jamb", yard, new Vector3(x, 1.2f, 11.98f), new Vector3(.16f, 2.4f, .3f), steel);
            Box("Yard doorway lintel", yard, new Vector3(8.6f, 2.47f, 11.98f), new Vector3(2.12f, .14f, .3f), steel);
            Box("Yard doorway masonry header", yard, new Vector3(8.6f, 2.88f, 12), new Vector3(2, .64f, .24f), concrete);
            Box("Yard doorway structural post", yard, new Vector3(10.2f, 4, 11.72f), new Vector3(.22f, 8, .25f), steel);
            Label("YARD", yard, new Vector3(8.6f, 2.84f, 11.80f), .12f);
            // The east drive feeds a wide swept truck entrance. The north
            // opening gives a full-length tractor/trailer room to pull straight
            // before reversing. No truck path crosses a curb or a closed fence.
            Fence(yard, new Vector3(-22.35f, ground, 11.1f), new Vector3(-22.35f, ground, 59.8f));
            Fence(yard, new Vector3(22.35f, ground, 11.1f), new Vector3(22.35f, ground, 21));
            Fence(yard, new Vector3(-22.35f, ground, 11.1f), new Vector3(-11.5f, ground, 11.1f));
            Fence(yard, new Vector3(11.5f, ground, 11.1f), new Vector3(22.35f, ground, 11.1f));
            Label("RECEIVING / 01", yard, new Vector3(0, 4.45f, 11.70f), .16f);
            Label("PARKING", yard, new Vector3(-9, ground + .03f, 40.4f), .25f, Quaternion.Euler(90, 0, 0));
            for (int i = 0; i < 3; i++)
            {
                Box("Receiving lane mark", yard, new Vector3(-1.9f, .009f, 5.2f + i * 1.3f), new Vector3(.07f, .01f, .65f), safety, false);
                Box("Receiving lane mark", yard, new Vector3(1.9f, .009f, 5.2f + i * 1.3f), new Vector3(.07f, .01f, .65f), safety, false);
            }
            receiving.shutter = Child("Receiving overhead door", root);
            receiving.shutter.localPosition = new Vector3(0, 4.0f, 11.91f);
            Box("Shutter", receiving.shutter, new Vector3(0, 2.15f, 0), new Vector3(4.05f, 4.3f, .11f), panel);
            for (float y = .2f; y < 4.3f; y += .24f) Box("Shutter seam", receiving.shutter, new Vector3(0, y, -.065f), new Vector3(4.05f, .02f, .02f), steel, false);
            var barrier = Child("Receiving interlock", root);
            barrier.localPosition = new Vector3(0, 1.5f, 11.82f);
            var barrierCollider = barrier.gameObject.AddComponent<BoxCollider>();
            barrierCollider.size = new Vector3(4.1f, 3, .08f);
            foreach (float y in new[] { -.9f, -.4f }) Box("Receiving barrier rail", barrier, new Vector3(0, y, 0), new Vector3(4.05f, .065f, .065f), safety, false);
            Label("WAIT FOR DOORS", barrier, new Vector3(0, -.65f, -.045f), .10f);
            receiving.dockBarrier = barrierCollider;
            receiving.dockPlate = Box("Dock bridge plate", root, new Vector3(0, -.05f, 12.69f), new Vector3(2.45f, .10f, 1.0f), steel).gameObject;
            BatchVisuals(yard, "Yard");
            BatchVisuals(receiving.shutter, "Shutter");
        }

        static GameObject BuildStorage()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Root + "Prefabs/ConnectedPalletRackRow.prefab");
            var row = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            row.name = "Starting wall racks";
            PrefabUtility.UnpackPrefabInstance(row, PrefabUnpackMode.Completely, InteractionMode.AutomatedAction);
            row.transform.SetParent(root, false);
            row.transform.SetPositionAndRotation(new Vector3(-10.42f, 0, 3.6f), Quaternion.Euler(0, -90, 0));
            foreach (var bay in row.GetComponentsInChildren<PalletRackBay>())
            {
                foreach (var item in bay.exampleLoads) if (item != null) Object.DestroyImmediate(item);
                bay.exampleLoads = Array.Empty<GameObject>();
            }
            foreach (var label in row.GetComponentsInChildren<TextMesh>()) Object.DestroyImmediate(label.gameObject);
            foreach (var wear in row.GetComponentsInChildren<RackWearVariant>()) Object.DestroyImmediate(wear);
            Label("STORAGE / A01 - A03", root, new Vector3(-9.74f, 5.15f, 3.6f), .14f, Quaternion.Euler(0, -90, 0));
            return row;
        }

        static void BuildDelivery(WarehouseReceiving receiving)
        {
            ReceivingTruckBuilder.Build(receiving, root);
            receiving.deliveryPrefab=AssetDatabase.LoadAssetAtPath<GameObject>(ForkliftHandlingBuilder.SamplePrefabPaths[1]).GetComponent<PalletCargo>();
            receiving.wheelChocks = Child("Parked wheel chocks", root).gameObject;
            foreach (float side in new[] { -1f, 1f })
                foreach (float z in new[] { 14.66f, 15.77f })
                    Box("Wheel chock", receiving.wheelChocks.transform, new Vector3(side * 1.14f, -ReceivingTruckBuilder.FloorHeight + .11f, z), new Vector3(.44f, .22f, .23f), safety);
            receiving.cargo = new PalletCargo[4];
            for (int i = 0; i < receiving.cargo.Length; i++)
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ForkliftHandlingBuilder.SamplePrefabPaths[1]);
                var package = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
                PrefabUtility.UnpackPrefabInstance(package, PrefabUnpackMode.Completely, InteractionMode.AutomatedAction);
                package.name = "Opening delivery pallet " + (i + 1).ToString("00");
                package.transform.SetParent(root, false);
                package.transform.position = new Vector3(0, .014f, 14.35f + 1.8f * i);
                var cargo = package.GetComponent<PalletCargo>();
                cargo.description = "Opening stock " + (i + 1).ToString("00");
                cargo.cargoMass = 425; cargo.ApplyMassProperties();
                foreach (var text in package.GetComponentsInChildren<TextMesh>()) Object.DestroyImmediate(text.gameObject);
                foreach(var node in package.GetComponentsInChildren<Transform>())
                    if(node!=null && node.name=="Package weight tag")Object.DestroyImmediate(node.gameObject);
                receiving.cargo[i] = cargo;
            }
        }

        static void Fence(Transform parent, Vector3 start, Vector3 end)
        {
            Vector3 delta = end - start;
            float length = delta.magnitude;
            var fence = Child("Yard perimeter fence", parent);
            fence.localPosition = (start + end) * .5f;
            fence.localRotation = Quaternion.LookRotation(delta.normalized);
            var collision = fence.gameObject.AddComponent<BoxCollider>();
            collision.center = Vector3.up * .8f;
            collision.size = new Vector3(.13f, 1.6f, length);
            foreach (float height in new[] { .35f, .95f, 1.55f })
                Box("Fence rail", fence, new Vector3(0, height, 0), new Vector3(.055f, .055f, length), steel, false);
            int spans = Mathf.CeilToInt(length / 3.2f);
            for (int i = 0; i <= spans; i++)
                Box("Fence post", fence, new Vector3(0, .82f, -length * .5f + length * i / spans), new Vector3(.075f, 1.64f, .075f), steel, false);
        }

        public static string Validate()
        {
            var receiving = Object.FindFirstObjectByType<WarehouseReceiving>();
            if (receiving == null) throw new Exception("Receiving start missing.");
            var checks = new List<string>();
            Action<bool, string> require = (ok, text) => { if (!ok) throw new Exception(text); checks.Add("PASS " + text); };
            require(receiving.cargo.Length == 4 && receiving.cargo.All(c => c != null && c.TotalMass == 450), "Four opening stock pallets, 450 kg each");
            require(receiving.storagePositions.Length == 18, "Three wall bays provide eighteen physical rack positions");
            require(receiving.roadWheels.Length == 18 && receiving.leftDoor.name == "Rear_Door_L" && receiving.rightDoor.name == "Rear_Door_R", "Original eighteen-wheel model retains its actual wheel and door hierarchy");
            require(receiving.tractorPivot!=null && receiving.steeringPivots.Length==2 && receiving.deliveryPrefab!=null, "Original tractor articulates about its kingpin with two steering pivots and a real repeat-delivery prefab");
            var ceiling = receiving.truck.GetComponentsInChildren<BoxCollider>().First(c => c.name == "Trailer roof");
            require(Mathf.Abs(ceiling.bounds.min.y - ReceivingTruckBuilder.RoofClearance) < .002f, "Original trailer has 2.693 metre roof-bow clearance without scaling");
            require(receiving.cargo.All(c => c.GetComponent<Rigidbody>() != null && !c.GetComponent<Rigidbody>().isKinematic), "All stock starts as dynamic packages; transit restraints are temporary runtime state");
            var shutter = receiving.shutter.gameObject;
            shutter.SetActive(false); receiving.dockBarrier.gameObject.SetActive(false);
            receiving.leftDoor.localRotation = receiving.DoorPose(true, 1);
            receiving.rightDoor.localRotation = receiving.DoorPose(false, 1);
            Physics.SyncTransforms();
            try
            {
                require(!Physics.BoxCast(new Vector3(0, 1.25f, 8), new Vector3(.74f, 1.17f, .1f), Vector3.forward, out _, Quaternion.identity, 5.3f, ~0, QueryTriggerInteraction.Ignore), "Forklift-sized path through actual wall opening and open trailer doors");
                for (float z = 11.5f; z < 13.8f; z += .15f)
                    require(Physics.RaycastAll(new Vector3(0, .6f, z), Vector3.down, .65f, ~0, QueryTriggerInteraction.Ignore)
                        .Where(hit => hit.collider.GetComponentInParent<PalletCargo>() == null)
                        .OrderBy(hit => hit.distance).Take(1).Any(hit => Mathf.Abs(hit.point.y) < .005f), "Continuous flush dock support at z " + z.ToString("F2"));
                require(Physics.Raycast(new Vector3(0, 2, 17), Vector3.down, out var trailerFloor, 2.1f) && Mathf.Abs(trailerFloor.point.y) < .005f, "Trailer deck matches warehouse floor height");
                var route = ValidateYardRoute();
                require(route, "Standing player capsule walks through YARD doorway, across apron, down inclined ramp and onto lot");
                require(GameObject.Find("Physical pallet handling examples") == null && GameObject.Find("Original green racks") == null, "Asset-test displays removed from active start; source prefabs retained");
            }
            finally
            {
                shutter.SetActive(true); receiving.dockBarrier.gameObject.SetActive(true);
                receiving.leftDoor.localRotation = receiving.rightDoor.localRotation = Quaternion.identity;
                Physics.SyncTransforms();
            }
            string report = string.Join("\n", checks) + "\n";
            Directory.CreateDirectory(Root + "Reports");
            File.WriteAllText(Root + "Reports/warehouse-start-validation.txt", report);
            Debug.Log(report);
            return report;
        }

        static bool ValidateYardRoute()
        {
            const float radius = RackWalkController.BodyRadius;
            Vector3 previousLow = Vector3.zero, previousHigh = Vector3.zero;
            bool first = true;
            float previousHeight = 0;
            for (float z = 10.75f; z <= 25; z += .125f)
            {
                if (!Physics.Raycast(new Vector3(8.6f, 2, z), Vector3.down, out var floor, 3.5f, ~0, QueryTriggerInteraction.Ignore)
                    || floor.normal.y < .9f) return false;
                if (!first && Mathf.Abs(floor.point.y - previousHeight) > .25f) return false;
                var low = new Vector3(8.6f, floor.point.y + radius + .025f, z);
                var high = new Vector3(8.6f, floor.point.y + RackWalkController.StandingHeight - radius + .025f, z);
                if (Physics.CheckCapsule(low, high, radius, ~0, QueryTriggerInteraction.Ignore)) return false;
                if (!first)
                {
                    var move = low - previousLow;
                    if (Physics.CapsuleCast(previousLow, previousHigh, radius, move.normalized, move.magnitude, ~0, QueryTriggerInteraction.Ignore)) return false;
                }
                first = false; previousLow = low; previousHigh = high; previousHeight = floor.point.y;
            }
            return true;
        }

        static Transform Child(string name, Transform parent)
        {
            var item = new GameObject(name).transform;
            item.SetParent(parent, false); return item;
        }

        static Transform Box(string name, Transform parent, Vector3 position, Vector3 size, Material material, bool solid = true)
        {
            var item = GameObject.CreatePrimitive(PrimitiveType.Cube); item.name = name;
            item.transform.SetParent(parent, false); item.transform.localPosition = position; item.transform.localScale = size;
            item.GetComponent<Renderer>().sharedMaterial = material;
            if (!solid) Object.DestroyImmediate(item.GetComponent<Collider>());
            return item.transform;
        }

        static void Label(string text, Transform parent, Vector3 position, float size, Quaternion? rotation = null)
        {
            var item = Child(text, parent); item.localPosition = position; item.localRotation = rotation ?? Quaternion.identity;
            var label = item.gameObject.AddComponent<TextMesh>(); label.text = text;
            label.fontSize = 80; label.characterSize = size / 8; label.anchor = TextAnchor.MiddleCenter; label.alignment = TextAlignment.Center;
            label.color = new Color(.91f, .88f, .80f);
            label.font = Resources.Load<Font>("RackLabFont");
            item.GetComponent<MeshRenderer>().sharedMaterial = label.font.material;
        }

        static Material Lit(string name, Color color, float metal, float smooth)
        {
            string path = Root + "Materials/Receiving/" + name.Replace(" ", "") + ".mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null) { material = new Material(Shader.Find("Universal Render Pipeline/Lit")); AssetDatabase.CreateAsset(material, path); }
            material.name = name; material.enableInstancing = true;
            material.SetColor("_BaseColor", color); material.SetFloat("_Metallic", metal); material.SetFloat("_Smoothness", smooth);
            WarehouseSurfaceRepair.UseMatteReflections(material);
            EditorUtility.SetDirty(material); return material;
        }

        static void BatchVisuals(Transform target, string prefix)
        {
            var renderers = target.GetComponentsInChildren<MeshRenderer>().Where(r => r.GetComponent<TextMesh>() == null).ToArray();
            int index = 0;
            foreach (var group in renderers.GroupBy(r => r.sharedMaterial))
            {
                var combine = group.Select(r => new CombineInstance { mesh = r.GetComponent<MeshFilter>().sharedMesh,
                    transform = target.worldToLocalMatrix * r.transform.localToWorldMatrix }).ToArray();
                var mesh = new Mesh { name = prefix + "_" + index, indexFormat = IndexFormat.UInt32 };
                mesh.CombineMeshes(combine, true, true); mesh.RecalculateBounds();
                string path = MeshPath + prefix + "_" + index++ + ".asset";
                var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
                if (existing == null) AssetDatabase.CreateAsset(mesh, path);
                else { EditorUtility.CopySerialized(mesh, existing); Object.DestroyImmediate(mesh); mesh = existing; }
                var item = Child(mesh.name, target);
                item.gameObject.AddComponent<MeshFilter>().sharedMesh = mesh;
                item.gameObject.AddComponent<MeshRenderer>().sharedMaterial = group.Key;
            }
            foreach (var renderer in renderers)
            {
                Object.DestroyImmediate(renderer.GetComponent<MeshFilter>());
                Object.DestroyImmediate(renderer);
            }
        }
    }
}
