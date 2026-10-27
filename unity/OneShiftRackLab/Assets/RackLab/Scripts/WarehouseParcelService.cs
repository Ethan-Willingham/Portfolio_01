using UnityEngine;

namespace OneShift.RackLab
{
    // A bounded small-parcel delivery, independent of the dock's pallet stock.
    // The player carries each box to the office desk; no automatic putaway.
    public sealed class WarehouseParcelService : MonoBehaviour
    {
        public WarehouseParcel[] parcels;
        public Transform[] deskPlaces;
        public TextMesh statusLabel;
        public float arrivalSeconds = 35;
        public bool Arrived { get; private set; }
        public int ReceivedCount { get; private set; }
        public WarehouseParcel Carried { get; private set; }
        float elapsed;
        RackWalkController walking;

        void Start()
        {
            walking = Object.FindFirstObjectByType<RackWalkController>();
            foreach (var parcel in parcels) parcel.gameObject.SetActive(false);
            Refresh();
        }

        void Update()
        {
            AdvanceDelivery(Time.deltaTime, Application.isFocused && Time.timeScale > 0);
        }

        public void AdvanceDelivery(float seconds, bool active)
        {
            if (!active) return;
            if (!Arrived)
            {
                elapsed += Mathf.Max(0, seconds);
                if (elapsed >= arrivalSeconds)
                {
                    Arrived = true;
                    foreach (var parcel in parcels) parcel.gameObject.SetActive(true);
                    Refresh();
                }
            }
        }

        void LateUpdate()
        {
            if (Carried == null || walking == null) return;
            // Keep a box below the crosshair and outside the camera near plane.
            Carried.transform.SetPositionAndRotation(walking.eyes.transform.TransformPoint(new Vector3(.19f, -.38f, .72f)),
                Quaternion.Euler(0, walking.eyes.transform.eulerAngles.y, 0));
        }

        public void PickUp(WarehouseParcel parcel)
        {
            if (!Arrived || Carried != null || parcel == null || parcel.Received) return;
            Carried = parcel;
            foreach (var collider in parcel.GetComponentsInChildren<Collider>()) collider.enabled = false;
            Refresh();
        }

        public void Receive()
        {
            if (Carried == null) return;
            var place = deskPlaces[Carried.index];
            Carried.transform.SetPositionAndRotation(place.position, place.rotation);
            Carried.Received = true;
            foreach (var collider in Carried.GetComponentsInChildren<Collider>()) collider.enabled = true;
            Carried = null;
            ReceivedCount++;
            Refresh();
        }

        void Refresh()
        {
            if (statusLabel != null) statusLabel.text = !Arrived ? "PARCELS / delivery due this morning" :
                ReceivedCount == parcels.Length ? "PARCELS / all 3 received" :
                "PARCELS / " + ReceivedCount + " of 3 received";
        }
    }
}
