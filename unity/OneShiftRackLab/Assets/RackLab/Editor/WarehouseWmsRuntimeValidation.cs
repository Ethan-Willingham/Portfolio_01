using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object=UnityEngine.Object;
using L=OneShift.RackLab.WarehouseWmsLedger;

namespace OneShift.RackLab
{
    public static class WarehouseWmsRuntimeValidation
    {
        const float StepSeconds=.02f;
        const BindingFlags Fields=BindingFlags.Instance|BindingFlags.Public|BindingFlags.NonPublic;
        [Serializable] public sealed class Report
        {
            public string generatedUtc;
            public string method="Production WMS runtime, ledger, courier and actual warehouse collision cloned into isolated PhysX at 20 ms. Workflow scans use decoded-label fixture input; carton placement is explicit test setup followed by real physics settling.";
            public string scope="Physical support, workflow transactions, exact manifests and courier departure. Native handheld input, camera framing and optical label occlusion remain separate browser and scanner checks. The open source scene is never changed.";
            public bool passed;
            public List<ForkliftDrivingValidation.Check> checks=new List<ForkliftDrivingValidation.Check>();
        }
        [MenuItem("One Shift/Validate physical WMS workflow")]
        public static string ValidateAndSave()
        {
            var report=Run();string json=JsonUtility.ToJson(report,true);
            const string path="Assets/RackLab/Reports/warehouse-wms-runtime-validation.json";
            File.WriteAllText(path,json+"\n");AssetDatabase.ImportAsset(path);return json;
        }
        public static Report Run()
        {
            if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play before isolated WMS validation.");
            var source=Object.FindFirstObjectByType<WarehouseReceiving>();Need(source!=null,"Open the installed warehouse scene first.");
            var report=new Report{generatedUtc=DateTime.UtcNow.ToString("O")};
            Test(report,source,false,"career opening and scene-local initialization","The empty career has one account, physical bins and example documents without changing the authored scene.",Opening);
            Test(report,source,true,"Sandbox stock occupies its labelled bins","One hundred real cartons, eight items, five rack rows and separate receiving/staging bins reconcile with opening WMS stock.",SandboxStock);
            Test(report,source,true,"manager creates repeatable validated documents","All eight catalogue items support fresh purchase and sales documents. Invalid quantities reject atomically and drafts do not move stock or money.",ManagerDocuments);
            Test(report,source,false,"purchase creates a real unreceived delivery","Booking debits once; the physical driver delivers exactly the ordered cartons, which remain Expected until scanned receiving.",PurchaseDelivery);
            Test(report,source,false,"receipt requires a correct PO and supported carton","Wrong PO, held, airborne and kinematic cartons cannot be received; a supported duplicate scan cannot receive twice.",ReceiptBoundaries);
            Test(report,source,false,"physical movement alone does not transfer inventory","A misplaced carton remains in its recorded bin and raises an exception; source/carton/destination confirmation reconciles only actual supported placement.",TransferAndExceptions);
            Test(report,source,false,"pick work validates exact stock and staging","Release allocates real source stock, wrong cartons and missing staging reject, and completed picks book one collection without paying.",PickWorkflow);
            Test(report,source,false,"loaded stock needs scanner authorization and offsite departure","Physically loaded boxes alone cannot leave; scan-confirmed exact loading and cleared ramp authorize the real courier, then one offsite payment posts.",ShippingCycle);
            Test(report,source,false,"returned dispatch stock can be picked again","A loaded carton returns through the recorded dispatch bin, invalidates shipment authorization and appears as outstanding pick work.",ReturnLoaded);
            report.passed=report.checks.All(check=>check.passed);return report;
        }
        static void Test(Report report,WarehouseReceiving source,bool sandbox,string name,string expectation,Action<Fixture,ForkliftDrivingValidation.Check> action)
        {
            var check=new ForkliftDrivingValidation.Check{name=name,expectation=expectation};report.checks.Add(check);
            try{using(var fixture=new Fixture(source,sandbox)){action(fixture,check);Need(fixture.Runtime.Ledger.CheckInvariants(out var reason),reason);check.Measure("courier simulation",fixture.SimulatedSeconds,"s");}check.passed=true;}
            catch(Exception error){check.error=error.ToString();check.passed=false;}
        }
        static void Opening(Fixture f,ForkliftDrivingValidation.Check check)
        {
            var w=f.Runtime;
            Need(!w.Sandbox&&w.Cash==600&&w.Bodies.Count==0&&w.Ledger.OnHand()==0&&w.Ledger.Expected()==0&&!w.Courier.Busy,"Career must begin empty.");
            Need(w.Ledger.Items.Count==8&&w.Ledger.PurchaseOrders.Count==3&&w.Ledger.SalesOrders.Count==3,"Career examples and item catalog are missing.");
            Need(w.Ledger.Bins.Any(b=>b.id=="REC-01")&&w.Ledger.Bins.Any(b=>b.id=="REC-02")&&w.Ledger.Bins.Any(b=>b.id=="STAGE-01")&&w.Ledger.Bins.Any(b=>b.id=="DISPATCH-01"),"Non-rack areas must be real bins.");
            Need(w.Walking.gameObject.scene==f.Scene&&w.Courier.gameObject.scene==f.Scene&&w.World.gameObject.scene==f.Scene,"Runtime attached to the original scene.");
            int revision=w.Ledger.Revision;w.Initialize(false);
            Need(w.Cash==600&&w.Ledger.Revision==revision&&w.Finance.Count==1,"Repeated initialization duplicated documents or capital.");
            Need(!w.Confirm()&&!w.Book("PO-MISSING")&&!w.ReleaseOrder("SO-2001")&&w.Cash==600,"Premature work changed the opening account.");
            Need(!w.CreatePurchase("tape:2")&&!w.CreateSales("tape:2")&&w.Ledger.PurchaseOrders.Count==3&&w.Ledger.SalesOrders.Count==3,"The initial practical order must precede career document creation.");
        }
        static void SandboxStock(Fixture f,ForkliftDrivingValidation.Check check)
        {
            var w=f.Runtime;f.PhysicsOnly(1.5f);Invoke(w,"AuditPhysicalBins");
            Need(w.Sandbox&&w.Cash==10000&&w.RacksOwned&&w.ForkliftOwned,"Sandbox must retain its equipment.");
            Need(w.Ledger.OnHand()==100&&w.Ledger.Expected()==2&&w.Bodies.Count==102,"Sandbox seed is not the intended populated warehouse.");
            Need(w.Ledger.Bins.Count(b=>b.kind==L.BinKind.Storage&&b.id.Length==9&&!b.id.StartsWith("S"))==90,"Every rack slot across rows A to E must be a registered bin.");
            Need(w.Ledger.Items.All(i=>w.Ledger.OnHand(i.id)>0),"Opening stock is missing a carton variety.");
            Need(w.Ledger.Bins.Where(b=>b.kind==L.BinKind.Storage&&!b.id.StartsWith("S")).All(b=>w.Ledger.BinUsed(b.id)>0)&&w.Ledger.Bins.Count(b=>b.id.StartsWith("S")&&w.Ledger.BinUsed(b.id)>0)==10,"Opening stock must populate every main rack location and ten small shelf locations.");
            int supported=0;var bad=new List<string>();
            foreach(var c in w.Ledger.Cartons.Where(c=>c.status!=L.CartonStatus.Expected))
            {if(w.IsInBin(c.id,c.binId,out var reason))supported++;else bad.Add(c.id+" / "+c.binId+": "+reason);}
            check.Measure("supported opening cartons",supported,"cartons");
            Need(bad.Count==0,"Opening carton placement is invalid: "+string.Join("; ",bad.Take(12)));
            Need(w.CanRelease("SO-2001",out _)&&w.CanRelease("SO-2002",out _)&&w.CanRelease("SO-2003",out _),"Example sales orders need usable pick-face stock.");
            Need(Vector3.Distance(w.Walking.transform.position,new Vector3(0,.025f,-3.6f))<.01f,"Sandbox must start in the clear front cross-aisle.");
        }
        static void PurchaseDelivery(Fixture f,ForkliftDrivingValidation.Check check)
        {
            var w=f.Runtime;Need(w.Book("PO-1001"),w.Message);
            var ids=w.Ledger.Cartons.Select(c=>c.id).ToArray();
            Need(ids.Length==3&&w.Cash==480&&w.Ledger.Expected()==3&&w.Ledger.OnHand()==0,"Purchase did not create exactly three unreceived cartons.");
            int events=w.Ledger.Transactions.Count;Need(!w.Book("PO-1001")&&w.Cash==480&&w.Ledger.Transactions.Count==events,"Duplicate booking changed stock or cash.");
            Need(w.ChooseOrder("receive","PO-1001")&&w.AcceptScan("BIN:REC-01"),w.Message);
            Need(!w.AcceptScan("CARTON:"+ids[0])&&w.Ledger.OnHand()==0,"A carton still with the carrier was received remotely.");
            f.Until(()=>!w.Courier.Busy,280,"physical purchase delivery");
            Need(w.Bodies.Values.All(b=>b!=null&&b.gameObject.activeInHierarchy&&!b.isKinematic)&&w.Ledger.Cartons.All(c=>c.status==L.CartonStatus.Expected),"Delivery did not leave dynamic unreceived boxes.");
            Need(w.Ledger.OnHand()==0&&w.Cash==480&&w.CompletedOrders==0,"Physical dropoff alone posted receipt or payment.");
            check.Measure("delivered physical cartons",w.Bodies.Count,"cartons");
        }
        static void ManagerDocuments(Fixture f,ForkliftDrivingValidation.Check check)
        {
            var w=f.Runtime;int revision=w.Ledger.Revision,events=w.Ledger.Transactions.Count;
            foreach(string payload in new[]{null,"","tape","tape:0","tape:-1","tape:1.5","tape:7","tape:2147483648","tape:1:1","missing:2","tape: 2","tape:2e0"})
                Need(!w.Command("create-po",payload)&&!w.Command("create-so",payload),"Invalid order payload was accepted: "+payload);
            Need(w.Ledger.Revision==revision&&w.Ledger.Transactions.Count==events&&w.Ledger.PurchaseOrders.Count==3&&w.Ledger.SalesOrders.Count==3,"Rejected drafts changed the ledger.");
            foreach(var item in w.Ledger.Items)
            {
                Need(w.Command("create-po",item.id+":6")&&w.Command("create-so",item.id+":1"),w.Message);
                var po=w.Ledger.PurchaseOrders.Last();var so=w.Ledger.SalesOrders.Last();
                Need(po.lines.Count==1&&po.lines[0].itemId==item.id&&po.lines[0].ordered==6&&po.status==L.PurchaseStatus.Open&&w.CanBook(po.id,out _),"Created purchase was not a bookable six-carton order.");
                Need(so.lines.Count==1&&so.lines[0].itemId==item.id&&so.lines[0].ordered==1&&so.status==L.SalesStatus.Open&&so.manifest.Count==0,"Created sales order prematurely allocated stock.");
            }
            Need(w.Ledger.PurchaseOrders.Select(p=>p.id).Distinct().Count()==11&&w.Ledger.SalesOrders.Select(s=>s.id).Distinct().Count()==11,"Manager document IDs collided.");
            Need(w.Cash==10000&&w.Ledger.OnHand()==100&&w.Ledger.Expected()==2&&w.Ledger.Reserved()==0&&w.Bodies.Count==102&&!w.Courier.Busy,"Draft creation changed money, inventory or the carrier.");
        }
        static void ReceiptBoundaries(Fixture f,ForkliftDrivingValidation.Check check)
        {
            f.Deliver();var w=f.Runtime;string id=w.Ledger.Cartons[0].id;var body=w.Bodies[id];
            f.PlaceAllReceiving();
            Need(w.ChooseOrder("receive","PO-1002")&&w.AcceptScan("BIN:REC-01"),w.Message);
            Need(!w.AcceptScan("CARTON:"+id)&&w.Ledger.OnHand()==0,"Wrong purchase order accepted a carton.");
            Need(w.ChooseOrder("receive","PO-1001")&&w.AcceptScan("BIN:REC-01"),w.Message);
            Vector3 support=body.position;body.position+=Vector3.up*.2f;Physics.SyncTransforms();
            Need(!w.AcceptScan("CARTON:"+id)&&w.Ledger.OnHand()==0,"Airborne carton was received.");
            body.position=support;body.isKinematic=true;Physics.SyncTransforms();
            Need(!w.AcceptScan("CARTON:"+id),"Kinematic carrier freight was received.");body.isKinematic=false;f.PhysicsOnly(.4f);
            f.AimAt(body);Need(f.Grabber.TryPickup(body),"Held-carton receipt fixture could not take the real grabbable body.");
            Need(!w.AcceptScan("CARTON:"+id)&&w.Ledger.OnHand()==0,"Held carton was received.");f.Grabber.Release();f.Away();f.PlaceAllReceiving();
            Need(w.AcceptScan("CARTON:"+id)&&w.ReadyToConfirm(out _),w.Message);
            Need(w.Confirm()&&w.Ledger.OnHand()==1&&w.Ledger.FindCarton(id).binId=="REC-01",w.Message);
            int events=w.Ledger.Transactions.Count;
            Need(!w.Confirm()&&!w.AcceptScan("CARTON:"+id)&&w.Ledger.OnHand()==1&&w.Ledger.Transactions.Count==events,"Repeated confirmation or scan received another unit.");
        }
        static void TransferAndExceptions(Fixture f,ForkliftDrivingValidation.Check check)
        {
            f.Deliver();f.ReceiveAll();var w=f.Runtime;string id=w.Ledger.Cartons[0].id;
            f.Place(id,"S01-01-01",0);Invoke(w,"AuditPhysicalBins");
            Need(w.Ledger.FindCarton(id).binId=="REC-01"&&w.Ledger.InReceiving()==3,"Physical movement silently changed the WMS location.");
            var mismatch=(Dictionary<string,float>)Get(w,"mismatchSince");Need(mismatch.ContainsKey(id),"Moved stock did not begin an exception grace period.");
            mismatch[id]=Time.time-2;int revision=w.Revision;Invoke(w,"AuditPhysicalBins");
            Need(w.Revision>revision&&w.Capture().exceptions.Any(e=>e.id==id),"Mature location exceptions must notify the UI.");
            w.ResetWorkflow("transfer");Need(w.AcceptScan("BIN:REC-01")&&w.AcceptScan("CARTON:"+id)&&w.AcceptScan("BIN:S02-03-02"),w.Message);
            Need(!w.Confirm()&&w.Ledger.FindCarton(id).binId=="REC-01","Confirmation posted inventory without a carton in the destination.");
            var body=w.Bodies[id];body.position=new Vector3(8,.8f,4);body.linearVelocity=Vector3.zero;Physics.SyncTransforms();Invoke(w,"AuditPhysicalBins");
            Need(w.PhysicalBin(id)==""&&w.Capture().exceptions.Any(e=>e.id==id),"Stock outside every bin must remain an exception.");
            f.Place(id,"S02-03-02",0);Need(w.Confirm(),w.Message);
            Need(w.Ledger.FindCarton(id).binId=="S02-03-02"&&w.Ledger.Available()==1&&!w.Capture().exceptions.Any(e=>e.id==id),"Confirmed putaway did not reconcile the exception and availability.");
            Need(w.Ledger.OnHand()==3&&w.Cash==480,"Transfer changed stock quantity or cash.");
        }
        static void PickWorkflow(Fixture f,ForkliftDrivingValidation.Check check)
        {
            f.Deliver();f.ReceiveAll();f.PutAwayAll();var w=f.Runtime;var first=w.Ledger.Cartons[0];
            f.Place(first.id,"S02-03-02",0);
            Need(!w.ReleaseOrder("SO-2001")&&w.Ledger.Reserved()==0,"Release reserved a physically misplaced carton.");
            f.Place(first.id,"S01-01-01",0);Need(w.ReleaseOrder("SO-2001"),w.Message);
            Need(w.Cash==480&&w.Ledger.Reserved()==3&&!w.Courier.Busy,"Order release must reserve only, with no payment or empty van yet.");
            Need(w.ChooseOrder("pick","SO-2001"),w.Message);
            Need(!w.AcceptScan("BIN:REC-01")&&!w.AcceptScan("ITEM:tape"),"Pick accepted the wrong first scan type.");
            Need(w.AcceptScan("BIN:S01-01-01")&&w.AcceptScan("CARTON:"+first.id)&&w.AcceptScan("BIN:STAGE-01"),w.Message);
            Need(!w.Confirm()&&w.Ledger.Picked()==0,"Pick confirmation skipped physical staging.");
            f.Place(first.id,"STAGE-01",0);Need(w.Confirm(),w.Message);
            f.PickRemaining();Need(w.Ledger.FindSales("SO-2001").status==L.SalesStatus.Picked&&w.Courier.Busy&&w.Cash==480,"All picks should book one unpaid collection.");
            Need(!w.CancelOrder("SO-2001"),"The booked carrier's order should not be silently cancelled.");
            check.Measure("staged allocated cartons",w.Ledger.Picked(),"cartons");
        }
        static void ShippingCycle(Fixture f,ForkliftDrivingValidation.Check check)
        {
            f.ReadyToLoad();var w=f.Runtime;var order=w.Ledger.FindSales("SO-2001");
            for(int i=0;i<order.manifest.Count;i++)f.PlaceOnVan(order.manifest[i],i);
            f.Step(4);
            Need(w.Courier.ReadyForLoading&&w.Cash==480&&w.CompletedOrders==0&&w.Ledger.Loaded()==0,"Physical loading bypassed the WMS shipment controls.");
            for(int i=0;i<order.manifest.Count;i++)f.Place(order.manifest[i],"STAGE-01",i);
            f.LoadAll();
            Need(order.status==L.SalesStatus.Loaded&&w.Ledger.OnHand()==3&&w.Cash==480&&w.CompletedOrders==0,"Confirmed loads prematurely shipped or paid.");
            var callback=(Action)Get(Get(w.Courier,"active"),"complete");
            Need(w.ReadyToConfirm(out var reason),reason);Need(w.Confirm(),w.Message);
            Need(w.Cash==480&&w.Ledger.OnHand()==3,"Shipment authorization posted payment before physical departure.");
            f.Until(()=>w.Courier.State==WarehouseCourierService.VisitState.DrivingOut,80,"collection drive out");
            Need(w.Cash==480&&w.CompletedOrders==0,"Payment posted while the truck was still departing.");
            Invoke(w,"AuditPhysicalBins");Need(order.manifest.All(id=>w.PhysicalBin(id)=="DISPATCH-01")&&!w.Capture().exceptions.Any(),"Normal secured departure incorrectly raised lost-stock exceptions.");
            f.Until(()=>!w.Courier.Busy,80,"collection offsite boundary");
            Need(w.Cash==690&&w.CompletedOrders==1&&w.Ledger.OnHand()==0&&w.Bodies.Count==0&&order.status==L.SalesStatus.Shipped,"Actual offsite shipment did not pay exactly once.");
            int moneyEvents=w.Finance.Count,stockEvents=w.Ledger.Transactions.Count;callback();
            Need(w.Cash==690&&w.Finance.Count==moneyEvents&&w.Ledger.Transactions.Count==stockEvents,"Repeated callback duplicated payment or stock movement.");
            Need(w.Ledger.FindPurchase("PO-1004")!=null&&w.Ledger.FindSales("SO-2004")!=null,"The completed customer did not offer a repeat trade.");
            Need(w.Book("PO-1004")&&w.Cash==570&&w.Ledger.Expected()==3&&w.Bodies.Count==3,"Repeat purchase failed after prior freight left.");
            Need(w.Ledger.Cartons.Select(c=>c.id).Distinct().Count()==6,"Repeat purchasing reused a handling-unit identity.");
            Need(w.CreatePurchase("stretch:2")&&w.CreateSales("stretch:2"),"The first shipped order did not unlock career document creation.");
        }
        static void ReturnLoaded(Fixture f,ForkliftDrivingValidation.Check check)
        {
            f.ReadyToLoad();f.LoadAll();var w=f.Runtime;var order=w.Ledger.FindSales("SO-2001");string id=order.manifest[0];
            Need(w.Confirm(),w.Message);Need((string)Get(w,"dispatchAuthorization")==order.id,"Return fixture did not authorize its manifest.");
            w.ResetWorkflow("transfer");Need(w.AcceptScan("BIN:DISPATCH-01")&&w.AcceptScan("CARTON:"+id)&&w.AcceptScan("BIN:S02-03-02"),w.Message);
            f.Place(id,"S02-03-02",0);Need(w.Confirm(),w.Message);
            Need(w.Ledger.FindCarton(id).status==L.CartonStatus.Reserved&&w.Capture().salesOrders.Single(s=>s.id==order.id).canPick&&(string)Get(w,"dispatchAuthorization")=="","Returned dispatch stock did not restore pick work or clear authorization.");
            Need(w.ChooseOrder("pick",order.id)&&w.AcceptScan("BIN:S02-03-02")&&w.AcceptScan("CARTON:"+id)&&w.AcceptScan("BIN:STAGE-01"),w.Message);
            f.Place(id,"STAGE-01",0);Need(w.Confirm()&&w.Ledger.FindCarton(id).status==L.CartonStatus.Picked,w.Message);
            Need(w.Cash==480&&w.CompletedOrders==0&&w.Courier.ReadyForLoading,"Return and re-pick altered payment or let the van leave.");
        }

        static void Need(bool value,string reason){if(!value)throw new InvalidOperationException(reason);}
        static object Get(object value,string name)=>value.GetType().GetField(name,Fields).GetValue(value);
        static void Set(object value,string name,object assigned)=>value.GetType().GetField(name,Fields).SetValue(value,assigned);
        static void Invoke(object value,string name)=>value.GetType().GetMethod(name,Fields).Invoke(value,null);

        internal sealed class Fixture:IDisposable
        {
            readonly Scene previousActive,scene;
            readonly PhysicsScene physics;
            readonly WarehouseReceiving original,originalActive;
            readonly PalletCargo[] originalCargo;
            readonly Vector3[] originalPositions;
            readonly GameObject originalVehicle,originalRacks;
            readonly bool vehicleActive,racksActive;
            readonly int frameRate;
            readonly float timeScale;
            readonly CursorLockMode cursorLock;
            readonly bool cursorVisible;
            readonly HashSet<Object> originalResources;
            public readonly WarehouseReceiving Receiving;
            public readonly RackWalkController Walking;
            public readonly WarehouseGrabber Grabber;
            public readonly WarehouseWmsRuntime Runtime;
            public Scene Scene=>scene;
            public float SimulatedSeconds{get;private set;}
            public Fixture(WarehouseReceiving source,bool sandbox,string demonstrationId="")
            {
                original=source;originalActive=WarehouseReceiving.Active;originalCargo=(PalletCargo[])source.cargo.Clone();originalPositions=originalCargo.Select(c=>c.transform.position).ToArray();
                originalVehicle=source.gameObject.scene.GetRootGameObjects().SelectMany(root=>root.GetComponentsInChildren<ForkliftDriveController>(true)).First().gameObject;
                originalRacks=source.GetComponentsInChildren<Transform>(true).First(t=>t.name=="Starting wall racks").gameObject;
                vehicleActive=originalVehicle.activeSelf;racksActive=originalRacks.activeSelf;
                previousActive=SceneManager.GetActiveScene();frameRate=Application.targetFrameRate;timeScale=Time.timeScale;cursorLock=Cursor.lockState;cursorVisible=Cursor.visible;
                originalResources=new HashSet<Object>(Resources.FindObjectsOfTypeAll<Material>().Cast<Object>().Concat(Resources.FindObjectsOfTypeAll<Mesh>()).Concat(Resources.FindObjectsOfTypeAll<AudioClip>()));
                scene=EditorSceneManager.NewPreviewScene();physics=scene.GetPhysicsScene();
                try
                {
                    Need(physics.IsValid()&&physics!=Physics.defaultPhysicsScene,"A WMS fixture needs isolated physics.");Time.timeScale=1;
                    var copy=Object.Instantiate(source.gameObject);copy.name="Disposable WMS receiving warehouse";copy.hideFlags=HideFlags.HideAndDontSave;SceneManager.MoveGameObjectToScene(copy,scene);
                    Receiving=copy.GetComponent<WarehouseReceiving>();
                    Need(Receiving.cargo.All(c=>c!=null&&c.gameObject.scene==scene&&!originalCargo.Contains(c))&&Receiving.truck.gameObject.scene==scene,"The receiving copy references source freight.");
                    CopyStaticCollision(source.gameObject.scene,source.transform);
                    var forklift=Object.Instantiate(originalVehicle);forklift.hideFlags=HideFlags.HideAndDontSave;SceneManager.MoveGameObjectToScene(forklift,scene);
                    foreach(var camera in forklift.GetComponentsInChildren<Camera>(true))camera.enabled=false;
                    var player=Create("Disposable WMS walker");var motor=player.AddComponent<CharacterController>();motor.height=1.78f;motor.radius=.25f;motor.center=Vector3.up*.89f;
                    var eye=Create("Disposable WMS camera").AddComponent<Camera>();eye.transform.SetParent(player.transform,false);eye.transform.localPosition=Vector3.up*1.65f;eye.enabled=false;
                    Walking=player.AddComponent<RackWalkController>();Walking.eyes=eye;Invoke(Walking,"Awake");Set(Walking,"parcelService",null);Set(Walking,"receiving",Receiving);Set(Walking,"captured",true);Set(Walking,"awaitNeutral",false);Grabber=Walking.Grabber;
                    Runtime=Create("Disposable WMS account").AddComponent<WarehouseWmsRuntime>();Runtime.Initialize(sandbox,demonstrationId);Invoke(Receiving,"Start");
                    Physics.SyncTransforms();SceneManager.SetActiveScene(previousActive);
                }
                catch{Dispose();throw;}
            }
            GameObject Create(string name)
            {var value=EditorUtility.CreateGameObjectWithHideFlags(name,HideFlags.HideAndDontSave);SceneManager.MoveGameObjectToScene(value,scene);return value;}
            void CopyStaticCollision(Scene source,Transform copiedRoot)
            {
                foreach(var collider in source.GetRootGameObjects().SelectMany(root=>root.GetComponentsInChildren<Collider>(true)))
                {
                    if(!collider.enabled||!collider.gameObject.activeInHierarchy||collider.isTrigger||collider.attachedRigidbody!=null||collider is CharacterController||collider.transform.IsChildOf(copiedRoot)||collider.GetComponentInParent<WarehouseParcel>()!=null||Parents(collider.transform).Any(t=>t.name=="Decorative parcel van"))continue;
                    var obj=Create(collider.name);obj.layer=collider.gameObject.layer;obj.transform.SetPositionAndRotation(collider.transform.position,collider.transform.rotation);obj.transform.localScale=collider.transform.lossyScale;
                    Collider result;
                    if(collider is BoxCollider box){var value=obj.AddComponent<BoxCollider>();value.center=box.center;value.size=box.size;result=value;}
                    else if(collider is MeshCollider mesh){var value=obj.AddComponent<MeshCollider>();value.sharedMesh=mesh.sharedMesh;value.convex=mesh.convex;result=value;}
                    else if(collider is SphereCollider sphere){var value=obj.AddComponent<SphereCollider>();value.center=sphere.center;value.radius=sphere.radius;result=value;}
                    else if(collider is CapsuleCollider capsule){var value=obj.AddComponent<CapsuleCollider>();value.center=capsule.center;value.radius=capsule.radius;value.height=capsule.height;value.direction=capsule.direction;result=value;}
                    else throw new InvalidOperationException("Unsupported authored collider "+collider.GetType().Name);
                    result.sharedMaterial=collider.sharedMaterial;result.contactOffset=collider.contactOffset;
                }
            }
            static IEnumerable<Transform> Parents(Transform item){while(item!=null){yield return item;item=item.parent;}}
            public void Step(float seconds)
            {for(int i=0;i<Mathf.CeilToInt(seconds/StepSeconds);i++){Runtime.Courier.Tick(StepSeconds);Physics.SyncTransforms();physics.Simulate(StepSeconds);SimulatedSeconds+=StepSeconds;}}
            public void PhysicsOnly(float seconds)
            {for(int i=0;i<Mathf.CeilToInt(seconds/StepSeconds);i++){Physics.SyncTransforms();physics.Simulate(StepSeconds);}}
            public void Until(Func<bool> condition,float maximum,string label)
            {for(int i=0;i<Mathf.CeilToInt(maximum/StepSeconds)&&!condition();i++)Step(StepSeconds);Need(condition(),"Timed out at "+label+": "+Runtime.Courier.State+" / "+Runtime.Courier.Status);}
            public void Deliver()
            {Need(Runtime.Book("PO-1001"),Runtime.Message);Until(()=>!Runtime.Courier.Busy,280,"supplier delivery and departure");Need(Runtime.Ledger.Expected()==3,"Delivered cartons must await receiving.");}
            public void PlaceAllReceiving()
            {
                var bin=Runtime.World.FindBin("REC-01");int index=0;
                foreach(var carton in Runtime.Ledger.Cartons.Where(c=>c.status!=L.CartonStatus.Shipped))
                {var body=Runtime.Bodies[carton.id];body.position=bin.PlacementPosition(index++,body.GetComponent<BoxCollider>().size);body.rotation=bin.PlacementRotation;body.linearVelocity=Vector3.zero;body.angularVelocity=Vector3.zero;}
                PhysicsOnly(.8f);
            }
            public void ReceiveAll()
            {
                PlaceAllReceiving();Need(Runtime.ChooseOrder("receive","PO-1001")&&Runtime.AcceptScan("BIN:REC-01"),Runtime.Message);
                foreach(var carton in Runtime.Ledger.Cartons.Where(c=>c.status==L.CartonStatus.Expected).ToArray())
                    Need(Runtime.AcceptScan("CARTON:"+carton.id)&&Runtime.Confirm(),Runtime.Message);
                Need(Runtime.Ledger.OnHand()==3&&Runtime.Ledger.InReceiving()==3,"Receiving did not record the expected three cartons.");
            }
            public void Place(string id,string binId,int index)
            {
                var bin=Runtime.World.FindBin(binId);var body=Runtime.Bodies[id];body.position=bin.PlacementPosition(index,body.GetComponent<BoxCollider>().size);body.rotation=bin.PlacementRotation;
                if(body.isKinematic)body.isKinematic=false;body.useGravity=true;body.linearVelocity=Vector3.zero;body.angularVelocity=Vector3.zero;PhysicsOnly(.7f);
                Need(Runtime.IsInBin(id,binId,out var reason),"Fixture placement "+id+" / "+binId+": "+reason);
            }
            public void PutAwayAll()
            {
                int index=0;foreach(var carton in Runtime.Ledger.Cartons.Where(c=>c.status==L.CartonStatus.Available).ToArray())
                {string bin=Runtime.World.Bins.Where(b=>b.Id.StartsWith("S")).OrderBy(b=>b.Id).ElementAt(index++).Id;Runtime.ResetWorkflow("transfer");Need(Runtime.AcceptScan("BIN:"+carton.binId)&&Runtime.AcceptScan("CARTON:"+carton.id)&&Runtime.AcceptScan("BIN:"+bin),Runtime.Message);Place(carton.id,bin,0);Need(Runtime.Confirm(),Runtime.Message);}
            }
            public void PickRemaining()
            {
                var order=Runtime.Ledger.FindSales("SO-2001");
                foreach(string id in order.manifest.Where(id=>Runtime.Ledger.FindCarton(id).status==L.CartonStatus.Reserved).ToArray())
                {var c=Runtime.Ledger.FindCarton(id);Need(Runtime.ChooseOrder("pick",order.id)&&Runtime.AcceptScan("BIN:"+c.binId)&&Runtime.AcceptScan("CARTON:"+id)&&Runtime.AcceptScan("BIN:STAGE-01"),Runtime.Message);Place(id,"STAGE-01",order.manifest.IndexOf(id));Need(Runtime.Confirm(),Runtime.Message);}
            }
            public void ReadyToLoad()
            {Deliver();ReceiveAll();PutAwayAll();Need(Runtime.ReleaseOrder("SO-2001"),Runtime.Message);PickRemaining();Until(()=>Runtime.Courier.ReadyForLoading,100,"collection arrival");Away();}
            public void PlaceOnVan(string id,int index)
            {var body=Runtime.Bodies[id];body.position=Runtime.Courier.CargoPlacementPosition(index);body.rotation=Runtime.Courier.VanTransform.rotation;body.linearVelocity=Vector3.zero;body.angularVelocity=Vector3.zero;PhysicsOnly(.6f);Need(Runtime.IsInBin(id,"DISPATCH-01",out var reason),reason);}
            public void LoadAll()
            {
                var order=Runtime.Ledger.FindSales("SO-2001");Need(Runtime.ChooseOrder("ship",order.id),Runtime.Message);
                for(int i=0;i<order.manifest.Count;i++)
                {string id=order.manifest[i];Need(Runtime.AcceptScan("BIN:STAGE-01")&&Runtime.AcceptScan("CARTON:"+id)&&Runtime.AcceptScan("BIN:DISPATCH-01"),Runtime.Message);PlaceOnVan(id,i);Need(Runtime.Confirm(),Runtime.Message);}
            }
            public void AimAt(Rigidbody body)
            {
                var motor=Walking.GetComponent<CharacterController>();motor.enabled=false;Walking.transform.position=new Vector3(body.position.x,0,body.position.z+1.1f);motor.enabled=true;
                Walking.eyes.transform.rotation=Quaternion.LookRotation(body.position-Walking.eyes.transform.position);Set(Walking,"captured",true);Set(Walking,"awaitNeutral",false);Physics.SyncTransforms();
            }
            public void Away()
            {var motor=Walking.GetComponent<CharacterController>();motor.enabled=false;Walking.transform.position=new Vector3(0,.025f,1);motor.enabled=true;Physics.SyncTransforms();}
            public void Dispose()
            {
                var owned=new HashSet<Object>();
                if(scene.IsValid()&&scene.isLoaded)
                {
                    foreach(var root in scene.GetRootGameObjects())
                    {
                        foreach(var renderer in root.GetComponentsInChildren<Renderer>(true))foreach(var material in renderer.sharedMaterials)if(material!=null)owned.Add(material);
                        foreach(var mesh in root.GetComponentsInChildren<MeshFilter>(true))if(mesh.sharedMesh!=null)owned.Add(mesh.sharedMesh);
                        foreach(var sound in root.GetComponentsInChildren<AudioSource>(true))if(sound.clip!=null)owned.Add(sound.clip);
                    }
                    if(Grabber!=null)Grabber.Suspend();EditorSceneManager.ClosePreviewScene(scene);
                }
                foreach(var value in owned)if(value!=null&&!EditorUtility.IsPersistent(value)&&!originalResources.Contains(value))Object.DestroyImmediate(value);
                if(previousActive.IsValid())SceneManager.SetActiveScene(previousActive);
                typeof(WarehouseReceiving).GetProperty(nameof(WarehouseReceiving.Active)).GetSetMethod(true).Invoke(null,new object[]{originalActive});
                Application.targetFrameRate=frameRate;Time.timeScale=timeScale;Cursor.lockState=cursorLock;Cursor.visible=cursorVisible;Physics.SyncTransforms();
                Need(original!=null&&original.cargo.SequenceEqual(originalCargo)&&originalVehicle.activeSelf==vehicleActive&&originalRacks.activeSelf==racksActive,"Runtime validation modified source stock or equipment.");
                for(int i=0;i<originalCargo.Length;i++)Need(originalCargo[i]!=null&&originalCargo[i].transform.position==originalPositions[i],"Runtime validation moved a source pallet.");
            }
        }
    }
}
