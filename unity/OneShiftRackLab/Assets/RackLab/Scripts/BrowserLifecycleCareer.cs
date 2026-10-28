using System;
using System.Linq;
using UnityEngine;
using UnityEngine.Scripting;

namespace OneShift.RackLab
{
    public sealed partial class BrowserLifecycle
    {
        ComputerState CareerComputerSnapshot()
        {
            var c=uiCareer;
            var result=new ComputerState{open=computerOpen,revision=uiRevision,mode="career",company="Latchford Distribution",title="Latchford Distribution",
                cash=c.Cash,completedOrders=c.CompletedOrders,message=c.Message,stage=c.Objective,stageDetail=c.ObjectiveDetail,suggestedTab=c.SuggestedTab,
                transitioning=ComputerTransitioning,transitionProgress=computerTransition!=null?computerTransition.Progress:0,
                transitionDirection=computerTransition!=null&&computerTransition.Returning?"out":"in",
                summary="Independent trade supplies / "+c.CompletedOrders+" orders delivered"};
            if(!computerOpen)return result;
            result.inventory=WarehouseCareer.Products.Select(p=>new InventoryRow{id=p.id,name=p.name,quantity=c.Available(p.id),
                unit="cartons"+(c.Inbound(p.id)>0?" / "+c.Inbound(p.id)+" awaiting putaway":"")}).Concat(new[]{
                    new InventoryRow{id="bulk",name="Workshop fasteners",quantity=c.BulkPallet!=null?1:0,unit=c.BulkStored?"pallet / stored":"pallet / putaway required"}}).ToArray();
            result.orders=WarehouseCareer.Products.Select(p=>{bool ready=c.CanPurchase(p.id,out var reason);return new OfferRow{id=p.id,name=p.name,price=p.price,detail=reason,action="Send purchase order",enabled=ready};})
                .Concat(new[]{BulkSupplier(c)}).ToArray();
            result.contracts=WarehouseCareer.Products.Select(p=>
            {
                bool ready=c.CanAccept(p.id,out var reason);
                bool active=c.ActiveOrder!=null&&!c.ActiveOrder.bulk&&c.ActiveOrder.productId==p.id;
                return new OfferRow{id=p.id,name=p.client,price=p.payment,detail=active?c.Courier.Status+" Load all "+p.cartons+" marked cartons. Payment follows departure.":reason,
                    action=active?"Collection booked":"Accept and book collection",status=active?"Accepted":ready?"Ready to supply":"Stock needed",enabled=ready};
            }).Concat(new[]{BulkCustomer(c)}).ToArray();
            result.upgrades=new[]{"racks","forklift","fish","flames"}.Select(id=>
            {
                bool ready=c.CanUpgrade(id,out var reason);
                return new OfferRow{id=id,name=id=="racks"?"Pallet racks":id=="forklift"?"Used forklift":id=="fish"?"Singing fish":"Forklift flame kit",
                    price=WarehouseCareer.UpgradePrice(id),detail=reason,enabled=ready,owned=c.Owns(id),action=c.Owns(id)?"Installed":"Buy and install",status=c.Owns(id)?"Owned":""};
            }).ToArray();
            result.ledger=c.Ledger.Skip(Math.Max(0,c.Ledger.Count-16)).Reverse().Select(e=>new LedgerRow{label=e.label,amount=e.amount}).ToArray();
            return result;
        }
        static OfferRow BulkSupplier(WarehouseCareer c)
        {bool ready=c.CanPurchaseBulk(out var reason);return new OfferRow{id="bulk",name="Workshop fasteners / pallet",price=480,detail=reason,action="Order pallet",enabled=ready};}
        static OfferRow BulkCustomer(WarehouseCareer c)
        {
            bool ready=c.CanAccept("bulk",out var reason);bool active=c.ActiveOrder!=null&&c.ActiveOrder.bulk;
            if(active)ready=!c.BulkShipping&&c.Receiving.CanDispatch(new[]{c.ActiveOrder.pallet},out reason);
            return new OfferRow{id=active?"dispatch-bulk":"bulk",name="Northline Trade Counter / pallet restock",price=840,enabled=ready,
                action=active?(c.BulkShipping?"Truck departing":"Dispatch loaded pallet"):"Accept pallet order",status=active?"Accepted":"Pallet handling",detail=reason};
        }

        [Serializable,Preserve] sealed class CareerDebug
        {
            public string mode,objective,courierState,courierStatus,activeOrder,grabReleaseReason;
            public int cash,completedOrders,purchased,received,shipped,activeForklifts,activeRackBays,holdingSequence,loadedCount;
            public bool conserves,holding,racks,forklift,fish,flames,deliveryPending,computerOpen,transitioning,dockTruckActive,loadingReady;
            public float transitionProgress,holdDistance;
            public float[] cameraPosition,cameraRotation,vanPosition;
            public LoadingSpot[] loadingSpots;
            public CareerBoxDebug[] boxes;
        }
        [Serializable,Preserve] sealed class CareerBoxDebug
        {public int sequence;public string product;public bool transit,received,stored,reserved;public float[] position,rotation,velocity;}
        [Serializable,Preserve] sealed class LoadingSpot { public float x,y,z; }
        [Preserve] public void ReportCareerState(string unused)
        {
            var c=uiCareer;var camera=uiWalking!=null?uiWalking.eyes:null;var grabber=uiWalking!=null?uiWalking.GetComponent<WarehouseGrabber>():null;
            Debug.Log("WAREHOUSE_CAREER "+JsonUtility.ToJson(new CareerDebug{mode=c!=null?"career":"sandbox",cash=c!=null?c.Cash:uiBusiness!=null?uiBusiness.Cash:0,
                completedOrders=c!=null?c.CompletedOrders:0,purchased=c!=null?c.PurchasedCartons:0,received=c!=null?c.ReceivedCartons:0,shipped=c!=null?c.ShippedCartons:0,
                conserves=c==null||c.ConservesStock,holding=grabber!=null&&grabber.IsHolding,holdDistance=grabber!=null?grabber.HoldDistance:0,
                grabReleaseReason=grabber!=null?grabber.LastReleaseReason:"",
                holdingSequence=grabber!=null&&grabber.HeldBody!=null&&grabber.HeldBody.TryGetComponent<WarehouseCareerBox>(out var held)?held.Sequence:0,
                activeForklifts=UnityEngine.Object.FindObjectsByType<ForkliftDriveController>(FindObjectsSortMode.None).Length,
                activeRackBays=UnityEngine.Object.FindObjectsByType<PalletRackBay>(FindObjectsSortMode.None).Length,
                dockTruckActive=uiReceiving!=null&&uiReceiving.truck!=null&&uiReceiving.truck.gameObject.activeInHierarchy,
                objective=c!=null?c.Objective:"",courierState=c!=null?c.Courier.State.ToString():"",courierStatus=c!=null?c.Courier.Status:"",
                activeOrder=c!=null&&c.ActiveOrder!=null?c.ActiveOrder.id:"",deliveryPending=c!=null&&c.PurchasePending,
                racks=c!=null&&c.RacksOwned,forklift=c!=null&&c.ForkliftOwned,fish=c!=null&&c.FishOwned,flames=c!=null&&c.FlamesOwned,
                computerOpen=computerOpen,transitioning=ComputerTransitioning,transitionProgress=computerTransition!=null?computerTransition.Progress:0,
                cameraPosition=camera!=null?V(camera.transform.position):null,cameraRotation=camera!=null?V(camera.transform.eulerAngles):null,
                vanPosition=c!=null?V(c.Courier.VanPosition):null,loadingReady=c!=null&&c.Courier.ReadyForLoading,
                loadedCount=c!=null?c.Courier.LoadedCount:0,
                loadingSpots=c!=null?Enumerable.Range(0,4).Select(i=>{var p=c.Courier.CargoPlacementPosition(i);return new LoadingSpot{x=p.x,y=p.y,z=p.z};}).ToArray():Array.Empty<LoadingSpot>(),
                boxes=c!=null?c.Boxes.Where(b=>b!=null&&!b.Shipped).Select(b=>new CareerBoxDebug{sequence=b.Sequence,product=b.ProductId,transit=b.InTransit,received=b.Received,stored=b.Stored,reserved=b.Reserved,position=V(b.transform.position),rotation=V(b.transform.eulerAngles),velocity=V(b.Body.linearVelocity)}).ToArray():Array.Empty<CareerBoxDebug>()}));
        }
        static float[] V(Vector3 v)=>new[]{v.x,v.y,v.z};
    }
}
