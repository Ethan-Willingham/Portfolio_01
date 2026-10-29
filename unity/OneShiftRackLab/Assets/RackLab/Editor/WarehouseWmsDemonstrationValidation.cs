using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using L=OneShift.RackLab.WarehouseWmsLedger;

namespace OneShift.RackLab
{
    public static class WarehouseWmsDemonstrationValidation
    {
        [Serializable] public sealed class Report
        {
            public string generatedUtc;
            public string scope="Three isolated customer scenarios using production runtime, physical support checks, ledger and courier. Scans are decoded-label fixture input; explicit fixture placement settles in real PhysX. This does not simulate native mouse controls or rendered guidance.";
            public bool passed;
            public List<string> checks=new List<string>();
            public string failure="";
        }
        [MenuItem("One Shift/Validate customer WMS demonstrations")]
        public static string ValidateAndSave()
        {
            var report=Run();string json=JsonUtility.ToJson(report,true);
            const string file="Assets/RackLab/Reports/warehouse-wms-demonstration-validation.json";
            File.WriteAllText(file,json+"\n");AssetDatabase.ImportAsset(file);return json;
        }
        public static Report Run()
        {
            var report=new Report{generatedUtc=DateTime.UtcNow.ToString("O")};
            try
            {
                if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play before isolated demonstration checks.");
                var source=UnityEngine.Object.FindFirstObjectByType<WarehouseReceiving>();
                Need(source!=null,"Open the installed warehouse scene first.");
                Receive(report,source);Transfer(report,source);PickShip(report,source);report.passed=true;
            }
            catch(Exception error){report.failure=error.ToString();report.passed=false;}
            return report;
        }
        static void Check(Report report,bool value,string name){Need(value,name);report.checks.Add(name);}
        static void Need(bool value,string reason){if(!value)throw new InvalidOperationException(reason);}
        static void Conserves(Report report,WarehouseWmsRuntime w,string name)
        {Check(report,w.Ledger.CheckInvariants(out var reason),name+": "+reason);}

        static void Receive(Report report,WarehouseReceiving source)
        {
            using(var f=new WarehouseWmsRuntimeValidation.Fixture(source,true,"receive"))
            {
                var w=f.Runtime;f.PhysicsOnly(1);
                Check(report,w.Capture().mode=="demo"&&w.DemonstrationId=="receive"&&w.Ledger.OnHand()==0&&w.Ledger.Expected()==2&&w.Bodies.Count==2&&!w.ForkliftOwned,"Receiving opens with exactly two unreceived cartons and no automatic receipt");
                int revision=w.Ledger.Revision;for(int i=0;i<5;i++)w.CaptureDemonstration();
                Check(report,w.Ledger.Revision==revision&&w.CaptureDemonstration().completed==0,"Reading demonstration guidance does not mutate stock or grant progress");
                Check(report,!w.CreatePurchase("tape:1")&&!w.CreateSales("tape:1")&&!w.CanBook("PO-1001",out _)&&!w.CanUpgrade("fish",out _),"Prepared demonstrations protect their documents and equipment from unrelated manager mutations");
                w.ResetWorkflow("lookup");Check(report,w.CaptureDemonstration().step=="open-task","A wrong handheld tile recovers with the correct task instruction");
                Need(w.ChooseOrder("receive","PO-1001"),w.Message);
                var guide=w.CaptureDemonstration();
                Check(report,guide.targetCode=="BIN:REC-02"&&guide.targetVisible&&guide.targetPosition.Length==3&&guide.targetViewport.Length==3,"Location guidance exposes a real physical label and camera projection");
                Need(w.AcceptScan("BIN:REC-02"),w.Message);
                var ids=w.Ledger.Cartons.Select(c=>c.id).ToArray();
                Need(w.AcceptScan("CARTON:"+ids[0])&&w.Confirm(),w.Message);
                Check(report,w.CaptureDemonstration().received==1&&!w.CaptureDemonstration().complete&&!w.Confirm(),"One receipt advances exactly one carton and duplicate confirmation is rejected");
                Need(w.AcceptScan("CARTON:"+ids[1])&&w.Confirm(),w.Message);
                Check(report,w.CaptureDemonstration().phase=="Putaway"&&w.Ledger.InReceiving()==2&&w.CaptureDemonstration().completed==2,"Received stock still requires guided physical putaway");
                for(int i=0;i<ids.Length;i++)
                {
                    string destination=i==0?"C03-01-01":"C03-01-02";
                    w.ResetWorkflow("transfer");Need(w.AcceptScan("BIN:REC-02")&&w.AcceptScan("CARTON:"+ids[i])&&w.AcceptScan("BIN:"+destination),w.Message);
                    Need(!w.Confirm(),"A putaway confirmed before the carton moved.");f.Place(ids[i],destination,0);Need(w.Confirm(),w.Message);
                }
                guide=w.CaptureDemonstration();
                Check(report,guide.complete&&guide.received==2&&guide.transferred==2&&guide.completed==4&&w.Ledger.Available()==2&&w.Cash==0,"Receiving finishes only after both real cartons are received and supported in their assigned storage bins");
                Conserves(report,w,"Receiving and putaway conserve all cartons");
            }
        }
        static void Transfer(Report report,WarehouseReceiving source)
        {
            using(var f=new WarehouseWmsRuntimeValidation.Fixture(source,true,"transfer"))
            {
                var w=f.Runtime;f.PhysicsOnly(1);string id=w.Ledger.Cartons.Single().id;
                Check(report,w.Ledger.OnHand()==1&&w.Ledger.Expected()==0&&w.Ledger.PurchaseOrders.Count==0&&w.Ledger.SalesOrders.Count==0&&w.CaptureDemonstration().step=="open-task","Transfer starts with one available carton and an uncluttered document list");
                w.ResetWorkflow("transfer");Need(w.AcceptScan("BIN:C01-01-01")&&w.AcceptScan("CARTON:"+id)&&w.AcceptScan("BIN:F01"),w.Message);
                f.Place(id,"F01",0);Need(w.Confirm(),w.Message);
                var guide=w.CaptureDemonstration();
                Check(report,!guide.complete&&guide.sourceBin=="F01"&&guide.destinationBin=="C01-01-02","A different valid transfer does not falsely complete the demo and guidance follows the new recorded source");
                Need(w.AcceptScan("BIN:F01")&&w.AcceptScan("CARTON:"+id)&&w.AcceptScan("BIN:C01-01-02"),w.Message);
                Need(!w.Confirm(),"The demonstrated transfer ignored physical placement.");f.Place(id,"C01-01-02",0);Need(w.Confirm(),w.Message);
                guide=w.CaptureDemonstration();
                Check(report,guide.complete&&guide.transferred==1&&w.Ledger.OnHand()==1&&w.Ledger.Transactions.Count(t=>t.type=="TRANSFER")==2,"The corrected transfer records both real moves, completes the guide and preserves stock quantity");
                Conserves(report,w,"Transfers conserve stock after correction");
            }
        }
        static void PickShip(Report report,WarehouseReceiving source)
        {
            using(var f=new WarehouseWmsRuntimeValidation.Fixture(source,true,"pick-ship"))
            {
                var w=f.Runtime;f.PhysicsOnly(1);var order=w.Ledger.FindSales("SO-2001");string id=order.manifest.Single();
                Check(report,w.Ledger.OnHand()==1&&w.Ledger.Reserved()==1&&!w.Courier.Busy&&!w.CancelOrder(order.id)&&w.CaptureDemonstration().phase=="Picking","Picking opens with one prepared allocation and no free shipment progress");
                Need(w.ChooseOrder("pick",order.id)&&w.AcceptScan("BIN:C03-01-01")&&w.AcceptScan("CARTON:"+id)&&w.AcceptScan("BIN:STAGE-01"),w.Message);
                Need(!w.Confirm(),"A demonstration pick bypassed physical staging.");f.Place(id,"STAGE-01",0);Need(w.Confirm(),w.Message);
                Check(report,w.CaptureDemonstration().picked==1&&w.CaptureDemonstration().completed==1&&w.Courier.Busy&&w.Cash==0,"A confirmed physical pick books the actual carrier without shipping or paying");
                f.Until(()=>w.Courier.ReadyForLoading,100,"demonstration collection arrival");f.Away();
                Need(w.ChooseOrder("ship",order.id)&&w.AcceptScan("BIN:STAGE-01")&&w.AcceptScan("CARTON:"+id)&&w.AcceptScan("BIN:DISPATCH-01"),w.Message);
                Need(!w.Confirm(),"A demonstration load bypassed the van deck.");f.PlaceOnVan(id,0);Need(w.Confirm(),w.Message);
                Check(report,w.CaptureDemonstration().loaded==1&&w.CaptureDemonstration().completed==2&&!w.CaptureDemonstration().complete&&w.Cash==0,"The loaded manifest remains on hand and the demonstration stays incomplete before departure");
                f.Away();Need(w.ReadyToConfirm(out var reason),reason);Need(w.Confirm(),w.Message);
                f.Until(()=>w.Courier.State==WarehouseCourierService.VisitState.DrivingOut,80,"demonstration drive out");
                Check(report,!w.CaptureDemonstration().complete&&w.Cash==0,"Closing doors and driving out do not prematurely finish the customer demonstration");
                f.Until(()=>!w.Courier.Busy,80,"demonstration offsite shipment");var guide=w.CaptureDemonstration();
                Check(report,guide.complete&&guide.shipped==1&&guide.completed==3&&w.Ledger.OnHand()==0&&w.Cash==70&&w.CompletedOrders==1&&w.Bodies.Count==0,"Only actual offsite departure completes picking and shipping and posts one customer payment");
                Conserves(report,w,"The completed customer shipment conserves all stock and allocation quantities");
            }
        }
    }
}
