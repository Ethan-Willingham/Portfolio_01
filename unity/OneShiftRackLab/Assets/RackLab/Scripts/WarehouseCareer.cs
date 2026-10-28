using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace OneShift.RackLab
{
    // A small trade distributor. A purchase creates identified physical stock;
    // customer payment requires that same stock to leave with the carrier.
    public sealed class WarehouseCareer : MonoBehaviour
    {
        [Serializable] public sealed class Product
        {
            public string id, name, contents, client;
            public int cartons, price, payment;
            public Vector3 bay;
            public Product(string id, string name, string contents, string client, int cartons, int price, int payment, float x)
            { this.id=id; this.name=name; this.contents=contents; this.client=client; this.cartons=cartons; this.price=price; this.payment=payment; bay=new Vector3(x,.012f,-1.8f); }
        }
        [Serializable] public sealed class Order
        {
            public string id, client, productId;
            public int quantity, payment;
            public bool complete, bulk;
            public WarehouseCareerBox[] manifest;
            public PalletCargo pallet;
        }
        public static readonly Product[] Products = {
            new Product("tape","Packing tape","36 rolls per carton","Miller Motor Works",3,120,210,-3.6f),
            new Product("towels","Shop towels","12 packs per carton","Parkside Service",4,160,280,-.8f),
            new Product("gloves","Work gloves","24 pairs per carton","Northline Trade Counter",3,180,315,2f)
        };
        public const int Capacity = 24;
        public int Cash { get; private set; } = 600;
        public int CompletedOrders { get; private set; }
        public int PurchasedCartons { get; private set; }
        public int ShippedCartons { get; private set; }
        public int ReceivedCartons { get; private set; }
        public bool RacksOwned { get; private set; }
        public bool ForkliftOwned { get; private set; }
        public bool FishOwned { get; private set; }
        public bool FlamesOwned { get; private set; }
        public bool PurchasePending { get; private set; }
        public bool BulkPending { get; private set; }
        public bool BulkStored { get; private set; }
        public bool BulkShipping { get; private set; }
        public int BulkPurchased { get; private set; }
        public int BulkShipped { get; private set; }
        public PalletCargo BulkPallet { get; private set; }
        public Order ActiveOrder { get; private set; }
        public string Message { get; private set; } = "The lease is paid. Start with a small packing-tape purchase order.";
        public IReadOnlyList<WarehouseCareerBox> Boxes => boxes;
        public IReadOnlyList<WarehouseBusiness.LedgerEntry> Ledger => ledger;
        public WarehouseCourierService Courier { get; private set; }
        public WarehouseReceiving Receiving { get; private set; }
        public event Action Changed;
        public bool ConservesStock => PurchasedCartons == ShippedCartons + boxes.Count(b=>b!=null&&!b.Shipped)
            && BulkPurchased == BulkShipped + (BulkPallet != null ? 1 : 0) + (BulkPending ? 1 : 0);
        readonly List<WarehouseCareerBox> boxes = new List<WarehouseCareerBox>();
        readonly List<WarehouseBusiness.LedgerEntry> ledger = new List<WarehouseBusiness.LedgerEntry>();
        readonly List<LineRenderer> bayLines = new List<LineRenderer>();
        readonly RaycastHit[] supportHits = new RaycastHit[12];
        GameObject racks, rackSign, forklift;
        WarehouseGrabber grabber;
        Material cardboard, tape, label, ink, bayMaterial;
        int nextBox=1, nextOrder=1;
        float checkTimer;
        bool initialized;
        PhysicsScene physicsScene;

        public static WarehouseCareer Ensure()
        {
            var value = UnityEngine.Object.FindFirstObjectByType<WarehouseCareer>();
            if(value==null)value=new GameObject("Latchford Distribution career").AddComponent<WarehouseCareer>();
            value.Initialize(); return value;
        }

        public void Initialize(WarehouseReceiving receiving = null, RackWalkController walking = null,
            WarehouseCourierService courier = null, GameObject storage = null, GameObject vehicleObject = null)
        {
            if(initialized)return;
            Receiving=receiving != null ? receiving : FindLocal<WarehouseReceiving>();
            if(Receiving==null)throw new InvalidOperationException("The career needs the authored receiving warehouse.");
            initialized=true;
            physicsScene=gameObject.scene.GetPhysicsScene();
            Receiving.StartEmpty=true;
            foreach(var cargo in Receiving.cargo) if(cargo!=null){cargo.gameObject.SetActive(false);Remove(cargo.gameObject);}
            Receiving.cargo=Array.Empty<PalletCargo>();
            racks=storage != null ? storage : FindNamed("Starting wall racks"); if(racks!=null)racks.SetActive(false);
            rackSign=FindNamed("STORAGE / A01 - A03");if(rackSign!=null)rackSign.SetActive(false);
            var vehicle=FindLocal<ForkliftDriveController>();
            forklift=vehicleObject != null ? vehicleObject : vehicle != null ? vehicle.gameObject : null;
            if(forklift!=null)forklift.SetActive(false);
            var parcels=FindLocal<WarehouseParcelService>();
            if(parcels!=null)
            {
                parcels.enabled=false;
                foreach(var parcel in parcels.parcels)if(parcel!=null)parcel.gameObject.SetActive(false);
            }
            var decorativeVan=FindNamed("Decorative parcel van");if(decorativeVan!=null)decorativeVan.SetActive(false);
            walking=walking != null ? walking : FindLocal<RackWalkController>();
            if(walking==null)throw new InvalidOperationException("The career needs a walking player in its scene.");
            walking.SetSpawnPose(new Vector3(0,.025f,1),Quaternion.Euler(0,145,0));
            grabber=walking.GetComponent<WarehouseGrabber>();
            if(grabber==null)grabber=walking.gameObject.AddComponent<WarehouseGrabber>();
            grabber.Bind(walking);
            Courier=courier != null ? courier : WarehouseCourierService.Ensure();
            ledger.Add(new WarehouseBusiness.LedgerEntry("Opening working capital",Cash));
            cardboard=Material("Trade cartons",new Color(.55f,.36f,.20f));
            tape=Material("Packing tape",new Color(.70f,.54f,.32f));
            label=Material("Carton label",new Color(.83f,.79f,.67f));
            ink=Material("Carton ink",new Color(.19f,.25f,.22f));
            bayMaterial=Material("Floor guide",new Color(.81f,.65f,.36f),true);
            foreach(var product in Products) CreateBay(product);
        }

        void Update()
        {
            if(!initialized||Time.timeScale<=0||BrowserLifecycle.GraphicsPreparing)return;
            checkTimer+=Time.deltaTime;if(checkTimer<.15f)return;
            float elapsed=checkTimer;checkTimer=0;
            TickStock(elapsed);
        }

        public void TickStock(float elapsed)
        {
            bool changed=false;
            foreach(var box in boxes)
            {
                if(box==null||box.Shipped||box.InTransit)continue;
                var product=FindProduct(box.ProductId);
                Vector3 offset=box.transform.position-product.bay;
                bool supported=Mathf.Abs(offset.x)<.87f&&Mathf.Abs(offset.z)<.87f&&offset.y>.12f&&offset.y<1.6f
                    &&!box.Body.isKinematic&&Supported(box)
                    &&box.Body.linearVelocity.sqrMagnitude<.0225f&&box.Body.angularVelocity.sqrMagnitude<.09f
                    &&(grabber==null||grabber.HeldBody!=box.Body);
                box.SettledSeconds=supported?box.SettledSeconds+elapsed:0;
                bool stored=box.SettledSeconds>=.45f;
                if(stored!=box.Stored){box.Stored=stored;changed=true;}
                if(stored&&!box.Received)
                {
                    box.Received=true;ReceivedCartons++;changed=true;
                    int available=Available(product.id);
                    Message=available>=product.cartons?"Stock checked in. The customer order is ready at the computer.":
                        available+" of "+product.cartons+" "+product.name.ToLowerInvariant()+" cartons checked in. Bring the rest to this bay.";
                }
            }
            if(BulkPallet!=null&&!BulkStored&&Receiving.StoredCount>0&&Receiving.cargo.Contains(BulkPallet))
            {BulkStored=true;changed=true;Message="Pallet stored. The trade-counter replenishment order is ready.";}
            for(int i=0;i<Products.Length;i++)
            {
                bool relevant=boxes.Any(b=>b!=null&&!b.Shipped&&b.ProductId==Products[i].id&&!b.Stored&&!b.Reserved);
                bayLines[i].enabled=relevant;
            }
            if(changed)Changed?.Invoke();
        }

        bool Supported(WarehouseCareerBox box)
        {
            var bounds=box.GetComponent<BoxCollider>().bounds;
            int count=physicsScene.Raycast(new Vector3(bounds.center.x,bounds.min.y+.035f,bounds.center.z),Vector3.down,supportHits,.09f,~0,QueryTriggerInteraction.Ignore);
            for(int i=0;i<count;i++)
            {
                var hit=supportHits[i].collider;
                if(hit==null||hit.attachedRigidbody==box.Body)continue;
                var held=hit.GetComponentInParent<WarehouseGrabbable>();
                if(held!=null&&held.Holder!=null)continue;
                if(hit.GetComponentInParent<ForkliftDriveController>()!=null||hit.GetComponentInParent<RackWalkController>()!=null)continue;
                return true;
            }
            return false;
        }

        public static Product FindProduct(string id)=>Array.Find(Products,p=>p.id==id);
        public int Available(string id)=>boxes.Count(b=>b!=null&&b.ProductId==id&&b.Received&&!b.Reserved&&!b.Shipped&&InsideWarehouse(b.transform.position));
        public int Stored(string id)=>boxes.Count(b=>b!=null&&b.ProductId==id&&b.Stored&&!b.Shipped);
        public int Inbound(string id)=>boxes.Count(b=>b!=null&&b.ProductId==id&&!b.Received&&!b.Shipped);
        static bool InsideWarehouse(Vector3 p)=>p.x>-11.3f&&p.x<11.3f&&p.z>-9.8f&&p.z<11.4f&&p.y>-.1f&&p.y<5;

        public bool CanPurchase(string id,out string reason)
        {
            var product=FindProduct(id);
            if(product==null){reason="This supplier offer is unavailable.";return false;}
            if(CompletedOrders==0&&id!="tape"){reason="Finish Miller Motor Works' first order to open this supplier.";return false;}
            if(PurchasePending||Courier.Busy){reason="Wait for the current van visit to finish.";return false;}
            if(boxes.Any(b=>b!=null&&!b.Shipped&&!b.Received)){reason="Put the previous delivery into its marked bay before ordering again.";return false;}
            if(ActiveOrder!=null){reason="Finish the booked collection before ordering another batch.";return false;}
            if(boxes.Count(b=>b!=null&&!b.Shipped)+product.cartons>Capacity){reason="Ship existing stock to clear floor space.";return false;}
            if(Cash<product.price){reason="Not enough working cash for this purchase order.";return false;}
            reason=product.cartons+" cartons / "+product.contents+". Driver delivers to the front porch.";return true;
        }

        public bool Purchase(string id)
        {
            if(id=="bulk")return PurchaseBulk();
            if(!CanPurchase(id,out var reason))return Notice(reason,false);
            var product=FindProduct(id);
            var delivery=new WarehouseCareerBox[product.cartons];
            for(int i=0;i<delivery.Length;i++)delivery[i]=CreateBox(product,Courier.DeliverySpawnPosition(i));
            bool queued=Courier.BeginDelivery(delivery.Select(b=>b.Body).ToArray(),()=>
            {PurchasePending=false;Notice("Delivery signed for. Carry the cartons into the highlighted "+product.name.ToLowerInvariant()+" bay.",true);},
                body=>{var box=body.GetComponent<WarehouseCareerBox>();if(box!=null)box.InTransit=false;});
            if(!queued)
            {foreach(var box in delivery){boxes.Remove(box);Remove(box.gameObject);}return Notice("The carrier cannot book this visit yet.",false);}
            PurchasePending=true;PurchasedCartons+=delivery.Length;Cash-=product.price;
            ledger.Add(new WarehouseBusiness.LedgerEntry("Purchase order / "+product.name,-product.price));
            return Notice("Purchase order sent. Close the computer and meet the delivery at the front door.",true);
        }

        public bool CanAccept(string id,out string reason)
        {
            if(id=="bulk")
            {
                if(ActiveOrder!=null){reason="Finish your current collection first.";return false;}
                if(!BulkStored||BulkPallet==null){reason="Receive and put away a pallet in the purchased racks first.";return false;}
                reason="One stored pallet / 12 cartons. Load the north-dock trailer with the forklift.";return true;
            }
            var p=FindProduct(id);
            if(p==null){reason="Customer order unavailable.";return false;}
            if(ActiveOrder!=null){reason="The current collection is already booked.";return false;}
            if(PurchasePending||Courier.Busy){reason="Let the delivery driver finish the current visit.";return false;}
            if(Available(id)<p.cartons){reason="Receive "+p.cartons+" cartons in the highlighted "+p.name.ToLowerInvariant()+" bay first.";return false;}
            reason=p.cartons+" cartons / "+p.name+". Collection van booked when accepted.";return true;
        }

        public bool Accept(string id)
        {
            if(id=="dispatch-bulk")return DispatchBulk();
            if(!CanAccept(id,out var reason))return Notice(reason,false);
            if(id=="bulk")
            {
                ActiveOrder=new Order{id="bulk-"+nextOrder++,client="Northline Trade Counter",productId="bulk",quantity=12,payment=840,bulk=true,pallet=BulkPallet};
                Receiving.RequestPickup();return Notice("Trade-counter order accepted. Load your stored pallet into the north-dock trailer, then dispatch from the computer.",true);
            }
            var p=FindProduct(id);
            var manifest=boxes.Where(b=>b!=null&&b.ProductId==id&&b.Received&&!b.Reserved&&!b.Shipped&&InsideWarehouse(b.transform.position))
                .OrderBy(b=>b.Sequence).Take(p.cartons).ToArray();
            var order=new Order{id="LD-"+(nextOrder++).ToString("000"),client=p.client,productId=id,quantity=p.cartons,payment=p.payment,manifest=manifest};
            if(!Courier.BeginCollection(manifest.Select(b=>b.Body).ToArray(),()=>CompleteOrder(order),()=>grabber!=null&&grabber.IsHolding))
                return Notice("The collection van cannot be booked yet.",false);
            foreach(var box in manifest){box.Reserved=true;if(box.OrderOutline!=null)box.OrderOutline.enabled=true;}
            ActiveOrder=order;
            return Notice("Collection booked for "+p.client+". Carry the marked cartons into the van after its doors open.",true);
        }

        void CompleteOrder(Order order)
        {
            if(order.complete)return;
            order.complete=true;
            if(order.bulk){BulkShipped++;BulkPallet=null;BulkStored=false;BulkShipping=false;}
            else foreach(var box in order.manifest)
            {if(box==null||box.Shipped)continue;box.Shipped=true;ShippedCartons++;Remove(box.gameObject);}
            Cash+=order.payment;CompletedOrders++;
            ledger.Add(new WarehouseBusiness.LedgerEntry("Paid / "+order.client,order.payment));
            ActiveOrder=null;
            Notice("Order complete. "+order.client+" paid $"+order.payment+". Your next purchase order is ready.",true);
        }

        public bool CanPurchaseBulk(out string reason)
        {
            if(!RacksOwned||!ForkliftOwned){reason="Buy racks and a forklift before receiving a 450 kg pallet.";return false;}
            if(BulkPending||BulkPallet!=null){reason="Ship the current pallet before ordering another.";return false;}
            if(ActiveOrder!=null){reason="Finish the current customer order first.";return false;}
            if(Cash<480){reason="Keep trading cartons until you have $480 for a pallet.";return false;}
            reason="12 cases of workshop fasteners / 450 kg. Road delivery to the north dock. Rack putaway required.";return true;
        }
        bool PurchaseBulk()
        {
            if(!CanPurchaseBulk(out var reason))return Notice(reason,false);
            if(!Receiving.RequestDelivery(1,(cargo,index)=>{cargo.description="Workshop fasteners / 12 cases";BulkPallet=cargo;BulkPending=false;Changed?.Invoke();}))return Notice("The north dock already has a delivery booked.",false);
            BulkPending=true;BulkPurchased++;Cash-=480;
            ledger.Add(new WarehouseBusiness.LedgerEntry("Purchase order / workshop fasteners",-480));
            return Notice("Pallet purchase booked. Use the forklift to unload it and store it in the wall racks.",true);
        }
        bool DispatchBulk()
        {
            var order=ActiveOrder;
            if(order==null||!order.bulk||BulkShipping)return Notice("No pallet order ready for dispatch.",false);
            if(!Receiving.CanDispatch(new[]{order.pallet},out var reason))return Notice(reason,false);
            if(!Receiving.TryDispatch(new[]{order.pallet},()=>CompleteOrder(order)))return Notice("Clear the dock before dispatch.",false);
            BulkShipping=true;return Notice("Pallet loaded. Payment arrives when the truck leaves the park.",true);
        }

        public bool Owns(string id)=>id=="racks"?RacksOwned:id=="forklift"?ForkliftOwned:id=="fish"?FishOwned:id=="flames"&&FlamesOwned;
        public static int UpgradePrice(string id)=>id=="racks"?300:id=="forklift"?650:id=="fish"?95:id=="flames"?65:0;
        public bool CanUpgrade(string id,out string reason)
        {
            int price=UpgradePrice(id);
            if(price==0){reason="Upgrade unavailable.";return false;}
            if(Owns(id)){reason="Already installed.";return false;}
            if((id=="racks"&&racks==null)||(id=="forklift"&&forklift==null)){reason="This equipment cannot be installed in the current warehouse.";return false;}
            if((id=="racks"||id=="forklift")&&CompletedOrders<3){reason="Complete three customer orders to expand into pallet handling.";return false;}
            if(id=="fish"&&CompletedOrders<1){reason="A reward after your first completed customer order.";return false;}
            if(id=="flames"&&!ForkliftOwned){reason="Buy the forklift before fitting its flame kit.";return false;}
            if(Cash-price<120){reason="Keep $120 available for your next carton purchase.";return false;}
            reason=id=="racks"?"Three bays / 18 pallet positions. Opens pallet storage.":id=="forklift"?"Used counterbalance forklift. Required for 450 kg pallets. Practical training included.":
                id=="fish"?"A wall-mounted singing fish with its own original tune. Press E to play.":"Painted flames for the forklift. Same engine, much more confidence.";return true;
        }
        public bool Upgrade(string id)
        {
            if(!CanUpgrade(id,out var reason))return Notice(reason,false);
            Cash-=UpgradePrice(id);
            if(id=="racks"){RacksOwned=true;racks.SetActive(true);if(rackSign!=null)rackSign.SetActive(true);}
            else if(id=="forklift"){ForkliftOwned=true;forklift.SetActive(true);}
            else if(id=="fish"){FishOwned=true;WarehouseCareerDecor.InstallFish(transform);}
            else if(id=="flames"){FlamesOwned=true;WarehouseCareerDecor.InstallFlames(forklift.transform);}
            ledger.Add(new WarehouseBusiness.LedgerEntry("Equipment / "+id,-UpgradePrice(id)));
            return Notice(id=="fish"?"The fish is mounted in the office. Give it a try.":id=="flames"?"Flames fitted. They add character, not horsepower.":"Your "+id+" is installed. Keep some working cash for stock.",true);
        }

        public string Objective => ActiveOrder!=null?ActiveOrder.bulk?(BulkShipping?"Shipment on the road":"Load the pallet order"):(Courier.CollectionDeparting?"Your shipment is leaving":Courier.ReadyForLoading?"Load the collection van":"Meet the collection van"):
            BulkPending?"Receive your first pallet":BulkPallet!=null&&!BulkStored?"Put the pallet in a rack":PurchasePending?"Meet your delivery driver":
            boxes.Any(b=>b!=null&&!b.Shipped&&!b.Received)?"Put your cartons away":Products.Any(p=>Available(p.id)>=p.cartons)||BulkStored?"Book a customer collection":CompletedOrders==0?"Start your distribution business":"Place your next purchase order";
        public string ObjectiveDetail => ActiveOrder!=null?ActiveOrder.bulk?(BulkShipping?"Payment posts after the loaded truck leaves": "Use the forklift, then dispatch at the office computer"):
            Courier.State==WarehouseCourierService.VisitState.WaitingForLoading?"Cartons aboard: "+Courier.LoadedCount+" / "+ActiveOrder.quantity+". Put them down, then step clear.":Courier.Status:
            BulkPending?Receiving.StatusText:BulkPallet!=null&&!BulkStored?"Unload with the forklift and lower onto a wall-rack position":PurchasePending?Courier.Status:
            boxes.Any(b=>b!=null&&!b.Shipped&&!b.Received)?"E to pick up. Set each carton inside its highlighted floor bay.":
            Products.Any(p=>Available(p.id)>=p.cartons)||BulkStored?"Use the office computer. Only received stock can be promised.":CompletedOrders==0?"The office computer is through the glass doorway. Order three cartons of packing tape.":"Keep supplying local workshops, then invest in pallet handling.";
        public string SuggestedTab => CompletedOrders==0&&PurchasedCartons==0?"purchases":Products.Any(p=>Available(p.id)>=p.cartons)||BulkStored?"customers":"overview";
        bool Notice(string message,bool result){Message=message;Changed?.Invoke();return result;}

        WarehouseCareerBox CreateBox(Product product,Vector3 position)
        {
            var node=new GameObject("Trade carton "+nextBox+" / "+product.name);node.transform.SetParent(transform);node.transform.position=position;
            var rb=node.AddComponent<Rigidbody>();rb.mass=6;rb.interpolation=RigidbodyInterpolation.Interpolate;rb.collisionDetectionMode=CollisionDetectionMode.ContinuousDynamic;
            rb.linearDamping=.12f;rb.angularDamping=.3f;rb.isKinematic=true;
            node.AddComponent<BoxCollider>().size=new Vector3(.48f,.36f,.38f);
            Cube("Cardboard",node.transform,Vector3.zero,new Vector3(.48f,.36f,.38f),cardboard);
            Cube("Sealing tape",node.transform,new Vector3(0,.182f,0),new Vector3(.065f,.004f,.381f),tape);
            Cube("Shipping label",node.transform,new Vector3(0,.02f,.192f),new Vector3(.27f,.19f,.004f),label);
            for(int i=0;i<9;i++)Cube("Barcode",node.transform,new Vector3(-.10f+i*.023f,-.025f,.195f),new Vector3(i%3==0?.012f:.006f,.055f,.002f),ink);
            var text=new GameObject("Product label").AddComponent<TextMesh>();text.transform.SetParent(node.transform,false);text.transform.localPosition=new Vector3(0,.075f,.197f);text.transform.localRotation=Quaternion.Euler(0,180,0);
            UseWarehouseFont(text);
            text.text=product.name.ToUpperInvariant()+"\nLD-"+nextBox.ToString("0000");text.fontSize=32;text.characterSize=.018f;text.anchor=TextAnchor.MiddleCenter;text.alignment=TextAlignment.Center;text.color=new Color(.16f,.22f,.19f);
            var marker=node.AddComponent<WarehouseGrabbable>();marker.label=product.name+" / carton "+nextBox;
            var box=node.AddComponent<WarehouseCareerBox>();box.Sequence=nextBox++;box.ProductId=product.id;
            var outline=new GameObject("Order carton outline").AddComponent<LineRenderer>();outline.transform.SetParent(node.transform,false);outline.sharedMaterial=bayMaterial;outline.useWorldSpace=false;outline.widthMultiplier=.009f;
            outline.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;outline.receiveShadows=false;
            var corners=new[]{new Vector3(-.246f,-.186f,-.196f),new Vector3(.246f,-.186f,-.196f),new Vector3(.246f,.186f,-.196f),new Vector3(-.246f,.186f,-.196f),new Vector3(-.246f,-.186f,.196f),new Vector3(.246f,-.186f,.196f),new Vector3(.246f,.186f,.196f),new Vector3(-.246f,.186f,.196f)};
            int[] trace={0,1,2,3,0,4,5,1,5,6,2,6,7,3,7,4};outline.positionCount=trace.Length;outline.SetPositions(trace.Select(i=>corners[i]).ToArray());outline.enabled=false;box.OrderOutline=outline;
            boxes.Add(box);return box;
        }
        void CreateBay(Product product)
        {
            var node=new GameObject("Marked floor bay / "+product.name);node.transform.SetParent(transform,false);
            var line=node.AddComponent<LineRenderer>();line.sharedMaterial=bayMaterial;line.useWorldSpace=true;line.loop=true;line.positionCount=4;line.widthMultiplier=.055f;
            line.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;line.receiveShadows=false;
            line.SetPositions(new[]{product.bay+new Vector3(-1,0,-1),product.bay+new Vector3(1,0,-1),product.bay+new Vector3(1,0,1),product.bay+new Vector3(-1,0,1)});line.enabled=false;bayLines.Add(line);
            var text=new GameObject("Bay label").AddComponent<TextMesh>();text.transform.SetParent(node.transform,false);text.transform.position=product.bay+new Vector3(0,.005f,-1.14f);text.transform.rotation=Quaternion.Euler(90,180,0);
            UseWarehouseFont(text);
            text.text=product.name.ToUpperInvariant();text.fontSize=32;text.characterSize=.07f;text.anchor=TextAnchor.MiddleCenter;text.color=new Color(.70f,.65f,.49f);
        }
        public static Material Material(string name,Color color,bool unlit=false)
        {
            var template=Resources.Load<Material>(unlit?"WarehouseGuide":"WarehouseTrade");
            var value=template!=null?new Material(template):new Material(Shader.Find(unlit?"Universal Render Pipeline/Unlit":"Universal Render Pipeline/Lit"));
            value.name=name;value.color=color;return value;
        }
        public static void UseWarehouseFont(TextMesh text)
        {text.font=Resources.Load<Font>("RackLabFont");if(text.font!=null)text.GetComponent<MeshRenderer>().sharedMaterial=text.font.material;WarehouseWorldText.Bind(text);}
        public static Transform Cube(string name,Transform parent,Vector3 position,Vector3 size,Material material)
        {var node=GameObject.CreatePrimitive(PrimitiveType.Cube);node.name=name;node.transform.SetParent(parent,false);node.transform.localPosition=position;node.transform.localScale=size;Remove(node.GetComponent<Collider>());node.GetComponent<Renderer>().sharedMaterial=material;return node.transform;}
        public static void Remove(UnityEngine.Object value){if(Application.isPlaying)Destroy(value);else DestroyImmediate(value);}
        T FindLocal<T>() where T:Component
        {foreach(var root in gameObject.scene.GetRootGameObjects())foreach(var item in root.GetComponentsInChildren<T>(true))if(item.gameObject.activeInHierarchy)return item;return null;}
        GameObject FindNamed(string name)
        {foreach(var root in gameObject.scene.GetRootGameObjects())foreach(var item in root.GetComponentsInChildren<Transform>(true))if(item.name==name)return item.gameObject;return null;}
    }
}
