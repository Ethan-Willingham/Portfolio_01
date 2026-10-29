using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace OneShift.RackLab
{
    [DisallowMultipleComponent]
    public sealed class WarehouseCourierService : MonoBehaviour
    {
        public enum VisitState { Idle, DrivingIn, OpeningCab, LeavingCab, WalkingToRear, OpeningDoors, UnfoldingRamp, WalkingToCarton, LiftingCarton, WalkingToPorch, TurningToPlace, PlacingCarton, ReturningToVan, WalkingToLoadingStand, WaitingForLoading, DepartureWarning, WalkingToClose, FoldingRamp, ClosingDoors, WalkingToCab, EnteringCab, ClosingCab, DrivingOut }
        public VisitState State { get; private set; }
        public string Status { get; private set; }="Courier available";
        public bool Busy=>active!=null || visits.Count>0;
        public bool ReadyForLoading=>active!=null && !active.delivery && (State==VisitState.WaitingForLoading || State==VisitState.DepartureWarning);
        public bool CollectionDeparting=>active!=null && !active.delivery && State>=VisitState.WalkingToClose;
        public int QueuedVisits=>visits.Count;
        public Vector3 VanPosition=>visuals!=null?visuals.root.position:WarehouseCourierRoute.StreetStart;
        public Transform VanTransform { get { Initialize();return visuals.root; } }
        public Transform DriverTransform { get { Initialize();return visuals.driver.root; } }
        public Bounds DeckBounds { get { Initialize();return visuals.deck.bounds; } }
        public BoxCollider DeckCollider { get { Initialize();return visuals.deck; } }
        public Func<bool> DispatchAuthorized;
        public Vector3 LoadingPosition=>new Vector3(3,WarehouseCourierRoute.Ground+.05f,-23.75f);
        public Vector3 DriverPosition=>visuals!=null?visuals.driver.root.position:WarehouseCourierRoute.StreetStart;
        public float RearDoorOpen { get; private set; }
        public float RampOpen { get; private set; }
        public int LoadedCount { get { if(active==null || active.delivery)return 0;int count=0;foreach(var body in active.cartons)if(BoxIsOnDeck(body))count++;return count; } }
        public Vector3 CargoPlacementPosition(int index,Rigidbody carton=null){Initialize();return visuals.root.TransformPoint(Slot(Mathf.Clamp(index,0,5),carton));}

        sealed class Visit
        {
            public bool delivery;
            public Rigidbody[] cartons;
            public Action complete;
            public Action<Rigidbody> dropped;
            public Func<bool> held;
            public bool notified;
        }
        readonly Queue<Visit> visits=new Queue<Visit>();
        readonly Dictionary<Rigidbody,Pose> restrained=new Dictionary<Rigidbody,Pose>();
        readonly Collider[] overlaps=new Collider[128];
        readonly RaycastHit[] hits=new RaycastHit[32];
        readonly List<Vector3> walkPath=new List<Vector3>();
        WarehouseCourierVisuals visuals;
        Visit active;
        PhysicsScene physics;
        float clock,routeClock,stableTime,doorAmount;
        int cartonIndex,pathIndex;
        Rigidbody carried;
        Vector3 liftStart,dropTarget;
        Quaternion liftRotation;
        bool initialized;
        string pathObstruction;

        public static WarehouseCourierService Ensure()
        {
            var scene=SceneManager.GetActiveScene();
            foreach(var root in scene.GetRootGameObjects())
            {var found=root.GetComponentInChildren<WarehouseCourierService>(true);if(found!=null){found.Initialize();return found;}}
            var node=new GameObject("Career courier service");
            var service=node.AddComponent<WarehouseCourierService>();service.Initialize();return service;
        }

        public void Initialize()
        {
            if(initialized)return;
            initialized=true;physics=gameObject.scene.GetPhysicsScene();
            visuals=new WarehouseCourierVisuals(transform);
            SetVanPose(WarehouseCourierRoute.StreetStart,Quaternion.Euler(0,270,0));
            visuals.root.gameObject.SetActive(false);State=VisitState.Idle;
        }
        void Awake()=>Initialize();
        void OnDestroy(){if(visuals!=null)visuals.Dispose();}
        void FixedUpdate()
        {
            if(Time.timeScale<=0 || !Application.isFocused || BrowserLifecycle.GraphicsPreparing)return;
            Tick(Time.fixedDeltaTime);
        }

        public Vector3 DeliverySpawnPosition(int index,Rigidbody carton=null)
        {
            Vector3 slot=Slot(Mathf.Clamp(index,0,5),carton);
            return WarehouseCourierRoute.StreetStart+Quaternion.Euler(0,270,0)*slot;
        }
        static Vector3 Slot(int index,Rigidbody carton=null)
        {
            CartonGeometry(carton,out Vector3 centre,out Vector3 half);
            return new Vector3(index%2==0?-.55f:.55f,WarehouseCourierVisuals.DeckHeight+half.y+.005f,-1.55f+(index/2)*.76f)-centre;
        }
        // All stock uses a root box collider. Use its scaled physical shape for
        // deck support, carrying and shelf clearance, including a shifted centre.
        static void CartonGeometry(Rigidbody carton,out Vector3 centre,out Vector3 half)
        {
            centre=Vector3.zero;half=new Vector3(.24f,.18f,.19f);
            var box=carton!=null?carton.GetComponent<BoxCollider>():null;if(box==null)return;
            Vector3 scale=box.transform.lossyScale;
            centre=Vector3.Scale(box.center,scale);
            half=Vector3.Scale(box.size*.5f,new Vector3(Mathf.Abs(scale.x),Mathf.Abs(scale.y),Mathf.Abs(scale.z)));
        }
        static Vector3 ClearanceExtents(Vector3 half,float skin)=>new Vector3(Mathf.Max(.01f,half.x+skin),Mathf.Max(.01f,half.y+skin),Mathf.Max(.01f,half.z+skin));

        public bool BeginDelivery(Rigidbody[] cartons,Action delivered,Action<Rigidbody> cartonDropped=null)
        {
            if(!ValidManifest(cartons) || cartons.Length>6 || visits.Count>=4)return false;
            Initialize();
            foreach(var body in cartons){if(!body.isKinematic){body.linearVelocity=Vector3.zero;body.angularVelocity=Vector3.zero;}body.isKinematic=true;body.useGravity=false;}
            // Pending freight is still at the offsite depot. Keeping its bodies
            // inactive prevents one visit's queued stock blocking another exit.
            if(active!=null)foreach(var body in cartons)body.gameObject.SetActive(false);
            visits.Enqueue(new Visit{delivery=true,cartons=(Rigidbody[])cartons.Clone(),complete=delivered,dropped=cartonDropped});
            if(active==null)StartNext();return true;
        }
        public bool BeginCollection(Rigidbody[] manifest,Action departed,Func<bool> hasHeldCarton=null)
        {
            if(!ValidManifest(manifest) || manifest.Length>6 || visits.Count>=4)return false;
            Initialize();visits.Enqueue(new Visit{delivery=false,cartons=(Rigidbody[])manifest.Clone(),complete=departed,held=hasHeldCarton});
            if(active==null)StartNext();return true;
        }
        bool ValidManifest(Rigidbody[] items)
        {
            if(items==null || items.Length==0)return false;
            var unique=new HashSet<Rigidbody>();
            foreach(var body in items)
            {
                if(body==null || body.gameObject.scene!=gameObject.scene || !unique.Add(body))return false;
                if(active!=null && Array.IndexOf(active.cartons,body)>=0)return false;
                foreach(var queued in visits)if(Array.IndexOf(queued.cartons,body)>=0)return false;
            }
            return true;
        }
        void StartNext()
        {
            if(active!=null || visits.Count==0)return;
            active=visits.Dequeue();cartonIndex=0;routeClock=0;stableTime=0;carried=null;restrained.Clear();
            visuals.root.gameObject.SetActive(true);visuals.driver.root.gameObject.SetActive(true);
            SetVanPose(WarehouseCourierRoute.StreetStart,Quaternion.Euler(0,270,0));
            RearDoorOpen=RampOpen=doorAmount=0;visuals.SetRearDoors(0);visuals.SetRamp(0);visuals.SetDriverDoor(0);
            if(active.delivery)for(int i=0;i<active.cartons.Length;i++){active.cartons[i].gameObject.SetActive(true);Restrain(active.cartons[i],new Pose(Slot(i,active.cartons[i]),Quaternion.identity));}
            SeatDriver();Change(VisitState.DrivingIn,"Courier driving from the front street");
        }

        // Explicit simulation entry used by preview-scene validators. Runtime
        // FixedUpdate supplies scaled time only while browser activity permits it.
        public void Tick(float deltaTime)
        {
            Initialize();if(deltaTime<=0 || active==null)return;
            float dt=Mathf.Min(deltaTime,.05f);clock+=dt;
            switch(State)
            {
                case VisitState.DrivingIn: Drive(false,dt);break;
                case VisitState.OpeningCab:
                    if(!CabClear()){Status="Waiting for room beside the cab";break;}
                    doorAmount=Mathf.MoveTowards(doorAmount,1,dt*1.2f);visuals.SetDriverDoor(doorAmount);
                    if(doorAmount>=1){Change(VisitState.LeavingCab,"Courier getting out");visuals.driver.capsule.enabled=true;}
                    break;
                case VisitState.LeavingCab:
                    if(!CabClear()){clock=Mathf.Max(0,clock-dt);Status="Waiting for room beside the cab";break;}
                    SetDriverPose(Vector3.Lerp(SeatPosition(),CabExit(),Mathf.SmoothStep(0,1,clock/1.1f)),Quaternion.Euler(0,90,0));
                    visuals.driver.Pose(dt*.4f,false,0,1-Mathf.Clamp01(clock/1.1f));
                    if(clock>=1.1f){visuals.SetDriverDoor(0);doorAmount=0;Walk(VisitState.WalkingToRear,"Courier walking to the rear doors",new Vector3(5.8f,G,-29.4f),new Vector3(5.8f,G+.05f,-23.45f),RearStaging());}
                    break;
                case VisitState.WalkingToRear:
                    if(WalkStep(dt)){Face(new Vector3(3,G,-28));Change(VisitState.OpeningDoors,"Courier opening the rear doors");}break;
                case VisitState.OpeningDoors:
                    if(!RearClear()){Status="Clear the rear doors";break;}
                    RearDoorOpen=Mathf.MoveTowards(RearDoorOpen,1,dt*.7f);visuals.SetRearDoors(RearDoorOpen);
                    if(RearDoorOpen>=1)Change(VisitState.UnfoldingRamp,"Courier lowering the loading ramp");break;
                case VisitState.UnfoldingRamp:
                    if(!RearClear()){Status="Clear the loading ramp";break;}
                    RampOpen=Mathf.MoveTowards(RampOpen,1,dt*.7f);visuals.SetRamp(RampOpen);
                    if(RampOpen>=1)
                    {
                        if(active.delivery)BeginCartonWalk();
                        else Walk(VisitState.WalkingToLoadingStand,"Courier making room for loading",new Vector3(5.8f,G+.05f,-23.45f));
                    }
                    break;
                case VisitState.WalkingToCarton:
                    if(WalkStep(dt))
                    {
                        carried=active.cartons[cartonIndex];if(carried==null){Status="The delivery carton is missing";break;}
                        Face(carried.position);liftStart=carried.position;liftRotation=carried.rotation;restrained.Remove(carried);
                        Change(VisitState.LiftingCarton,"Courier lifting a carton");
                    }break;
                case VisitState.LiftingCarton:
                    visuals.driver.Pose(0,true,Mathf.Sin(Mathf.Clamp01(clock/.85f)*Mathf.PI)*.5f,0);
                    MoveCarton(carried,Vector3.Lerp(liftStart,visuals.driver.Hands,Mathf.SmoothStep(0,1,clock/.85f)),Quaternion.Slerp(liftRotation,visuals.driver.root.rotation,Mathf.Clamp01(clock/.85f)));
                    if(clock>=.85f)BeginPorchWalk();break;
                case VisitState.WalkingToPorch:
                    if(WalkStep(dt))
                    {
                        if(!FindShelfSpace(out dropTarget)){Status="Clear space on the parcel shelf";break;}
                        Change(VisitState.TurningToPlace,"Courier turning toward the parcel shelf");
                    }FollowHands();break;
                case VisitState.TurningToPlace:
                    Vector3 toward=dropTarget-visuals.driver.root.position;toward.y=0;
                    Quaternion desired=Quaternion.LookRotation(toward);
                    Quaternion turn=Quaternion.RotateTowards(visuals.driver.root.rotation,desired,dt*140);
                    Vector3 hand=visuals.driver.root.position+turn*new Vector3(0,1.08f,.43f);
                    if(!CarriedPoseClear(hand,turn)){Status="Courier waiting for "+pathObstruction+" to clear the carton";break;}
                    SetDriverPose(visuals.driver.root.position,turn);visuals.driver.Pose(0,true,0,0);FollowHands();
                    if(Quaternion.Angle(turn,desired)<.1f){liftStart=carried.position;liftRotation=carried.rotation;Change(VisitState.PlacingCarton,"Courier placing a carton on the parcel shelf");}
                    break;
                case VisitState.PlacingCarton:
                    PlaceOnShelf(dt);break;
                case VisitState.ReturningToVan:
                    if(WalkStep(dt)){if(cartonIndex<active.cartons.Length)BeginCartonWalk();else BeginClosing();}break;
                case VisitState.WalkingToLoadingStand:
                    if(WalkStep(dt)){Face(RearStaging());Change(VisitState.WaitingForLoading,"Load the reserved cartons into the van");}break;
                case VisitState.WaitingForLoading:
                    if(CanDispatch(out string reason)){stableTime+=dt;Status="Load settled. Courier checking the manifest";if(stableTime>=1.25f)Change(VisitState.DepartureWarning,"Van leaves in 3 seconds. Step clear of the ramp");}
                    else {stableTime=0;Status=reason;}break;
                case VisitState.DepartureWarning:
                    if(!CanDispatch(out string warning)){stableTime=0;Change(VisitState.WaitingForLoading,warning);break;}
                    Status="Van leaves in "+Mathf.CeilToInt(Mathf.Max(0,3-clock))+" seconds. Step clear of the ramp";
                    if(clock>=3)
                    {
                        foreach(var body in active.cartons)Restrain(body,new Pose(visuals.root.InverseTransformPoint(body.position),Quaternion.Inverse(visuals.root.rotation)*body.rotation));
                        Walk(VisitState.WalkingToClose,"Courier preparing the van for departure",RearStaging());
                    }break;
                case VisitState.WalkingToClose:
                    if(WalkStep(dt))BeginClosing();break;
                case VisitState.FoldingRamp:
                    if(!RearClear()){Status="Clear the ramp before the van leaves";break;}
                    RampOpen=Mathf.MoveTowards(RampOpen,0,dt*.7f);visuals.SetRamp(RampOpen);
                    if(RampOpen<=0)Change(VisitState.ClosingDoors,"Courier closing the rear doors");break;
                case VisitState.ClosingDoors:
                    if(!RearClear()){Status="Clear the rear doors";break;}
                    RearDoorOpen=Mathf.MoveTowards(RearDoorOpen,0,dt*.7f);visuals.SetRearDoors(RearDoorOpen);
                    if(RearDoorOpen<=0)Walk(VisitState.WalkingToCab,"Courier returning to the cab",new Vector3(5.8f,G+.05f,-23.45f),new Vector3(5.8f,G,-29.4f),CabExit());break;
                case VisitState.WalkingToCab:
                    if(WalkStep(dt)){Change(VisitState.EnteringCab,"Courier getting into the cab");visuals.SetDriverDoor(1);visuals.driver.capsule.enabled=false;}break;
                case VisitState.EnteringCab:
                    if(!CabClear()){clock=Mathf.Max(0,clock-dt);Status="Clear the cab door";break;}
                    SetDriverPose(Vector3.Lerp(CabExit(),SeatPosition(),Mathf.SmoothStep(0,1,clock/1.1f)),visuals.root.rotation);
                    visuals.driver.Pose(0,false,0,Mathf.Clamp01(clock/1.1f));
                    if(clock>=1.1f){doorAmount=1;Change(VisitState.ClosingCab,"Courier closing the cab door");}break;
                case VisitState.ClosingCab:
                    if(!CabClear()){Status="Clear the cab door";break;}
                    doorAmount=Mathf.MoveTowards(doorAmount,0,dt*1.2f);visuals.SetDriverDoor(doorAmount);
                    if(doorAmount<=0){routeClock=0;Change(VisitState.DrivingOut,"Courier returning to the front street");}break;
                case VisitState.DrivingOut: Drive(true,dt);break;
            }
            UpdateRestrained();
        }
        const float G=WarehouseCourierRoute.Ground;
        public void Tick(float deltaTime,bool simulationActive){if(simulationActive)Tick(deltaTime);}
        static Vector3 RearStaging()=>new Vector3(3,G+.05f,-23.45f);
        Vector3 CabExit()=>visuals.root.TransformPoint(new Vector3(-1.75f,0,1.2f));
        Vector3 SeatPosition()=>visuals.root.TransformPoint(new Vector3(-.48f,.18f,1.30f));
        void SeatDriver(){visuals.driver.capsule.enabled=false;SetDriverPose(SeatPosition(),visuals.root.rotation);visuals.driver.Pose(0,false,0,1);}
        void Change(VisitState next,string status){State=next;Status=status;clock=0;}

        void Drive(bool departure,float dt)
        {
            WarehouseCourierRoute.Sample(departure,routeClock+dt,out Vector3 next,out Quaternion rotation,out float steer);
            if(VanBlocked(next,rotation,out string obstacle)){Status="Courier waiting for "+obstacle+" to clear the road";return;}
            float distance=Vector3.Dot(next-visuals.root.position,visuals.root.forward);
            routeClock+=dt;SetVanPose(next,rotation);visuals.Roll(distance,steer);SeatDriver();
            Status=departure?"Courier returning to the front street":"Courier driving from the front street";
            if(!departure && routeClock>=WarehouseCourierRoute.ArrivalDuration)Change(VisitState.OpeningCab,"Courier parked at the parcel entrance");
            if(departure && routeClock>=WarehouseCourierRoute.DepartureDuration)FinishVisit();
        }
        void SetVanPose(Vector3 p,Quaternion q){visuals.root.SetPositionAndRotation(p,q);visuals.body.position=p;visuals.body.rotation=q;}
        void SetDriverPose(Vector3 p,Quaternion q){visuals.driver.root.SetPositionAndRotation(p,q);visuals.driver.body.position=p;visuals.driver.body.rotation=q;}
        void Face(Vector3 point){Vector3 d=point-visuals.driver.root.position;d.y=0;if(d.sqrMagnitude>.0001f)SetDriverPose(visuals.driver.root.position,Quaternion.LookRotation(d));}

        void BeginCartonWalk()
        {
            if(cartonIndex>=active.cartons.Length){BeginClosing();return;}
            var body=active.cartons[cartonIndex];
            if(body==null){Status="The delivery carton is missing";return;}
            float z=visuals.root.InverseTransformPoint(body.position).z;
            Walk(VisitState.WalkingToCarton,"Courier collecting a carton from the van",visuals.root.TransformPoint(new Vector3(0,WarehouseCourierVisuals.DeckHeight,-2.3f)),visuals.root.TransformPoint(new Vector3(0,WarehouseCourierVisuals.DeckHeight,z)));
        }
        void BeginPorchWalk()
        {
            Walk(VisitState.WalkingToPorch,"Courier carrying a carton to the porch",visuals.root.TransformPoint(new Vector3(0,WarehouseCourierVisuals.DeckHeight,-2.3f)),RearStaging(),new Vector3(6.5f,G+.05f,-23.45f),new Vector3(6.5f,G+.05f,-22),new Vector3(6.5f,0,-12.5f),new Vector3(6.5f,0,-11.9f),new Vector3(8.25f,0,-12.10f));
        }
        void DropCarton()
        {
            Rigidbody dropped=carried;MoveCarton(dropped,dropTarget,Quaternion.Euler(0,180,0));
            carried=null;dropped.isKinematic=false;dropped.useGravity=true;dropped.linearVelocity=Vector3.zero;dropped.angularVelocity=Vector3.zero;dropped.WakeUp();
            cartonIndex++;active.dropped?.Invoke(dropped);
            if(cartonIndex>=active.cartons.Length && !active.notified){active.notified=true;active.complete?.Invoke();}
            Walk(VisitState.ReturningToVan,"Courier returning to the van",new Vector3(6.5f,0,-12.5f),new Vector3(6.5f,G+.05f,-22),new Vector3(6.5f,G+.05f,-23.45f),RearStaging());
        }
        void BeginClosing()
        {Change(VisitState.FoldingRamp,"Courier folding the loading ramp");visuals.driver.Pose(0,false,.15f,0);}
        void Walk(VisitState state,string status,params Vector3[] points)
        {walkPath.Clear();walkPath.AddRange(points);pathIndex=0;Change(state,status);visuals.driver.capsule.enabled=true;}
        bool WalkStep(float dt)
        {
            if(pathIndex>=walkPath.Count){visuals.driver.Pose(0,carried!=null,0,0);return true;}
            Vector3 current=visuals.driver.root.position,target=walkPath[pathIndex];
            Vector3 next=Vector3.MoveTowards(current,target,dt*(carried!=null?1.45f:1.8f));
            next.y=GroundHeight(next,target.y);
            if(DriverBlocked(current,next)){Status="Courier waiting for "+pathObstruction+" to clear the walking path";visuals.driver.Pose(0,carried!=null,0,0);FollowHands();return false;}
            Vector3 direction=target-current;direction.y=0;
            Quaternion facing=direction.sqrMagnitude>.001f?Quaternion.LookRotation(direction):visuals.driver.root.rotation;
            float distance=Vector3.Distance(current,next);SetDriverPose(next,Quaternion.RotateTowards(visuals.driver.root.rotation,facing,dt*300));
            visuals.driver.Pose(distance,carried!=null,0,0);FollowHands();
            Vector3 remaining=target-next;remaining.y=0;if(remaining.sqrMagnitude<.0025f)pathIndex++;
            return pathIndex>=walkPath.Count;
        }
        float GroundHeight(Vector3 point,float expected)
        {
            int count=physics.Raycast(new Vector3(point.x,Mathf.Max(point.y,expected)+.5f,point.z),Vector3.down,hits,1.1f,~0,QueryTriggerInteraction.Ignore);
            float best=float.NegativeInfinity;
            for(int i=0;i<count;i++)
            {
                var hit=hits[i];if(hit.collider==null || hit.collider==visuals.driver.capsule || (carried!=null && hit.collider.attachedRigidbody==carried) || hit.normal.y<.65f)continue;
                if(hit.collider.attachedRigidbody!=null && hit.collider.attachedRigidbody!=visuals.body)continue;
                if(Mathf.Abs(hit.point.y-point.y)>.35f)continue;best=Mathf.Max(best,hit.point.y);
            }
            return float.IsNegativeInfinity(best)?point.y:best+.005f;
        }
        void FollowHands(){if(carried!=null)MoveCarton(carried,visuals.driver.Hands,visuals.driver.root.rotation);}
        static void MoveCarton(Rigidbody body,Vector3 p,Quaternion q){if(body==null)return;body.position=p;body.rotation=q;body.transform.SetPositionAndRotation(p,q);}
        void Restrain(Rigidbody body,Pose local)
        {if(!body.isKinematic){body.linearVelocity=Vector3.zero;body.angularVelocity=Vector3.zero;}body.isKinematic=true;body.useGravity=false;restrained[body]=local;MoveCarton(body,visuals.root.TransformPoint(local.position),visuals.root.rotation*local.rotation);}
        void UpdateRestrained(){foreach(var pair in restrained)if(pair.Key!=null)MoveCarton(pair.Key,visuals.root.TransformPoint(pair.Value.position),visuals.root.rotation*pair.Value.rotation);}

        bool FindShelfSpace(out Vector3 target)
        {
            target=Vector3.zero;float lowest=float.PositiveInfinity;
            foreach(float x in new[]{7.99f,8.57f})
            {
                if(!ShelfTarget(x,out Vector3 candidate) || candidate.y>=lowest)continue;
                lowest=candidate.y;target=candidate;
            }
            return !float.IsPositiveInfinity(lowest);
        }
        bool ShelfTarget(float x,out Vector3 target)
        {
            CartonGeometry(carried,out Vector3 centre,out Vector3 half);
            float support=ShelfSupport(x);target=new Vector3(x,support+half.y+.005f,-11.05f)-centre;
            return support>=.54f && support<=1.08f && ShelfTargetClear(target,carried);
        }
        float ShelfSupport(float x)
        {
            float support=float.NegativeInfinity;
            CartonGeometry(carried,out _,out Vector3 half);
            // A single centre ray misses a tilted support's higher corner.
            // Sample the footprint and clear the whole supporting carton.
            for(int column=-1;column<=1;column++)for(int row=-1;row<=1;row++)
            {
                int count=physics.Raycast(new Vector3(x+column*Mathf.Max(.02f,half.x-.04f),2.1f,-11.05f+row*Mathf.Max(.02f,half.z-.04f)),Vector3.down,hits,1.8f,~0,QueryTriggerInteraction.Ignore);
                for(int i=0;i<count;i++)
                {
                    var hit=hits[i];if(hit.collider==null || (carried!=null && hit.collider.attachedRigidbody==carried) || hit.collider.transform.IsChildOf(transform) || hit.normal.y<.85f)continue;
                    float top=hit.collider.attachedRigidbody!=null?hit.collider.bounds.max.y:hit.point.y;
                    support=Mathf.Max(support,top);
                }
            }
            return support;
        }
        void RestartPlacement(Vector3 target)
        {dropTarget=target;liftStart=carried.position;liftRotation=carried.rotation;clock=0;}
        float ShelfTransitHeight(Vector3 half,Vector3 centre)
        {
            float height=Mathf.Max(liftStart.y,dropTarget.y+Mathf.Max(.24f,half.y+.06f));
            // During the turn, a corner sweeps farther out than either final
            // footprint. Clear all neighbouring stock in that swept corridor,
            // including cartons left by an earlier visit, before moving across.
            float radius=new Vector2(half.x,half.z).magnitude+new Vector2(centre.x,centre.z).magnitude+.015f;
            Vector3 min=Vector3.Min(liftStart,dropTarget),max=Vector3.Max(liftStart,dropTarget);
            Vector3 query=(min+max)*.5f;query.y=1.25f;
            Vector3 extents=(max-min)*.5f;extents.x+=radius;extents.z+=radius;extents.y=1.25f;
            int count=physics.OverlapBox(query,extents,overlaps,Quaternion.identity,~0,QueryTriggerInteraction.Ignore);
            for(int i=0;i<count;i++)
            {
                var collider=overlaps[i];
                if(Ignore(collider)||collider.attachedRigidbody==null||collider.attachedRigidbody==carried)continue;
                height=Mathf.Max(height,collider.bounds.max.y+half.y+Mathf.Abs(centre.y)+.025f);
            }
            return height;
        }
        void PlaceOnShelf(float dt)
        {
            CartonGeometry(carried,out Vector3 centre,out Vector3 half);
            if(!ShelfTarget(dropTarget.x+centre.x,out Vector3 current))
            {
                if(FindShelfSpace(out Vector3 alternative))RestartPlacement(alternative);
                else {clock=Mathf.Max(0,clock-dt);Status="Clear space on the parcel shelf: "+pathObstruction;}
                return;
            }
            if(Mathf.Abs(current.y-dropTarget.y)>.015f){RestartPlacement(current);return;}
            dropTarget=current;
            // Lift clear first, move sideways above the stack, then lower
            // vertically. A diagonal move from the courier's hands clips the
            // lower carton's edge and can push it into a permanent obstruction.
            float clearance=ShelfTransitHeight(half,centre);
            Vector3 raised=new Vector3(liftStart.x,clearance,liftStart.z);
            Vector3 above=new Vector3(dropTarget.x,clearance,dropTarget.z);
            Vector3 position;Quaternion rotation;
            if(clock<.35f)
            {position=Vector3.Lerp(liftStart,raised,Mathf.SmoothStep(0,1,clock/.35f));rotation=liftRotation;}
            else if(clock<.95f)
            {float t=Mathf.SmoothStep(0,1,(clock-.35f)/.6f);position=Vector3.Lerp(raised,above,t);rotation=Quaternion.Slerp(liftRotation,Quaternion.Euler(0,180,0),t);}
            else
            {position=Vector3.Lerp(above,dropTarget,Mathf.SmoothStep(0,1,(clock-.95f)/.45f));rotation=Quaternion.Euler(0,180,0);}
            if(!PlacementPoseClear(position,rotation))
            {
                clock=Mathf.Max(0,clock-dt);Status="Clear the carton placement path: "+pathObstruction;return;
            }
            visuals.driver.Pose(0,true,Mathf.Sin(Mathf.Clamp01(clock/1.4f)*Mathf.PI)*.55f,0);
            MoveCarton(carried,position,rotation);
            if(clock>=1.4f)DropCarton();
        }
        bool PlacementPoseClear(Vector3 position,Quaternion rotation)
        {
            CartonGeometry(carried,out Vector3 centre,out Vector3 half);
            int count=physics.OverlapBox(position+rotation*centre,ClearanceExtents(half,-.002f),overlaps,rotation,~0,QueryTriggerInteraction.Ignore);
            if(count==overlaps.Length)return false;
            for(int i=0;i<count;i++)
            {
                var collider=overlaps[i];if(Ignore(collider) || collider.attachedRigidbody==carried)continue;
                pathObstruction=collider.name+" at "+collider.bounds.center;return false;
            }
            return true;
        }
        bool ShelfTargetClear(Vector3 position,Rigidbody ignore)
        {
            CartonGeometry(ignore,out Vector3 centre,out Vector3 half);
            Vector3 shapeCentre=position+centre;
            int count=physics.OverlapBox(shapeCentre,ClearanceExtents(half,-.007f),overlaps,Quaternion.identity,~0,QueryTriggerInteraction.Ignore);
            if(count==overlaps.Length)return false;
            for(int i=0;i<count;i++)
            {
                var collider=overlaps[i];if(collider==null || collider.attachedRigidbody==ignore || collider.transform.IsChildOf(transform))continue;
                // PhysX contact separation can lift a resting support by a few
                // millimetres while the driver lowers the next carton. Treat
                // that contact as support, then follow its measured top plane.
                if(collider.bounds.max.y<=shapeCentre.y-half.y+.03f && collider.bounds.center.y<shapeCentre.y-half.y)continue;
                pathObstruction=collider.name+" at "+collider.bounds.center;return false;
            }
            return true;
        }

        public bool BoxIsOnDeck(Rigidbody body)
        {
            Initialize();if(body==null || !TryBounds(body,out Bounds bounds))return false;
            Vector3 min=new Vector3(float.PositiveInfinity,float.PositiveInfinity,float.PositiveInfinity),max=-min;
            for(int i=0;i<8;i++)
            {
                Vector3 corner=bounds.center+Vector3.Scale(bounds.extents,new Vector3((i&1)==0?-1:1,(i&2)==0?-1:1,(i&4)==0?-1:1));
                Vector3 p=visuals.root.InverseTransformPoint(corner);min=Vector3.Min(min,p);max=Vector3.Max(max,p);
            }
            return min.x>=-.90f && max.x<=.90f && min.z>=-2.31f && max.z<=.67f && min.y>=WarehouseCourierVisuals.DeckHeight-.045f && max.y<=WarehouseCourierVisuals.RoofHeight-.06f;
        }
        public bool CanDispatch(out string reason, bool requireAuthorization = true)
        {
            if(requireAuthorization && DispatchAuthorized!=null && !DispatchAuthorized())
            {reason="Confirm the loaded shipment on the TC22";return false;}
            reason="Wait for the collection van to open";if(!ReadyForLoading)return false;
            if(active.held!=null && active.held()){reason="Put down the held carton before departure";return false;}
            foreach(var body in active.cartons)
            {
                if(body==null){reason="A reserved carton is missing";return false;}
                if(!BoxIsOnDeck(body)){reason="Place every reserved carton fully inside the van";return false;}
                // These sealed trade cartons have no upright-only handling
                // requirement. Any flat face is valid, with the same physical
                // settling, deck support and clearance checks as upright stock.
                float flatFace=Mathf.Max(Mathf.Abs(Vector3.Dot(body.transform.up,Vector3.up)),
                    Mathf.Abs(Vector3.Dot(body.transform.right,Vector3.up)),Mathf.Abs(Vector3.Dot(body.transform.forward,Vector3.up)));
                if(body.isKinematic || body.linearVelocity.sqrMagnitude>.025f || body.angularVelocity.sqrMagnitude>.08f || flatFace<.92f)
                {reason="Let each carton rest flat and settle on the deck";return false;}
                if(!Supported(body,0)){reason="Rest each carton on the deck or a settled carton";return false;}
            }
            int count=physics.OverlapBox(visuals.root.TransformPoint(new Vector3(0,1.08f,-1.5f)),new Vector3(1.1f,1.03f,2.75f),overlaps,visuals.root.rotation,~0,QueryTriggerInteraction.Ignore);
            for(int i=0;i<count;i++)
            {
                var collider=overlaps[i];if(Ignore(collider) || collider.bounds.max.y<G+.20f)continue;
                var body=collider.attachedRigidbody;if(body!=null && Array.IndexOf(active.cartons,body)>=0)continue;
                reason="Clear the van and loading ramp before departure";return false;
            }
            reason="Manifest loaded and clear";return true;
        }
        bool Supported(Rigidbody body,int depth)
        {
            if(depth>6 || !TryBounds(body,out Bounds bounds))return false;
            float floor=visuals.root.position.y+WarehouseCourierVisuals.DeckHeight;
            if(Mathf.Abs(bounds.min.y-floor)<.055f)return true;
            foreach(var other in active.cartons)
            {
                if(other==null || other==body || !TryBounds(other,out Bounds beneath))continue;
                if(Mathf.Abs(bounds.min.y-beneath.max.y)>.055f || bounds.center.y<=beneath.center.y)continue;
                if(bounds.center.x<beneath.min.x+.04f || bounds.center.x>beneath.max.x-.04f || bounds.center.z<beneath.min.z+.04f || bounds.center.z>beneath.max.z-.04f)continue;
                if(Supported(other,depth+1))return true;
            }
            return false;
        }
        static bool TryBounds(Rigidbody body,out Bounds bounds)
        {
            bounds=new Bounds();bool found=false;
            foreach(var collider in body.GetComponentsInChildren<Collider>())
            {if(!collider.enabled || collider.isTrigger)continue;if(!found){bounds=collider.bounds;found=true;}else bounds.Encapsulate(collider.bounds);}
            return found;
        }
        bool Ignore(Collider collider)=>collider==null || !collider.enabled || collider.isTrigger || collider.transform.IsChildOf(transform) || (collider.attachedRigidbody!=null && restrained.ContainsKey(collider.attachedRigidbody));
        public bool VanBlocked(Vector3 position,Quaternion rotation,out string obstacle)
        {
            Initialize();obstacle="an obstacle";
            float upper=WarehouseCourierVisuals.RoofHeight+.12f;
            int count=physics.OverlapBox(position+rotation*new Vector3(0,(upper+.20f)*.5f,0),new Vector3(1.17f,(upper-.20f)*.5f,2.56f),overlaps,rotation,~0,QueryTriggerInteraction.Ignore);
            for(int i=0;i<count;i++)
            {var collider=overlaps[i];if(Ignore(collider) || collider.bounds.max.y<G+.205f)continue;obstacle=collider.name;return true;}
            return false;
        }
        bool DriverBlocked(Vector3 current,Vector3 next)
        {
            int count=physics.OverlapCapsule(next+Vector3.up*.28f,next+Vector3.up*1.49f,.225f,overlaps,~0,QueryTriggerInteraction.Ignore);
            for(int i=0;i<count;i++)
            {
                var collider=overlaps[i];if(Ignore(collider) || (carried!=null && collider.attachedRigidbody==carried) || collider.bounds.max.y<next.y+.10f)continue;
                if(State==VisitState.WalkingToCarton && active.cartons[cartonIndex]!=null && collider.attachedRigidbody==active.cartons[cartonIndex])continue;
                pathObstruction=collider.name;return true;
            }
            if(carried!=null)
            {
                Vector3 hand=next+visuals.driver.root.rotation*new Vector3(0,1.08f,.43f);
                if(!CarriedPoseClear(hand,visuals.driver.root.rotation))return true;
            }
            return false;
        }
        bool CarriedPoseClear(Vector3 position,Quaternion rotation)
        {
            CartonGeometry(carried,out Vector3 centre,out Vector3 half);
            int count=physics.OverlapBox(position+rotation*centre,ClearanceExtents(half,.01f),overlaps,rotation,~0,QueryTriggerInteraction.Ignore);
            if(count==overlaps.Length)return false;
            for(int i=0;i<count;i++)if(!Ignore(overlaps[i]) && overlaps[i].attachedRigidbody!=carried){pathObstruction=overlaps[i].name;return false;}
            return true;
        }
        bool CabClear()
        {
            int count=physics.OverlapBox(visuals.root.TransformPoint(new Vector3(-1.45f,1.05f,1.35f)),new Vector3(.65f,.90f,.90f),overlaps,visuals.root.rotation,~0,QueryTriggerInteraction.Ignore);
            for(int i=0;i<count;i++)if(!Ignore(overlaps[i]) && overlaps[i].bounds.max.y>G+.2f)return false;
            return true;
        }
        bool RearClear()
        {
            int count=physics.OverlapBox(visuals.root.TransformPoint(new Vector3(0,1.05f,-3.28f)),new Vector3(1.12f,1.0f,1.0f),overlaps,visuals.root.rotation,~0,QueryTriggerInteraction.Ignore);
            for(int i=0;i<count;i++)if(!Ignore(overlaps[i]) && overlaps[i].bounds.max.y>G+.20f)return false;
            return true;
        }
        void FinishVisit()
        {
            var finished=active;
            if(!finished.delivery && !finished.notified){finished.notified=true;finished.complete?.Invoke();}
            // The account owner removes shipped stock in its callback. A caller
            // without one retains its cartons offsite, never silently loses them.
            restrained.Clear();active=null;carried=null;visuals.root.gameObject.SetActive(false);visuals.driver.root.gameObject.SetActive(false);
            Change(VisitState.Idle,"Courier available");StartNext();
        }
    }
}
