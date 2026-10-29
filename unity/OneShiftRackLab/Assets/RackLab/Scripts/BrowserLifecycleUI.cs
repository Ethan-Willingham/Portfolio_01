using System;
using System.Linq;
using UnityEngine;
using UnityEngine.Scripting;

namespace OneShift.RackLab
{
    public sealed partial class BrowserLifecycle
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern void WarehouseReportHUD(string json);
#endif
        bool computerOpen;
        int uiRevision;
        float nextHUD, noticeUntil;
        string currentNotice = "";
        RackWalkController uiWalking;
        ForkliftPlayerInteraction uiDriver;
        ForkliftLiftController uiLift;
        WarehouseDayNight uiClock;
        WarehouseReceiving uiReceiving;
        WarehouseBusiness uiBusiness;
        WarehouseCareer uiCareer;
        WarehouseComputerTransition computerTransition;
        public bool ComputerOpen => computerOpen;
        public bool ComputerTransitioning => computerTransition != null && computerTransition.Active;
        public bool PresentationActive => pageActive && windowFocused && !applicationPaused;

        void Start()
        {
            uiWalking = UnityEngine.Object.FindFirstObjectByType<RackWalkController>();
            uiDriver = UnityEngine.Object.FindFirstObjectByType<ForkliftPlayerInteraction>();
            uiLift = UnityEngine.Object.FindFirstObjectByType<ForkliftLiftController>();
            uiClock = UnityEngine.Object.FindFirstObjectByType<WarehouseDayNight>();
            uiReceiving = UnityEngine.Object.FindFirstObjectByType<WarehouseReceiving>();
            uiWms = UnityEngine.Object.FindFirstObjectByType<WarehouseWmsRuntime>();
            uiCareer = UnityEngine.Object.FindFirstObjectByType<WarehouseCareer>();
            if (uiWms != null) uiWms.Changed += WmsChanged;
            else if (uiCareer != null) uiCareer.Changed += CareerChanged;
            else { uiBusiness = WarehouseBusiness.Ensure(); uiBusiness.Changed += BusinessChanged; }
            computerTransition = gameObject.AddComponent<WarehouseComputerTransition>();
        }

        void Update()
        {
            if (preparing || Time.unscaledTime < nextHUD) return;
            if (uiLift == null && ((uiCareer != null && uiCareer.ForkliftOwned) || (uiWms != null && uiWms.ForkliftOwned)))
            {
                uiDriver = UnityEngine.Object.FindFirstObjectByType<ForkliftPlayerInteraction>();
                uiLift = UnityEngine.Object.FindFirstObjectByType<ForkliftLiftController>();
            }
            bool lever = uiDriver != null && uiDriver.ForkControlHeld;
            nextHUD = Time.unscaledTime + (lever ? .05f : .2f);
            PublishHUD();
        }

        void BusinessChanged()
        {
            currentNotice = uiBusiness.Message;
            noticeUntil = Time.unscaledTime + 6;
            PublishHUD();
        }

        void CareerChanged()
        {
            currentNotice = uiCareer.Message;
            noticeUntil = Time.unscaledTime + 6;
            PublishHUD();
        }

        public void OpenComputer()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            if (preparing || computerOpen || ComputerTransitioning || uiWalking == null || !uiWalking.CanControl || uiWalking.VehicleMode) return;
            if (uiWalking.CarryingObject)
            { currentNotice = "Put the carton down before using the computer."; noticeUntil = Time.unscaledTime + 4; PublishHUD(); return; }
            uiWalking.SetExternalControl(false);
            computerTransition.Enter(uiWalking, this, () => { computerOpen = true; ApplyState(); PublishHUD(); });
            ApplyState();
            PublishHUD();
#else
            // The supported product runs in the browser, whose HTML desk owns
            // this modal. Scene/physics inspection in the Editor must remain
            // controllable when no host UI exists to close it.
            Debug.Log("The office desk is available in the browser player. Editor movement remains active.");
#endif
        }

        [Serializable, Preserve]
        sealed class UIRequest { public string action, id, value; }

        [Preserve]
        public void UICommand(string json)
        {
            UIRequest request;
            try { request = JsonUtility.FromJson<UIRequest>(json); }
            catch (ArgumentException) { return; }
            if (request == null) return;
            uiRevision++;
            if (WmsCommand(request)) return;
            switch (request.action)
            {
                case "computer-close":
                    if (!computerOpen || ComputerTransitioning) break;
                    computerOpen = false;
                    computerTransition.Exit(() => { ApplyState(); uiWalking?.ResumeAfterComputerTransition(); PublishHUD(); });
                    ApplyState();
                    break;
                case "order":
                    if (computerOpen) { if (uiWms != null) uiWms.Book(request.id); else if (uiCareer != null) uiCareer.Purchase(request.id); else uiBusiness?.Purchase(request.id); }
                    break;
                case "contract":
                    if (computerOpen) { if (uiWms != null) uiWms.ReleaseOrder(request.id); else if (uiCareer != null) uiCareer.Accept(request.id); else uiBusiness?.ContractAction(request.id); }
                    break;
                case "cancel-contract":
                    if (computerOpen) uiBusiness?.ReleaseContract(request.id);
                    break;
                case "upgrade":
                    if (computerOpen) { if (uiWms != null) uiWms.Upgrade(request.id); else uiCareer?.Upgrade(request.id); }
                    break;
                case "resume":
                    if (!suspended && !preparing && !computerOpen && !ComputerTransitioning)
                    {
                        if (uiDriver != null && uiDriver.IsDriving) uiDriver.ResumeControlsFromUI();
                        else uiWalking?.ResumeControlsFromUI();
                    }
                    break;
            }
            // SendMessage still runs synchronously while the engine frame loop
            // is paused behind the office screen. Confirm each transaction now.
            PublishHUD();
        }

        public string HUDSnapshot()
        {
            var state = new HUDState();
            state.mode = uiWms != null ? uiWms.Sandbox ? "sandbox" : "career" : uiCareer != null ? "career" : "sandbox";
            var grabber = uiWalking != null ? uiWalking.GetComponent<WarehouseGrabber>() : null;
            state.holding = grabber != null && grabber.IsHolding;
            state.carryDistance = grabber != null ? grabber.HoldDistance : 0;
            int minutes = uiClock != null ? Mathf.FloorToInt(uiClock.Hour * 60) % 1440 : 270;
            int hour = minutes / 60;
            state.clock = ((hour + 11) % 12 + 1).ToString() + ":" + (minutes % 60).ToString("00") + (hour < 12 ? " AM" : " PM");
            state.location = "Warehouse";
            state.objective = "Receive the delivery";
            state.detail = uiReceiving != null ? uiReceiving.StatusText : "Walk to the receiving dock";
            state.driving = uiDriver != null && uiDriver.IsDriving;
            if (state.driving)
            {
                state.location = "Forklift";
                state.hint = uiDriver.ContextHint;
                state.hintKey = uiDriver.ContextHintKey;
                state.hydraulics = uiDriver.ForkControlHeld;
                state.hydraulicInput = uiDriver.ForkSliderNormalized;
                state.forkSpeed = uiDriver.MouseLiftInput;
                state.training = uiDriver.TrainingStep;
                state.forkHeight = uiLift != null ? uiLift.LiftHeightMeters : 0;
            }
            else if (uiWalking != null)
            {
                state.hint = uiWalking.ContextHint;
                state.hintKey = uiWalking.ContextHintKey;
                if (string.IsNullOrEmpty(state.hint) && uiDriver != null)
                { state.hint = uiDriver.ContextHint; state.hintKey = uiDriver.ContextHintKey; }
                Vector3 p = uiWalking.transform.position;
                if (p.y < -.3f) state.location = "Business park";
                else if (p.x > 3.8f && p.z < -4 && p.z > -10) state.location = "Office";
            }
            if (uiWms != null)
            {
                state.objective = uiWms.Objective; state.detail = uiWms.ObjectiveDetail;
                state.computer = WmsComputerSnapshot(); state.wms = uiWms.Capture();
            }
            else if (uiCareer != null)
            {
                state.objective = uiCareer.Objective;
                state.detail = uiCareer.ObjectiveDetail;
                state.computer = CareerComputerSnapshot();
            }
            else if (uiBusiness != null)
            {
                var order = uiBusiness.ActiveOrder;
                if (order != null)
                {
                    state.objective = order.shipping ? "Order dispatched" : "Order / " + order.client;
                    state.detail = order.shipping ? "The truck is leaving the business park" :
                        "Load " + order.pallets + " pallet of " + WarehouseBusiness.FindProduct(order.productId).name.ToLowerInvariant();
                }
                else if (uiReceiving != null && uiReceiving.DoorsOpen && uiReceiving.DeliveredCount >= uiReceiving.cargo.Length)
                {
                    state.objective = "Your next order";
                    state.detail = "Use the office computer to buy stock and accept retailer requests";
                }
                state.computer = ComputerSnapshot();
            }
            else state.computer = new ComputerState { open = computerOpen };
            state.notice = state.driving && !string.IsNullOrEmpty(uiDriver.Notice) ? uiDriver.Notice :
                !computerOpen && Time.unscaledTime < noticeUntil ? currentNotice : "";
            return JsonUtility.ToJson(state);
        }

        void PublishHUD()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            if (uiWalking != null) WarehouseReportHUD(HUDSnapshot());
#endif
        }

        ComputerState ComputerSnapshot()
        {
            var result = new ComputerState { open = computerOpen, cash = uiBusiness.Cash, revision = uiRevision,
                title = "Warehouse desk", company = "Sandbox operations", mode = "sandbox", suggestedTab = "stock",
                transitioning = ComputerTransitioning, transitionProgress = computerTransition != null ? computerTransition.Progress : 0,
                transitionDirection = computerTransition != null && computerTransition.Returning ? "out" : "in",
                summary = "Day " + uiBusiness.Day + " / wholesale stock and retailer orders", message = uiBusiness.Message };
            if (!computerOpen) return result;
            result.inventory = WarehouseBusiness.Products.Select(product => new InventoryRow
            {
                id = product.id, name = product.name, quantity = uiBusiness.StockCases(product.id),
                unit = uiBusiness.InboundCases(product.id) > 0 ? "cases / " + uiBusiness.InboundCases(product.id) + " inbound" : "cases"
            }).ToArray();
            result.orders = WarehouseBusiness.Products.Select(product =>
            {
                bool enabled = uiBusiness.CanPurchase(product.id, out var reason);
                return new OfferRow { id = product.id, name = product.name, detail = reason, price = product.price,
                    action = "Order pallet", enabled = enabled };
            }).ToArray();
            result.contracts = uiBusiness.Contracts.Where(order => !order.complete).Select(order =>
            {
                var product = WarehouseBusiness.FindProduct(order.productId);
                string detail = order.pallets + " pallet / " + (product.cases * order.pallets) + " cases of " + product.name.ToLowerInvariant();
                bool enabled = uiBusiness.ActiveOrder == null;
                string action = "Accept order", status = "Available";
                if (order.accepted)
                {
                    status = order.shipping ? "Dispatching" : "Accepted";
                    action = "Dispatch loaded order";
                    enabled = uiBusiness.CanDispatch(order, out var reason);
                    var lots = uiBusiness.Manifest(order);
                    detail = order.shipping ? "Close the computer to let the loaded truck leave. Payment arrives after it exits the park." :
                        (string.IsNullOrEmpty(reason) ? "Trailer ready for dispatch." : reason) +
                        (lots.Length > 0 ? " Order lots: " + string.Join(", ", lots.Select(lot => lot.LotId)) + "." : "");
                }
                return new OfferRow { id = order.id, name = order.client, detail = detail, price = order.payment,
                    action = action, enabled = enabled, status = status,
                    secondaryAction = order.accepted && !order.shipping ? "Release order" : "",
                    secondaryCommand = "cancel-contract", secondaryEnabled = order.accepted && !order.shipping };
            }).ToArray();
            result.ledger = uiBusiness.Ledger.Skip(Math.Max(0, uiBusiness.Ledger.Count - 12))
                .Reverse().Select(item => new LedgerRow { label = item.label, amount = item.amount }).ToArray();
            return result;
        }

        void ReleaseHUD()
        {
            if (uiBusiness != null) uiBusiness.Changed -= BusinessChanged;
            if (uiWms != null) uiWms.Changed -= WmsChanged;
            if (uiCareer != null) uiCareer.Changed -= CareerChanged;
            if (computerOpen && uiWalking != null) uiWalking.SetExternalControl(true);
        }

        [Serializable, Preserve] sealed class HUDState
        {
            public string clock, location, objective, detail, mode, hintKey = "", hint = "", notice = "", training = "";
            public bool driving, hydraulics, holding;
            public float forkHeight, forkSpeed, hydraulicInput, carryDistance;
            public ComputerState computer;
            public WarehouseWmsRuntime.Snapshot wms;
        }
        [Serializable, Preserve] sealed class ComputerState
        {
            public bool open, transitioning;
            public float transitionProgress;
            public string title, summary, message, mode, company, stage, stageDetail, suggestedTab, transitionDirection;
            public int cash, completedOrders;
            public int revision;
            public InventoryRow[] inventory = Array.Empty<InventoryRow>();
            public OfferRow[] orders = Array.Empty<OfferRow>(), contracts = Array.Empty<OfferRow>();
            public OfferRow[] upgrades = Array.Empty<OfferRow>();
            public LedgerRow[] ledger = Array.Empty<LedgerRow>();
        }
        [Serializable, Preserve] sealed class InventoryRow { public string id, name, unit; public int quantity; }
        [Serializable, Preserve] sealed class OfferRow
        {
            public string id, name, detail, action, status, secondaryAction, secondaryCommand;
            public int price;
            public bool enabled, secondaryEnabled, owned;
        }
        [Serializable, Preserve] sealed class LedgerRow { public string label; public int amount; }
    }
}
