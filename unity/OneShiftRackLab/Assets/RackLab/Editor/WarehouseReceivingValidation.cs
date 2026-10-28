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

        [MenuItem("One Shift/Validate street truck clearance")]
        public static string ValidateRoadRoute()
        {
            if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play before route clearance validation.");
            var source=SceneManager.GetActiveScene();
            var preview=EditorSceneManager.NewPreviewScene();
            var physics=preview.GetPhysicsScene();
            var candidates=new Collider[256];
            WarehouseReceiving receiving=null;
            int poses=0;float articulation=0;
            try
            {
                foreach(var root in source.GetRootGameObjects())
                {
                    if((root.hideFlags&HideFlags.DontSave)!=0)continue;
                    var copy=Object.Instantiate(root);SceneManager.MoveGameObjectToScene(copy,preview);
                    var sequence=copy.GetComponent<WarehouseReceiving>();if(sequence!=null)receiving=sequence;
                }
                if(receiving==null)throw new Exception("Receiving start missing.");
                if(receiving.wheelChocks!=null)receiving.wheelChocks.SetActive(false);
                if(receiving.dockPlate!=null)receiving.dockPlate.SetActive(false);
                var truck=receiving.truck;var boxes=truck.GetComponentsInChildren<BoxCollider>();
                for(int route=0;route<2;route++)for(int step=0;step<=600;step++)
                {
                    var pose=route==0?WarehouseTruckRoute.Arrival(step/600f,receiving.dockedPosition):WarehouseTruckRoute.Departure(step/600f,receiving.dockedPosition);
                    truck.transform.SetPositionAndRotation(pose.position,pose.rotation);
                    truck.position=pose.position;truck.rotation=pose.rotation;receiving.tractorPivot.localRotation=Quaternion.Euler(0,pose.articulation,0);
                    articulation=Mathf.Max(articulation,Mathf.Abs(pose.articulation));Physics.SyncTransforms();poses++;
                    foreach(var box in boxes)
                    {
                        var bounds=box.bounds;
                        int count=physics.OverlapBox(bounds.center,bounds.extents,candidates,Quaternion.identity,~0,QueryTriggerInteraction.Ignore);
                        if(count==candidates.Length)throw new Exception("Route audit collision buffer filled.");
                        for(int i=0;i<count;i++)
                        {
                            var hit=candidates[i];
                            if(hit==null || hit.transform.IsChildOf(truck.transform) || hit.attachedRigidbody!=null || hit is CharacterController)continue;
                            if(Physics.ComputePenetration(box,box.transform.position,box.transform.rotation,hit,hit.transform.position,hit.transform.rotation,out _,out float depth) && depth>.035f)
                                throw new Exception((route==0?"Arrival":"Departure")+" pose "+step+" "+box.name+" penetrates "+hit.name+" by "+depth.ToString("F3")+" m at "+pose.position);
                        }
                    }
                }
                if(articulation<25 || articulation>65)throw new Exception("Street arrival lost its controlled tractor articulation.");
                string report="PASS "+poses+" actual tractor/trailer poses clear the scene's static collision. Maximum articulation "+articulation.ToString("F1")+" degrees.\n"+
                    "PASS Street arrival "+WarehouseTruckRoute.ArrivalDuration.ToString("F2")+" s, forward street departure "+WarehouseTruckRoute.DepartureDuration.ToString("F2")+" s. Original dock datum and 2.693 m roof clearance unchanged.\n";
                Directory.CreateDirectory("Assets/RackLab/Reports");File.WriteAllText("Assets/RackLab/Reports/warehouse-truck-route-validation.txt",report);return report;
            }
            finally{EditorSceneManager.ClosePreviewScene(preview);}
        }

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
                Require(Mathf.Abs(receiving.arrivalSeconds-WarehouseTruckRoute.ArrivalDuration)<.01f && receiving.openingSeconds == 4,
                    "Public arrival follows the complete street route and retains four seconds opening");
                Require(!receiving.dockPlate.activeSelf && receiving.dockBarrier.enabled && receiving.cargo.All(c => c.Body.isKinematic), "Transit starts with barrier, no bridge and restrained freight");
                Vector3 start = receiving.truck.position;
                Require(start.x>70 && start.z>60 && Vector3.Dot(receiving.truck.rotation*Vector3.forward,Vector3.left)>.99f,
                    "Truck begins on the business park street facing along the road at "+start+", heading "+receiving.truck.rotation.eulerAngles);
                var obstruction = Obstacle(start + receiving.truck.rotation*new Vector3(0, 2.1f, 22));
                Advance(.3f);
                Require(receiving.WaitingForClearance && Vector3.Distance(start, receiving.truck.position) < .001f && receiving.ArrivalProgress == 0, "Obstacle ahead of original tractor prevents street motion");
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
                Require(!receiving.CanDispatch(new[]{receiving.cargo[0]},out _),"An order on a rack cannot dispatch without physical trailer loading");
                int created=0;
                Require(receiving.RequestDelivery(1,(item,index)=>created++) && !receiving.RequestDelivery(1,null),
                    "One paid supplier shipment queues; a second request cannot duplicate it");
                var retained=receiving.cargo.ToArray();
                Advance(.2f);
                Require(created==0 && receiving.Phase==WarehouseReceiving.ReceivingPhase.Closing,
                    "Queued supplier stock is not created while the current truck is still at the dock");
                Advance(receiving.openingSeconds+receiving.departureSeconds+.5f);
                Require(created==1 && receiving.Phase==WarehouseReceiving.ReceivingPhase.Arriving && receiving.cargo.Length==1
                    && retained.All(item=>item!=null && !item.Body.isKinematic),
                    "Next street arrival creates its one actual pallet while all prior warehouse stock remains independent");
                Advance(receiving.arrivalSeconds+receiving.openingSeconds+.5f);
                Advance(1);
                bool paid=false;
                var loaded=receiving.cargo[0];
                Require(receiving.CanDispatch(new[]{loaded},out var reason),"A settled manifest on the real trailer deck can dispatch: "+reason);
                obstruction=Obstacle(new Vector3(0,1.1f,12.6f));
                Require(!receiving.TryDispatch(new[]{loaded},()=>paid=true),"Dock occupant prevents shipment acceptance and payment");
                Object.DestroyImmediate(obstruction);Physics.SyncTransforms();
                Require(receiving.TryDispatch(new[]{loaded},()=>paid=true),"Clear dock accepts a physically loaded manifest");
                Require(!paid && loaded.Body.isKinematic,"Accepted freight is restrained in place without early payment");
                Advance(receiving.openingSeconds+receiving.departureSeconds*.5f);
                Require(!paid && loaded!=null && receiving.Phase==WarehouseReceiving.ReceivingPhase.Departing,
                    "Order remains unpaid and physical while the actual truck exits the lot");
                Advance(receiving.departureSeconds*.5f+.2f);
                Require(paid && receiving.Phase==WarehouseReceiving.ReceivingPhase.Away,"Shipment completion callback fires after street departure");
                Require(receiving.RequestPickup() && receiving.RequestPickup() && receiving.HasQueuedPickup,
                    "A retailer pickup can book one free empty return after dispatch without buying stock");
                Advance(.1f);
                Require(receiving.Phase==WarehouseReceiving.ReceivingPhase.Arriving && receiving.cargo.Length==0 && !receiving.HasQueuedPickup
                    && retained.All(item=>item!=null && !item.Body.isKinematic),"Empty pickup return creates no freight and preserves all warehouse pallets");
                Advance(receiving.arrivalSeconds+receiving.openingSeconds+.5f);
                Require(receiving.DoorsOpen && receiving.Phase==WarehouseReceiving.ReceivingPhase.Ready && receiving.cargo.Length==0,
                    "Returned empty truck opens the original doors and waits for physically loaded retailer stock");
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
