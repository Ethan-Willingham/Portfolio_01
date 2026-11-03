using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;
using P = OneShift.RackLab.WarehouseInboundPractice;

namespace OneShift.RackLab
{
    public static class WarehouseInboundPracticeValidation
    {
        const string ScenePath = "Assets/RackLab/Scenes/RackFloor.unity";
        const string ReportPath = "Assets/RackLab/Reports/inbound-practice-validation.json";
        [Serializable] public sealed class Report
        {
            public string generatedUtc;
            public string scope = "All eight receiving fixtures exercise the production native adapter in a disposable RackFloor preview with isolated physics. Checks cover exact dynamic unit labels/counts, physical Code128 scanning, receiving support, force-based carry, stock-preserving synchronization, rejection, Undo and camera transition cancellation. Receipt snapshots are fixtures, not company transactions. Browser pointer and keyboard input remain separate checks.";
            public bool passed;
            public List<string> checks = new List<string>();
            public string failure = "";
        }

        [MenuItem("One Shift/Validate inbound practice visualization")]
        public static string ValidateAndSave()
        {
            var report = Run();
            string json = JsonUtility.ToJson(report,true);
            Directory.CreateDirectory(Path.GetDirectoryName(ReportPath));
            File.WriteAllText(ReportPath,json+"\n");
            // Do not hot-reload assets after creating and disposing TextMesh
            // fixtures. The JSON will import on the next ordinary asset refresh.
            Debug.Log("INBOUND_PRACTICE_VALIDATION " + json);
            return json;
        }

        public static string ValidateAndBuild()
        {
            string json = ValidateAndSave();
            var report = JsonUtility.FromJson<Report>(json);
            if (!report.passed) throw new InvalidOperationException("Inbound practice validation failed: " + report.failure);
            return WarehouseWebBuilder.BuildWeb();
        }

        public static Report Run()
        {
            var report = new Report {generatedUtc=DateTime.UtcNow.ToString("O")};
            try
            {
                Need(!EditorApplication.isPlayingOrWillChangePlaymode,"Stop Play before isolated inbound validation.");
                using (var fixture = new Fixture())
                {
                    int version = 0;
                    foreach (string id in new[]{"basic","lot","serial","date","partial","asn","web","close"})
                    {
                        var opening = State(id,++version);
                        Need(fixture.Adapter.Apply(JsonUtility.ToJson(opening),true),"Could not seed " + id);
                        fixture.Settle();
                        var captured = fixture.Adapter.Capture();
                        var bodies = fixture.Bodies();
                        Check(report,captured.sceneReady && captured.lesson==id && captured.physicalUnits==opening.scenario.delivery && bodies.Length==opening.scenario.delivery && captured.delivered==opening.scenario.delivery && !captured.wmsRuntimePresent,
                            id + ": exact delivered units and no independent WMS ledger");
                        Check(report,captured.good==(id=="close"?4:0) && captured.damaged==0 && captured.waiting==opening.scenario.delivery-captured.good,
                            id + ": initial recorded and waiting quantities match the fixture");
                        Check(report,bodies.All(body=>body.UnitsPerCarton==1 && body.Unit=="EA" && body.DocumentId==opening.scenario.po && body.Labels.All(label=>WarehouseCode128.TryEncode(label.Code,out var codes)&&WarehouseCode128.TryDecode(codes,out string decoded)&&decoded==label.Code)),
                            id + ": each physical unit has one EA and a real matching Code128 label");
                        Check(report,fixture.ScannableUnits(),id + ": every unit has a physical barcode readable by the production TC22 ray query");
                        Check(report,bodies.All(body=>!body.Body.isKinematic&&body.Body.useGravity&&body.GetComponent<WarehouseGrabbable>()!=null)&&captured.allDeliveredAtReceiving,
                            id + ": whole units are dynamic, grabbable and settled in physical REC-02");
                        var identities = fixture.Placements();
                        var received = Received(opening,++version);
                        Need(fixture.Adapter.Apply(JsonUtility.ToJson(received),false),"Could not synchronize " + id);
                        captured = fixture.Adapter.Capture();
                        Check(report,captured.good==received.received && captured.damaged==received.damaged && captured.waiting==0 && captured.physicalUnits==opening.scenario.delivery && captured.syncVersion==received.syncVersion && fixture.SamePlacements(identities),
                            id + ": receipts update the same physical units without creating or moving freight");
                        Check(report,fixture.Bodies().All(body=>body.Labels.All(label=>label.DescriptionText.text.Contains("\nRECEIVED / REC-02") || label.DescriptionText.text.Contains("\nDAMAGE RECORDED"))),
                            id + ": recorded status appears on the actual unit labels");
                        if (id=="serial")
                            Check(report,captured.units.Select(unit=>unit.code).OrderBy(code=>code).SequenceEqual(new[]{"SN-1001","SN-1002"}),"Serial units retain their distinct scan codes after receipt");
                        if (id=="partial")
                            Check(report,received.remaining==3 && captured.physicalUnits==3,"Partial delivery never creates the three units still on order");
                        if (id=="asn")
                            Check(report,received.receipts.Length==1 && received.receipts[0].lines.Length==2 && captured.physicalUnits==5 && captured.units.Count(unit=>unit.sku=="TAPE-48")==3 && captured.units.Count(unit=>unit.sku=="GLOVE-M"&&unit.core=="LOT-204")==2 && fixture.Adapter.GetComponentsInChildren<WarehouseWmsLabel>().Any(label=>label.name=="Label / ASN-1001"),"ASN keeps the five actual manifest units, their lot value and a container barcode");
                        if (id=="web")
                            Check(report,captured.units.Count(unit=>unit.status=="Received")==3 && captured.units.Count(unit=>unit.status=="Damaged")==1,"Web receiving distinguishes three good units and one damaged unit");
                        var undo = State(id,++version);
                        if (id=="close") continue;
                        Need(fixture.Adapter.Apply(JsonUtility.ToJson(undo),false),"Could not synchronize Undo for " + id);
                        captured = fixture.Adapter.Capture();
                        Check(report,captured.good==0 && captured.damaged==0 && captured.waiting==opening.scenario.delivery && fixture.SamePlacements(identities),id + ": Undo returns record status to waiting and preserves the physical delivery");
                    }
                    RejectTracking(report,fixture,"lot","LOT-WRONG",ref version);
                    RejectTracking(report,fixture,"date","2027-07-01",ref version);
                    var serial = State("serial",++version);
                    Need(fixture.Adapter.Apply(JsonUtility.ToJson(serial),true),"Serial rejection setup failed.");
                    serial=Received(serial,++version);
                    serial.receipts[0].lines[1].core="SN-1001";
                    RejectedUnchanged(report,fixture,serial,"Repeated serial snapshot cannot record the same native unit twice");
                    var basic = State("basic",++version);
                    Need(fixture.Adapter.Apply(JsonUtility.ToJson(basic),true),"Location rejection setup failed.");
                    fixture.Settle();
                    var moved=fixture.Bodies()[0].Body;var originalPosition=moved.position;
                    fixture.Place(moved,originalPosition+Vector3.right*4);
                    Check(report,!fixture.Adapter.Capture().allDeliveredAtReceiving,"Moving a real unit outside REC-02 clears the native receiving preflight");
                    RejectedUnchanged(report,fixture,Received(basic,++version),"A receipt cannot record stock that the player moved out of receiving");
                    fixture.Place(moved,originalPosition);
                    fixture.AimAt(moved);
                    Need(fixture.Walking.Grabber.TryPickup(moved),"Real inbound carton must be reachable for physical pickup.");
                    Check(report,fixture.Adapter.Capture().holding&&!fixture.Adapter.Capture().allDeliveredAtReceiving&&!moved.isKinematic,"Holding a delivery uses the real dynamic body and prevents receipt");
                    RejectedUnchanged(report,fixture,Received(basic,++version),"Receipt while holding delivered freight is rejected without stock changes");
                    Vector3 beforeCarry=moved.position;
                    fixture.Walking.eyes.transform.rotation=Quaternion.LookRotation(moved.position+Vector3.up*.55f-fixture.Walking.eyes.transform.position);
                    fixture.CarryStep(.35f);
                    Check(report,fixture.Walking.Grabber.IsHolding&&!moved.isKinematic&&Vector3.Distance(moved.position,beforeCarry)>.05f&&fixture.Walking.Grabber.AppliedForceNewtons<=WarehouseGrabber.MaximumHoldForce+.01f,
                        "Real bounded grab forces move the delivery body without parenting or kinematic teleportation");
                    fixture.Walking.Grabber.Release();fixture.Place(moved,originalPosition);
                    Check(report,fixture.Adapter.Capture().allDeliveredAtReceiving&&!fixture.Adapter.Capture().holding,"Putting the physical unit back in REC-02 restores receiving readiness");
                    fixture.CheckCameraCancellation(report);
                    var wrongBin = Received(basic,++version);
                    wrongBin.receipts[0].lines[0].location="REC-01";
                    RejectedUnchanged(report,fixture,wrongBin,"Receipt in REC-01 is rejected while the physical delivery remains in REC-02");
                    var totals = Received(basic,++version);
                    totals.received=3;totals.remaining=1;
                    RejectedUnchanged(report,fixture,totals,"Conflicting receipt totals leave native status and geometry unchanged");
                    var over = Received(basic,++version);
                    over.receipts[0].lines[0].quantity=5;over.received=5;over.remaining=-1;
                    RejectedUnchanged(report,fixture,over,"A snapshot cannot create a fifth unit from a four-unit delivery");
                    var changed = State("date",++version);
                    RejectedUnchanged(report,fixture,changed,"A different lesson cannot replace the delivery through a sync command");
                    var valid = Received(basic,++version);
                    Need(fixture.Adapter.Apply(JsonUtility.ToJson(valid),false),"Final valid receipt failed.");
                    basic.syncVersion=valid.syncVersion-1;
                    RejectedUnchanged(report,fixture,basic,"An old snapshot cannot undo a newer receipt");
                    var reset = State("asn",++version);
                    Need(fixture.Adapter.Apply(JsonUtility.ToJson(reset),true),"Explicit new lesson setup failed.");
                    Check(report,fixture.Adapter.Capture().lesson=="asn" && fixture.Bodies().Length==5 && fixture.Adapter.Capture().good==0,"Explicit setup replaces the old lesson with one fresh five-unit ASN delivery");
                }
                report.passed=true;
            }
            catch(Exception error) { report.failure=error.ToString(); report.passed=false; }
            return report;
        }

        static void RejectTracking(Report report,Fixture fixture,string id,string wrong,ref int version)
        {
            var input=State(id,++version);
            Need(fixture.Adapter.Apply(JsonUtility.ToJson(input),true),id+" rejection setup failed.");
            input=Received(input,++version);input.receipts[0].lines[0].core=wrong;
            RejectedUnchanged(report,fixture,input,id+": a receipt tracking value that differs from the physical label is rejected atomically");
        }
        static void RejectedUnchanged(Report report,Fixture fixture,P.PracticeState input,string label)
        {
            string before=JsonUtility.ToJson(fixture.Adapter.Capture());var placements=fixture.Placements();
            bool accepted=fixture.Adapter.Apply(JsonUtility.ToJson(input),false);
            Check(report,!accepted && JsonUtility.ToJson(fixture.Adapter.Capture())==before && fixture.SamePlacements(placements),label);
        }

        static P.PracticeState State(string id,int version)
        {
            var f=new P.Scenario{id=id,channel="mobile",tracking="basic",ordered=4,delivery=4,sku="TAPE-48",itemName="Packing tape",po="PO-1001",bin="REC-02"};
            switch(id)
            {
                case "lot":f.tracking="lot";f.sku="GLOVE-M";f.itemName="Work gloves";f.po="PO-1002";f.core="LOT-204";break;
                case "serial":f.tracking="serial";f.sku="SCAN-01";f.itemName="Handheld scanner";f.po="PO-1003";f.ordered=f.delivery=2;f.serials=new[]{"SN-1001","SN-1002"};break;
                case "date":f.tracking="date";f.sku="WIPE-01";f.itemName="Cleaning wipes";f.po="PO-1004";f.ordered=f.delivery=3;f.core="2027-06-30";break;
                case "partial":f.po="PO-1005";f.ordered=6;f.delivery=3;break;
                case "asn":f.channel="asn";f.sku="MIXED";f.itemName="Mixed container";f.po="PO-1006";f.ordered=f.delivery=5;f.container="ASN-1001";f.manifest=new[]{new P.ManifestLine{sku="TAPE-48",itemName="Packing tape",quantity=3,core=""},new P.ManifestLine{sku="GLOVE-M",itemName="Work gloves",quantity=2,core="LOT-204"}};break;
                case "web":f.channel="web";f.po="PO-1007";f.deliveryGood=3;f.deliveryDamaged=1;break;
                case "close":f.channel="close";f.po="PO-1008";break;
            }
            var state=new P.PracticeState{scenario=f,syncVersion=version,received=0,damaged=0,remaining=f.ordered,status="Assigned",location="REC-02",receipts=Array.Empty<P.Receipt>()};
            return id=="close"?Received(state,version):state;
        }
        static P.PracticeState Received(P.PracticeState input,int version)
        {
            var state=JsonUtility.FromJson<P.PracticeState>(JsonUtility.ToJson(input));var f=state.scenario;
            var lines=new List<P.ReceiptLine>();
            if(f.id=="asn")foreach(var line in f.manifest)lines.Add(new P.ReceiptLine{sku=line.sku,itemName=line.itemName,quantity=line.quantity,core=line.core,location="REC-02"});
            else if(f.id=="serial")foreach(string serial in f.serials)lines.Add(new P.ReceiptLine{sku=f.sku,itemName=f.itemName,quantity=1,core=serial,location="REC-02"});
            else lines.Add(new P.ReceiptLine{sku=f.sku,itemName=f.itemName,quantity=f.delivery-f.deliveryDamaged,damaged=f.deliveryDamaged,core=f.core??"",location="REC-02"});
            state.receipts=new[]{new P.Receipt{id="R-1",container=f.container??"",lines=lines.ToArray()}};
            state.received=lines.Sum(line=>line.quantity);state.damaged=lines.Sum(line=>line.damaged);state.remaining=f.ordered-state.received-state.damaged;state.status="Receiving";state.syncVersion=version;
            return state;
        }

        static void Check(Report report,bool value,string label) { Need(value,label);report.checks.Add(label); }
        static void Need(bool value,string reason) { if(!value)throw new InvalidOperationException(reason); }
        sealed class Placement { public int instance;public Vector3 position;public Quaternion rotation; }

        sealed class Fixture : IDisposable
        {
            readonly Scene previousScene;
            Scene scene;
            readonly int originalFrameRate;
            readonly float originalTimeScale;
            readonly CursorLockMode originalLock;
            readonly bool originalCursor;
            readonly WarehouseReceiving originalReceiving;
            public P Adapter { get; private set; }
            public RackWalkController Walking { get; private set; }
            public Fixture()
            {
                previousScene=SceneManager.GetActiveScene();originalFrameRate=Application.targetFrameRate;originalTimeScale=Time.timeScale;
                originalLock=Cursor.lockState;originalCursor=Cursor.visible;originalReceiving=WarehouseReceiving.Active;
                try
                {
                    scene=EditorSceneManager.OpenPreviewScene(ScenePath);
                    Need(scene.IsValid()&&scene.isLoaded&&EditorSceneManager.IsPreviewScene(scene),"Could not open the isolated RackFloor preview.");
                    Need(scene.GetPhysicsScene().IsValid()&&scene.GetPhysicsScene()!=Physics.defaultPhysicsScene,"Inbound checks require isolated physics.");
                    Time.timeScale=1;
                    Walking=scene.GetRootGameObjects().SelectMany(node=>node.GetComponentsInChildren<RackWalkController>(true)).Single();
                    typeof(RackWalkController).GetMethod("Awake",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(Walking,null);
                    var root=EditorUtility.CreateGameObjectWithHideFlags("Disposable inbound practice",HideFlags.HideAndDontSave);
                    SceneManager.MoveGameObjectToScene(root,scene);Adapter=root.AddComponent<P>();
                    // Ensure() creates into the active browser scene. Call its
                    // same initializer on this explicitly disposable scene instead.
                    typeof(P).GetMethod("InitializeWorld",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(Adapter,null);
                    var camera=Walking.eyes;
                    camera.aspect=16f/9f;camera.enabled=false;Adapter.ResetCamera();Physics.SyncTransforms();
                    Need(Adapter.gameObject.scene==scene,"Adapter escaped the disposable preview.");
                }
                catch { Dispose();throw; }
            }
            public WarehouseWmsCarton[] Bodies() => Adapter.GetComponentsInChildren<WarehouseWmsCarton>().OrderBy(body=>body.Id).ToArray();
            public Placement[] Placements() => Bodies().Select(body=>new Placement{instance=body.GetInstanceID(),position=body.Body.position,rotation=body.Body.rotation}).ToArray();
            public bool SamePlacements(Placement[] before)
            {
                var after=Placements();return before.Length==after.Length&&before.Zip(after,(a,b)=>a.instance==b.instance&&a.position==b.position&&a.rotation==b.rotation).All(equal=>equal);
            }
            public bool ScannableUnits()
            {
                Physics.SyncTransforms();
                var physics=scene.GetPhysicsScene();
                return Bodies().All(body=>body.Labels.Any(label=>
                {
                    var result=WarehouseWmsScanner.Trace(physics,label.ScanPoint+label.Normal*.65f,-label.Normal,Walking.transform,new RaycastHit[128]);
                    return result.success&&result.code==label.Code;
                }));
            }
            public void Settle(){for(int i=0;i<100;i++){Physics.SyncTransforms();scene.GetPhysicsScene().Simulate(.01f);}}
            public void Place(Rigidbody body,Vector3 position)
            {
                body.position=position;body.rotation=Quaternion.Euler(0,180,0);body.transform.SetPositionAndRotation(position,body.rotation);
                body.linearVelocity=Vector3.zero;body.angularVelocity=Vector3.zero;body.WakeUp();Settle();
            }
            public void AimAt(Rigidbody body)
            {
                Walking.SetSpawnPose(new Vector3(body.position.x,.025f,body.position.z-1.5f),Quaternion.identity);
                Walking.eyes.transform.rotation=Quaternion.LookRotation(body.position-Walking.eyes.transform.position);
                typeof(RackWalkController).GetField("captured",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(Walking,true);
                typeof(RackWalkController).GetField("awaitNeutral",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(Walking,false);
                Physics.SyncTransforms();
            }
            public void CarryStep(float seconds)
            {for(int i=0;i<Mathf.CeilToInt(seconds/.01f);i++){Walking.Grabber.TickPhysics(.01f);Physics.SyncTransforms();scene.GetPhysicsScene().Simulate(.01f);}}
            public void CheckCameraCancellation(Report report)
            {
                var transition=Adapter.gameObject.AddComponent<WarehouseComputerTransition>();
                var position=Walking.eyes.transform.localPosition;var rotation=Walking.eyes.transform.localRotation;bool callback=false;
                transition.Enter(Walking,null,()=>callback=true);transition.Tick(.05f,true);transition.Tick(.05f,true);transition.CancelAndRestore();transition.Tick(1,true);
                Check(report,!transition.Active&&!Walking.CameraTransitionActive&&!callback&&Walking.eyes.transform.localPosition==position&&Quaternion.Angle(Walking.eyes.transform.localRotation,rotation)<.001f,
                    "Leaving a lesson cancels the office camera transition and its pending callback");
                Object.DestroyImmediate(transition);
            }
            public void Dispose()
            {
                if(scene.IsValid())EditorSceneManager.ClosePreviewScene(scene);
                if(previousScene.IsValid()&&previousScene.isLoaded)SceneManager.SetActiveScene(previousScene);
                Application.targetFrameRate=originalFrameRate;Time.timeScale=originalTimeScale;Cursor.lockState=originalLock;Cursor.visible=originalCursor;
                typeof(WarehouseReceiving).GetField("<Active>k__BackingField",BindingFlags.Static|BindingFlags.NonPublic)?.SetValue(null,originalReceiving);
                // Each fixture component releases its owned meshes/materials in
                // OnDestroy. Never purge all newly discovered Resources here:
                // font atlas updates can create engine-owned TextMesh meshes
                // shared with the open scene, outside this fixture's ownership.
                Physics.SyncTransforms();
            }
        }
    }
}
