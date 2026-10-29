using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Wms = OneShift.RackLab.WarehouseWmsLedger;
#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
#endif

namespace OneShift.RackLab
{
    // These tests intentionally have no scene or physics dependencies. Runtime
    // scanner, support, distance and occlusion checks need separate validation.
    public static class WarehouseWmsValidation
    {
        [Serializable] public sealed class Check
        { public string name, error; public bool passed; }
        [Serializable] public sealed class Report
        {
            public string generatedUtc;
            public string method = "Production WMS ledger with deterministic receiving, bin transfers, exact allocations, picking, loading and offsite shipment transactions. No Unity scene or warehouse state is changed.";
            public string scope = "Domain integrity only. Physical carton movement, scanner label visibility, supported bin placement and browser controls require their separate runtime checks.";
            public bool passed;
            public List<Check> checks = new List<Check>();
        }

#if UNITY_EDITOR
        [MenuItem("One Shift/Validate WMS inventory ledger")]
        public static string ValidateAndSave()
        {
            var report=Run();string json=JsonUtility.ToJson(report,true);
            const string path="Assets/RackLab/Reports/warehouse-wms-validation.json";
            File.WriteAllText(path,json+"\n");AssetDatabase.ImportAsset(path);return json;
        }
#endif

        public static Report Run()
        {
            var report=new Report{generatedUtc=DateTime.UtcNow.ToString("O")};
            Test(report,"definitions reject duplicates and invalid carton units",Definitions);
            Test(report,"definition and order inputs are copied",DefinitionCopies);
            Test(report,"expected delivery is not on-hand inventory",ExpectedStock);
            Test(report,"partial receipt tracks the exact purchase line",PartialReceipt);
            Test(report,"wrong PO and duplicate receipt leave stock unchanged",ReceiptIdentity);
            Test(report,"receiving rejects wrong, closed and full bins",ReceiptBins);
            Test(report,"expected cartons cannot exceed purchase quantities",ExpectedLimit);
            Test(report,"transfer checks source, destination and capacity",TransferBins);
            Test(report,"transfer records the scanned route once",TransferSuccess);
            Test(report,"reserve locations require transfer before picking",ReserveLocations);
            Test(report,"short second sales line cannot reserve the first",AtomicRelease);
            Test(report,"allocation reserves oldest eligible handling units",FifoRelease);
            Test(report,"reservations exclude stock from another sales order",CompetingOrders);
            Test(report,"duplicate release and reserved transfers reject",ReservationGuards);
            Test(report,"pick requires the correct order, carton and source",PickIdentity);
            Test(report,"pick requires open staging with capacity",PickBins);
            Test(report,"partial picking preserves exact line progress",PickProgress);
            Test(report,"loading requires picked stock and dispatch capacity",LoadGuards);
            Test(report,"loading does not ship or remove on-hand stock",LoadingIsNotShipment);
            Test(report,"incomplete and split-vehicle manifests cannot ship",ShipmentManifest);
            Test(report,"offsite shipment decrements stock exactly once",ShipmentCommit);
            Test(report,"cancelling an unpicked order releases reservations",CancelUnpicked);
            Test(report,"picked stock must be returned before cancellation",CancelPicked);
            Test(report,"loaded stock can return through a validated bin move",ReturnLoaded);
            Test(report,"only an untouched purchase order can be cancelled",CancelPurchase);
            Test(report,"bin opening is recorded and occupied bins cannot close",BinActivation);
            Test(report,"the next purchase and sales order repeat cleanly",RepeatCycle);
            Test(report,"transaction history retains quantities and stable sequence",TransactionHistory);
            Test(report,"100 mixed orders conserve stock and line quantities",ManyOrders);
            report.passed=report.checks.All(value=>value.passed);return report;
        }

        static Wms NewLedger()
        {
            var ledger=new Wms();
            Need(ledger.AddItem(new Wms.Item("TAPE","Packing tape",36,"48 mm rolls","Alder Packaging")),ledger.LastMessage);
            Need(ledger.AddItem(new Wms.Item("TOWEL","Shop towels",12,"Workshop packs","North Mill Supplies")),ledger.LastMessage);
            Need(ledger.AddItem(new Wms.Item("GLOVE","Work gloves",24,"Pair packs","North Mill Supplies")),ledger.LastMessage);
            foreach(var bin in new[]{
                new Wms.Bin("REC-01","Receiving",Wms.BinKind.Receiving,8),
                new Wms.Bin("A01","Pick face A",Wms.BinKind.Storage,12),
                new Wms.Bin("A02","Pick face B",Wms.BinKind.Storage,12),
                new Wms.Bin("RESERVE","Upper reserve",Wms.BinKind.Storage,12,false),
                new Wms.Bin("STAGE-01","Outbound staging",Wms.BinKind.Stage,6),
                new Wms.Bin("DISPATCH-01","Collection van",Wms.BinKind.Dispatch,6),
                new Wms.Bin("DISPATCH-02","Second dispatch",Wms.BinKind.Dispatch,6),
                new Wms.Bin("ONE","Single-carton slot",Wms.BinKind.Storage,1),
                new Wms.Bin("CLOSED","Unpurchased rack",Wms.BinKind.Storage,4){enabled=false}})
                Need(ledger.AddBin(bin),ledger.LastMessage);
            return ledger;
        }

        static void Test(Report report,string name,Action<Wms> action)
        {
            var check=new Check{name=name,error=""};report.checks.Add(check);
            try{var ledger=NewLedger();action(ledger);Need(ledger.CheckInvariants(out var reason),reason);check.passed=true;}
            catch(Exception error){check.passed=false;check.error=error.ToString();}
        }
        static void Need(bool value,string message){if(!value)throw new InvalidOperationException(message);}
        static void Yes(Wms ledger,bool value){Need(value,ledger.LastCode+": "+ledger.LastMessage);}
        static void No(Wms ledger,Func<bool> action,string expectedCode=null)
        {
            string before=Snapshot(ledger);int revision=ledger.Revision;
            Need(!action(),"Invalid transaction was accepted.");
            Need(expectedCode==null || ledger.LastCode==expectedCode,"Expected "+expectedCode+", got "+ledger.LastCode+": "+ledger.LastMessage);
            Need(before==Snapshot(ledger) && revision==ledger.Revision,"Rejected transaction changed records or revision.");
            Need(ledger.CheckInvariants(out var reason),reason);
        }
        static string Snapshot(Wms ledger)
        {
            return string.Join("|",ledger.Cartons.Select(value=>value.id+","+value.itemId+","+value.binId+","+value.status+","+value.salesOrderId+","+value.purchaseOrderId+","+value.sequence))+
                "#"+string.Join("|",ledger.PurchaseOrders.Select(value=>value.id+","+value.status+":"+string.Join(";",value.lines.Select(Line))))+
                "#"+string.Join("|",ledger.SalesOrders.Select(value=>value.id+","+value.status+":"+string.Join(";",value.lines.Select(Line))+":"+string.Join(",",value.manifest)))+
                "#"+string.Join("|",ledger.Bins.Select(value=>value.id+","+value.kind+","+value.capacity+","+value.canPick+","+value.enabled))+
                "#"+string.Join("|",ledger.Items.Select(value=>value.id+","+value.name+","+value.unitsPerCarton+","+value.description+","+value.uom))+
                "#"+string.Join("|",ledger.Transactions.Select(value=>value.sequence+","+value.type+","+value.cartonId+","+value.itemId+","+value.orderId+","+value.fromBin+","+value.toBin+","+value.quantity));
        }
        static string Line(Wms.OrderLine value)=>value.id+","+value.itemId+","+value.ordered+","+value.received+","+value.reserved+","+value.picked+","+value.loaded+","+value.shipped;
        static void Po(Wms ledger,string id="PO-1",int tape=3,int towels=0)
        {
            var lines=new List<Wms.OrderLine>();if(tape>0)lines.Add(new Wms.OrderLine("TAPE",tape));if(towels>0)lines.Add(new Wms.OrderLine("TOWEL",towels));
            Yes(ledger,ledger.AddPurchaseOrder(id,"Alder Packaging",lines));
        }
        static void So(Wms ledger,string id="SO-1",int tape=3,int towels=0)
        {
            var lines=new List<Wms.OrderLine>();if(tape>0)lines.Add(new Wms.OrderLine("TAPE",tape));if(towels>0)lines.Add(new Wms.OrderLine("TOWEL",towels));
            Yes(ledger,ledger.AddSalesOrder(id,"Miller Motor Works",lines));
        }
        static void Stock(Wms ledger,int quantity=3,string item="TAPE",string bin="A01",string prefix="C")
        {for(int i=1;i<=quantity;i++)Yes(ledger,ledger.SeedCarton(prefix+i,item,bin));}
        static void Released(Wms ledger,int quantity=3)
        {Stock(ledger,quantity);So(ledger,tape:quantity);Yes(ledger,ledger.ReleaseSalesOrder("SO-1"));}
        static void PickAll(Wms ledger,string id="SO-1")
        {foreach(var cartonId in ledger.FindSales(id).manifest){var c=ledger.FindCarton(cartonId);Yes(ledger,ledger.Pick(id,c.id,c.binId,"STAGE-01"));}}
        static void LoadAll(Wms ledger,string id="SO-1")
        {foreach(var cartonId in ledger.FindSales(id).manifest)Yes(ledger,ledger.Load(id,cartonId,"STAGE-01","DISPATCH-01"));}

        static void Definitions(Wms l)
        {
            No(l,()=>l.AddItem(new Wms.Item("TAPE","Duplicate",36)),"duplicate-item");
            No(l,()=>l.AddItem(new Wms.Item("NEW","Invalid",0)),"invalid-item");
            No(l,()=>l.AddItem(new Wms.Item("NEW","Invalid",1){uom="EA"}),"invalid-item");
            No(l,()=>l.AddBin(new Wms.Bin("A01","Duplicate",Wms.BinKind.Storage,2)),"duplicate-bin");
            No(l,()=>l.AddBin(new Wms.Bin("BAD","No capacity",Wms.BinKind.Storage,0)),"invalid-bin");
            No(l,()=>l.AddSalesOrder("BAD","Client",new[]{new Wms.OrderLine("TAPE",-1)}),"invalid-quantity");
            No(l,()=>l.AddPurchaseOrder("BAD","Supplier",new[]{new Wms.OrderLine("TAPE",0)}),"invalid-quantity");
            No(l,()=>l.AddPurchaseOrder("BAD","Supplier",new[]{new Wms.OrderLine("MISSING",1)}),"unknown-item");
            No(l,()=>l.AddPurchaseOrder("BAD","Supplier",new[]{new Wms.OrderLine("TAPE",1),new Wms.OrderLine("tape",1)}),"duplicate-line");
        }
        static void DefinitionCopies(Wms l)
        {
            var item=new Wms.Item("COPY","Original item",3);Yes(l,l.AddItem(item));item.name="Changed";item.unitsPerCarton=0;
            var line=new Wms.OrderLine("TAPE",2);Yes(l,l.AddPurchaseOrder("PO-COPY","Supplier",new[]{line}));line.ordered=900;line.received=100;
            Need(l.FindItem("COPY").name=="Original item" && l.FindItem("COPY").unitsPerCarton==3 && l.FindPurchase("PO-COPY").lines[0].ordered==2 && l.FindPurchase("PO-COPY").lines[0].received==0,"External input aliases changed authoritative records.");
        }
        static void ExpectedStock(Wms l)
        {
            Po(l);Yes(l,l.ExpectCarton("LPN-1","TAPE","PO-1"));
            Need(l.Expected("TAPE")==1 && l.OnHand()==0 && l.Available()==0 && l.BinUsed("REC-01")==0,"An expected carton became stock before receiving.");
            No(l,()=>l.Transfer("LPN-1","REC-01","A01"),"reserved-stock");
            No(l,()=>l.ExpectCarton("lpn-1","TAPE","PO-1"),"duplicate-carton");
        }
        static void PartialReceipt(Wms l)
        {
            Po(l,tape:3,towels:2);Yes(l,l.ExpectCarton("LPN-1","TAPE","PO-1"));Yes(l,l.Receive("PO-1","LPN-1","REC-01"));
            Need(l.FindPurchase("PO-1").status==Wms.PurchaseStatus.PartReceived && l.FindPurchase("PO-1").lines[0].received==1 && l.FindPurchase("PO-1").lines[1].received==0,"Partial receipt updated the wrong line.");
            Need(l.OnHand()==1 && l.InReceiving()==1 && l.Available()==0 && l.Expected()==0,"Receiving totals do not separate putaway stock.");
            foreach(var pair in new[]{new[]{"LPN-2","TAPE"},new[]{"LPN-3","TAPE"},new[]{"LPN-4","TOWEL"},new[]{"LPN-5","TOWEL"}})
            {Yes(l,l.ExpectCarton(pair[0],pair[1],"PO-1"));Yes(l,l.Receive("PO-1",pair[0],"REC-01"));}
            Need(l.FindPurchase("PO-1").status==Wms.PurchaseStatus.Received && l.OnHand()==5,"Complete receipt did not close all lines.");
        }
        static void ReceiptIdentity(Wms l)
        {
            Po(l);Po(l,"PO-2");Yes(l,l.ExpectCarton("LPN-1","TAPE","PO-1"));
            No(l,()=>l.Receive("PO-2","LPN-1","REC-01"),"wrong-po");
            No(l,()=>l.Receive("PO-1","UNKNOWN","REC-01"),"unknown-carton");
            Yes(l,l.Receive("PO-1","LPN-1","REC-01"));
            No(l,()=>l.Receive("PO-1","LPN-1","REC-01"),"already-received");
            Need(l.Transactions.Count(value=>value.type=="RECEIVE")==1,"Duplicate scan created another receipt transaction.");
        }
        static void ReceiptBins(Wms l)
        {
            Po(l);Yes(l,l.ExpectCarton("LPN-1","TAPE","PO-1"));
            No(l,()=>l.Receive("PO-1","LPN-1","A01"),"wrong-destination");
            No(l,()=>l.Receive("PO-1","LPN-1","MISSING"),"unknown-bin");
            Yes(l,l.AddBin(new Wms.Bin("REC-CLOSED","Closed receiving",Wms.BinKind.Receiving,1){enabled=false}));
            No(l,()=>l.Receive("PO-1","LPN-1","REC-CLOSED"),"disabled-bin");
            Stock(l,8,"GLOVE","REC-01","G");
            No(l,()=>l.Receive("PO-1","LPN-1","REC-01"),"bin-full");
        }
        static void ExpectedLimit(Wms l)
        {
            Po(l,tape:1);Yes(l,l.ExpectCarton("LPN-1","TAPE","PO-1"));
            No(l,()=>l.ExpectCarton("EXCESS","TAPE","PO-1"),"over-receipt");
            No(l,()=>l.ExpectCarton("WRONG","GLOVE","PO-1"),"wrong-item");
            Yes(l,l.Receive("PO-1","LPN-1","REC-01"));
            No(l,()=>l.ExpectCarton("EXCESS","TAPE","PO-1"),"closed-po");
        }
        static void TransferBins(Wms l)
        {
            Stock(l,1);Stock(l,1,"TOWEL","ONE","T");
            No(l,()=>l.Transfer("C1","A02","A01"),"wrong-source");
            No(l,()=>l.Transfer("C1","A01","A01"),"same-bin");
            No(l,()=>l.Transfer("C1","A01","CLOSED"),"disabled-bin");
            No(l,()=>l.Transfer("C1","A01","ONE"),"bin-full");
            No(l,()=>l.Transfer("C1","A01","STAGE-01"),"wrong-destination");
            No(l,()=>l.Transfer("C1","A01","DISPATCH-01"),"wrong-destination");
        }
        static void TransferSuccess(Wms l)
        {
            Stock(l,1,"TAPE","REC-01");Yes(l,l.Transfer("C1","REC-01","A01"));
            Need(l.InReceiving()==0 && l.Available()==1 && l.OnHand()==1 && l.StockInBin("A01").Single().id=="C1","Transfer changed quantity or left stale bins.");
            var move=l.Transactions.Last();Need(move.fromBin=="REC-01" && move.toBin=="A01" && move.quantity==1 && move.type=="TRANSFER","Transaction lost its source, destination or unit.");
            No(l,()=>l.Transfer("C1","REC-01","A01"),"wrong-source");
        }
        static void ReserveLocations(Wms l)
        {
            Stock(l,3,"TAPE","RESERVE");So(l);
            Need(l.OnHand()==3 && l.Available()==0,"Reserve inventory should be visible but not directly allocatable.");
            No(l,()=>l.ReleaseSalesOrder("SO-1"),"release-unavailable");
            foreach(var id in new[]{"C1","C2","C3"})Yes(l,l.Transfer(id,"RESERVE","A01"));
            Yes(l,l.ReleaseSalesOrder("SO-1"));Need(l.Reserved()==3 && l.Available()==0,"Transferred stock could not be allocated.");
        }
        static void AtomicRelease(Wms l)
        {
            Stock(l);So(l,towels:2);string before=Snapshot(l);
            Need(!l.CanReleaseSalesOrder("SO-1",out var reason) && reason.Contains("Shop towels") && before==Snapshot(l),"Preflight mutated state or lost shortage detail.");
            No(l,()=>l.ReleaseSalesOrder("SO-1"),"release-unavailable");
            Need(l.Available("TAPE")==3 && l.Reserved()==0 && l.FindSales("SO-1").manifest.Count==0,"First line was partially allocated despite a later shortage.");
        }
        static void FifoRelease(Wms l)
        {
            Stock(l,1,"TAPE","A02","OLD");Stock(l,2,"TAPE","A01","NEW");So(l,tape:2);Yes(l,l.ReleaseSalesOrder("SO-1"));
            Need(l.FindSales("SO-1").manifest.SequenceEqual(new[]{"OLD1","NEW1"}) && l.Available()==1 && l.Reserved()==2,"FIFO reservation used the wrong eligible cartons.");
        }
        static void CompetingOrders(Wms l)
        {
            Released(l);So(l,"SO-2",1);No(l,()=>l.ReleaseSalesOrder("SO-2"),"release-unavailable");
            Need(l.Cartons.All(value=>value.salesOrderId=="SO-1"),"Stock was allocated to two customers.");
        }
        static void ReservationGuards(Wms l)
        {Released(l);No(l,()=>l.ReleaseSalesOrder("SO-1"),"release-unavailable");No(l,()=>l.Transfer("C1","A01","A02"),"reserved-stock");}
        static void PickIdentity(Wms l)
        {
            Released(l);So(l,"SO-2",1);Stock(l,1,"GLOVE","A01","G");
            No(l,()=>l.Pick("SO-2","C1","A01","STAGE-01"),"wrong-carton");
            No(l,()=>l.Pick("SO-1","G1","A01","STAGE-01"),"wrong-carton");
            No(l,()=>l.Pick("SO-1","C1","A02","STAGE-01"),"wrong-source");
            No(l,()=>l.Pick("SO-1","MISSING","A01","STAGE-01"),"unknown-carton");
        }
        static void PickBins(Wms l)
        {
            Released(l);No(l,()=>l.Pick("SO-1","C1","A01","A02"),"wrong-destination");
            Yes(l,l.AddBin(new Wms.Bin("STAGE-SMALL","Small stage",Wms.BinKind.Stage,1)));
            Yes(l,l.Pick("SO-1","C1","A01","STAGE-SMALL"));
            No(l,()=>l.Pick("SO-1","C2","A01","STAGE-SMALL"),"bin-full");
            No(l,()=>l.Pick("SO-1","C1","A01","STAGE-SMALL"),"wrong-state");
        }
        static void PickProgress(Wms l)
        {
            Stock(l,2);Stock(l,1,"TOWEL","A02","T");So(l,tape:2,towels:1);Yes(l,l.ReleaseSalesOrder("SO-1"));
            Yes(l,l.Pick("SO-1","T1","A02","STAGE-01"));
            var order=l.FindSales("SO-1");Need(order.status==Wms.SalesStatus.Picking && order.lines[0].picked==0 && order.lines[1].picked==1 && l.OnHand()==3 && l.Reserved()==3,"Partial pick changed wrong line or stock total.");
            Yes(l,l.Pick("SO-1","C1","A01","STAGE-01"));Yes(l,l.Pick("SO-1","C2","A01","STAGE-01"));
            Need(order.status==Wms.SalesStatus.Picked && l.Picked()==3 && l.BinUsed("STAGE-01")==3,"Completed picks did not reconcile staging.");
        }
        static void LoadGuards(Wms l)
        {
            Released(l);No(l,()=>l.Load("SO-1","C1","A01","DISPATCH-01"),"wrong-state");PickAll(l);
            No(l,()=>l.Load("SO-1","C1","A01","DISPATCH-01"),"wrong-source");
            No(l,()=>l.Load("SO-1","C1","STAGE-01","A02"),"wrong-destination");
            Yes(l,l.AddBin(new Wms.Bin("VAN-SMALL","Small van",Wms.BinKind.Dispatch,1)));
            Yes(l,l.Load("SO-1","C1","STAGE-01","VAN-SMALL"));
            No(l,()=>l.Load("SO-1","C2","STAGE-01","VAN-SMALL"),"bin-full");
            No(l,()=>l.Load("SO-1","C1","STAGE-01","VAN-SMALL"),"wrong-state");
        }
        static void LoadingIsNotShipment(Wms l)
        {
            Released(l);PickAll(l);Yes(l,l.Load("SO-1","C1","STAGE-01","DISPATCH-01"));
            Need(l.OnHand()==3 && l.Loaded()==1 && l.FindSales("SO-1").status==Wms.SalesStatus.Loading && l.FindSales("SO-1").lines[0].shipped==0 && l.Transactions.All(value=>value.type!="SHIP"),"A load was treated as a shipment.");
        }
        static void ShipmentManifest(Wms l)
        {
            Released(l);No(l,()=>l.Ship("SO-1"),"shipment-not-ready");PickAll(l);
            Yes(l,l.Load("SO-1","C1","STAGE-01","DISPATCH-01"));No(l,()=>l.Ship("SO-1"),"shipment-not-ready");
            Yes(l,l.Load("SO-1","C2","STAGE-01","DISPATCH-01"));Yes(l,l.Load("SO-1","C3","STAGE-01","DISPATCH-02"));
            No(l,()=>l.Ship("SO-1"),"shipment-not-ready");
            Need(!l.CanShip("SO-1",out var reason) && reason.Contains("one collection vehicle"),"Split shipment did not explain its mismatch.");
        }
        static void ShipmentCommit(Wms l)
        {
            Released(l);PickAll(l);LoadAll(l);Need(l.CanShip("SO-1",out var reason),reason);Yes(l,l.Ship("SO-1"));
            var order=l.FindSales("SO-1");Need(l.OnHand()==0 && l.Reserved()==0 && l.BinUsed("DISPATCH-01")==0 && order.status==Wms.SalesStatus.Shipped && order.lines[0].shipped==3 && order.lines[0].picked==3 && order.lines[0].loaded==3 && order.lines[0].reserved==0,"Shipment did not reconcile physical units and history.");
            No(l,()=>l.Ship("SO-1"),"shipment-not-ready");No(l,()=>l.CancelSalesOrder("SO-1"),"closed-so");
            Need(l.Transactions.Count(value=>value.type=="SHIP")==3,"Repeated departure duplicated shipment history.");
        }
        static void CancelUnpicked(Wms l)
        {
            Released(l);Yes(l,l.CancelSalesOrder("SO-1"));
            Need(l.Available()==3 && l.Reserved()==0 && l.FindSales("SO-1").status==Wms.SalesStatus.Cancelled && l.Cartons.All(value=>value.salesOrderId==""),"Cancellation leaked reservation or removed stock.");
            No(l,()=>l.CancelSalesOrder("SO-1"),"closed-so");So(l,"SO-2");Yes(l,l.ReleaseSalesOrder("SO-2"));
        }
        static void CancelPicked(Wms l)
        {
            Released(l);Yes(l,l.Pick("SO-1","C1","A01","STAGE-01"));No(l,()=>l.CancelSalesOrder("SO-1"),"return-first");
            No(l,()=>l.ReturnPick("SO-1","C1","A01","A02"),"wrong-source");
            Yes(l,l.ReturnPick("SO-1","C1","STAGE-01","A02"));
            Need(l.FindSales("SO-1").status==Wms.SalesStatus.Released && l.Picked()==0 && l.Reserved()==3,"Return failed to restore the reservation stage.");
            Yes(l,l.CancelSalesOrder("SO-1"));Need(l.Available()==3,"Returned order could not release its stock.");
        }
        static void ReturnLoaded(Wms l)
        {
            Released(l);PickAll(l);LoadAll(l);
            No(l,()=>l.ReturnPick("SO-1","C1","DISPATCH-01","REC-01"),"wrong-destination");
            Yes(l,l.ReturnPick("SO-1","C1","DISPATCH-01","A02"));
            Need(l.OnHand()==3 && l.Loaded()==2 && l.Picked()==2 && l.FindCarton("C1").status==Wms.CartonStatus.Reserved,"Returning a loaded carton lost stock or progress.");
            No(l,()=>l.Ship("SO-1"),"shipment-not-ready");
        }
        static void CancelPurchase(Wms l)
        {
            Po(l);Yes(l,l.CancelPurchaseOrder("PO-1"));No(l,()=>l.CancelPurchaseOrder("PO-1"),"po-in-progress");
            No(l,()=>l.ExpectCarton("C1","TAPE","PO-1"),"closed-po");
            Po(l,"PO-2");Yes(l,l.ExpectCarton("C1","TAPE","PO-2"));No(l,()=>l.CancelPurchaseOrder("PO-2"),"po-in-progress");
        }
        static void BinActivation(Wms l)
        {
            No(l,()=>l.SetBinEnabled("A01",true),"unchanged-bin");Yes(l,l.SetBinEnabled("CLOSED",true));Stock(l,1,"TAPE","CLOSED");
            No(l,()=>l.SetBinEnabled("CLOSED",false),"occupied-bin");Yes(l,l.Transfer("C1","CLOSED","A01"));Yes(l,l.SetBinEnabled("CLOSED",false));
            Need(l.Transactions.Count(value=>value.type=="BIN_OPEN")==1 && l.Transactions.Count(value=>value.type=="BIN_CLOSE")==1,"Bin availability changes are not auditable.");
        }
        static void RepeatCycle(Wms l)
        {
            for(int cycle=1;cycle<=3;cycle++)
            {
                string po="PO-"+cycle,so="SO-"+cycle;Po(l,po,3);So(l,so,3);
                for(int i=0;i<3;i++){string id="REPEAT-"+cycle+"-"+i;Yes(l,l.ExpectCarton(id,"TAPE",po));Yes(l,l.Receive(po,id,"REC-01"));Yes(l,l.Transfer(id,"REC-01","A01"));}
                Yes(l,l.ReleaseSalesOrder(so));PickAll(l,so);LoadAll(l,so);Yes(l,l.Ship(so));
                Need(l.OnHand()==0 && l.Expected()==0 && l.CheckInvariants(out _),"A repeat cycle stranded inventory.");
            }
            Need(l.Cartons.Count==9 && l.PurchaseOrders.All(value=>value.status==Wms.PurchaseStatus.Received) && l.SalesOrders.All(value=>value.status==Wms.SalesStatus.Shipped),"Repeated stock history did not preserve completed orders.");
        }
        static void TransactionHistory(Wms l)
        {
            Released(l);PickAll(l);LoadAll(l);Yes(l,l.Ship("SO-1"));
            Need(l.Transactions.Select(value=>value.sequence).SequenceEqual(Enumerable.Range(1,l.Transactions.Count)),"Transaction IDs are not contiguous and ordered.");
            Need(l.Transactions.Where(value=>value.cartonId.Length>0).All(value=>value.quantity==1 && value.itemId=="TAPE"),"Handling-unit transactions changed their stock unit.");
            foreach(string id in new[]{"C1","C2","C3"})Need(l.Transactions.Where(value=>value.cartonId==id).Select(value=>value.type).SequenceEqual(new[]{"OPENING","ALLOCATE","PICK","LOAD","SHIP"}),"The audit route is incomplete for "+id);
        }
        static void ManyOrders(Wms l)
        {
            var random=new System.Random(9147);int total=0;
            for(int cycle=0;cycle<100;cycle++)
            {
                int tape=random.Next(1,4),towels=random.Next(0,3);string po="DAY-PO-"+cycle,so="DAY-SO-"+cycle;Po(l,po,tape,towels);So(l,so,tape,towels);
                foreach(var line in l.FindPurchase(po).lines)for(int i=0;i<line.ordered;i++)
                {string id="DAY-"+cycle+"-"+line.itemId+"-"+i;Yes(l,l.ExpectCarton(id,line.itemId,po));Yes(l,l.Receive(po,id,"REC-01"));Yes(l,l.Transfer(id,"REC-01",random.Next(2)==0?"A01":"A02"));total++;}
                Yes(l,l.ReleaseSalesOrder(so));
                var ids=l.FindSales(so).manifest.OrderBy(_=>random.Next()).ToArray();
                foreach(string id in ids){var c=l.FindCarton(id);Yes(l,l.Pick(so,id,c.binId,"STAGE-01"));Need(l.CheckInvariants(out var reason),reason);}
                foreach(string id in ids){Yes(l,l.Load(so,id,"STAGE-01","DISPATCH-01"));Need(l.CheckInvariants(out var reason),reason);}
                Yes(l,l.Ship(so));Need(l.OnHand()==0 && l.Reserved()==0 && l.Expected()==0 && l.CheckInvariants(out _),"Randomized order failed conservation.");
            }
            Need(l.Cartons.Count==total && l.Cartons.All(value=>value.status==Wms.CartonStatus.Shipped),"The mixed run lost a carton identity.");
        }
    }
}
