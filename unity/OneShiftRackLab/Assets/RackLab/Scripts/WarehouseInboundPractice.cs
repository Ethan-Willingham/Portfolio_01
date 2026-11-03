using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.Scripting;

namespace OneShift.RackLab
{
    // This mode visualizes the browser practice record. It never creates a WMS
    // ledger or posts a receipt. A native click reports a label; the browser
    // validates the user's action and sends the resulting authoritative state.
    [Preserve]
    public sealed class WarehouseInboundPractice : MonoBehaviour
    {
        [Serializable] public sealed class Scenario
        {
            public string id, channel, tracking, sku, itemName, po, core, container, bin;
            public int delivery, ordered, deliveryGood, deliveryDamaged;
            public string[] serials;
            public ManifestLine[] manifest;
        }
        [Serializable] public sealed class ManifestLine { public string sku, itemName, core; public int quantity; }
        [Serializable] public sealed class ReceiptLine { public string sku, itemName, core, location; public int quantity, damaged; }
        [Serializable] public sealed class Receipt { public string id, container; public ReceiptLine[] lines; }
        [Serializable] public sealed class PracticeState
        {
            public Scenario scenario;
            public Receipt[] receipts;
            public int syncVersion, received, damaged, remaining;
            public bool finished;
            public string status, location;
        }
        [Serializable] public sealed class UnitState
        {
            public string code, sku, core, status;
            public float[] viewport;
        }
        [Serializable] public sealed class SceneState
        {
            public bool sceneReady, graphicsReady, wmsRuntimePresent;
            public string lesson, error, physicalBin = "REC-02";
            public int syncVersion, delivered, good, damaged, waiting, physicalUnits;
            public UnitState[] units;
        }
        sealed class Unit
        {
            public string code, sku, core, name, status = "Waiting";
            public bool damaged;
            public Rigidbody body;
            public WarehouseWmsLabel[] labels;
            public Renderer board;
        }

        readonly List<Unit> units = new List<Unit>();
        readonly List<Material> materials = new List<Material>();
        WarehouseWmsWorld world;
        WarehouseWmsBin dock;
        RackWalkController walking;
        BrowserLifecycle lifecycle;
        Camera view;
        PracticeState state;
        GameObject containerView;
        WarehouseWmsLabel containerLabel;
        Material paper, ink, trayMaterial;
        bool initialized;
        int lastWidth, lastHeight;
        string fixtureSignature = "";

#if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern string WarehouseInitialInboundState();
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern void WarehouseInboundScan(string code);
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern void WarehouseInboundSceneSynced(string json);
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern int WarehouseInboundPointerOverCanvas();
#endif

        public static WarehouseInboundPractice Ensure()
        {
            var existing = UnityEngine.Object.FindFirstObjectByType<WarehouseInboundPractice>();
            if (existing != null) return existing;
            var value = new GameObject("Receiving practice visualization").AddComponent<WarehouseInboundPractice>();
            value.InitializeWorld();
#if UNITY_WEBGL && !UNITY_EDITOR
            if (!value.Apply(WarehouseInitialInboundState(), true))
                throw new InvalidOperationException("Receiving practice could not prepare its initial delivery.");
#endif
            return value;
        }

        void InitializeWorld()
        {
            if (initialized) return;
            lifecycle = UnityEngine.Object.FindFirstObjectByType<BrowserLifecycle>();
            walking = FindLocal<RackWalkController>();
            if (walking == null || walking.eyes == null) throw new InvalidOperationException("Receiving practice needs the warehouse camera.");
            // Disable the authored simulations before their Start methods run.
            // This mode contains only the selected delivery, with no second ledger.
            foreach (var receiving in FindAll<WarehouseReceiving>())
            {
                receiving.StartEmpty = true;
                if (receiving.cargo != null) foreach (var cargo in receiving.cargo) if (cargo != null) cargo.gameObject.SetActive(false);
                receiving.cargo = Array.Empty<PalletCargo>();
                if (receiving.truck != null) receiving.truck.gameObject.SetActive(false);
                if (receiving.dockPlate != null) receiving.dockPlate.SetActive(false);
                if (receiving.wheelChocks != null) receiving.wheelChocks.SetActive(false);
                receiving.enabled = false;
            }
            foreach (var service in FindAll<WarehouseParcelService>())
            {
                service.enabled = false;
                if (service.parcels != null) foreach (var parcel in service.parcels) if (parcel != null) parcel.gameObject.SetActive(false);
            }
            foreach (var service in FindAll<WarehouseCareer>()) service.enabled = false;
            foreach (var service in FindAll<WarehouseBusiness>()) service.enabled = false;
            foreach (var service in FindAll<WarehouseCourierService>()) service.enabled = false;
            foreach (var drive in FindAll<ForkliftDriveController>()) drive.gameObject.SetActive(false);
            foreach (var driver in FindAll<ForkliftPlayerInteraction>()) driver.enabled = false;
            foreach (var scanner in FindAll<WarehouseWmsScanner>()) { scanner.SetEquipped(false); scanner.enabled = false; }
            foreach (var body in FindAll<PalletCargo>()) body.gameObject.SetActive(false);
            var decorativeVan = FindNamed("Decorative parcel van");
            if (decorativeVan != null) decorativeVan.SetActive(false);
            walking.SetExternalControl(false);
            walking.enabled = false;
            if (walking.Grabber != null) { walking.Grabber.Suspend(); walking.Grabber.enabled = false; }
            view = walking.eyes;
            world = WarehouseWmsWorld.Ensure(transform);
            world.Initialize(true);
            dock = world.FindBin("REC-02");
            if (dock == null) throw new InvalidOperationException("Receiving practice needs REC-02.");
            paper = Material("Inbound label paper", new Color(.72f,.70f,.64f));
            ink = Material("Inbound label ink", new Color(.035f,.045f,.035f));
            trayMaterial = Material("Inbound container kraft", new Color(.40f,.29f,.18f));
            initialized = true;
            ResetCamera();
        }

        Material Material(string name, Color color)
        {
            var material = WarehouseCareer.Material(name,color);
            material.SetColor("_BaseColor",color); material.SetFloat("_Smoothness",.04f);
            materials.Add(material); return material;
        }

        public void ResetCamera()
        {
            if (view == null || dock == null) return;
            // A seated, fixed view keeps every label reachable without walking
            // or pointer capture. Its horizontal framing survives canvas resize.
            var target = new Vector3(dock.Center.x,.35f,dock.Center.z);
            var position = target + new Vector3(.30f,2.25f,-3.65f);
            view.transform.SetPositionAndRotation(position,Quaternion.LookRotation(target-position));
            view.fieldOfView = Mathf.Clamp(Camera.HorizontalToVerticalFieldOfView(60f,Mathf.Max(.35f,view.aspect)),35f,100f);
            lastWidth = Screen.width; lastHeight = Screen.height;
        }

        static string Text(string value) => value ?? "";
        static bool KnownLesson(string id) => new[]{"basic","lot","serial","date","partial","asn","web","close"}.Contains(id);
        static bool Printable(string code) => !string.IsNullOrEmpty(code) && WarehouseCode128.TryEncode(code,out _);

        public bool Apply(string json, bool setup)
        {
            PracticeState next;
            try { next = JsonUtility.FromJson<PracticeState>(json); }
            catch (Exception error) { PublishScene("Invalid receiving snapshot: " + error.Message); return false; }
            if (next == null || next.scenario == null || !KnownLesson(next.scenario.id))
            { PublishScene("The receiving lesson is missing or unknown."); return false; }
            var f = next.scenario;
            if (f.delivery < 1 || f.delivery > 12 || f.ordered < f.delivery || f.ordered > 1000 || !Printable(f.po))
            { PublishScene("The delivery quantities or purchase-order label are invalid."); return false; }
            if (!setup && (state == null || JsonUtility.ToJson(f) != fixtureSignature || next.syncVersion < state.syncVersion))
            { PublishScene("Use setup to change the receiving fixture; old snapshots cannot replace new stock."); return false; }
            var specs = Describe(f);
            if (specs == null || specs.Count != f.delivery || specs.Any(unit => !Printable(unit.code) || string.IsNullOrEmpty(unit.sku)))
            { PublishScene("The delivery labels or manifest quantities are invalid."); return false; }
            int good = 0, damaged = 0;
            foreach (var receipt in next.receipts ?? Array.Empty<Receipt>())
            {
                if (receipt == null || receipt.lines == null) { PublishScene("Receipt lines are missing."); return false; }
                foreach (var line in receipt.lines)
                {
                    if (line == null || line.quantity < 0 || line.damaged < 0 || line.quantity > f.delivery || line.damaged > f.delivery || line.location != "REC-02")
                    { PublishScene("Practice receipts must match the delivered units in REC-02."); return false; }
                    for (int condition = 0; condition < 2; condition++)
                    {
                        int count = condition == 0 ? line.quantity : line.damaged;
                        for (int index = 0; index < count; index++)
                        {
                            var unit = specs.FirstOrDefault(candidate => candidate.status == "Waiting" && candidate.sku == line.sku && Text(candidate.core) == Text(line.core) && candidate.damaged == (condition == 1));
                            if (unit == null) { PublishScene("Receipt quantities or tracking values do not match the visible delivery."); return false; }
                            unit.status = condition == 0 ? "Received" : "Damaged";
                        }
                    }
                    good += line.quantity; damaged += line.damaged;
                }
            }
            if (good != next.received || damaged != next.damaged || good + damaged > f.delivery || next.remaining != f.ordered-good-damaged)
            { PublishScene("Receipt totals do not reconcile with the purchase order."); return false; }
            if (setup) Seed(f,specs);
            for (int i = 0; i < units.Count; i++)
            {
                units[i].status = specs[i].status;
                Paint(units[i],f);
            }
            state = next;
            fixtureSignature = JsonUtility.ToJson(f);
            PublishScene();
            return true;
        }

        List<Unit> Describe(Scenario f)
        {
            var result = new List<Unit>();
            if (f.id == "asn")
            {
                if (f.manifest == null || !Printable(f.container)) return null;
                foreach (var line in f.manifest)
                {
                    if (line == null || line.quantity < 1 || line.quantity > 12) return null;
                    for (int i = 0; i < line.quantity; i++) result.Add(new Unit {code=f.container,sku=line.sku,name=line.itemName,core=Text(line.core)});
                }
            }
            else
            {
                if (f.id == "serial" && (f.serials == null || f.serials.Length != f.delivery || f.serials.Distinct().Count() != f.delivery)) return null;
                for (int i = 0; i < f.delivery; i++)
                {
                    string core = f.id == "serial" ? f.serials[i] : f.id == "lot" || f.id == "date" ? Text(f.core) : "";
                    string code = string.IsNullOrEmpty(core) ? f.sku : core;
                    result.Add(new Unit {code=code,sku=f.sku,name=f.itemName,core=core,damaged=f.id == "web" && i >= f.delivery-f.deliveryDamaged});
                }
            }
            return result;
        }

        void Seed(Scenario f, List<Unit> specs)
        {
            foreach (var unit in units) if (unit.body != null) { unit.body.gameObject.SetActive(false); WarehouseCareer.Remove(unit.body.gameObject); }
            units.Clear();
            if (containerView != null) { containerView.SetActive(false); WarehouseCareer.Remove(containerView); }
            containerView = null; containerLabel = null;
            for (int i = 0; i < specs.Count; i++)
            {
                var unit = specs[i];
                int columns = Mathf.Min(3,specs.Count), rows = Mathf.CeilToInt(specs.Count/(float)columns);
                var size = WarehouseWmsWorld.CartonSize(0);
                var position = new Vector3(dock.Center.x+(i%columns-(columns-1)*.5f)*.78f,dock.SurfaceY+size.y*.5f+.01f,dock.Center.z+(i/columns-(rows-1)*.5f)*.70f);
                var body = world.CreateCarton("IN-"+(i+1).ToString("000"),unit.sku,unit.name,1,"EA",position,0);
                body.isKinematic = true; body.useGravity = false;
                body.rotation = dock.PlacementRotation; body.transform.SetPositionAndRotation(position,dock.PlacementRotation);
                var carton = body.GetComponent<WarehouseWmsCarton>();
                carton.DocumentId = f.po;
                foreach (var label in carton.Labels) { label.gameObject.SetActive(false); WarehouseCareer.Remove(label.gameObject); }
                var front = WarehouseWmsLabel.Create(body.transform,new Vector3(0,0,size.z*.5f+.003f),Quaternion.identity,new Vector2(size.x*.84f,size.y*.82f),unit.code,"inbound",unit.code,unit.name,"",paper,ink);
                var top = WarehouseWmsLabel.Create(body.transform,new Vector3(0,size.y*.5f+.004f,0),Quaternion.Euler(-90,0,0),new Vector2(size.x*.84f,size.z*.80f),unit.code,"inbound",unit.code,unit.name,"",paper,ink);
                unit.body=body;unit.labels=new[]{front,top};carton.Labels=unit.labels;
                unit.board = body.transform.Find("Sealed corrugated carton").GetComponent<Renderer>();
                units.Add(unit);
            }
            if (f.id == "asn") CreateContainer(f);
            ResetCamera();
            Physics.SyncTransforms();
        }

        void CreateContainer(Scenario f)
        {
            containerView = new GameObject("ASN container / " + f.container);
            containerView.transform.SetParent(transform,false);
            containerView.transform.position = new Vector3(dock.Center.x,dock.SurfaceY,dock.Center.z);
            var scanSurface = containerView.AddComponent<BoxCollider>();
            scanSurface.center = new Vector3(0,.12f,-.76f);
            scanSurface.size = new Vector3(2.48f,.24f,.05f);
            WarehouseCareer.Cube("Container left side",containerView.transform,new Vector3(-1.22f,.12f,0),new Vector3(.05f,.24f,1.55f),trayMaterial);
            WarehouseCareer.Cube("Container right side",containerView.transform,new Vector3(1.22f,.12f,0),new Vector3(.05f,.24f,1.55f),trayMaterial);
            WarehouseCareer.Cube("Container back",containerView.transform,new Vector3(0,.12f,.76f),new Vector3(2.48f,.24f,.05f),trayMaterial);
            WarehouseCareer.Cube("Container front",containerView.transform,new Vector3(0,.12f,-.76f),new Vector3(2.48f,.24f,.05f),trayMaterial);
            containerLabel = WarehouseWmsLabel.Create(containerView.transform,new Vector3(0,.125f,-.79f),Quaternion.Euler(0,180,0),new Vector2(.64f,.22f),f.container,"inbound",f.container,"ASN CONTAINER",f.po+" / "+f.delivery+" units",paper,ink);
        }

        void Paint(Unit unit, Scenario f)
        {
            string physical = unit.damaged ? "DAMAGED UNIT" : "1 EA";
            string status = unit.status == "Waiting" ? "NOT RECEIVED" : unit.status == "Damaged" ? "DAMAGE RECORDED" : "RECEIVED / REC-02";
            string details = (string.IsNullOrEmpty(unit.core) ? physical : unit.core) + " / " + f.po + "\n" + status;
            foreach (var label in unit.labels) label.SetPrintedDetail(unit.name,details);
            var block = new MaterialPropertyBlock();
            Color color = unit.damaged ? new Color(.51f,.25f,.16f) : unit.status == "Received" ? new Color(.39f,.46f,.31f) : new Color(.54f,.37f,.22f);
            block.SetColor("_BaseColor",color); unit.board.SetPropertyBlock(block,0);
        }

        void Update()
        {
            if (!initialized || state == null || BrowserLifecycle.GraphicsPreparing || lifecycle == null || !lifecycle.PresentationActive || Time.timeScale <= 0) return;
            if (Screen.width != lastWidth || Screen.height != lastHeight) { ResetCamera(); PublishScene(); }
            if (!Input.GetMouseButtonDown(0)) return;
#if UNITY_WEBGL && !UNITY_EDITOR
            if (WarehouseInboundPointerOverCanvas() == 0) return;
#endif
            if (!view.pixelRect.Contains(Input.mousePosition)) return;
            string code = "";
            if (Physics.Raycast(view.ScreenPointToRay(Input.mousePosition),out var hit,100f,~0,QueryTriggerInteraction.Ignore))
            {
                var unit = units.FirstOrDefault(candidate => candidate.body == hit.rigidbody);
                if (unit != null) code = unit.code;
                else if (containerView != null && hit.transform.IsChildOf(containerView.transform)) code = state.scenario.container;
            }
#if UNITY_WEBGL && !UNITY_EDITOR
            WarehouseInboundScan(code);
#endif
        }

        public SceneState Capture(string error = "")
        {
            return new SceneState {
                sceneReady=initialized && state != null && string.IsNullOrEmpty(error), graphicsReady=!BrowserLifecycle.GraphicsPreparing,
                lesson=state?.scenario.id ?? "",syncVersion=state?.syncVersion ?? 0,delivered=state?.scenario.delivery ?? 0,
                good=units.Count(unit=>unit.status=="Received"),damaged=units.Count(unit=>unit.status=="Damaged"),waiting=units.Count(unit=>unit.status=="Waiting"),
                physicalUnits=units.Count,error=error,wmsRuntimePresent=UnityEngine.Object.FindFirstObjectByType<WarehouseWmsRuntime>() != null,
                units=units.Select(unit=> { var point=view.WorldToViewportPoint(unit.body.position);return new UnitState{code=unit.code,sku=unit.sku,core=unit.core,status=unit.status,viewport=new[]{point.x,point.y,point.z}}; }).ToArray()
            };
        }
        public void PublishScene(string error = "")
        {
            string json = JsonUtility.ToJson(Capture(error));
            if (!string.IsNullOrEmpty(error)) Debug.LogWarning("Inbound scene: " + error);
#if UNITY_WEBGL && !UNITY_EDITOR
            WarehouseInboundSceneSynced(json);
#endif
        }

        IEnumerable<T> FindAll<T>() where T : Component => gameObject.scene.GetRootGameObjects().SelectMany(root=>root.GetComponentsInChildren<T>(true));
        T FindLocal<T>() where T : Component => FindAll<T>().FirstOrDefault(component=>component.gameObject.activeInHierarchy);
        GameObject FindNamed(string name) => FindAll<Transform>().FirstOrDefault(item=>item.name==name)?.gameObject;
        void OnDestroy() { foreach (var material in materials) if (material != null) WarehouseCareer.Remove(material); }
    }
}
