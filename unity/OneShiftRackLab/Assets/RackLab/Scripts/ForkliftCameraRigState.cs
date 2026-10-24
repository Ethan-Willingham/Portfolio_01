using UnityEngine;

namespace OneShift.RackLab
{
    // Keep the orbit in one coordinate frame. Translational lag followed by a
    // distance-based snap made tight turns alternate between two camera paths.
    public sealed class ForkliftCameraRigState
    {
        public const float MaximumDistance = 5.8f;
        public float Yaw { get; private set; }
        public float Pitch { get; private set; }
        public float Distance { get; private set; } = MaximumDistance;
        public Vector3 Direction => Quaternion.Euler(Pitch, Yaw, 0) * Vector3.back;
        bool initialized;
        float distanceVelocity;

        public void Reset() { initialized = false; distanceVelocity = 0; }

        public void Aim(float yaw, float pitch, float deltaTime, bool snap)
        {
            if (!initialized || snap)
            {
                Yaw = yaw;
                Pitch = pitch;
                Distance = MaximumDistance;
                distanceVelocity = 0;
                initialized = true;
                return;
            }
            float dt = Mathf.Max(0, deltaTime);
            Yaw += Mathf.DeltaAngle(Yaw, yaw) * (1 - Mathf.Exp(-dt / .09f));
            Pitch = Mathf.Lerp(Pitch, pitch, 1 - Mathf.Exp(-dt / .065f));
            Yaw = Mathf.Repeat(Yaw + 180, 360) - 180;
        }

        public Pose Place(Vector3 focus, float clearance, float deltaTime, bool snap)
        {
            float allowed = Mathf.Clamp(clearance, .12f, MaximumDistance);
            // Only a measured obstacle can shorten the boom immediately.
            // Moving the truck never decides whether to snap the camera.
            if (snap || allowed < Distance)
            {
                Distance = allowed;
                distanceVelocity = 0;
            }
            else if (deltaTime > 0)
                Distance = Mathf.Min(allowed, Mathf.SmoothDamp(Distance, allowed,
                    ref distanceVelocity, .20f, Mathf.Infinity, deltaTime));
            Vector3 direction = Direction;
            return new Pose(focus + direction * Distance, Quaternion.LookRotation(-direction, Vector3.up));
        }
    }
}
