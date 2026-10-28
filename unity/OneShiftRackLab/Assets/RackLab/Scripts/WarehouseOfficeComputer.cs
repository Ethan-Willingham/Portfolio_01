using UnityEngine;

namespace OneShift.RackLab
{
    public sealed class WarehouseOfficeComputer : MonoBehaviour, IWarehouseInteraction
    {
        public string Prompt => "Use warehouse computer";
        public string ActionKey => "E";
        public void Interact(RackWalkController walking)
        {
            if (walking == null || !walking.CanControl || walking.VehicleMode) return;
            var browser = Object.FindFirstObjectByType<BrowserLifecycle>();
            if (browser != null) browser.OpenComputer();
        }
    }
}
