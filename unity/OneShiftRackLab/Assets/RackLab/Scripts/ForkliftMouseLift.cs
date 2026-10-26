using UnityEngine;

namespace OneShift.RackLab
{
    // Mouse deltas describe movement during this rendered frame. Normalize by
    // its duration so the same hand speed requests the same valve opening at
    // 30, 60 or 120 Hz. No accumulated target or residual command survives.
    public static class ForkliftMouseLift
    {
        public static float Valve(bool held, float verticalDelta, float frameSeconds)
        {
            if (!held || frameSeconds <= 0 || frameSeconds > .12f ||
                float.IsNaN(verticalDelta) || float.IsInfinity(verticalDelta)) return 0;
            return Mathf.Clamp(verticalDelta * .025f / frameSeconds, -1, 1);
        }
    }
}
