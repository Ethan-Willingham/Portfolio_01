using UnityEngine;
using UnityEngine.Rendering;

namespace OneShift.RackLab
{
    // Thirteen rigid bones, two small meshes and a shared palette material.
    // Animation follows measured motion rather than advancing while blocked.
    [DefaultExecutionOrder(150)]
    public sealed class WarehousePlayerVisual : MonoBehaviour
    {
        public RackWalkController walking;
        public ForkliftPlayerInteraction driver;
        public Transform seat;
        public Transform operatorEye;
        public Transform pelvis, spine, head;
        public Transform leftArm, leftForearm, rightArm, rightForearm;
        public Transform leftThigh, leftShin, leftFoot, rightThigh, rightShin, rightFoot;
        public SkinnedMeshRenderer bodyRenderer, headRenderer;
        public const float SeatedRootBelowSeat = .84f;
        public const float SeatedEyeAboveSeat = RackWalkController.StandingEyeHeight - SeatedRootBelowSeat;
        Vector3 previousPosition;
        float stride, amount;
        bool initialized, wasDriving;

        void OnEnable()
        {
            RestoreOwnViewHead();
            initialized = false;
        }

        void RestoreOwnViewHead()
        {
            if (headRenderer == null) return;
            bool firstPerson = driver == null || !driver.IsDriving || driver.CabView;
            headRenderer.shadowCastingMode = firstPerson ? ShadowCastingMode.ShadowsOnly : ShadowCastingMode.On;
        }

        void LateUpdate()
        {
            // Keep one stable mode across the entire render frame, including
            // reflection cameras. Only the external chase view shows the face;
            // walking and cab views retain its complete shadow silhouette.
            RestoreOwnViewHead();
            if (walking == null || pelvis == null) return;
            bool driving = driver != null && driver.IsDriving && driver.vehicle != null;
            if (driving)
            {
                var vehicle = driver.vehicle.transform;
                Vector3 anchor = seat != null ? seat.position : vehicle.TransformPoint(new Vector3(0, 1.215f, -.2f));
                transform.SetPositionAndRotation(anchor - vehicle.up * SeatedRootBelowSeat, vehicle.rotation);
                PoseSeated();
                // The camera uses the same anatomical eye height as the body.
                // The authored seat stays fixed, including on ramps and rolls.
                if (operatorEye != null)
                    operatorEye.position = anchor + vehicle.up * SeatedEyeAboveSeat + vehicle.forward * .035f;
                if (driver.CabView && operatorEye != null) walking.eyes.transform.position = operatorEye.position;
                amount = 0;
            }
            else
            {
                transform.SetPositionAndRotation(walking.transform.position, walking.transform.rotation);
                float dt = Time.deltaTime;
                Vector3 delta = walking.transform.position - previousPosition;
                delta.y = 0;
                if (!initialized || wasDriving || delta.sqrMagnitude > 1) delta = Vector3.zero;
                float speed = dt > .00001f ? delta.magnitude / dt : 0;
                bool active = walking.CanControl && dt > 0;
                float target = active ? Mathf.Clamp01(speed / walking.walkSpeed) : 0;
                if (dt > 0) amount = Mathf.MoveTowards(amount, target, dt * 7);
                if (active) stride += delta.magnitude * 7.5f;
                float swing = Mathf.Sin(stride) * amount;
                float backward = Vector3.Dot(delta, walking.transform.forward) < -.0001f ? -1 : 1;
                pelvis.localPosition = new Vector3(0, .92f + Mathf.Abs(Mathf.Sin(stride * 2)) * .012f * amount, -.055f);
                pelvis.localRotation = Quaternion.identity;
                spine.localRotation = Quaternion.Euler(2 * amount, 0, -swing * 1.2f);
                head.localRotation = Quaternion.identity;
                leftThigh.localRotation = Quaternion.Euler(swing * 29 * backward, 0, -2);
                rightThigh.localRotation = Quaternion.Euler(-swing * 29 * backward, 0, 2);
                leftShin.localRotation = Quaternion.Euler(Mathf.Max(0, -swing * backward) * 30, 0, 0);
                rightShin.localRotation = Quaternion.Euler(Mathf.Max(0, swing * backward) * 30, 0, 0);
                leftFoot.localRotation = rightFoot.localRotation = Quaternion.identity;
                leftArm.localRotation = Quaternion.Euler(-swing * 19 * backward, 0, -5);
                rightArm.localRotation = Quaternion.Euler(swing * 19 * backward, 0, 5);
                leftForearm.localRotation = rightForearm.localRotation = Quaternion.Euler(-8 - amount * 10, 0, 0);
                if (walking.CarryingParcel)
                {
                    // Keep the normal gait below the parcel, but bring both
                    // hands forward around its lower corners instead of
                    // letting the carrying arms swing through the cardboard.
                    leftArm.localRotation = Quaternion.Euler(-67, 0, 35);
                    rightArm.localRotation = Quaternion.Euler(-58, 0, 0);
                    leftForearm.localRotation = Quaternion.Euler(-30, 0, -10);
                    rightForearm.localRotation = Quaternion.Euler(-38, 0, 0);
                }
            }
            initialized = true;
            previousPosition = walking.transform.position;
            wasDriving = driving;
        }

        void PoseSeated()
        {
            pelvis.localPosition = new Vector3(0, .92f, -.055f);
            pelvis.localRotation = Quaternion.identity;
            spine.localRotation = Quaternion.Euler(7, 0, 0);
            head.localRotation = Quaternion.Euler(-7, 0, 0);
            leftThigh.localRotation = Quaternion.Euler(-83, 0, -6);
            rightThigh.localRotation = Quaternion.Euler(-83, 0, 6);
            leftShin.localRotation = rightShin.localRotation = Quaternion.Euler(82, 0, 0);
            leftFoot.localRotation = rightFoot.localRotation = Quaternion.Euler(-8, 0, 0);
            leftArm.localRotation = Quaternion.Euler(-28, -6, 8);
            leftForearm.localRotation = Quaternion.Euler(-28, 0, 0);
            rightArm.localRotation = Quaternion.Euler(-20, 8, -7);
            rightForearm.localRotation = Quaternion.Euler(-24, 0, 0);
        }
    }
}
