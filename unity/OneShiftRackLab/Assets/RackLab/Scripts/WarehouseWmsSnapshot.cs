using System;
using System.Linq;
using UnityEngine;
using L = OneShift.RackLab.WarehouseWmsLedger;

namespace OneShift.RackLab
{
    public sealed partial class WarehouseWmsRuntime
    {
        [Serializable] public sealed class Snapshot
        {
            public int revision,cash,completedOrders;
            public string mode,facility,message,severity;
            public bool equipped;
            public ScanState scan;
            public WorkflowState workflow;
            public ItemRow[] items;
            public BinRow[] bins;
            public CartonRow[] cartons;
            public OrderRow[] purchaseOrders,salesOrders;
            public TransactionRow[] transactions;
            public TaskRow[] tasks;
            public ExceptionRow[] exceptions;
            public DemonstrationState demo;
        }
        [Serializable] public sealed class ItemRow
        {public string id,sku,name,description,uom;public int unitsPerCarton,onHand,available,reserved,picked,inReceiving;}
        [Serializable] public sealed class BinRow
        {public string id,name,kind;public int capacity,onHand,available;public bool canPick;}
        [Serializable] public sealed class CartonRow
        {public string id,sku,itemName,binId,physicalBin,status,poId,soId,uom="CTN";public int quantity=1;}
        [Serializable] public sealed class OrderRow
        {
            public string id,partner,status,reference,actionReason;
            public bool canBook,canReceive,canRelease,canPick,canShip,canCancel;
            public int amount;
            public LineRow[] lines;
        }
        [Serializable] public sealed class LineRow
        {public string sku,itemName;public int ordered,received,allocated,picked,loaded,shipped;}
        [Serializable] public sealed class TransactionRow
        {public string id,time,type,sku,cartonId,fromBin,toBin,document;public int quantity;}
        [Serializable] public sealed class TaskRow
        {public string id,type,orderId,sku,sourceBin,destinationBin,status;public int quantity;}
        [Serializable] public sealed class ExceptionRow
        {public string id,title,detail;}

        public Snapshot Capture()
        {
            Workflow.canConfirm=ReadyToConfirm(out var confirmationReason);
            if(Workflow.step=="depart")Workflow.instruction=Workflow.canConfirm?
                "All cartons loaded and the van is clear. Press Enter to confirm shipment.":"Before departure: "+confirmationReason+".";
            var po=Ledger.FindPurchase(Workflow.orderId);var so=Ledger.FindSales(Workflow.orderId);
            Workflow.total=po!=null?po.lines.Sum(l=>l.ordered):so!=null?so.lines.Sum(l=>l.ordered):0;
            Workflow.completed=po!=null?po.lines.Sum(l=>l.received):so!=null?so.lines.Sum(l=>Workflow.tile=="ship"?l.loaded:l.picked):0;
            return new Snapshot{
                revision=Revision+Ledger.Revision,mode=DemonstrationActive?"demo":Sandbox?"sandbox":"career",facility="Latchford Distribution / WH-01",cash=Cash,completedOrders=CompletedOrders,
                demo=CaptureDemonstration(),
                message=Message,severity=Severity,equipped=Scanner.Equipped,scan=ScanResult,workflow=Workflow,
                items=Ledger.Items.Select(i=>new ItemRow{id=i.id,sku=i.id,name=i.name,description=i.description,uom=i.uom,unitsPerCarton=i.unitsPerCarton,
                    onHand=Ledger.OnHand(i.id),available=Ledger.Available(i.id),reserved=Ledger.Reserved(i.id),picked=Ledger.Picked(i.id),inReceiving=Ledger.InReceiving(i.id)}).ToArray(),
                bins=Ledger.Bins.Where(b=>b.enabled).Select(b=>new BinRow{id=b.id,name=b.name,kind=b.kind.ToString(),capacity=b.capacity,
                    onHand=Ledger.BinUsed(b.id),available=Ledger.Available(null,b.id),canPick=b.canPick}).ToArray(),
                cartons=Ledger.Cartons.Where(c=>c.status!=L.CartonStatus.Shipped).Select(c=>new CartonRow{id=c.id,sku=c.itemId,itemName=Ledger.FindItem(c.itemId).name,
                    binId=c.binId,physicalBin=physicalBins.TryGetValue(c.id,out var physical)?physical:"",status=c.status.ToString(),poId=c.purchaseOrderId,soId=c.salesOrderId}).ToArray(),
                purchaseOrders=Ledger.PurchaseOrders.Select(p=>
                {bool canBook=CanBook(p.id,out var reason);return new OrderRow{id=p.id,partner=p.supplier,status=p.status.ToString(),reference="Supplier delivery / front receiving",
                    canBook=canBook,canReceive=p.status!=L.PurchaseStatus.Received&&p.status!=L.PurchaseStatus.Cancelled&&Ledger.Cartons.Any(c=>c.purchaseOrderId==p.id&&c.status==L.CartonStatus.Expected),
                    actionReason=reason,amount=p.lines.Sum(l=>l.ordered*Cost(l.itemId)),lines=Lines(p.lines.ToArray())};}).ToArray(),
                salesOrders=Ledger.SalesOrders.Select(s=>
                {bool release=CanRelease(s.id,out var reason);bool loaded=Ledger.CanShip(s.id,out _);return new OrderRow{id=s.id,partner=s.customer,status=s.status.ToString(),reference="Local trade customer / parcel collection",
                    canRelease=release,canPick=s.manifest.Any(id=>Ledger.FindCarton(id).status==L.CartonStatus.Reserved),canShip=s.status==L.SalesStatus.Picked||s.status==L.SalesStatus.Loading||loaded,
                    canCancel=!DemonstrationActive&&!(collectionBooked&&collectionOrder==s.id)&&(s.status==L.SalesStatus.Open||s.status==L.SalesStatus.Released),actionReason=release?"Reserve FIFO cartons and create pick work.":
                        s.status==L.SalesStatus.Shipped?"Shipment departed. Payment posted.":s.status!=L.SalesStatus.Open?"Use the TC22 to complete physical pick and ship work.":reason,
                    amount=s.lines.Sum(l=>l.ordered*Price(l.itemId)),lines=Lines(s.lines.ToArray())};}).ToArray(),
                transactions=Ledger.Transactions.Reverse().Take(300).Select(t=>new TransactionRow{id="TX-"+t.sequence.ToString("00000"),time="Event "+t.sequence,type=t.type,
                    sku=t.itemId,cartonId=t.cartonId,quantity=t.quantity,fromBin=t.fromBin,toBin=t.toBin,document=t.orderId}).ToArray(),
                tasks=Ledger.Cartons.Where(c=>c.status!=L.CartonStatus.Shipped&&(c.status!=L.CartonStatus.Available||Ledger.FindBin(c.binId)?.kind==L.BinKind.Receiving)).Select(c=>new TaskRow{
                    id="TASK-"+c.id,type=c.status==L.CartonStatus.Expected?"Receive":c.status==L.CartonStatus.Available?"Putaway":c.status==L.CartonStatus.Reserved?"Pick":c.status==L.CartonStatus.Picked?"Load":"Ship",
                    orderId=c.status==L.CartonStatus.Expected?c.purchaseOrderId:c.salesOrderId,sku=c.itemId,sourceBin=c.binId,destinationBin=c.status==L.CartonStatus.Expected?
                        (physicalBins.TryGetValue(c.id,out var expectedBin)&&!string.IsNullOrEmpty(expectedBin)?expectedBin:"REC-01"):
                        c.status==L.CartonStatus.Available?"Storage":c.status==L.CartonStatus.Reserved?"STAGE-01":"DISPATCH-01",quantity=1,status=c.status.ToString()}).ToArray(),
                exceptions=visibleMismatches.Select(id=>{var c=Ledger.FindCarton(id);string actual=physicalBins.TryGetValue(id,out var bin)?bin:"";
                    string detail=actual==""?"not settled in a registered bin":"physically in "+actual;
                    return new ExceptionRow{id=id,title="Location mismatch / "+id,
                    detail="Recorded "+c.binId+"; "+detail+(c.status==L.CartonStatus.Reserved?
                        ". Return the allocated carton to its recorded bin, then continue its Pick task.":". Locate the carton and use Transfer to record its placement.")};}).ToArray()
            };
        }
        LineRow[] Lines(L.OrderLine[] lines)=>lines.Select(l=>new LineRow{sku=l.itemId,itemName=Ledger.FindItem(l.itemId).name,ordered=l.ordered,received=l.received,
            allocated=l.reserved,picked=l.picked,loaded=l.loaded,shipped=l.shipped}).ToArray();
    }
}
