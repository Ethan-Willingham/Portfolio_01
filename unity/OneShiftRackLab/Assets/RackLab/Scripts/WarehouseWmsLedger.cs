using System;
using System.Collections.Generic;
using System.Linq;

namespace OneShift.RackLab
{
    // The authoritative carton ledger. Callers validate the scan and physical
    // placement before committing a transaction here. This class never moves
    // a body, grants cash, advances time or talks to an external system.
    public sealed class WarehouseWmsLedger
    {
        public enum BinKind { Receiving, Storage, Stage, Dispatch }
        public enum CartonStatus { Expected, Available, Reserved, Picked, Loaded, Shipped }
        public enum PurchaseStatus { Open, PartReceived, Received, Cancelled }
        public enum SalesStatus { Open, Released, Picking, Picked, Loading, Loaded, Shipped, Cancelled }

        [Serializable] public sealed class Item
        {
            public string id, name, description, supplier, uom = "CTN";
            public int unitsPerCarton;
            public Item() { }
            public Item(string id, string name, int unitsPerCarton, string description = "", string supplier = "")
            { this.id=id; this.name=name; this.unitsPerCarton=unitsPerCarton; this.description=description; this.supplier=supplier; }
        }
        [Serializable] public sealed class Bin
        {
            public string id, name;
            public BinKind kind;
            public int capacity;
            public bool canPick, enabled = true;
            public Bin() { }
            public Bin(string id, string name, BinKind kind, int capacity, bool canPick = true)
            { this.id=id; this.name=name; this.kind=kind; this.capacity=capacity; this.canPick=kind==BinKind.Storage && canPick; }
        }
        [Serializable] public sealed class Carton
        {
            public string id, itemId, purchaseOrderId = "", binId = "", salesOrderId = "";
            public int sequence;
            public CartonStatus status;
        }
        [Serializable] public sealed class OrderLine
        {
            public string id, itemId;
            public int ordered, received, reserved, picked, loaded, shipped;
            public OrderLine() { }
            public OrderLine(string itemId, int quantity) { this.itemId=itemId; ordered=quantity; }
        }
        [Serializable] public sealed class PurchaseOrder
        {
            public string id, supplier;
            public PurchaseStatus status;
            public List<OrderLine> lines = new List<OrderLine>();
        }
        [Serializable] public sealed class SalesOrder
        {
            public string id, customer;
            public SalesStatus status;
            public List<OrderLine> lines = new List<OrderLine>();
            public List<string> manifest = new List<string>();
        }
        [Serializable] public sealed class Transaction
        {
            public int sequence, quantity;
            public string type, cartonId, itemId, orderId, fromBin, toBin, description;
        }

        readonly List<Item> items = new List<Item>();
        readonly List<Bin> bins = new List<Bin>();
        readonly List<Carton> cartons = new List<Carton>();
        readonly List<PurchaseOrder> purchases = new List<PurchaseOrder>();
        readonly List<SalesOrder> sales = new List<SalesOrder>();
        readonly List<Transaction> transactions = new List<Transaction>();
        readonly HashSet<string> opening = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        int nextCarton = 1, nextTransaction = 1;

        public IReadOnlyList<Item> Items => items;
        public IReadOnlyList<Bin> Bins => bins;
        public IReadOnlyList<Carton> Cartons => cartons;
        public IReadOnlyList<PurchaseOrder> PurchaseOrders => purchases;
        public IReadOnlyList<SalesOrder> SalesOrders => sales;
        public IReadOnlyList<Transaction> Transactions => transactions;
        public string LastMessage { get; private set; } = "Ready to scan.";
        public string LastCode { get; private set; } = "ready";
        public int Revision { get; private set; }

        public Item FindItem(string id) => items.Find(value=>Same(value.id,id));
        public Bin FindBin(string id) => bins.Find(value=>Same(value.id,id));
        public Carton FindCarton(string id) => cartons.Find(value=>Same(value.id,id));
        public PurchaseOrder FindPurchase(string id) => purchases.Find(value=>Same(value.id,id));
        public SalesOrder FindSales(string id) => sales.Find(value=>Same(value.id,id));

        public bool AddItem(Item definition)
        {
            if(definition==null || !ValidId(definition.id) || string.IsNullOrWhiteSpace(definition.name) ||
                definition.unitsPerCarton<1 || definition.unitsPerCarton>100000 || definition.uom!="CTN")
                return Reject("invalid-item","An item needs a stock code, description and positive units per carton. The stock unit is CTN.");
            if(FindItem(definition.id)!=null)return Reject("duplicate-item","That stock code already exists.");
            items.Add(new Item(definition.id.Trim(),definition.name.Trim(),definition.unitsPerCarton,definition.description??"",definition.supplier??""));
            return Success("Item added.");
        }

        public bool AddBin(Bin definition)
        {
            if(definition==null || !ValidId(definition.id) || definition.capacity<1 || definition.capacity>100000 || !Enum.IsDefined(typeof(BinKind),definition.kind))
                return Reject("invalid-bin","A location needs a bin code, a type and a positive carton capacity.");
            if(FindBin(definition.id)!=null)return Reject("duplicate-bin","That bin already exists.");
            bins.Add(new Bin(definition.id.Trim(),definition.name??definition.id,definition.kind,definition.capacity,definition.canPick){enabled=definition.enabled});
            return Success("Bin added.");
        }

        public bool AddPurchaseOrder(string id,string supplier,IEnumerable<OrderLine> lines)
        {
            if(!ValidId(id) || string.IsNullOrWhiteSpace(supplier))return Reject("invalid-order","A purchase order needs a number and supplier.");
            if(FindPurchase(id)!=null)return Reject("duplicate-order","That purchase order already exists.");
            if(!CopyLines(id,lines,out var copied))return false;
            purchases.Add(new PurchaseOrder{id=id.Trim(),supplier=supplier.Trim(),lines=copied,status=PurchaseStatus.Open});
            Record("PO_OPEN",null,id,"","",0,"Purchase order opened for "+supplier.Trim()+".");
            return Success("Purchase order "+id+" is open.");
        }

        public bool SetBinEnabled(string binId,bool enabled)
        {
            var bin=FindBin(binId);
            if(bin==null)return Reject("unknown-bin","Select a registered bin.");
            if(bin.enabled==enabled)return Reject("unchanged-bin",enabled?"This bin is already open.":"This bin is already closed.");
            if(!enabled && BinUsed(bin.id)>0)return Reject("occupied-bin","Move the stock out before closing this bin.");
            bin.enabled=enabled;
            Record(enabled?"BIN_OPEN":"BIN_CLOSE",null,"",bin.id,bin.id,0,enabled?"Bin opened for warehouse work.":"Empty bin closed.");
            return Success(bin.id+(enabled?" is open.":" is closed."));
        }

        public bool AddSalesOrder(string id,string customer,IEnumerable<OrderLine> lines)
        {
            if(!ValidId(id) || string.IsNullOrWhiteSpace(customer))return Reject("invalid-order","A sales order needs a number and customer.");
            if(FindSales(id)!=null)return Reject("duplicate-order","That sales order already exists.");
            if(!CopyLines(id,lines,out var copied))return false;
            sales.Add(new SalesOrder{id=id.Trim(),customer=customer.Trim(),lines=copied,status=SalesStatus.Open});
            Record("SO_OPEN",null,id,"","",0,"Sales order opened for "+customer.Trim()+".");
            return Success("Sales order "+id+" is open.");
        }

        // An expected handling unit is not on-hand stock. The order can arrive
        // in smaller deliveries, and each physical box is received once.
        public bool ExpectCarton(string id,string itemId,string purchaseOrderId)
        {
            if(!NewCarton(id,itemId,out var item))return false;
            var order=FindPurchase(purchaseOrderId);
            if(order==null)return Reject("unknown-po","Select an existing purchase order.");
            if(order.status==PurchaseStatus.Cancelled || order.status==PurchaseStatus.Received)return Reject("closed-po","This purchase order has no open receipt.");
            var line=order.lines.Find(value=>Same(value.itemId,item.id));
            if(line==null)return Reject("wrong-item","This item is not on the purchase order.");
            int alreadyExpected=cartons.Count(value=>Same(value.purchaseOrderId,order.id) && Same(value.itemId,item.id));
            if(alreadyExpected>=line.ordered)return Reject("over-receipt","The order already has a carton for every ordered unit.");
            var carton=new Carton{id=id.Trim(),itemId=item.id,purchaseOrderId=order.id,status=CartonStatus.Expected,sequence=nextCarton++};
            cartons.Add(carton);
            Record("EXPECTED",carton,order.id,"","",1,"One carton expected against "+order.id+".");
            return Success("Carton "+carton.id+" is expected, not received.");
        }

        public bool SeedCarton(string id,string itemId,string binId)
        {
            if(!NewCarton(id,itemId,out var item))return false;
            if(!Destination(binId,out var bin))return false;
            if(bin.kind!=BinKind.Storage && bin.kind!=BinKind.Receiving)return Reject("wrong-destination","Opening stock belongs in a storage or receiving bin.");
            var carton=new Carton{id=id.Trim(),itemId=item.id,binId=bin.id,status=CartonStatus.Available,sequence=nextCarton++};
            cartons.Add(carton);opening.Add(carton.id);
            Record("OPENING",carton,"","",bin.id,1,"Opening stock.");
            return Success("Opening carton recorded in "+bin.id+".");
        }

        public bool Receive(string purchaseOrderId,string cartonId,string receivingBinId)
        {
            var order=FindPurchase(purchaseOrderId);var carton=FindCarton(cartonId);
            if(order==null)return Reject("unknown-po","Select an existing purchase order.");
            if(carton==null)return Reject("unknown-carton","This carton label is not on an inbound delivery.");
            if(!Same(carton.purchaseOrderId,order.id))return Reject("wrong-po","This carton belongs to a different purchase order.");
            if(carton.status!=CartonStatus.Expected)return Reject("already-received","This carton has already been received. Use Transfer to move it.");
            if(order.status==PurchaseStatus.Cancelled || order.status==PurchaseStatus.Received)return Reject("closed-po","This purchase order is closed to receiving.");
            var line=order.lines.Find(value=>Same(value.itemId,carton.itemId));
            if(line==null)return Reject("wrong-item","The carton item is not on this purchase order.");
            if(line.received>=line.ordered)return Reject("over-receipt","Receiving this carton would exceed the ordered quantity.");
            if(!Destination(receivingBinId,out var bin))return false;
            if(bin.kind!=BinKind.Receiving)return Reject("wrong-destination","Scan a receiving bin before receiving stock.");
            carton.binId=bin.id;carton.status=CartonStatus.Available;line.received++;
            order.status=order.lines.All(value=>value.received==value.ordered)?PurchaseStatus.Received:PurchaseStatus.PartReceived;
            Record("RECEIVE",carton,order.id,"",bin.id,1,"Received one carton against "+order.id+".");
            return Success("Received "+carton.id+" into "+bin.id+". Transfer it to storage.");
        }

        public bool Transfer(string cartonId,string sourceBinId,string destinationBinId)
        {
            var carton=FindCarton(cartonId);
            if(carton==null)return Reject("unknown-carton","Scan a known carton label.");
            if(carton.status!=CartonStatus.Available)return Reject("reserved-stock","Only unallocated, received stock can be transferred. Use the assigned pick or return workflow for an allocated carton.");
            if(!Source(carton,sourceBinId))return false;
            if(Same(sourceBinId,destinationBinId))return Reject("same-bin","Source and destination must be different bins.");
            if(!Destination(destinationBinId,out var destination))return false;
            if(destination.kind!=BinKind.Storage && destination.kind!=BinKind.Receiving)return Reject("wrong-destination","Transfer stock to a storage or receiving bin. Customer staging uses Pick.");
            string from=carton.binId;carton.binId=destination.id;
            Record("TRANSFER",carton,"",from,destination.id,1,"Transferred one carton.");
            return Success("Transferred "+carton.id+" to "+destination.id+".");
        }

        public bool CanReleaseSalesOrder(string orderId,out string reason)
        {
            var order=FindSales(orderId);
            if(order==null){reason="Select an existing sales order.";return false;}
            if(order.status!=SalesStatus.Open){reason="Only an open sales order can be released.";return false;}
            foreach(var line in order.lines)
            {
                int available=Available(line.itemId);
                if(available<line.ordered){reason="Stock short: "+FindItem(line.itemId).name+" needs "+line.ordered+" CTN; "+available+" is available in pickable bins.";return false;}
            }
            reason="All lines are available. Release to reserve their oldest cartons.";return true;
        }

        public bool ReleaseSalesOrder(string orderId)
        {
            if(!CanReleaseSalesOrder(orderId,out var reason))return Reject("release-unavailable",reason);
            var order=FindSales(orderId);
            // Build the entire manifest before reserving anything. A shortage
            // on a later line must never leave the first line allocated.
            var selected=new List<Carton>();
            foreach(var line in order.lines)
                selected.AddRange(cartons.Where(value=>Same(value.itemId,line.itemId) && IsPickAvailable(value)).OrderBy(value=>value.sequence).Take(line.ordered));
            foreach(var carton in selected)
            {
                carton.status=CartonStatus.Reserved;carton.salesOrderId=order.id;order.manifest.Add(carton.id);
                Record("ALLOCATE",carton,order.id,carton.binId,carton.binId,1,"Reserved for "+order.id+".");
            }
            RefreshSales(order);
            return Success("Released "+order.id+". "+selected.Count+" cartons reserved for picking.");
        }

        public bool CancelSalesOrder(string orderId)
        {
            var order=FindSales(orderId);
            if(order==null)return Reject("unknown-so","Select an existing sales order.");
            if(order.status==SalesStatus.Cancelled || order.status==SalesStatus.Shipped)return Reject("closed-so","This sales order is already closed.");
            var manifest=order.manifest.Select(FindCarton).ToArray();
            if(manifest.Any(value=>value==null || value.status==CartonStatus.Picked || value.status==CartonStatus.Loaded || value.status==CartonStatus.Shipped))
                return Reject("return-first","Return picked or loaded cartons to storage before cancelling this sales order.");
            foreach(var carton in manifest)
            {
                carton.status=CartonStatus.Available;carton.salesOrderId="";
                Record("UNALLOCATE",carton,order.id,carton.binId,carton.binId,1,"Reservation released by cancellation.");
            }
            order.manifest.Clear();foreach(var line in order.lines){line.reserved=0;line.picked=0;line.loaded=0;line.shipped=0;}
            order.status=SalesStatus.Cancelled;
            Record("SO_CANCEL",null,order.id,"","",0,"Sales order cancelled.");
            return Success("Cancelled "+order.id+". Unpicked reservations are available again.");
        }

        public bool Pick(string orderId,string cartonId,string sourceBinId,string stageBinId)
        {
            if(!Assigned(orderId,cartonId,out var order,out var carton))return false;
            if(carton.status!=CartonStatus.Reserved)return Reject("wrong-state","This carton is not waiting to be picked.");
            if(!Source(carton,sourceBinId))return false;
            var source=FindBin(sourceBinId);
            if(source.kind!=BinKind.Storage || !source.canPick)return Reject("wrong-source","The allocated source is not a pickable storage bin.");
            if(!Destination(stageBinId,out var stage))return false;
            if(stage.kind!=BinKind.Stage)return Reject("wrong-destination","Scan the outbound staging bin for this pick.");
            string from=carton.binId;carton.binId=stage.id;carton.status=CartonStatus.Picked;
            RefreshSales(order);Record("PICK",carton,order.id,from,stage.id,1,"Picked one allocated carton into outbound staging.");
            return Success("Picked "+carton.id+" to "+stage.id+" for "+order.id+".");
        }

        public bool Load(string orderId,string cartonId,string stageBinId,string dispatchBinId)
        {
            if(!Assigned(orderId,cartonId,out var order,out var carton))return false;
            if(carton.status!=CartonStatus.Picked)return Reject("wrong-state","Only a picked carton can be loaded for shipment.");
            if(!Source(carton,stageBinId))return false;
            if(FindBin(stageBinId).kind!=BinKind.Stage)return Reject("wrong-source","Scan the carton's outbound staging bin.");
            if(!Destination(dispatchBinId,out var destination))return false;
            if(destination.kind!=BinKind.Dispatch)return Reject("wrong-destination","Scan the collection vehicle's dispatch bin.");
            string from=carton.binId;carton.binId=destination.id;carton.status=CartonStatus.Loaded;
            RefreshSales(order);Record("LOAD",carton,order.id,from,destination.id,1,"Loaded one carton. Shipment still awaits departure.");
            return Success("Loaded "+carton.id+" for "+order.id+". Stock remains on hand until departure.");
        }

        public bool ReturnPick(string orderId,string cartonId,string sourceBinId,string storageBinId)
        {
            if(!Assigned(orderId,cartonId,out var order,out var carton))return false;
            if(carton.status!=CartonStatus.Picked && carton.status!=CartonStatus.Loaded)return Reject("wrong-state","Only picked or loaded cartons need a pick return.");
            if(!Source(carton,sourceBinId))return false;
            if(!Destination(storageBinId,out var destination))return false;
            if(destination.kind!=BinKind.Storage || !destination.canPick)return Reject("wrong-destination","Return the carton to a pickable storage bin.");
            string from=carton.binId;carton.binId=destination.id;carton.status=CartonStatus.Reserved;
            RefreshSales(order);Record("PICK_RETURN",carton,order.id,from,destination.id,1,"Returned to storage; reservation retained until cancellation or a new pick.");
            return Success("Returned "+carton.id+" to "+destination.id+". It remains reserved for "+order.id+".");
        }

        public bool CanShip(string orderId,out string reason)
        {
            var order=FindSales(orderId);
            if(order==null){reason="Select an existing sales order.";return false;}
            if(order.status==SalesStatus.Shipped || order.status==SalesStatus.Cancelled){reason="This sales order is already closed.";return false;}
            if(order.manifest.Count!=order.lines.Sum(value=>value.ordered)){reason="Release and pick the complete order before shipping.";return false;}
            string dispatch="";
            foreach(string id in order.manifest)
            {
                var carton=FindCarton(id);
                if(carton==null || carton.status!=CartonStatus.Loaded || !Same(carton.salesOrderId,order.id))
                {reason="Every allocated carton must be scanned into the collection vehicle.";return false;}
                var bin=FindBin(carton.binId);
                if(bin==null || !bin.enabled || bin.kind!=BinKind.Dispatch){reason="A loaded carton is not in an active dispatch bin.";return false;}
                if(dispatch.Length==0)dispatch=bin.id;
                else if(!Same(dispatch,bin.id)){reason="The complete shipment must be loaded into one collection vehicle.";return false;}
            }
            reason="Complete manifest loaded. Confirm physical clearance and departure.";return true;
        }

        // Commit only from the physical carrier's offsite completion callback.
        // Loading and approving departure do not remove stock from the ledger.
        public bool Ship(string orderId)
        {
            if(!CanShip(orderId,out var reason))return Reject("shipment-not-ready",reason);
            var order=FindSales(orderId);
            foreach(string id in order.manifest)
            {
                var carton=FindCarton(id);string from=carton.binId;
                carton.status=CartonStatus.Shipped;carton.binId="";
                Record("SHIP",carton,order.id,from,"OFFSITE",1,"Carrier departed with the allocated carton.");
            }
            RefreshSales(order);
            return Success("Shipped "+order.id+". "+order.manifest.Count+" cartons left the warehouse.");
        }

        public bool CancelPurchaseOrder(string orderId)
        {
            var order=FindPurchase(orderId);
            if(order==null)return Reject("unknown-po","Select an existing purchase order.");
            if(order.status!=PurchaseStatus.Open || cartons.Any(value=>Same(value.purchaseOrderId,order.id)))
                return Reject("po-in-progress","Only a purchase order with no expected or received cartons can be cancelled.");
            order.status=PurchaseStatus.Cancelled;Record("PO_CANCEL",null,order.id,"","",0,"Purchase order cancelled before delivery.");
            return Success("Cancelled "+order.id+".");
        }

        public int OnHand(string itemId=null,string binId=null) => Count(itemId,binId,IsOnHand);
        public int Available(string itemId=null,string binId=null) => Count(itemId,binId,IsPickAvailable);
        public int Reserved(string itemId=null,string binId=null) => Count(itemId,binId,value=>value.status==CartonStatus.Reserved || value.status==CartonStatus.Picked || value.status==CartonStatus.Loaded);
        public int Picked(string itemId=null,string binId=null) => Count(itemId,binId,value=>value.status==CartonStatus.Picked || value.status==CartonStatus.Loaded);
        public int Loaded(string itemId=null,string binId=null) => Count(itemId,binId,value=>value.status==CartonStatus.Loaded);
        public int Expected(string itemId=null,string binId=null) => Count(itemId,binId,value=>value.status==CartonStatus.Expected);
        public int InReceiving(string itemId=null) => Count(itemId,null,value=>IsOnHand(value) && FindBin(value.binId)?.kind==BinKind.Receiving);
        public int BinUsed(string binId) => Count(null,binId,IsOnHand);
        public IEnumerable<Carton> StockInBin(string binId) => cartons.Where(value=>Same(value.binId,binId) && IsOnHand(value));

        public bool CheckInvariants(out string reason)
        {
            reason="Stock, order allocations and bin capacities reconcile.";
            if(items.Select(value=>value.id.ToUpperInvariant()).Distinct().Count()!=items.Count || bins.Select(value=>value.id.ToUpperInvariant()).Distinct().Count()!=bins.Count ||
                cartons.Select(value=>value.id.ToUpperInvariant()).Distinct().Count()!=cartons.Count)
                return Invalid(out reason,"Duplicate item, bin or carton identity.");
            foreach(var bin in bins)if(BinUsed(bin.id)>bin.capacity)return Invalid(out reason,"Bin exceeds carton capacity: "+bin.id);
            foreach(var carton in cartons)
            {
                if(FindItem(carton.itemId)==null)return Invalid(out reason,"Carton references an unknown item: "+carton.id);
                if(IsOnHand(carton) && FindBin(carton.binId)==null)return Invalid(out reason,"On-hand carton has no bin: "+carton.id);
                if((carton.status==CartonStatus.Expected || carton.status==CartonStatus.Shipped) && carton.binId.Length>0)
                    return Invalid(out reason,"Offsite stock occupies a warehouse bin: "+carton.id);
                if(carton.status==CartonStatus.Expected && FindPurchase(carton.purchaseOrderId)==null)return Invalid(out reason,"Expected carton has no purchase order: "+carton.id);
                bool allocated=carton.status==CartonStatus.Reserved || carton.status==CartonStatus.Picked || carton.status==CartonStatus.Loaded || carton.status==CartonStatus.Shipped;
                var salesOrder=FindSales(carton.salesOrderId);
                if(allocated && (salesOrder==null || !salesOrder.manifest.Any(id=>Same(id,carton.id))))return Invalid(out reason,"Allocated carton has no matching manifest: "+carton.id);
                if(!allocated && carton.salesOrderId.Length>0)return Invalid(out reason,"Unallocated carton retains a sales order: "+carton.id);
                if(carton.status==CartonStatus.Picked && FindBin(carton.binId).kind!=BinKind.Stage)return Invalid(out reason,"Picked carton is outside staging: "+carton.id);
                if(carton.status==CartonStatus.Loaded && FindBin(carton.binId).kind!=BinKind.Dispatch)return Invalid(out reason,"Loaded carton is outside dispatch: "+carton.id);
            }
            foreach(var item in items)
            {
                int initial=cartons.Count(value=>opening.Contains(value.id) && Same(value.itemId,item.id));
                int receipts=transactions.Where(value=>value.type=="RECEIVE" && Same(value.itemId,item.id)).Sum(value=>value.quantity);
                int shipped=cartons.Count(value=>Same(value.itemId,item.id) && value.status==CartonStatus.Shipped);
                if(initial+receipts!=OnHand(item.id)+shipped)return Invalid(out reason,"Opening plus received does not equal on hand plus shipped for "+item.id);
            }
            foreach(var order in purchases)foreach(var line in order.lines)
            {
                var units=cartons.Where(value=>Same(value.purchaseOrderId,order.id) && Same(value.itemId,line.itemId)).ToArray();
                if(line.received<0 || line.received>line.ordered || units.Length>line.ordered || units.Count(value=>value.status!=CartonStatus.Expected)!=line.received)
                    return Invalid(out reason,"Purchase-order receipt quantity does not reconcile: "+order.id+" / "+line.itemId);
            }
            foreach(var order in sales)
            {
                if(order.manifest.Distinct(StringComparer.OrdinalIgnoreCase).Count()!=order.manifest.Count)return Invalid(out reason,"Duplicate manifest identity: "+order.id);
                var units=order.manifest.Select(FindCarton).ToArray();
                if(units.Any(value=>value==null || !Same(value.salesOrderId,order.id)))return Invalid(out reason,"Manifest carton assigned elsewhere: "+order.id);
                foreach(var line in order.lines)
                {
                    var matching=units.Where(value=>Same(value.itemId,line.itemId)).ToArray();
                    int reserved=matching.Count(value=>value.status!=CartonStatus.Shipped);
                    int picked=matching.Count(value=>value.status==CartonStatus.Picked || value.status==CartonStatus.Loaded || value.status==CartonStatus.Shipped);
                    int loaded=matching.Count(value=>value.status==CartonStatus.Loaded || value.status==CartonStatus.Shipped);
                    int shipped=matching.Count(value=>value.status==CartonStatus.Shipped);
                    if(matching.Length>line.ordered || line.reserved!=reserved || line.picked!=picked || line.loaded!=loaded || line.shipped!=shipped)
                        return Invalid(out reason,"Sales-order progress does not reconcile: "+order.id+" / "+line.itemId);
                }
            }
            return true;
        }

        bool CopyLines(string orderId,IEnumerable<OrderLine> input,out List<OrderLine> copied)
        {
            copied=new List<OrderLine>();
            if(input==null)return Reject("empty-order","Add at least one item line to the order.");
            var definitions=input.ToArray();
            if(definitions.Length==0 || definitions.Length>100)return Reject("empty-order","An order needs between one and 100 item lines.");
            var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach(var definition in definitions)
            {
                var item=definition!=null?FindItem(definition.itemId):null;
                if(item==null)return Reject("unknown-item","Every order line must use an existing stock code.");
                if(definition.ordered<1 || definition.ordered>10000)return Reject("invalid-quantity","Order quantities must be whole cartons between 1 and 10000.");
                if(!seen.Add(item.id))return Reject("duplicate-line","Use one quantity line per stock code.");
                copied.Add(new OrderLine(item.id,definition.ordered){id=orderId.Trim()+"-"+(copied.Count+1).ToString("000")});
            }
            return true;
        }

        bool NewCarton(string id,string itemId,out Item item)
        {
            item=FindItem(itemId);
            if(!ValidId(id))return Reject("invalid-carton","A carton needs a readable handling-unit ID.");
            if(FindCarton(id)!=null)return Reject("duplicate-carton","This carton label is already registered.");
            if(item==null)return Reject("unknown-item","The carton stock code is unknown.");
            return true;
        }

        bool Destination(string id,out Bin bin)
        {
            bin=FindBin(id);
            if(bin==null)return Reject("unknown-bin","Scan a registered bin label.");
            if(!bin.enabled)return Reject("disabled-bin","That bin is not available for warehouse work.");
            if(BinUsed(bin.id)>=bin.capacity)return Reject("bin-full",bin.id+" is full. Choose another bin.");
            return true;
        }

        bool Source(Carton carton,string id)
        {
            var bin=FindBin(id);
            if(bin==null)return Reject("unknown-bin","Scan a registered source bin.");
            if(!Same(carton.binId,bin.id))return Reject("wrong-source","The ledger locates this carton in "+carton.binId+", not "+bin.id+".");
            if(!bin.enabled)return Reject("disabled-bin","That source bin is not available for warehouse work.");
            return true;
        }

        bool Assigned(string orderId,string cartonId,out SalesOrder order,out Carton carton)
        {
            order=FindSales(orderId);carton=FindCarton(cartonId);
            if(order==null)return Reject("unknown-so","Select an existing sales order.");
            if(order.status==SalesStatus.Cancelled || order.status==SalesStatus.Shipped)return Reject("closed-so","This sales order is already closed.");
            if(carton==null)return Reject("unknown-carton","Scan a known carton label.");
            if(!Same(carton.salesOrderId,order.id) || !order.manifest.Contains(carton.id,StringComparer.OrdinalIgnoreCase))return Reject("wrong-carton","This carton is not allocated to the selected sales order.");
            return true;
        }

        void RefreshSales(SalesOrder order)
        {
            var manifest=order.manifest.Select(FindCarton).ToArray();
            foreach(var line in order.lines)
            {
                var units=manifest.Where(value=>Same(value.itemId,line.itemId)).ToArray();
                line.reserved=units.Count(value=>value.status!=CartonStatus.Shipped);
                line.picked=units.Count(value=>value.status==CartonStatus.Picked || value.status==CartonStatus.Loaded || value.status==CartonStatus.Shipped);
                line.loaded=units.Count(value=>value.status==CartonStatus.Loaded || value.status==CartonStatus.Shipped);
                line.shipped=units.Count(value=>value.status==CartonStatus.Shipped);
            }
            int total=order.lines.Sum(value=>value.ordered),picked=order.lines.Sum(value=>value.picked),loaded=order.lines.Sum(value=>value.loaded),shipped=order.lines.Sum(value=>value.shipped);
            order.status=shipped==total?SalesStatus.Shipped:loaded==total?SalesStatus.Loaded:loaded>0?SalesStatus.Loading:
                picked==total?SalesStatus.Picked:picked>0?SalesStatus.Picking:SalesStatus.Released;
        }

        bool IsPickAvailable(Carton carton)
        { var bin=FindBin(carton.binId);return carton.status==CartonStatus.Available && bin!=null && bin.enabled && bin.kind==BinKind.Storage && bin.canPick; }
        static bool IsOnHand(Carton carton) => carton.status!=CartonStatus.Expected && carton.status!=CartonStatus.Shipped;
        int Count(string itemId,string binId,Func<Carton,bool> predicate) => cartons.Count(value=>(itemId==null || Same(value.itemId,itemId)) && (binId==null || Same(value.binId,binId)) && predicate(value));
        static bool Same(string left,string right) => !string.IsNullOrWhiteSpace(left) && !string.IsNullOrWhiteSpace(right) && string.Equals(left.Trim(),right.Trim(),StringComparison.OrdinalIgnoreCase);
        static bool ValidId(string value) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length<=64 && value.Trim().All(c=>char.IsLetterOrDigit(c) || c=='-' || c=='_' || c=='.' || c=='/' || c==':');
        static bool Invalid(out string reason,string value) { reason=value;return false; }
        bool Reject(string code,string message) { LastCode=code;LastMessage=message;return false; }
        bool Success(string message) { LastCode="ok";LastMessage=message;Revision++;return true; }
        void Record(string type,Carton carton,string order,string from,string to,int quantity,string description)
        { transactions.Add(new Transaction{sequence=nextTransaction++,type=type,cartonId=carton?.id??"",itemId=carton?.itemId??"",orderId=order??"",fromBin=from,toBin=to,quantity=quantity,description=description}); }
    }
}
