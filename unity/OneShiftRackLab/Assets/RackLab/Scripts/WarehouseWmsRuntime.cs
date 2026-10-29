using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;
using L = OneShift.RackLab.WarehouseWmsLedger;

namespace OneShift.RackLab
{
    // One stock authority for both the floor terminal and the office console.
    // Physical checks precede ledger changes; only the carrier can complete shipping.
    public sealed partial class WarehouseWmsRuntime : MonoBehaviour
    {
        public L Ledger { get; private set; } = new L();
        public WarehouseWmsWorld World { get; private set; }
        public WarehouseWmsScanner Scanner { get; private set; }
        public WarehouseCourierService Courier { get; private set; }
        public RackWalkController Walking { get; private set; }
        public bool Sandbox { get; private set; }
        public int Cash { get; private set; }
        public int CompletedOrders { get; private set; }
        public bool RacksOwned { get; private set; }
        public bool ForkliftOwned { get; private set; }
        public bool FishOwned { get; private set; }
        public bool FlamesOwned { get; private set; }
        public string Message { get; private set; } = "TC22 ready. Left click scans; right click inspects the screen.";
        public string Severity { get; private set; } = "info";
        public int Revision { get; private set; }
        public event Action Changed;
        public IReadOnlyList<WarehouseBusiness.LedgerEntry> Finance => finance;
        public IReadOnlyDictionary<string, Rigidbody> Bodies => bodies;
        readonly Dictionary<string,Rigidbody> bodies = new Dictionary<string,Rigidbody>();
        readonly HashSet<string> inTransit = new HashSet<string>();
        readonly HashSet<string> bookedPurchases = new HashSet<string>();
        readonly List<WarehouseBusiness.LedgerEntry> finance = new List<WarehouseBusiness.LedgerEntry>();
        readonly Dictionary<string,string> physicalBins = new Dictionary<string,string>();
        readonly Dictionary<string,float> mismatchSince = new Dictionary<string,float>();
        readonly HashSet<string> visibleMismatches = new HashSet<string>();
        GameObject racks, forklift, rackSign;
        WarehouseGrabber grabber;
        string collectionOrder = "", dispatchAuthorization = "";
        int nextCarton = 1, nextPurchase = 1001, nextSales = 2001;
        float nextAudit;
        bool initialized;
        static readonly string[] Sku = { "tape", "towels", "gloves", "mailers", "stretch", "labels", "wipes", "bags" };
        static readonly string[] Names = { "Packing tape", "Shop towels", "Work gloves", "Padded mailers", "Stretch film", "Shipping labels", "Workshop wipes", "Parts bags" };
        static readonly string[] Contents = { "36 rolls", "12 packs", "24 pairs", "50 mailers", "6 rolls", "20 rolls", "8 tubs", "100 bags" };
        static readonly string[] ContentUnits = { "ROLL", "PACK", "PAIR", "EA", "ROLL", "ROLL", "TUB", "EA" };
        static readonly int[] Units = {36,12,24,50,6,20,8,100}, Costs = {40,40,60,32,46,28,44,22}, Prices = {70,70,105,55,76,49,74,38};
        public static WarehouseWmsRuntime Ensure(bool sandbox,string demonstrationId="")
        {
            var scene=SceneManager.GetActiveScene();
            var existing=scene.GetRootGameObjects().SelectMany(root=>root.GetComponentsInChildren<WarehouseWmsRuntime>(true)).FirstOrDefault();
            if(existing!=null)return existing;
            var value=new GameObject("Latchford WMS").AddComponent<WarehouseWmsRuntime>();
            value.Initialize(sandbox,demonstrationId);return value;
        }
        public void Initialize(bool sandbox,string demonstrationId="")
        {
            if(initialized)return;initialized=true;
            DemonstrationId=NormalizeDemonstration(demonstrationId);sandbox=sandbox||DemonstrationActive;
            Sandbox=sandbox;Cash=DemonstrationActive?0:sandbox?10000:600;
            Walking=FindLocal<RackWalkController>();
            if(Walking==null)throw new InvalidOperationException("WMS needs the warehouse player.");
            grabber=Walking.GetComponent<WarehouseGrabber>();
            var receiving=FindLocal<WarehouseReceiving>();
            if(receiving!=null)
            {
                receiving.StartEmpty=true;
                foreach(var cargo in receiving.cargo)if(cargo!=null){cargo.gameObject.SetActive(false);WarehouseCareer.Remove(cargo.gameObject);}
                receiving.cargo=Array.Empty<PalletCargo>();
            }
            foreach(var service in FindLocalAll<WarehouseParcelService>())
            {service.enabled=false;foreach(var parcel in service.parcels)if(parcel!=null)parcel.gameObject.SetActive(false);}
            var van=FindNamed("Decorative parcel van");if(van!=null)van.SetActive(false);
            racks=FindNamed("Starting wall racks");rackSign=FindNamed("STORAGE / A01 - A03");
            var drive=FindLocal<ForkliftDriveController>();forklift=drive!=null?drive.gameObject:null;
            RacksOwned=ForkliftOwned=sandbox;
            if(racks!=null)racks.SetActive(sandbox);if(rackSign!=null)rackSign.SetActive(false);if(forklift!=null)forklift.SetActive(sandbox);
            Walking.SetSpawnPose(new Vector3(0,.025f,sandbox?-3.6f:1f),Quaternion.Euler(0,sandbox?0:145,0));
            World=WarehouseWmsWorld.Ensure(transform);World.Initialize(sandbox);
            Courier=FindLocal<WarehouseCourierService>();
            if(Courier==null)
            {
                var courierRoot=new GameObject("WMS courier service");SceneManager.MoveGameObjectToScene(courierRoot,gameObject.scene);
                Courier=courierRoot.AddComponent<WarehouseCourierService>();
            }
            Courier.Initialize();World.BindDispatch(Courier.VanTransform,Courier.DeckCollider);
            Courier.DispatchAuthorized=()=>!string.IsNullOrEmpty(collectionOrder)&&dispatchAuthorization==collectionOrder&&Ledger.CanShip(collectionOrder,out _);
            Scanner=Walking.gameObject.AddComponent<WarehouseWmsScanner>();Scanner.Bind(Walking);
            for(int i=0;i<Sku.Length;i++)Ledger.AddItem(new L.Item(Sku[i],Names[i],Units[i],Contents[i]+" per carton","Hartwell Trade Supply"));
            RegisterBins();
            finance.Add(new WarehouseBusiness.LedgerEntry("Opening working capital",Cash));
            if(DemonstrationActive){SeedDemonstration();return;}
            if(sandbox)SeedSandbox();else SeedCareerOrders();
            Notice(sandbox?"Sandbox is stocked. Right click inspects your TC22. Try SO-2001 or receive the cartons in REC-02.":
                "Open the office WMS and book PO-1001. Your TC22 receives and moves each carton.",true);
        }
        void RegisterBins()
        {
            foreach(var bin in World.Bins)
            {
                if(Ledger.FindBin(bin.Id)!=null)continue;
                string kind=bin.Kind.ToString();
                L.BinKind type=kind.IndexOf("receiv",StringComparison.OrdinalIgnoreCase)>=0?L.BinKind.Receiving:
                    kind.IndexOf("dispatch",StringComparison.OrdinalIgnoreCase)>=0?L.BinKind.Dispatch:
                    kind.IndexOf("stag",StringComparison.OrdinalIgnoreCase)>=0||kind.IndexOf("pack",StringComparison.OrdinalIgnoreCase)>=0?L.BinKind.Stage:L.BinKind.Storage;
                Ledger.AddBin(new L.Bin(bin.Id,bin.Id,type,bin.Capacity,bin.CanPick));
            }
        }
        void SeedCareerOrders()
        {
            AddPurchase("tape",3);AddSales("Miller Motor Works",new L.OrderLine("tape",3));
            AddPurchase("towels",4);AddSales("Parkside Service",new L.OrderLine("towels",4));
            AddPurchase("gloves",3);AddSales("Northline Trade Counter",new L.OrderLine("gloves",3));
        }
        void SeedSandbox()
        {
            var bins=Ledger.Bins.Where(b=>b.kind==L.BinKind.Storage).ToArray();
            int count=0;
            for(int b=0;b<bins.Length&&count<100;b++)
            {
                var view=World.FindBin(bins[b].id);if(view==null)continue;
                // Five complete rack rows hold one carton per bin. The ten
                // floor cartons keep the opening total at 100, with every
                // storage location represented and room for new purchases.
                int perBin=Math.Min(bins[b].capacity,bins[b].id=="F01"?4:bins[b].id.StartsWith("F")?3:1);
                for(int j=0;j<perBin&&count<100;j++)
                {
                    string sku=Sku[b%Sku.Length],id=NewCarton();
                    var position=view.PlacementPosition(j,WarehouseWmsWorld.CartonSize(Array.IndexOf(Sku,sku)));
                    var body=MakeCarton(id,sku,position);
                    // A new interpolated body has no previous physics pose.
                    // Initialize both representations, then let gravity settle it.
                    body.rotation=view.PlacementRotation;body.transform.SetPositionAndRotation(position,view.PlacementRotation);
                    if(!Ledger.SeedCarton(id,sku,bins[b].id))throw new InvalidOperationException(Ledger.LastMessage);count++;
                }
            }
            string po="PO-"+nextPurchase++;Ledger.AddPurchaseOrder(po,"Hartwell Trade Supply",new[]{new L.OrderLine("tape",3),new L.OrderLine("towels",1)});
            var rec=World.FindBin("REC-02");
            for(int i=0;i<2;i++)
            {
                string sku=i==0?"tape":"towels",id=NewCarton();var position=rec.PlacementPosition(i,WarehouseWmsWorld.CartonSize(Array.IndexOf(Sku,sku)));
                var body=MakeCarton(id,sku,position);body.rotation=rec.PlacementRotation;body.transform.SetPositionAndRotation(position,rec.PlacementRotation);
                if(!Ledger.ExpectCarton(id,sku,po))throw new InvalidOperationException(Ledger.LastMessage);
                World.SetCartonDocument(body,po);
            }
            AddPurchase("gloves",3);AddPurchase("mailers",4);
            AddSales("Miller Motor Works",new L.OrderLine("tape",2),new L.OrderLine("towels",1));
            AddSales("Parkside Service",new L.OrderLine("gloves",2),new L.OrderLine("wipes",1));
            AddSales("Northline Trade Counter",new L.OrderLine("mailers",2),new L.OrderLine("labels",2));
        }
        public string AddPurchase(string sku,int quantity)
        {string id="PO-"+nextPurchase;if(!Ledger.AddPurchaseOrder(id,"Hartwell Trade Supply",new[]{new L.OrderLine(sku,quantity)}))return null;nextPurchase++;return id;}
        public string AddSales(string customer,params L.OrderLine[] lines)
        {string id="SO-"+nextSales;if(!Ledger.AddSalesOrder(id,customer,lines))return null;nextSales++;return id;}
        public bool CreatePurchase(string payload)
        {
            if(!ReadDraft(payload,out var sku,out int quantity,out var reason))return Notice(reason,false);
            string id=AddPurchase(sku,quantity);if(id==null)return Notice(Ledger.LastMessage,false);
            return Notice(id+" created for "+quantity+" CTN of "+Ledger.FindItem(sku).name+". Book the delivery when ready.",true);
        }
        public bool CreateSales(string payload)
        {
            if(!ReadDraft(payload,out var sku,out int quantity,out var reason))return Notice(reason,false);
            string id=AddSales("Latchford Trade Counter",new L.OrderLine(sku,quantity));if(id==null)return Notice(Ledger.LastMessage,false);
            return Notice(id+" created for "+quantity+" CTN of "+Ledger.FindItem(sku).name+". Release when the stock is ready to pick.",true);
        }
        bool ReadDraft(string payload,out string sku,out int quantity,out string reason)
        {
            sku="";quantity=0;reason="Complete your first shipment before creating new purchase or sales orders.";
            if(DemonstrationActive){reason="This demonstration has its documents prepared. Create new orders in Career or Sandbox.";return false;}
            if(!Sandbox&&CompletedOrders<1)return false;
            reason="Choose a catalogue item and a whole quantity from 1 to 6 CTN.";
            if(string.IsNullOrEmpty(payload))return false;
            var parts=payload.Split(':');
            if(parts.Length!=2||Array.IndexOf(Sku,parts[0])<0||!int.TryParse(parts[1],NumberStyles.None,CultureInfo.InvariantCulture,out quantity)||quantity<1||quantity>6)return false;
            sku=parts[0];reason="";return true;
        }
        string NewCarton()=>"LD"+(nextCarton++).ToString("000000");
        Rigidbody MakeCarton(string id,string sku,Vector3 position)
        {int variant=Array.IndexOf(Sku,sku);var item=Ledger.FindItem(sku);var body=World.CreateCarton(id,sku,item.name,item.unitsPerCarton,variant>=0?ContentUnits[variant]:"EA",position,Math.Max(0,variant));bodies.Add(id,body);return body;}
        public bool CanBook(string id,out string reason)
        {
            var po=Ledger.FindPurchase(id);reason="Select an open purchase order.";
            if(DemonstrationActive){reason="Demonstration freight is already prepared. Book new deliveries in Career or Sandbox.";return false;}
            if(po==null||po.status==L.PurchaseStatus.Received||po.status==L.PurchaseStatus.Cancelled)return false;
            if(bookedPurchases.Contains(id)){reason="Delivery already booked. Receive the outstanding cartons.";return false;}
            if(Courier.Busy){reason="Wait for the current van visit to finish.";return false;}
            if(!Sandbox&&CompletedOrders==0&&po.lines.Any(l=>l.itemId!="tape")){reason="Complete the packing-tape order first.";return false;}
            int quantity=0,cost=0;
            foreach(var line in po.lines)
            {int remaining=line.ordered-Ledger.Cartons.Count(c=>c.purchaseOrderId==id&&c.itemId==line.itemId);quantity+=remaining;cost+=remaining*Cost(line.itemId);}
            if(quantity<=0){reason="All cartons have arrived. Receive them with the TC22.";return false;}
            if(quantity>6){reason="This van carries at most six cartons per purchase order.";return false;}
            if(Ledger.Cartons.Count(c=>c.status!=L.CartonStatus.Shipped)+quantity>(Sandbox?150:48)){reason="Ship stock to clear carton capacity.";return false;}
            if(Cash<cost){reason="This delivery needs $"+cost+" of working cash.";return false;}
            reason="Book "+quantity+" cartons for $"+cost+". Driver delivers to REC-01.";return true;
        }
        public bool Book(string id)
        {
            if(!CanBook(id,out var reason))return Notice(reason,false);
            var po=Ledger.FindPurchase(id);var units=new List<(string id,string sku,Rigidbody body)>();int cost=0;
            foreach(var line in po.lines)
            {
                int remaining=line.ordered-Ledger.Cartons.Count(c=>c.purchaseOrderId==id&&c.itemId==line.itemId);
                for(int i=0;i<remaining;i++){string carton=NewCarton();var body=MakeCarton(carton,line.itemId,Courier.DeliverySpawnPosition(units.Count));units.Add((carton,line.itemId,body));cost+=Cost(line.itemId);}
            }
            if(!Courier.BeginDelivery(units.Select(u=>u.body).ToArray(),()=>Notice("Delivery complete. Use Receive on your TC22, then Transfer into storage.",true),body=>
                {var marker=body.GetComponent<WarehouseWmsCarton>();inTransit.Remove(marker.Id);Notice("Carton "+marker.Id+" delivered to REC-01.",true);}))
            {foreach(var unit in units){bodies.Remove(unit.id);WarehouseCareer.Remove(unit.body.gameObject);}return Notice("The carrier could not book this delivery.",false);}
            foreach(var unit in units){if(!Ledger.ExpectCarton(unit.id,unit.sku,id))throw new InvalidOperationException(Ledger.LastMessage);World.SetCartonDocument(unit.body,id);inTransit.Add(unit.id);}
            bookedPurchases.Add(id);Cash-=cost;finance.Add(new WarehouseBusiness.LedgerEntry("Purchase / "+id,-cost));
            return Notice(id+" booked. Close the computer to let the driver arrive.",true);
        }
        public bool CanRelease(string id,out string reason)
        {
            if(DemonstrationActive){reason="Demonstration allocation is already prepared. Release new orders in Career or Sandbox.";return false;}
            if(!string.IsNullOrEmpty(collectionOrder)){reason="Finish the current collection before releasing another sales order.";return false;}
            if(Courier.Busy){reason="Wait for the current van visit to finish.";return false;}
            if(!Ledger.CanReleaseSalesOrder(id,out reason))return false;
            var order=Ledger.FindSales(id);
            if(order.lines.Sum(l=>l.ordered)>6){reason="This collection van holds at most six cartons.";return false;}
            return true;
        }
        public bool ReleaseOrder(string id)
        {
            if(!CanRelease(id,out var reason))return Notice(reason,false);
            // Reservation is atomic. Physical inventory is checked before a carrier is promised.
            var order=Ledger.FindSales(id);
            foreach(var line in order.lines)
            {
                var candidates=Ledger.Cartons.Where(c=>c.itemId==line.itemId&&c.status==L.CartonStatus.Available&&Ledger.FindBin(c.binId)?.canPick==true).OrderBy(c=>c.sequence).Take(line.ordered);
                foreach(var c in candidates)if(!IsInBin(c.id,c.binId,out reason))return Notice("Resolve the location exception for "+c.id+" before release. "+reason,false);
            }
            if(!Ledger.ReleaseSalesOrder(id))return Notice(Ledger.LastMessage,false);
            collectionOrder=id;dispatchAuthorization="";return Notice(id+" released. TC22 Pick guides each allocated carton to STAGE-01. Collection is booked when all picks are staged.",true);
        }
        public bool CancelOrder(string id)
        {
            if(DemonstrationActive)return Notice("Keep this demonstration's prepared order. Restart the scenario for a fresh example.",false);
            if(collectionOrder==id&&collectionBooked)return Notice("A collection is already booked. Complete this shipment before cancelling further orders.",false);
            if(!Ledger.CancelSalesOrder(id))return Notice(Ledger.LastMessage,false);
            if(collectionOrder==id)collectionOrder=dispatchAuthorization="";
            ResetWorkflow("home");return Notice("Sales order cancelled. Reservations released.",true);
        }
        void CompleteShipment(string id)
        {
            var order=Ledger.FindSales(id);
            if(order!=null&&order.status==L.SalesStatus.Shipped)return;
            if(!Ledger.Ship(id))throw new InvalidOperationException("Carrier departed without a loaded WMS manifest: "+Ledger.LastMessage);
            int payment=order.lines.Sum(l=>l.ordered*Price(l.itemId));
            foreach(var carton in order.manifest)if(bodies.TryGetValue(carton,out var body)){bodies.Remove(carton);physicalBins.Remove(carton);mismatchSince.Remove(carton);visibleMismatches.Remove(carton);if(body!=null)WarehouseCareer.Remove(body.gameObject);}
            Cash+=payment;CompletedOrders++;finance.Add(new WarehouseBusiness.LedgerEntry("Paid / "+id+" / "+order.customer,payment));
            collectionOrder=dispatchAuthorization="";collectionBooked=false;
            if(!Sandbox&&order.lines.Count==1){var line=order.lines[0];AddPurchase(line.itemId,line.ordered);AddSales(order.customer,new L.OrderLine(line.itemId,line.ordered));}
            ResetWorkflow("lookup");Notice(id+" shipped. "+order.customer+" paid $"+payment+".",true);
        }
        public bool CanUpgrade(string id,out string reason)
        {
            int price=WarehouseCareer.UpgradePrice(id);reason="Upgrade unavailable.";
            if(DemonstrationActive){reason="Equipment purchases belong to Career or Sandbox.";return false;}
            if(price<0)return false;if(Owns(id)){reason="Already installed.";return false;}
            if(id=="racks"&&racks==null){reason="The rack installation is unavailable.";return false;}
            if((id=="forklift"||id=="flames")&&forklift==null){reason="The forklift installation is unavailable.";return false;}
            if((id=="racks"||id=="forklift")&&CompletedOrders<3){reason="Complete three orders before expanding the warehouse.";return false;}
            if(id=="fish"&&CompletedOrders<1){reason="Complete your first order to unlock the singing fish.";return false;}
            if(id=="flames"&&!ForkliftOwned){reason="Buy a forklift before fitting flames.";return false;}
            if(Cash-price<120){reason="Keep $120 for your next delivery.";return false;}
            reason=id=="racks"?"Add labelled rack bins for reserve stock.":id=="forklift"?"A used forklift with practical training.":id=="fish"?"An office fish with an original tune.":"Painted flames for the side panels.";return true;
        }
        public bool Owns(string id)=>id=="racks"?RacksOwned:id=="forklift"?ForkliftOwned:id=="fish"?FishOwned:id=="flames"&&FlamesOwned;
        public bool Upgrade(string id)
        {
            if(!CanUpgrade(id,out var reason))return Notice(reason,false);
            if(id=="racks"){RacksOwned=true;if(racks!=null)racks.SetActive(true);World.AddPurchasedRacks();RegisterBins();}
            else if(id=="forklift"){ForkliftOwned=true;if(forklift!=null)forklift.SetActive(true);}
            else if(id=="fish"){FishOwned=true;WarehouseCareerDecor.InstallFish(transform);}
            else if(id=="flames"){FlamesOwned=true;WarehouseCareerDecor.InstallFlames(forklift.transform);}
            Cash-=WarehouseCareer.UpgradePrice(id);finance.Add(new WarehouseBusiness.LedgerEntry("Equipment / "+id,-WarehouseCareer.UpgradePrice(id)));return Notice("Upgrade installed.",true);
        }
        public static int Cost(string sku){int i=Array.IndexOf(Sku,sku);return i<0?0:Costs[i];}
        public static int Price(string sku){int i=Array.IndexOf(Sku,sku);return i<0?0:Prices[i];}
        public bool Notice(string message,bool success)
        {Message=message;Severity=success?"success":"error";Revision++;Changed?.Invoke();return success;}
        void Update()
        {
            if(!initialized||Time.timeScale<=0||BrowserLifecycle.GraphicsPreparing||Time.time<nextAudit)return;
            nextAudit=Time.time+.4f;AuditPhysicalBins();
        }
        void AuditPhysicalBins()
        {
            bool changed=false;
            foreach(var carton in Ledger.Cartons)
            {
                if(carton.status==L.CartonStatus.Shipped)continue;
                // Once departure begins the courier secures these bodies as
                // kinematic freight. They remain in the moving dispatch bin
                // until the offsite callback posts their shipment.
                bool departing=carton.status==L.CartonStatus.Loaded&&Courier.CollectionDeparting;
                string actual=departing?carton.binId:PhysicalBin(carton.id);
                if(!physicalBins.TryGetValue(carton.id,out var previous)||actual!=previous){physicalBins[carton.id]=actual;changed=true;}
                bodies.TryGetValue(carton.id,out var body);
                bool held=body!=null&&grabber!=null&&grabber.HeldBody==body;
                bool mismatch=carton.status!=L.CartonStatus.Expected&&!inTransit.Contains(carton.id)&&actual!=carton.binId&&!held;
                if(mismatch)
                {
                    if(!mismatchSince.ContainsKey(carton.id)){mismatchSince[carton.id]=Time.time;changed=true;}
                    if(Time.time-mismatchSince[carton.id]>=1&&visibleMismatches.Add(carton.id))changed=true;
                }
                else
                {
                    if(mismatchSince.Remove(carton.id))changed=true;
                    if(visibleMismatches.Remove(carton.id))changed=true;
                }
            }
            if(changed){Revision++;Changed?.Invoke();}
        }
        public string PhysicalBin(string id)
        {
            if(!bodies.TryGetValue(id,out var body)||body==null||!body.gameObject.activeInHierarchy||inTransit.Contains(id))return "";
            var carton=Ledger.FindCarton(id);
            if(carton!=null&&carton.status==L.CartonStatus.Loaded&&Courier.CollectionDeparting)return carton.binId;
            // Most inventory has not moved. Check its last known bin before
            // searching every rack volume in a populated warehouse.
            WarehouseWmsBin previous=null,recorded=null;
            if(physicalBins.TryGetValue(id,out var last))previous=World.FindBin(last);
            if(previous!=null&&World.ContainsSupported(previous,body,out _))return previous.Id;
            if(carton!=null)recorded=World.FindBin(carton.binId);
            if(recorded!=null&&recorded!=previous&&World.ContainsSupported(recorded,body,out _))return recorded.Id;
            foreach(var bin in World.Bins)if(bin!=previous&&bin!=recorded&&World.ContainsSupported(bin,body,out _))return bin.Id;
            return "";
        }
        public bool IsInBin(string id,string binId,out string reason)
        {
            reason="The carton is missing or still with the carrier.";
            if(!bodies.TryGetValue(id,out var body)||body==null||inTransit.Contains(id))return false;
            if(grabber!=null&&grabber.HeldBody==body){reason="Put the carton down first.";return false;}
            var bin=World.FindBin(binId);if(bin==null){reason="Unknown physical location.";return false;}
            return World.ContainsSupported(bin,body,out reason);
        }
        IEnumerable<T> FindLocalAll<T>() where T:Component => gameObject.scene.GetRootGameObjects().SelectMany(root=>root.GetComponentsInChildren<T>(true));
        T FindLocal<T>() where T:Component => FindLocalAll<T>().FirstOrDefault();
        GameObject FindNamed(string name)
        {foreach(var t in FindLocalAll<Transform>())if(t.name==name)return t.gameObject;return null;}
    }
}
