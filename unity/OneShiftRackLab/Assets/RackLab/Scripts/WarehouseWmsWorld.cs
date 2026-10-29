using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace OneShift.RackLab
{
    [DisallowMultipleComponent, RequireComponent(typeof(Rigidbody))]
    public sealed class WarehouseWmsCarton : MonoBehaviour
    {
        public string Id, Sku, ItemName, Unit, DocumentId;
        public int UnitsPerCarton, Variant;
        public WarehouseWmsLabel[] Labels;
        public Rigidbody Body => GetComponent<Rigidbody>();
    }

    public sealed class WarehouseWmsBin : MonoBehaviour
    {
        public string Id, Kind;
        public int Capacity;
        public bool CanPick, OwnsShelf;
        public BoxCollider Volume;
        public WarehouseWmsLabel Label;
        public Vector3 Center => Volume.transform.TransformPoint(Volume.center);
        public float SurfaceY => Volume.transform.TransformPoint(Volume.center - Vector3.up * Volume.size.y * .5f).y;
        public Quaternion PlacementRotation => transform.rotation * Quaternion.Euler(0, 180, 0);

        // Positions are explicit opening-state setup or supplier spawn targets.
        // A transfer or pick never calls this method to move existing freight.
        public Vector3 PlacementPosition(int index, Vector3 cartonSize)
        {
            float width = Volume.size.x - .09f, depth = Volume.size.z - .09f;
            int columns = Mathf.Max(1, Mathf.FloorToInt(width / (cartonSize.x + .035f)));
            int rows = Mathf.Max(1, Mathf.FloorToInt(depth / (cartonSize.z + .035f)));
            int rowSize = columns * rows, layer = index / rowSize, inLayer = index % rowSize;
            float x = (inLayer % columns - (columns - 1) * .5f) * (cartonSize.x + .035f);
            float z = (inLayer / columns - (rows - 1) * .5f) * (cartonSize.z + .035f);
            Vector3 local = Volume.center + new Vector3(x, -Volume.size.y * .5f + cartonSize.y * (.5f + layer) + .006f, z);
            return Volume.transform.TransformPoint(local);
        }
    }

    // One shared physical vocabulary for both modes. Geometry is independent of
    // WMS records; the runtime must explicitly seed or transact the ledger.
    public sealed class WarehouseWmsWorld : MonoBehaviour
    {
        readonly List<WarehouseWmsBin> bins = new List<WarehouseWmsBin>();
        readonly List<WarehouseWmsLabel> labels = new List<WarehouseWmsLabel>();
        readonly List<UnityEngine.Object> owned = new List<UnityEngine.Object>();
        readonly Dictionary<int, Mesh> cartonMeshes = new Dictionary<int, Mesh>();
        readonly RaycastHit[] supportHits = new RaycastHit[24];
        Material[] cardboard;
        Material tape, paper, ink, shelf, guide, steel, signPanel, signTrim;
        PhysicsScene physics;
        Transform stockRoot;
        bool initialized, racksAdded;
        public IReadOnlyList<WarehouseWmsBin> Bins => bins;
        public IReadOnlyList<WarehouseWmsLabel> Labels => labels;

        public static WarehouseWmsWorld Ensure(Transform owner)
        {
            var world = owner.GetComponent<WarehouseWmsWorld>();
            if (world == null) world = owner.gameObject.AddComponent<WarehouseWmsWorld>();
            return world;
        }

        public void Initialize(bool sandbox)
        {
            if (initialized) return; initialized = true; physics = gameObject.scene.GetPhysicsScene();
            cardboard = new[] {
                Mat("WMS kraft board", new Color(.54f,.37f,.22f)), Mat("WMS pale board",new Color(.66f,.50f,.32f)),
                Mat("WMS recycled board",new Color(.43f,.34f,.24f)), Mat("WMS cream carton",new Color(.73f,.68f,.54f)) };
            tape = Mat("WMS carton tape", new Color(.38f,.27f,.16f));
            paper = Mat("WMS matte label stock", new Color(.72f,.70f,.64f));
            ink = Mat("WMS printed ink", new Color(.055f,.065f,.055f));
            paper.SetFloat("_Smoothness",.04f);ink.SetFloat("_Smoothness",.02f);
            shelf = Mat("WMS shelf deck",new Color(.48f,.42f,.30f));
            guide = Mat("WMS bay paint",new Color(.55f,.43f,.25f));
            steel = Mat("WMS sign post",new Color(.25f,.29f,.25f));
            signPanel = Mat("WMS charcoal enamel sign",new Color(.115f,.145f,.125f));
            signTrim = Mat("WMS muted brass sign trim",new Color(.48f,.37f,.23f));
            signPanel.SetFloat("_Smoothness",.06f);signTrim.SetFloat("_Smoothness",.08f);
            stockRoot = Child("Physical WMS cartons",transform,Vector3.zero);
            ReplaceLegacySigns();
            // The porch shelf is the courier's real drop point. Internal receiving
            // and dispatch remain separate bins, even when they contain no stock.
            AddFloorBin("REC-01","receiving",new Vector3(8.28f,.56f,-11.05f),new Vector3(1.5f,1.25f,.72f),8,false,
                new Vector3(8.28f,1.32f,-10.68f),Quaternion.Euler(0,180,0),false);
            // Both dock work areas flank the garage. The middle 4.8 metres
            // remain an unobstructed travel lane to the door and dock plate.
            AddFloorBin("REC-02","receiving",new Vector3(-3.9f,.012f,10f),new Vector3(3f,1.45f,2f),18,false);
            AddFloorBin("STAGE-01","staging",new Vector3(3.9f,.012f,10f),new Vector3(3f,1.45f,2f),18,false);
            AreaSigns("GOODS RECEIVING","REC-02 / INBOUND",-3.9f);
            AreaSigns("READY TO SHIP","STAGE-01 / OUTBOUND",3.9f);
            Sign(transform,new Vector3(8.28f,1.70f,-10.68f),Quaternion.identity,new Vector2(.88f,.27f),"PARCEL RECEIVING","REC-01 / FRONT DOOR");
            WarehouseCareer.Cube("Parcel sign post extension",transform,new Vector3(8.28f,1.49f,-10.665f),new Vector3(.025f,.36f,.025f),steel);
            AddSmallShelves();
            if (sandbox) AddRacks(true);
        }

        public WarehouseWmsBin FindBin(string id) => bins.Find(bin => bin != null && bin.Id == id);
        public void AddPurchasedRacks() { if (!initialized) Initialize(false); AddRacks(false); }

        void AddRacks(bool sandbox)
        {
            if (racksAdded) return;
            Transform row = FindNamed("Starting wall racks");
            if (row == null) { Debug.LogError("The WMS could not find the authored rack row."); return; }
            racksAdded = true; row.gameObject.SetActive(true);
            row.SetPositionAndRotation(new Vector3(-10.5f,0,3.6f),Quaternion.Euler(0,-90,0));
            if (!sandbox) { RegisterRackRow(row, "A"); return; }
            var rows=new List<Transform>{row};
            float[] rowX={-7.6f,-4.7f,7.6f,10.5f};
            for(int i=0;i<rowX.Length;i++)
            {
                var copy=Instantiate(row.gameObject,row.parent);copy.name="WMS storage row "+(char)('B'+i);
                copy.transform.SetPositionAndRotation(new Vector3(rowX[i],0,3.6f),Quaternion.Euler(0,i<2?-90:90,0));
                rows.Add(copy.transform);owned.Add(copy);
            }
            for(int i=0;i<rows.Count;i++)RegisterRackRow(rows[i],((char)('A'+i)).ToString());
        }

        void RegisterRackRow(Transform row, string aisle)
        {
            var bays = row.GetComponentsInChildren<PalletRackBay>(true).OrderBy(b => row.InverseTransformPoint(b.transform.position).x).ToArray();
            for (int b = 0; b < bays.Length; b++)
            {
                // The bay identifier shares the top beam face, between its two
                // location tickets. Nothing floats over the rack opening.
                Sign(bays[b].transform,new Vector3(0,PalletRackBay.BeamPitch*2-.065f,-.535f),Quaternion.identity,new Vector2(.44f,.108f),
                    "BAY "+(b+1).ToString("00"),"");
                var slots = bays[b].palletPositions.OrderBy(p => p.localPosition.y).ThenBy(p => p.localPosition.x).ToArray();
                for (int slot = 0; slot < slots.Length; slot++)
                {
                    int level = slot / 2 + 1, position = slot % 2 + 1;
                    string id = aisle + (b + 1).ToString("00") + "-" + level.ToString("00") + "-" + position.ToString("00");
                    var node = Child("Bin / " + id, slots[slot], Vector3.zero);
                    var bin = node.gameObject.AddComponent<WarehouseWmsBin>();
                    bin.Id=id;bin.Kind="storage";bin.Capacity=8;bin.CanPick=level==1;bin.OwnsShelf=level>1;
                    float surface = level > 1 ? .024f : .001f;
                    bin.Volume=node.gameObject.AddComponent<BoxCollider>();bin.Volume.isTrigger=true;
                    bin.Volume.center=new Vector3(0,surface+.70f,0);bin.Volume.size=new Vector3(1.04f,1.40f,1.17f);
                    if(level>1)
                    {
                        var deck=WarehouseCareer.Cube("Carton shelf deck",node,new Vector3(0,surface-.013f,0),new Vector3(1.04f,.026f,1.17f),shelf);
                        var collider=deck.gameObject.AddComponent<BoxCollider>();collider.contactOffset=.005f;
                    }
                    if(level==1)
                    {
                        WarehouseCareer.Cube("Low pick ticket holder",node,new Vector3(0,.15f,-.526f),new Vector3(.51f,.13f,.012f),steel);
                        WarehouseCareer.Cube("Ticket holder foot",node,new Vector3(0,.045f,-.519f),new Vector3(.025f,.09f,.025f),steel);
                    }
                    // The authored beam face is z=-.530 and 130 mm tall.
                    // A 108 mm ticket has a real steel margin above and below.
                    float ticketY=level==1?.15f:-PalletRackBay.DeckAboveBeam-.066f;
                    bin.Label=Label(node,new Vector3(0,ticketY,-.534f),Quaternion.Euler(0,180,0),new Vector2(.49f,.108f),
                        "BIN:"+id,"bin",id,id,"LEVEL "+level+" / "+(position==1?"LEFT":"RIGHT"));
                    bins.Add(bin);
                }
            }
            var locations=bays.SelectMany(b=>b.palletPositions).Select(p=>p.position).ToArray();
            if(locations.Length>0)
            {
                float front=locations.Min(p=>p.z)-.72f,back=locations.Max(p=>p.z)+.72f;
                string range="BAYS 01 - "+bays.Length.ToString("00");
                Sign(transform,new Vector3(row.position.x,2.75f,front),Quaternion.identity,new Vector2(.48f,.62f),"ROW "+aisle,range,true);
                Sign(transform,new Vector3(row.position.x,2.75f,back),Quaternion.Euler(0,180,0),new Vector2(.48f,.62f),"ROW "+aisle,range,true);
            }
        }

        void AddSmallShelves()
        {
            // This is the owner's original three-shelf green rack, retained in
            // Resources for browser builds. It is distinct from the pallet row.
            var source=Resources.Load<GameObject>("WarehouseSmallShelf");
            if(source==null){Debug.LogError("The original small shelving prefab is missing from Resources.");return;}
            for(int bay=1;bay<=2;bay++)
            {
                var rack=Instantiate(source,transform);rack.name="Small shelving / S"+bay.ToString("00");owned.Add(rack);
                rack.transform.SetPositionAndRotation(new Vector3(bay==1?-9.4f:-6.9f,0,-9.15f),Quaternion.Euler(0,180,0));
                rack.transform.localScale=new Vector3(.8f,.55f,.8f);
                // Slots use world metre dimensions, so carton size and gravity
                // are never scaled with the reused rack mesh and colliders.
                for(int level=1;level<=3;level++)for(int position=1;position<=2;position++)
                {
                    string id="S"+bay.ToString("00")+"-"+level.ToString("00")+"-"+position.ToString("00");
                    var node=Child("Bin / "+id,transform,Vector3.zero);
                    node.SetPositionAndRotation(rack.transform.TransformPoint(new Vector3(position==1?-.576f:.576f,level*1.12f+.015f,0)),rack.transform.rotation);
                    var bin=node.gameObject.AddComponent<WarehouseWmsBin>();
                    bin.Id=id;bin.Kind="storage";bin.Capacity=1;bin.CanPick=true;bin.OwnsShelf=true;
                    bin.Volume=node.gameObject.AddComponent<BoxCollider>();bin.Volume.isTrigger=true;
                    bin.Volume.center=new Vector3(0,.265f,0);bin.Volume.size=new Vector3(.89f,.53f,.84f);
                    bin.Label=Label(node,new Vector3(0,-.0385f,-.435f),Quaternion.Euler(0,180,0),new Vector2(.43f,.062f),
                        "BIN:"+id,"bin",id,id,"LEVEL "+level+" / "+(position==1?"LEFT":"RIGHT"));
                    bins.Add(bin);
                }
                Sign(transform,new Vector3(rack.transform.position.x,2.09f,-8.712f),Quaternion.Euler(0,180,0),new Vector2(.66f,.15f),"SHELF "+bay.ToString("00"),"");
            }
        }

        void AreaSigns(string name,string location,float x)
        {
            Sign(transform,new Vector3(x,2.58f,11.65f),Quaternion.identity,new Vector2(2.15f,.52f),name,location);
            PaintedText(name,new Vector3(x,.030f,8.34f),new Vector2(2.65f,.37f));
            PaintedText(location,new Vector3(x,.031f,7.96f),new Vector2(2.40f,.19f));
        }
        void PaintedText(string value,Vector3 position,Vector2 size)
        {
            var text=new GameObject("Floor marking / "+value).AddComponent<TextMesh>();
            text.transform.SetParent(transform,false);text.transform.localPosition=position;
            text.transform.localRotation=Quaternion.Euler(90,0,0);WarehouseCareer.UseWarehouseFont(text);
            text.fontSize=128;text.anchor=TextAnchor.MiddleCenter;text.alignment=TextAlignment.Center;text.text=value;
            text.color=new Color(.52f,.44f,.28f);WarehouseWmsLabel.FitText(text,size,position);
            var renderer=text.GetComponent<Renderer>();renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
        }
        void ReplaceLegacySigns()
        {
            // Legacy pallet-truck wording is misleading in the carton WMS.
            foreach(string name in new[]{"OFFICE","RECEIVING / 01","YARD"})
            {var previous=FindNamed(name);if(previous!=null)previous.gameObject.SetActive(false);}
            Sign(transform,new Vector3(7.9f,2.76f,-3.905f),Quaternion.Euler(0,180,0),new Vector2(1.15f,.25f),"OFFICE","WAREHOUSE MANAGEMENT");
            Sign(transform,new Vector3(0,4.43f,11.69f),Quaternion.identity,new Vector2(1.75f,.40f),"DOCK 01","KEEP VEHICLE ACCESS CLEAR");
            var old=FindNamed("WAIT FOR DOORS");
            if(old!=null)
            {
                Sign(old.parent,old.localPosition+new Vector3(0,0,-.005f),old.localRotation,new Vector2(.92f,.19f),"DOCK EDGE","KEEP CLEAR");
                old.gameObject.SetActive(false);
            }
        }
        void Sign(Transform parent,Vector3 position,Quaternion rotation,Vector2 size,string heading,string detail,bool rowMarker=false)
        {
            var sign=Child("Wayfinding / "+heading,parent,position);sign.localRotation=rotation;
            bool industrial=rowMarker||size.x>=.8f;
            var backing=WarehouseCareer.Cube(industrial?"Matte enamel wayfinding panel":"Plain printed bay card",sign,Vector3.zero,new Vector3(size.x,size.y,.016f),industrial?signPanel:paper);
            backing.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;
            if(industrial)SignHardware(sign,size);
            var title=new GameObject("Sign heading").AddComponent<TextMesh>();title.transform.SetParent(sign,false);
            WarehouseCareer.UseWarehouseFont(title);title.fontSize=128;title.anchor=TextAnchor.MiddleCenter;title.alignment=TextAlignment.Center;
            title.text=rowMarker?heading.Substring(4):heading;
            title.color=industrial?new Color(.65f,.63f,.55f):new Color(.004f,.004f,.004f);title.fontStyle=FontStyle.Bold;
            bool hasDetail=!string.IsNullOrEmpty(detail);
            WarehouseWmsLabel.FitText(title,new Vector2(size.x*.86f,size.y*(rowMarker?.48f:hasDetail?.43f:.65f)),new Vector3(0,size.y*(rowMarker?.04f:hasDetail?.13f:0),-.0105f));
            if(hasDetail)
            {
                var caption=new GameObject("Sign detail").AddComponent<TextMesh>();caption.transform.SetParent(sign,false);
                WarehouseCareer.UseWarehouseFont(caption);caption.fontSize=64;caption.anchor=TextAnchor.MiddleCenter;caption.alignment=TextAlignment.Center;
                caption.text=detail;caption.color=title.color;
                WarehouseWmsLabel.FitText(caption,new Vector2(size.x*.86f,size.y*(rowMarker?.11f:.18f)),new Vector3(0,-size.y*.30f,-.0105f));
            }
            if(rowMarker)
            {
                var eyebrow=new GameObject("Row category").AddComponent<TextMesh>();eyebrow.transform.SetParent(sign,false);WarehouseCareer.UseWarehouseFont(eyebrow);
                eyebrow.fontSize=64;eyebrow.anchor=TextAnchor.MiddleCenter;eyebrow.alignment=TextAlignment.Center;eyebrow.color=title.color;eyebrow.text="ROW";
                WarehouseWmsLabel.FitText(eyebrow,new Vector2(size.x*.55f,size.y*.10f),new Vector3(size.x*.018f,size.y*.36f,-.0105f));
                foreach(float x in new[]{-size.x*.29f,size.x*.29f})
                    WarehouseCareer.Cube("Upright sign clamp",sign,new Vector3(x,0,.025f),new Vector3(.025f,size.y*.80f,.05f),steel);
            }
            foreach(var renderer in sign.GetComponentsInChildren<Renderer>()){renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=true;}
        }

        void SignHardware(Transform parent,Vector2 size)
        {
            // One shared-material mesh per sign carries its inset keyline,
            // classification band and four square fixing heads. No extra lights
            // or renderer per bolt, and no decoration on the small bin tickets.
            var vertices=new List<Vector3>();var triangles=new List<int>();var normals=new List<Vector3>();
            void Plate(float x,float y,float width,float height)
            {
                int first=vertices.Count;const float z=-.010f;
                vertices.Add(new Vector3(x-width*.5f,y-height*.5f,z));vertices.Add(new Vector3(x-width*.5f,y+height*.5f,z));
                vertices.Add(new Vector3(x+width*.5f,y+height*.5f,z));vertices.Add(new Vector3(x+width*.5f,y-height*.5f,z));
                for(int i=0;i<4;i++)normals.Add(Vector3.back);
                triangles.Add(first);triangles.Add(first+1);triangles.Add(first+2);triangles.Add(first);triangles.Add(first+2);triangles.Add(first+3);
            }
            float inset=Mathf.Min(.026f,size.y*.075f),line=Mathf.Min(.005f,size.y*.014f);
            float xEdge=size.x*.5f-inset,yEdge=size.y*.5f-inset;
            Plate(0,yEdge,size.x-inset*2,line);Plate(0,-yEdge,size.x-inset*2,line);
            Plate(-xEdge,0,line,size.y-inset*2);Plate(xEdge,0,line,size.y-inset*2);
            Plate(0,-size.y*.415f,size.x*.74f,size.y*.028f);
            float bolt=Mathf.Min(.014f,size.y*.045f);
            foreach(float x in new[]{-1f,1f})foreach(float y in new[]{-1f,1f})
                Plate(x*(size.x*.5f-inset*.5f),y*(size.y*.5f-inset*.5f),bolt,bolt);
            var mesh=new Mesh{name="Industrial sign border and fixings"};mesh.SetVertices(vertices);mesh.SetNormals(normals);mesh.SetTriangles(triangles,0);mesh.RecalculateBounds();owned.Add(mesh);
            var node=Child("Inset border and mounting heads",parent,Vector3.zero);node.gameObject.AddComponent<MeshFilter>().sharedMesh=mesh;
            node.gameObject.AddComponent<MeshRenderer>().sharedMaterial=signTrim;
        }

        WarehouseWmsBin AddFloorBin(string id,string kind,Vector3 floor,Vector3 size,int capacity,bool canPick,
            Vector3? labelPosition=null,Quaternion? labelRotation=null,bool markFloor=true)
        {
            var node=Child("Bin / "+id,transform,floor);
            var bin=node.gameObject.AddComponent<WarehouseWmsBin>();bin.Id=id;bin.Kind=kind;bin.Capacity=capacity;bin.CanPick=canPick;
            bin.Volume=node.gameObject.AddComponent<BoxCollider>();bin.Volume.isTrigger=true;bin.Volume.center=Vector3.up*size.y*.5f;bin.Volume.size=size;
            if(markFloor)
            {
                var line=node.gameObject.AddComponent<LineRenderer>();line.sharedMaterial=guide;line.loop=true;line.useWorldSpace=false;
                line.positionCount=4;line.widthMultiplier=kind=="storage"?.038f:.065f;line.shadowCastingMode=ShadowCastingMode.Off;line.receiveShadows=false;
                line.SetPositions(new[]{new Vector3(-size.x*.5f,.007f,-size.z*.5f),new Vector3(size.x*.5f,.007f,-size.z*.5f),new Vector3(size.x*.5f,.007f,size.z*.5f),new Vector3(-size.x*.5f,.007f,size.z*.5f)});
            }
            Vector3 plaque=labelPosition.HasValue?labelPosition.Value:floor+new Vector3(0,.014f,-size.z*.5f-.20f);
            Quaternion angle=labelRotation??Quaternion.Euler(-90,0,0);
            if(!markFloor&&labelPosition.HasValue)
            {
                Vector3 local=node.InverseTransformPoint(plaque);
                WarehouseCareer.Cube("Receiving label upright",node,new Vector3(local.x,local.y*.5f,local.z+.012f),new Vector3(.025f,local.y,.025f),steel);
                WarehouseCareer.Cube("Receiving label holder",node,local+new Vector3(0,0,.009f),new Vector3(.50f,.26f,.012f),steel);
            }
            bin.Label=Label(node,node.InverseTransformPoint(plaque),Quaternion.Inverse(node.rotation)*angle,new Vector2(.48f,.24f),"BIN:"+id,"bin",id,id,WarehouseWmsVocabulary.BinName(id));
            bins.Add(bin);return bin;
        }

        public WarehouseWmsBin BindDispatch(Transform van, BoxCollider deck)
        {
            if (!initialized) Initialize(false);
            var existing=FindBin("DISPATCH-01");if(existing!=null)return existing;
            var node=Child("Bin / DISPATCH-01",van,new Vector3(0,WarehouseCourierVisuals.DeckHeight, -.8f));
            var bin=node.gameObject.AddComponent<WarehouseWmsBin>();bin.Id="DISPATCH-01";bin.Kind="dispatch";bin.Capacity=6;bin.CanPick=false;
            bin.Volume=node.gameObject.AddComponent<BoxCollider>();bin.Volume.isTrigger=true;bin.Volume.center=Vector3.up*.96f;bin.Volume.size=new Vector3(1.8f,1.92f,3.05f);
            bin.Label=Label(node,new Vector3(.77f,.65f,-1.60f),Quaternion.Euler(0,180,0),new Vector2(.26f,.19f),"BIN:DISPATCH-01","bin",bin.Id,"DISPATCH-01","CARRIER COLLECTION");
            bins.Add(bin);return bin;
        }

        public static Vector3 CartonSize(int variant)
        {
            switch(((variant%8)+8)%8)
            {
                case 0:return new Vector3(.48f,.36f,.38f);
                case 1:return new Vector3(.44f,.40f,.40f);
                case 2:return new Vector3(.36f,.28f,.32f);
                case 3:return new Vector3(.54f,.26f,.38f);
                case 4:return new Vector3(.38f,.46f,.34f);
                case 5:return new Vector3(.58f,.22f,.34f);
                case 6:return new Vector3(.40f,.34f,.42f);
                default:return new Vector3(.50f,.32f,.36f);
            }
        }

        public Rigidbody CreateCarton(string cartonId,string sku,string itemName,int unitsPerCarton,string unit,Vector3 position,int variant=0)
        {
            if(!initialized)Initialize(false);
            var node=Child("Carton "+cartonId,stockRoot,Vector3.zero);node.position=position;
            var body=node.gameObject.AddComponent<Rigidbody>();body.mass=4f+variant%5;body.linearDamping=.12f;body.angularDamping=.3f;
            body.interpolation=RigidbodyInterpolation.Interpolate;body.collisionDetectionMode=CollisionDetectionMode.Discrete;
            node.gameObject.AddComponent<BoxCollider>().size=CartonSize(variant);
            RelabelCarton(body,cartonId,sku,itemName,unitsPerCarton,unit,variant,true);body.Sleep();return body;
        }

        public WarehouseWmsCarton RelabelCarton(Rigidbody body,string cartonId,string sku,string itemName,int unitsPerCarton,string unit,int variant=0,bool replaceVisuals=true)
        {
            if(!initialized)Initialize(false);
            var carton=body.GetComponent<WarehouseWmsCarton>();if(carton==null)carton=body.gameObject.AddComponent<WarehouseWmsCarton>();
            carton.Id=cartonId;carton.Sku=sku;carton.ItemName=itemName;carton.UnitsPerCarton=unitsPerCarton;carton.Unit=unit;carton.Variant=variant;
            var marker=body.GetComponent<WarehouseGrabbable>();if(marker==null)marker=body.gameObject.AddComponent<WarehouseGrabbable>();marker.label=itemName+" / "+cartonId;
            if(replaceVisuals)
            {
                foreach(Transform child in body.transform.Cast<Transform>().ToArray())
                {
                    if(child.GetComponent<Renderer>()!=null||child.GetComponent<WarehouseWmsLabel>()!=null) {child.gameObject.SetActive(false);WarehouseCourierVisuals.Remove(child.gameObject);}
                }
                var box=body.GetComponent<BoxCollider>();box.size=CartonSize(variant);
                var visual=Child("Sealed corrugated carton",body.transform,Vector3.zero);
                visual.gameObject.AddComponent<MeshFilter>().sharedMesh=CartonMesh(variant);
                visual.gameObject.AddComponent<MeshRenderer>().sharedMaterials=new[]{cardboard[((variant%cardboard.Length)+cardboard.Length)%cardboard.Length],tape};
            }
            else if(carton.Labels!=null)foreach(var old in carton.Labels)if(old!=null){old.gameObject.SetActive(false);WarehouseCourierVisuals.Remove(old.gameObject);}
            Vector3 size=body.GetComponent<BoxCollider>().size;
            Vector2 paperSize=new Vector2(Mathf.Min(.32f,size.x*.82f),Mathf.Min(.20f,size.y*.79f));
            string detail=WarehouseWmsVocabulary.ItemCode(sku)+" / "+unitsPerCarton+" "+unit;
            var front=Label(body.transform,new Vector3(0,0,size.z*.5f+.002f),Quaternion.identity,paperSize,"CARTON:"+cartonId,"carton",cartonId,itemName,detail);
            var top=Label(body.transform,new Vector3(0,size.y*.5f+.003f,-size.z*.10f),Quaternion.Euler(-90,0,0),paperSize,"CARTON:"+cartonId,"carton",cartonId,itemName,detail);
            var item=Label(body.transform,new Vector3(-size.x*.5f-.002f,0,0),Quaternion.Euler(0,-90,0),
                new Vector2(Mathf.Min(.30f,size.z*.82f),Mathf.Min(.17f,size.y*.75f)),"ITEM:"+sku,"item",sku,itemName,detail);
            carton.Labels=new[]{front,top,item};return carton;
        }

        public void SetCartonDocument(Rigidbody body,string documentId)
        {
            var carton=body!=null?body.GetComponent<WarehouseWmsCarton>():null;if(carton==null)return;
            carton.DocumentId=documentId;
            string detail=WarehouseWmsVocabulary.ItemCode(carton.Sku)+" / "+carton.UnitsPerCarton+" "+carton.Unit;
            if(!string.IsNullOrEmpty(documentId))detail+="\n"+documentId;
            if(carton.Labels!=null)foreach(var label in carton.Labels)if(label!=null)label.SetPrintedDetail(carton.ItemName,detail);
        }

        Mesh CartonMesh(int variant)
        {
            variant=((variant%8)+8)%8;if(cartonMeshes.TryGetValue(variant,out var cached))return cached;
            var pieces=new List<CombineInstance>();var paperParts=new List<CombineInstance>();
            var cube=GameObject.CreatePrimitive(PrimitiveType.Cube);cube.SetActive(false);var primitive=cube.GetComponent<MeshFilter>().sharedMesh;
            Vector3 size=CartonSize(variant);
            pieces.Add(new CombineInstance{mesh=primitive,transform=Matrix4x4.TRS(Vector3.zero,Quaternion.identity,size)});
            paperParts.Add(new CombineInstance{mesh=primitive,transform=Matrix4x4.TRS(new Vector3(0,size.y*.5f+.001f,0),Quaternion.identity,new Vector3(.055f,.002f,size.z+.002f))});
            paperParts.Add(new CombineInstance{mesh=primitive,transform=Matrix4x4.TRS(new Vector3(0,0,-size.z*.5f-.001f),Quaternion.identity,new Vector3(.055f,size.y,.002f))});
            // Small compression seams and a second band distinguish the larger cases.
            if(variant==3||variant==5)paperParts.Add(new CombineInstance{mesh=primitive,transform=Matrix4x4.TRS(new Vector3(0,size.y*.5f+.002f,0),Quaternion.identity,new Vector3(size.x+.002f,.002f,.035f))});
            var board=new Mesh();board.CombineMeshes(pieces.ToArray(),true,true);var bands=new Mesh();bands.CombineMeshes(paperParts.ToArray(),true,true);
            var mesh=new Mesh{name="WMS carton shape "+variant};mesh.CombineMeshes(new[]{new CombineInstance{mesh=board,transform=Matrix4x4.identity},new CombineInstance{mesh=bands,transform=Matrix4x4.identity}},false,true);
            WarehouseCourierVisuals.Remove(cube);WarehouseCourierVisuals.Remove(board);WarehouseCourierVisuals.Remove(bands);
            cartonMeshes[variant]=mesh;owned.Add(mesh);return mesh;
        }

        public bool ContainsSupported(WarehouseWmsBin bin,Rigidbody body,out string reason)
        {
            reason="Set the carton down inside "+(bin!=null?bin.Id:"the selected bin")+".";
            if(bin==null||body==null||!body.gameObject.activeInHierarchy||!bin.gameObject.activeInHierarchy||body.isKinematic)return false;
            var marker=body.GetComponent<WarehouseGrabbable>();if(marker!=null&&marker.Holder!=null){reason="Put the carton down before confirming.";return false;}
            if(body.linearVelocity.sqrMagnitude>.0225f||body.angularVelocity.sqrMagnitude>.09f){reason="Wait for the carton to settle.";return false;}
            var box=body.GetComponent<BoxCollider>();if(box==null)return false;
            Vector3 min=bin.Volume.center-bin.Volume.size*.5f,max=bin.Volume.center+bin.Volume.size*.5f;
            for(int corner=0;corner<8;corner++)
            {
                Vector3 local=box.center+Vector3.Scale(box.size*.5f,new Vector3((corner&1)==0?-1:1,(corner&2)==0?-1:1,(corner&4)==0?-1:1));
                Vector3 point=bin.Volume.transform.InverseTransformPoint(box.transform.TransformPoint(local));
                if(point.x<min.x-.012f||point.x>max.x+.012f||point.z<min.z-.012f||point.z>max.z+.012f||point.y<min.y-.045f||point.y>max.y+.025f)return false;
            }
            Bounds bounds=box.bounds;int supports=0;
            for(int sample=0;sample<5;sample++)
            {
                Vector3 point=bounds.center;point.y=bounds.min.y+.03f;
                if(sample>0){point.x+=bounds.extents.x*.65f*((sample&1)==0?-1:1);point.z+=bounds.extents.z*.65f*((sample&2)==0?-1:1);}
                int count=physics.Raycast(point,Vector3.down,supportHits,.09f,~0,QueryTriggerInteraction.Ignore);
                bool supported=false;
                for(int hit=0;hit<count;hit++)
                {
                    var contact=supportHits[hit];if(contact.collider==null||contact.collider.attachedRigidbody==body||contact.normal.y<.70f)continue;
                    var other=contact.collider.GetComponentInParent<WarehouseGrabbable>();if(other!=null&&other.Holder!=null)continue;
                    if(contact.collider.GetComponentInParent<RackWalkController>()!=null||contact.collider.GetComponentInParent<ForkliftDriveController>()!=null)continue;
                    supported=true;break;
                }
                if(supported)supports++;
            }
            if(supports<2){reason="The carton needs stable support inside "+bin.Id+".";return false;}
            reason="Carton is settled in "+bin.Id+".";return true;
        }

        WarehouseWmsLabel Label(Transform parent,Vector3 position,Quaternion rotation,Vector2 size,string code,string kind,string id,string caption,string detail)
        {var label=WarehouseWmsLabel.Create(parent,position,rotation,size,code,kind,id,caption,detail,paper,ink);labels.Add(label);return label;}
        Material Mat(string name,Color color,bool unlit=false)
        {var material=WarehouseCareer.Material(name,color,unlit);material.enableInstancing=true;owned.Add(material);return material;}
        static Transform Child(string name,Transform parent,Vector3 position)
        {var node=new GameObject(name).transform;node.SetParent(parent,false);node.localPosition=position;return node;}
        Transform FindNamed(string name)
        {foreach(var root in gameObject.scene.GetRootGameObjects())foreach(var node in root.GetComponentsInChildren<Transform>(true))if(node.name==name)return node;return null;}

        // Printed labels remain part of their physical surfaces at all distances.
        // Ordinary camera-frustum and depth tests hide them, never a distance toggle.
        void OnDestroy(){foreach(var value in owned)if(value!=null)WarehouseCourierVisuals.Remove(value);owned.Clear();}
    }
}
