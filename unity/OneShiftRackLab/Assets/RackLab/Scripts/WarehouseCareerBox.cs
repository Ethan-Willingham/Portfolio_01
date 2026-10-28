using UnityEngine;

namespace OneShift.RackLab
{
    public sealed class WarehouseCareerBox : MonoBehaviour
    {
        public int Sequence;
        public string ProductId;
        public bool InTransit = true, Received, Stored, Reserved, Shipped;
        Rigidbody body;
        public Rigidbody Body => body != null ? body : (body = GetComponent<Rigidbody>());
        public float SettledSeconds;
        public LineRenderer OrderOutline;
        void Awake() { body = GetComponent<Rigidbody>(); }
    }
}
