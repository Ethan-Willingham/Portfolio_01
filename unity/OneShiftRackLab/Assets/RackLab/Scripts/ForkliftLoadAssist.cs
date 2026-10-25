using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace OneShift.RackLab
{
    // A held control operates the same steering, brake and hydraulic inputs as
    // the driver. It never moves a body, adds a carrying joint or changes cargo.
    public sealed class ForkliftLoadAssist
    {
        public enum Stage { Idle, Level, Approach, Lift, Lower, Complete }
        public Stage CurrentStage { get; private set; }
        public bool IsRunning => CurrentStage >= Stage.Level && CurrentStage <= Stage.Lower;
        public PalletCargo Target { get; private set; }
        public string Status { get; private set; } = "Hold X near a pallet end to line up and lift.";
        public Vector3 PocketPoint { get; private set; }
        public string ObstructionName { get; private set; }
        public string DebugState => "pickupBottom=" + pickupBottom.ToString("F6") + " requiredRise=" + requiredRise.ToString("F6") +
            " actualBottom=" + BoardBottom.ToString("F6") + " liftError=" + (targetForkTop-ForkTop).ToString("F6") +
            " cargoVerticalSpeed=" + (targetBody != null ? targetBody.linearVelocity.y.ToString("F6") : "no body") +
            " truckSpeed=" + drive.SpeedMps.ToString("F6") + " settled=" + settled.ToString("F6") +
            " tailHeight=" + diagnosticMin.ToString("F6") + "/" + diagnosticMax.ToString("F6") +
            " resetRise/height/move=" + resetRise + "/" + resetHeight + "/" + resetMove;
        public bool Carrying => carried != null && IsOnForks(carried);

        readonly ForkliftDriveController drive;
        readonly ForkliftLiftController lift;
        readonly PhysicsScene physics;
        readonly Collider[] forks;
        readonly RaycastHit[] hits = new RaycastHit[48];
        readonly List<Collider> boards = new List<Collider>();
        PalletCargo carried;
        Rigidbody targetBody;
        Vector3 approachForward, approachRight;
        Vector3 stableTruckPosition;
        float pickupBottom, targetForkTop, lowerSupport, requiredRise, stableBottom, elapsed, blockedTime, settled;
        float initialCargoProjection;
        bool holdingPickup;
        float diagnosticMin = float.PositiveInfinity, diagnosticMax = float.NegativeInfinity;
        int resetRise, resetHeight, resetMove;

        public ForkliftLoadAssist(ForkliftDriveController vehicle, ForkliftLiftController mechanism)
        {
            drive = vehicle;
            lift = mechanism;
            physics = vehicle.gameObject.scene.GetPhysicsScene();
            var blades = new List<Collider>();
            foreach (var collider in vehicle.GetComponentsInChildren<Collider>())
                if (collider.name == "Solid tapered fork blade") blades.Add(collider);
            forks = blades.ToArray();
        }

        public bool Begin(PalletCargo preferred = null)
        {
            Cancel();
            if (lift == null || forks.Length != 2 || !drive.Occupied || !lift.Occupied || drive.IsOverturned)
                return Refuse("Sit in the upright forklift before using the fork guide.");
            if (drive.SpeedMps > .5f) return Refuse("Slow down before holding X.");
            elapsed = blockedTime = settled = 0;
            // A remembered load may have been set down with the manual lever.
            // Recheck both physical support and floor clearance on every press.
            var previousCargo = carried;
            RememberSupportedLoad(preferred != null ? preferred : previousCargo);
            if (carried == null && preferred == null && previousCargo != null) RememberSupportedLoad(null);
            if (Carrying)
            {
                Target = carried;
                CacheBoards(Target);
                if (!SupportHeight(out float support)) return Refuse("Move the pallet over a clear floor or rack deck first.");
                lowerSupport = support;
                targetForkTop = support + PocketTopOffset();
                if (targetForkTop > ForkTop + .025f) return Refuse("Raise the pallet clear of that surface first.");
                CurrentStage = Stage.Lower;
                Status = "Lowering onto the surface. Release X to stop.";
                return true;
            }
            carried = null;
            Target = preferred != null ? preferred : FindCandidate();
            if (Target == null || !Eligible(Target))
                return Refuse("Face the 40-inch pallet end, within two metres of the fork tips.");
            CacheBoards(Target);
            if (boards.Count == 0) return Refuse("No clear fork pockets on that load.");
            approachForward = Vector3.ProjectOnPlane(Target.transform.forward, Vector3.up).normalized;
            if (Vector3.Dot(approachForward, drive.transform.forward) < 0) approachForward = -approachForward;
            approachRight = Vector3.Cross(Vector3.up, approachForward);
            pickupBottom = BoardBottom;
            initialCargoProjection = Vector3.Dot(Target.transform.position, approachForward);
            targetForkTop = pickupBottom + PocketTopOffset();
            PocketPoint = Target.transform.position - approachForward * (PalletRackBay.PalletDepth * .5f);
            PocketPoint = new Vector3(PocketPoint.x, targetForkTop, PocketPoint.z);
            CurrentStage = Stage.Level;
            Status = "Levelling the forks. Keep holding X.";
            return true;
        }

        public void Cancel(string message = null)
        {
            if (IsRunning)
            {
                drive.SetDriverInput(0, 0, true, false, true);
                lift.ClearInput();
            }
            CurrentStage = Stage.Idle;
            if (message != null) Status = message;
        }

        public void Tick(float dt)
        {
            if (!IsRunning || dt <= 0) return;
            if (Target == null || !Target.gameObject.activeInHierarchy || !drive.Occupied || !lift.Occupied || drive.IsOverturned)
            { Cancel("Guide stopped. Check the load and forklift."); return; }
            elapsed += dt;
            if (elapsed > 28f) { Cancel("Guide stopped. Reposition and try again."); return; }
            float throttle = 0, steer = 0, liftInput = 0;
            bool brake = true;
            float tiltError = -lift.TiltDegrees;
            float tiltInput = Mathf.Abs(tiltError) > .35f ? Mathf.Clamp(tiltError * .22f, -1, 1) : 0;
            PocketPoint = Target.transform.position - approachForward * (PalletRackBay.PalletDepth * .5f);
            PocketPoint = new Vector3(PocketPoint.x, ForkTop, PocketPoint.z);
            if (CurrentStage == Stage.Level)
            {
                // The projected blade thickness shrinks while the mast levels.
                // Re-measure it rather than retaining a tilted blade's AABB.
                targetForkTop = pickupBottom + PocketTopOffset();
                float error = targetForkTop - ForkTop;
                liftInput = Valve(error);
                settled = Mathf.Abs(error) < .006f && Mathf.Abs(tiltError) < .55f && drive.SpeedMps < .08f ? settled + dt : 0;
                if (settled > .25f) { CurrentStage = Stage.Approach; settled = 0; }
            }
            else if (CurrentStage == Stage.Approach)
            {
                if (Mathf.Abs(Vector3.Dot(Target.transform.position, approachForward) - initialCargoProjection) > .10f)
                { Cancel("The pallet moved. Back out and line up again."); return; }
                float nearFace = Vector3.Dot(Target.transform.position, approachForward) - PalletRackBay.PalletDepth * .5f;
                Extents(forks, approachForward, out float heel, out float tip);
                float remaining = nearFace - heel - .03f;
                float lateral = Vector3.Dot(Target.transform.position - ForkCentre, approachRight);
                float heading = Vector3.SignedAngle(drive.transform.forward, approachForward, Vector3.up);
                float outside = nearFace - tip;
                // Corrections use rear steering before the blades enter. Once
                // inside a pocket, steering stays almost straight to spare boards.
                if (outside < .06f && (Mathf.Abs(lateral) > .09f || Mathf.Abs(heading) > 3.5f))
                { Cancel("Back up a little and square up with the pallet end."); return; }
                if (Obstructed(outside))
                { Cancel("The approach is blocked. Release X and move around it."); return; }
                if (remaining <= .025f)
                {
                    settled = drive.SpeedMps < .08f ? settled + dt : 0;
                    if (settled > .25f)
                    {
                        // Rack bays were built for a 100 mm pickup, while a
                        // floor load can reach a comfortable low carrying pose.
                        // Sweep the actual compound load and carriage as well:
                        // an upper beam can constrain the backrest before cargo.
                        float stroke = SafeLiftStroke(pickupBottom - drive.transform.position.y > .4f ? .13f : .22f);
                        if (stroke < .09f) { Cancel("Not enough room above the load. Check the beam clearance."); return; }
                        CurrentStage = Stage.Lift;
                        targetForkTop = ForkTop + stroke;
                        requiredRise = stroke - .045f;
                        stableBottom = BoardBottom;
                        stableTruckPosition = drive.body.position;
                        holdingPickup = false;
                        settled = 0;
                    }
                }
                else
                {
                    float speed = Mathf.Clamp(remaining * 1.2f, .06f, .4f);
                    brake = drive.SignedSpeedMps > speed + .025f;
                    throttle = brake ? 0 : .30f;
                    steer = outside > .06f ? Mathf.Clamp(heading * .07f + lateral * 1.25f, -.65f, .65f) : Mathf.Clamp(heading * .05f, -.12f, .12f);
                    blockedTime = drive.SpeedMps < .015f && !brake ? blockedTime + dt : 0;
                    if (blockedTime > 2f) { Cancel("The forklift cannot move farther. Release X and check the path."); return; }
                }
                liftInput = Valve(targetForkTop - ForkTop);
                Status = "Lining up and sliding in. Release X to stop.";
            }
            else if (CurrentStage == Stage.Lift)
            {
                if (lift.IsStalled) { Cancel("The lift is blocked or the load is too heavy."); return; }
                float bottom = BoardBottom;
                // Raise once, then close the valve as a driver would. Continual
                // raise/lower corrections around a world-space height can excite
                // the compliant loaded mast instead of letting its hold settle.
                if (!holdingPickup && bottom >= pickupBottom + requiredRise + .02f)
                { holdingPickup = true; settled = 0; stableBottom = bottom; }
                liftInput = holdingPickup ? 0 : Mathf.Clamp((targetForkTop - ForkTop) * 6f, .18f, 1f);
                // Completion measures real clearance and a stable height over
                // several frames. Contact-solver velocity corrections can be
                // large while the loaded pallet stays within a millimetre.
                if (elapsed > 24)
                {
                    diagnosticMin = Mathf.Min(diagnosticMin, bottom); diagnosticMax = Mathf.Max(diagnosticMax, bottom);
                    if (bottom <= pickupBottom + requiredRise) resetRise++;
                    if (Mathf.Abs(bottom-stableBottom) > .015f) resetHeight++;
                    if (Vector3.ProjectOnPlane(drive.body.position-stableTruckPosition, Vector3.up).sqrMagnitude > .000625f) resetMove++;
                }
                if (!holdingPickup || bottom <= pickupBottom + requiredRise || Mathf.Abs(bottom - stableBottom) > .015f ||
                    Vector3.ProjectOnPlane(drive.body.position - stableTruckPosition, Vector3.up).sqrMagnitude > .000625f)
                { settled = 0; stableBottom = bottom; stableTruckPosition = drive.body.position; }
                else settled += dt;
                Status = "Lifting through fork contact. Keep holding X.";
                if (settled > .3f)
                {
                    carried = Target;
                    Finish("Load clear. Release X, reverse out, and carry low.");
                    return;
                }
            }
            else if (CurrentStage == Stage.Lower)
            {
                if (!IsOnForks(Target)) { carried = null; Cancel("The load is no longer on the forks."); return; }
                targetForkTop = lowerSupport + PocketTopOffset();
                liftInput = Valve(targetForkTop - ForkTop);
                settled = Mathf.Abs(targetForkTop - ForkTop) < .008f ? settled + dt : 0;
                if (settled > .8f)
                {
                    carried = null;
                    Finish("Pallet set down. Release X and reverse to withdraw the forks.");
                    return;
                }
            }
            drive.SetDriverInput(throttle, steer, brake, false, true);
            lift.SetInput(liftInput, tiltInput);
        }

        void Finish(string status)
        {
            drive.SetDriverInput(0, 0, true, false, true);
            lift.ClearInput();
            CurrentStage = Stage.Complete;
            Status = status;
        }

        bool Refuse(string status) { Target = null; Status = status; return false; }
        static float Valve(float error) => Mathf.Abs(error) < .004f ? 0 : Mathf.Clamp(error * 6f, -1, 1);

        PalletCargo FindCandidate()
        {
            PalletCargo best = null;
            float score = float.MaxValue;
            foreach (var cargo in Object.FindObjectsByType<PalletCargo>(FindObjectsSortMode.None))
            {
                if (!Eligible(cargo)) continue;
                float distance = (cargo.transform.position - ForkCentre).sqrMagnitude;
                if (distance < score) { best = cargo; score = distance; }
            }
            return best;
        }

        public bool Eligible(PalletCargo cargo)
        {
            if (cargo == null || cargo.gameObject.scene != drive.gameObject.scene || !cargo.gameObject.activeInHierarchy || forks.Length != 2) return false;
            var body = cargo.GetComponent<Rigidbody>();
            if (body == null || body.isKinematic || body.linearVelocity.magnitude > .25f || Vector3.Dot(cargo.transform.up, Vector3.up) < .98f) return false;
            Vector3 delta = cargo.transform.position - ForkCentre;
            float forward = Vector3.Dot(delta, drive.transform.forward);
            float lateral = Mathf.Abs(Vector3.Dot(delta, drive.transform.right));
            float alignment = Mathf.Abs(Vector3.Dot(cargo.transform.forward, drive.transform.forward));
            return alignment > .96f && lateral < .38f && forward > -.1f && forward < 2.9f &&
                cargo.transform.position.y >= drive.transform.position.y - .2f &&
                cargo.transform.position.y < drive.transform.position.y + lift.maximumLiftTravel - .08f;
        }

        bool IsOnForks(PalletCargo cargo)
        {
            if (cargo == null || forks.Length != 2) return false;
            Vector3 point = cargo.transform.InverseTransformPoint(ForkCentre);
            return Mathf.Abs(point.x) < .28f && Mathf.Abs(point.z) < .55f && point.y > .01f && point.y < .18f;
        }

        float SafeLiftStroke(float requested)
        {
            float allowed = requested;
            var movingBodies = new[] { Target.GetComponent<Rigidbody>(), lift.carriageBody, lift.innerMastBody };
            for (int i = 0; i < movingBodies.Length; i++)
            {
                var body = movingBodies[i];
                if (body == null) continue;
                // The inner mast travels at half fork speed, but its rail tips
                // reach a trailer roof long before the pallet or backrest does.
                float ratio = i == 2 ? .5f : 1;
                foreach (var hit in body.SweepTestAll(lift.mastBody.transform.up, requested * ratio + .015f, QueryTriggerInteraction.Ignore))
                {
                    if (hit.transform.IsChildOf(drive.transform) || hit.transform.IsChildOf(Target.transform)) continue;
                    allowed = Mathf.Min(allowed, Mathf.Max(0, (hit.distance - .015f) / ratio));
                }
            }
            return allowed;
        }

        void RememberSupportedLoad(PalletCargo preferred)
        {
            carried = null;
            var candidates = preferred != null ? new[] { preferred } : Object.FindObjectsByType<PalletCargo>(FindObjectsSortMode.None);
            foreach (var cargo in candidates)
            {
                if (cargo.gameObject.scene != drive.gameObject.scene || !IsOnForks(cargo)) continue;
                Target = cargo;
                CacheBoards(cargo);
                if (boards.Count == 0 || !SupportHeight(out float support) || BoardBottom < support + .04f) continue;
                bool bothSupported = true;
                foreach (var fork in forks)
                {
                    float closest = float.PositiveInfinity;
                    foreach (var board in boards)
                    {
                        if (board.name != "Top board") continue;
                        Vector3 onFork = fork.ClosestPoint(board.bounds.center);
                        Vector3 onBoard = board.ClosestPoint(onFork);
                        onFork = fork.ClosestPoint(onBoard);
                        closest = Mathf.Min(closest, Vector3.Distance(onFork, onBoard));
                    }
                    bothSupported &= closest < .018f;
                }
                if (!bothSupported) continue;
                carried = cargo;
                approachForward = drive.transform.forward;
                return;
            }
        }

        bool Obstructed(float outside)
        {
            // Check the visible pocket corridor and the front corners of the
            // chassis. Contacts remain authoritative; these probes stop intent
            // early instead of forcing a truck through an unseen obstruction.
            Vector3 forward = drive.transform.forward;
            for (int side = -1; side <= 1; side += 2)
                for (int level = 0; level < 2; level++)
                {
                    // Wheel width does not describe the narrower body above
                    // the tyres. A full-width probe wrongly rejected rack slots
                    // whose uprights safely pass outside the actual chassis.
                    Vector3 start = drive.transform.position + drive.transform.right * ((level == 0 ? .52f : .46f) * side) + Vector3.up * (.3f + level * 1.1f) + forward * .85f;
                    if (BlockedRay(start, forward, .5f)) return true;
                }
            if (outside > .025f)
            {
                Extents(forks, approachForward, out _, out float tip);
                Vector3 start = ForkCentre + approachForward * (tip - Vector3.Dot(ForkCentre, approachForward));
                start.y = targetForkTop - .015f;
                if (BlockedRay(start, approachForward, Mathf.Min(outside + .05f, 2.3f))) return true;
            }
            return false;
        }

        bool BlockedRay(Vector3 origin, Vector3 direction, float distance)
        {
            int count = physics.Raycast(origin, direction, hits, distance, ~0, QueryTriggerInteraction.Ignore);
            if (count == hits.Length) return true;
            for (int i = 0; i < count; i++)
            {
                var node = hits[i].transform;
                if (!node.IsChildOf(drive.transform) && !node.IsChildOf(Target.transform)) { ObstructionName = node.name; return true; }
            }
            return false;
        }

        bool SupportHeight(out float height)
        {
            height = float.NegativeInfinity;
            int supports = 0;
            // Sample both pallet runners so a rack edge or single upright cannot
            // be mistaken for a deck. Do not lower into a gap beside a platform.
            foreach (float side in new[] { -.35f, .35f })
            {
                Vector3 start = Target.transform.TransformPoint(new Vector3(side, .035f, 0));
                int count = physics.Raycast(start, Vector3.down, hits, 4.3f, ~0, QueryTriggerInteraction.Ignore);
                float nearest = float.NegativeInfinity;
                for (int i = 0; i < count; i++)
                {
                    var hit = hits[i];
                    if (hit.transform.IsChildOf(drive.transform) || hit.transform.IsChildOf(Target.transform) || hit.normal.y < .9f) continue;
                    if (hit.rigidbody != null && !hit.rigidbody.isKinematic) continue;
                    nearest = Mathf.Max(nearest, hit.point.y);
                }
                if (float.IsNegativeInfinity(nearest)) return false;
                if (supports > 0 && Mathf.Abs(height - nearest) > .04f) return false;
                height = Mathf.Max(height, nearest);
                supports++;
            }
            return supports == 2;
        }

        void CacheBoards(PalletCargo cargo)
        {
            boards.Clear();
            targetBody = cargo.GetComponent<Rigidbody>();
            foreach (var collider in cargo.GetComponentsInChildren<Collider>())
                if (collider.enabled && !collider.isTrigger && (collider.name == "Top board" || collider.name == "Bottom board" || collider.name.StartsWith("Stringer") || collider.name == "Notch shoulder")) boards.Add(collider);
        }
        float PocketTopOffset()
        {
            float lower = float.NegativeInfinity, upper = float.PositiveInfinity;
            foreach (var board in boards)
            {
                if (board.name == "Bottom board") lower = Mathf.Max(lower, board.bounds.max.y);
                if (board.name == "Top board") upper = Mathf.Min(upper, board.bounds.min.y);
            }
            Extents(forks, Vector3.up, out float bottom, out float top);
            return (lower + upper + top - bottom) * .5f - BoardBottom;
        }
        float BoardBottom { get { float y = float.PositiveInfinity; foreach (var board in boards) y = Mathf.Min(y, board.bounds.min.y); return y; } }
        float ForkTop { get { Extents(forks, Vector3.up, out _, out float top); return top; } }
        Vector3 ForkCentre { get { return (forks[0].bounds.center + forks[1].bounds.center) * .5f; } }

        static void Extents(Collider[] colliders, Vector3 axis, out float minimum, out float maximum)
        {
            minimum = float.PositiveInfinity; maximum = float.NegativeInfinity;
            foreach (var collider in colliders)
            {
                var mesh = collider as MeshCollider;
                Bounds bounds = mesh != null && mesh.sharedMesh != null ? mesh.sharedMesh.bounds : collider.bounds;
                for (int corner = 0; corner < 8; corner++)
                {
                    Vector3 point = bounds.center + Vector3.Scale(bounds.extents, new Vector3((corner & 1) == 0 ? -1 : 1, (corner & 2) == 0 ? -1 : 1, (corner & 4) == 0 ? -1 : 1));
                    if (mesh != null && mesh.sharedMesh != null) point = collider.transform.TransformPoint(point);
                    float projection = Vector3.Dot(point, axis);
                    minimum = Mathf.Min(minimum, projection); maximum = Mathf.Max(maximum, projection);
                }
            }
        }
    }
}
