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
        static Material cream, trim, carpet, wood, dark, paper, carton, glass;

        [MenuItem("One Shift/Install front office and parcels")]
        public static string Install() { return InstallOffice(true); }

        [MenuItem("One Shift/Refresh office details only")]
        public static string RefreshOffice() { return InstallOffice(false); }

        static string InstallOffice(bool rebuildShell)
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
            if(rebuildShell) WarehouseEnvironmentBuilder.InstallIntoScene();
            cream = Mat("Old cream partitions", new Color(.66f,.64f,.55f));
            trim = Mat("Office olive trim", new Color(.30f,.34f,.29f));
            carpet = Mat("Tired office carpet", new Color(.22f,.27f,.25f));
            wood = Mat("Laminate desk", new Color(.42f,.29f,.18f));
            dark = Mat("Office charcoal", new Color(.10f,.13f,.12f));
            paper = Mat("Paper and ceiling tile", new Color(.80f,.77f,.66f));
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
            Box("West office partition", root, new Vector3(3.8f,1.5f,-7.035f), new Vector3(.14f,3,5.93f), cream);
            // Open internal doorway with a glazed supervisor's view across the floor.
            Box("Doorway west pier", root, new Vector3(4.235f,1.26f,-4), new Vector3(.73f,2.52f,.14f), cream);
            Box("Office north solid sill", root, new Vector3(8.7f,.54f,-4), new Vector3(5.2f,1.08f,.14f), cream);
            Box("Office north header", root, new Vector3(7.6f,2.76f,-4), new Vector3(7.6f,.48f,.14f), cream);
            foreach (float x in new[] { 4.62f, 6.12f }) Box("Interior door frame",root,new Vector3(x,1.23f,-4),new Vector3(.09f,2.46f,.20f),trim);
            Box("Interior door lintel",root,new Vector3(5.37f,2.45f,-4),new Vector3(1.59f,.09f,.20f),trim);
            for (int i = 0; i < 4; i++)
            {
                float x=6.77f+i*1.3f;
                Box("Office glazed window",root,new Vector3(x,1.81f,-4),new Vector3(1.24f,1.4f,.035f),glass);
                Box("Office mullion",root,new Vector3(x-.65f,1.8f,-4),new Vector3(.055f,1.47f,.17f),trim);
                // Real thin slats sit behind the glass, tilted open enough to
                // see the floor. The headrail, bottom rail and tapes attach them.
                Box("Blind headrail",root,new Vector3(x,2.50f,-4.14f),new Vector3(1.24f,.055f,.065f),trim,false);
                for(int b=0;b<14;b++)
                {
                    var slat=Box("Venetian blind slat",root,new Vector3(x,2.44f-b*.070f,-4.14f),new Vector3(1.22f,.008f,.065f),paper,false);
                    slat.localRotation=Quaternion.Euler(32,0,0);
                }
                Box("Blind bottom rail",root,new Vector3(x,1.49f,-4.14f),new Vector3(1.22f,.022f,.052f),paper,false);
                foreach(float side in new[]{-.39f,.39f})
                {
                    Box("Blind ladder cord",root,new Vector3(x+side,1.99f,-4.178f),new Vector3(.007f,1.01f,.007f),trim,false);
                    Box("Blind mounting bracket",root,new Vector3(x+side,2.50f,-4.105f),new Vector3(.035f,.07f,.08f),trim,false);
                }
            }
            Box("Office window sill",root,new Vector3(8.7f,1.08f,-4),new Vector3(5.2f,.07f,.28f),trim);
            Box("Suspended office ceiling",root,new Vector3(7.6f,3.07f,-7),new Vector3(7.6f,.12f,6),paper);
            for(float x=3.8f;x<11.5f;x+=.61f) Box("Ceiling tee",root,new Vector3(x,2.995f,-7),new Vector3(.025f,.025f,6),trim,false);
            for(float z=-10;z<=-4;z+=1.2f) Box("Ceiling cross tee",root,new Vector3(7.6f,2.99f,z),new Vector3(7.6f,.025f,.025f),trim,false);
            var diffuser=Mat("Office light diffuser",new Color(1.15f,1.10f,.96f));
            // A fluorescent lens stays steadily bright independently of
            // nearby lights, shadow priority and reflection state.
            diffuser.shader=Shader.Find("Universal Render Pipeline/Unlit");
            diffuser.shaderKeywords=Array.Empty<string>();diffuser.SetColor("_BaseColor",new Color(1.15f,1.10f,.96f));
            diffuser.globalIlluminationFlags=MaterialGlobalIlluminationFlags.None;EditorUtility.SetDirty(diffuser);
            for(int i=0;i<2;i++)
            {
                float x=5.7f+i*3.7f;
                Box("Office ceiling light",root,new Vector3(x,2.94f,-6.8f),new Vector3(.53f,.06f,1.08f),diffuser,false);
                var light=Child("Office ceiling fill",root,new Vector3(x,2.83f,-6.8f)).gameObject.AddComponent<Light>();
                // Two unshadowed point fills illuminate the ceiling and upper
                // partitions as well as the worktop. The old short downward
                // cones left every vertical surface outside their useful light.
                light.type=LightType.Point;
                light.color=new Color(1,.91f,.76f);light.intensity=13;light.range=6.2f;
                light.shadows=LightShadows.None;light.lightmapBakeType=LightmapBakeType.Realtime;
                light.renderMode=LightRenderMode.ForcePixel;
            }
            Label("OFFICE",root,new Vector3(7.9f,2.80f,-3.91f),.10f,180);
            Box("Front door masonry header",root,new Vector3(6.5f,2.8f,-10),new Vector3(1.6f,.8f,.24f),cream);
        }

        static void Furniture()
        {
            // One workstation supports the business and small-parcel tasks.
            // Keep the standing approach and both doorways entirely open.
            var desk=Child("Office parcel receiving desk",root,Vector3.zero);
            desk.gameObject.AddComponent<WarehouseParcelService>();
            Box("Dispatch desk top",desk,new Vector3(8.8f,.78f,-8.8f),new Vector3(3.6f,.07f,.9f),wood);
            foreach(float x in new[]{7.25f,10.35f}) Box("Desk pedestal",desk,new Vector3(x,.38f,-8.8f),new Vector3(.40f,.76f,.72f),trim);
            var computer=Child("Office computer",desk,Vector3.zero);
            computer.gameObject.AddComponent<WarehouseOfficeComputer>();
            var target=computer.gameObject.AddComponent<BoxCollider>();
            target.center=new Vector3(9.8f,1.20f,-8.99f);target.size=new Vector3(.64f,.43f,.20f);
            Box("Monitor foot",computer,new Vector3(9.8f,.85f,-9),new Vector3(.35f,.05f,.23f),dark,false);
            Box("Monitor stem",computer,new Vector3(9.8f,1.03f,-9),new Vector3(.08f,.34f,.08f),dark,false);
            Box("Office monitor",computer,new Vector3(9.8f,1.22f,-9.075f),new Vector3(.66f,.44f,.32f),paper,false);
            Box("Monitor inner bezel",computer,new Vector3(9.8f,1.22f,-8.908f),new Vector3(.57f,.34f,.012f),dark,false);
            var screen=Mat("Computer screen",new Color(.16f,.26f,.22f));
            screen.EnableKeyword("_EMISSION");screen.SetColor("_EmissionColor",new Color(.13f,.23f,.18f));
            screen.globalIlluminationFlags=MaterialGlobalIlluminationFlags.RealtimeEmissive;EditorUtility.SetDirty(screen);
            Box("Monitor screen",computer,new Vector3(9.8f,1.22f,-8.896f),new Vector3(.54f,.31f,.008f),screen,false);
            Box("Desktop taskbar",computer,new Vector3(9.8f,1.085f,-8.89f),new Vector3(.53f,.035f,.003f),trim,false);
            Box("Desktop window",computer,new Vector3(9.84f,1.24f,-8.889f),new Vector3(.38f,.20f,.003f),paper,false);
            Box("Desktop window bar",computer,new Vector3(9.84f,1.32f,-8.886f),new Vector3(.37f,.03f,.003f),trim,false);
            for(int icon=0;icon<3;icon++)Box("Desktop shortcut",computer,new Vector3(9.58f,1.32f-icon*.075f,-8.889f),new Vector3(.025f,.025f,.003f),paper,false);
            Label("LATCHFORD\nDISTRIBUTION",computer,new Vector3(9.84f,1.235f,-8.884f),.018f,180);
            Box("Monitor power lamp",computer,new Vector3(10.06f,1.025f,-8.908f),new Vector3(.012f,.008f,.006f),screen,false);
            var deskTarget=Child("Desk computer controls",desk,new Vector3(9.8f,.835f,-8.51f));
            deskTarget.gameObject.AddComponent<WarehouseOfficeComputer>();
            deskTarget.gameObject.AddComponent<BoxCollider>().size=new Vector3(.75f,.06f,.28f);
            Box("Keyboard",computer,new Vector3(9.8f,.84f,-8.59f),new Vector3(.47f,.035f,.15f),paper,false);
            Box("Computer tower",desk,new Vector3(10.0f,.25f,-8.8f),new Vector3(.24f,.48f,.46f),dark);
            Box("Mouse mat",desk,new Vector3(10.20f,.823f,-8.55f),new Vector3(.25f,.008f,.20f),dark,false);
            var mouse=Box("Office mouse",desk,new Vector3(10.20f,.845f,-8.55f),new Vector3(.06f,.036f,.10f),paper,false);
            mouse.localRotation=Quaternion.Euler(0,-8,0);
            // A small paperwork tray and wall planner make this a dispatch
            // workstation while preserving the clear parcel end of the desk.
            Box("Paperwork tray",desk,new Vector3(9.0f,.835f,-8.94f),new Vector3(.38f,.035f,.27f),trim,false);
            Box("Paperwork stack",desk,new Vector3(9.0f,.86f,-8.94f),new Vector3(.31f,.018f,.22f),paper,false);
            Box("Wall planner backing",root,new Vector3(9.5f,1.98f,-9.845f),new Vector3(.66f,.52f,.022f),trim,false);
            Box("Wall planner sheet",root,new Vector3(9.5f,1.98f,-9.829f),new Vector3(.61f,.47f,.006f),paper,false);
            Box("Wall planner header",root,new Vector3(9.5f,2.16f,-9.824f),new Vector3(.58f,.065f,.004f),trim,false);
            for(int line=0;line<4;line++) Box("Planner ruled line",root,new Vector3(9.5f,2.07f-line*.073f,-9.823f),new Vector3(.56f,.003f,.004f),trim,false);
            foreach(float x in new[]{9.29f,9.43f,9.57f,9.71f}) Box("Planner day column",root,new Vector3(x,1.96f,-9.822f),new Vector3(.003f,.28f,.004f),trim,false);
            Box("Desk power outlet",root,new Vector3(10.55f,.34f,-9.84f),new Vector3(.11f,.16f,.025f),paper,false);
            foreach(float y in new[]{.31f,.37f}) Box("Outlet socket",root,new Vector3(10.55f,y,-9.824f),new Vector3(.043f,.025f,.006f),dark,false);
            Box("Door mat",root,new Vector3(6.5f,.045f,-9.25f),new Vector3(1.4f,.035f,.7f),dark,false);
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
            Box("Front door glass",door.leaf,new Vector3(.71f,1.56f,0),new Vector3(1.22f,1.26f,.03f),glass,false,false);
            foreach(float x in new[]{.05f,1.37f}) Box("Door stile",door.leaf,new Vector3(x,1.55f,0),new Vector3(.10f,1.4f,.08f),trim,false,false);
            Box("Door upper rail",door.leaf,new Vector3(.71f,2.27f,0),new Vector3(1.42f,.07f,.08f),trim,false,false);
            foreach(float side in new[]{-1f,1f})
            {
                foreach(float y in new[]{1.02f,1.28f})
                    Box("Door handle mounting post",door.leaf,new Vector3(1.37f,y,side*.067f),new Vector3(.032f,.032f,.065f),dark,false,false);
                Box("Door pull handle",door.leaf,new Vector3(1.37f,1.15f,side*.108f),new Vector3(.028f,.29f,.028f),dark,false,false);
                Box("Door lock plate",door.leaf,new Vector3(1.37f,.93f,side*.043f),new Vector3(.05f,.065f,.008f),paper,false,false);
            }
            var blocker=Child("Closed front door collision",entry,new Vector3(6.5f,1.15f,-10)).gameObject.AddComponent<BoxCollider>();
            blocker.size=new Vector3(1.44f,2.30f,.12f);door.doorwayBlocker=blocker;
            Label("FRONT OFFICE",root,new Vector3(6.5f,2.67f,-10.16f),.15f,0);
            Label("PARCELS",root,new Vector3(8.45f,1.72f,-10.14f),.085f,0);
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
            var service=root.GetComponentInChildren<WarehouseParcelService>();
            var station=service.transform;
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
                service.deskPlaces[i]=Child("Received parcel position "+(i+1),station,new Vector3(7.35f+i*.52f,.815f+height*.5f,-8.8f));
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
            var office=GameObject.Find(Name);
            var fixtures=office.GetComponentsInChildren<Light>();
            if(fixtures.Length!=2||fixtures.Any(l=>l.type!=LightType.Point||l.shadows!=LightShadows.None||l.range<6)) throw new Exception("Office needs two broad unshadowed fills.");
            if(office.GetComponentsInChildren<WarehouseOfficeComputer>().Length!=2) throw new Exception("Computer and desk controls are not bound.");
            var slats=office.GetComponentsInChildren<Transform>().Where(t=>t.name=="Venetian blind slat").ToArray();
            if(slats.Length!=56||slats.Any(t=>t.localScale.y>.01f||Mathf.Abs(Mathf.DeltaAngle(t.localEulerAngles.x,32))>.01f))
                throw new Exception("Office blinds need thin, angled slats across four windows.");
            var pulls=door.leaf.GetComponentsInChildren<Transform>().Where(t=>t.name=="Door pull handle").ToArray();
            if(pulls.Length!=2||pulls.Any(t=>Mathf.Abs(t.localPosition.x-1.37f)>.001f)||door.leaf.GetComponentsInChildren<Transform>().Count(t=>t.name=="Door handle mounting post")!=4)
                throw new Exception("Both door pulls must mount to the solid latch stile.");
            if(office.GetComponentsInChildren<Transform>().Any(t=>t.name.Contains("chair")||t.name.Contains("Filing cabinet")||t.name.Contains("Coffee"))) throw new Exception("Extra office furniture returned.");
            var report="Office passed: one computer workstation with clear parcel area, restrained desk essentials, four mounted blinds with 56 thin angled slats, two door pulls attached to the latch stile, real front opening, continuous porch/ramp support, clear warehouse doorway, three parcel bindings, two broad unshadowed office fixtures.";
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
                if(group.Key.name=="Office light diffuser")
                {
                    renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
                    renderer.lightProbeUsage=LightProbeUsage.Off;renderer.reflectionProbeUsage=ReflectionProbeUsage.Off;
                }
                foreach(var filter in group){Object.DestroyImmediate(filter.GetComponent<MeshRenderer>());Object.DestroyImmediate(filter);}
            }
        }
    }
}
