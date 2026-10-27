using UnityEngine;

namespace OneShift.RackLab
{
    public sealed class WarehouseOfficeDoor : MonoBehaviour
    {
        public Transform leaf;
        public BoxCollider doorwayBlocker;
        public bool IsOpen { get; private set; }
        public string Prompt => IsOpen ? "Close front door" : "Open front door / parcels";
        float angle;

        public void Toggle()
        {
            // Never close a blocker around a person standing in the doorway.
            if (IsOpen)
            {
                var hits = Physics.OverlapBox(doorwayBlocker.transform.TransformPoint(doorwayBlocker.center),
                    doorwayBlocker.size * .5f + new Vector3(.15f, 0, .3f), doorwayBlocker.transform.rotation,
                    ~0, QueryTriggerInteraction.Ignore);
                foreach (var hit in hits) if (hit is CharacterController) return;
            }
            IsOpen = !IsOpen;
            doorwayBlocker.enabled = !IsOpen;
        }

        void Update()
        {
            if (Time.timeScale <= 0 || !Application.isFocused) return;
            angle = Mathf.MoveTowards(angle, IsOpen ? 100 : 0, Time.deltaTime * 150);
            leaf.localRotation = Quaternion.Euler(0, angle, 0);
        }
    }
}
