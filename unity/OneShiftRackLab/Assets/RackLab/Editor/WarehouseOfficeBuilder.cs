using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    public static class WarehouseOfficeBuilder
    {
        const string Root = "Assets/RackLab/";
        const string Name = "Warehouse front office";
        static Transform root;
        static Material cream, trim, carpet, wood, dark, paper, rust, carton, glass;

        [MenuItem("One Shift/Install front office and parcels")]
        public static string Install()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before installing the office.");
            var scene = SceneManager.GetActiveScene();
            if (scene.path != Root + "Scenes/RackFloor.unity") throw new InvalidOperationException("Open RackFloor.unity.");
            Directory.CreateDirectory("Temp/OfficeBackup");
            EditorSceneManager.SaveScene(scene, "Temp/OfficeBackup/RackFloor-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".unity", true);
            Directory.CreateDirectory(Root + "Materials/Office");
            Directory.CreateDirectory(Root + "Models/Office");
            AssetDatabase.Refresh();
            var old = GameObject.Find(Name);
            if (old != null) Object.DestroyImmediate(old);
            root = new GameObject(Name).transform;
            // Marker cuts the south door through both render geometry and collision.
            WarehouseEnvironmentBuilder.InstallIntoScene();
            cream = Mat("Old cream partitions", new Color(.66f,.64f,.55f));
            trim = Mat("Office olive trim", new Color(.30f,.34f,.29f));
            carpet = Mat("Tired office carpet", new Color(.22f,.27f,.25f));
            wood = Mat("Laminate desk", new Color(.42f,.29f,.18f));
            dark = Mat("Office charcoal", new Color(.10f,.13f,.12f));
            paper = Mat("Paper and ceiling tile", new Color(.80f,.77f,.66f));
            rust = Mat("Faded rust upholstery", new Color(.40f,.22f,.16f));
            carton = Mat("Parcel cardboard", new Color(.57f,.39f,.22f));
            glass = AssetDatabase.LoadAssetAtPath<Material>(Root + "Materials/Environment/Glass.mat");
            Room(); Furniture(); Entrance(); Parcels();
            CombineStatic();
            Physics.SyncTransforms();
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
            AssetDatabase.SaveAssets();
            return Validate();
        }

        static void Room()
        {
            Box("Office carpet", root, new Vector3(7.6f,.018f,-7), new Vector3(7.5f,.032f,5.8f), carpet);
            Box("West office partition", root, new Vector3(3.8f,1.5f,-7), new Vector3(.14f,3,6), cream);
            // Open internal doorway with a glazed supervisor's view across the floor.
            Box("Doorway west pier", root, new Vector3(4.2f,1.5f,-4), new Vector3(.8f,3,.14f), cream);
            Box("Office north solid sill", root, new Vector3(8.7f,.54f,-4), new Vector3(5.2f,1.08f,.14f), cream);
            Box("Office north header", root, new Vector3(7.6f,2.76f,-4), new Vector3(7.6f,.48f,.14f), cream);
            foreach (float x in new[] { 4.62f, 6.12f }) Box("Interior door frame",root,new Vector3(x,1.23f,-4),new Vector3(.09f,2.46f,.20f),trim);
            Box("Interior door lintel",root,new Vector3(5.37f,2.45f,-4),new Vector3(1.59f,.09f,.20f),trim);
            for (int i = 0; i < 4; i++)
            {
                float x=6.77f+i*1.3f;
                Box("Office glazed window",root,new Vector3(x,1.81f,-4),new Vector3(1.24f,1.4f,.035f),glass);
                Box("Office mullion",root,new Vector3(x-.65f,1.8f,-4),new Vector3(.055f,1.47f,.17f),trim);
                // A few angled slats at the top leave the warehouse visible.
                for(int b=0;b<4;b++) Box("Venetian blind slat",root,new Vector3(x,2.40f-b*.085f,-4.13f),new Vector3(1.23f,.028f,.095f),paper);
            }
            Box("Office window sill",root,new Vector3(8.7f,1.08f,-4),new Vector3(5.2f,.07f,.28f),trim);
            Box("Suspended office ceiling",root,new Vector3(7.6f,3.07f,-7),new Vector3(7.6f,.12f,6),paper);
            for(float x=3.8f;x<11.5f;x+=.61f) Box("Ceiling tee",root,new Vector3(x,2.995f,-7),new Vector3(.025f,.025f,6),trim,false);
            for(float z=-10;z<=-4;z+=1.2f) Box("Ceiling cross tee",root,new Vector3(7.6f,2.99f,z),new Vector3(7.6f,.025f,.025f),trim,false);
            var diffuser=Mat("Office light diffuser",new Color(.82f,.79f,.68f));
            diffuser.EnableKeyword("_EMISSION");diffuser.SetColor("_EmissionColor",new Color(.65f,.61f,.48f));
            diffuser.globalIlluminationFlags=MaterialGlobalIlluminationFlags.None;EditorUtility.SetDirty(diffuser);
            for(int i=0;i<2;i++)
            {
                float x=5.7f+i*3.7f;
                Box("Office ceiling light",root,new Vector3(x,2.94f,-6.8f),new Vector3(.53f,.06f,1.08f),diffuser,false);
                var light=Child("Office ceiling fill",root,new Vector3(x,2.83f,-6.8f)).gameObject.AddComponent<Light>();
                light.type=LightType.Spot;light.transform.rotation=Quaternion.Euler(90,0,0);
                light.color=new Color(1,.89f,.70f);light.intensity=18;light.range=4.1f;light.spotAngle=115;light.innerSpotAngle=85;
                light.shadows=LightShadows.None;
            }
            Label("OFFICE / PARCEL RECEIVING",root,new Vector3(8.5f,2.80f,-3.9f),.12f,180);
            Box("Front door masonry header",root,new Vector3(6.5f,2.8f,-10),new Vector3(1.6f,.8f,.24f),cream);
        }

        static void Furniture()
        {
            // A modest dispatch desk, old tower PC, trays, chair and paperwork.
            Box("Dispatch desk top",root,new Vector3(9.7f,.78f,-8.8f),new Vector3(2.35f,.07f,.86f),wood);
            foreach(float x in new[]{8.75f,10.65f}) Box("Desk pedestal",root,new Vector3(x,.38f,-8.8f),new Vector3(.43f,.76f,.72f),trim);
            Box("Monitor foot",root,new Vector3(9.7f,.85f,-9),new Vector3(.35f,.05f,.23f),dark,false);
            Box("Monitor stem",root,new Vector3(9.7f,1.03f,-9),new Vector3(.08f,.34f,.08f),dark,false);
            Box("Old office monitor",root,new Vector3(9.7f,1.22f,-9),new Vector3(.57f,.37f,.17f),dark,false);
            Box("Monitor screen",root,new Vector3(9.7f,1.22f,-8.909f),new Vector3(.49f,.28f,.012f),carpet,false);
            Label("RECEIVING\n01  /  MORNING SHIFT",root,new Vector3(9.7f,1.22f,-8.90f),.025f,180);
            Box("Keyboard",root,new Vector3(9.7f,.84f,-8.59f),new Vector3(.47f,.035f,.15f),paper,false);
            Box("Paper stack",root,new Vector3(10.47f,.85f,-8.6f),new Vector3(.27f,.06f,.35f),paper,false);
            Box("Computer tower",root,new Vector3(10.1f,.25f,-8.8f),new Vector3(.24f,.48f,.46f),dark);
            Chair(9.65f,-7.75f);
            for(int i=0;i<2;i++)
            {
                float x=4.4f+i*.68f;
                Box("Filing cabinet",root,new Vector3(x,.65f,-9.35f),new Vector3(.61f,1.3f,.57f),trim);
                for(int j=0;j<4;j++)
                {
                    Box("Drawer face",root,new Vector3(x,.18f+j*.30f,-9.055f),new Vector3(.54f,.26f,.025f),cream,false);
                    Box("Drawer pull",root,new Vector3(x,.20f+j*.30f,-9.02f),new Vector3(.17f,.025f,.035f),dark,false);
                }
            }
            Box("Notice board frame",root,new Vector3(3.91f,1.75f,-6),new Vector3(.12f,1.1f,1.35f),wood);
            Box("Cork notice board",root,new Vector3(3.98f,1.75f,-6),new Vector3(.025f,.98f,1.23f),carton,false);
            for(int i=0;i<4;i++) Box("Pinned shift sheet",root,new Vector3(4.0f,1.52f+(i%2)*.42f,-6.4f+(i/2)*.56f),new Vector3(.015f,.30f,.22f),paper,false);
            Box("Break counter",root,new Vector3(10.85f,.84f,-5.15f),new Vector3(.75f,.07f,1.5f),wood);
            Box("Break cupboard",root,new Vector3(10.85f,.4f,-5.15f),new Vector3(.7f,.8f,1.4f),cream);
            Box("Coffee machine",root,new Vector3(10.85f,1.06f,-5.6f),new Vector3(.29f,.38f,.29f),dark,false);
            Box("Coffee pot",root,new Vector3(10.65f,.98f,-5.55f),new Vector3(.16f,.17f,.16f),trim,false);
            Box("Time clock backing",root,new Vector3(4.08f,1.45f,-4.75f),new Vector3(.16f,.38f,.27f),dark);
            Label("TIME CARDS",root,new Vector3(4.18f,1.75f,-4.75f),.05f,90);
            Box("Door mat",root,new Vector3(6.5f,.045f,-9.25f),new Vector3(1.4f,.035f,.7f),dark,false);
        }

        static void Chair(float x,float z)
        {
            Box("Office chair cushion",root,new Vector3(x,.49f,z),new Vector3(.52f,.10f,.48f),rust);
            Box("Office chair back",root,new Vector3(x,.85f,z+.22f),new Vector3(.51f,.6f,.09f),rust);
            Box("Office chair stem",root,new Vector3(x,.24f,z),new Vector3(.09f,.42f,.09f),dark,false);
            Box("Office chair feet",root,new Vector3(x,.08f,z),new Vector3(.64f,.06f,.08f),dark,false);
            Box("Office chair cross feet",root,new Vector3(x,.08f,z),new Vector3(.08f,.06f,.64f),dark,false);
        }

        static void Entrance()
        {
            var entry=Child("Front parcel door",root,Vector3.zero);
            var door=entry.gameObject.AddComponent<WarehouseOfficeDoor>();
            foreach(float x in new[]{5.73f,7.27f}) Box("Front door jamb",entry,new Vector3(x,1.2f,-10),new Vector3(.09f,2.4f,.3f),trim);
            Box("Front door lintel",entry,new Vector3(6.5f,2.37f,-10),new Vector3(1.6f,.09f,.30f),trim);
            door.leaf=Child("Hinged front door",entry,new Vector3(5.79f,0,-10.06f));
            var leafCollision=door.leaf.gameObject.AddComponent<BoxCollider>();
            leafCollision.center=new Vector3(.71f,1.16f,0);leafCollision.size=new Vector3(1.42f,2.32f,.075f);
            Box("Lower door panel",door.leaf,new Vector3(.71f,.44f,0),new Vector3(1.42f,.88f,.075f),trim,false,false);
            Box("Front door glass",door.leaf,new Vector3(.71f,1.56f,0),new Vector3(1.28f,1.26f,.03f),glass,false,false);
            foreach(float x in new[]{.035f,1.385f}) Box("Door stile",door.leaf,new Vector3(x,1.55f,0),new Vector3(.07f,1.4f,.08f),trim,false,false);
            Box("Door upper rail",door.leaf,new Vector3(.71f,2.27f,0),new Vector3(1.42f,.07f,.08f),trim,false,false);
            foreach(float z in new[]{-.10f,.10f}) Box("Door push bar",door.leaf,new Vector3(.71f,1.03f,z),new Vector3(1.1f,.04f,.04f),paper,false,false);
            var blocker=Child("Closed front door collision",entry,new Vector3(6.5f,1.15f,-10)).gameObject.AddComponent<BoxCollider>();
            blocker.size=new Vector3(1.44f,2.30f,.12f);door.doorwayBlocker=blocker;
            Label("FRONT OFFICE",root,new Vector3(6.5f,2.67f,-10.16f),.15f,0);
            Label("PARCEL DELIVERIES",root,new Vector3(8.45f,1.72f,-10.17f),.10f,0);
            Box("Parcel direction sign",root,new Vector3(8.45f,1.72f,-10.14f),new Vector3(1.9f,.46f,.035f),dark,false);
            Box("Entrance landing",root,new Vector3(6.5f,-.14f,-11.25f),new Vector3(5.4f,.28f,2.5f),cream);
            Box("Door canopy",root,new Vector3(6.5f,2.94f,-11),new Vector3(5.6f,.16f,2.5f),trim);
            foreach(float x in new[]{3.85f,9.15f}) Box("Canopy post",root,new Vector3(x,1.44f,-12.1f),new Vector3(.09f,2.88f,.09f),trim);
            float ground=-ReceivingTruckBuilder.FloorHeight, run=9.5f;
            float angle=-Mathf.Atan2(-ground,run)*Mathf.Rad2Deg;
            var ramp=Box("Front pedestrian ramp",root,new Vector3(6.5f,ground*.5f-.10f,-17.25f),new Vector3(2.4f,.20f,Mathf.Sqrt(run*run+ground*ground)),cream);
            ramp.localRotation=Quaternion.Euler(angle,0,0);
            // Rails follow the ramp; landing edges leave the parcel shelf accessible.
            foreach(float x in new[]{5.28f,7.72f})
            {
                var rail=Box("Ramp handrail",root,new Vector3(x,ground*.5f+1,-17.25f),new Vector3(.055f,.055f,Mathf.Sqrt(run*run+ground*ground)),trim);
                rail.localRotation=Quaternion.Euler(angle,0,0);
                for(int i=0;i<5;i++) Box("Ramp rail post",root,new Vector3(x,ground*(i/4f)+.5f,-12.5f-run*(i/4f)),new Vector3(.055f,1,.055f),trim);
            }
            foreach(float x in new[]{3.85f,9.15f}) Box("Landing rail",root,new Vector3(x,.95f,-11.3f),new Vector3(.055f,.055f,2.4f),trim);
        }

        static void Parcels()
        {
            var station=Child("Office parcel receiving desk",root,Vector3.zero);
            var service=station.gameObject.AddComponent<WarehouseParcelService>();
            Box("Parcel desk",station,new Vector3(7.95f,.75f,-5.6f),new Vector3(2.8f,.10f,.85f),wood);
            foreach(float x in new[]{6.75f,9.15f}) Box("Parcel desk leg",station,new Vector3(x,.36f,-5.6f),new Vector3(.08f,.72f,.62f),trim);
            service.statusLabel=Label("PARCELS / delivery due this morning",station,new Vector3(7.95f,1.48f,-5.98f),.08f,180);
            Box("Parcel desk sign",station,new Vector3(7.95f,1.48f,-6.01f),new Vector3(2.9f,.32f,.055f),dark);
            Box("Outside parcel shelf",root,new Vector3(8.3f,.54f,-11.05f),new Vector3(1.35f,.08f,.85f),wood);
            foreach(float x in new[]{7.75f,8.85f}) Box("Parcel shelf leg",root,new Vector3(x,.26f,-11.05f),new Vector3(.07f,.52f,.75f),trim);
            service.parcels=new WarehouseParcel[3];service.deskPlaces=new Transform[3];
            for(int i=0;i<3;i++)
            {
                float height=.23f+i*.04f;
                var node=Child("Small delivery parcel "+(i+1),root,new Vector3(7.9f+i*.4f,.58f+height*.5f,-11.05f));
                var parcel=node.gameObject.AddComponent<WarehouseParcel>();parcel.index=i;parcel.service=service;
                Box("Cardboard box",node,Vector3.zero,new Vector3(.34f,height,.31f),carton,true,false);
                Box("Packing tape",node,new Vector3(0,height*.5f+.003f,0),new Vector3(.065f,.006f,.315f),wood,false,false);
                Box("Shipping label",node,new Vector3(.09f,height*.5f+.008f,.035f),new Vector3(.11f,.005f,.16f),paper,false,false);
                for(int line=0;line<5;line++) Box("Parcel barcode",node,new Vector3(.055f+line*.014f,height*.5f+.011f,.065f),new Vector3(.006f,.003f,.065f),dark,false,false);
                service.parcels[i]=parcel;
                service.deskPlaces[i]=Child("Received parcel position "+(i+1),station,new Vector3(7.1f+i*.8f,.80f+height*.5f,-5.6f));
            }
        }

        public static string Validate()
        {
            var door=Object.FindFirstObjectByType<WarehouseOfficeDoor>();
            if(door==null || door.leaf==null || door.doorwayBlocker==null) throw new Exception("Front door missing.");
            Physics.SyncTransforms();
            bool wasEnabled=door.doorwayBlocker.enabled;
            door.doorwayBlocker.enabled=false;
            var leafColliders=door.leaf.GetComponentsInChildren<Collider>();
            foreach(var collider in leafColliders) collider.enabled=false;
            try
            {
                if(Physics.CheckCapsule(new Vector3(6.5f,.31f,-10),new Vector3(6.5f,1.5f,-10),.24f)) throw new Exception("Front door opening blocked.");
                if(Physics.CheckCapsule(new Vector3(5.37f,.31f,-4),new Vector3(5.37f,1.5f,-4),.24f)) throw new Exception("Office doorway blocked.");
                for(float z=-10.4f;z>=-21.9f;z-=.3f)
                    if(!Physics.Raycast(new Vector3(6.5f,1,z),Vector3.down,4)) throw new Exception("Front ramp has a floor gap at "+z);
            }
            finally { door.doorwayBlocker.enabled=wasEnabled; foreach(var collider in leafColliders) collider.enabled=true; }
            var service=Object.FindFirstObjectByType<WarehouseParcelService>();
            if(service==null||service.parcels.Length!=3||service.deskPlaces.Length!=3) throw new Exception("Parcel bindings missing.");
            var report="Office passed: real front opening, continuous porch/ramp support, clear warehouse doorway, three parcel bindings, two unshadowed office fixtures.";
            File.WriteAllText(Root+"Reports/warehouse-office-validation.txt",report+"\n");
            return report;
        }

        static Transform Child(string name,Transform parent,Vector3 position)
        {var go=new GameObject(name);go.transform.SetParent(parent,false);go.transform.localPosition=position;return go.transform;}
        static Transform Box(string name,Transform parent,Vector3 p,Vector3 size,Material material,bool collide=true,bool batch=true)
        {
            var go=GameObject.CreatePrimitive(PrimitiveType.Cube);go.name=name;go.transform.SetParent(parent,false);go.transform.localPosition=p;go.transform.localScale=size;
            go.GetComponent<Renderer>().sharedMaterial=material;
            if(material==glass) go.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;
            if(!collide) Object.DestroyImmediate(go.GetComponent<Collider>());
            go.isStatic=batch;return go.transform;
        }
        static Material Mat(string name,Color color)
        {
            string path=Root+"Materials/Office/"+name.Replace(" ","")+".mat";
            var mat=AssetDatabase.LoadAssetAtPath<Material>(path);
            if(mat==null){mat=new Material(Shader.Find("Universal Render Pipeline/Lit"));AssetDatabase.CreateAsset(mat,path);}
            mat.name=name;mat.SetColor("_BaseColor",color);mat.SetFloat("_Smoothness",.12f);mat.enableInstancing=true;EditorUtility.SetDirty(mat);return mat;
        }
        static TextMesh Label(string value,Transform parent,Vector3 p,float size,float yaw)
        {
            var node=Child(value,parent,p);node.localRotation=Quaternion.Euler(0,yaw,0);
            var text=node.gameObject.AddComponent<TextMesh>();text.text=value;text.font=Resources.Load<Font>("RackLabFont");
            text.fontSize=64;text.characterSize=size/6.4f;text.anchor=TextAnchor.MiddleCenter;text.alignment=TextAlignment.Center;text.color=new Color(.92f,.88f,.77f);
            text.GetComponent<MeshRenderer>().sharedMaterial=text.font.material;return text;
        }
        static void CombineStatic()
        {
            var filters=root.GetComponentsInChildren<MeshFilter>().Where(f=>f.gameObject.isStatic).ToArray();
            int index=0;
            foreach(var group in filters.GroupBy(f=>f.GetComponent<Renderer>().sharedMaterial))
            {
                var mesh=new Mesh {name="Office static "+group.Key.name};
                mesh.CombineMeshes(group.Select(f=>new CombineInstance{mesh=f.sharedMesh,transform=root.worldToLocalMatrix*f.transform.localToWorldMatrix}).ToArray());
                string path=Root+"Models/Office/Batch"+(index++)+".asset";
                var old=AssetDatabase.LoadAssetAtPath<Mesh>(path);
                if(old==null) AssetDatabase.CreateAsset(mesh,path);
                else
                {
                    var vertices=mesh.vertices;var normals=mesh.normals;var uv=mesh.uv;var triangles=mesh.triangles;
                    old.Clear();old.vertices=vertices;old.normals=normals;old.uv=uv;old.triangles=triangles;old.RecalculateBounds();old.UploadMeshData(false);
                    Object.DestroyImmediate(mesh);mesh=old;EditorUtility.SetDirty(old);
                }
                var node=Child(mesh.name,root,Vector3.zero);node.gameObject.isStatic=true;node.gameObject.AddComponent<MeshFilter>().sharedMesh=mesh;
                var renderer=node.gameObject.AddComponent<MeshRenderer>();renderer.sharedMaterial=group.Key;
                if(group.Key==glass) renderer.shadowCastingMode=ShadowCastingMode.Off;
                foreach(var filter in group){Object.DestroyImmediate(filter.GetComponent<MeshRenderer>());Object.DestroyImmediate(filter);}
            }
        }
    }
}
