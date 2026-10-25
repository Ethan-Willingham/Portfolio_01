using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    public static class WarehouseReceivingValidation
    {
        const string ReportPath = "Assets/RackLab/Reports/warehouse-receiving-validation.txt";
        static readonly MethodInfo StartMethod = Method("Start"), TickMethod = Method("FixedUpdate"), CountMethod = Method("CountStock");
        static MethodInfo Method(string name) => typeof(WarehouseReceiving).GetMethod(name, BindingFlags.Instance | BindingFlags.NonPublic);

        [MenuItem("One Shift/Validate receiving sequence")]
        public static string ValidateAndSave()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode) throw new InvalidOperationException("Stop Play before isolated receiving validation.");
            var original = Object.FindFirstObjectByType<WarehouseReceiving>();
            if (original == null) throw new InvalidOperationException("Install the receiving start first.");
            var lines = new List<string> { "Isolated PhysX scene. Actual starting assets and production receiving methods. No warehouse scene mutation." };
            var scene = EditorSceneManager.NewPreviewScene();
            var physics = scene.GetPhysicsScene();
            float step = Time.fixedDeltaTime;
            try
            {
                if (!physics.IsValid() || physics == Physics.defaultPhysicsScene) throw new InvalidOperationException("An isolated physics scene is required.");
                var copy = Object.Instantiate(original.gameObject);
                copy.name = "Receiving validation copy";
                SceneManager.MoveGameObjectToScene(copy, scene);
                var receiving = copy.GetComponent<WarehouseReceiving>();
                var floor = new GameObject("Validation warehouse slab");
                SceneManager.MoveGameObjectToScene(floor, scene);
                floor.transform.position = new Vector3(0, -.12f, 1);
                floor.AddComponent<BoxCollider>().size = new Vector3(23, .24f, 22);
                StartMethod.Invoke(receiving, null);
                Physics.SyncTransforms();
                void Require(bool value, string label)
                { if (!value) throw new Exception(label); lines.Add("PASS " + label); }
                void Advance(float seconds)
                {
                    int ticks = Mathf.CeilToInt(seconds / step);
                    for (int i = 0; i < ticks; i++)
                    {
                        TickMethod.Invoke(receiving, null);
                        physics.Simulate(step);
                    }
                }
                GameObject Obstacle(Vector3 position)
                {
                    var blocker = new GameObject("Validation dock obstruction");
                    SceneManager.MoveGameObjectToScene(blocker, scene);
                    blocker.transform.position = position;
                    blocker.AddComponent<BoxCollider>().size = Vector3.one * .5f;
                    var body = blocker.AddComponent<Rigidbody>();
                    body.useGravity = false; body.constraints = RigidbodyConstraints.FreezeAll;
                    Physics.SyncTransforms(); return blocker;
                }
                Require(receiving.arrivalSeconds == 16 && receiving.openingSeconds == 4, "Public arrival uses sixteen seconds backing and four seconds opening");
                Require(!receiving.dockPlate.activeSelf && receiving.dockBarrier.enabled && receiving.cargo.All(c => c.Body.isKinematic), "Transit starts with barrier, no bridge and restrained freight");
                Vector3 start = receiving.truck.position;
                var obstruction = Obstacle(start + new Vector3(0, 2.1f, -.8f));
                Advance(.3f);
                Require(receiving.WaitingForClearance && Vector3.Distance(start, receiving.truck.position) < .001f && receiving.ArrivalProgress == 0, "Obstacle prevents backing before truck motion");
                Object.DestroyImmediate(obstruction); Physics.SyncTransforms();
                Advance(receiving.arrivalSeconds * .5f);
                Require(receiving.Phase == WarehouseReceiving.ReceivingPhase.Arriving && receiving.cargo.All(c => c.Body.isKinematic)
                    && !receiving.dockPlate.activeSelf && Quaternion.Angle(receiving.leftDoor.localRotation, Quaternion.identity) < .01f, "Moving truck keeps freight restrained, doors closed and bridge unavailable");
                int limit = Mathf.CeilToInt(receiving.arrivalSeconds / step) + 2;
                while (receiving.Phase == WarehouseReceiving.ReceivingPhase.Arriving && limit-- > 0) Advance(step);
                Require(receiving.Phase == WarehouseReceiving.ReceivingPhase.Opening && Vector3.Distance(receiving.truck.position, receiving.dockedPosition) < .001f,
                    "Doors only begin opening after truck reaches docked position");
                Require(receiving.wheelChocks.activeSelf && receiving.cargo.All(c => !c.Body.isKinematic && !c.transform.IsChildOf(receiving.truck.transform))
                    && !receiving.dockPlate.activeSelf, "Docking releases every independent physical pallet and chocks wheels before bridge access");
                obstruction = Obstacle(new Vector3(0, 1.1f, 12.6f));
                Quaternion angle = receiving.leftDoor.localRotation;
                Advance(.3f);
                Require(receiving.WaitingForClearance && Quaternion.Angle(angle, receiving.leftDoor.localRotation) < .01f && !receiving.dockPlate.activeSelf,
                    "Obstructed door sweep holds doors and bridge");
                Object.DestroyImmediate(obstruction); Physics.SyncTransforms();
                Advance(receiving.openingSeconds * .5f);
                Require(!receiving.DoorsOpen && !receiving.dockPlate.activeSelf && receiving.dockBarrier.enabled,
                    "Partially open trailer never unlocks loading access");
                Advance(receiving.openingSeconds * .5f + .1f);
                Require(receiving.DoorsOpen && receiving.dockPlate.activeSelf && !receiving.dockBarrier.gameObject.activeSelf
                    && Quaternion.Angle(receiving.leftDoor.localRotation, receiving.DoorPose(true, 1)) < .01f,
                    "Fully open doors unlock bridge and remove the barrier");
                Require(receiving.DeliveredCount == 0 && receiving.StoredCount == 0 && receiving.cargo.All(c => c.transform.position.y > -.04f),
                    "Opening does not unload freight and actual trailer deck supports all four pallets");
                var pallet = receiving.cargo[0];
                pallet.Body.position = new Vector3(-4, .02f, 4); pallet.Body.rotation = Quaternion.identity;
                pallet.Body.linearVelocity = pallet.Body.angularVelocity = Vector3.zero;
                Physics.SyncTransforms(); Advance(1.3f);
                Require(receiving.DeliveredCount == 1 && receiving.StoredCount == 0, "Off-rack floor stock counts unloaded without counting as stored");
                var slot = receiving.storagePositions[0];
                pallet.Body.isKinematic = true;
                pallet.Body.position = slot.position + Vector3.up * .06f;
                pallet.Body.rotation = slot.rotation;
                Physics.SyncTransforms(); CountMethod.Invoke(receiving, null);
                Require(receiving.StoredCount == 0, "A pallet held six centimetres above its slot does not count as supported stock");
                for (int i = 0; i < receiving.cargo.Length; i++)
                {
                    var item = receiving.cargo[i]; var target = receiving.storagePositions[i];
                    item.Body.isKinematic = false;
                    item.Body.position = target.position + Vector3.up * .007f;
                    item.Body.rotation = target.rotation;
                    item.Body.linearVelocity = item.Body.angularVelocity = Vector3.zero;
                    item.Body.WakeUp();
                }
                Physics.SyncTransforms(); Advance(3);
                Require(receiving.StoredCount == 4 && receiving.DeliveredCount == 4 && receiving.Phase == WarehouseReceiving.ReceivingPhase.Complete,
                    "All four independently supported rack pallets complete the first delivery");
                lines.Add("PASS receiving sequence");
            }
            catch (Exception error)
            {
                lines.Add("FAIL " + error);
                throw;
            }
            finally
            {
                EditorSceneManager.ClosePreviewScene(scene);
                Directory.CreateDirectory(Path.GetDirectoryName(ReportPath));
                File.WriteAllText(ReportPath, string.Join("\n", lines) + "\n");
            }
            return string.Join("\n", lines);
        }
    }
}
