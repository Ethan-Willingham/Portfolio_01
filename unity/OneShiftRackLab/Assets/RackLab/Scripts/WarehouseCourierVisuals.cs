using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    // Original small panel van. Fixed panels share one mesh; wheels, hinged
    // doors and the folding loading ramp retain their own transforms.
    public sealed class WarehouseCourierVisuals
    {
        public const float DeckHeight=.54f, RearZ=-2.38f, RoofHeight=2.70f;
        public Transform root, leftRear, rightRear, driverDoor, rampFirst, rampSecond;
        public Rigidbody body;
        public BoxCollider deck;
        public Transform[] wheels=new Transform[4], steering=new Transform[2];
        public DriverRig driver;
        readonly List<Object> owned=new List<Object>();
        readonly Material[] materials;
        float wheelAngle;

        public WarehouseCourierVisuals(Transform parent)
        {
            materials=new[] {
                Material("Courier warm panel",new Color(.34f,.27f,.18f),.15f),
                Material("Courier cream trim",new Color(.72f,.69f,.59f),.16f),
                Material("Courier charcoal",new Color(.055f,.067f,.06f),.08f),
                Material("Courier muted glass",new Color(.14f,.22f,.22f),.38f),
                Material("Courier lamp lens",new Color(.78f,.65f,.40f),.25f),
                Material("Courier rear lens",new Color(.45f,.085f,.05f),.18f)
            };
            root=Child("Career courier van",parent,Vector3.zero);
            body=root.gameObject.AddComponent<Rigidbody>();body.isKinematic=true;body.useGravity=false;
            body.mass=2100;body.interpolation=RigidbodyInterpolation.Interpolate;
            var mesh=new Parts();
            mesh.Box(new Vector3(0,.35f,-.05f),new Vector3(1.75f,.20f,4.5f),2);
            mesh.Box(new Vector3(0,.485f,-.80f),new Vector3(1.82f,.11f,3.16f),1);
            deck=Collision("Courier cargo deck",root,new Vector3(0,.485f,-.80f),new Vector3(1.82f,.11f,3.16f));
            foreach(float side in new[]{-1f,1f})
            {
                mesh.Box(new Vector3(side*.97f,1.61f,-.8f),new Vector3(.08f,2.16f,3.16f),0);
                mesh.Box(new Vector3(side*1.017f,1.13f,-.78f),new Vector3(.022f,.16f,3.08f),1);
                mesh.Box(new Vector3(side*.98f,1.60f,RearZ),new Vector3(.10f,2.19f,.10f),1);
                mesh.Box(new Vector3(side*.93f,.77f,-2.445f),new Vector3(.12f,.32f,.045f),5);
                Collision("Courier cargo wall",root,new Vector3(side*.97f,1.61f,-.8f),new Vector3(.08f,2.16f,3.16f));
            }
            mesh.Box(new Vector3(0,RoofHeight+.05f,-.79f),new Vector3(2.04f,.10f,3.23f),0);
            Collision("Courier roof",root,new Vector3(0,RoofHeight+.05f,-.79f),new Vector3(2.04f,.10f,3.23f));
            mesh.Box(new Vector3(0,1.61f,.76f),new Vector3(1.88f,2.16f,.09f),1);
            Collision("Courier cab partition",root,new Vector3(0,1.61f,.76f),new Vector3(1.88f,2.16f,.09f));
            mesh.Box(new Vector3(0,2.66f,RearZ),new Vector3(1.98f,.10f,.10f),1);
            mesh.Box(new Vector3(0,.43f,-2.46f),new Vector3(2.05f,.16f,.19f),2);
            mesh.Box(new Vector3(0,.80f,2.04f),new Vector3(1.94f,.70f,.67f),0);
            mesh.Box(new Vector3(0,1.21f,1.92f),new Vector3(1.91f,.15f,.86f),1);
            mesh.Box(new Vector3(0,1.65f,2.13f),new Vector3(1.77f,.76f,.065f),3,Quaternion.Euler(-17,0,0));
            mesh.Box(new Vector3(0,2.10f,1.47f),new Vector3(1.99f,.13f,1.47f),1);
            mesh.Box(new Vector3(.99f,.91f,1.34f),new Vector3(.08f,.68f,1.16f),0);
            mesh.Box(new Vector3(.99f,1.65f,1.34f),new Vector3(.05f,.72f,1.16f),3);
            mesh.Box(new Vector3(0,.46f,2.39f),new Vector3(2.03f,.18f,.16f),2);
            mesh.Box(new Vector3(0,.76f,2.39f),new Vector3(.92f,.24f,.035f),2);
            foreach(float side in new[]{-1f,1f})
            {
                mesh.Box(new Vector3(side*.70f,.94f,2.39f),new Vector3(.38f,.20f,.05f),4);
                mesh.Box(new Vector3(side*1.10f,1.55f,1.84f),new Vector3(.21f,.23f,.12f),2);
                mesh.Box(new Vector3(side*.48f,.94f,1.26f),new Vector3(.43f,.12f,.43f),2);
                mesh.Box(new Vector3(side*.48f,1.20f,1.01f),new Vector3(.43f,.59f,.11f),2);
            }
            Collision("Courier cab",root,new Vector3(0,1.11f,1.59f),new Vector3(1.88f,1.29f,1.68f));
            Finish(mesh,"Courier fixed panels",root);

            leftRear=RearDoor("Courier left rear door",-.94f,1);
            rightRear=RearDoor("Courier right rear door",.94f,-1);
            driverDoor=Child("Courier driver door",root,new Vector3(-1,.56f,1.94f));
            var door=new Parts();
            door.Box(new Vector3(0,.35f,-.58f),new Vector3(.07f,.70f,1.16f),0);
            door.Box(new Vector3(0,1.07f,-.58f),new Vector3(.045f,.72f,1.16f),3);
            door.Box(new Vector3(-.06f,.66f,-.88f),new Vector3(.05f,.055f,.17f),2);
            Finish(door,"Courier driver door panels",driverDoor);
            Collision("Courier driver door collision",driverDoor,new Vector3(0,.72f,-.58f),new Vector3(.075f,1.44f,1.16f));
            rampFirst=Child("Courier folding ramp",root,new Vector3(0,DeckHeight,RearZ));
            rampSecond=Child("Courier ramp outer hinge",rampFirst,new Vector3(0,0,-.95f));
            foreach(var piece in new[]{rampFirst,rampSecond})
            {
                var ramp=new Parts();ramp.Box(new Vector3(0,-.035f,-.475f),new Vector3(1.05f,.07f,.95f),1);
                foreach(float x in new[]{-.51f,.51f})ramp.Box(new Vector3(x,.02f,-.475f),new Vector3(.025f,.035f,.95f),2);
                Finish(ramp,"Courier ramp panel",piece);
                Collision("Courier loading ramp",piece,new Vector3(0,-.035f,-.475f),new Vector3(1.05f,.07f,.95f));
            }
            int wheelIndex=0;
            foreach(float z in new[]{1.48f,-1.48f})foreach(float side in new[]{-1f,1f})
            {
                var pivot=Child("Courier wheel steering",root,new Vector3(side*1.025f,.34f,z));
                wheels[wheelIndex]=Child("Courier rolling tyre",pivot,Vector3.zero);
                var wheel=new Parts();wheel.Cylinder(.34f,.24f,2);wheel.Cylinder(.18f,.25f,1);
                Finish(wheel,"Courier wheel",wheels[wheelIndex]);
                Collision("Courier road tyre",pivot,Vector3.zero,new Vector3(.24f,.68f,.68f));
                if(wheelIndex<2)steering[wheelIndex]=pivot;wheelIndex++;
            }
            SetRearDoors(0);SetRamp(0);SetDriverDoor(0);
            driver=DriverRig.Build(parent,parent.gameObject.scene,materials[0],this);
            driver.root.gameObject.SetActive(false);
        }

        Transform RearDoor(string name,float x,float direction)
        {
            var pivot=Child(name,root,new Vector3(x,DeckHeight,RearZ));
            var parts=new Parts();parts.Box(new Vector3(direction*.47f,1.01f,0),new Vector3(.94f,2.02f,.065f),0);
            parts.Box(new Vector3(direction*.47f,.82f,-.041f),new Vector3(.88f,.13f,.02f),1);
            parts.Box(new Vector3(direction*.82f,.84f,-.063f),new Vector3(.035f,.20f,.04f),2);
            Finish(parts,name+" panels",pivot);
            Collision(name+" collision",pivot,new Vector3(direction*.47f,1.01f,0),new Vector3(.94f,2.02f,.065f));
            return pivot;
        }

        public void SetRearDoors(float amount)
        {leftRear.localRotation=Quaternion.Euler(0,110*amount,0);rightRear.localRotation=Quaternion.Euler(0,-110*amount,0);}
        public void SetDriverDoor(float amount)=>driverDoor.localRotation=Quaternion.Euler(0,80*amount,0);
        public void SetRamp(float amount)
        {
            rampFirst.localRotation=Quaternion.Euler(Mathf.Lerp(90,-15,amount),0,0);
            rampSecond.localRotation=Quaternion.Euler(Mathf.Lerp(180,0,amount),0,0);
            rampSecond.localPosition=new Vector3(0,-.08f*(1-amount),-.95f);
        }
        public void Roll(float signedDistance,float steerDegrees)
        {
            wheelAngle=Mathf.Repeat(wheelAngle+signedDistance/.34f*Mathf.Rad2Deg,360);
            foreach(var wheel in wheels)wheel.localRotation=Quaternion.Euler(wheelAngle,0,0);
            foreach(var pivot in steering)pivot.localRotation=Quaternion.Euler(0,steerDegrees,0);
        }
        public void Dispose(){foreach(var item in owned)if(item!=null)Remove(item);owned.Clear();}
        Material Material(string name,Color color,float gloss)
        {
            var material=new Material(Shader.Find("Universal Render Pipeline/Lit")){name=name,enableInstancing=true};
            material.SetColor("_BaseColor",color);material.SetFloat("_Smoothness",gloss);owned.Add(material);return material;
        }
        void Finish(Parts parts,string name,Transform parent)
        {
            var mesh=parts.Mesh(name);owned.Add(mesh);
            var node=Child(name,parent,Vector3.zero);node.gameObject.AddComponent<MeshFilter>().sharedMesh=mesh;
            var renderer=node.gameObject.AddComponent<MeshRenderer>();renderer.sharedMaterials=materials;
            renderer.shadowCastingMode=ShadowCastingMode.On;renderer.receiveShadows=true;
        }
        public static Transform Child(string name,Transform parent,Vector3 position)
        {var node=new GameObject(name).transform;node.SetParent(parent,false);node.localPosition=position;return node;}
        public static BoxCollider Collision(string name,Transform parent,Vector3 center,Vector3 size)
        {var node=Child(name,parent,center);var box=node.gameObject.AddComponent<BoxCollider>();box.size=size;box.contactOffset=.005f;return box;}
        public static void Remove(Object item){if(Application.isPlaying)Object.Destroy(item);else Object.DestroyImmediate(item);}

        public sealed class DriverRig
        {
            public Transform root;
            public Rigidbody body;
            public CapsuleCollider capsule;
            Transform pelvis,spine,head,leftArm,rightArm,leftForearm,rightForearm,leftThigh,rightThigh,leftShin,rightShin,leftFoot,rightFoot;
            float stride;
            public Vector3 Hands=>root.TransformPoint(new Vector3(0,1.08f,.43f));

            public static DriverRig Build(Transform parent,Scene scene,Material fallback,WarehouseCourierVisuals owner)
            {
                WarehousePlayerVisual source=null;
                foreach(var node in scene.GetRootGameObjects())
                {
                    var candidate=node.GetComponentInChildren<WarehousePlayerVisual>(true);
                    if(candidate!=null && candidate.walking!=null){source=candidate;break;}
                }
                var rig=new DriverRig();
                if(source!=null)
                {
                    var clone=Object.Instantiate(source.gameObject,parent,false);clone.name="Courier driver";
                    var visual=clone.GetComponent<WarehousePlayerVisual>();visual.enabled=false;
                    rig.root=clone.transform;rig.pelvis=visual.pelvis;rig.spine=visual.spine;rig.head=visual.head;
                    rig.leftArm=visual.leftArm;rig.rightArm=visual.rightArm;rig.leftForearm=visual.leftForearm;rig.rightForearm=visual.rightForearm;
                    rig.leftThigh=visual.leftThigh;rig.rightThigh=visual.rightThigh;rig.leftShin=visual.leftShin;rig.rightShin=visual.rightShin;
                    rig.leftFoot=visual.leftFoot;rig.rightFoot=visual.rightFoot;
                    foreach(var renderer in clone.GetComponentsInChildren<Renderer>())renderer.shadowCastingMode=ShadowCastingMode.On;
                    Remove(visual);
                }
                else
                {
                    rig.root=Child("Courier driver",parent,Vector3.zero);
                    rig.pelvis=Child("Courier hips",rig.root,new Vector3(0,.92f,0));
                    rig.spine=Child("Courier shirt",rig.pelvis,new Vector3(0,.18f,0));rig.head=Child("Courier head",rig.spine,new Vector3(0,.40f,0));
                    rig.leftArm=Child("Courier left shoulder",rig.spine,new Vector3(-.24f,.27f,0));rig.rightArm=Child("Courier right shoulder",rig.spine,new Vector3(.24f,.27f,0));
                    rig.leftForearm=Child("Courier left elbow",rig.leftArm,new Vector3(0,-.3f,0));rig.rightForearm=Child("Courier right elbow",rig.rightArm,new Vector3(0,-.3f,0));
                    rig.leftThigh=Child("Courier left hip",rig.pelvis,new Vector3(-.11f,0,0));rig.rightThigh=Child("Courier right hip",rig.pelvis,new Vector3(.11f,0,0));
                    rig.leftShin=Child("Courier left knee",rig.leftThigh,new Vector3(0,-.44f,0));rig.rightShin=Child("Courier right knee",rig.rightThigh,new Vector3(0,-.44f,0));
                    rig.leftFoot=Child("Courier left boot",rig.leftShin,new Vector3(0,-.32f,0));rig.rightFoot=Child("Courier right boot",rig.rightShin,new Vector3(0,-.32f,0));
                    void Part(Transform joint,Vector3 p,Vector3 size,int material){var parts=new Parts();parts.Box(p,size,material);owner.Finish(parts,joint.name+" mesh",joint);}
                    Part(rig.spine,new Vector3(0,.12f,0),new Vector3(.43f,.46f,.27f),0);Part(rig.head,new Vector3(0,.11f,0),new Vector3(.27f,.27f,.25f),1);
                    foreach(var joint in new[]{rig.leftArm,rig.rightArm,rig.leftForearm,rig.rightForearm})Part(joint,new Vector3(0,-.13f,0),new Vector3(.13f,.28f,.14f),0);
                    foreach(var joint in new[]{rig.leftThigh,rig.rightThigh,rig.leftShin,rig.rightShin})Part(joint,new Vector3(0,-.18f,0),new Vector3(.16f,.37f,.19f),2);
                    foreach(var joint in new[]{rig.leftFoot,rig.rightFoot})Part(joint,new Vector3(0,-.06f,.05f),new Vector3(.18f,.12f,.30f),2);
                }
                rig.body=rig.root.gameObject.AddComponent<Rigidbody>();rig.body.isKinematic=true;rig.body.useGravity=false;rig.body.mass=78;
                rig.body.interpolation=RigidbodyInterpolation.Interpolate;
                rig.capsule=rig.root.gameObject.AddComponent<CapsuleCollider>();rig.capsule.center=new Vector3(0,.88f,0);rig.capsule.height=1.74f;rig.capsule.radius=.23f;
                rig.Pose(0,false,0,1);return rig;
            }
            public void Pose(float distance,bool carrying,float bend,float seated)
            {
                stride+=distance*7.5f;float swing=Mathf.Sin(stride)*(distance>.0001f?1:0);
                pelvis.localPosition=new Vector3(0,.92f-bend*.25f,-.055f);pelvis.localRotation=Quaternion.identity;
                spine.localRotation=Quaternion.Euler(7*seated+bend*35,0,-swing*1.2f*(1-seated));head.localRotation=Quaternion.Euler(-7*seated-bend*12,0,0);
                leftThigh.localRotation=Quaternion.Euler(Mathf.Lerp(swing*29,-83,seated)-bend*12,0,-2);
                rightThigh.localRotation=Quaternion.Euler(Mathf.Lerp(-swing*29,-83,seated)-bend*12,0,2);
                leftShin.localRotation=Quaternion.Euler(Mathf.Lerp(Mathf.Max(0,-swing)*30,82,seated)+bend*25,0,0);
                rightShin.localRotation=Quaternion.Euler(Mathf.Lerp(Mathf.Max(0,swing)*30,82,seated)+bend*25,0,0);
                leftFoot.localRotation=rightFoot.localRotation=Quaternion.Euler(-8*seated,0,0);
                float left=carrying?-65:-swing*19,right=carrying?-65:swing*19;
                leftArm.localRotation=Quaternion.Euler(Mathf.Lerp(left,-28,seated),0,carrying?2:-5);
                rightArm.localRotation=Quaternion.Euler(Mathf.Lerp(right,-20,seated),0,carrying?-2:5);
                leftForearm.localRotation=rightForearm.localRotation=Quaternion.Euler(Mathf.Lerp(carrying?-30:-10,-26,seated),0,0);
            }
        }

        sealed class Parts
        {
            readonly List<Vector3> vertices=new List<Vector3>();readonly List<int>[] triangles={new List<int>(),new List<int>(),new List<int>(),new List<int>(),new List<int>(),new List<int>()};
            static readonly Vector3[] Corners={new Vector3(-.5f,-.5f,-.5f),new Vector3(.5f,-.5f,-.5f),new Vector3(.5f,.5f,-.5f),new Vector3(-.5f,.5f,-.5f),new Vector3(-.5f,-.5f,.5f),new Vector3(.5f,-.5f,.5f),new Vector3(.5f,.5f,.5f),new Vector3(-.5f,.5f,.5f)};
            static readonly int[] Faces={0,3,2,1,4,5,6,7,0,4,7,3,1,2,6,5,0,1,5,4,3,7,6,2};
            void Quad(Vector3 a,Vector3 b,Vector3 c,Vector3 d,int material){int i=vertices.Count;vertices.Add(a);vertices.Add(b);vertices.Add(c);vertices.Add(d);triangles[material].AddRange(new[]{i,i+1,i+2,i,i+2,i+3});}
            public void Box(Vector3 centre,Vector3 size,int material,Quaternion? rotation=null)
            {
                var matrix=Matrix4x4.TRS(centre,rotation??Quaternion.identity,size);
                for(int face=0;face<6;face++)Quad(matrix.MultiplyPoint3x4(Corners[Faces[face*4]]),matrix.MultiplyPoint3x4(Corners[Faces[face*4+1]]),matrix.MultiplyPoint3x4(Corners[Faces[face*4+2]]),matrix.MultiplyPoint3x4(Corners[Faces[face*4+3]]),material);
            }
            public void Cylinder(float radius,float width,int material)
            {
                for(int i=0;i<12;i++)
                {
                    float a=i*Mathf.PI/6,b=(i+1)*Mathf.PI/6;
                    Vector3 p=new Vector3(0,Mathf.Cos(a)*radius,Mathf.Sin(a)*radius),q=new Vector3(0,Mathf.Cos(b)*radius,Mathf.Sin(b)*radius),x=Vector3.right*width*.5f;
                    Quad(p-x,q-x,q+x,p+x,material);Quad(-x,q-x,p-x,-x,material);Quad(x,p+x,q+x,x,material);
                }
            }
            public Mesh Mesh(string name){var mesh=new Mesh{name=name};mesh.SetVertices(vertices);mesh.subMeshCount=triangles.Length;for(int i=0;i<triangles.Length;i++)mesh.SetTriangles(triangles[i],i);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;}
        }
    }
}
