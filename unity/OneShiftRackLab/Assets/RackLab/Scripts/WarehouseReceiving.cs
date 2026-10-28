using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace OneShift.RackLab
{
    // A short physical receiving start. Transit restraints release before the
    // doors open. From then on, every pallet moves only through ordinary PhysX.
    [DisallowMultipleComponent]
    public sealed class WarehouseReceiving : MonoBehaviour
    {
        public enum ReceivingPhase { Arriving, Opening, Ready, Complete, Closing, Departing, Away }
        public static WarehouseReceiving Active { get; private set; }
        public Rigidbody truck;
        public Transform leftDoor, rightDoor, shutter;
        public Vector3 doorLocalAxis = Vector3.up;
        public float leftDoorOpenDegrees = 155, rightDoorOpenDegrees = -155;
        public Transform[] roadWheels = new Transform[0];
        public Transform tractorPivot;
        public Transform[] steeringPivots = new Transform[0];
        public PalletCargo deliveryPrefab;
        public float roadWheelRadius = .505f;
        public Collider dockBarrier;
        public GameObject dockPlate, wheelChocks;
        public PalletCargo[] cargo;
        public Transform[] storagePositions;
        public Vector3 dockedPosition = new Vector3(0, -1.3325f, 13.05f);
        public float approachDistance = 13;
        public float arrivalSeconds = 55;
        public float openingSeconds = 4;
        public float departureSeconds = 30;
        public ReceivingPhase Phase { get; private set; }
        public bool DoorsOpen => Phase == ReceivingPhase.Ready || Phase == ReceivingPhase.Complete;
        public int DeliveredCount { get; private set; }
        public int StoredCount { get; private set; }
        public bool WaitingForClearance { get; private set; }
        public string StatusText { get; private set; } = "First delivery arriving at the receiving dock";
        public float ArrivalProgress => Mathf.Clamp01(elapsed / arrivalSeconds);
        public bool HasQueuedDelivery => queuedCount > 0;
        public bool HasQueuedPickup => pickupRequested;
        public string DispatchReason { get; private set; } = "";
        public event Action<WarehouseReceiving> DeliveryReady;
        Vector3[] cargoOffsets;
        Quaternion[] cargoRotations;
        Quaternion[] wheelRotations;
        Quaternion[] steeringRotations;
        Vector3[] steeringAxes;
        PalletCargo[] restrainedCargo = new PalletCargo[0];
        PalletCargo[] outboundCargo = new PalletCargo[0];
        readonly HashSet<PalletCargo> restrained = new HashSet<PalletCargo>();
        int queuedCount;
        bool pickupRequested;
        Action<PalletCargo,int> configureQueuedCargo;
        Action departed;
        Quaternion leftClosed = Quaternion.identity, rightClosed = Quaternion.identity;
        float elapsed, countTimer, wheelRoll;
        readonly Collider[] nearby = new Collider[256];
        readonly RaycastHit[] supports = new RaycastHit[12];
        PhysicsScene physicsScene;

        void Awake() { Active = this; }
        void OnDestroy() { if (Active == this) Active = null; }

        void Start()
        {
            physicsScene = gameObject.scene.GetPhysicsScene();
            Phase = ReceivingPhase.Arriving;
            truck.isKinematic = true;
            truck.interpolation = RigidbodyInterpolation.Interpolate;
            leftClosed = leftDoor.localRotation; rightClosed = rightDoor.localRotation;
            wheelRotations = new Quaternion[roadWheels.Length];
            for (int i = 0; i < roadWheels.Length; i++) wheelRotations[i] = roadWheels[i].localRotation;
            steeringRotations = new Quaternion[steeringPivots.Length];
            steeringAxes = new Vector3[steeringPivots.Length];
            for (int i = 0; i < steeringPivots.Length; i++)
            {
                steeringRotations[i] = steeringPivots[i].localRotation;
                steeringAxes[i] = steeringPivots[i].InverseTransformDirection(Vector3.up);
            }
            // The raised warehouse door lets players see the truck arrive.
            // A visible dock barrier protects the open edge until docking ends.
            Restrain(cargo);
            PlaceTruck(WarehouseTruckRoute.Arrival(0,dockedPosition), true);
            dockBarrier.enabled = true;
            dockBarrier.gameObject.SetActive(true);
            if (dockPlate != null) dockPlate.SetActive(false);
            if (wheelChocks != null) wheelChocks.SetActive(false);
            UpdateStatus();
        }

        void FixedUpdate()
        {
            if (Phase == ReceivingPhase.Arriving)
            {
                AdvanceRoute(false);
                if (elapsed >= arrivalSeconds)
                {
                    PlaceTruck(WarehouseTruckRoute.Arrival(1,dockedPosition),true);
                    ReleaseRestraints();
                    elapsed = 0;
                    if (wheelChocks != null) wheelChocks.SetActive(true);
                    Phase = ReceivingPhase.Opening;
                }
            }
            else if (Phase == ReceivingPhase.Opening)
            {
                // A waiting driver stays behind the visible dock barrier. A person or
                // vehicle in the door sweep holds the sequence until it is clear.
                WaitingForClearance = Obstructed(new Vector3(0, 1.3f, 13.05f), new Vector3(2.9f, 1.4f, 1.5f), Quaternion.identity);
                if (!WaitingForClearance) elapsed += Time.fixedDeltaTime;
                float t = Mathf.SmoothStep(0, 1, Mathf.Clamp01(elapsed / openingSeconds));
                leftDoor.localRotation = DoorPose(true, t);
                rightDoor.localRotation = DoorPose(false, t);
                if (elapsed >= openingSeconds)
                {
                    dockBarrier.enabled = false;
                    dockBarrier.gameObject.SetActive(false);
                    if (dockPlate != null) dockPlate.SetActive(true);
                    Phase = ReceivingPhase.Ready;
                    WaitingForClearance = false;
                    DeliveryReady?.Invoke(this);
                }
            }
            else if (Phase == ReceivingPhase.Closing)
            {
                WaitingForClearance = DockOccupied();
                if (!WaitingForClearance) elapsed += Time.fixedDeltaTime;
                float t = 1 - Mathf.SmoothStep(0,1,Mathf.Clamp01(elapsed/openingSeconds));
                leftDoor.localRotation = DoorPose(true,t); rightDoor.localRotation = DoorPose(false,t);
                if (elapsed >= openingSeconds)
                {
                    elapsed = 0; Phase = ReceivingPhase.Departing;
                    if(wheelChocks!=null) wheelChocks.SetActive(false);
                }
            }
            else if (Phase == ReceivingPhase.Departing)
            {
                AdvanceRoute(true);
                if(elapsed >= departureSeconds)
                {
                    // Stock leaves only after the real loaded vehicle has
                    // travelled out of the park. Payment is the owner's callback.
                    var shipped=outboundCargo; outboundCargo=new PalletCargo[0];
                    restrained.Clear();restrainedCargo=new PalletCargo[0];
                    var completed=departed; departed=null;
                    completed?.Invoke();
                    foreach(var item in shipped) if(item!=null) RemoveObject(item.gameObject);
                    Phase=ReceivingPhase.Away;elapsed=0;truck.gameObject.SetActive(false);
                }
            }
            else if (Phase == ReceivingPhase.Away)
            {
                if(HasQueuedDelivery) BeginQueuedDelivery();
                else if(pickupRequested) BeginArrival(0,null);
            }
            else if(HasQueuedDelivery && !DockOccupied()) BeginClosing(new PalletCargo[0],null);
            countTimer -= Time.fixedDeltaTime;
            if (countTimer <= 0)
            {
                countTimer = .3f;
                CountStock();
                UpdateStatus();
            }
        }

        // A single paid shipment can wait while the current freight is handled.
        // Its actual pallets are created at the next street arrival, never in
        // occupied rack positions or on top of stock still inside the trailer.
        public bool RequestDelivery(int palletCount, Action<PalletCargo,int> configureCargo)
        {
            if(HasQueuedDelivery || deliveryPrefab==null || palletCount<1 || palletCount>4) return false;
            queuedCount=palletCount;configureQueuedCargo=configureCargo;
            UpdateStatus();return true;
        }

        // A retailer order can summon an empty truck without requiring a
        // supplier purchase. The existing visit satisfies repeated requests;
        // departure requests wait until the previous manifest has left.
        public bool RequestPickup()
        {
            if(Phase==ReceivingPhase.Away || Phase==ReceivingPhase.Closing || Phase==ReceivingPhase.Departing)
                pickupRequested=true;
            UpdateStatus();return true;
        }

        public bool CanDispatch(PalletCargo[] manifest)
        {
            DispatchReason="";
            if(!DoorsOpen) DispatchReason="Wait for the receiving truck to open.";
            else if(manifest==null || manifest.Length==0 || manifest.Length>4) DispatchReason="Load the order's pallets into the trailer.";
            else
            {
                var unique=new HashSet<PalletCargo>();
                foreach(var item in manifest)
                {
                    if(item==null || !unique.Add(item) || !InsideTrailer(item) || !HasTrailerSupport(item)
                        || item.Body.isKinematic || item.Body.linearVelocity.sqrMagnitude>.0144f || item.Body.angularVelocity.sqrMagnitude>.0225f)
                    { DispatchReason="Rest every order pallet on the trailer deck and withdraw the forks.";break; }
                }
                if(DispatchReason.Length==0 && DockOccupied(unique))
                    DispatchReason="Clear the trailer and dock bridge of people, the forklift, and other stock.";
            }
            return DispatchReason.Length==0;
        }

        public bool TryDispatch(PalletCargo[] manifest, Action onDeparted)
        {
            if(!CanDispatch(manifest)) return false;
            BeginClosing((PalletCargo[])manifest.Clone(),onDeparted);
            return true;
        }

        public bool CanDispatch(PalletCargo[] manifest, out string reason)
        {
            bool ready=CanDispatch(manifest);reason=DispatchReason;return ready;
        }

        bool InsideTrailer(PalletCargo item)
        {
            bool found=false;
            foreach(var collider in item.GetComponentsInChildren<Collider>())
            {
                if(!collider.enabled || collider.isTrigger) continue;
                found=true;var b=collider.bounds;
                for(int mask=0;mask<8;mask++)
                {
                    var p=truck.transform.InverseTransformPoint(new Vector3((mask&1)==0?b.min.x:b.max.x,
                        (mask&2)==0?b.min.y:b.max.y,(mask&4)==0?b.min.z:b.max.z));
                    if(Mathf.Abs(p.x)>1.22f || p.z<.17f || p.z>16.1f || p.y<1.29f || p.y>4.0f) return false;
                }
            }
            return found;
        }

        bool HasTrailerSupport(PalletCargo package)
        {
            int count=physicsScene.Raycast(package.transform.position+Vector3.up*.04f,Vector3.down,supports,.14f,~0,QueryTriggerInteraction.Ignore);
            float nearest=float.PositiveInfinity;Collider surface=null;
            for(int i=0;i<count;i++)
            {
                var hit=supports[i];
                if(hit.collider.GetComponentInParent<PalletCargo>()==package || hit.distance>=nearest)continue;
                nearest=hit.distance;surface=hit.collider;
            }
            return surface!=null && surface.name=="Trailer deck" && surface.transform.IsChildOf(truck.transform) && nearest<.085f;
        }

        bool DockOccupied(HashSet<PalletCargo> allowed=null)
        {
            // Includes the rear door sweep and bridge, with enough height for
            // the standing worker and the forklift mast. A loaded manifest is
            // the only stock exempted during a deliberate dispatch.
            int count=physicsScene.OverlapBox(new Vector3(0,1.25f,21),new Vector3(2.9f,1.6f,9.6f),nearby,Quaternion.identity,~0,QueryTriggerInteraction.Ignore);
            if(count==nearby.Length)return true;
            for(int i=0;i<count;i++)
            {
                var hit=nearby[i];
                if(hit==null || hit.transform.IsChildOf(truck.transform) || hit==dockBarrier)continue;
                var package=hit.GetComponentInParent<PalletCargo>();
                if(package!=null && ((allowed!=null && allowed.Contains(package)) || restrained.Contains(package)))continue;
                if(hit is CharacterController || package!=null || hit.GetComponentInParent<ForkliftDriveController>()!=null
                    || (hit.attachedRigidbody!=null && !hit.attachedRigidbody.isKinematic))return true;
            }
            return false;
        }

        void BeginClosing(PalletCargo[] manifest, Action onDeparted)
        {
            outboundCargo=manifest;departed=onDeparted;
            Restrain(manifest);
            if(dockPlate!=null)dockPlate.SetActive(false);
            dockBarrier.gameObject.SetActive(true);dockBarrier.enabled=true;
            Phase=ReceivingPhase.Closing;elapsed=0;WaitingForClearance=false;UpdateStatus();
        }

        void BeginQueuedDelivery()
        {
            int count=queuedCount;var configure=configureQueuedCargo;
            queuedCount=0;configureQueuedCargo=null;
            BeginArrival(count,configure);
        }

        void BeginArrival(int count, Action<PalletCargo,int> configure)
        {
            pickupRequested=false;
            // Prepare at the normalized dock datum while the truck is hidden;
            // place all bodies on the street in the same simulation step.
            truck.gameObject.SetActive(true);truck.transform.SetPositionAndRotation(dockedPosition,Quaternion.identity);
            truck.position=dockedPosition;truck.rotation=Quaternion.identity;
            if(tractorPivot!=null)tractorPivot.localRotation=Quaternion.identity;
            cargo=new PalletCargo[count];
            for(int i=0;i<count;i++)
            {
                var item=Instantiate(deliveryPrefab,transform);
                item.name="Supplier delivery pallet "+(i+1);
                item.transform.SetPositionAndRotation(new Vector3(0,.014f,14.35f+i*1.8f),Quaternion.identity);
                item.cargoMass=425;item.ApplyMassProperties();
                foreach(var label in item.GetComponentsInChildren<TextMesh>())RemoveObject(label.gameObject);
                foreach(var node in item.GetComponentsInChildren<Transform>())
                    if(node!=null && node.name=="Package weight tag")RemoveObject(node.gameObject);
                cargo[i]=item;
            }
            for(int i=0;i<count;i++)configure?.Invoke(cargo[i],i);
            Restrain(cargo);elapsed=0;DeliveredCount=StoredCount=0;
            leftDoor.localRotation=leftClosed;rightDoor.localRotation=rightClosed;
            PlaceTruck(WarehouseTruckRoute.Arrival(0,dockedPosition),true);
            Phase=ReceivingPhase.Arriving;WaitingForClearance=false;UpdateStatus();
        }

        static void RemoveObject(GameObject item)
        {
            if(Application.isPlaying)Destroy(item);else DestroyImmediate(item);
        }

        void Restrain(PalletCargo[] packages)
        {
            restrainedCargo=packages;restrained.Clear();
            cargoOffsets=new Vector3[packages.Length];cargoRotations=new Quaternion[packages.Length];
            for(int i=0;i<packages.Length;i++)
            {
                var item=packages[i];item.ApplyMassProperties();restrained.Add(item);
                cargoOffsets[i]=Quaternion.Inverse(truck.rotation)*(item.transform.position-truck.position);
                cargoRotations[i]=Quaternion.Inverse(truck.rotation)*item.transform.rotation;
                item.Body.isKinematic=true;
            }
        }

        void ReleaseRestraints()
        {
            foreach(var item in restrainedCargo)
            {
                item.Body.isKinematic=false;item.Body.linearVelocity=Vector3.zero;
                item.Body.angularVelocity=Vector3.zero;item.Body.WakeUp();
            }
            restrainedCargo=new PalletCargo[0];restrained.Clear();
        }

        void AdvanceRoute(bool leaving)
        {
            float duration=leaving?departureSeconds:arrivalSeconds;
            float next=Mathf.Min(duration,elapsed+Time.fixedDeltaTime);
            var pose=leaving?WarehouseTruckRoute.Departure(next/duration,dockedPosition):WarehouseTruckRoute.Arrival(next/duration,dockedPosition);
            var cabRotation=pose.rotation*Quaternion.Euler(0,pose.articulation,0);
            WaitingForClearance=Obstructed(pose.position+pose.rotation*new Vector3(0,2.2f,8.05f),new Vector3(1.5f,2.2f,8.35f),pose.rotation)
                ||Obstructed(pose.position+pose.rotation*new Vector3(0,0,WarehouseTruckRoute.KingpinFromRear)+cabRotation*new Vector3(0,2.1f,3.2f),new Vector3(1.5f,2.2f,5),cabRotation);
            if(WaitingForClearance)return;
            elapsed=next;PlaceTruck(pose,false);
        }

        void PlaceTruck(WarehouseTruckRoute.Pose pose, bool immediate)
        {
            float travel=Vector3.Distance(truck.position,pose.position);
            if(!immediate)wheelRoll+=(pose.reversing?1:-1)*travel/roadWheelRadius*Mathf.Rad2Deg;
            if(immediate){truck.transform.SetPositionAndRotation(pose.position,pose.rotation);truck.position=pose.position;truck.rotation=pose.rotation;}
            else{truck.MovePosition(pose.position);truck.MoveRotation(pose.rotation);}
            if(tractorPivot!=null)tractorPivot.localRotation=Quaternion.Euler(0,pose.articulation,0);
            for(int i=0;i<roadWheels.Length;i++)roadWheels[i].localRotation=wheelRotations[i]*Quaternion.AngleAxis(wheelRoll,Vector3.right);
            for(int i=0;i<steeringPivots.Length;i++)steeringPivots[i].localRotation=steeringRotations[i]*Quaternion.AngleAxis(pose.steering,steeringAxes[i]);
            for(int i=0;i<restrainedCargo.Length;i++)
            {
                var body=restrainedCargo[i].Body;var position=pose.position+pose.rotation*cargoOffsets[i];var rotation=pose.rotation*cargoRotations[i];
                if(immediate){body.position=position;body.rotation=rotation;}
                else{body.MovePosition(position);body.MoveRotation(rotation);}
            }
        }

        public Quaternion DoorPose(bool left, float progress)
        {
            return (left ? leftClosed : rightClosed) * Quaternion.AngleAxis((left ? leftDoorOpenDegrees : rightDoorOpenDegrees) * progress, doorLocalAxis);
        }

        bool Obstructed(Vector3 centre, Vector3 halfExtents, Quaternion rotation)
        {
            int count = physicsScene.OverlapBox(centre, halfExtents, nearby, rotation, ~0, QueryTriggerInteraction.Ignore);
            if(count==nearby.Length)return true;
            for (int i = 0; i < count; i++)
            {
                var hit = nearby[i];
                if (hit == null || hit.transform.IsChildOf(truck.transform) || hit == dockBarrier) continue;
                var package = hit.GetComponentInParent<PalletCargo>();
                if (package!=null && restrained.Contains(package)) continue;
                if (Phase==ReceivingPhase.Opening && package!=null && Array.IndexOf(cargo,package)>=0) continue;
                if (hit is CharacterController || package!=null || hit.GetComponentInParent<ForkliftDriveController>()!=null
                    || (hit.attachedRigidbody != null && !hit.attachedRigidbody.isKinematic)) return true;
            }
            return false;
        }

        void CountStock()
        {
            DeliveredCount = StoredCount = 0;
            if (!DoorsOpen) return;
            foreach (var package in cargo)
            {
                if (package == null) continue;
                if (package.transform.position.z < 11.5f) DeliveredCount++;
                if (package.Body.linearVelocity.sqrMagnitude > .01f || package.Body.angularVelocity.sqrMagnitude > .01f) continue;
                foreach (var slot in storagePositions)
                {
                    var offset = slot.InverseTransformPoint(package.transform.position);
                    if (Mathf.Abs(offset.x) > .36f || Mathf.Abs(offset.z) > .42f || Mathf.Abs(offset.y) > .065f) continue;
                    // A low package at the slot still needs support from the
                    // floor or rack, not merely from forks held nearby.
                    if (HasStorageSupport(package))
                    { StoredCount++; break; }
                }
            }
            Phase = cargo.Length>0 && StoredCount == cargo.Length ? ReceivingPhase.Complete : ReceivingPhase.Ready;
        }

        bool HasStorageSupport(PalletCargo package)
        {
            int count = physicsScene.Raycast(package.transform.position + Vector3.up * .04f, Vector3.down, supports, .13f, ~0, QueryTriggerInteraction.Ignore);
            float nearest = float.PositiveInfinity;
            Collider surface = null;
            for (int i = 0; i < count; i++)
            {
                var candidate = supports[i];
                if (candidate.collider.GetComponentInParent<PalletCargo>() == package || candidate.distance >= nearest) continue;
                nearest = candidate.distance;
                surface = candidate.collider;
            }
            return surface != null && surface.GetComponentInParent<ForkliftDriveController>() == null
                && surface.GetComponentInParent<PalletCargo>() == null && nearest <= .075f;
        }

        void UpdateStatus()
        {
            if (WaitingForClearance) StatusText = "Keep the truck route and receiving dock clear.";
            else if (Phase == ReceivingPhase.Arriving) StatusText = WarehouseTruckRoute.Arrival(ArrivalProgress,dockedPosition).reversing
                ? "Delivery backing to the dock. Get the forklift ready." : "Delivery arriving from the business park street.";
            else if (Phase == ReceivingPhase.Opening) StatusText = "Truck parked. Receiving doors opening.";
            else if (Phase == ReceivingPhase.Closing) StatusText = "Dock secured. Trailer doors closing.";
            else if (Phase == ReceivingPhase.Departing) StatusText = "Truck departing for the business park street.";
            else if (Phase == ReceivingPhase.Away && pickupRequested) StatusText = "Empty truck booked for retailer pickup.";
            else if (Phase == ReceivingPhase.Away) StatusText = "Dock available. Order stock at the office computer.";
            else if (HasQueuedDelivery) StatusText = "Supplier delivery queued. Empty the trailer and clear the dock.";
            else if (cargo.Length==0) StatusText = "Empty trailer ready. Load the retailer order, then dispatch at the office.";
            else if (Phase == ReceivingPhase.Complete) StatusText = "First delivery stored. Your warehouse is ready.";
            else StatusText = "Unload the trailer and use the wall racks   " + DeliveredCount + "/" + cargo.Length + " unloaded   " + StoredCount + "/" + cargo.Length + " stored";
        }
    }
}
