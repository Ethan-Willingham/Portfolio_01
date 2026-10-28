using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace OneShift.RackLab
{
    // The carton remains a dynamic, colliding body throughout a hold. A bounded
    // force follows a swept target; a bounded torque follows the chosen rotation.
    // There is no attachment, parenting, kinematic movement or transform snap.
    [DisallowMultipleComponent, RequireComponent(typeof(RackWalkController))]
    public sealed class WarehouseGrabber : MonoBehaviour
    {
        public const float MaximumMass = 25f;
        public const float PickupReach = 2.6f;
        public const float MinimumDistance = 1f;
        public const float MaximumDistance = 2.4f;
        public const float MaximumHoldSpeed = 6.2f;
        public const float MaximumHoldAcceleration = 32f;
        public const float MaximumHoldForce = 650f;
        public const float MaximumReleaseSpeed = .65f;
        const float Skin = .025f;
        const float MaximumRadius = .78f;
        const float RotationSensitivity = 3f;
        const int QueryCapacity = 48;

        RackWalkController walking;
        Rigidbody heldBody, aimBody;
        BoxCollider heldBox;
        WarehouseGrabbable heldMarker, aimMarker;
        PhysicsScene physics;
        Quaternion rotationInView;
        Vector3 halfExtents, scaledBoxCentre, lastViewPosition;
        float holdDistance = 1.5f, occludedSeconds;
        bool hasViewPosition;
        CollisionDetectionMode originalDetection;
        RigidbodyInterpolation originalInterpolation;
        int originalSolverIterations, originalVelocityIterations;
        float originalDepenetration;
        readonly RaycastHit[] hits = new RaycastHit[QueryCapacity];
        readonly Collider[] overlaps = new Collider[QueryCapacity];
        readonly List<IgnoredPair> ignoredPairs = new List<IgnoredPair>();

        struct IgnoredPair { public Collider carton, player; }

        public Rigidbody HeldBody => heldBody;
        public Rigidbody AimBody => aimBody;
        public bool IsHolding => heldBody != null;
        public bool IsRotating { get; private set; }
        public float HoldDistance => holdDistance;
        public float HoldErrorMetres { get; private set; }
        public float HeldSpeedMps => heldBody == null ? 0 : heldBody.linearVelocity.magnitude;
        public float AppliedForceNewtons { get; private set; }
        public bool HasObstruction { get; private set; }
        public Vector3 HoldTarget { get; private set; }
        public string LastReleaseReason { get; private set; } = "";
        public string HeldLabel => heldMarker == null ? "" : heldMarker.Label;
        public string AimLabel => aimMarker == null ? "" : aimMarker.Label;
        public string HintKey => IsHolding ? IsRotating ? "Right mouse" : "E / Click" : aimBody != null ? "E / Click" : "";
        public string Hint => IsHolding ? IsRotating ? "Rotate with the mouse. Release right mouse to look." :
            "Put down " + HeldLabel + ". Wheel: distance. Hold right mouse: rotate." :
            aimBody != null ? "Pick up " + AimLabel : "";

        void Awake() { Bind(GetComponent<RackWalkController>()); }

        public void Bind(RackWalkController owner)
        {
            if (walking != owner && IsHolding) Suspend();
            walking = owner;
            physics = gameObject.scene.GetPhysicsScene();
        }

        bool ControlsAvailable => walking != null && walking.eyes != null && walking.CanControl && !walking.CarryingParcel;
        Transform View => walking.eyes.transform;

        void FixedUpdate() { TickPhysics(Time.fixedDeltaTime); }
        void Update()
        {
            // FixedUpdate does not run at timeScale zero. This also handles an
            // independently disabled walking controller without a stale hold.
            if (IsHolding && (!ControlsAvailable || !walking.isActiveAndEnabled)) Suspend();
            RestoreSeparatedCollisions(false);
        }
        void OnDisable() { Suspend(); RestoreSeparatedCollisions(true); }
        void OnDestroy() { Suspend(); RestoreSeparatedCollisions(true); }
        void OnApplicationFocus(bool focused) { if (!focused) Suspend(); }
        void OnApplicationPause(bool paused) { if (paused) Suspend(); }

        public void ClearAim() { aimBody = null; aimMarker = null; }

        public void RefreshAim()
        {
            ClearAim();
            if (!ControlsAvailable || IsHolding || !physics.IsValid()) return;
            // A small aim volume is forgiving around a carton edge, but the
            // nearest solid surface wins. It cannot select through a wall.
            int count = physics.SphereCast(View.position, .045f, View.forward, hits, PickupReach, ~0, QueryTriggerInteraction.Ignore);
            if (count == QueryCapacity) return;
            float nearest = float.PositiveInfinity;
            Collider candidate = null;
            for (int i = 0; i < count; i++)
            {
                var hit = hits[i];
                if (IsPlayer(hit.collider) || hit.distance >= nearest) continue;
                nearest = hit.distance;
                candidate = hit.collider;
            }
            if (candidate != null && Eligible(candidate.attachedRigidbody, out var box, out var marker))
            {
                aimBody = box.attachedRigidbody;
                aimMarker = marker;
            }
        }

        public bool TryPickup(Rigidbody body)
        {
            if (IsHolding || !ControlsAvailable || !physics.IsValid() ||
                !Eligible(body, out var box, out var marker)) return false;
            Vector3 centre = box.bounds.center;
            if (Vector3.Distance(View.position, box.ClosestPoint(View.position)) > PickupReach ||
                Vector3.Distance(View.position, centre) > PickupReach + .35f ||
                !Visible(centre, body) || body.linearVelocity.sqrMagnitude > 9f) return false;

            heldBody = body;
            heldBox = box;
            heldMarker = marker;
            marker.Holder = this;
            halfExtents = Vector3.Scale(box.size * .5f, Abs(box.transform.lossyScale));
            scaledBoxCentre = Vector3.Scale(box.center, box.transform.lossyScale);
            holdDistance = Mathf.Clamp(Vector3.Distance(View.position, centre), SafeMinimumDistance, MaximumDistance);
            rotationInView = Quaternion.Inverse(View.rotation) * body.rotation;
            originalDetection = body.collisionDetectionMode;
            originalInterpolation = body.interpolation;
            originalSolverIterations = body.solverIterations;
            originalVelocityIterations = body.solverVelocityIterations;
            originalDepenetration = body.maxDepenetrationVelocity;
            body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            body.interpolation = RigidbodyInterpolation.Interpolate;
            body.solverIterations = Mathf.Max(8, originalSolverIterations);
            body.solverVelocityIterations = Mathf.Max(4, originalVelocityIterations);
            body.maxDepenetrationVelocity = Mathf.Min(1.5f, originalDepenetration);
            IgnorePlayerCollisions();
            lastViewPosition = View.position;
            hasViewPosition = true;
            occludedSeconds = 0;
            HoldErrorMetres = AppliedForceNewtons = 0;
            LastReleaseReason = "";
            HasObstruction = IsRotating = false;
            ClearAim();
            body.WakeUp();
            return true;
        }

        bool Eligible(Rigidbody body, out BoxCollider box, out WarehouseGrabbable marker)
        {
            box = null; marker = null;
            if (body == null || !body.gameObject.activeInHierarchy || body.isKinematic || !body.detectCollisions ||
                body.mass < .1f || body.mass > MaximumMass || body.gameObject.scene != gameObject.scene ||
                body.GetComponentInParent<PalletCargo>() != null || body.GetComponentInChildren<PalletCargo>() != null ||
                body.GetComponentInParent<ForkliftDriveController>() != null || body.GetComponentInChildren<ForkliftDriveController>() != null ||
                body.GetComponent<WarehouseParcel>() != null || body.GetComponents<Joint>().Length != 0) return false;
            marker = body.GetComponent<WarehouseGrabbable>();
            if (marker == null || !marker.isActiveAndEnabled || !marker.pickupEnabled ||
                body.mass > marker.maximumMass || (marker.Holder != null && marker.Holder != this)) return false;
            // The explicit carton marker supports a single solid box. Reject
            // compound or nested bodies instead of sweeping an incomplete shape.
            foreach (var collider in body.GetComponentsInChildren<Collider>())
            {
                if (!collider.enabled || collider.isTrigger) continue;
                if (collider.attachedRigidbody != body || collider.gameObject != body.gameObject ||
                    !(collider is BoxCollider candidate) || box != null) return false;
                box = candidate;
            }
            if (box == null || IsPlayer(box)) return false;
            Vector3 extent = Vector3.Scale(box.size * .5f, Abs(box.transform.lossyScale));
            return extent.x > .01f && extent.y > .01f && extent.z > .01f &&
                Mathf.Max(extent.x, Mathf.Max(extent.y, extent.z)) <= .6f && extent.magnitude <= MaximumRadius;
        }

        public bool ConsumeUse()
        {
            if (IsHolding) { Release(); return true; }
            if (aimBody == null) return false;
            TryPickup(aimBody);
            return true;
        }

        public void HandlePointerInput(bool rotate, Vector2 mouseDelta, float wheelNotches)
        {
            IsRotating = IsHolding && ControlsAvailable && rotate;
            if (!IsHolding || !ControlsAvailable) return;
            AdjustDistance(wheelNotches);
            if (!IsRotating || !Finite(mouseDelta.x) || !Finite(mouseDelta.y)) return;
            Quaternion target = View.rotation * rotationInView;
            target = Quaternion.AngleAxis(Mathf.Clamp(mouseDelta.x * RotationSensitivity, -20, 20), View.up) *
                Quaternion.AngleAxis(Mathf.Clamp(-mouseDelta.y * RotationSensitivity, -20, 20), View.right) * target;
            rotationInView = Quaternion.Inverse(View.rotation) * target;
        }

        public void AdjustDistance(float wheelNotches)
        {
            if (!IsHolding || !Finite(wheelNotches)) return;
            holdDistance = Mathf.Clamp(holdDistance + Mathf.Clamp(wheelNotches, -10, 10) * .2f, SafeMinimumDistance, MaximumDistance);
        }

        float SafeMinimumDistance => Mathf.Max(MinimumDistance, halfExtents.magnitude + RackWalkController.BodyRadius + .15f);
        Vector3 BoxCentre => heldBody.position + heldBody.rotation * scaledBoxCentre;

        public void TickPhysics(float seconds)
        {
            RestoreSeparatedCollisions(false);
            AppliedForceNewtons = 0;
            if (!IsHolding) return;
            if (!ControlsAvailable || !walking.isActiveAndEnabled || seconds <= 0 || seconds > .05f || !Finite(seconds))
            { Drop("controls inactive"); return; }
            if (heldBox == null || !heldBox.enabled || heldBody.isKinematic || !heldBody.detectCollisions ||
                heldMarker == null || !heldMarker.isActiveAndEnabled || !heldMarker.pickupEnabled ||
                heldBody.mass > Mathf.Min(MaximumMass, heldMarker.maximumMass))
            { Drop("carton unavailable"); return; }
            Vector3 centre = BoxCentre;
            if (!Finite(centre.sqrMagnitude) || Vector3.Distance(View.position, centre) > PickupReach + .85f ||
                (hasViewPosition && Vector3.Distance(View.position, lastViewPosition) > 1f))
            { Drop("out of reach"); return; }
            lastViewPosition = View.position;
            hasViewPosition = true;
            bool bodyVisible = Visible(centre, heldBody);
            occludedSeconds = bodyVisible ? 0 : occludedSeconds + seconds;
            if (occludedSeconds >= .2f) { Drop("view obstructed"); return; }
            if (!bodyVisible)
            {
                // A person can briefly cross the sight line. Brake the real
                // carton where it is during that grace period; never pull or
                // rotate it toward a target through the intervening surface.
                HasObstruction = true;
                HoldTarget = centre;
                HoldErrorMetres = 0;
                ApplyHoldForce(Vector3.zero);
                ApplyRotation(heldBody.rotation);
                return;
            }

            // The carton never occupies the eyes. In a low van the player's
            // head can be near the roof while the held carton is safely lower
            // and ahead. Guard the near segment with sight, then sweep the full
            // box from its nearest allowed hold point. The second volume sweep
            // follows the actual body and prevents dragging it through corners.
            float nearest = SafeMinimumDistance;
            Vector3 nearPoint = View.position + View.forward * nearest;
            bool nearVisible = Visible(nearPoint, heldBody);
            bool nearClear = nearVisible && HoldingVolumeClear(nearPoint, heldBody.rotation);
            // A requested hold point can briefly overlap a doorway corner
            // while turning. Keep the real carton stopped by its physical
            // sweep, then let it follow once the view clears the corner. An
            // blocked requested sight line does not mean the real body is
            // hidden. Its own visibility and swept path remain authoritative.
            float distance = nearClear ? nearest +
                SweepDistance(nearPoint, View.forward, Mathf.Max(0, holdDistance - nearest), heldBody.rotation) : holdDistance;
            HasObstruction = !nearClear || distance < holdDistance - .001f;
            Vector3 target = View.position + View.forward * distance;
            target = SlideTarget(centre, target, heldBody.rotation);
            HoldTarget = target;
            HoldErrorMetres = Vector3.Distance(centre, View.position + View.forward * distance);
            // A visible body can remain constrained at a corner while the
            // player steps clear. The hard reach and actual-occlusion guards
            // govern release; a large requested-target error alone does not.

            Vector3 desiredVelocity = Vector3.ClampMagnitude((target - centre) * 12f, MaximumHoldSpeed);
            ApplyHoldForce(desiredVelocity);
            ApplyRotation(View.rotation * rotationInView);
        }

        void ApplyHoldForce(Vector3 desiredVelocity)
        {
            Vector3 acceleration = (desiredVelocity - heldBody.linearVelocity) * 14f;
            if (heldBody.useGravity) acceleration -= Physics.gravity;
            Vector3 force = Vector3.ClampMagnitude(Vector3.ClampMagnitude(acceleration, MaximumHoldAcceleration) * heldBody.mass, MaximumHoldForce);
            AppliedForceNewtons = force.magnitude;
            heldBody.AddForce(force, ForceMode.Force);
        }

        Vector3 SlideTarget(Vector3 origin, Vector3 desired, Quaternion orientation)
        {
            Vector3 position = origin, remaining = desired - origin;
            // A contact removes motion into its surface, not the sideways
            // component needed to clear a jamb. Each projected segment is no
            // longer than the remaining request. Three casts bound the work
            // and handle a wall followed by a second corner or floor contact.
            for (int pass = 0; pass < 3; pass++)
            {
                float length = remaining.magnitude;
                if (length <= .001f) break;
                Vector3 direction = remaining / length;
                float clear = SweepDistance(position, direction, length, orientation, out Vector3 normal);
                position += direction * clear;
                if (clear >= length - .001f) break;
                HasObstruction = true;
                if (normal.sqrMagnitude < .5f) break;
                remaining = Vector3.ProjectOnPlane(remaining - direction * clear, normal);
            }
            return position;
        }

        float SweepDistance(Vector3 origin, Vector3 direction, float length, Quaternion orientation)
            => SweepDistance(origin, direction, length, orientation, out _);

        float SweepDistance(Vector3 origin, Vector3 direction, float length, Quaternion orientation, out Vector3 normal)
        {
            normal = Vector3.zero;
            int count = physics.BoxCast(origin, halfExtents, direction, hits, orientation, length + Skin, ~0, QueryTriggerInteraction.Ignore);
            if (count == QueryCapacity) return 0;
            float available = length;
            for (int i = 0; i < count; i++)
            {
                var hit = hits[i];
                if (!Blocks(hit.collider, heldBody)) continue;
                Vector3 contactNormal = hit.normal;
                // A box cast beginning on another carton can report a zero-
                // distance hit with an artificial normal opposite the sweep.
                // Use the real support surface to allow lifting or sliding off
                // it. Motion into that surface remains blocked and colliding.
                if (hit.distance <= .001f)
                {
                    Vector3 away = origin - hit.collider.ClosestPoint(origin);
                    if (away.sqrMagnitude > .000001f) contactNormal = away.normalized;
                }
                // A surface we are moving away from cannot obstruct this sweep.
                if (Vector3.Dot(direction, contactNormal) >= -.001f) continue;
                float candidate = Mathf.Max(0, hit.distance - Skin);
                if (candidate < available) { available = candidate; normal = contactNormal; }
            }
            return available;
        }

        bool HoldingVolumeClear(Vector3 position, Quaternion orientation)
        {
            int count = physics.OverlapBox(position, halfExtents, overlaps, orientation, ~0, QueryTriggerInteraction.Ignore);
            if (count == QueryCapacity) return false;
            for (int i = 0; i < count; i++) if (Blocks(overlaps[i], heldBody)) return false;
            return true;
        }

        void ApplyRotation(Quaternion target)
        {
            Quaternion delta = target * Quaternion.Inverse(heldBody.rotation);
            if (delta.w < 0) delta = new Quaternion(-delta.x, -delta.y, -delta.z, -delta.w);
            delta.ToAngleAxis(out float degrees, out Vector3 axis);
            Vector3 desired = Finite(axis.sqrMagnitude) && degrees > .01f ?
                Vector3.ClampMagnitude(axis * (degrees * Mathf.Deg2Rad * 8f), 3f) : Vector3.zero;
            Vector3 acceleration = Vector3.ClampMagnitude((desired - heldBody.angularVelocity) * 12f, 30f);
            Quaternion principal = heldBody.rotation * heldBody.inertiaTensorRotation;
            Vector3 torque = principal * Vector3.Scale(heldBody.inertiaTensor, Quaternion.Inverse(principal) * acceleration);
            heldBody.AddTorque(Vector3.ClampMagnitude(torque, 40f), ForceMode.Force);
        }

        bool Visible(Vector3 centre, Rigidbody body)
        {
            Vector3 delta = centre - View.position;
            float distance = delta.magnitude;
            if (distance < .001f) return true;
            int count = physics.Raycast(View.position, delta / distance, hits, distance, ~0, QueryTriggerInteraction.Ignore);
            if (count == QueryCapacity) return false;
            for (int i = 0; i < count; i++) if (Blocks(hits[i].collider, body)) return false;
            return true;
        }

        bool Blocks(Collider collider, Rigidbody body) => collider != null && collider.attachedRigidbody != body && !IsPlayer(collider);
        bool IsPlayer(Collider collider) => collider != null &&
            (collider.transform == transform || collider.transform.IsChildOf(transform));

        void IgnorePlayerCollisions()
        {
            foreach (var collider in GetComponentsInChildren<Collider>())
            {
                if (!collider.enabled || collider.isTrigger || collider == heldBox) continue;
                bool tracked = false;
                for (int i = 0; i < ignoredPairs.Count; i++)
                    if (ignoredPairs[i].carton == heldBox && ignoredPairs[i].player == collider) { tracked = true; break; }
                if (tracked || Physics.GetIgnoreCollision(heldBox, collider)) continue;
                Physics.IgnoreCollision(heldBox, collider, true);
                ignoredPairs.Add(new IgnoredPair { carton = heldBox, player = collider });
            }
        }

        void RestoreSeparatedCollisions(bool force)
        {
            for (int i = ignoredPairs.Count - 1; i >= 0; i--)
            {
                var pair = ignoredPairs[i];
                if (pair.carton == null || pair.player == null) { ignoredPairs.RemoveAt(i); continue; }
                if (!force && pair.carton == heldBox && IsHolding) continue;
                // Do not enable a player collision while a just-released carton
                // overlaps the capsule. Gravity separates it, or walking away
                // does; the original collision resumes as soon as it is clear.
                if (!force && pair.carton.enabled && pair.player.enabled &&
                    pair.carton.gameObject.activeInHierarchy && pair.player.gameObject.activeInHierarchy &&
                    pair.carton.bounds.Intersects(pair.player.bounds)) continue;
                Physics.IgnoreCollision(pair.carton, pair.player, false);
                ignoredPairs.RemoveAt(i);
            }
        }

        public void Release() { Drop("put down"); }
        public void Suspend() { Drop("controls inactive"); ClearAim(); }

        void Drop(string reason)
        {
            if (heldBody != null)
            {
                // This interaction places objects; it has no throw gesture.
                // Bound release energy while preserving gravity and contacts.
                if (!heldBody.isKinematic)
                {
                    heldBody.linearVelocity = Vector3.ClampMagnitude(heldBody.linearVelocity, MaximumReleaseSpeed);
                    heldBody.angularVelocity = Vector3.ClampMagnitude(heldBody.angularVelocity, 1.5f);
                }
                heldBody.collisionDetectionMode = originalDetection;
                heldBody.interpolation = originalInterpolation;
                heldBody.solverIterations = originalSolverIterations;
                heldBody.solverVelocityIterations = originalVelocityIterations;
                heldBody.maxDepenetrationVelocity = originalDepenetration;
                LastReleaseReason = reason;
            }
            if (heldMarker != null && heldMarker.Holder == this) heldMarker.Holder = null;
            heldBody = null; heldBox = null; heldMarker = null;
            IsRotating = HasObstruction = hasViewPosition = false;
            HoldErrorMetres = AppliedForceNewtons = occludedSeconds = 0;
            RestoreSeparatedCollisions(false);
        }

        static Vector3 Abs(Vector3 value) => new Vector3(Mathf.Abs(value.x), Mathf.Abs(value.y), Mathf.Abs(value.z));
        static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
    }
}
