using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object=UnityEngine.Object;

namespace OneShift.RackLab
{
    public static class WarehouseWmsWorldValidation
    {
        [Serializable] public sealed class Report
        {
            public string generatedUtc;
            public string scope="Original Code128 encoding, actual physical label raycasts, authored rack-bin geometry, box support and a populated sleeping-stock fixture in isolated PhysX. No native browser input or rendered UI is simulated by these checks.";
            public bool passed;
            public List<string> checks=new List<string>();
            public string failure="";
        }
        [MenuItem("One Shift/Validate WMS labels and warehouse geometry")]
        public static string ValidateAndSave()
        {
            var report=new Report{generatedUtc=DateTime.UtcNow.ToString("O")};
            try{Run(report);report.passed=true;}catch(Exception error){report.failure=error.ToString();}
            const string path="Assets/RackLab/Reports/warehouse-wms-world-validation.json";
            string json=JsonUtility.ToJson(report,true);File.WriteAllText(path,json+"\n");AssetDatabase.ImportAsset(path);return json;
        }
        static void Run(Report report)
        {
            if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play before isolated WMS validation.");
            void Pass(bool value,string label){if(!value)throw new InvalidOperationException(label);report.checks.Add(label);}
            Pass(WarehouseCode128.TryEncode("AB123",out var known)&&known.SequenceEqual(new[]{104,33,34,17,18,19,11,106}),"Code128-B known vector has start104, weighted checksum11 and stop106");
            Pass(WarehouseCode128.ModuleCount(known)==90,"Known vector has90 modules before quiet zones");
            Pass(Enumerable.Range(0,106).All(i=>WarehouseCode128.Pattern(i).Length==6&&WarehouseCode128.Pattern(i).Sum(c=>c-'0')==11)&&WarehouseCode128.Pattern(106)=="2331112","All standard symbol widths and the13-module stop are valid");
            Pass(!WarehouseCode128.TryEncode("",out _)&&!WarehouseCode128.TryEncode("BOX\n01",out _)&&!WarehouseCode128.TryEncode("caf\u00e9",out _),"Empty, control and non-ASCII payloads are rejected");
            known[known.Length-2]=(known[known.Length-2]+1)%103;
            Pass(!WarehouseCode128.TryDecode(known,out _),"A changed checksum is not accepted as a readable label");
            foreach(string payload in new[]{"BIN:A01-01-01","CARTON:CTN-000126","ITEM:TAPE-48"})
                Pass(WarehouseCode128.TryEncode(payload,out var codes)&&WarehouseCode128.TryDecode(codes,out string decoded)&&decoded==payload,"Roundtrip preserves "+payload);
            using(var rig=new Rig())
            {
                var world=rig.world;
                Pass(world.Bins.Count==6&&world.FindBin("REC-01")!=null&&world.FindBin("STAGE-01")!=null&&world.FindBin("F03")!=null,"Empty career registers its six physical bins without creating stock");
                Pass(rig.root.GetComponentsInChildren<WarehouseWmsCarton>().Length==0,"Bin installation grants no inventory");
                var carton=world.CreateCarton("TEST-0001","TAPE-48","Packing tape",36,"ROLL",new Vector3(0,1,0));
                var label=carton.GetComponent<WarehouseWmsCarton>().Labels[0];Physics.SyncTransforms();
                Vector3 front=label.ScanPoint+Vector3.forward*1.5f;
                WarehouseWmsScanResult Scan(Vector3 origin,Vector3 target)=>WarehouseWmsScanner.Trace(rig.physics,origin,(target-origin).normalized,null,rig.hits);
                var result=Scan(front,label.ScanPoint);
                Pass(result.success&&result.code=="CARTON:TEST-0001"&&result.id=="TEST-0001","A front-facing printed barcode reads its exact carton identity");
                var itemLabel=carton.GetComponent<WarehouseWmsCarton>().Labels[2];
                var itemRead=Scan(itemLabel.ScanPoint+itemLabel.Normal*1.5f,itemLabel.ScanPoint);
                Pass(itemRead.success&&itemRead.code=="ITEM:TAPE-48"&&itemRead.kind=="item","The separate side label reads the actual SKU for item lookup");
                world.SetCartonDocument(carton,"PO-1001");
                Pass(label.DescriptionText.text.Contains("PO-1001"),"Inbound carton labels can carry their actual purchase-order reference");
                Pass(PrintFits(label),"Actual three-line carton text stays within its paper and clear of the barcode");
                Pass(!Scan(new Vector3(.23f,1,2),new Vector3(.23f,1,.19f)).success,"Plain cardboard is not a barcode target");
                var wall=rig.Box("Opaque divider",label.ScanPoint+Vector3.forward*.7f,new Vector3(1,1,.04f));Physics.SyncTransforms();
                Pass(!Scan(front,label.ScanPoint).success,"A solid wall blocks the label behind it");
                Object.DestroyImmediate(wall.gameObject);Physics.SyncTransforms();
                Pass(!Scan(label.ScanPoint+Vector3.back*1.5f,label.ScanPoint).success,"A carton cannot be scanned through its back");
                Pass(!Scan(label.ScanPoint+new Vector3(2,0,.2f),label.ScanPoint).success,"An almost edge-on label is rejected");
                Pass(!Scan(label.ScanPoint+Vector3.forward*5,label.ScanPoint).success,"A label beyond the4.2m operating range is rejected");
                Pass(!Scan(label.ScanPoint+Vector3.forward*.05f,label.ScanPoint).success,"A label inside the minimum focus distance is rejected");
                var trigger=rig.Box("Unrelated bin trigger",label.ScanPoint+Vector3.forward*.5f,new Vector3(1,1,.1f));trigger.isTrigger=true;Physics.SyncTransforms();
                Pass(Scan(front,label.ScanPoint).success,"A bin volume does not hide its physical barcode");Object.DestroyImmediate(trigger.gameObject);
                var bin=world.FindBin("F01");Physics.SyncTransforms();
                Pass(Scan(bin.Label.ScanPoint+Vector3.up*1.65f,bin.Label.ScanPoint).success,"Floor-bin labels face upward and scan from standing height");
                void Place(Vector3 position){carton.position=position;carton.transform.position=position;Physics.SyncTransforms();}
                Place(bin.PlacementPosition(0,WarehouseWmsWorld.CartonSize(0)));carton.rotation=bin.PlacementRotation;carton.transform.rotation=bin.PlacementRotation;Physics.SyncTransforms();rig.Step(1);
                Pass(world.ContainsSupported(bin,carton,out _),"A settled whole carton on the floor is physically in its selected bin");
                Vector3 settled=carton.position;Place(carton.position+Vector3.right*1.5f);
                Pass(!world.ContainsSupported(bin,carton,out _),"A carton outside its bin cannot be confirmed");
                Place(settled+Vector3.up*.30f);carton.linearVelocity=Vector3.zero;Physics.SyncTransforms();
                Pass(!world.ContainsSupported(bin,carton,out _),"An unsupported carton in the bin volume is not put away");
                Place(settled);carton.isKinematic=true;Physics.SyncTransforms();
                Pass(!world.ContainsSupported(bin,carton,out _),"Carrier-restrained stock cannot be received by a volume alone");
                carton.isKinematic=false;carton.linearVelocity=Vector3.right;Physics.SyncTransforms();
                Pass(!world.ContainsSupported(bin,carton,out _),"Moving stock must settle before confirmation");Object.DestroyImmediate(carton.gameObject);
                world.AddPurchasedRacks();
                Pass(world.Bins.Count(b=>b.Id.StartsWith("A"))==18&&world.Bins.Count(b=>b.Id.StartsWith("A")&&b.CanPick)==6,"All18 authored wall-rack positions become bins; the six low faces are pickable");
            }
            using(var rig=new Rig(true))
            {
                var world=rig.world;var racks=world.Bins.Where(b=>b.Id.Length==9).ToArray();
                Pass(racks.Length==90&&racks.Count(b=>b.CanPick)==30&&racks.Select(b=>b.Id).Distinct().Count()==90,"Sandbox has90 unique rack-bin addresses and30 reachable low faces across rows A to E");
                Pass(racks.All(b=>b.Volume.isTrigger&&b.Capacity==8),"Every rack bin has an explicit non-solid storage volume and capacity");
                Pass(racks.Where(b=>b.OwnsShelf).All(TicketFitsBeam),"Every upper location ticket fits inside the actual beam face with a visible steel margin");
                Physics.SyncTransforms();
                Pass(racks.Where(b=>b.OwnsShelf).All(b=>
                    WarehouseWmsScanner.Trace(rig.physics,b.Label.ScanPoint+b.Label.Normal*.75f,-b.Label.Normal,null,rig.hits).code==b.Label.Code),
                    "Slim beam tickets keep a physically reachable barcode face ahead of the steel");
                var loaded=new List<(WarehouseWmsBin bin,Rigidbody body)>();
                for(int i=0;i<100;i++)
                {
                    var bin=racks[i%racks.Length];int variant=(i%racks.Length)%8;
                    var body=world.CreateCarton("LOAD-"+i.ToString("0000"),"SKU-"+variant,"Workshop supplies",12,"EA",bin.PlacementPosition(i/racks.Length,WarehouseWmsWorld.CartonSize(variant)),variant);
                    body.rotation=bin.PlacementRotation;loaded.Add((bin,body));
                }
                Physics.SyncTransforms();rig.Step(2);
                var failed=loaded.Where(p=>!world.ContainsSupported(p.bin,p.body,out _)).Select(p=>p.bin.Id+":"+p.body.position.ToString("F3")).ToArray();
                Pass(failed.Length==0,"100 varied cartons remain supported in their real rack bins"+(failed.Length>0?" / "+string.Join(",",failed.Take(5)):""));
                Pass(loaded.All(p=>!p.body.isKinematic&&p.body.IsSleeping()),"Settled populated stock sleeps while remaining dynamic and hand-pickable");
                Pass(loaded.Select(p=>p.body.GetComponent<BoxCollider>().size).Distinct().Count()==8,"Sandbox cartons retain eight physical package sizes");
                Pass(loaded.All(p=>p.body.GetComponent<WarehouseGrabbable>()!=null&&p.body.GetComponent<WarehouseWmsCarton>().Labels.Length==3),"Every carton has a carry marker, two carton barcodes and a side item barcode");
                Pass(world.Labels.All(PrintFits),"Measured print fits every carton size and rack/floor label without crossing barcode stripes");
                Pass(rig.root.GetComponentsInChildren<Light>().Length==0,"WMS geometry and labels add no lights");
                var van=new WarehouseCourierVisuals(rig.root.transform);
                try
                {
                    van.root.SetPositionAndRotation(new Vector3(3,-1.3325f,-28.2f),Quaternion.Euler(0,180,0));
                    var dispatch=world.BindDispatch(van.root,van.deck);Vector3 before=dispatch.Center;
                    van.root.position+=Vector3.right*2;Physics.SyncTransforms();
                    Pass(Vector3.Distance(dispatch.Center,before+Vector3.right*2)<.001f&&dispatch.Id=="DISPATCH-01","Dispatch is a real moving bin attached to the van deck");
                }
                finally{van.Dispose();Object.DestroyImmediate(van.root.gameObject);}
            }
        }
        static bool PrintFits(WarehouseWmsLabel label)
        {
            foreach(var text in new[]{label.DescriptionText,label.CodeText})
            {
                if(text==null)return false;
                Bounds bounds=text.GetComponent<Renderer>().localBounds;
                if(bounds.size.x<=.00001f||bounds.size.y<=.00001f)return false;
                Vector3 min=new Vector3(float.PositiveInfinity,float.PositiveInfinity,0),max=-min;
                for(int x=0;x<2;x++)for(int y=0;y<2;y++)
                {
                    Vector3 p=label.transform.InverseTransformPoint(text.transform.TransformPoint(new Vector3(x==0?bounds.min.x:bounds.max.x,y==0?bounds.min.y:bounds.max.y,bounds.center.z)));
                    min=Vector3.Min(min,p);max=Vector3.Max(max,p);
                }
                if(min.x < -label.PaperSize.x*.48f||max.x > label.PaperSize.x*.48f||min.y < -label.PaperSize.y*.48f||max.y > label.PaperSize.y*.48f)return false;
                Rect area=text==label.DescriptionText?label.DescriptionArea:label.CodeArea;
                const float tolerance=.00005f;
                if(min.x<area.xMin-tolerance||max.x>area.xMax+tolerance||min.y<area.yMin-tolerance||max.y>area.yMax+tolerance)return false;
                var textRect=Rect.MinMaxRect(min.x,min.y,max.x,max.y);
                if(textRect.Overlaps(label.BarcodeArea))return false;
            }
            return true;
        }
        static bool TicketFitsBeam(WarehouseWmsBin bin)
        {
            var label=bin.Label;var bay=bin.GetComponentInParent<PalletRackBay>();
            if(label==null||!label.ShelfTicket||bay==null)return false;
            foreach(var beam in bay.GetComponentsInChildren<BoxCollider>().Where(c=>c.name=="Load beam"))
            {
                bool fits=true;Vector3 half=beam.size*.5f;
                for(int corner=0;corner<4;corner++)
                {
                    var world=label.transform.TransformPoint(new Vector3(((corner&1)==0?-1:1)*label.PaperSize.x*.5f,((corner&2)==0?-1:1)*label.PaperSize.y*.5f,0));
                    Vector3 p=beam.transform.InverseTransformPoint(world)-beam.center;
                    if(Mathf.Abs(p.x)>half.x-.005f||Mathf.Abs(p.y)>half.y-.005f||p.z> -half.z-.001f||p.z< -half.z-.008f)fits=false;
                }
                if(fits)return true;
            }
            return false;
        }
        sealed class Rig:IDisposable
        {
            public readonly Scene scene;public readonly PhysicsScene physics;public readonly GameObject root;public readonly WarehouseWmsWorld world;public readonly RaycastHit[] hits=new RaycastHit[128];
            public Rig(bool sandbox=false)
            {
                scene=EditorSceneManager.NewPreviewScene();physics=scene.GetPhysicsScene();
                root=new GameObject("Disposable WMS world");SceneManager.MoveGameObjectToScene(root,scene);
                Box("Concrete floor",new Vector3(0,-.25f,0),new Vector3(40,.5f,40));
                var template=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/RackLab/Prefabs/ConnectedPalletRackRow.prefab");
                if(template==null)throw new InvalidOperationException("Rack source prefab is missing.");
                var row=Object.Instantiate(template);SceneManager.MoveGameObjectToScene(row,scene);row.transform.SetParent(root.transform);row.name="Starting wall racks";
                row.transform.SetPositionAndRotation(new Vector3(-10.42f,0,3.6f),Quaternion.Euler(0,-90,0));
                foreach(var bay in row.GetComponentsInChildren<PalletRackBay>())
                {foreach(var load in bay.exampleLoads)if(load!=null)Object.DestroyImmediate(load);bay.exampleLoads=Array.Empty<GameObject>();}
                foreach(var text in row.GetComponentsInChildren<TextMesh>())Object.DestroyImmediate(text.gameObject);
                foreach(var wear in row.GetComponentsInChildren<RackWearVariant>())Object.DestroyImmediate(wear);
                row.SetActive(sandbox);world=WarehouseWmsWorld.Ensure(root.transform);world.Initialize(sandbox);Physics.SyncTransforms();
            }
            public BoxCollider Box(string name,Vector3 position,Vector3 size)
            {var node=new GameObject(name);SceneManager.MoveGameObjectToScene(node,scene);node.transform.SetParent(root.transform);node.transform.position=position;var box=node.AddComponent<BoxCollider>();box.size=size;return box;}
            public void Step(float seconds){for(int i=0;i<Mathf.CeilToInt(seconds/.005f);i++)physics.Simulate(.005f);}
            public void Dispose(){if(scene.IsValid())EditorSceneManager.ClosePreviewScene(scene);Physics.SyncTransforms();}
        }
    }
}
