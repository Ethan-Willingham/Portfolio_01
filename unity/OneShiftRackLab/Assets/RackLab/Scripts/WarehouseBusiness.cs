using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace OneShift.RackLab
{
    // A small wholesale business backed by actual pallet objects. Orders buy
    // incoming goods; accepted retailer requests pay only after the player has
    // received, loaded and dispatched the specified physical stock.
    public sealed class WarehouseBusiness : MonoBehaviour
    {
        [Serializable] public sealed class Product
        {
            public string id, name;
            public int cases, price;
            public Product(string id, string name, int cases, int price)
            { this.id = id; this.name = name; this.cases = cases; this.price = price; }
        }
        [Serializable] public sealed class RetailOrder
        {
            public string id, client, productId;
            public int pallets, payment;
            public bool accepted, shipping, complete;
            public RetailOrder(string id, string client, string productId, int pallets, int payment)
            { this.id = id; this.client = client; this.productId = productId; this.pallets = pallets; this.payment = payment; }
        }
        [Serializable] public sealed class LedgerEntry
        {
            public string label;
            public int amount;
            public LedgerEntry(string label, int amount) { this.label = label; this.amount = amount; }
        }
        public static readonly Product[] Products = {
            new Product("paper", "Kitchen paper", 48, 560),
            new Product("cleaning", "Cleaning supplies", 36, 640),
            new Product("pantry", "Dry pantry goods", 40, 720)
        };
        public const int PalletCapacity = 18;
        public int Cash { get; private set; } = 10000;
        public int Day { get; private set; } = 1;
        public int ReceivedCases { get; private set; }
        public int ShippedCases { get; private set; }
        public int PurchasedCases { get; private set; }
        public int OpeningCases { get; private set; }
        public string Message { get; private set; } = "Buy supplier stock, accept a retailer order, then load the requested pallets for dispatch.";
        public IReadOnlyList<WarehouseStockLot> Lots => lots;
        public IReadOnlyList<RetailOrder> Contracts => contracts;
        public IReadOnlyList<LedgerEntry> Ledger => ledger;
        public event Action Changed;
        public WarehouseReceiving Receiving { get; private set; }
        public RetailOrder ActiveOrder => contracts.Find(c => c.accepted && !c.complete);
        public bool PurchasePending => purchasePending || (Receiving != null && Receiving.HasQueuedDelivery);
        readonly List<WarehouseStockLot> lots = new List<WarehouseStockLot>();
        readonly List<RetailOrder> contracts = new List<RetailOrder>();
        readonly List<LedgerEntry> ledger = new List<LedgerEntry>();
        WarehouseDayNight clock;
        bool initialized, purchasePending;
        Product pendingProduct;
        int nextLot = 1, nextRequest = 4;
        float checkIn, previousHour = -1;

        public static WarehouseBusiness Ensure()
        {
            var business = UnityEngine.Object.FindFirstObjectByType<WarehouseBusiness>();
            if (business == null) business = new GameObject("Warehouse business").AddComponent<WarehouseBusiness>();
            business.Initialize();
            return business;
        }

        void Start() { Initialize(); }

        public void Initialize(WarehouseReceiving receiving = null)
        {
            if (initialized) return;
            Receiving = receiving != null ? receiving : UnityEngine.Object.FindFirstObjectByType<WarehouseReceiving>();
            if (Receiving == null || Receiving.cargo == null) return;
            initialized = true;
            clock = UnityEngine.Object.FindFirstObjectByType<WarehouseDayNight>();
            ledger.Add(new LedgerEntry("Opening cash", Cash));
            string[] openingProducts = { "paper", "paper", "cleaning", "pantry" };
            for (int i = 0; i < Receiving.cargo.Length; i++)
            {
                var product = FindProduct(openingProducts[i % openingProducts.Length]);
                RegisterLot(Receiving.cargo[i], product);
                OpeningCases += product.cases;
            }
            contracts.Add(new RetailOrder("request-1", "Oakline Stores", "paper", 1, 790));
            contracts.Add(new RetailOrder("request-2", "Northbank Supplies", "cleaning", 1, 910));
            contracts.Add(new RetailOrder("request-3", "Marsh and Field", "pantry", 1, 1020));
        }

        void Update()
        {
            if (!initialized) Initialize();
            if (!initialized || Time.timeScale <= 0 || !Application.isFocused) return;
            if (clock != null)
            {
                if (previousHour > 23 && clock.Hour < 1) Day++;
                previousHour = clock.Hour;
            }
            checkIn -= Time.deltaTime;
            if (checkIn > 0) return;
            checkIn = .25f;
            bool changed = false;
            foreach (var lot in lots)
            {
                if (lot == null || lot.Received || lot.Shipped || lot.Cargo == null || lot.Cargo.Body.isKinematic) continue;
                Vector3 p = lot.transform.position;
                // Crossing the dock into the building is an actual receipt.
                // A pallet still on the arriving trailer cannot be sold back
                // without the player ever unloading it.
                if (p.x < -11.3f || p.x > 11.3f || p.z < -9.8f || p.z > 11.5f || p.y < -.2f || p.y > 5) continue;
                lot.Received = true;
                ReceivedCases += lot.CaseCount;
                changed = true;
            }
            if (changed) Changed?.Invoke();
        }

        public static Product FindProduct(string id) => Array.Find(Products, item => item.id == id);

        WarehouseStockLot RegisterLot(PalletCargo cargo, Product product)
        {
            if (cargo == null || product == null) throw new InvalidOperationException("Delivery has no physical stock or product.");
            var lot = cargo.GetComponent<WarehouseStockLot>();
            if (lot != null && lots.Contains(lot)) return lot;
            if (lot == null) lot = cargo.gameObject.AddComponent<WarehouseStockLot>();
            lot.Sequence = nextLot++;
            lot.LotId = "WS-" + lot.Sequence.ToString("0000");
            lot.ProductId = product.id;
            lot.ProductName = product.name;
            lot.CaseCount = product.cases;
            lot.ArrivalDay = Day;
            cargo.description = product.name + " / " + product.cases + " cases / " + lot.LotId;
            lots.Add(lot);
            return lot;
        }

        public bool CanPurchase(string productId, out string reason)
        {
            var product = FindProduct(productId);
            if (product == null) { reason = "Supplier offer unavailable."; return false; }
            if (Receiving == null) { reason = "Receiving dock unavailable."; return false; }
            if (PurchasePending) { reason = "A supplier delivery is already booked."; return false; }
            if (lots.Count(lot => lot != null && !lot.Shipped) >= PalletCapacity) { reason = "Use or dispatch stock before buying another pallet."; return false; }
            if (Cash < product.price) { reason = "Not enough cash for this pallet."; return false; }
            reason = "One pallet / " + product.cases + " cases. Delivered by road truck.";
            return true;
        }

        public bool Purchase(string productId)
        {
            if (!CanPurchase(productId, out var reason)) return Notice(reason, false);
            var product = FindProduct(productId);
            // The receiving service owns when a safe, physically empty truck
            // can leave and return. Booking cannot replace existing cargo.
            purchasePending = true;
            pendingProduct = product;
            bool received = false;
            bool queued = Receiving.RequestDelivery(1, (cargo, index) =>
            {
                if (received) return;
                received = true;
                pendingProduct = null;
                RegisterLot(cargo, product);
                PurchasedCases += product.cases;
                purchasePending = false;
                Notice(product.name + " is arriving. Unload it at the receiving dock.", true);
            });
            if (!queued) { purchasePending = false; pendingProduct = null; return Notice("The dock cannot book another delivery yet.", false); }
            Cash -= product.price;
            ledger.Add(new LedgerEntry("Supplier / " + product.name, -product.price));
            return Notice("Booked one pallet of " + product.name.ToLowerInvariant() + ". Clear the current trailer for the next delivery.", true);
        }

        public WarehouseStockLot[] Manifest(RetailOrder order)
        {
            if (order == null) return Array.Empty<WarehouseStockLot>();
            // Receipt date and stable lot sequence retain first-in-first-out
            // stock selection instead of allowing a button to invent cases.
            return lots.Where(lot => lot != null && lot.Received && !lot.Shipped && lot.ProductId == order.productId)
                .OrderBy(lot => lot.ArrivalDay).ThenBy(lot => lot.Sequence).Take(order.pallets).ToArray();
        }

        public bool CanDispatch(RetailOrder order, out string reason)
        {
            if (order == null || !order.accepted || order.complete || order.shipping) { reason = "No accepted order ready to dispatch."; return false; }
            var manifest = Manifest(order);
            if (manifest.Length < order.pallets) { reason = "Receive " + order.pallets + " pallet of " + FindProduct(order.productId).name.ToLowerInvariant() + " first."; return false; }
            var cargo = manifest.Select(lot => lot.Cargo).ToArray();
            return Receiving.CanDispatch(cargo, out reason);
        }

        public bool ContractAction(string id)
        {
            var order = contracts.Find(c => c.id == id);
            if (order == null || order.complete) return Notice("This request is no longer available.", false);
            if (!order.accepted)
            {
                if (ActiveOrder != null) return Notice("Finish the accepted order before taking another.", false);
                order.accepted = true;
                // Owned stock must remain shippable after the previous truck
                // has left, without forcing an unrelated supplier purchase.
                Receiving.RequestPickup();
                return Notice("Accepted " + order.client + ". Receive the stock, load the oldest matching pallet into the trailer, then dispatch here.", true);
            }
            if (!CanDispatch(order, out var reason)) return Notice(reason, false);
            var manifest = Manifest(order);
            bool dispatched = Receiving.TryDispatch(manifest.Select(lot => lot.Cargo).ToArray(), () => CompleteShipment(order, manifest));
            if (!dispatched) return Notice("The trailer is not clear to leave. Check the loaded stock and dock.", false);
            order.shipping = true;
            return Notice("Order loaded. The truck is leaving for " + order.client + ".", true);
        }

        public bool ReleaseContract(string id)
        {
            var order = contracts.Find(c => c.id == id);
            if (order == null || !order.accepted || order.complete || order.shipping)
                return Notice("This order cannot be released after dispatch.", false);
            order.accepted = false;
            return Notice("Released the order from " + order.client + ". No payment has been taken.", true);
        }

        void CompleteShipment(RetailOrder order, WarehouseStockLot[] manifest)
        {
            if (order.complete) return;
            // The carrier has driven beyond the lot with this exact manifest.
            // Removal is offsite, after the player's physical loading work.
            order.complete = true;
            order.shipping = false;
            foreach (var lot in manifest)
            {
                if (lot == null || lot.Shipped) continue;
                lot.Shipped = true;
                ShippedCases += lot.CaseCount;
                if (Application.isPlaying) Destroy(lot.gameObject);
                else DestroyImmediate(lot.gameObject);
            }
            Cash += order.payment;
            ledger.Add(new LedgerEntry("Dispatch / " + order.client, order.payment));
            contracts.Add(new RetailOrder("request-" + nextRequest++, order.client, order.productId, 1, order.payment / order.pallets));
            Notice("Order dispatched to " + order.client + ". Payment posted to your account.", true);
        }

        bool Notice(string message, bool result)
        {
            Message = message;
            Changed?.Invoke();
            return result;
        }

        public int StockCases(string id) => lots.Where(lot => lot != null && lot.Received && !lot.Shipped && lot.ProductId == id).Sum(lot => lot.CaseCount);
        public int InboundCases(string id) => lots.Where(lot => lot != null && !lot.Received && !lot.Shipped && lot.ProductId == id).Sum(lot => lot.CaseCount)
            + (purchasePending && pendingProduct != null && pendingProduct.id == id ? pendingProduct.cases : 0);
        public bool ConservesCases => OpeningCases + PurchasedCases == ShippedCases + lots.Where(lot => lot != null && !lot.Shipped).Sum(lot => lot.CaseCount);
    }
}
