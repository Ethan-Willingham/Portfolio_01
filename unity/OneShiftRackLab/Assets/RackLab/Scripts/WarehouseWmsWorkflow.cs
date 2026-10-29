using System;
using System.Linq;
using UnityEngine;
using L = OneShift.RackLab.WarehouseWmsLedger;

namespace OneShift.RackLab
{
    public sealed partial class WarehouseWmsRuntime
    {
        [Serializable] public sealed class WorkflowState
        {
            public string tile="home",step="home",title="Latchford WMS",instruction="Choose a task on your TC22.",orderId="",sourceBin="",destinationBin="",cartonId="";
            public int completed,total;
            public bool canConfirm;
            public string confirmLabel="Confirm";
        }
        [Serializable] public sealed class ScanState
        {public string code="",label="",status="ready";public int sequence;}
        public WorkflowState Workflow { get; private set; } = new WorkflowState();
        public ScanState ScanResult { get; private set; } = new ScanState();
        bool collectionBooked;
        public string Objective => Workflow.tile!="home"&&Workflow.tile!="lookup"?Workflow.title:
            !string.IsNullOrEmpty(collectionOrder)?"Fulfill "+collectionOrder:
            Ledger.Expected()>0?(inTransit.Count==Ledger.Expected()?"Supplier delivery on its way":"Receive incoming cartons"):
            Ledger.InReceiving()>0?"Put received stock away":
            Ledger.OnHand()==0?(CompletedOrders==0?"Start your distribution business":"Restock your warehouse"):"Manage your warehouse";
        public string ObjectiveDetail => Workflow.tile!="home"&&Workflow.tile!="lookup"?Workflow.instruction:
            !string.IsNullOrEmpty(collectionOrder)?(collectionBooked?"Use Ship on the TC22 to load and confirm the collection. Payment follows departure.":"Use Pick on the TC22 to move this order's allocated cartons into STAGE-01."):
            Ledger.Expected()>0?(inTransit.Count==Ledger.Expected()?"The driver will leave your cartons at REC-01 outside the front door.":"Right click inspects TC22. Receive the PO, then transfer cartons into storage."):
            Ledger.InReceiving()>0?"Use Transfer on the TC22. Move received cartons into a labelled storage bin before releasing an order.":
            Sandbox?"Q: TC22 / F: scan / E: carry. Office WMS manages orders and stock.":
            Ledger.OnHand()==0?(CompletedOrders==0?"Open the office WMS. Book PO-1001 for three cartons of packing tape.":"Open Purchase orders in the office WMS. Book the next delivery or create a new purchase order."):
            "Release a sales order in the office WMS, then use Pick on your TC22.";
        public void SetDevice(bool equipped)=>Scanner.SetEquipped(equipped);
        public bool Scan()
        {
            if(!Scanner.Equipped||Walking==null||!Walking.CanControl||Walking.VehicleMode||Time.timeScale<=0)
                return Notice("Return to scanning and aim at a label. Left click scans while you are on foot.",false);
            var result=Scanner.TryScan();
            ScanResult.code=result.code??"";ScanResult.label=result.label??"";ScanResult.sequence++;
            if(!result.success){ScanResult.status="error";return Notice(result.message,false);}
            bool accepted=AcceptScan(result.code);
            ScanResult.status=accepted?"success":"error";Scanner.Feedback(accepted,Message);return accepted;
        }
        // A decoded value reaches this method only through a physical scanner.
        // Exposed to isolated fixtures so wrong-document scans can be tested.
        public bool AcceptScan(string code)
        {
            if(string.IsNullOrEmpty(code))return Notice("No barcode decoded.",false);
            string kind=code.StartsWith("BIN:")?"bin":code.StartsWith("CARTON:")?"carton":code.StartsWith("ITEM:")?"item":"unknown";
            string id=code.Contains(":")?code.Substring(code.IndexOf(':')+1):code;
            var w=Workflow;
            if(w.tile=="home"||w.tile=="lookup")
            {
                ResetWorkflow("lookup");
                if(kind=="bin")
                {var bin=Ledger.FindBin(id);if(bin==null)return Notice("Unknown bin label.",false);Workflow.sourceBin=id;Workflow.title=id+" / "+bin.kind;Workflow.instruction=Ledger.BinUsed(id)+" CTN recorded / "+bin.capacity+" capacity. Open Item lookup for contents.";}
                else if(kind=="carton")
                {var c=Ledger.FindCarton(id);if(c==null)return Notice("Unknown carton label.",false);Workflow.cartonId=id;Workflow.title=id+" / "+Ledger.FindItem(c.itemId).name;Workflow.instruction="1 CTN / "+c.status+" / recorded bin "+(c.binId==""?"not received":c.binId)+" / physical "+PhysicalBin(id);}
                else if(kind=="item")
                {var item=Ledger.FindItem(id);if(item==null)return Notice("Unknown item barcode.",false);Workflow.title=item.name;Workflow.instruction=id+" / "+Ledger.OnHand(id)+" CTN on hand / "+Ledger.Available(id)+" CTN available. "+item.description;}
                else return Notice("This barcode is not a warehouse item, carton or location.",false);
                return Notice("Lookup complete. No stock changed.",true);
            }
            if(w.step=="order")return Notice("Choose a "+(w.tile=="receive"?"purchase":"sales")+" order on the TC22 first.",false);
            if(w.step=="confirm"||w.step=="depart")return Notice("Confirm the current step or cancel the task before scanning another label.",false);
            if(w.step=="source")
            {
                if(kind!="bin")return Notice("Scan a location label first.",false);
                var bin=Ledger.FindBin(id);if(bin==null||!bin.enabled)return Notice("This location is unavailable.",false);
                if(w.tile=="receive"&&bin.kind!=L.BinKind.Receiving)return Notice("Receiving needs a receiving location such as REC-01 or REC-02.",false);
                if(w.tile=="pick"&&(bin.kind!=L.BinKind.Storage||!bin.canPick))return Notice("Scan a pickable storage bin for this order.",false);
                if(w.tile=="ship"&&bin.kind!=L.BinKind.Stage)return Notice("Scan the shipping staging bin first.",false);
                if(w.tile=="transfer"&&bin.kind==L.BinKind.Dispatch&&!Courier.ReadyForLoading)return Notice("Wait for the collection van to open before returning a loaded carton.",false);
                if(w.tile=="pick"&&!Ledger.FindSales(w.orderId).manifest.Any(c=>Ledger.FindCarton(c).binId==id&&Ledger.FindCarton(c).status==L.CartonStatus.Reserved))
                    return Notice("This bin has no unpicked cartons allocated to "+w.orderId+".",false);
                w.sourceBin=id;w.step="carton";w.instruction="Scan the carton label in "+id+". Left click scans.";
                return Notice("Location "+id+" confirmed.",true);
            }
            if(w.step=="carton")
            {
                if(kind!="carton")return Notice("Scan the carton handling label, not its item code or location.",false);
                var carton=Ledger.FindCarton(id);if(carton==null)return Notice("This carton is not on file.",false);
                if(w.tile=="receive")
                {
                    if(carton.status!=L.CartonStatus.Expected)return Notice("This carton has already been received.",false);
                    if(carton.purchaseOrderId!=w.orderId)return Notice("Wrong PO. This carton belongs to "+carton.purchaseOrderId+".",false);
                    if(!IsInBin(id,w.sourceBin,out var receiptReason))return Notice(receiptReason,false);
                    w.cartonId=id;w.destinationBin=w.sourceBin;w.step="confirm";w.instruction="Receive 1 CTN of "+Ledger.FindItem(carton.itemId).name+" into "+w.sourceBin+". Enter confirms.";
                    w.confirmLabel="Receive 1 CTN";return Notice("Carton matched to the PO. Confirm the receipt.",true);
                }
                if(carton.binId!=w.sourceBin)return Notice("Recorded location is "+carton.binId+". Scan that source bin first.",false);
                if(w.tile=="transfer"&&carton.status!=L.CartonStatus.Available&&carton.status!=L.CartonStatus.Picked&&carton.status!=L.CartonStatus.Loaded)
                    return Notice("This carton is reserved. Use the order's Pick task.",false);
                if(w.tile=="transfer"&&carton.status==L.CartonStatus.Loaded&&!Courier.ReadyForLoading)
                    return Notice("The carrier has begun departure. Loaded stock can no longer be returned.",false);
                if(w.tile=="pick"&&(carton.salesOrderId!=w.orderId||carton.status!=L.CartonStatus.Reserved))return Notice("This carton is not an outstanding pick for "+w.orderId+".",false);
                if(w.tile=="ship"&&(carton.salesOrderId!=w.orderId||carton.status!=L.CartonStatus.Picked))return Notice("This carton is not a staged pick for "+w.orderId+".",false);
                // A normal transfer can reconcile an already moved carton, but
                // picking and loading start with stock at its recorded source.
                if(w.tile!="transfer"&&!IsInBin(id,w.sourceBin,out var sourceReason))return Notice(sourceReason,false);
                w.cartonId=id;w.step="destination";w.instruction=w.tile=="pick"?"Carry "+id+" to STAGE-01, then scan that bin.":
                    w.tile=="ship"?"Carry "+id+" into the open van, then scan DISPATCH-01.":"Carry "+id+" to storage, then scan its destination bin.";
                return Notice("Carton verified. Physical movement comes next.",true);
            }
            if(w.step=="destination")
            {
                if(kind!="bin")return Notice("Scan the destination location label.",false);
                var bin=Ledger.FindBin(id);if(bin==null||!bin.enabled)return Notice("Destination is unavailable.",false);
                if(w.tile=="transfer"&&bin.kind!=L.BinKind.Storage)return Notice("Transfers put stock into storage bins.",false);
                if(w.tile=="pick"&&bin.kind!=L.BinKind.Stage)return Notice("A picked carton belongs in shipping staging.",false);
                if(w.tile=="ship"&&(bin.kind!=L.BinKind.Dispatch||!Courier.ReadyForLoading))return Notice("Wait for the collection van to open, then scan DISPATCH-01.",false);
                if(id==w.sourceBin)return Notice("Destination must differ from the source.",false);
                w.destinationBin=id;w.step="confirm";w.confirmLabel=w.tile=="pick"?"Confirm pick":w.tile=="ship"?"Confirm load":"Confirm transfer";
                w.instruction="Set "+w.cartonId+" fully inside "+id+", release it and press Enter to confirm.";
                return Notice("Destination scanned. Place the carton before confirming.",true);
            }
            return Notice("Choose a task first.",false);
        }
        public void ResetWorkflow(string tile)
        {
            if(!new[]{"home","lookup","receive","transfer","pick","ship"}.Contains(tile))tile="home";
            Workflow=new WorkflowState{tile=tile,step=tile=="transfer"?"source":tile=="receive"||tile=="pick"||tile=="ship"?"order":tile,
                title=tile=="receive"?"Receive purchase order":tile=="transfer"?"Transfer stock":tile=="pick"?"Pick sales order":tile=="ship"?"Ship sales order":tile=="lookup"?"Item lookup":"Latchford WMS",
                instruction=tile=="transfer"?"Scan the recorded source bin, then the carton label.":tile=="receive"?"Choose the purchase order printed on your delivery paperwork.":
                    tile=="pick"?"Choose a released sales order. The source bin and carton must match.":tile=="ship"?"Choose a picked sales order to load and confirm its shipment.":tile=="lookup"?"Scan an item, carton or location label with F.":"Choose Receive, Transfer, Pick, Ship or Item lookup."};
            Revision++;Changed?.Invoke();
        }
        public bool ChooseOrder(string tile,string id)
        {
            if(tile=="receive")
            {var po=Ledger.FindPurchase(id);if(po==null||po.status==L.PurchaseStatus.Received||po.status==L.PurchaseStatus.Cancelled)return Notice("Choose an open purchase order.",false);}
            else
            {
                var so=Ledger.FindSales(id);if(so==null||so.status==L.SalesStatus.Open||so.status==L.SalesStatus.Cancelled||so.status==L.SalesStatus.Shipped)
                    return Notice("Release this sales order from the manager console first.",false);
                if(tile=="ship"&&so.status!=L.SalesStatus.Picked&&so.status!=L.SalesStatus.Loading&&so.status!=L.SalesStatus.Loaded)return Notice("Pick every order carton into staging before loading.",false);
                if(tile=="ship"&&!collectionBooked&&!BookCollection(id))return false;
            }
            ResetWorkflow(tile);Workflow.orderId=id;Workflow.step="source";
            Workflow.instruction=tile=="receive"?"Scan the receiving bin holding this delivery.":tile=="pick"?NextPickInstruction(id):"Scan STAGE-01, then the allocated carton.";
            if(tile=="ship"&&Ledger.FindSales(id).status==L.SalesStatus.Loaded)SetDepartureStep();
            return Notice(id+" selected.",true);
        }
        string NextPickInstruction(string id)
        {
            var carton=Ledger.FindSales(id)?.manifest.Select(Ledger.FindCarton).FirstOrDefault(c=>c.status==L.CartonStatus.Reserved);
            return carton==null?"All picks are staged. Use Ship for collection.":"Scan "+carton.binId+", then "+carton.id+" / "+Ledger.FindItem(carton.itemId).name+".";
        }
        public bool ReadyToConfirm(out string reason)
        {
            if(Workflow.step=="depart")
            {
                if(!Ledger.CanShip(Workflow.orderId,out reason))return false;
                return Courier.CanDispatch(out reason,false);
            }
            reason="Complete the required scans first.";
            if(Workflow.step!="confirm")return false;
            return IsInBin(Workflow.cartonId,Workflow.destinationBin,out reason);
        }
        public bool Confirm()
        {
            if(!ReadyToConfirm(out var reason))return Notice(reason,false);
            var w=Workflow;
            if(w.step=="depart")
            {
                dispatchAuthorization=w.orderId;w.step="departing";w.instruction="Shipment confirmed. Stay clear while the courier closes the van. Payment follows departure.";
                return Notice("Shipment authorized. The carrier will recheck physical clearance before leaving.",true);
            }
            bool result;
            if(w.tile=="receive")result=Ledger.Receive(w.orderId,w.cartonId,w.destinationBin);
            else if(w.tile=="pick")result=Ledger.Pick(w.orderId,w.cartonId,w.sourceBin,w.destinationBin);
            else if(w.tile=="ship")result=Ledger.Load(w.orderId,w.cartonId,w.sourceBin,w.destinationBin);
            else
            {
                var carton=Ledger.FindCarton(w.cartonId);
                result=carton.status==L.CartonStatus.Picked||carton.status==L.CartonStatus.Loaded?
                    Ledger.ReturnPick(carton.salesOrderId,w.cartonId,w.sourceBin,w.destinationBin):Ledger.Transfer(w.cartonId,w.sourceBin,w.destinationBin);
            }
            if(!result)return Notice(Ledger.LastMessage,false);
            string confirmation=Ledger.LastMessage,order=w.orderId,tile=w.tile,source=w.sourceBin;
            mismatchSince.Remove(w.cartonId);visibleMismatches.Remove(w.cartonId);physicalBins[w.cartonId]=w.destinationBin;
            // A corrected pick invalidates any earlier authorization. The
            // player must confirm the newly complete manifest again.
            if(tile=="transfer"&&Ledger.FindCarton(w.cartonId).salesOrderId==collectionOrder)dispatchAuthorization="";
            if(tile=="receive")
            {
                var po=Ledger.FindPurchase(order);ResetWorkflow(tile);Workflow.orderId=order;
                Workflow.sourceBin=source;Workflow.step=po.status==L.PurchaseStatus.Received?"complete":"carton";
                Workflow.instruction=po.status==L.PurchaseStatus.Received?"PO received. Use Transfer to put these cartons into storage.":"Scan the next carton for "+order+" in "+source+".";
            }
            else if(tile=="pick")
            {
                ResetWorkflow(tile);Workflow.orderId=order;Workflow.step="source";Workflow.instruction=NextPickInstruction(order);
                if(Ledger.FindSales(order).status==L.SalesStatus.Picked)
                {
                    bool booked=BookCollection(order);Workflow.step="complete";
                    Workflow.instruction=booked?"Picks complete. Collection booked. Choose Ship when the van opens.":
                        "Picks complete. The carrier is finishing another visit. Choose Ship when the carrier is available.";
                }
            }
            else if(tile=="ship")
            {
                ResetWorkflow(tile);Workflow.orderId=order;
                if(Ledger.FindSales(order).status==L.SalesStatus.Loaded)SetDepartureStep();
                else {Workflow.step="source";Workflow.instruction="Scan the staging bin for the next carton.";}
            }
            else ResetWorkflow("transfer");
            return Notice(confirmation,true);
        }
        void SetDepartureStep()
        {Workflow.step="depart";Workflow.confirmLabel="Confirm shipment";Workflow.instruction="All cartons loaded. Step clear of the van and ramp, then press Enter to confirm shipment.";}
        bool BookCollection(string id)
        {
            if(collectionBooked)return collectionOrder==id;
            if(Courier.Busy)return Notice("The carrier is finishing another visit. Choose Ship again when available.",false);
            var order=Ledger.FindSales(id);if(order==null||order.status!=L.SalesStatus.Picked)return Notice("Pick the complete order before booking collection.",false);
            if(!Courier.BeginCollection(order.manifest.Select(c=>bodies[c]).ToArray(),()=>CompleteShipment(id),()=>grabber!=null&&grabber.IsHolding))
                return Notice("Collection unavailable. Your staged stock remains reserved.",false);
            collectionOrder=id;collectionBooked=true;return true;
        }
        public bool Command(string action,string id)
        {
            switch(action)
            {
                case "workflow":ResetWorkflow(id);return true;
                case "receive-order":return ChooseOrder("receive",id);
                case "pick-order":return ChooseOrder("pick",id);
                case "ship-order":return ChooseOrder("ship",id);
                case "confirm":return Confirm();
                case "cancel":ResetWorkflow("home");return Notice("Task cleared. Posted stock transactions are unchanged.",true);
                case "scan":return Scan();
                case "release-order":return ReleaseOrder(id);
                case "cancel-order":return CancelOrder(id);
                case "book-po":return Book(id);
                case "create-po":return CreatePurchase(id);
                case "create-so":return CreateSales(id);
                default:return Notice("Unknown warehouse command.",false);
            }
        }
    }
}
