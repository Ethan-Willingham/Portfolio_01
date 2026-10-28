using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object=UnityEngine.Object;

namespace OneShift.RackLab
{
    public static class WarehouseCourierValidation
    {
        const float Step=.02f;
        [MenuItem("One Shift/Validate courier street route")]
        public static string ValidateRoute()
        {
            using(var rig=new Rig())
            {
                var van=rig.service.VanTransform;van.gameObject.SetActive(true);
                var body=van.GetComponent<Rigidbody>();var colliders=van.GetComponentsInChildren<BoxCollider>();
                var overlaps=new Collider[256];int poses=0;
                for(int route=0;route<2;route++)for(int frame=0;frame<=500;frame++)
                {
                    float duration=route==0?WarehouseCourierRoute.ArrivalDuration:WarehouseCourierRoute.DepartureDuration;
                    WarehouseCourierRoute.Sample(route==1,duration*frame/500f,out Vector3 p,out Quaternion q,out _);
                    van.SetPositionAndRotation(p,q);body.position=p;body.rotation=q;Physics.SyncTransforms();poses++;
                    Need(!rig.service.VanBlocked(p,q,out string obstacle),(route==0?"Arrival":"Departure")+" broad clearance at "+frame+" blocked by "+obstacle+" at "+p);
                    foreach(var box in colliders)
                    {
                        int count=rig.physics.OverlapBox(box.bounds.center,box.bounds.extents,overlaps,Quaternion.identity,~0,QueryTriggerInteraction.Ignore);
                        Need(count<overlaps.Length,"Route collision query buffer filled");
                        for(int i=0;i<count;i++)
                        {
                            var hit=overlaps[i];if(hit==null || hit.transform.IsChildOf(rig.service.transform) || hit.attachedRigidbody!=null || hit is CharacterController)continue;
                            if(Physics.ComputePenetration(box,box.transform.position,box.transform.rotation,hit,hit.transform.position,hit.transform.rotation,out _,out float depth) && depth>.025f)
                                throw new InvalidOperationException((route==0?"Arrival":"Departure")+" pose "+frame+" "+box.name+" overlaps "+hit.name+" by "+depth.ToString("F3")+" m at "+p);
                        }
                    }
                }
                string result="PASS "+poses+" actual van poses clear the installed scene, including four tyre contacts, folded ramp and closed articulated doors.\n"+
                    "PASS Street arrival "+WarehouseCourierRoute.ArrivalDuration+" s and street departure "+WarehouseCourierRoute.DepartureDuration+" s. Parked datum "+WarehouseCourierRoute.Parked+".\n";
                Save("warehouse-courier-route-validation.txt",result);return result;
            }
        }

        [MenuItem("One Shift/Validate physical courier service")]
        public static string ValidateAndSave()
        {
            var lines=new List<string>{"Actual cloned warehouse scene and production courier in isolated PhysX. Source scene and stock untouched."};
            void Pass(bool value,string label){Need(value,label);lines.Add("PASS "+label);}
            using(var rig=new Rig())
            {
                var service=rig.service;int allDropped=0,departed=0;var dropped=new HashSet<Rigidbody>();
                var cartons=Enumerable.Range(0,4).Select(i=>rig.Carton(service.DeliverySpawnPosition(i),true)).ToArray();
                Pass(service.BeginDelivery(cartons,()=>allDropped++,body=>{Need(dropped.Add(body),"Duplicate carton callback");}),"Accept four original physical cartons at the street origin");
                Pass(!service.BeginDelivery(cartons,()=>{}),"Reject duplicate active stock references");
                Vector3 start=service.VanPosition;
                for(int i=0;i<50;i++)service.Tick(Step,false);
                Pass(Vector3.Distance(service.VanPosition,start)<.00001f,"Inactive simulation does not advance the van");
                var blocker=rig.Blocker(start+new Vector3(-1.8f,1,0));rig.Advance(.5f);
                Pass(Vector3.Distance(start,service.VanPosition)<.001f && service.Status.Contains("waiting"),"A physical road obstruction stops the van before motion");
                Object.DestroyImmediate(blocker);Physics.SyncTransforms();
                rig.Until(()=>service.State==WarehouseCourierService.VisitState.WalkingToRear,35);
                Pass(service.RearDoorOpen==0 && service.RampOpen==0 && cartons.All(b=>b.isKinematic),"Parking and driver exit precede opening and cargo release");
                rig.Until(()=>service.State==WarehouseCourierService.VisitState.WalkingToCarton,20);
                Pass(service.RearDoorOpen>.999f && service.RampOpen>.999f,"Real rear doors and folding ramp open before the courier enters");
                var pathBlocker=rig.Blocker(service.DriverPosition+new Vector3(0,.85f,-.45f));
                Vector3 driverStart=service.DriverPosition;rig.Advance(.7f);
                Pass(Vector3.Distance(driverStart,service.DriverPosition)<.12f,"Driver waits behind a solid obstruction on the ramp. State "+service.State+" / "+service.Status+", movement "+Vector3.Distance(driverStart,service.DriverPosition).ToString("F3")+" m from "+driverStart+" to "+service.DriverPosition);
                Object.DestroyImmediate(pathBlocker);Physics.SyncTransforms();
                var previous=cartons.Select(b=>b.position).ToArray();float maxMove=0;string largestMotion="";int remaining=12000;
                while(allDropped==0 && remaining-->0)
                {
                    var before=service.State;
                    rig.Advance(Step);
                    for(int i=0;i<cartons.Length;i++)
                    {
                        float motion=Vector3.Distance(previous[i],cartons[i].position);
                        if(motion>maxMove){maxMove=motion;largestMotion="carton "+i+", "+before+" to "+service.State+", "+previous[i].ToString("F3")+" to "+cartons[i].position.ToString("F3");}
                        previous[i]=cartons[i].position;
                    }
                }
                Pass(allDropped==1 && dropped.Count==4,"Courier carries and individually drops all four cartons at the actual porch shelf; dropped "+dropped.Count+", state "+service.State+" / "+service.Status+" at "+service.DriverPosition+", cartons "+string.Join(", ",cartons.Select(b=>b.position.ToString("F3"))));
                Pass(maxMove<.34f,"No inbound carton teleports onsite; largest 20 ms motion "+maxMove.ToString("F3")+" m, "+largestMotion);
                Pass(service.Busy && cartons.All(b=>!b.isKinematic && b.useGravity && b.transform.parent==null),"Dropped cartons are independent dynamic bodies while the visit remains busy");
                rig.Until(()=>!service.Busy,75);
                Pass(allDropped==1 && cartons.All(b=>b.position.x>7.6f && b.position.x<8.95f && b.position.z>-11.5f && b.position.z<-10.6f),"Delivery callback fires once and four cartons remain on the porch after the van exits");
                foreach(var carton in cartons){carton.position=new Vector3(-3,1,0)+Vector3.right*Array.IndexOf(cartons,carton);carton.transform.position=carton.position;}
                Physics.SyncTransforms();rig.Advance(1);
                bool holding=false;
                Pass(service.BeginCollection(cartons,()=>departed++,()=>holding),"Accept an exact four-carton collection manifest");
                rig.Until(()=>service.ReadyForLoading,65);
                Pass(!service.CanDispatch(out _),"An empty van cannot dispatch stock left in the warehouse");
                for(int i=0;i<cartons.Length;i++){cartons[i].position=service.CargoPlacementPosition(i);cartons[i].rotation=Quaternion.identity;cartons[i].transform.SetPositionAndRotation(cartons[i].position,cartons[i].rotation);cartons[i].linearVelocity=Vector3.zero;cartons[i].angularVelocity=Vector3.zero;}
                Physics.SyncTransforms();holding=true;rig.Advance(2);
                Pass(service.LoadedCount==4 && !service.CanDispatch(out _) && departed==0,"Held-item callback prevents departure even with every manifest carton on the deck");
                holding=false;
                var intruder=rig.Blocker(service.LoadingPosition+Vector3.up*.85f);rig.Advance(2);
                Pass(!service.CanDispatch(out _) && departed==0,"An occupied loading ramp prevents departure");
                Object.DestroyImmediate(intruder);Physics.SyncTransforms();
                rig.Until(()=>service.State==WarehouseCourierService.VisitState.DepartureWarning,8);
                Pass(departed==0 && !cartons.Any(b=>b.isKinematic),"A visible three-second warning precedes physical load restraint");
                holding=true;rig.Advance(.2f);
                Pass(service.State==WarehouseCourierService.VisitState.WaitingForLoading,"A new hold cancels the departure warning");holding=false;
                rig.Until(()=>service.State==WarehouseCourierService.VisitState.DrivingOut,35);
                Pass(departed==0 && cartons.All(b=>b.isKinematic) && service.RearDoorOpen==0 && service.RampOpen==0,"Only the selected stable manifest is restrained before closed-door departure");
                rig.Until(()=>!service.Busy,25);
                Pass(departed==1 && cartons.All(b=>b!=null && b.position.x>78),"Collection callback fires once after the actual van reaches the street exit; caller owns stock removal");
                rig.Advance(1);Pass(departed==1 && allDropped==1,"Idle updates cannot duplicate delivery or payment callbacks");
                foreach(var carton in cartons)Object.DestroyImmediate(carton.gameObject);
                var next=rig.Carton(service.DeliverySpawnPosition(0),true);var queued=rig.Carton(service.DeliverySpawnPosition(1),true);
                int nextCount=0,queuedCount=0;
                Pass(service.BeginDelivery(new[]{next},()=>nextCount++),"A new physical delivery can start after collection");
                Pass(service.BeginDelivery(new[]{queued},()=>queuedCount++) && service.QueuedVisits==1 && !queued.gameObject.activeSelf,"Only one van visit is active; queued cartons remain offsite and inactive");
                rig.Until(()=>queuedCount==1,240);
                rig.Until(()=>!service.Busy,75);
                Pass(nextCount==1 && queuedCount==1 && next!=null && queued!=null && !next.isKinematic && !queued.isKinematic,"Queued deliveries complete once in order without destroying their physical stock");
                Pass(service.GetComponentsInChildren<Light>(true).Length==0,"Courier adds no shadow-casting or other lights");
            }
            ValidateShelfPlacement(lines);
            string report=string.Join("\n",lines)+"\n";Save("warehouse-courier-validation.txt",report);return report;
        }
        public static string ValidateShelfPlacement()
        {
            var lines=new List<string>();ValidateShelfPlacement(lines);return string.Join("\n",lines)+"\n";
        }
        static void ValidateShelfPlacement(List<string> lines)
        {
            foreach(float step in new[]{.005f,.02f})using(var rig=new Rig(step))
            {
                var service=rig.service;int dropped=0,completed=0;float deepest=0,largestMove=0;
                var cartons=Enumerable.Range(0,4).Select(i=>rig.Carton(service.DeliverySpawnPosition(i),true)).ToArray();
                foreach(var body in cartons)
                {body.solverIterations=Physics.defaultSolverIterations;body.linearDamping=.12f;body.angularDamping=.3f;body.collisionDetectionMode=CollisionDetectionMode.ContinuousDynamic;}
                Need(service.BeginDelivery(cartons,()=>completed++,body=>dropped++),"Regression delivery accepted");
                rig.Until(()=>dropped==2,180);
                // Reproduce the sleeping, shifted lower carton from the native
                // browser failure. Its high corner is above the old centre ray.
                var support=cartons[1];
                support.position=new Vector3(8.591479f,.7879413f,-10.880252f);
                support.rotation=Quaternion.Euler(14.604791f,5.629209f,357.52716f);
                support.transform.SetPositionAndRotation(support.position,support.rotation);
                support.linearVelocity=support.angularVelocity=Vector3.zero;support.Sleep();Physics.SyncTransforms();
                rig.BeforePhysics=()=>
                {
                    if(service.State!=WarehouseCourierService.VisitState.PlacingCarton || dropped>=cartons.Length)return;
                    var moving=cartons[dropped].GetComponent<BoxCollider>();
                    for(int i=0;i<dropped;i++)
                    {
                        var other=cartons[i].GetComponent<BoxCollider>();
                        if(Physics.ComputePenetration(moving,moving.transform.position,moving.transform.rotation,other,other.transform.position,other.transform.rotation,out _,out float depth))
                            deepest=Mathf.Max(deepest,depth);
                    }
                };
                var previous=cartons.Select(b=>b.position).ToArray();int ticks=Mathf.CeilToInt(160/step);
                while(completed==0 && ticks-->0)
                {
                    rig.Advance(step);
                    for(int i=0;i<cartons.Length;i++)
                    {largestMove=Mathf.Max(largestMove,Vector3.Distance(previous[i],cartons[i].position));previous[i]=cartons[i].position;}
                }
                Need(completed==1 && dropped==4,"Moved and tilted shelf support must not stall a later carton at "+step+" seconds: "+service.State+" / "+service.Status);
                Need(deepest<.004f,"Placement must not push through earlier cartons; penetration "+deepest+" m at "+step+" seconds");
                Need(largestMove<.16f,"Placement remains continuous; largest step "+largestMove+" m at "+step+" seconds");
                Need(cartons.All(b=>!b.isKinematic && b.useGravity),"Every regression carton must become loose physical stock");
                lines.Add("PASS Moved and tilted porch support at "+(step*1000).ToString("F0")+" ms physics: four cartons delivered once, placement penetration "+deepest.ToString("F4")+" m, largest motion "+largestMove.ToString("F3")+" m.");
            }
        }
        static void Save(string name,string report){Directory.CreateDirectory("Assets/RackLab/Reports");File.WriteAllText("Assets/RackLab/Reports/"+name,report);}
        static void Need(bool value,string label){if(!value)throw new InvalidOperationException(label);}

        sealed class Rig:IDisposable
        {
            public readonly Scene scene;
            public readonly PhysicsScene physics;
            public readonly WarehouseCourierService service;
            readonly float simulationStep;
            public Action BeforePhysics;
            public Rig(float step=Step)
            {
                if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play before courier validation.");
                simulationStep=step;
                var source=SceneManager.GetActiveScene();scene=EditorSceneManager.NewPreviewScene();physics=scene.GetPhysicsScene();
                foreach(var root in source.GetRootGameObjects())
                {
                    if((root.hideFlags&HideFlags.DontSave)!=0)continue;
                    var copy=Object.Instantiate(root);SceneManager.MoveGameObjectToScene(copy,scene);
                    foreach(var old in copy.GetComponentsInChildren<WarehouseParcelService>(true))
                    {old.enabled=false;foreach(var parcel in old.parcels)if(parcel!=null)parcel.gameObject.SetActive(false);}
                    foreach(var child in copy.GetComponentsInChildren<Transform>(true))if(child.name=="Decorative parcel van")child.gameObject.SetActive(false);
                }
                var node=new GameObject("Courier validation service");SceneManager.MoveGameObjectToScene(node,scene);
                service=node.AddComponent<WarehouseCourierService>();service.Initialize();Physics.SyncTransforms();
            }
            public Rigidbody Carton(Vector3 position,bool kinematic)
            {
                var node=new GameObject("Courier validation carton");SceneManager.MoveGameObjectToScene(node,scene);node.transform.position=position;
                node.AddComponent<BoxCollider>().size=new Vector3(.48f,.36f,.38f);
                var body=node.AddComponent<Rigidbody>();body.mass=6;body.isKinematic=kinematic;body.useGravity=!kinematic;body.solverIterations=8;return body;
            }
            public GameObject Blocker(Vector3 position)
            {
                var node=new GameObject("Courier validation obstruction");SceneManager.MoveGameObjectToScene(node,scene);node.transform.position=position;
                node.AddComponent<BoxCollider>().size=new Vector3(.6f,1.5f,.6f);Physics.SyncTransforms();return node;
            }
            public void Advance(float seconds)
            {for(int i=0;i<Mathf.CeilToInt(seconds/simulationStep);i++){service.Tick(simulationStep);Physics.SyncTransforms();BeforePhysics?.Invoke();physics.Simulate(simulationStep);}}
            public void Until(Func<bool> done,float seconds)
            {
                int ticks=Mathf.CeilToInt(seconds/simulationStep);while(!done() && ticks-->0)Advance(simulationStep);
                Need(done(),"Courier stalled in "+service.State+" / "+service.Status+" at van "+service.VanPosition+", driver "+service.DriverPosition);
            }
            public void Dispose()=>EditorSceneManager.ClosePreviewScene(scene);
        }
    }
}
