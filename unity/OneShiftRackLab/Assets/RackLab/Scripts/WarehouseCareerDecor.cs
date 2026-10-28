using UnityEngine;

namespace OneShift.RackLab
{
    public sealed class WarehouseCareerDecor : MonoBehaviour, IWarehouseInteraction
    {
        AudioSource speaker;
        Transform fish, tail, mouth;
        float songTime;
        public string Prompt => speaker!=null&&speaker.isPlaying?"Quiet the singing fish":"Play the singing fish";
        public string ActionKey => "E";

        public static void InstallFish(Transform parent)
        {
            var node=new GameObject("Singing warehouse fish");node.transform.SetParent(parent);node.transform.position=new Vector3(10.99f,1.55f,-6.7f);node.transform.rotation=Quaternion.Euler(0,-90,0);
            var controller=node.AddComponent<WarehouseCareerDecor>();
            var walnut=WarehouseCareer.Material("Fish plaque walnut",new Color(.26f,.15f,.08f));
            var scales=WarehouseCareer.Material("Fish olive scales",new Color(.32f,.43f,.27f));
            var belly=WarehouseCareer.Material("Fish belly",new Color(.71f,.68f,.45f));
            var dark=WarehouseCareer.Material("Fish eye",new Color(.06f,.09f,.06f));
            Oval("Wooden oval",node.transform,Vector3.zero,new Vector3(.72f,.38f,.06f),walnut);
            var target=node.AddComponent<BoxCollider>();target.size=new Vector3(.74f,.4f,.18f);target.center=new Vector3(0,0,.06f);
            controller.fish=new GameObject("Fish pivot").transform;controller.fish.SetParent(node.transform,false);
            Oval("Fish body",controller.fish,new Vector3(-.025f,0,.085f),new Vector3(.46f,.22f,.13f),scales);
            Oval("Pale belly",controller.fish,new Vector3(-.025f,-.054f,.112f),new Vector3(.37f,.10f,.08f),belly);
            Oval("Fish head",controller.fish,new Vector3(-.24f,.012f,.09f),new Vector3(.15f,.19f,.14f),scales);
            Oval("Eye",controller.fish,new Vector3(-.265f,.053f,.164f),new Vector3(.028f,.028f,.015f),dark);
            controller.tail=WarehouseCareer.Cube("Tail",controller.fish,new Vector3(.23f,0,.08f),new Vector3(.13f,.20f,.035f),scales);
            controller.tail.localRotation=Quaternion.Euler(0,0,45);
            controller.mouth=WarehouseCareer.Cube("Singing jaw",controller.fish,new Vector3(-.29f,-.038f,.115f),new Vector3(.08f,.035f,.10f),belly);
            var label=new GameObject("Fish plaque label").AddComponent<TextMesh>();label.transform.SetParent(node.transform,false);label.transform.localPosition=new Vector3(0,-.135f,.07f);label.transform.localRotation=Quaternion.Euler(0,180,0);
            WarehouseCareer.UseWarehouseFont(label);
            label.text="EMPLOYEE OF THE MONTH";label.fontSize=32;label.characterSize=.011f;label.anchor=TextAnchor.MiddleCenter;label.color=new Color(.84f,.75f,.52f);
            controller.speaker=node.AddComponent<AudioSource>();controller.speaker.spatialBlend=1;controller.speaker.minDistance=1;controller.speaker.maxDistance=10;controller.speaker.rolloffMode=AudioRolloffMode.Linear;controller.speaker.volume=.24f;
            controller.speaker.clip=OriginalTune();
        }
        static Transform Oval(string name,Transform parent,Vector3 position,Vector3 size,Material material)
        {
            var node=GameObject.CreatePrimitive(PrimitiveType.Sphere);node.name=name;node.transform.SetParent(parent,false);node.transform.localPosition=position;node.transform.localScale=size;
            WarehouseCareer.Remove(node.GetComponent<Collider>());node.GetComponent<Renderer>().sharedMaterial=material;return node.transform;
        }
        public void Interact(RackWalkController walking)
        {
            if(speaker==null)return;
            if(speaker.isPlaying)speaker.Stop();else{songTime=0;speaker.Play();}
        }
        void Update()
        {
            if(fish==null||Time.timeScale<=0)return;
            bool playing=speaker!=null&&speaker.isPlaying;
            if(playing)songTime+=Time.deltaTime;
            fish.localRotation=Quaternion.Euler(0,playing?Mathf.Sin(songTime*6)*16:0,playing?Mathf.Sin(songTime*3)*3:0);
            tail.localRotation=Quaternion.Euler(0,playing?Mathf.Sin(songTime*13)*30:0,45);
            mouth.localRotation=Quaternion.Euler(playing?Mathf.Abs(Mathf.Sin(songTime*17))*36:0,0,0);
        }
        static AudioClip OriginalTune()
        {
            // Original six-second wordless melody, synthesized once on purchase.
            const int rate=22050;const float beat=.3f;
            int[] notes={48,52,55,57,55,52,50,48,55,59,60,59,55,52,50,48,48,55,52,48};
            var data=new float[Mathf.CeilToInt(notes.Length*beat*rate)];
            for(int i=0;i<data.Length;i++)
            {
                float time=i/(float)rate,local=time%beat;
                int note=notes[Mathf.Min(notes.Length-1,Mathf.FloorToInt(time/beat))];
                float frequency=440*Mathf.Pow(2,(note-69)/12f),envelope=Mathf.Min(1,local/.02f)*Mathf.Min(1,(beat-local)/.05f);
                float phase=2*Mathf.PI*frequency*time+.12f*Mathf.Sin(time*34);
                data[i]=envelope*(Mathf.Sin(phase)*.45f+Mathf.Sin(phase*2)*.15f+Mathf.Sin(phase*3)*.06f);
            }
            var clip=AudioClip.Create("Latchford fish original tune",data.Length,1,rate,false);clip.SetData(data,0);return clip;
        }
        public static void InstallFlames(Transform forklift)
        {
            var orange=WarehouseCareer.Material("Flame kit rust",new Color(.82f,.30f,.10f));
            var gold=WarehouseCareer.Material("Flame kit ochre",new Color(.94f,.68f,.22f));
            foreach(float side in new[]{-1f,1f})
            {
                Flame(forklift,side,orange,1,0);
                Flame(forklift,side,gold,.66f,.002f);
            }
        }
        static void Flame(Transform parent,float side,Material material,float scale,float offset)
        {
            // The actual flat service panels are at x=+/-0.532, y=.547-.813,
            // z=-.738 to -.222. Keep both layers just above those surfaces.
            Vector2[] shape={new Vector2(-.48f,0),new Vector2(.48f,0),new Vector2(.32f,.14f),new Vector2(.52f,.34f),new Vector2(.16f,.23f),new Vector2(.22f,.51f),new Vector2(-.04f,.28f),new Vector2(-.24f,.56f),new Vector2(-.22f,.19f),new Vector2(-.48f,.3f)};
            var vertices=new Vector3[shape.Length*3];var triangles=new int[vertices.Length];
            for(int i=0;i<shape.Length;i++)
            {vertices[i*3]=new Vector3(side*(.535f+offset),.565f,-.48f);vertices[i*3+1]=new Vector3(side*(.535f+offset),.565f+shape[i].y*scale*.40f,-.48f+shape[i].x*scale*.45f);vertices[i*3+2]=new Vector3(side*(.535f+offset),.565f+shape[(i+1)%shape.Length].y*scale*.40f,-.48f+shape[(i+1)%shape.Length].x*scale*.45f);triangles[i*3]=i*3;triangles[i*3+1]=side>0?i*3+2:i*3+1;triangles[i*3+2]=side>0?i*3+1:i*3+2;}
            var mesh=new Mesh{name="Original forklift flame decal"};mesh.vertices=vertices;mesh.triangles=triangles;mesh.RecalculateNormals();mesh.RecalculateBounds();
            var node=new GameObject("Painted flame kit");node.transform.SetParent(parent,false);node.AddComponent<MeshFilter>().sharedMesh=mesh;var renderer=node.AddComponent<MeshRenderer>();renderer.sharedMaterial=material;renderer.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;
        }
    }
}
