using UnityEngine;

namespace OneShift.RackLab
{
    public sealed class WarehouseParcel : MonoBehaviour
    {
        public WarehouseParcelService service;
        public int index;
        public bool Received { get; internal set; }
    }
}
