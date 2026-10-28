using UnityEngine;

namespace OneShift.RackLab
{
    // Opt in individual loose cartons. Pallets, vehicles and unmarked scenery
    // remain outside the hand-carry system even if they have a Rigidbody.
    [DisallowMultipleComponent, RequireComponent(typeof(Rigidbody)), RequireComponent(typeof(BoxCollider))]
    public sealed class WarehouseGrabbable : MonoBehaviour
    {
        public string label = "Carton";
        [Range(.1f, WarehouseGrabber.MaximumMass)] public float maximumMass = WarehouseGrabber.MaximumMass;
        public bool pickupEnabled = true;
        public string Label => string.IsNullOrWhiteSpace(label) ? "Carton" : label;
        public WarehouseGrabber Holder { get; internal set; }

        void OnDisable()
        {
            if (Holder != null) Holder.Release();
        }
    }
}
