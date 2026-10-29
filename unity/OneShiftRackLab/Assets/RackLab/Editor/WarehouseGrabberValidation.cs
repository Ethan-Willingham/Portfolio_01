using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    // These checks advance production holding forces and actual box/capsule
    // contacts in a disposable physics scene. They never run the live warehouse.
    public static class WarehouseGrabberValidation
    {
        const float StepSeconds = .005f;
        const string ReportPath = "Assets/RackLab/Reports/warehouse-grabber-validation.json";

        [Serializable]
        public sealed class Report
        {
            public string generatedUtc;
            public string unityVersion;
            public string method = "Production grabber and walking lifecycle in isolated PhysX at 0.005-second steps. Actual dynamic box, floor, wall and player capsule contacts. No changes to the open scene or assets.";
            public string scope = "Physics, eligibility and lifecycle checks. Native pointer capture, E/click priority, wheel and right-mouse feel still require the real browser player.";
            public bool passed;
            public List<ForkliftDrivingValidation.Check> checks = new List<ForkliftDrivingValidation.Check>();
        }

        [MenuItem("One Shift/Validate physical carton handling")]
        public static string ValidateAndSave()
        {
            var report = Run();
            string json = JsonUtility.ToJson(report, true);
            Directory.CreateDirectory(Path.GetDirectoryName(ReportPath));
            File.WriteAllText(ReportPath, json + "\n");
            AssetDatabase.ImportAsset(ReportPath);
            return json;
        }

        public static Report Run()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                throw new InvalidOperationException("Stop Play before isolated carton validation.");
            var report = new Report { generatedUtc = DateTime.UtcNow.ToString("O"), unityVersion = Application.unityVersion };
            Check(report, "only marked loose cartons are eligible", "Reject unmarked, heavy, oversized, kinematic, jointed and pallet bodies; allow one small marked dynamic carton.", Eligibility);
            Check(report, "aim volume respects the nearest surface", "A slight edge aim picks the carton, but a solid wall blocks both aim and direct pickup.", AimOcclusion);
            Check(report, "a stacked delivery carton lifts off its support", "A settled top carton follows toward the player and lifts clear of its supporting carton without a false blocked-sweep release.", StackedPickup);
            Check(report, "bounded physical hold", "The actual body rises under force without parenting or an immediate pose write, settles within 4 cm, and never exceeds the force budget.", FollowsPhysically);
            Check(report, "maximum carry mass can be lifted", "A 25 kg carton rises and settles under the same finite 650 N force limit while a heavier carton is refused.", HeavyCarton);
            Check(report, "wheel distance has physical limits", "Distance adjustment is bounded and moves the real carton to both ends of its permitted range.", Distance);
            Check(report, "whole carton stops before a wall", "The actual carton stays on the near side of a thin wall with less than 1 cm penetration while the requested distance extends beyond it.", Wall);
            Check(report, "carrying fits low overhead clearance", "A tilted carton stays held below a low roof even when the eye-centred box would overlap it; actual roof, side walls and a new near obstruction remain physical.", VanClearance);
            Check(report, "turning through the front doorway keeps freight physical", "The actual porch pickup can turn toward the front door and walk through it, waiting at a briefly obstructed target instead of releasing or penetrating masonry.", FrontDoorTurn);
            Check(report, "collection route handles the driver and real van", "The recorded carry uses production walking past the driver and along the pavement, climbs the authored ramp, enters the cargo van, sets down upright stock and walks back out.", CollectionRoute);
            Check(report, "lowering respects the floor", "Looking down lowers the carton physically, preserves the floor contact and permits a stable gravity-driven setdown.", Floor);
            Check(report, "rotation uses physical torque", "Right-mouse rotation keeps the view still, applies no immediate pose write and rotates the real box with bounded angular speed.", Rotation);
            Check(report, "looking preserves the picked carton orientation", "Pickup retains the original orientation and ordinary camera yaw and pitch do not rotate the held box.", PreserveOrientation);
            Check(report, "rotation cannot sweep through a wall", "An elongated held carton rotates against a wall while its actual collision body stays within 1.5 cm of the wall boundary.", RotationAtWall);
            Check(report, "release restores the free body", "Setdown retains a dynamic collider and gravity, restores original solver settings and player collision, caps release energy and falls to the floor.", Release);
            Check(report, "player collision is restored only after separation", "A released carton overlapping the capsule cannot push the player; collision returns after separation and pre-existing ignore rules are preserved.", PlayerCollision);
            Check(report, "pause and control transfers release immediately", "Browser inactivity, external UI, vehicle entry, camera transition and reset each release the carton without moving it to a new location.", Lifecycle);
            Check(report, "unreachable cartons are dropped", "A large camera displacement releases immediately; real body occlusion brakes during its short grace period and then releases without pulling through the wall.", Unreachable);
            Check(report, "legacy parcels remain distinct", "A physical carton sets CarryingObject without CarryingParcel; a legacy parcel blocks carton pickup and retains both legacy carry properties.", LegacyParcel);
            report.passed = report.checks.All(check => check.passed);
            return report;
        }

        static void Check(Report report, string name, string expectation, Action<Rig, ForkliftDrivingValidation.Check> run)
        {
            var check = new ForkliftDrivingValidation.Check { name = name, expectation = expectation };
            report.checks.Add(check);
            try { using (var rig = new Rig()) run(rig, check); check.passed = true; }
            catch (Exception error) { check.passed = false; check.error = error.ToString(); }
        }

        static void Need(bool condition, string description)
        {
            if (!condition) throw new InvalidOperationException(description);
        }

        static void Eligibility(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var carton = rig.Carton(new Vector3(0, 1.65f, 1.5f));
            var marker = carton.GetComponent<WarehouseGrabbable>();
            Object.DestroyImmediate(marker);
            Need(!rig.Grabber.TryPickup(carton), "An unmarked loose body must reject pickup.");
            marker = carton.gameObject.AddComponent<WarehouseGrabbable>();
            marker.enabled = false;
            Need(!rig.Grabber.TryPickup(carton), "Disabled opt-in marker must reject pickup.");
            marker.enabled = true;
            carton.mass = 26;
            Need(!rig.Grabber.TryPickup(carton), "A 26 kg body must be too heavy.");
            carton.mass = 8; marker.maximumMass = 5;
            Need(!rig.Grabber.TryPickup(carton), "The carton's own lower mass limit must apply.");
            marker.maximumMass = 25; carton.isKinematic = true;
            Need(!rig.Grabber.TryPickup(carton), "Kinematic stock is not loose freight.");
            carton.isKinematic = false;
            var box = carton.GetComponent<BoxCollider>();
            Vector3 originalSize = box.size;
            box.size = new Vector3(2, .4f, .4f);
            Physics.SyncTransforms();
            Need(!rig.Grabber.TryPickup(carton), "A large body must reject hand carry.");
            box.size = originalSize;
            var joint = carton.gameObject.AddComponent<FixedJoint>();
            Need(!rig.Grabber.TryPickup(carton), "A jointed body must not pull other freight.");
            Object.DestroyImmediate(joint);
            var pallet = carton.gameObject.AddComponent<PalletCargo>();
            carton.mass = 8;
            Need(!rig.Grabber.TryPickup(carton), "Even a marked lightweight pallet must reject pickup.");
            Object.DestroyImmediate(pallet);
            Physics.SyncTransforms();
            Need(rig.Grabber.TryPickup(carton), "A valid 8 kg carton should pick up.");
            var second = rig.Carton(new Vector3(.7f, 1.65f, 1.5f));
            Need(!rig.Grabber.TryPickup(second) && rig.Grabber.HeldBody == carton, "Only one object can be held.");
            check.Measure("accepted mass", carton.mass, "kg");
        }

        static void AimOcclusion(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var carton = rig.Carton(new Vector3(.27f, 1.65f, 1.5f));
            rig.Grabber.RefreshAim();
            Need(rig.Grabber.AimBody == carton, "The small aim volume should catch a nearby carton edge.");
            var wall = rig.Box("Opaque obstruction", new Vector3(0, 1.5f, .7f), new Vector3(3, 3, .04f));
            rig.Grabber.RefreshAim();
            Need(rig.Grabber.AimBody == null && !rig.Grabber.TryPickup(carton), "A wall must block both aim and pickup.");
            Object.DestroyImmediate(wall.gameObject);
            Physics.SyncTransforms();
            Need(rig.Grabber.TryPickup(carton), "Removing the obstruction must make the carton reachable.");
            check.Measure("edge offset from crosshair", .02f, "m");
        }

        static void FollowsPhysically(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var carton = rig.Carton(new Vector3(0, 1.65f, 1.5f));
            var parent = carton.transform.parent;
            Need(rig.Grabber.TryPickup(carton), "Pickup should succeed.");
            Vector3 original = carton.position;
            rig.Camera.transform.localPosition += Vector3.up * .35f;
            rig.Grabber.TickPhysics(StepSeconds);
            Need(Vector3.Distance(carton.position, original) < .00001f, "A controller tick must not write the body pose.");
            rig.SimulatePendingStep();
            float peakForce = 0, peakSpeed = 0;
            rig.Step(1.5f, () =>
            {
                peakForce = Mathf.Max(peakForce, rig.Grabber.AppliedForceNewtons);
                peakSpeed = Mathf.Max(peakSpeed, carton.linearVelocity.magnitude);
            });
            float error = check.Measure("settled target error", Vector3.Distance(carton.position, rig.Grabber.HoldTarget), "m");
            check.Measure("peak hold force", peakForce, "N");
            check.Measure("peak carton speed", peakSpeed, "m/s");
            Need(rig.Grabber.IsHolding && carton.position.y > original.y + .3f && error < .04f &&
                carton.linearVelocity.magnitude < .15f && peakForce <= WarehouseGrabber.MaximumHoldForce + .01f &&
                peakSpeed < WarehouseGrabber.MaximumHoldSpeed + .5f && carton.transform.parent == parent &&
                !carton.isKinematic && carton.useGravity && carton.GetComponent<BoxCollider>().enabled,
                "The dynamic carton must follow and settle without changing ownership or collision state.");
        }

        static void StackedPickup(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Box("Porch shelf",new Vector3(0,.52f,2.1f),new Vector3(1.4f,.12f,.65f));
            var lower=rig.Carton(new Vector3(0,.76f,2.1f),new Vector3(.48f,.36f,.38f));
            var upper=rig.Carton(new Vector3(0,1.12f,2.1f),new Vector3(.48f,.36f,.38f));
            lower.mass=upper.mass=6;rig.Step(1);
            rig.Camera.transform.rotation=Quaternion.LookRotation(upper.position-rig.Camera.transform.position);
            Need(rig.Grabber.TryPickup(upper),"The top delivery carton is reachable.");
            rig.Grabber.AdjustDistance(-1000);rig.Step(.3f);
            rig.Camera.transform.rotation=Quaternion.identity;rig.Step(1);
            check.Measure("lifted carton height",upper.position.y,"m");
            Need(rig.Grabber.IsHolding && upper.position.z<1.1f && upper.position.y>1.5f,
                "Top carton failed to follow: "+rig.Grabber.LastReleaseReason+" at "+upper.position+", target "+rig.Grabber.HoldTarget);
        }

        static void HeavyCarton(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var carton = rig.Carton(new Vector3(0, 1.65f, 1.5f));
            carton.mass = WarehouseGrabber.MaximumMass;
            Need(rig.Grabber.TryPickup(carton), "The upper permitted mass must remain liftable.");
            rig.Camera.transform.localPosition += Vector3.up * .3f;
            float peakForce = 0;
            rig.Step(2, () => peakForce = Mathf.Max(peakForce, rig.Grabber.AppliedForceNewtons));
            check.Measure("maximum-mass lift", carton.position.y - 1.65f, "m");
            check.Measure("maximum-mass peak force", peakForce, "N");
            Need(rig.Grabber.IsHolding && carton.position.y > 1.9f &&
                Vector3.Distance(carton.position, rig.Grabber.HoldTarget) < .04f &&
                peakForce <= WarehouseGrabber.MaximumHoldForce + .01f,
                "The supported mass limit must lift through the bounded production spring.");
        }

        static void Distance(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var carton = rig.Carton(new Vector3(0, 1.65f, 1.5f));
            Need(rig.Grabber.TryPickup(carton), "Pickup should succeed.");
            rig.Grabber.AdjustDistance(1000);
            Need(Mathf.Abs(rig.Grabber.HoldDistance - WarehouseGrabber.MaximumDistance) < .001f, "Far distance must clamp.");
            rig.Step(1.5f);
            check.Measure("far physical centre", carton.position.z, "m");
            Need(Mathf.Abs(carton.position.z - WarehouseGrabber.MaximumDistance) < .04f, "The physical box must reach the far target.");
            rig.Grabber.AdjustDistance(-1000);
            rig.Step(1.5f);
            check.Measure("near physical centre", carton.position.z, "m");
            Need(Mathf.Abs(rig.Grabber.HoldDistance - WarehouseGrabber.MinimumDistance) < .001f &&
                Mathf.Abs(carton.position.z - WarehouseGrabber.MinimumDistance) < .04f, "The physical box must stop at the near limit.");
        }

        static void Wall(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var carton = rig.Carton(new Vector3(0, 1.65f, 1.3f));
            var wall = rig.Box("Thin physical wall", new Vector3(0, 1.5f, 2), new Vector3(4, 3, .06f));
            Need(rig.Grabber.TryPickup(carton), "The near-side carton should pick up.");
            rig.Grabber.AdjustDistance(10);
            float farthest = 0, penetration = 0;
            rig.Step(2, () =>
            {
                farthest = Mathf.Max(farthest, carton.GetComponent<BoxCollider>().bounds.max.z);
                penetration = Mathf.Max(penetration, Penetration(carton.GetComponent<BoxCollider>(), wall));
            });
            check.Measure("farthest box face", farthest, "m");
            check.Measure("maximum wall penetration", penetration, "m");
            Need(rig.Grabber.IsHolding && rig.Grabber.HasObstruction && farthest <= wall.bounds.min.z + .01f &&
                penetration < .01f, "The entire carton must stay before the wall.");
        }

        static void VanClearance(Rig rig, ForkliftDrivingValidation.Check check)
        {
            // Retain the former low van's 1.86 m clearance as a conservative
            // overhead regression. The complete route uses the current van.
            rig.Player.transform.position = Vector3.up * .025f;
            rig.Camera.transform.localRotation = Quaternion.Euler(8, 0, 0);
            float ceiling = 1.86f;
            var roof = rig.Box("Collection van roof", new Vector3(0, ceiling + .05f, 1.58f), new Vector3(2.04f, .10f, 3.23f));
            var left = rig.Box("Collection van left wall", new Vector3(-.97f, .92f, 1.58f), new Vector3(.08f, 1.86f, 3.16f));
            var right = rig.Box("Collection van right wall", new Vector3(.97f, .92f, 1.58f), new Vector3(.08f, 1.86f, 3.16f));
            Vector3 position = rig.Camera.transform.position + rig.Camera.transform.forward * 1.2f;
            var carton = rig.Carton(position, new Vector3(.48f, .36f, .38f));
            carton.mass = 6;
            // A floor pickup preserves its rotation relative to the view. On
            // returning the view toward level it naturally tilts like this.
            carton.rotation = Quaternion.Euler(-37, 0, 0);
            Physics.SyncTransforms();
            var box = carton.GetComponent<BoxCollider>();
            float eyeBoxTop = rig.Camera.transform.position.y + box.bounds.extents.y;
            Need(eyeBoxTop > roof.bounds.min.y + .04f && box.bounds.max.y < roof.bounds.min.y,
                "Fixture must overlap the fictitious eye box while the actual carton fits.");
            Need(rig.Grabber.TryPickup(carton), "A visible carton inside the open van should pick up.");
            rig.Grabber.AdjustDistance(-1000);
            float penetration = 0;
            rig.Step(1.5f, () => penetration = Mathf.Max(penetration, Mathf.Max(Penetration(box, roof),
                Mathf.Max(Penetration(box, left), Penetration(box, right)))));
            check.Measure("eye volume above roof underside", eyeBoxTop - roof.bounds.min.y, "m");
            check.Measure("van surface penetration", penetration, "m");
            Need(rig.Grabber.IsHolding && Vector3.Distance(carton.position, rig.Grabber.HoldTarget) < .04f && penetration < .01f,
                "Clear van carry was released: " + rig.Grabber.LastReleaseReason + " at " + carton.position);
            // Real body occlusion stops the spring during a short grace period,
            // then releases. It cannot pull hidden freight through the wall.
            rig.Box("Van near obstruction", new Vector3(0, 1, .55f), new Vector3(1.8f, 2, .05f));
            Vector3 before = carton.position;
            rig.Grabber.TickPhysics(StepSeconds);
            Need(rig.Grabber.IsHolding && Vector3.Distance(before, carton.position) < .00001f && Vector3.Distance(before, rig.Grabber.HoldTarget) < .00001f,
                "An occluded carton must brake in place without a pose write.");
            rig.Step(.24f);
            Need(!rig.Grabber.IsHolding && rig.Grabber.LastReleaseReason == "view obstructed" && Mathf.Abs(carton.position.z - before.z) < .02f,
                "A persistently hidden carton must release without being pulled through the wall.");
        }

        static void FrontDoorTurn(Rig rig, ForkliftDrivingValidation.Check check)
        {
            rig.Floor.transform.position = new Vector3(6.5f, -.25f, -10);
            rig.Player.transform.position = new Vector3(6.498f, .025f, -11.14f);
            rig.Camera.transform.rotation = Quaternion.Euler(7.92f, 86.5f, 0);
            var surfaces = new List<BoxCollider> {
                rig.Box("Front east masonry", new Vector3(8, 1.2f, -10), new Vector3(1.4f, 2.4f, .24f)),
                rig.Box("Front west masonry", new Vector3(5, 1.2f, -10), new Vector3(1.4f, 2.4f, .24f)),
                rig.Box("Front east jamb", new Vector3(7.27f, 1.2f, -10), new Vector3(.09f, 2.4f, .30f)),
                rig.Box("Front west jamb", new Vector3(5.73f, 1.2f, -10), new Vector3(.09f, 2.4f, .30f)),
                rig.Box("Front lintel", new Vector3(6.5f, 2.37f, -10), new Vector3(1.6f, .09f, .30f))
            };
            var leaf = rig.Box("Open front door", new Vector3(5.79f, 0, -10.06f), new Vector3(1.42f, 2.32f, .075f));
            leaf.center = new Vector3(.71f, 1.16f, 0);
            leaf.transform.rotation = Quaternion.Euler(0, 100, 0);
            surfaces.Add(leaf);
            var carton = rig.Carton(new Vector3(7.49035f, 1.58806f, -11.07955f), new Vector3(.48f, .36f, .38f));
            carton.mass = 6;
            carton.rotation = Quaternion.Euler(358.94574f, 359.69968f, 17.22792f);
            Physics.SyncTransforms();
            Need(rig.Grabber.TryPickup(carton), "The recorded porch carton must be reachable.");
            rig.Grabber.AdjustDistance(-1000);
            float penetration = 0;
            bool obstructed = false;
            Action sample = () => {
                obstructed |= rig.Grabber.HasObstruction;
                foreach (var surface in surfaces) penetration = Mathf.Max(penetration, Penetration(carton.GetComponent<BoxCollider>(), surface));
            };
            // Native recorded mouse increments. The intermediate target cuts
            // across the jamb even though the carried body remains outside it.
            for (int i = 1; i <= 6; i++)
            {
                rig.Camera.transform.rotation = Quaternion.Euler(7.92f, Mathf.Lerp(86.5f, 0, i / 6f), 0);
                rig.Step(.1f, sample);
                Need(rig.Grabber.IsHolding, "The doorway turn released freight: " + rig.Grabber.LastReleaseReason);
            }
            rig.Step(.3f, sample);
            // Move the actual controller through the authored opening. Freight
            // follows solely through production forces and collision sweeps.
            for (int i = 0; i < 225; i++)
            {
                rig.Motor.Move(Vector3.forward * (2.8f * StepSeconds));
                Physics.SyncTransforms();
                rig.Step(StepSeconds, sample);
                Need(rig.Grabber.IsHolding, "Walking through the doorway released freight: " + rig.Grabber.LastReleaseReason);
            }
            check.Measure("maximum doorway penetration", penetration, "m");
            check.Measure("player final doorway position", rig.Player.transform.position.z, "m");
            Need(obstructed && penetration < .015f && rig.Player.transform.position.z > -8.1f && carton.position.z > -7.5f,
                "A corner obstruction must clear into the doorway without clipping or losing the carton.");
        }

        static void CollectionRoute(Rig rig, ForkliftDrivingValidation.Check check)
        {
            float ground = WarehouseCourierRoute.Ground;
            rig.Floor.transform.position = new Vector3(3, ground - .25f, -25);
            rig.Box("Front walk", new Vector3(0, ground + .025f, -23.25f), new Vector3(44, .05f, 2.5f));
            rig.Box("Last ramp rail post", new Vector3(5.28f, ground + .5f, -22), new Vector3(.055f, 1, .055f));
            foreach (float x in new[] { 1.5f, 4.5f })
                rig.Box("Parking wheel stop", new Vector3(x, ground + .075f, -25.1f), new Vector3(1.65f, .15f, .23f));
            rig.Motor.skinWidth = .025f; rig.Motor.stepOffset = .25f; rig.Motor.slopeLimit = 45;
            rig.Player.transform.position = new Vector3(6.49219f, -1.2575f, -22.63815f);
            rig.Camera.transform.rotation = Quaternion.Euler(8.1f, 180.82f, 0);
            var van = new WarehouseCourierVisuals(rig.Create("Actual collection van fixture").transform);
            try
            {
                van.root.SetPositionAndRotation(WarehouseCourierRoute.Parked, Quaternion.Euler(0, 180, 0));
                van.SetRearDoors(1); van.SetRamp(1);
                van.driver.root.gameObject.SetActive(true);
                van.driver.root.position = new Vector3(5.8f, ground + .05f, -23.45f);
                var carton = rig.Carton(new Vector3(6.47813f, .23293f, -23.62022f), new Vector3(.48f, .36f, .38f));
                carton.mass = 6; carton.rotation = Quaternion.Euler(355.70856f, 95.62066f, 41.7604f);
                carton.linearVelocity = new Vector3(-.0336f, .00368f, -2.35957f);
                Physics.SyncTransforms();
                Need(rig.Grabber.TryPickup(carton), "The recorded carton beside the driver must be reachable.");
                rig.Grabber.AdjustDistance((1.1464262f - rig.Grabber.HoldDistance) / .2f);
                float penetration = 0, driverPenetration = 0;
                bool obstructed = false, expectHeld = true;
                string stage = "turn past driver";
                var moveFeet = typeof(RackWalkController).GetMethod("MoveFeet", BindingFlags.Instance | BindingFlags.NonPublic);
                float physicsRemainder = 0;
                var surfaces = van.root.GetComponentsInChildren<Collider>();
                var box = carton.GetComponent<BoxCollider>();
                Action sample = () => {
                    obstructed |= rig.Grabber.HasObstruction;
                    driverPenetration = Mathf.Max(driverPenetration, Penetration(box, van.driver.capsule));
                    foreach (var surface in surfaces) penetration = Mathf.Max(penetration, Penetration(box, surface));
                    Need(!expectHeld || rig.Grabber.IsHolding, stage + " released freight: " + rig.Grabber.LastReleaseReason + " at " + carton.position +
                        ", velocity " + carton.linearVelocity + ", player " + rig.Player.transform.position + ", target " + rig.Grabber.HoldTarget + ", error " + rig.Grabber.HoldErrorMetres);
                };
                void Turn(float yaw)
                {
                    float from = rig.Camera.transform.eulerAngles.y, delta = Mathf.DeltaAngle(from, yaw);
                    int count = Mathf.Max(1, Mathf.CeilToInt(Mathf.Abs(delta) / 14.5f));
                    for (int i = 1; i <= count; i++)
                    { rig.Camera.transform.rotation = Quaternion.Euler(8.1f, from + delta * i / count, 0); rig.Step(.1f, sample); }
                }
                void Walk(float x, float z)
                {
                    var goal = new Vector3(x, rig.Player.transform.position.y, z);
                    Vector3 delta = goal - rig.Player.transform.position; delta.y = 0;
                    Turn(Mathf.Atan2(delta.x, delta.z) * Mathf.Rad2Deg);
                    for (int i = 0; i < 1000; i++)
                    {
                        delta = goal - rig.Player.transform.position; delta.y = 0;
                        if (delta.magnitude < .08f) return;
                        // Match the compiled walking controller, including its
                        // acceleration, ground projection and collision response.
                        // The browser renders at 144 Hz while PhysX runs at 200 Hz.
                        const float frameSeconds = 1f / 144;
                        moveFeet.Invoke(rig.Walking, new object[] { delta.normalized * 2.8f, frameSeconds });
                        Physics.SyncTransforms(); physicsRemainder += frameSeconds;
                        while (physicsRemainder >= StepSeconds)
                        { rig.Step(StepSeconds, sample); physicsRemainder -= StepSeconds; }
                    }
                    throw new InvalidOperationException(stage + " controller path blocked at " + rig.Player.transform.position);
                }
                Walk(3, -22.65f);
                stage = "approach loading ramp"; Walk(3, -23.3f);
                stage = "ascend ramp into cargo van"; Walk(3, -26.21f);
                Need(obstructed, "The exact driver turn must exercise an obstructed requested target.");
                check.Measure("driver penetration during complete carry", driverPenetration, "m");
                check.Measure("van penetration during complete carry", penetration, "m");
                Need(driverPenetration < .015f && penetration < .015f, "The full carry path must respect the driver and van surfaces.");
                // Native setdown aims at the far slot, extends the physical
                // hold and releases. No carton position is set after pickup.
                stage = "lower carton to far deck slot";
                Vector3 slot = van.root.TransformPoint(new Vector3(-.55f, WarehouseCourierVisuals.DeckHeight + .18f, -.79f));
                rig.Camera.transform.rotation = Quaternion.LookRotation(slot - rig.Camera.transform.position);
                rig.Grabber.AdjustDistance((2.35f - rig.Grabber.HoldDistance) / .2f);
                rig.Step(.8f, sample);
                expectHeld = false; rig.Grabber.Release(); rig.Step(2, sample);
                check.Measure("carton lower deck face", box.bounds.min.y, "m");
                check.Measure("settled carton upright dot", Vector3.Dot(carton.transform.up, Vector3.up), "fraction");
                Need(Mathf.Abs(box.bounds.min.y - (ground + WarehouseCourierVisuals.DeckHeight)) < .04f && carton.linearVelocity.magnitude < .15f &&
                    Vector3.Dot(carton.transform.up, Vector3.up) > .92f,
                    "The physical setdown must settle upright on the cargo deck.");
                stage = "walk back out of loaded van"; Walk(3, -23.3f); Walk(3, -22.65f); Walk(6.5f, -22.65f);
            }
            finally { van.Dispose(); }
        }

        static void Floor(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var carton = rig.Carton(new Vector3(0, 1.65f, 1.5f));
            Need(rig.Grabber.TryPickup(carton), "Pickup should succeed.");
            rig.Camera.transform.localRotation = Quaternion.Euler(55, 0, 0);
            rig.Grabber.AdjustDistance(10);
            float penetration = 0;
            rig.Step(2.5f, () => penetration = Mathf.Max(penetration, Penetration(carton.GetComponent<BoxCollider>(), rig.Floor)));
            check.Measure("lowest held carton centre", carton.position.y, "m");
            check.Measure("floor penetration while lowering", penetration, "m");
            Need(carton.position.y < .7f && carton.position.y > .15f && penetration < .025f, "Lowering must respect the floor.");
            rig.Grabber.Release();
            rig.Step(2);
            Need(carton.GetComponent<BoxCollider>().bounds.min.y > -.025f && carton.linearVelocity.magnitude < .2f,
                "A released carton must settle on the actual floor.");
        }

        static void Rotation(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var carton = rig.Carton(new Vector3(0, 1.65f, 1.5f));
            Need(rig.Grabber.TryPickup(carton), "Pickup should succeed.");
            Quaternion view = rig.Camera.transform.rotation, initial = carton.rotation;
            for (int i = 0; i < 5; i++) rig.Grabber.HandlePointerInput(true, new Vector2(10, 0), 0);
            Need(Quaternion.Angle(initial, carton.rotation) < .0001f && rig.Grabber.IsRotating, "Mouse rotation must request torque, not write the pose.");
            float peakAngular = 0;
            rig.Step(1.5f, () => peakAngular = Mathf.Max(peakAngular, carton.angularVelocity.magnitude));
            check.Measure("physical rotation", Quaternion.Angle(initial, carton.rotation), "degrees");
            check.Measure("peak angular speed", peakAngular, "rad/s");
            Need(Quaternion.Angle(initial, carton.rotation) > 85 && Quaternion.Angle(view, rig.Camera.transform.rotation) < .001f && peakAngular < 3.5f,
                "The box must rotate physically while the camera stays still.");
            rig.Grabber.HandlePointerInput(false, Vector2.zero, 0);
            Need(!rig.Grabber.IsRotating, "Releasing right mouse must end rotation mode.");
        }

        static void PreserveOrientation(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var carton = rig.Carton(new Vector3(0, 1.65f, 1.5f));
            Quaternion original = Quaternion.Euler(11, 37, -8);
            carton.rotation = original;
            Physics.SyncTransforms();
            Need(rig.Grabber.TryPickup(carton), "An arbitrarily oriented carton should pick up.");
            Need(Quaternion.Angle(original, carton.rotation) < .001f, "Pickup must not snap the carton rotation.");
            rig.Camera.transform.rotation = Quaternion.Euler(12, 28, 0);
            rig.Grabber.HandlePointerInput(false, new Vector2(8, 4), 0);
            rig.Step(1.5f);
            float drift = Quaternion.Angle(original, carton.rotation);
            check.Measure("orientation drift after looking", drift, "degrees");
            Need(rig.Grabber.IsHolding && drift < 2 && !rig.Grabber.IsRotating,
                "Looking and moving the carry target must preserve the original world orientation.");
        }

        static void RotationAtWall(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var carton = rig.Carton(new Vector3(0, 1.65f, 1.3f), new Vector3(.9f, .35f, .3f));
            var wall = rig.Box("Rotation obstruction", new Vector3(0, 1.5f, 1.9f), new Vector3(4, 3, .06f));
            Need(rig.Grabber.TryPickup(carton), "Pickup should succeed.");
            rig.Grabber.AdjustDistance(10);
            rig.Step(1);
            for (int i = 0; i < 5; i++) rig.Grabber.HandlePointerInput(true, new Vector2(6, 0), 0);
            float penetration = 0, farthest = 0;
            rig.Step(2, () =>
            {
                penetration = Mathf.Max(penetration, Penetration(carton.GetComponent<BoxCollider>(), wall));
                farthest = Mathf.Max(farthest, carton.GetComponent<BoxCollider>().bounds.max.z);
            });
            check.Measure("rotation wall penetration", penetration, "m");
            Need(penetration < .015f && farthest <= wall.bounds.min.z + .015f,
                "Rotation must respect the physical wall for the full carton volume.");
        }

        static void Release(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var carton = rig.Carton(new Vector3(0, 1.65f, 1.5f));
            var box = carton.GetComponent<BoxCollider>();
            int iterations = carton.solverIterations, velocityIterations = carton.solverVelocityIterations;
            var detection = carton.collisionDetectionMode;
            var interpolation = carton.interpolation;
            Need(rig.Grabber.TryPickup(carton) && Physics.GetIgnoreCollision(box, rig.Motor), "Held freight must ignore the player capsule.");
            carton.linearVelocity = new Vector3(3, 3, 3);
            carton.angularVelocity = Vector3.up * 5;
            Vector3 position = carton.position;
            rig.Grabber.Release();
            float releaseSpeed = check.Measure("release speed", carton.linearVelocity.magnitude, "m/s");
            Need(!rig.Grabber.IsHolding && carton.GetComponent<WarehouseGrabbable>().Holder == null &&
                Vector3.Distance(position, carton.position) < .00001f && !carton.isKinematic && box.enabled && carton.useGravity &&
                releaseSpeed <= WarehouseGrabber.MaximumReleaseSpeed + .0001f && carton.angularVelocity.magnitude <= 1.5001f &&
                carton.solverIterations == iterations && carton.solverVelocityIterations == velocityIterations &&
                carton.collisionDetectionMode == detection && carton.interpolation == interpolation && !Physics.GetIgnoreCollision(box, rig.Motor),
                "Release must restore free physical behavior without moving the carton.");
            rig.Step(.4f);
            Need(carton.position.y < position.y - .4f, "Released freight must fall under gravity.");
            rig.Step(2);
            Need(box.bounds.min.y >= -.025f && carton.linearVelocity.magnitude < .2f, "Released freight must rest on the floor.");
        }

        static void PlayerCollision(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var carton = rig.Carton(new Vector3(0, 1.65f, 1.5f));
            var box = carton.GetComponent<BoxCollider>();
            Need(rig.Grabber.TryPickup(carton), "Pickup should succeed.");
            // Fixture setup represents a player stepping through a held box.
            // Production holding never writes this position.
            carton.position = new Vector3(0, .9f, 0);
            Physics.SyncTransforms();
            Vector3 playerPosition = rig.Player.transform.position;
            rig.Grabber.Release();
            Need(Physics.GetIgnoreCollision(box, rig.Motor), "Do not restore collision inside the player.");
            rig.Step(.8f);
            Need(Vector3.Distance(playerPosition, rig.Player.transform.position) < .0001f, "Released freight must not pull or move the player.");
            rig.Player.transform.position = Vector3.right * 2;
            Physics.SyncTransforms();
            rig.Grabber.TickPhysics(StepSeconds);
            Need(!Physics.GetIgnoreCollision(box, rig.Motor), "Collision must return after separation.");
            rig.Player.transform.position = Vector3.zero;
            carton.position = new Vector3(0, 1.65f, 1.5f);
            carton.linearVelocity = Vector3.zero;
            Physics.SyncTransforms();
            Physics.IgnoreCollision(box, rig.Motor, true);
            Need(rig.Grabber.TryPickup(carton), "Pickup with an existing ignore rule should succeed.");
            rig.Grabber.Release();
            Need(Physics.GetIgnoreCollision(box, rig.Motor), "A collision rule owned by another system must remain unchanged.");
            check.Measure("player displacement from carton", Vector3.Distance(playerPosition, rig.Player.transform.position), "m");
        }

        static void Lifecycle(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var carton = rig.Carton(new Vector3(0, 1.65f, 1.5f));
            Action[] transfers =
            {
                () => rig.Walking.SetBrowserActive(false),
                () => rig.Walking.SetExternalControl(false),
                () => rig.Walking.SetVehicleMode(true),
                () => { rig.Walking.CameraTransitionActive = true; rig.Grabber.TickPhysics(StepSeconds); },
                () => { rig.Walking.spawnPosition = new Vector3(4, 0, 0); rig.Walking.ResetPosition(); }
            };
            foreach (var transfer in transfers)
            {
                rig.PrepareControls();
                Need(rig.Grabber.TryPickup(carton), "Pickup before control transfer should succeed.");
                Vector3 position = carton.position;
                transfer();
                Need(!rig.Grabber.IsHolding && !rig.Grabber.IsRotating &&
                    Vector3.Distance(position, carton.position) < .00001f, "Control transfer must drop without a pose write.");
            }
            rig.PrepareControls();
            Need(rig.Grabber.TryPickup(carton), "Pickup before transition guard check should succeed.");
            rig.Walking.CameraTransitionActive = true;
            Vector3 beforeReset = rig.Player.transform.position;
            rig.Walking.spawnPosition = Vector3.right * 9;
            rig.Walking.ResetPosition();
            Need(Vector3.Distance(beforeReset, rig.Player.transform.position) < .001f && !rig.Walking.CanControl,
                "Camera transition must guard manual reset and movement.");
            rig.Grabber.TickPhysics(StepSeconds);
            Need(!rig.Grabber.IsHolding, "A camera transition must release freight.");
            check.Measure("validated control transfer paths", transfers.Length, "count");
        }

        static void Unreachable(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var carton = rig.Carton(new Vector3(0, 1.65f, 1.5f));
            Need(rig.Grabber.TryPickup(carton), "Pickup should succeed.");
            Vector3 position = carton.position;
            rig.Camera.transform.localPosition += Vector3.right * 1.1f;
            rig.Grabber.TickPhysics(StepSeconds);
            Need(!rig.Grabber.IsHolding && Vector3.Distance(position, carton.position) < .00001f,
                "A camera teleport must release without dragging the carton along.");
            rig.PrepareControls();
            Need(rig.Grabber.TryPickup(carton), "Pickup before obstruction should succeed.");
            rig.Box("New obstruction", new Vector3(0, 1.5f, .7f), new Vector3(4, 3, .05f));
            rig.Grabber.TickPhysics(StepSeconds);
            Need(rig.Grabber.IsHolding && Vector3.Distance(position, carton.position) < .00001f && Vector3.Distance(position, rig.Grabber.HoldTarget) < .00001f,
                "The occlusion grace period must brake at the actual body without a pose write.");
            rig.Step(.24f);
            Need(!rig.Grabber.IsHolding && rig.Grabber.LastReleaseReason == "view obstructed" && Mathf.Abs(position.z - carton.position.z) < .01f,
                "An unreachable hold must release after grace without passing through its obstruction.");
            check.Measure("occluded horizontal position change", Mathf.Abs(position.z - carton.position.z), "m");
        }

        static void LegacyParcel(Rig rig, ForkliftDrivingValidation.Check check)
        {
            var carton = rig.Carton(new Vector3(0, 1.65f, 1.5f));
            Need(rig.Grabber.TryPickup(carton) && rig.Walking.CarryingObject && !rig.Walking.CarryingParcel,
                "New freight must not activate the legacy parcel desk path.");
            rig.Grabber.Release();
            var service = rig.Create("Disposable legacy parcel service").AddComponent<WarehouseParcelService>();
            var parcel = rig.Create("Disposable legacy parcel").AddComponent<WarehouseParcel>();
            Set(service, "<Carried>k__BackingField", parcel);
            Set(rig.Walking, "parcelService", service);
            Need(rig.Walking.CarryingParcel && rig.Walking.CarryingObject && !rig.Grabber.TryPickup(carton),
                "Legacy carrying must remain intact and prevent a second held object.");
            Set(service, "<Carried>k__BackingField", null);
            Need(!rig.Walking.CarryingParcel && !rig.Walking.CarryingObject, "Receipt must leave no false carry guard.");
        }

        static float Penetration(Collider a, Collider b)
        {
            return Physics.ComputePenetration(a, a.transform.position, a.transform.rotation,
                b, b.transform.position, b.transform.rotation, out _, out float distance) ? distance : 0;
        }

        static void Set(object target, string name, object value)
        {
            var field = target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic);
            if (field == null) throw new MissingFieldException(target.GetType().Name, name);
            field.SetValue(target, value);
        }

        sealed class Rig : IDisposable
        {
            readonly Scene scene, previousActive;
            readonly PhysicsScene physics;
            readonly int previousFrameRate;
            readonly float previousTimeScale;
            readonly CursorLockMode previousCursorLock;
            readonly bool previousCursorVisible;
            public readonly GameObject Player;
            public readonly RackWalkController Walking;
            public readonly CharacterController Motor;
            public readonly Camera Camera;
            public readonly WarehouseGrabber Grabber;
            public readonly BoxCollider Floor;

            public Rig()
            {
                previousActive = SceneManager.GetActiveScene();
                previousFrameRate = Application.targetFrameRate;
                previousTimeScale = Time.timeScale;
                previousCursorLock = Cursor.lockState;
                previousCursorVisible = Cursor.visible;
                scene = EditorSceneManager.NewPreviewScene();
                physics = scene.GetPhysicsScene();
                try
                {
                    Need(physics.IsValid() && physics != Physics.defaultPhysicsScene, "Validation must have isolated physics.");
                    Time.timeScale = 1;
                    Player = Create("Disposable walking player");
                    Motor = Player.AddComponent<CharacterController>();
                    Motor.height = RackWalkController.StandingHeight;
                    Motor.radius = RackWalkController.BodyRadius;
                    Motor.center = Vector3.up * (Motor.height * .5f);
                    Camera = Create("Disposable disabled camera").AddComponent<Camera>();
                    Camera.transform.SetParent(Player.transform, false);
                    Camera.enabled = false;
                    Walking = Player.AddComponent<RackWalkController>();
                    Walking.eyes = Camera;
                    typeof(RackWalkController).GetMethod("Awake", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(Walking, null);
                    Grabber = Walking.Grabber;
                    Floor = Box("Disposable concrete floor", new Vector3(0, -.25f, 2), new Vector3(20, .5f, 20));
                    PrepareControls();
                    SceneManager.SetActiveScene(previousActive);
                }
                catch { Dispose(); throw; }
            }

            public void PrepareControls()
            {
                Grabber.Suspend();
                Walking.CameraTransitionActive = false;
                Set(Walking, "captured", true); Set(Walking, "awaitNeutral", false);
                Set(Walking, "hadFocus", true); Set(Walking, "browserActive", true);
                Set(Walking, "externalControl", true); Set(Walking, "applicationPaused", false);
                Set(Walking, "vehicleMode", false); Set(Walking, "parcelService", null);
                Motor.enabled = false;
                Player.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
                Motor.enabled = true;
                Walking.spawnPosition = Vector3.zero;
                Camera.transform.localPosition = Vector3.up * RackWalkController.StandingEyeHeight;
                Camera.transform.localRotation = Quaternion.identity;
                Physics.SyncTransforms();
            }

            public void Step(float seconds, Action sample = null)
            {
                for (int i = 0; i < Mathf.CeilToInt(seconds / StepSeconds); i++)
                {
                    Grabber.TickPhysics(StepSeconds);
                    physics.Simulate(StepSeconds);
                    sample?.Invoke();
                }
            }

            public void SimulatePendingStep() { physics.Simulate(StepSeconds); }

            public Rigidbody Carton(Vector3 position, Vector3 size = default)
            {
                if (size == default) size = new Vector3(.5f, .4f, .45f);
                var box = Box("Disposable marked carton", position, size);
                var body = box.gameObject.AddComponent<Rigidbody>();
                body.mass = 8;
                body.useGravity = true;
                body.linearDamping = .03f;
                body.angularDamping = .04f;
                body.gameObject.AddComponent<WarehouseGrabbable>().label = "test carton";
                Physics.SyncTransforms();
                return body;
            }

            public BoxCollider Box(string name, Vector3 centre, Vector3 size)
            {
                var obj = Create(name);
                obj.transform.position = centre;
                var box = obj.AddComponent<BoxCollider>();
                box.size = size;
                box.contactOffset = .005f;
                Physics.SyncTransforms();
                return box;
            }

            public GameObject Create(string name)
            {
                var obj = EditorUtility.CreateGameObjectWithHideFlags(name, HideFlags.HideAndDontSave);
                SceneManager.MoveGameObjectToScene(obj, scene);
                return obj;
            }

            public void Dispose()
            {
                if (Grabber != null) Grabber.Suspend();
                if (previousActive.IsValid()) SceneManager.SetActiveScene(previousActive);
                if (scene.IsValid()) EditorSceneManager.ClosePreviewScene(scene);
                Application.targetFrameRate = previousFrameRate;
                Time.timeScale = previousTimeScale;
                Cursor.lockState = previousCursorLock;
                Cursor.visible = previousCursorVisible;
                Physics.SyncTransforms();
            }
        }
    }
}
