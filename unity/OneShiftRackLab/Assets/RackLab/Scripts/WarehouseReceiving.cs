using UnityEngine;
using UnityEngine.SceneManagement;

namespace OneShift.RackLab
{
    // A short physical receiving start. Transit restraints release before the
    // doors open. From then on, every pallet moves only through ordinary PhysX.
    [DisallowMultipleComponent]
    public sealed class WarehouseReceiving : MonoBehaviour
    {
        public enum ReceivingPhase { Arriving, Opening, Ready, Complete }
        public static WarehouseReceiving Active { get; private set; }
        public Rigidbody truck;
        public Transform leftDoor, rightDoor, shutter;
        public Vector3 doorLocalAxis = Vector3.up;
        public float leftDoorOpenDegrees = 155, rightDoorOpenDegrees = -155;
        public Transform[] roadWheels = new Transform[0];
        public float roadWheelRadius = .505f;
        public Collider dockBarrier;
        public GameObject dockPlate, wheelChocks;
        public PalletCargo[] cargo;
        public Transform[] storagePositions;
        public Vector3 dockedPosition = new Vector3(0, -1.3325f, 13.05f);
        public float approachDistance = 13;
        public float arrivalSeconds = 16;
        public float openingSeconds = 4;
        public ReceivingPhase Phase { get; private set; }
        public bool DoorsOpen => Phase == ReceivingPhase.Ready || Phase == ReceivingPhase.Complete;
        public int DeliveredCount { get; private set; }
        public int StoredCount { get; private set; }
        public bool WaitingForClearance { get; private set; }
        public string StatusText { get; private set; } = "First delivery arriving at the receiving dock";
        public float ArrivalProgress => Mathf.Clamp01(elapsed / arrivalSeconds);
        Vector3[] cargoOffsets;
        Quaternion[] cargoRotations;
        Quaternion[] wheelRotations;
        Quaternion leftClosed = Quaternion.identity, rightClosed = Quaternion.identity;
        float elapsed, countTimer;
        readonly Collider[] nearby = new Collider[48];
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
            truck.position = dockedPosition + Vector3.forward * approachDistance;
            leftClosed = leftDoor.localRotation; rightClosed = rightDoor.localRotation;
            wheelRotations = new Quaternion[roadWheels.Length];
            for (int i = 0; i < roadWheels.Length; i++) wheelRotations[i] = roadWheels[i].localRotation;
            // The raised warehouse door lets players see the truck arrive.
            // A visible dock barrier protects the open edge until docking ends.
            cargoOffsets = new Vector3[cargo.Length];
            cargoRotations = new Quaternion[cargo.Length];
            for (int i = 0; i < cargo.Length; i++)
            {
                var package = cargo[i];
                package.ApplyMassProperties();
                cargoOffsets[i] = package.transform.position - dockedPosition;
                cargoRotations[i] = package.transform.rotation;
                package.Body.isKinematic = true;
                package.Body.position = truck.position + cargoOffsets[i];
            }
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
                WaitingForClearance = Obstructed(truck.position + new Vector3(0, 2.1f, -.8f), new Vector3(1.5f, 1.1f, .7f));
                if (!WaitingForClearance) elapsed += Time.fixedDeltaTime;
                float t = Mathf.SmoothStep(0, 1, Mathf.Clamp01(elapsed / arrivalSeconds));
                var position = dockedPosition + Vector3.forward * (approachDistance * (1 - t));
                truck.MovePosition(position);
                // The imported local axle points toward world -X; positive
                // local rotation rolls the tyres as the truck backs toward -Z.
                float roll = (dockedPosition.z + approachDistance - position.z) / roadWheelRadius * Mathf.Rad2Deg;
                for (int i = 0; i < roadWheels.Length; i++) roadWheels[i].localRotation = wheelRotations[i] * Quaternion.AngleAxis(roll, Vector3.right);
                for (int i = 0; i < cargo.Length; i++)
                {
                    cargo[i].Body.MovePosition(position + cargoOffsets[i]);
                    cargo[i].Body.MoveRotation(cargoRotations[i]);
                }
                if (elapsed >= arrivalSeconds)
                {
                    truck.position = dockedPosition;
                    for (int i = 0; i < cargo.Length; i++)
                    {
                        cargo[i].Body.position = dockedPosition + cargoOffsets[i];
                        cargo[i].Body.isKinematic = false;
                        cargo[i].Body.linearVelocity = Vector3.zero;
                        cargo[i].Body.angularVelocity = Vector3.zero;
                        cargo[i].Body.WakeUp();
                    }
                    elapsed = 0;
                    if (wheelChocks != null) wheelChocks.SetActive(true);
                    Phase = ReceivingPhase.Opening;
                }
            }
            else if (Phase == ReceivingPhase.Opening)
            {
                // A waiting driver stays behind the visible dock barrier. A person or
                // vehicle in the door sweep holds the sequence until it is clear.
                WaitingForClearance = Obstructed(new Vector3(0, 1.3f, 13.05f), new Vector3(2.9f, 1.4f, 1.5f));
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
                }
            }
            countTimer -= Time.fixedDeltaTime;
            if (countTimer <= 0)
            {
                countTimer = .3f;
                CountStock();
                UpdateStatus();
            }
        }

        public Quaternion DoorPose(bool left, float progress)
        {
            return (left ? leftClosed : rightClosed) * Quaternion.AngleAxis((left ? leftDoorOpenDegrees : rightDoorOpenDegrees) * progress, doorLocalAxis);
        }

        bool Obstructed(Vector3 centre, Vector3 halfExtents)
        {
            int count = physicsScene.OverlapBox(centre, halfExtents, nearby, Quaternion.identity, ~0, QueryTriggerInteraction.Ignore);
            for (int i = 0; i < count; i++)
            {
                var hit = nearby[i];
                if (hit == null || hit.transform.IsChildOf(truck.transform) || hit == dockBarrier) continue;
                var package = hit.GetComponentInParent<PalletCargo>();
                bool delivery = false;
                foreach (var item in cargo) if (package == item) { delivery = true; break; }
                if (delivery) continue;
                if (hit is CharacterController || (hit.attachedRigidbody != null && !hit.attachedRigidbody.isKinematic)) return true;
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
            Phase = StoredCount == cargo.Length ? ReceivingPhase.Complete : ReceivingPhase.Ready;
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
            if (WaitingForClearance) StatusText = "Keep the receiving dock clear for the delivery";
            else if (Phase == ReceivingPhase.Arriving) StatusText = "First delivery backing in. Get the forklift ready.";
            else if (Phase == ReceivingPhase.Opening) StatusText = "Truck parked. Receiving doors opening.";
            else if (Phase == ReceivingPhase.Complete) StatusText = "First delivery stored. Your warehouse is ready.";
            else StatusText = "Unload the trailer and use the wall racks   " + DeliveredCount + "/" + cargo.Length + " unloaded   " + StoredCount + "/" + cargo.Length + " stored";
        }
    }
}
