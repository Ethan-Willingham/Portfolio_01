using UnityEngine;

namespace OneShift.RackLab
{
    // A held Left Shift exposes a centred hydraulic lever. Mouse displacement
    // moves that lever, so its position requests a signed speed, not a height.
    // Deltas already describe distance and must not be divided by frame time.
    public sealed class ForkliftMouseLift
    {
        public const float AxisUnitsToFullTravel = 20f;
        public const float CentreDeadZone = .075f;
        public float Position { get; private set; }
        public float Input => Valve(Position);
        public bool Held { get; private set; }
        public bool NeedsRelease => interrupted;
        bool interrupted;

        public float Tick(bool held, float verticalDelta, float frameSeconds)
        {
            if (!held) { Clear(); return 0; }
            // An interrupted frame must not replay a large pointer delta or
            // retain a moving lever. Require release before starting again.
            if (frameSeconds <= 0 || frameSeconds > .12f || float.IsNaN(frameSeconds) ||
                float.IsNaN(verticalDelta) || float.IsInfinity(verticalDelta))
            {
                Position = 0; Held = false; interrupted = true;
                return 0;
            }
            if (interrupted) return 0;
            if (!Held) Position = 0;
            Held = true;
            Position = Mathf.Clamp(Position + verticalDelta / AxisUnitsToFullTravel, -1, 1);
            return Input;
        }

        public void Clear() { Position = 0; Held = false; interrupted = false; }

        public static float Valve(float position)
        {
            if (float.IsNaN(position) || float.IsInfinity(position)) return 0;
            float magnitude = Mathf.InverseLerp(CentreDeadZone, 1, Mathf.Abs(position));
            // Fine control near centre, full existing hydraulic flow at either
            // end. The lift controller still enforces travel and pressure.
            return Mathf.Sign(position) * magnitude * magnitude;
        }
    }
}
