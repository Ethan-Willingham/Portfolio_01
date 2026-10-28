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
    // Production transactions on independent physical stock in a disposable
    // preview scene. Callback tests exercise the accounting boundary only;
    // receiving-route validation must separately prove the truck can reach it.
    public static class WarehouseBusinessValidation
    {
        const BindingFlags PrivateInstance = BindingFlags.Instance | BindingFlags.NonPublic;
        const string ReportPath = "Assets/RackLab/Reports/warehouse-business-validation.json";

        [Serializable]
        public sealed class Report
        {
            public string generatedUtc, unityVersion;
            public string method = "Production business transactions using a clone of the installed receiving start in an isolated preview scene. Native inventory, purchase and contract methods; actual supplier callback and explicitly simulated offsite shipment callback. No original scene objects, stock or assets are mutated. Does not certify physical driving, trailer support, road motion or browser interaction.";
            public bool passed;
            public List<ForkliftDrivingValidation.Check> checks = new List<ForkliftDrivingValidation.Check>();
        }

        [MenuItem("One Shift/Validate warehouse business transactions")]
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
                throw new InvalidOperationException("Stop Play before isolated business validation.");
            var source = Object.FindFirstObjectByType<WarehouseReceiving>();
            if (source == null || source.cargo == null || source.cargo.Length != 4)
                throw new InvalidOperationException("Install the four-pallet receiving start before business validation.");
            var report = new Report { generatedUtc = DateTime.UtcNow.ToString("O"), unityVersion = Application.unityVersion };

            Check(report, source, "opening physical capital", "Four independent opening pallets total 172 cases, $10,000 opening cash and three unaccepted retailer requests, with stable unique lot IDs.", (rig, check) =>
            {
                var business = rig.Business;
                check.Measure("opening cases", business.OpeningCases, "cases");
                check.Measure("opening cash", business.Cash, "USD");
                check.Measure("physical lots", business.Lots.Count, "count");
                check.passed = business.OpeningCases == 172 && business.Cash == 10000 && business.Lots.Count == 4 &&
                    business.Lots.Sum(lot => lot.CaseCount) == 172 && business.Lots.Select(lot => lot.LotId).Distinct().Count() == 4 &&
                    business.Lots.All(lot => !lot.Received && !lot.Shipped && lot.Cargo != null && lot.Cargo.gameObject.scene == rig.Scene) &&
                    business.Contracts.Count == 3 && business.ActiveOrder == null && business.Ledger.Count == 1 &&
                    business.Ledger[0].amount == 10000 && business.ConservesCases;
            });
            Check(report, source, "initialization is idempotent", "Calling initialization again cannot duplicate the opening pallets, contracts or ledger balance.", (rig, check) =>
            {
                string ids = string.Join(",", rig.Business.Lots.Select(lot => lot.LotId));
                rig.Business.Initialize(rig.Receiving);
                check.passed = rig.Business.Cash == 10000 && rig.Business.OpeningCases == 172 && rig.Business.Lots.Count == 4 &&
                    rig.Business.Contracts.Count == 3 && rig.Business.Ledger.Count == 1 && rig.Business.ConservesCases &&
                    string.Join(",", rig.Business.Lots.Select(lot => lot.LotId)) == ids;
            });
            Check(report, source, "invalid supplier item", "An unknown item cannot charge cash, reserve delivery capacity or create physical stock.", (rig, check) =>
            {
                bool available = rig.Business.CanPurchase("missing-product", out var reason);
                bool purchased = rig.Business.Purchase("missing-product");
                check.passed = !available && !purchased && !string.IsNullOrEmpty(reason) && rig.Business.Cash == 10000 &&
                    rig.Business.Ledger.Count == 1 && !rig.Business.PurchasePending && !rig.Receiving.HasQueuedDelivery &&
                    rig.Business.Lots.Count == 4 && rig.Business.ConservesCases;
            });
            Check(report, source, "one active retailer request without early payment", "Accepting one request reserves no cash payout; a second request and a repeated unfulfilled action cannot pay or replace it.", (rig, check) =>
            {
                bool first = rig.Business.ContractAction("request-1");
                var accepted = rig.Business.ActiveOrder;
                bool second = rig.Business.ContractAction("request-2");
                bool repeated = rig.Business.ContractAction("request-1");
                check.passed = first && !second && !repeated && accepted != null && accepted.id == "request-1" &&
                    ReferenceEquals(accepted, rig.Business.ActiveOrder) && rig.Business.Contracts.Count(order => order.accepted) == 1 &&
                    !accepted.shipping && !accepted.complete && rig.Business.Cash == 10000 && rig.Business.Ledger.Count == 1 &&
                    rig.Business.ShippedCases == 0 && rig.Business.ConservesCases;
            });
            Check(report, source, "release accepted order without inventory or payment changes", "An accepted order can be released before dispatch and another accepted. Unknown, unaccepted, completed and shipping orders reject release without changing cash, physical stock or payout.", (rig, check) =>
            {
                var business = rig.Business;
                var stock = business.Lots.ToArray();
                var positions = stock.Select(lot => lot.transform.position).ToArray();
                string originalStock = string.Join(",", stock.Select(lot => lot.LotId + ":" + lot.CaseCount + ":" + lot.Received + ":" + lot.Shipped));
                int cash = business.Cash, ledgerCount = business.Ledger.Count, shipped = business.ShippedCases;
                bool unknownRejected = !business.ReleaseContract("missing-request");
                bool unacceptedRejected = !business.ReleaseContract("request-1");
                Require(business.ContractAction("request-1"), "Could not accept the first fixture request.");
                var first = business.ActiveOrder;
                bool released = business.ReleaseContract(first.id);
                bool cleared = business.ActiveOrder == null && !first.accepted && !first.shipping && !first.complete;
                bool repeatedRejected = !business.ReleaseContract(first.id);
                bool differentAccepted = business.ContractAction("request-2");
                var second = business.ActiveOrder;
                Require(second != null && second.id == "request-2", "Released request did not free the active-order slot.");
                // These are isolated lifecycle fixtures. Neither flag creates
                // a shipment or invokes a payout; the release API must leave
                // each protected state exactly as it was presented.
                second.shipping = true;
                bool shippingRejected = !business.ReleaseContract(second.id) && second.accepted && second.shipping &&
                    ReferenceEquals(second, business.ActiveOrder);
                second.shipping = false;
                second.complete = true;
                bool completedRejected = !business.ReleaseContract(second.id) && second.accepted && second.complete;
                int rejected = new[] { unknownRejected, unacceptedRejected, repeatedRejected, shippingRejected, completedRejected }.Count(value => value);
                check.Measure("rejected invalid release attempts", rejected, "count");
                check.Measure("cash after release checks", business.Cash, "USD");
                check.passed = released && cleared && differentAccepted && rejected == 5 && business.Cash == cash &&
                    business.Ledger.Count == ledgerCount && business.ShippedCases == shipped && business.Contracts.Count == 3 &&
                    business.Lots.SequenceEqual(stock) && stock.Select((lot, i) => lot.transform.position == positions[i]).All(value => value) &&
                    string.Join(",", stock.Select(lot => lot.LotId + ":" + lot.CaseCount + ":" + lot.Received + ":" + lot.Shipped)) == originalStock &&
                    business.ConservesCases;
            });
            Check(report, source, "unreceived stock cannot dispatch", "Pallets still in the opening delivery do not qualify as received inventory, even for a matching accepted request.", (rig, check) =>
            {
                rig.Business.ContractAction("request-1");
                var order = rig.Business.ActiveOrder;
                bool canDispatch = rig.Business.CanDispatch(order, out var reason);
                check.Measure("paper cases available for sale", rig.Business.StockCases("paper"), "cases");
                check.passed = !canDispatch && rig.Business.Manifest(order).Length == 0 && !string.IsNullOrEmpty(reason) &&
                    rig.Business.StockCases("paper") == 0 && rig.Business.InboundCases("paper") == 96 &&
                    rig.Business.Cash == 10000 && rig.Business.ShippedCases == 0 && rig.Business.ConservesCases;
            });
            Check(report, source, "paid queued supplier order is visible and unique", "One paper pallet deducts $560 once and reserves a real road delivery. Its 48 cases appear inbound before spawning; repeat purchases cannot double charge or replace the booking.", (rig, check) =>
            {
                bool first = rig.Business.Purchase("paper");
                bool duplicate = rig.Business.Purchase("paper");
                bool competing = rig.Business.Purchase("cleaning");
                check.Measure("cash after supplier booking", rig.Business.Cash, "USD");
                check.Measure("paper cases inbound including booking", rig.Business.InboundCases("paper"), "cases");
                check.passed = first && !duplicate && !competing && rig.Business.Cash == 9440 && rig.Business.Ledger.Count == 2 &&
                    rig.Business.Ledger[1].amount == -560 && rig.Business.PurchasePending && rig.Receiving.HasQueuedDelivery &&
                    rig.Business.InboundCases("paper") == 144 && rig.Business.Lots.Count == 4 && rig.Business.PurchasedCases == 0 &&
                    rig.Business.ConservesCases;
            });
            Check(report, source, "supplier arrival callback counts physical stock once", "The booked shipment registers one actual new pallet, clears its pending count and retains 144 inbound paper cases. A repeated delivery callback cannot create more cases or charges.", (rig, check) =>
            {
                Require(rig.Business.Purchase("paper"), "Supplier booking rejected.");
                var delivered = rig.DeliverQueuedPallet(out var callback);
                callback(delivered, 0);
                check.Measure("physical stock after arrival callback", rig.Business.Lots.Count, "pallets");
                check.Measure("purchased cases", rig.Business.PurchasedCases, "cases");
                check.passed = rig.Business.Cash == 9440 && rig.Business.Ledger.Count == 2 && rig.Business.Lots.Count == 5 &&
                    rig.Business.PurchasedCases == 48 && rig.Business.InboundCases("paper") == 144 &&
                    !rig.Business.PurchasePending && !rig.Receiving.HasQueuedDelivery && rig.Business.ConservesCases &&
                    rig.Business.Lots.Select(lot => lot.LotId).Distinct().Count() == 5;
            });
            Check(report, source, "FIFO dates and stable lot identity", "Eligible stock is selected by arrival day and then stable lot sequence, even after reversing the backing collection.", (rig, check) =>
            {
                rig.Business.ContractAction("request-1");
                var paper = rig.Business.Lots.Where(lot => lot.ProductId == "paper").OrderBy(lot => lot.Sequence).ToArray();
                foreach (var lot in paper) lot.Received = true;
                paper[0].ArrivalDay = 2; paper[1].ArrivalDay = 1;
                bool dateWins = ReferenceEquals(rig.Business.Manifest(rig.Business.ActiveOrder).Single(), paper[1]);
                paper[0].ArrivalDay = 1;
                var list = (List<WarehouseStockLot>)Field(typeof(WarehouseBusiness), "lots").GetValue(rig.Business);
                list.Reverse();
                var chosen = rig.Business.Manifest(rig.Business.ActiveOrder).Single();
                check.passed = dateWins && ReferenceEquals(chosen, paper[0]) && chosen.LotId == "WS-0001" &&
                    rig.Business.StockCases("paper") == 96 && rig.Business.ConservesCases;
            });
            Check(report, source, "completed shipment pays and removes its manifest once", "The explicitly simulated offsite callback pays the accepted request once and removes exactly its 48-case manifest. Repeating it cannot duplicate money, shipped cases or the replacement request.", (rig, check) =>
            {
                rig.Business.ContractAction("request-1");
                var order = rig.Business.ActiveOrder;
                rig.Business.Lots.First(lot => lot.LotId == "WS-0001").Received = true;
                var manifest = rig.Business.Manifest(order);
                Require(manifest.Length == 1, "Expected one oldest received pallet.");
                order.shipping = true;
                Require(rig.Business.Cash == 10000 && rig.Business.ShippedCases == 0, "Shipping paid before completion.");
                var complete = Method(typeof(WarehouseBusiness), "CompleteShipment");
                complete.Invoke(rig.Business, new object[] { order, manifest });
                int cash = rig.Business.Cash, shipped = rig.Business.ShippedCases, entries = rig.Business.Ledger.Count, requests = rig.Business.Contracts.Count;
                complete.Invoke(rig.Business, new object[] { order, manifest });
                check.Measure("cash after completed dispatch", cash, "USD");
                check.Measure("shipped cases", shipped, "cases");
                check.Measure("remaining physical cases", rig.Business.Lots.Where(lot => lot != null).Sum(lot => lot.CaseCount), "cases");
                check.passed = order.complete && !order.shipping && rig.Business.ActiveOrder == null &&
                    cash == 10790 && shipped == 48 && entries == 2 && requests == 4 && manifest[0] == null &&
                    rig.Business.Lots.Where(lot => lot != null).Sum(lot => lot.CaseCount) == 124 && rig.Business.ConservesCases &&
                    rig.Business.Cash == cash && rig.Business.ShippedCases == shipped && rig.Business.Ledger.Count == entries && rig.Business.Contracts.Count == requests;
            });
            Check(report, source, "owned stock can request another truck without a purchase", "After one completed shipment leaves the truck away, accepting another order for existing stock requests a free empty return. Repeated pickup requests cannot debit cash, create cases or alter the remaining pallets.", (rig, check) =>
            {
                var business = rig.Business;
                foreach (var lot in business.Lots) lot.Received = true;
                Require(business.ContractAction("request-1"), "Could not accept the first shipment fixture.");
                var first = business.ActiveOrder;
                var firstManifest = business.Manifest(first);
                Require(firstManifest.Length == 1, "First shipment did not select one owned pallet.");
                first.shipping = true;
                Method(typeof(WarehouseBusiness), "CompleteShipment").Invoke(business, new object[] { first, firstManifest });
                // Present the same business boundary as an offsite departure.
                // The receiving suite separately advances the actual empty
                // return route and verifies its doors reopen without freight.
                var phaseSetter = typeof(WarehouseReceiving).GetProperty(nameof(WarehouseReceiving.Phase)).GetSetMethod(true);
                Require(phaseSetter != null && rig.Receiving.truck.gameObject.scene == rig.Scene,
                    "Isolated receiving departure fixture is unavailable.");
                phaseSetter.Invoke(rig.Receiving, new object[] { WarehouseReceiving.ReceivingPhase.Away });
                rig.Receiving.truck.gameObject.SetActive(false);
                var remaining = business.Lots.Where(lot => lot != null).ToArray();
                var positions = remaining.Select(lot => lot.transform.position).ToArray();
                int cash = business.Cash, ledger = business.Ledger.Count, purchased = business.PurchasedCases, shipped = business.ShippedCases;
                Require(!rig.Receiving.HasQueuedDelivery && !rig.Receiving.HasQueuedPickup && !business.PurchasePending,
                    "The empty return was already queued before accepting another order.");
                bool accepted = business.ContractAction("request-2");
                bool firstRepeat = rig.Receiving.RequestPickup();
                bool secondRepeat = rig.Receiving.RequestPickup();
                var manifest = business.Manifest(business.ActiveOrder);
                check.Measure("cash after free return request", business.Cash, "USD");
                check.Measure("purchased cases after free return request", business.PurchasedCases, "cases");
                check.Measure("remaining physical cases", remaining.Sum(lot => lot.CaseCount), "cases");
                check.passed = accepted && firstRepeat && secondRepeat && business.ActiveOrder != null &&
                    business.ActiveOrder.id == "request-2" && manifest.Length == 1 && manifest[0].LotId == "WS-0003" &&
                    rig.Receiving.HasQueuedPickup && !rig.Receiving.HasQueuedDelivery && !business.PurchasePending &&
                    business.Cash == cash && cash == 10790 && business.Ledger.Count == ledger &&
                    business.PurchasedCases == purchased && purchased == 0 && business.ShippedCases == shipped && shipped == 48 &&
                    business.Lots.Where(lot => lot != null).SequenceEqual(remaining) && remaining.Sum(lot => lot.CaseCount) == 124 &&
                    remaining.Select((lot, i) => lot.transform.position == positions[i]).All(value => value) && business.ConservesCases;
            });
            Check(report, source, "insufficient balance leaves orders untouched", "With a fixture balance below the paper pallet price, both availability and purchase reject without creating a debit or delivery.", (rig, check) =>
            {
                var setter = typeof(WarehouseBusiness).GetProperty(nameof(WarehouseBusiness.Cash)).GetSetMethod(true);
                Require(setter != null, "Fixture balance setter missing.");
                setter.Invoke(rig.Business, new object[] { 559 });
                bool available = rig.Business.CanPurchase("paper", out var reason);
                bool purchased = rig.Business.Purchase("paper");
                check.passed = !available && !purchased && !string.IsNullOrEmpty(reason) && rig.Business.Cash == 559 &&
                    rig.Business.Ledger.Count == 1 && !rig.Business.PurchasePending && !rig.Receiving.HasQueuedDelivery &&
                    rig.Business.Lots.Count == 4 && rig.Business.ConservesCases;
            });
            Check(report, source, "physical pallet capacity rejects another order", "Fourteen real supplier transactions fill the remaining pallet capacity. A nineteenth pallet is rejected even with enough money, preserving the paid stock and case total.", (rig, check) =>
            {
                for (int i = 4; i < WarehouseBusiness.PalletCapacity; i++)
                {
                    Require(rig.Business.Purchase("paper"), "Supplier booking failed before capacity at pallet " + (i + 1));
                    rig.DeliverQueuedPallet(out _);
                    Require(rig.Business.ConservesCases, "Case conservation failed during capacity setup.");
                }
                int beforeCash = rig.Business.Cash, beforeLedger = rig.Business.Ledger.Count;
                bool extra = rig.Business.Purchase("paper");
                check.Measure("physical pallet count", rig.Business.Lots.Count, "pallets");
                check.Measure("cash remaining at capacity", beforeCash, "USD");
                check.passed = !extra && rig.Business.Lots.Count == 18 && beforeCash == 2160 &&
                    rig.Business.Cash == beforeCash && rig.Business.Ledger.Count == beforeLedger && !rig.Business.PurchasePending &&
                    !rig.Receiving.HasQueuedDelivery && rig.Business.OpeningCases + rig.Business.PurchasedCases == 844 && rig.Business.ConservesCases;
            });
            Check(report, source, "unavailable receiving service cannot charge", "If the fixture has no delivery prefab, a rejected booking rolls back its pending state and retains the original cash and physical stock.", (rig, check) =>
            {
                rig.Receiving.deliveryPrefab = null;
                bool purchased = rig.Business.Purchase("paper");
                check.passed = !purchased && rig.Business.Cash == 10000 && rig.Business.Ledger.Count == 1 &&
                    !rig.Business.PurchasePending && !rig.Receiving.HasQueuedDelivery && rig.Business.InboundCases("paper") == 96 &&
                    rig.Business.Lots.Count == 4 && rig.Business.ConservesCases;
            });
            report.passed = report.checks.All(check => check.passed);
            return report;
        }

        static void Check(Report report, WarehouseReceiving source, string name, string expectation, Action<Fixture, ForkliftDrivingValidation.Check> action)
        {
            var check = new ForkliftDrivingValidation.Check { name = name, expectation = expectation };
            report.checks.Add(check);
            try { using (var fixture = new Fixture(source)) action(fixture, check); }
            catch (Exception error) { check.error = error.ToString(); check.passed = false; }
        }

        static void Require(bool value, string message)
        {
            if (!value) throw new InvalidOperationException(message);
        }

        static FieldInfo Field(Type type, string name)
        {
            var field = type.GetField(name, PrivateInstance);
            if (field == null) throw new InvalidOperationException(type.Name + "." + name + " fixture boundary missing.");
            return field;
        }

        static MethodInfo Method(Type type, string name)
        {
            var method = type.GetMethod(name, PrivateInstance);
            if (method == null) throw new InvalidOperationException(type.Name + "." + name + " fixture boundary missing.");
            return method;
        }

        sealed class Fixture : IDisposable
        {
            readonly Scene previousActive;
            readonly WarehouseReceiving original, originalActive;
            readonly PalletCargo[] originalCargo;
            readonly Vector3[] originalPositions;
            readonly string[] originalDescriptions;
            public readonly Scene Scene;
            public readonly WarehouseReceiving Receiving;
            public readonly WarehouseBusiness Business;

            public Fixture(WarehouseReceiving source)
            {
                original = source;
                originalActive = WarehouseReceiving.Active;
                originalCargo = (PalletCargo[])source.cargo.Clone();
                originalPositions = originalCargo.Select(cargo => cargo.transform.position).ToArray();
                originalDescriptions = originalCargo.Select(cargo => cargo.description).ToArray();
                previousActive = SceneManager.GetActiveScene();
                Scene = EditorSceneManager.NewPreviewScene();
                try
                {
                    var copy = Object.Instantiate(source.gameObject);
                    copy.name = "Disposable business receiving fixture";
                    copy.hideFlags = HideFlags.HideAndDontSave;
                    SceneManager.MoveGameObjectToScene(copy, Scene);
                    Receiving = copy.GetComponent<WarehouseReceiving>();
                    Require(Receiving != null && Receiving.cargo != null && Receiving.cargo.Length == 4,
                        "Copied receiving service has no opening stock.");
                    Require(Receiving.cargo.All(cargo => cargo != null && cargo.gameObject.scene == Scene &&
                        cargo.transform.IsChildOf(copy.transform) && !originalCargo.Contains(cargo)), "Fixture references original stock.");
                    var businessObject = new GameObject("Disposable warehouse ledger") { hideFlags = HideFlags.HideAndDontSave };
                    SceneManager.MoveGameObjectToScene(businessObject, Scene);
                    Business = businessObject.AddComponent<WarehouseBusiness>();
                    Business.Initialize(Receiving);
                    foreach (var lot in Business.Lots) Method(typeof(WarehouseStockLot), "Awake").Invoke(lot, null);
                    Require(Business.Receiving == Receiving, "Business bound to original receiving service.");
                    SceneManager.SetActiveScene(previousActive);
                }
                catch { Dispose(); throw; }
            }

            public PalletCargo DeliverQueuedPallet(out Action<PalletCargo, int> callback)
            {
                Require(Receiving.HasQueuedDelivery && Receiving.deliveryPrefab != null, "No real supplier booking to deliver.");
                callback = (Action<PalletCargo, int>)Field(typeof(WarehouseReceiving), "configureQueuedCargo").GetValue(Receiving);
                Require(callback != null, "Supplier booking did not retain its production callback.");
                // This is the same boundary crossed by BeginQueuedDelivery:
                // an actual prefab clone is created, the road booking clears,
                // and its production callback registers that specific object.
                var cargo = Object.Instantiate(Receiving.deliveryPrefab, Receiving.transform);
                cargo.name = "Disposable supplier pallet";
                cargo.transform.localPosition = new Vector3(60 + Business.Lots.Count * 2, 0, 0);
                Require(cargo.gameObject.scene == Scene, "Supplier fixture was created outside the isolated scene.");
                Field(typeof(WarehouseReceiving), "queuedCount").SetValue(Receiving, 0);
                Field(typeof(WarehouseReceiving), "configureQueuedCargo").SetValue(Receiving, null);
                callback(cargo, 0);
                var lot = cargo.GetComponent<WarehouseStockLot>();
                Require(lot != null, "Supplier callback did not register its physical pallet.");
                Method(typeof(WarehouseStockLot), "Awake").Invoke(lot, null);
                return cargo;
            }

            public void Dispose()
            {
                if (previousActive.IsValid() && previousActive.isLoaded) SceneManager.SetActiveScene(previousActive);
                if (Scene.IsValid() && Scene.isLoaded) EditorSceneManager.ClosePreviewScene(Scene);
                // Cloned lifecycle messages must never replace the live marker.
                typeof(WarehouseReceiving).GetProperty(nameof(WarehouseReceiving.Active)).GetSetMethod(true)
                    .Invoke(null, new object[] { originalActive });
                Require(original != null && original.cargo.Length == originalCargo.Length, "Original receiving stock changed.");
                for (int i = 0; i < originalCargo.Length; i++)
                    Require(original.cargo[i] == originalCargo[i] && originalCargo[i] != null &&
                        originalCargo[i].transform.position == originalPositions[i] && originalCargo[i].description == originalDescriptions[i],
                        "Original pallet changed during isolated business validation.");
            }
        }
    }
}
