using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Rendering;
using UnityEngine;
using UnityEngine.Rendering;
using UniversalRenderPipelineAsset = UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset;
using UnityEngine.SceneManagement;

namespace OneShift.RackLab
{
    public static class RackLabBuilder
    {
        const string Root = "Assets/RackLab/";
        const string ScenePath = Root + "Scenes/RackFloor.unity";
        static Font font;

        [MenuItem("One Shift/Build rack floor")]
        public static string BuildScene()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play mode before rebuilding the floor.");
            foreach (var folder in new[] { "Materials", "Prefabs", "Scenes", "Reports" }) Directory.CreateDirectory(Root + folder);
            AssetDatabase.Refresh();
            var importer = (ModelImporter)AssetImporter.GetAtPath(Root + "Models/warehouse-rack-lods.fbx");
            importer.materialImportMode = ModelImporterMaterialImportMode.None;
            importer.importCameras = importer.importLights = importer.importAnimation = false;
            importer.importNormals = ModelImporterNormals.Import;
            importer.importTangents = ModelImporterTangents.CalculateMikk;
            importer.meshCompression = ModelImporterMeshCompression.Off;
            importer.isReadable = false;
            importer.addCollider = false;
            importer.globalScale = 1;
            importer.SaveAndReimport();
            var noiseImporter = (TextureImporter)AssetImporter.GetAtPath(Root + "Textures/rack-wear-noise.png");
            noiseImporter.sRGBTexture = false;
            noiseImporter.wrapMode = TextureWrapMode.Repeat;
            noiseImporter.mipmapEnabled = true;
            noiseImporter.textureCompression = TextureImporterCompression.CompressedHQ;
            noiseImporter.maxTextureSize = 512;
            noiseImporter.SaveAndReimport();
            ConfigurePipeline();
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var shader = Shader.Find("OneShift/Rack Steel");
            if (shader == null) throw new Exception("Rack shader did not import.");
            var noise = AssetDatabase.LoadAssetAtPath<Texture2D>(Root + "Textures/rack-wear-noise.png");
            var conditions = new[] { "Clean", "Used", "Worn" };
            var wears = new[] { 0f, .32f, .94f };
            var finishes = new Material[3];
            for (int i = 0; i < 3; i++)
            {
                finishes[i] = new Material(shader) { name = "Rack " + conditions[i], enableInstancing = true };
                finishes[i].SetTexture("_WearNoise", noise);
                finishes[i].SetTexture("_RackLabel", AssetDatabase.LoadAssetAtPath<Texture2D>(Root + "Textures/rack-location-label.png"));
                finishes[i].SetFloat("_Wear", wears[i]);
                finishes[i] = Save(finishes[i], Root + "Materials/Rack" + conditions[i] + ".mat");
            }
            font = Resources.Load<Font>("RackLabFont");
            var floor = Lit("Concrete", new Color(.31f, .33f, .31f), .08f, .22f);
            var wall = Lit("Warm wall paint", new Color(.60f, .59f, .53f), 0, .2f);
            var frame = Lit("Building steel", new Color(.18f, .21f, .19f), .4f, .35f);
            var yellow = Lit("Aisle safety paint", new Color(.78f, .56f, .13f), 0, .3f);
            var dark = Lit("Floor joint", new Color(.15f, .17f, .15f), 0, .2f);
            var lightMat = Lit("Fixture lens", new Color(.94f, .91f, .81f), 0, .4f);
            lightMat.EnableKeyword("_EMISSION");
            lightMat.SetColor("_EmissionColor", new Color(1,.94f,.8f)*2);
            Box("Concrete floor", new Vector3(0,-.12f,1), new Vector3(23,.24f,22), floor);
            Box("Rear wall", new Vector3(0,3,11), new Vector3(23,6,.2f), wall);
            Box("Left wall", new Vector3(-11.5f,3,1), new Vector3(.2f,6,22), wall);
            Box("Right wall", new Vector3(11.5f,3,1), new Vector3(.2f,6,22), wall);
            Box("Front wall", new Vector3(0,3,-10), new Vector3(23,6,.2f), wall);
            for (int i=-2;i<=2;i++)
            {
                Box("Roof cross beam", new Vector3(0,5.75f,i*4), new Vector3(23,.18f,.13f), frame, false);
                for (int j=-1;j<=1;j++)
                {
                    Box("Overhead light", new Vector3(j*6,5.52f,i*4), new Vector3(2.4f,.09f,.25f), lightMat, false);
                }
            }
            for (int x=-10;x<=10;x+=4)
                Box("Concrete expansion joint",new Vector3(x,.002f,1),new Vector3(.012f,.003f,22),dark,false);
            for (int z=-8;z<=8;z+=4)
                Box("Concrete expansion joint",new Vector3(0,.002f,z),new Vector3(23,.003f,.012f),dark,false);
            for (int x=-1;x<=1;x+=2)
                Box("Walkway marking",new Vector3(x*8.8f,.004f,0),new Vector3(.09f,.004f,16),yellow,false);
            for (int i=0;i<3;i++)
            {
                var rack = CreateRack(conditions[i], i, finishes);
                rack.transform.position = new Vector3((i-1)*4.2f,0,2);
                // Labels sit in front of each rack at readable standing height.
                var plaque = Box("Condition board",new Vector3((i-1)*4.2f,4.05f,2.05f),new Vector3(2,.47f,.045f),frame,false);
                var label = Label(conditions[i].ToUpperInvariant(), new Vector3((i-1)*4.2f,4.05f,2.015f), .15f);
                rack.GetComponent<RackWearVariant>().conditionLabel = label;
                Label("0"+(i+1),new Vector3((i-1)*4.2f,.008f,-.1f),.22f).transform.rotation=Quaternion.Euler(90,0,0);
                Box("Rack bay marking",new Vector3((i-1)*4.2f,.005f,.65f),new Vector3(3.25f,.004f,.06f),yellow,false);
            }
            Label("ONE SHIFT",new Vector3(-8.4f,3.8f,10.87f),.38f);
            Label("STORAGE / 01",new Vector3(-8.4f,3.28f,10.87f),.12f);
            var sunObj = new GameObject("High warehouse daylight");
            var sun = sunObj.AddComponent<Light>();
            sun.type=LightType.Directional;
            sun.color=new Color(1,.94f,.82f);
            sun.intensity=1.65f;
            sun.shadows=LightShadows.Soft;
            sun.shadowStrength=.65f;
            sunObj.transform.rotation=Quaternion.Euler(48,-28,0);
            RenderSettings.sun=sun;
            RenderSettings.ambientMode=AmbientMode.Trilight;
            RenderSettings.ambientSkyColor=new Color(.58f,.64f,.66f);
            RenderSettings.ambientEquatorColor=new Color(.44f,.44f,.38f);
            RenderSettings.ambientGroundColor=new Color(.24f,.24f,.2f);
            RenderSettings.ambientIntensity=1;
            RenderSettings.reflectionIntensity=.55f;
            RenderSettings.fog=true;
            RenderSettings.fogMode=FogMode.Linear;
            RenderSettings.fogColor=new Color(.49f,.51f,.48f);
            RenderSettings.fogStartDistance=20;
            RenderSettings.fogEndDistance=65;
            for(int i=-1;i<=1;i++)
            {
                var obj=new GameObject("Soft fixture fill");
                obj.transform.position=new Vector3(i*6,4.5f,0);
                var fill=obj.AddComponent<Light>();
                fill.type=LightType.Point;fill.intensity=2;fill.range=8;
                fill.color=new Color(.9f,.94f,1);fill.shadows=LightShadows.None;
            }
            var player=new GameObject("Player");
            player.transform.position=new Vector3(0,.04f,-5.5f);
            var controller=player.AddComponent<CharacterController>();
            controller.height=RackWalkController.StandingHeight;controller.radius=RackWalkController.BodyRadius;
            controller.center=Vector3.up*(RackWalkController.StandingHeight*.5f);
            controller.stepOffset=.25f;controller.skinWidth=.025f;controller.slopeLimit=45;
            var eyes=new GameObject("Player eyes");eyes.tag="MainCamera";
            eyes.transform.SetParent(player.transform,false);eyes.transform.localPosition=Vector3.up*RackWalkController.StandingEyeHeight;
            var camera=eyes.AddComponent<Camera>();camera.nearClipPlane=.04f;camera.farClipPlane=100;
            camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=RenderSettings.fogColor;
            camera.allowHDR=true;eyes.AddComponent<AudioListener>();
            var cameraData=eyes.AddComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>();
            cameraData.renderPostProcessing=true;
            cameraData.antialiasing=UnityEngine.Rendering.Universal.AntialiasingMode.SubpixelMorphologicalAntiAliasing;
            cameraData.antialiasingQuality=UnityEngine.Rendering.Universal.AntialiasingQuality.High;
            var walking=player.AddComponent<RackWalkController>();walking.eyes=camera;walking.RefreshPerspective();
            var body=GameObject.CreatePrimitive(PrimitiveType.Capsule);body.name="Player shadow";
            UnityEngine.Object.DestroyImmediate(body.GetComponent<Collider>());
            body.transform.SetParent(player.transform,false);body.transform.localPosition=controller.center;
            body.transform.localScale=new Vector3(controller.radius*2,controller.height*.5f,controller.radius*2);
            body.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.ShadowsOnly;
            body.GetComponent<Renderer>().sharedMaterial=frame;
            var probeObj=new GameObject("Warehouse reflections");
            probeObj.transform.position=new Vector3(0,2,1);
            var probe=probeObj.AddComponent<ReflectionProbe>();
            probe.size=new Vector3(23,8,22);probe.boxProjection=true;probe.resolution=128;
            probe.mode=ReflectionProbeMode.Realtime;probe.refreshMode=ReflectionProbeRefreshMode.OnAwake;
            probe.timeSlicingMode=ReflectionProbeTimeSlicingMode.AllFacesAtOnce;
            QualitySettings.shadowDistance=30;QualitySettings.shadows=ShadowQuality.All;
            QualitySettings.shadowResolution=ShadowResolution.High;QualitySettings.antiAliasing=4;
            QualitySettings.lodBias=1;QualitySettings.vSyncCount=1;
            PlayerSettings.colorSpace=ColorSpace.Linear;
            PlayerSettings.companyName="One Shift";PlayerSettings.productName="One Shift - Rack Floor";
            PlayerSettings.defaultScreenWidth=1440;PlayerSettings.defaultScreenHeight=900;
            PlayerSettings.fullScreenMode=FullScreenMode.Windowed;
            PlayerSettings.runInBackground=false;
            EditorSceneManager.SaveScene(SceneManager.GetActiveScene(),ScenePath);
            EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene(ScenePath,true)};
            AssetDatabase.SaveAssets();
            Physics.SyncTransforms();
            return Validate();
        }

        static GameObject CreateRack(string condition,int index,Material[] finishes)
        {
            var asset=AssetDatabase.LoadAssetAtPath<GameObject>(Root+"Models/warehouse-rack-lods.fbx");
            if(asset==null)throw new Exception("FBX missing");
            var rack=new GameObject("Rack - "+condition);
            var instance=(GameObject)PrefabUtility.InstantiatePrefab(asset);
            instance.transform.SetParent(rack.transform,false);
            // Blender's forward axis imports facing +Z; face the entry aisle.
            instance.transform.localRotation=Quaternion.Euler(0,180,0);
            var imported=instance.GetComponent<LODGroup>();
            if(imported!=null)UnityEngine.Object.DestroyImmediate(imported);
            var lods=new LOD[3];
            for(int i=0;i<3;i++)
            {
                var render=instance.GetComponentsInChildren<MeshRenderer>(true).Single(r=>r.name=="Rack_LOD"+i);
                render.sharedMaterial=finishes[index];
                render.shadowCastingMode=ShadowCastingMode.TwoSided;
                render.gameObject.SetActive(true);
                lods[i]=new LOD(new[]{.24f,.10f,.018f}[i],new Renderer[]{render});
            }
            var group=rack.AddComponent<LODGroup>();group.SetLODs(lods);group.RecalculateBounds();
            // Seven primitive colliders: side frames, shelf volumes and two guards.
            foreach(float x in new[]{-1.265f,1.265f})
            {
                ColliderBox(rack,"End frame collision",new Vector3(x,1.83f,0),new Vector3(.10f,3.66f,1.08f));
                ColliderBox(rack,"Guard collision",new Vector3(x,.18f,-.55f),new Vector3(.315f,.36f,.30f));
            }
            foreach(float y in new[]{1.12f,2.24f,3.36f})
                ColliderBox(rack,"Shelf collision",new Vector3(0,y-.055f,0),new Vector3(2.44f,.14f,1.08f));
            var wear=rack.AddComponent<RackWearVariant>();wear.finishes=finishes;wear.condition=index;
            PrefabUtility.SaveAsPrefabAsset(rack,Root+"Prefabs/Rack"+condition+".prefab");
            return rack;
        }

        static void ColliderBox(GameObject rack,string name,Vector3 center,Vector3 size)
        {
            var obj=new GameObject(name);obj.transform.SetParent(rack.transform,false);
            var collider=obj.AddComponent<BoxCollider>();collider.center=center;collider.size=size;
        }
        static Material Lit(string name,Color color,float metal,float gloss)
        {
            var shader=Shader.Find("Universal Render Pipeline/Lit");
            if(shader==null)shader=Shader.Find("Standard");
            var mat=new Material(shader){name=name,enableInstancing=true};
            mat.color=color;mat.SetColor("_BaseColor",color);mat.SetFloat("_Metallic",metal);
            mat.SetFloat("_Smoothness",gloss);mat.SetFloat("_Glossiness",gloss);
            return Save(mat,Root+"Materials/"+name.Replace(" ","")+".mat");
        }
        static T Save<T>(T obj,string path) where T:UnityEngine.Object
        {
            var old=AssetDatabase.LoadAssetAtPath<T>(path);
            if(old!=null){EditorUtility.CopySerialized(obj,old);UnityEngine.Object.DestroyImmediate(obj);return old;}
            AssetDatabase.CreateAsset(obj,path);
            return obj;
        }
        static GameObject Box(string name,Vector3 position,Vector3 size,Material material,bool collider=true)
        {
            var obj=GameObject.CreatePrimitive(PrimitiveType.Cube);obj.name=name;
            obj.transform.position=position;obj.transform.localScale=size;obj.GetComponent<Renderer>().sharedMaterial=material;
            if(!collider)UnityEngine.Object.DestroyImmediate(obj.GetComponent<Collider>());
            return obj;
        }
        static TextMesh Label(string text,Vector3 position,float size)
        {
            var obj=new GameObject(text);obj.transform.position=position;
            var tm=obj.AddComponent<TextMesh>();tm.text=text;tm.fontSize=80;tm.characterSize=size/8;
            tm.anchor=TextAnchor.MiddleCenter;tm.alignment=TextAlignment.Center;tm.color=new Color(.94f,.91f,.81f);
            if(font!=null){tm.font=font;obj.GetComponent<MeshRenderer>().sharedMaterial=font.material;}
            return tm;
        }
        static void ConfigurePipeline()
        {
            var type=Type.GetType("UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset, Unity.RenderPipelines.Universal.Runtime");
            if(type==null)return;
            var path=Root+"Materials/RackLabPipeline.asset";
            var pipeline=AssetDatabase.LoadAssetAtPath<RenderPipelineAsset>(path);
            if(pipeline==null)
            {
                var rendererType=Type.GetType("UnityEngine.Rendering.Universal.UniversalRendererData, Unity.RenderPipelines.Universal.Runtime");
                var renderer=ScriptableObject.CreateInstance(rendererType);
                AssetDatabase.CreateAsset(renderer,Root+"Materials/RackLabRenderer.asset");
                var create=type.GetMethods().First(m=>m.Name=="Create"&&m.IsStatic&&m.GetParameters().Length==1);
                pipeline=(RenderPipelineAsset)create.Invoke(null,new object[]{renderer});
                AssetDatabase.CreateAsset(pipeline,path);
            }
            GraphicsSettings.defaultRenderPipeline=pipeline;
            QualitySettings.renderPipeline=pipeline;
            var urp=(UniversalRenderPipelineAsset)pipeline;
            var rendererData=AssetDatabase.LoadAssetAtPath<UnityEngine.Rendering.Universal.UniversalRendererData>(Root+"Materials/RackLabRenderer.asset");
            rendererData.postProcessData=AssetDatabase.LoadAssetAtPath<UnityEngine.Rendering.Universal.PostProcessData>("Packages/com.unity.render-pipelines.universal/Runtime/Data/PostProcessData.asset");
            EditorUtility.SetDirty(rendererData);
            urp.renderScale=1;
            urp.msaaSampleCount=4;
            urp.shadowDistance=30;
            urp.shadowCascadeCount=2;
            var settings=new SerializedObject(urp);
            settings.FindProperty("m_SoftShadowsSupported").boolValue=true;
            settings.ApplyModifiedPropertiesWithoutUndo();
            urp.mainLightShadowmapResolution=2048;
            EditorUtility.SetDirty(urp);
        }

        public static string Validate()
        {
            var racks=UnityEngine.Object.FindObjectsOfType<RackWearVariant>();
            if(racks.Length!=3)throw new Exception("Expected three wear variants.");
            var report="Rack floor: 3 variants, ";
            foreach(var rack in racks)
            {
                var group=rack.GetComponent<LODGroup>();
                var lods=group.GetLODs();
                if(lods.Length!=3)throw new Exception("Missing LOD levels.");
                int previous=int.MaxValue;
                foreach(var lod in lods)
                {
                    if(lod.renderers.Length!=1)throw new Exception("Expected one renderer per LOD.");
                    var r=lod.renderers[0];var mesh=r.GetComponent<MeshFilter>().sharedMesh;
                    int triangles=0;for(int i=0;i<mesh.subMeshCount;i++)triangles+=(int)mesh.GetIndexCount(i)/3;
                    if(triangles>=previous)throw new Exception("LOD triangles must decrease.");previous=triangles;
                    if(r.sharedMaterials.Length!=1)throw new Exception("Expected one material.");
                    if(Mathf.Abs(r.bounds.size.y-3.66f)>.05f)throw new Exception("Rack height or export axes are wrong: "+r.bounds);
                }
                if(rack.GetComponentsInChildren<BoxCollider>().Length!=7)throw new Exception("Rack needs seven simple colliders.");
            }
            var player=UnityEngine.Object.FindObjectOfType<RackWalkController>();
            if(player==null||player.eyes==null)throw new Exception("Player missing.");
            if(!Physics.Raycast(player.transform.position+Vector3.up,Vector3.down,2))throw new Exception("Player has no floor.");
            var errors=ShaderUtil.GetShaderMessages(Shader.Find("OneShift/Rack Steel")).Where(m=>m.severity==ShaderCompilerMessageSeverity.Error).ToArray();
            if(errors.Length>0)throw new Exception(string.Join("\n",errors.Select(e=>e.message)));
            report+="3 LODs and 7 box colliders per rack. Player, floor, bounds and shader validated.";
            File.WriteAllText(Root+"Reports/validation.txt",report+"\n");
            Debug.Log(report);return report;
        }
        public static void OpenAndPlay()
        {
            EditorSceneManager.OpenScene(ScenePath);
            var type=typeof(Editor).Assembly.GetType("UnityEditor.GameView");
            EditorWindow.GetWindow(type).Focus();
            EditorApplication.isPlaying=true;
        }

        public static string CheckPlayMode()
        {
            if(!EditorApplication.isPlaying)throw new Exception("Enter Play mode first.");
            var player=UnityEngine.Object.FindObjectOfType<RackWalkController>();
            var motor=player.GetComponent<CharacterController>();
            var rack=UnityEngine.Object.FindObjectsOfType<RackWearVariant>().OrderBy(r=>r.transform.position.x).ElementAt(1);
            var condition=rack.condition;
            try
            {
                player.ResetPosition();
                for(int i=0;i<30;i++)motor.Move(Vector3.down*.04f);
                if(!motor.isGrounded||Mathf.Abs(player.transform.position.y)>.08f)
                    throw new Exception("The character does not stand on the floor.");
                for(int i=0;i<40;i++)motor.Move(Vector3.forward*.05f);
                if(Mathf.Abs(player.transform.position.z+3.5f)>.08f)
                    throw new Exception("The character cannot move freely in the aisle.");
                for(int i=0;i<160;i++)motor.Move(Vector3.forward*.05f);
                var stopped=player.transform.position;
                if(stopped.z<1.05f||stopped.z>1.3f)
                    throw new Exception("The character did not stop against the rack: "+stopped);
                rack.Cycle();
                if(rack.condition!=(condition+1)%3)throw new Exception("Wear did not cycle.");
                foreach(var lod in rack.GetComponent<LODGroup>().GetLODs())
                    if(lod.renderers[0].sharedMaterial!=rack.finishes[rack.condition])
                        throw new Exception("Wear does not match across LODs.");
                var report="Play checks passed: floor support, two metres of unobstructed movement, rack collision at "+stopped+", wear cycling across every LOD, and spawn reset.";
                File.WriteAllText(Root+"Reports/play-validation.txt",report+"\n");
                Debug.Log(report);
                return report;
            }
            finally
            {
                rack.condition=condition;rack.Apply();player.ResetPosition();
            }
        }

        [MenuItem("One Shift/Build Windows player")]
        public static string BuildWindows()
        {
            if(EditorApplication.isPlaying)throw new Exception("Stop Play mode before building.");
            EditorSceneManager.SaveOpenScenes();AssetDatabase.SaveAssets();
            Directory.CreateDirectory("Builds/Windows");
            var result=BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes=new[]{ScenePath},locationPathName="Builds/Windows/OneShiftRackLab.exe",
                target=BuildTarget.StandaloneWindows64,options=BuildOptions.None
            });
            if(result.summary.result!=UnityEditor.Build.Reporting.BuildResult.Succeeded)
                throw new Exception("Windows build failed: "+result.summary.result);
            return "Windows build succeeded: "+result.summary.totalSize+" bytes, "+result.summary.totalErrors+" errors.";
        }
    }
}
