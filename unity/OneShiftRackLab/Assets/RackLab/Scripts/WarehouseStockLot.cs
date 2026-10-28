using UnityEngine;

namespace OneShift.RackLab
{
    // Stock follows its real pallet. Receiving and dispatch never create a
    // second virtual copy of a case, and inspecting a load cannot move it.
    [DisallowMultipleComponent, RequireComponent(typeof(PalletCargo))]
    public sealed class WarehouseStockLot : MonoBehaviour, IWarehouseInteraction
    {
        public string LotId;
        public string ProductId;
        public string ProductName;
        public int CaseCount;
        public int Sequence;
        public int ArrivalDay = 1;
        public bool Received;
        public bool Shipped;
        public PalletCargo Cargo { get; private set; }
        public string Prompt => ProductName + " / " + CaseCount + " cases / " + LotId;
        public string ActionKey => "";
        void Awake() { Cargo = GetComponent<PalletCargo>(); }
        public void Interact(RackWalkController walking) { }
    }
}
