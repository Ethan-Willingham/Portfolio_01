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
    public static class WarehouseCareerValidation
    {
        const float StepSeconds = .02f;
        const string ReportPath = "Assets/RackLab/Reports/warehouse-career-validation.json";
        const BindingFlags Fields = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

        [Serializable] public sealed class Report
        {
            public string generatedUtc;
            public string method = "Public career transactions and real courier delivery/collection ticks in isolated PhysX. Installed static collision geometry, receiving root, racks and forklift are copied. Carton positioning is explicit fixture setup; stock receipt, manifest checks and offsite payment use production methods.";
            public string scope = "Transaction and physical-stock integration. Native mouse handling, rendered delivery animation and full forklift pallet transport need their separate browser and receiving checks. Future equipment balances are seeded only for threshold tests.";
            public bool passed;
            public List<ForkliftDrivingValidation.Check> checks = new List<ForkliftDrivingValidation.Check>();
        }

        [MenuItem("One Shift/Validate distribution career")]
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
            if (EditorApplication.isPlayingOrWillChangePlaymode) throw new InvalidOperationException("Stop Play before isolated career validation.");
            var source = Object.FindFirstObjectByType<WarehouseReceiving>();
            Need(source != null, "Open the installed RackFloor scene before validation.");
            var report = new Report { generatedUtc = DateTime.UtcNow.ToString("O") };
            Check(report, source, "empty opening and idempotent initialization", "The career opens with $600, no cartons, no truck cargo and no free racks, forklift or optional decoration.", Opening);
            Check(report, source, "invalid and premature transactions preserve balances", "Unknown offers, locked suppliers, early equipment and missing stock cannot debit money or create promises.", Rejections);
            Check(report, source, "first purchase creates one identified batch", "Three physical tape cartons cost exactly $120 once; duplicate purchase, early order and inactive courier ticks leave balances and identities unchanged.", Purchase);
            Check(report, source, "receipt requires physical supported putaway", "Real courier delivery creates loose stock outside; suspended, kinematic and held cartons cannot count, and actual bay settling takes at least 0.45 seconds.", Receipt);
            Check(report, source, "exact physical manifest pays only offsite", "Missing or extra cartons block departure; acceptance and loading pay nothing; the actual completed route pays $210 exactly once and conserves all cartons.", Payment);
            Check(report, source, "the carton business can repeat", "A second physical purchase, receipt and shipment completes without another unlock, reaching $780 after two tape orders.", Repeat);
            Check(report, source, "oldest physical carton IDs are reserved first", "Two purchased batches retain six unique sequence IDs and acceptance reserves the oldest three without paying.", Fifo);
            Check(report, source, "equipment unlock and working-cash reserve", "Racks and forklift require three orders and retain $120. Actual installed equipment becomes active once, and a pallet needs both purchases.", Equipment);
            Check(report, source, "physical pallet progression and dock pickup", "One paid pallet arrives on the real truck, must settle on the purchased rack before acceptance, reuses the docked delivery truck and pays only after physical reloading and offsite departure.", BulkProgression);
            Check(report, source, "missing equipment cannot consume money", "A missing rack or forklift root rejects the upgrade before debit.", MissingEquipment);
            Check(report, source, "optional purchases charge once", "Fish and flame purchases create their real scene decoration once; flames require the forklift, and repeat requests leave money and ledger unchanged.", OptionalPurchases);
            Check(report, source, "insufficient working cash rejects stock", "A balance below the $120 tape purchase price cannot create cartons, queue a visit or debit money.", InsufficientCash);
            report.passed = report.checks.All(check => check.passed);
            return report;
        }

        static void Check(Report report, WarehouseReceiving source, string name, string expectation, Action<Fixture, ForkliftDrivingValidation.Check> action)
        {
            var check = new ForkliftDrivingValidation.Check { name = name, expectation = expectation };
            report.checks.Add(check);
            try { using (var fixture = new Fixture(source)) { action(fixture, check); check.Measure("courier simulation", fixture.SimulatedSeconds, "s"); } check.passed = true; }
            catch (Exception error) { check.error = error.ToString(); check.passed = false; }
        }

        static void Opening(Fixture f, ForkliftDrivingValidation.Check check)
        {
            var c = f.Career;
            Need(c.Cash == 600 && c.CompletedOrders == 0 && c.PurchasedCartons == 0 && c.ReceivedCartons == 0 &&
                c.ShippedCartons == 0 && c.Boxes.Count == 0 && c.BulkPallet == null && c.BulkPurchased == 0 &&
                c.ActiveOrder == null && c.ConservesStock && !c.RacksOwned && !c.ForkliftOwned && !c.FishOwned && !c.FlamesOwned,
                "Opening career must contain only its working capital.");
            Need(f.Receiving.StartEmpty && f.Receiving.cargo.Length == 0 && !f.Receiving.truck.gameObject.activeSelf &&
                !f.Racks.activeSelf && !f.Forklift.activeSelf && !f.Courier.Busy, "Opening equipment and both carriers must be unavailable.");
            c.Initialize(f.Receiving, f.Walking, f.Courier, f.Racks, f.Forklift);
            Need(c.Ledger.Count == 1 && c.Ledger[0].amount == 600 && c.Cash == 600 && c.Boxes.Count == 0,
                "Repeated initialization cannot grant more stock or capital.");
        }

        static void Rejections(Fixture f, ForkliftDrivingValidation.Check check)
        {
            var c = f.Career;
            Need(!c.Purchase("unknown") && !c.Purchase("towels") && !c.Purchase("gloves") && !c.Purchase("bulk") &&
                !c.Accept("tape") && !c.Accept("bulk") && !c.Accept("unknown") &&
                !c.Upgrade("racks") && !c.Upgrade("forklift") && !c.Upgrade("fish") && !c.Upgrade("flames"),
                "Unavailable first-day transactions must reject.");
            Need(c.Cash == 600 && c.Ledger.Count == 1 && c.Boxes.Count == 0 && c.ActiveOrder == null &&
                !f.Courier.Busy && !f.Receiving.HasQueuedDelivery && c.ConservesStock, "Rejection must leave every balance intact.");
        }

        static void Purchase(Fixture f, ForkliftDrivingValidation.Check check)
        {
            var c = f.Career;
            Need(c.Purchase("tape"), "The opening tape offer must be purchasable.");
            var ids = c.Boxes.Select(box => box.Sequence).ToArray();
            Need(c.Cash == 480 && c.PurchasedCartons == 3 && c.Boxes.Count == 3 && c.PurchasePending && c.ConservesStock &&
                ids.Distinct().Count() == 3 && c.Boxes.All(box => box.ProductId == "tape" && box.InTransit && !box.Received &&
                    box.Body != null && box.GetComponent<BoxCollider>() != null && box.GetComponent<WarehouseGrabbable>() != null),
                "The payment must create one identified physical three-carton batch.");
            int ledger = c.Ledger.Count;
            Need(!c.Purchase("tape") && !c.Accept("tape") && !c.Accept("towels"), "A pending delivery must reject duplicate stock and early promises.");
            Vector3 van = f.Courier.VanPosition;
            for (int i = 0; i < 30; i++) f.Courier.Tick(StepSeconds, false);
            Need(c.Cash == 480 && c.Ledger.Count == ledger && c.Boxes.Select(box => box.Sequence).SequenceEqual(ids) &&
                Vector3.Distance(van, f.Courier.VanPosition) < .00001f && c.ReceivedCartons == 0 && c.ConservesStock,
                "Inactivity and repeated commands must preserve this exact purchase.");
            check.Measure("opening purchase debit", 600 - c.Cash, "dollars");
        }

        static void Receipt(Fixture f, ForkliftDrivingValidation.Check check)
        {
            f.BuyAndDeliver();
            var c = f.Career;
            Need(c.ReceivedCartons == 0 && c.Available("tape") == 0 && !c.CanAccept("tape", out _),
                "Porch delivery must not automatically receive the stock.");
            var boxes = c.Boxes.ToArray();
            Need(boxes.All(box => !box.InTransit && !box.Body.isKinematic && box.Body.useGravity), "Courier placement must release actual dynamic stock.");
            f.PlaceInBays(1.15f);
            c.TickStock(1);
            Need(c.ReceivedCartons == 0, "An unsupported suspended carton cannot count as received.");
            f.PlaceInBays(.2f);
            foreach (var box in boxes) box.Body.isKinematic = true;
            c.TickStock(1);
            Need(c.ReceivedCartons == 0, "Kinematic freight must not count as put away.");
            foreach (var box in boxes) box.Body.isKinematic = false;
            f.PhysicsOnly(1);
            f.AimFromBay(boxes[0]);
            Need(f.Grabber.TryPickup(boxes[0].Body), "The first stored-position carton must remain physically pickable.");
            c.TickStock(.44f);
            Need(c.ReceivedCartons == 0, "Less than 0.45 seconds cannot complete receipt.");
            c.TickStock(.1f);
            Need(!boxes[0].Received && c.ReceivedCartons == 2, "The held carton must be excluded while its two supported peers are received.");
            f.Grabber.Release();
            f.PhysicsOnly(.4f);
            c.TickStock(.44f);
            Need(!boxes[0].Received, "Releasing the held carton must start its own settlement interval.");
            c.TickStock(.02f);
            Need(c.ReceivedCartons == 3 && c.Available("tape") == 3 && c.CanAccept("tape", out _) && c.Cash == 480 && c.ConservesStock,
                "The real supported settlement must unlock the customer order without paying.");
        }

        static void Payment(Fixture f, ForkliftDrivingValidation.Check check)
        {
            f.BuyAndDeliver(); f.StoreAll();
            var c = f.Career;
            Need(c.Accept("tape"), "Received tape stock should book a collection.");
            var order = c.ActiveOrder;
            var callback = f.CollectionCallback();
            Need(c.Cash == 480 && order.manifest.Length == 3 && order.manifest.All(box => box.Reserved) &&
                !c.Accept("tape") && !c.Purchase("tape"), "Acceptance must reserve once without payment or a second transaction.");
            f.Until(() => f.Courier.ReadyForLoading, 90, "collection arrival");
            f.Load(order.manifest[0], 0); f.Load(order.manifest[1], 1);
            var foreign = f.ForeignCarton(f.Courier.CargoPlacementPosition(2));
            f.Step(1);
            Need(f.Courier.LoadedCount == 2 && !f.Courier.CanDispatch(out _), "An unrelated carton cannot replace a missing reserved ID.");
            foreign.position = f.Courier.VanTransform.TransformPoint(new Vector3(0, .72f, .35f));
            foreign.linearVelocity = Vector3.zero; foreign.angularVelocity = Vector3.zero;
            f.Load(order.manifest[2], 2); f.Step(.6f);
            Need(f.Courier.LoadedCount == 3 && !f.Courier.CanDispatch(out _) && c.Cash == 480 && c.ShippedCartons == 0,
                "Extra unmanifested freight must block departure and payment.");
            Object.DestroyImmediate(foreign.gameObject); Physics.SyncTransforms();
            Need(f.Courier.CanDispatch(out _), "The exact settled physical manifest should be dispatchable.");
            f.Until(() => f.Courier.State == WarehouseCourierService.VisitState.DrivingOut, 60, "outbound loading and close");
            Need(c.Cash == 480 && c.ShippedCartons == 0 && c.ActiveOrder == order, "A van still on the route must not pay yet.");
            f.Until(() => !f.Courier.Busy, 40, "offsite payment");
            Need(c.Cash == 690 && c.CompletedOrders == 1 && c.PurchasedCartons == 3 && c.ShippedCartons == 3 &&
                c.ActiveOrder == null && c.Boxes.All(box => box == null || box.Shipped) && c.ConservesStock,
                "Offsite completion must pay once and remove exactly the purchased physical manifest.");
            int ledger = c.Ledger.Count;
            callback(); callback(); f.Step(.2f);
            Need(c.Cash == 690 && c.CompletedOrders == 1 && c.ShippedCartons == 3 && c.Ledger.Count == ledger && c.ConservesStock,
                "A duplicated production completion callback must be harmless.");
            Need(c.Ledger.Sum(entry => entry.amount) == c.Cash, "The actual transaction ledger must reconcile with cash.");
            check.Measure("cash after first completed order", c.Cash, "dollars");
        }

        static void Repeat(Fixture f, ForkliftDrivingValidation.Check check)
        {
            f.CompleteTapeCycle();
            Need(f.Career.CanPurchase("tape", out _) && f.Career.CanPurchase("towels", out _) && f.Career.CanPurchase("gloves", out _),
                "A completed order must leave a working next purchase path and open the other suppliers.");
            f.CompleteTapeCycle();
            var c = f.Career;
            Need(c.Cash == 780 && c.CompletedOrders == 2 && c.PurchasedCartons == 6 && c.ShippedCartons == 6 &&
                c.ReceivedCartons == 6 && c.ConservesStock && c.Ledger.Sum(entry => entry.amount) == c.Cash,
                "The second physical cycle must retain all money and stock identities.");
            check.Measure("cash after two orders", c.Cash, "dollars");
        }

        static void Fifo(Fixture f, ForkliftDrivingValidation.Check check)
        {
            f.BuyAndDeliver(); f.StoreAll();
            int[] first = f.Career.Boxes.Select(box => box.Sequence).OrderBy(id => id).ToArray();
            f.BuyAndDeliver(); f.StoreAll();
            Need(f.Career.Boxes.Select(box => box.Sequence).Distinct().Count() == 6 && f.Career.Available("tape") == 6,
                "Both real deliveries must retain unique physical identities.");
            Need(f.Career.Accept("tape") && f.Career.ActiveOrder.manifest.Select(box => box.Sequence).SequenceEqual(first),
                "The earliest purchased cartons must be the reserved physical manifest.");
            Need(f.Career.Cash == 360 && f.Career.ShippedCartons == 0 && f.Career.ConservesStock, "FIFO reservation must not pay or remove stock.");
        }

        static void Equipment(Fixture f, ForkliftDrivingValidation.Check check)
        {
            var c = f.Career;
            FutureBalance(c, 5000, 2);
            Need(!c.Upgrade("racks") && !c.Upgrade("forklift") && !c.Purchase("bulk"), "Money cannot bypass the three-order equipment unlock.");
            FutureBalance(c, 419, 3);
            Need(!c.Upgrade("racks") && c.Cash == 419, "Rack purchase cannot leave $119 working cash.");
            FutureBalance(c, 420, 3);
            Need(c.Upgrade("racks") && c.Cash == 120 && c.RacksOwned && f.Racks.activeInHierarchy &&
                f.Racks.GetComponentsInChildren<Collider>().Length > 0, "The exact reserve threshold must install the actual racks.");
            Need(!c.Upgrade("racks") && c.Cash == 120 && !c.Purchase("bulk"), "Duplicate racks and a pallet without a forklift must reject.");
            FutureBalance(c, 769, 3);
            Need(!c.Upgrade("forklift"), "Forklift purchase cannot leave $119 working cash.");
            FutureBalance(c, 770, 3);
            Need(c.Upgrade("forklift") && c.Cash == 120 && f.Forklift.activeInHierarchy &&
                f.Forklift.GetComponent<ForkliftDriveController>().isActiveAndEnabled, "The exact threshold must activate the actual forklift.");
            Need(!c.Upgrade("forklift") && c.Cash == 120 && !c.Purchase("bulk"), "Duplicate equipment and unaffordable pallets must reject.");
            FutureBalance(c, 480, 3);
            Need(c.Purchase("bulk") && c.Cash == 0 && c.BulkPending && c.BulkPurchased == 1 &&
                f.Receiving.HasQueuedDelivery && c.ConservesStock, "Both installed equipment purchases must permit one paid real pallet booking.");
            Need(!c.Purchase("bulk") && !c.Accept("bulk") && c.Cash == 0 && c.BulkPurchased == 1,
                "A queued pallet is neither a second purchase nor received rack stock.");
        }

        static void MissingEquipment(Fixture f, ForkliftDrivingValidation.Check check)
        {
            FutureBalance(f.Career, 2000, 3);
            Set(f.Career, "racks", null); Set(f.Career, "forklift", null);
            int ledger = f.Career.Ledger.Count;
            Need(!f.Career.Upgrade("racks") && !f.Career.Upgrade("forklift") && f.Career.Cash == 2000 && f.Career.Ledger.Count == ledger,
                "Missing equipment cannot be charged for.");
        }

        static void BulkProgression(Fixture f, ForkliftDrivingValidation.Check check)
        {
            var c = f.Career;
            FutureBalance(c, 2000, 3);
            Need(c.Upgrade("racks") && c.Upgrade("forklift") && c.Purchase("bulk") && c.Cash == 570,
                "A funded business with three orders must buy actual equipment and one pallet.");
            f.ReceivingUntil(() => f.Receiving.DoorsOpen, 85, "paid pallet arrival");
            var pallet = c.BulkPallet;
            Need(pallet != null && f.Receiving.cargo.Length == 1 && f.Receiving.cargo[0] == pallet &&
                !pallet.Body.isKinematic && !c.BulkPending && c.BulkPurchased == 1 && c.ConservesStock &&
                !c.Accept("bulk"), "A delivered pallet must remain unavailable until actual rack putaway.");
            Vector3 loadingPosition = pallet.Body.position;
            Quaternion loadingRotation = pallet.Body.rotation;
            var slot = f.Receiving.storagePositions[0];
            Need(slot.gameObject.scene == f.Scene, "The fixture rack slot must belong to the isolated scene.");
            pallet.Body.position = slot.position + Vector3.up * .007f;
            pallet.Body.rotation = slot.rotation;
            pallet.Body.linearVelocity = pallet.Body.angularVelocity = Vector3.zero;
            Physics.SyncTransforms();
            f.ReceivingStep(3);
            Need(c.BulkStored && f.Receiving.StoredCount == 1, "The actual purchased rack must support the pallet before the order unlocks.");
            int cash = c.Cash;
            Need(c.Accept("bulk") && c.ActiveOrder != null && c.ActiveOrder.pallet == pallet && c.Cash == cash &&
                f.Receiving.DoorsOpen && !f.Receiving.HasQueuedPickup && !f.Receiving.HasQueuedDelivery && f.Receiving.cargo.Length == 1,
                "RequestPickup during the existing delivery visit must reuse that truck without buying or duplicating freight.");
            Need(!c.Accept("dispatch-bulk") && !c.BulkShipping && c.Cash == cash, "A pallet still on the rack cannot dispatch.");
            pallet.Body.position = loadingPosition; pallet.Body.rotation = loadingRotation;
            pallet.Body.linearVelocity = pallet.Body.angularVelocity = Vector3.zero;
            Physics.SyncTransforms(); f.ReceivingStep(2);
            Need(c.Accept("dispatch-bulk") && c.BulkShipping && c.Cash == cash, "A physically reloaded pallet must start departure without early payment.");
            var callback = (Action)Get(f.Receiving, "departed");
            f.ReceivingUntil(() => f.Receiving.Phase == WarehouseReceiving.ReceivingPhase.Departing, 10, "pallet truck closing");
            Need(c.Cash == cash && c.BulkShipped == 0 && pallet != null, "The actual outbound pallet remains unpaid while the truck is on site.");
            f.ReceivingUntil(() => f.Receiving.Phase == WarehouseReceiving.ReceivingPhase.Away, 65, "pallet offsite payment");
            Need(c.Cash == 1410 && c.CompletedOrders == 4 && c.BulkPurchased == 1 && c.BulkShipped == 1 &&
                c.BulkPallet == null && pallet == null && !c.BulkShipping && c.ActiveOrder == null && c.ConservesStock,
                "The departure callback and receiving owner must pay and remove the same pallet exactly once.");
            int ledger = c.Ledger.Count; callback();
            Need(c.Cash == 1410 && c.BulkShipped == 1 && c.Ledger.Count == ledger && c.ConservesStock,
                "A duplicate pallet completion callback must not pay twice.");
            Need(c.Purchase("bulk") && c.Cash == 930 && c.BulkPurchased == 2 && c.BulkPending && c.ConservesStock,
                "A completed pallet order must leave a paid repeat path.");
            check.Measure("cash after pallet shipment", 1410, "dollars");
        }

        static void OptionalPurchases(Fixture f, ForkliftDrivingValidation.Check check)
        {
            var c = f.Career;
            FutureBalance(c, 2000, 3);
            Need(!c.Upgrade("flames") && c.Cash == 2000, "The flame kit needs an owned forklift.");
            Need(c.Upgrade("fish") && c.Cash == 1905 && c.FishOwned && c.GetComponentsInChildren<WarehouseCareerDecor>().Length == 1,
                "Fish purchase must create the actual interactive decoration.");
            int ledger = c.Ledger.Count;
            Need(!c.Upgrade("fish") && c.Cash == 1905 && c.Ledger.Count == ledger, "A repeated fish purchase must not charge again.");
            Need(c.Upgrade("forklift") && c.Upgrade("flames") && c.Cash == 1190 && c.FlamesOwned &&
                f.Forklift.GetComponentsInChildren<Transform>().Count(t => t.name == "Painted flame kit") == 4,
                "The actual forklift flame geometry should install once at the advertised price.");
            ledger = c.Ledger.Count;
            Need(!c.Upgrade("flames") && c.Cash == 1190 && c.Ledger.Count == ledger, "A repeated flame purchase must not duplicate its charge.");
        }

        static void InsufficientCash(Fixture f, ForkliftDrivingValidation.Check check)
        {
            FutureBalance(f.Career, 119, 0);
            Need(!f.Career.Purchase("tape") && f.Career.Cash == 119 && f.Career.PurchasedCartons == 0 &&
                f.Career.Boxes.Count == 0 && !f.Courier.Busy && f.Career.Ledger.Count == 1 && f.Career.ConservesStock,
                "An unaffordable order must not create physical stock or a carrier visit.");
        }

        static void FutureBalance(WarehouseCareer c, int cash, int completed)
        { Set(c, "<Cash>k__BackingField", cash); Set(c, "<CompletedOrders>k__BackingField", completed); }
        static void Need(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
        static object Get(object instance, string field) => instance.GetType().GetField(field, Fields).GetValue(instance);
        static void Set(object instance, string field, object value) => instance.GetType().GetField(field, Fields).SetValue(instance, value);
        static void Invoke(object instance, string method) => instance.GetType().GetMethod(method, Fields).Invoke(instance, null);

        sealed class Fixture : IDisposable
        {
            readonly Scene scene, previousActive;
            readonly PhysicsScene physics;
            readonly WarehouseReceiving original, originalActive;
            readonly PalletCargo[] originalCargo;
            readonly Vector3[] originalPositions;
            readonly GameObject originalVehicle, originalRacks;
            readonly bool vehicleActive, racksActive;
            readonly int frameRate;
            readonly float timeScale;
            readonly CursorLockMode cursorLock;
            readonly bool cursorVisible;
            readonly HashSet<Object> originalResources;
            public readonly WarehouseCareer Career;
            public readonly WarehouseCourierService Courier;
            public readonly WarehouseReceiving Receiving;
            public readonly RackWalkController Walking;
            public readonly WarehouseGrabber Grabber;
            public readonly GameObject Racks, Forklift;
            public Scene Scene => scene;
            public float SimulatedSeconds { get; private set; }

            public Fixture(WarehouseReceiving source)
            {
                original = source; originalActive = WarehouseReceiving.Active;
                originalCargo = (PalletCargo[])source.cargo.Clone(); originalPositions = originalCargo.Select(c => c.transform.position).ToArray();
                originalVehicle = source.gameObject.scene.GetRootGameObjects().SelectMany(root => root.GetComponentsInChildren<ForkliftDriveController>(true)).First().gameObject;
                originalRacks = source.GetComponentsInChildren<Transform>(true).First(t => t.name == "Starting wall racks").gameObject;
                vehicleActive = originalVehicle.activeSelf; racksActive = originalRacks.activeSelf;
                previousActive = SceneManager.GetActiveScene(); frameRate = Application.targetFrameRate; timeScale = Time.timeScale;
                cursorLock = Cursor.lockState; cursorVisible = Cursor.visible;
                originalResources = new HashSet<Object>(Resources.FindObjectsOfTypeAll<Material>().Cast<Object>().Concat(Resources.FindObjectsOfTypeAll<Mesh>()).Concat(Resources.FindObjectsOfTypeAll<AudioClip>()));
                scene = EditorSceneManager.NewPreviewScene(); physics = scene.GetPhysicsScene();
                try
                {
                    Need(physics.IsValid() && physics != Physics.defaultPhysicsScene, "Career validation requires isolated physics.");
                    Time.timeScale = 1;
                    var copy = Object.Instantiate(source.gameObject); copy.name = "Disposable career receiving warehouse";
                    copy.hideFlags = HideFlags.HideAndDontSave; SceneManager.MoveGameObjectToScene(copy, scene);
                    Receiving = copy.GetComponent<WarehouseReceiving>();
                    Need(Receiving.cargo.All(c => c != null && c.gameObject.scene == scene && !originalCargo.Contains(c)) &&
                        Receiving.truck.gameObject.scene == scene && Receiving.dockBarrier.gameObject.scene == scene,
                        "The copied receiving service must not reference original freight or machinery.");
                    Racks = copy.GetComponentsInChildren<Transform>(true).First(t => t.name == "Starting wall racks").gameObject;
                    CopyStaticCollision(source.gameObject.scene, source.transform);
                    Forklift = Object.Instantiate(originalVehicle); Forklift.hideFlags = HideFlags.HideAndDontSave;
                    SceneManager.MoveGameObjectToScene(Forklift, scene);
                    foreach (var camera in Forklift.GetComponentsInChildren<Camera>(true)) camera.enabled = false;
                    var player = Create("Disposable career walker");
                    var motor = player.AddComponent<CharacterController>(); motor.height = 1.78f; motor.radius = .25f; motor.center = Vector3.up * .89f;
                    var eye = Create("Disposable career camera").AddComponent<Camera>(); eye.transform.SetParent(player.transform, false); eye.transform.localPosition = Vector3.up * 1.65f; eye.enabled = false;
                    Walking = player.AddComponent<RackWalkController>(); Walking.eyes = eye; Invoke(Walking, "Awake");
                    Grabber = Walking.Grabber; Set(Walking, "parcelService", null);
                    player.transform.position = new Vector3(-8, 0, -7);
                    Set(Walking, "captured", true); Set(Walking, "awaitNeutral", false);
                    Courier = Create("Disposable career courier").AddComponent<WarehouseCourierService>(); Courier.Initialize();
                    Career = Create("Disposable distribution account").AddComponent<WarehouseCareer>();
                    Career.Initialize(Receiving, Walking, Courier, Racks, Forklift);
                    Invoke(Receiving, "Start");
                    Physics.SyncTransforms();
                    SceneManager.SetActiveScene(previousActive);
                }
                catch { Dispose(); throw; }
            }

            // The copied receiving root contains its own yard and racks. Other
            // authored static shapes supply the real office shelf, porch, ramp,
            // warehouse floor and street, without running original light scripts.
            void CopyStaticCollision(Scene source, Transform copiedRoot)
            {
                foreach (var collider in source.GetRootGameObjects().SelectMany(root => root.GetComponentsInChildren<Collider>(true)))
                {
                    if (!collider.enabled || !collider.gameObject.activeInHierarchy || collider.isTrigger || collider.attachedRigidbody != null ||
                        collider is CharacterController || collider.transform.IsChildOf(copiedRoot) || collider.GetComponentInParent<WarehouseParcel>() != null ||
                        Parents(collider.transform).Any(t => t.name == "Decorative parcel van")) continue;
                    var obj = Create(collider.name);
                    obj.layer = collider.gameObject.layer; obj.transform.SetPositionAndRotation(collider.transform.position, collider.transform.rotation);
                    obj.transform.localScale = collider.transform.lossyScale;
                    Collider result;
                    if (collider is BoxCollider box) { var value = obj.AddComponent<BoxCollider>(); value.center = box.center; value.size = box.size; result = value; }
                    else if (collider is MeshCollider mesh) { var value = obj.AddComponent<MeshCollider>(); value.sharedMesh = mesh.sharedMesh; value.convex = mesh.convex; result = value; }
                    else if (collider is SphereCollider sphere) { var value = obj.AddComponent<SphereCollider>(); value.center = sphere.center; value.radius = sphere.radius; result = value; }
                    else if (collider is CapsuleCollider capsule) { var value = obj.AddComponent<CapsuleCollider>(); value.center = capsule.center; value.radius = capsule.radius; value.height = capsule.height; value.direction = capsule.direction; result = value; }
                    else throw new InvalidOperationException("Unsupported authored collision shape: " + collider.GetType().Name);
                    result.sharedMaterial = collider.sharedMaterial; result.contactOffset = collider.contactOffset;
                }
            }

            static IEnumerable<Transform> Parents(Transform item) { while (item != null) { yield return item; item = item.parent; } }
            GameObject Create(string name)
            { var obj = EditorUtility.CreateGameObjectWithHideFlags(name, HideFlags.HideAndDontSave); SceneManager.MoveGameObjectToScene(obj, scene); return obj; }

            public void Step(float seconds)
            {
                for (int i = 0; i < Mathf.CeilToInt(seconds / StepSeconds); i++)
                {
                    Courier.Tick(StepSeconds); Physics.SyncTransforms(); physics.Simulate(StepSeconds);
                    Career.TickStock(StepSeconds); SimulatedSeconds += StepSeconds;
                }
            }
            public void PhysicsOnly(float seconds)
            { for (int i = 0; i < Mathf.CeilToInt(seconds / StepSeconds); i++) { Physics.SyncTransforms(); physics.Simulate(StepSeconds); } }
            public void ReceivingStep(float seconds)
            {
                float step = Time.fixedDeltaTime;
                Need(step > 0 && step <= .02f, "Receiving validation needs the configured fixed physics timestep.");
                for (int i = 0; i < Mathf.CeilToInt(seconds / step); i++)
                {
                    Invoke(Receiving, "FixedUpdate"); Physics.SyncTransforms(); physics.Simulate(step);
                    Career.TickStock(step); SimulatedSeconds += step;
                }
            }
            public void ReceivingUntil(Func<bool> condition, float maximumSeconds, string boundary)
            {
                float step = Time.fixedDeltaTime;
                for (int i = 0; i < Mathf.CeilToInt(maximumSeconds / step) && !condition(); i++) ReceivingStep(step);
                Need(condition(), "Timed out at " + boundary + ": " + Receiving.Phase + " / " + Receiving.StatusText);
            }
            public void Until(Func<bool> condition, float maximumSeconds, string boundary)
            {
                for (int i = 0; i < Mathf.CeilToInt(maximumSeconds / StepSeconds) && !condition(); i++) Step(StepSeconds);
                Need(condition(), "Timed out at " + boundary + ": " + Courier.State + " / " + Courier.Status + " / driver " + Courier.DriverPosition + " / van " + Courier.VanPosition);
            }
            public void BuyAndDeliver()
            {
                Need(Career.Purchase("tape"), "Tape purchase was rejected: " + Career.Message);
                Until(() => !Career.PurchasePending && !Courier.Busy, 260, "three-carton delivery and departure");
                Need(Career.ConservesStock, "Delivery must preserve the paid carton count.");
            }
            public void PlaceInBays(float height)
            {
                foreach (var product in WarehouseCareer.Products)
                {
                    int index = 0;
                    foreach (var box in Career.Boxes.Where(b => b != null && !b.Shipped && b.ProductId == product.id))
                    {
                        box.Body.position = product.bay + new Vector3((index % 3 - 1) * .55f, height - product.bay.y, (index / 3) * .5f);
                        box.Body.rotation = Quaternion.identity; box.Body.linearVelocity = Vector3.zero; box.Body.angularVelocity = Vector3.zero;
                        index++;
                    }
                }
                Physics.SyncTransforms();
            }
            public void StoreAll()
            { PlaceInBays(.35f); PhysicsOnly(1); Career.TickStock(.5f); Need(Career.Boxes.Where(b => b != null && !b.Shipped).All(b => b.Received), "Actual bay support must receive the delivered cartons."); }
            public void AimFromBay(WarehouseCareerBox box)
            {
                var motor = Walking.GetComponent<CharacterController>(); motor.enabled = false;
                Walking.transform.position = new Vector3(box.Body.position.x, 0, box.Body.position.z - 1.1f); motor.enabled = true;
                Walking.eyes.transform.rotation = Quaternion.LookRotation(box.Body.position - Walking.eyes.transform.position);
                Set(Walking, "captured", true); Set(Walking, "awaitNeutral", false); Physics.SyncTransforms();
            }
            public void Load(WarehouseCareerBox box, int index)
            { box.Body.position = Courier.CargoPlacementPosition(index); box.Body.rotation = Courier.VanTransform.rotation; box.Body.linearVelocity = Vector3.zero; box.Body.angularVelocity = Vector3.zero; Physics.SyncTransforms(); }
            public Rigidbody ForeignCarton(Vector3 position)
            { var obj = Create("Unmanifested fixture carton"); obj.transform.position = position; obj.AddComponent<BoxCollider>().size = new Vector3(.48f, .36f, .38f); var body = obj.AddComponent<Rigidbody>(); body.mass = 6; Physics.SyncTransforms(); return body; }
            public Action CollectionCallback() => (Action)Get(Get(Courier, "active"), "complete");
            public void CompleteTapeCycle()
            {
                int before = Career.CompletedOrders;
                BuyAndDeliver(); StoreAll(); Need(Career.Accept("tape"), "Stored stock should book the next collection.");
                Until(() => Courier.ReadyForLoading, 90, "collection arrival");
                for (int i = 0; i < Career.ActiveOrder.manifest.Length; i++) Load(Career.ActiveOrder.manifest[i], i);
                Until(() => !Courier.Busy, 100, "loaded collection departure");
                Need(Career.CompletedOrders == before + 1 && Career.ConservesStock, "A repeat shipment must complete exactly one order.");
            }

            public void Dispose()
            {
                var owned = new HashSet<Object>();
                if (scene.IsValid() && scene.isLoaded)
                {
                    foreach (var root in scene.GetRootGameObjects())
                    {
                        foreach (var renderer in root.GetComponentsInChildren<Renderer>(true)) foreach (var material in renderer.sharedMaterials) if (material != null) owned.Add(material);
                        foreach (var mesh in root.GetComponentsInChildren<MeshFilter>(true)) if (mesh.sharedMesh != null) owned.Add(mesh.sharedMesh);
                        foreach (var source in root.GetComponentsInChildren<AudioSource>(true)) if (source.clip != null) owned.Add(source.clip);
                    }
                    if (Grabber != null) Grabber.Suspend();
                    EditorSceneManager.ClosePreviewScene(scene);
                }
                foreach (var asset in owned) if (asset != null && !EditorUtility.IsPersistent(asset) && !originalResources.Contains(asset)) Object.DestroyImmediate(asset);
                if (previousActive.IsValid()) SceneManager.SetActiveScene(previousActive);
                typeof(WarehouseReceiving).GetProperty(nameof(WarehouseReceiving.Active)).GetSetMethod(true).Invoke(null, new object[] { originalActive });
                Application.targetFrameRate = frameRate; Time.timeScale = timeScale; Cursor.lockState = cursorLock; Cursor.visible = cursorVisible;
                Physics.SyncTransforms();
                Need(original != null && original.cargo.SequenceEqual(originalCargo) && originalVehicle.activeSelf == vehicleActive && originalRacks.activeSelf == racksActive,
                    "Career validation must not modify original stock or equipment availability.");
                for (int i = 0; i < originalCargo.Length; i++) Need(originalCargo[i] != null && originalCargo[i].transform.position == originalPositions[i], "Original pallet position changed.");
            }
        }
    }
}
