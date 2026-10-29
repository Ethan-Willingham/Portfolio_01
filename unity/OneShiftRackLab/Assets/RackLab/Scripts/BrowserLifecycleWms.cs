using System;
using System.Linq;
using UnityEngine;
using UnityEngine.Scripting;

namespace OneShift.RackLab
{
    public sealed partial class BrowserLifecycle
    {
        WarehouseWmsRuntime uiWms;
        bool deviceInteractive;
        void WmsChanged(){uiRevision++;PublishHUD();}
        bool WmsCommand(UIRequest request)
        {
            if(uiWms==null||request.action==null)return false;
            if(request.action=="device-trigger")
            {uiWms.Scanner.SetTriggerHeld(request.id=="1");return true;}
            if(request.action=="device-equip")
            {uiWms.SetDevice(request.id=="1");PublishHUD();return true;}
            if(request.action=="device-focus")
            {
                deviceInteractive=request.id=="1";uiWms.Scanner.SetInspecting(deviceInteractive);ApplyState();
                if(!deviceInteractive&&!suspended)uiWalking?.ResumeControlsFromUI();PublishHUD();return true;
            }
            if(!request.action.StartsWith("wms-"))return false;
            string action=request.action.Substring(4);
            bool manager=action=="release-order"||action=="cancel-order"||action=="book-po"||action=="create-po"||action=="create-so";
            if(manager&&!computerOpen){uiWms.Notice("Use the office manager console for this action.",false);return true;}
            if(action!="scan"&&!manager&&!deviceInteractive&&!computerOpen&&!uiWms.Scanner.Equipped){uiWms.Notice("Open the TC22 first.",false);return true;}
            uiWms.Command(action,request.id);PublishHUD();return true;
        }
        ComputerState WmsComputerSnapshot()
        {
            var w=uiWms;
            var state=new ComputerState{open=computerOpen,revision=uiRevision+w.Revision+w.Ledger.Revision,mode=w.DemonstrationActive?"demo":w.Sandbox?"sandbox":"career",company="Latchford Distribution",title="Business office",
                cash=w.Cash,completedOrders=w.CompletedOrders,message=w.Message,stage=w.Objective,stageDetail=w.ObjectiveDetail,suggestedTab="overview",
                transitioning=ComputerTransitioning,transitionProgress=computerTransition!=null?computerTransition.Progress:0,transitionDirection=computerTransition!=null&&computerTransition.Returning?"out":"in",
                summary="Warehouse management / whole-carton distribution"};
            if(!computerOpen)return state;
            state.inventory=w.Ledger.Items.Select(i=>new InventoryRow{id=i.id,name=i.name,quantity=w.Ledger.Available(i.id),unit="CTN available"}).ToArray();
            state.orders=w.Ledger.PurchaseOrders.Where(p=>p.status!=WarehouseWmsLedger.PurchaseStatus.Received&&p.status!=WarehouseWmsLedger.PurchaseStatus.Cancelled).Select(p=>
                {bool enabled=w.CanBook(p.id,out var reason);return new OfferRow{id=p.id,name=p.id+" / "+p.supplier,price=p.lines.Sum(l=>l.ordered*WarehouseWmsRuntime.Cost(l.itemId)),detail=reason,action="Book delivery",enabled=enabled};}).ToArray();
            state.contracts=w.Ledger.SalesOrders.Where(o=>o.status!=WarehouseWmsLedger.SalesStatus.Shipped&&o.status!=WarehouseWmsLedger.SalesStatus.Cancelled).Select(o=>
                {bool enabled=w.CanRelease(o.id,out var reason);return new OfferRow{id=o.id,name=o.id+" / "+o.customer,price=o.lines.Sum(l=>l.ordered*WarehouseWmsRuntime.Price(l.itemId)),detail=reason,action="Release to picking",status=o.status.ToString(),enabled=enabled};}).ToArray();
            state.upgrades=new[]{"racks","forklift","fish","flames"}.Select(id=>
                {bool enabled=w.CanUpgrade(id,out var reason);return new OfferRow{id=id,name=id=="racks"?"Storage racks":id=="forklift"?"Used forklift":id=="fish"?"Singing fish":"Forklift flame kit",
                    price=WarehouseCareer.UpgradePrice(id),detail=reason,action=w.Owns(id)?"Installed":"Buy and install",owned=w.Owns(id),enabled=enabled};}).ToArray();
            state.ledger=w.Finance.Reverse().Take(30).Select(e=>new LedgerRow{label=e.label,amount=e.amount}).ToArray();return state;
        }
        [Serializable] sealed class WmsDebug
        {
            public WarehouseWmsRuntime.Snapshot state;
            public bool conserves;
            public string invariantReason,courierState,courierStatus,heldCarton;
            public WmsBodyDebug[] bodies;
            public WmsBinDebug[] bins;
            public WmsLabelDebug[] labels;
            public float[] cameraPosition,cameraRotation;
            public float holdDistance;
            public bool scannerTrigger,scannerAimVisible,scannerAimSurface;
            public float[] scannerAimPoint,scannerEmitter,scannerDirection;
        }
        [Serializable] sealed class WmsBodyDebug {public string id;public float[] position,rotation,velocity,size;public bool kinematic;}
        [Serializable] sealed class WmsBinDebug {public string id;public float[] center,size;public float surfaceY;}
        [Serializable] sealed class WmsLabelDebug {public string code,kind,id;public float[] point,normal;}
        [Preserve] public void ReportWmsState(string unused)
        {
            if(uiWms==null)return;bool valid=uiWms.Ledger.CheckInvariants(out var reason);
            var held=uiWalking.GetComponent<WarehouseGrabber>()?.HeldBody;
            string json=JsonUtility.ToJson(new WmsDebug{state=uiWms.Capture(),conserves=valid,invariantReason=reason,courierState=uiWms.Courier.State.ToString(),courierStatus=uiWms.Courier.Status,
                scannerTrigger=uiWms.Scanner.TriggerHeld,scannerAimVisible=uiWms.Scanner.AimVisible,scannerAimSurface=uiWms.Scanner.AimHasSurface,
                scannerAimPoint=V(uiWms.Scanner.AimPoint),scannerEmitter=V(uiWms.Scanner.EmitterPosition),scannerDirection=V(uiWms.Scanner.EmitterDirection),
                cameraPosition=V(uiWalking.eyes.transform.position),cameraRotation=V(uiWalking.eyes.transform.eulerAngles),holdDistance=uiWalking.GetComponent<WarehouseGrabber>().HoldDistance,
                heldCarton=held!=null?held.GetComponent<WarehouseWmsCarton>()?.Id:"",bodies=uiWms.Bodies.Where(p=>p.Value!=null).Select(p=>new WmsBodyDebug{id=p.Key,position=V(p.Value.position),rotation=V(p.Value.rotation.eulerAngles),velocity=V(p.Value.linearVelocity),size=V(p.Value.GetComponent<Collider>().bounds.size),kinematic=p.Value.isKinematic}).ToArray(),
                bins=uiWms.World.Bins.Select(b=>new WmsBinDebug{id=b.Id,center=V(b.Center),size=V(b.Volume.size),surfaceY=b.SurfaceY}).ToArray(),
                labels=UnityEngine.Object.FindObjectsByType<WarehouseWmsLabel>(FindObjectsSortMode.None).Select(l=>new WmsLabelDebug{code=l.Code,kind=l.Kind,id=l.Id,point=V(l.ScanPoint),normal=V(l.Normal)}).ToArray()});
            // WebGL's log buffer truncates long lines. Keep this read-only
            // diagnostic complete without adding a gameplay command channel.
            const int chunkSize=4000;
            int chunks=(json.Length+chunkSize-1)/chunkSize;
            for(int i=0;i<chunks;i++)Debug.Log("WAREHOUSE_WMS_PART "+i+"/"+chunks+" "+json.Substring(i*chunkSize,Math.Min(chunkSize,json.Length-i*chunkSize)));
        }
    }
}
