namespace OneShift.RackLab
{
    // A nearby world object may expose one contextual action to the walker.
    // A modal owner calls SetExternalControl(false) before opening its screen.
    public interface IWarehouseInteraction
    {
        string Prompt { get; }
        string ActionKey { get; }
        void Interact(RackWalkController walking);
    }
}
