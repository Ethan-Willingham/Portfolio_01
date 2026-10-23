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
            PrepareModel("forklift-pallet-rack-lods.fbx");
            PrepareModel("standard-loaded-pallet-lods.fbx");
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
            var loadPrefab = CreatePalletPrefab(noise, shader);
            var conditions = new[] { "Clean", "Used", "Worn" };
            var wears = new[] { 0f, .32f, .94f };
            var finishes = new Material[3];
            for (int i = 0; i < 3; i++)
            {
                finishes[i] = new Material(shader) { name = "Rack " + conditions[i], enableInstancing = true };
                finishes[i].SetTexture("_WearNoise", noise);
                finishes[i].SetTexture("_RackLabel", AssetDatabase.LoadAssetAtPath<Texture2D>(Root + "Textures/rack-location-label.png"));
                finishes[i].SetFloat("_Wear", wears[i]);
                finishes[i].SetFloat("_SurfaceKind", 0);
                finishes[i] = Save(finishes[i], Root + "Materials/Rack" + conditions[i] + ".mat");
            }
            font = Resources.Load<Font>("RackLabFont");
            BuildRoom(finishes, conditions, loadPrefab);
            return Validate();
        }

        static void PrepareModel(string filename)
        {
            var importer = (ModelImporter)AssetImporter.GetAtPath(Root + "Models/" + filename);
            if(importer==null)throw new Exception("Generate model first: "+filename);
            importer.materialImportMode = ModelImporterMaterialImportMode.None;
            importer.importCameras = importer.importLights = importer.importAnimation = false;
            importer.importNormals = ModelImporterNormals.Import;
            importer.importTangents = ModelImporterTangents.CalculateMikk;
            importer.meshCompression = ModelImporterMeshCompression.Off;
            importer.isReadable = false;
            importer.addCollider = false;
            importer.globalScale = 1;
            importer.SaveAndReimport();
        }

        static void BuildRoom(Material[] finishes, string[] conditions, GameObject loadPrefab)
        {
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
                float postX=(i-1)*4.2f-1.265f;
                Box("Bay address plate",new Vector3(postX,1.5f,1.285f),new Vector3(.15f,.26f,.008f),frame,false);
                Label("A0"+(i+1),new Vector3(postX,1.55f,1.278f),.05f);
                var label = Label(conditions[i].ToUpperInvariant(), new Vector3(postX,1.44f,1.278f), .022f);
                rack.GetComponent<RackWearVariant>().conditionLabel = label;
                var bay=rack.GetComponent<PalletRackBay>();
                var occupied=i==0?new int[0]:i==1?new[]{0,2,3,5}:new[]{0,1,2,3,4,5};
                bay.exampleLoads=new GameObject[occupied.Length];
                for(int j=0;j<occupied.Length;j++)
                {
                    var load=(GameObject)PrefabUtility.InstantiatePrefab(loadPrefab);
                    load.name="Loaded pallet A0"+(i+1)+"-"+occupied[j];
                    load.transform.SetParent(bay.palletPositions[occupied[j]],false);
                    bay.exampleLoads[j]=load;
                }
                Label("0"+(i+1),new Vector3((i-1)*4.2f,.008f,-.1f),.22f).transform.rotation=Quaternion.Euler(90,0,0);
                Box("Rack bay marking",new Vector3((i-1)*4.2f,.005f,.65f),new Vector3(3.25f,.004f,.06f),yellow,false);
            }
            Box("Forklift aisle boundary",new Vector3(0,.005f,-2.5f),new Vector3(14.5f,.004f,.06f),yellow,false);
            Label("FORKLIFT AISLE",new Vector3(0,.008f,-3.15f),.12f).transform.rotation=Quaternion.Euler(90,0,0);
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
            player.transform.position=new Vector3(0,.04f,-7f);
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
        }

        static GameObject CreateRack(string condition,int index,Material[] finishes)
        {
            var asset=AssetDatabase.LoadAssetAtPath<GameObject>(Root+"Models/forklift-pallet-rack-lods.fbx");
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
            // The floor opening stays clear. Beam and deck colliders follow the steel.
            foreach(float x in new[]{-1.265f,1.265f})
            {
                ColliderBox(rack,"End frame collision",new Vector3(x,PalletRackBay.FrameHeight/2,0),new Vector3(.10f,PalletRackBay.FrameHeight,1.08f));
                ColliderBox(rack,"Guard collision",new Vector3(x,.18f,-.55f),new Vector3(.315f,.36f,.30f));
            }
            for(int level=1;level<=2;level++)
            {
                float y=PalletRackBay.BeamPitch*level;
                foreach(float z in new[]{-.495f,.495f})
                    ColliderBox(rack,"Load beam collision",new Vector3(0,y-.065f,z),new Vector3(2.44f,.13f,.07f));
                ColliderBox(rack,"Wire deck collision",new Vector3(0,y+.005f,0),new Vector3(2.414f,.012f,1.078f));
            }
            var bay=rack.AddComponent<PalletRackBay>();
            bay.palletPositions=new Transform[6];bay.exampleLoads=new GameObject[0];
            for(int level=0;level<3;level++)for(int side=0;side<2;side++)
            {
                var slot=new GameObject("Pallet position "+level+(side==0?"L":"R"));
                slot.transform.SetParent(rack.transform,false);
                slot.transform.localPosition=new Vector3((side==0?-1:1)*PalletRackBay.PalletCenterOffset,
                    level==0?.002f:level*PalletRackBay.BeamPitch+PalletRackBay.DeckAboveBeam+.001f,0);
                bay.palletPositions[level*2+side]=slot.transform;
            }
            var wear=rack.AddComponent<RackWearVariant>();wear.finishes=finishes;wear.condition=index;
            PrefabUtility.SaveAsPrefabAsset(rack,Root+"Prefabs/Rack"+condition+".prefab");
            return rack;
        }

        static GameObject CreatePalletPrefab(Texture2D noise, Shader shader)
        {
            var material=new Material(shader){name="Pallet load",enableInstancing=true};
            material.SetTexture("_WearNoise",noise);
            material.SetTexture("_RackLabel",AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"Textures/pallet-load-label.png"));
            material.SetFloat("_SurfaceKind",1);
            material=Save(material,Root+"Materials/PalletLoad.mat");
            var root=new GameObject("Standard loaded pallet 48 x 40");
            var model=(GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(Root+"Models/standard-loaded-pallet-lods.fbx"));
            model.transform.SetParent(root.transform,false);model.transform.localRotation=Quaternion.Euler(0,180,0);
            var imported=model.GetComponent<LODGroup>();if(imported!=null)UnityEngine.Object.DestroyImmediate(imported);
            var lods=new LOD[3];
            for(int i=0;i<3;i++)
            {
                var renderer=model.GetComponentsInChildren<MeshRenderer>(true).Single(r=>r.name=="Pallet_LOD"+i);
                renderer.sharedMaterial=material;renderer.gameObject.SetActive(true);
                lods[i]=new LOD(new[]{.12f,.045f,.012f}[i],new Renderer[]{renderer});
            }
            var group=root.AddComponent<LODGroup>();group.SetLODs(lods);group.RecalculateBounds();
            // Compound boxes preserve both front fork pockets and the side notches.
            foreach(float x in new[]{-.466f,0,.466f})
            {
                ColliderBox(root,"Stringer upper",new Vector3(x,.1005f,0),new Vector3(.038f,.051f,1.2192f));
                foreach(var range in new[]{new Vector2(-.6096f,-.44f),new Vector2(-.18f,.18f),new Vector2(.44f,.6096f)})
                    ColliderBox(root,"Stringer foot",new Vector3(x,.0465f,(range.x+range.y)/2),new Vector3(.038f,.057f,range.y-range.x));
            }
            foreach(float z in new[]{-.5396f,0,.5396f})
                ColliderBox(root,"Bottom board",new Vector3(0,.009f,z),new Vector3(1.016f,.018f,.14f));
            for(int i=0;i<7;i++)
                ColliderBox(root,"Top board",new Vector3(0,.135f,-.5446f+i*(1.0892f/6)),new Vector3(1.016f,.018f,.13f));
            ColliderBox(root,"Carton load",new Vector3(0,(PalletRackBay.PalletHeight+PalletRackBay.LoadedHeight)/2,0),
                new Vector3(.972f,PalletRackBay.LoadedHeight-PalletRackBay.PalletHeight,1.172f));
            foreach(float x in new[]{-.25f,.25f})
            {
                var entry=new GameObject(x<0?"Left fork entry":"Right fork entry");
                entry.transform.SetParent(root.transform,false);entry.transform.localPosition=new Vector3(x,.073f,-.61f);
            }
            var prefab=PrefabUtility.SaveAsPrefabAsset(root,Root+"Prefabs/StandardLoadedPallet.prefab");
            UnityEngine.Object.DestroyImmediate(root);
            return prefab;
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
                    if(Mathf.Abs(r.bounds.size.y-PalletRackBay.FrameHeight)>.01f)throw new Exception("Rack height or export axes are wrong: "+r.bounds);
                }
                if(rack.GetComponentsInChildren<BoxCollider>().Count(c=>c.transform.parent==rack.transform)!=10)
                    throw new Exception("Rack needs ten frame, guard, beam and deck colliders.");
                var bay=rack.GetComponent<PalletRackBay>();
                if(bay==null||bay.palletPositions.Length!=6)throw new Exception("Expected six pallet positions: floor plus two beam levels.");
                foreach(var slot in bay.palletPositions)
                {
                    // Model a pair of 120 mm wide, 40 mm thick forks through the real openings.
                    foreach(float x in new[]{-.25f,.25f})
                        if(Physics.CheckBox(slot.position+new Vector3(x,.073f,-.05f),new Vector3(.06f,.02f,.55f)))
                            throw new Exception("Front fork pocket obstructed at "+slot.name);
                    foreach(float z in new[]{-.31f,.31f})
                        if(Physics.CheckBox(slot.position+new Vector3(0,.05f,z),new Vector3(.49f,.015f,.05f)))
                            throw new Exception("Side fork notch obstructed at "+slot.name);
                }
                foreach(var load in bay.exampleLoads)
                {
                    var bounds=load.GetComponent<LODGroup>().GetLODs()[0].renderers[0].bounds;
                    if(Mathf.Abs(bounds.size.x-PalletRackBay.PalletWidth)>.005f||Mathf.Abs(bounds.size.z-PalletRackBay.PalletDepth)>.005f||Mathf.Abs(bounds.size.y-PalletRackBay.LoadedHeight)>.005f)
                        throw new Exception("Loaded pallet dimensions are wrong: "+bounds.size);
                    var lifted=Physics.OverlapBox(bounds.center+Vector3.up*.10f,bounds.extents-Vector3.one*.005f);
                    if(lifted.Any(c=>!c.transform.IsChildOf(load.transform)))
                        throw new Exception("Insufficient lift clearance above "+load.name);
                }
            }
            var player=UnityEngine.Object.FindObjectOfType<RackWalkController>();
            if(player==null||player.eyes==null)throw new Exception("Player missing.");
            if(!Physics.Raycast(player.transform.position+Vector3.up,Vector3.down,2))throw new Exception("Player has no floor.");
            var errors=ShaderUtil.GetShaderMessages(Shader.Find("OneShift/Rack Steel")).Where(m=>m.severity==ShaderCompilerMessageSeverity.Error).ToArray();
            if(errors.Length>0)throw new Exception(string.Join("\n",errors.Select(e=>e.message)));
            report+="3 LODs, 10 steel colliders and 6 pallet positions per rack. Ten loaded 48 x 40 inch pallets, front and side fork openings, 100 mm lift clearance, player, floor, bounds and shader validated.";
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
            var rack=UnityEngine.Object.FindObjectsOfType<RackWearVariant>().OrderBy(r=>r.transform.position.x).First();
            var condition=rack.condition;
            try
            {
                player.ResetPosition();
                motor.enabled=false;player.transform.position+=Vector3.right*rack.transform.position.x;motor.enabled=true;
                for(int i=0;i<30;i++)motor.Move(Vector3.down*.04f);
                if(!motor.isGrounded||Mathf.Abs(player.transform.position.y)>.08f)
                    throw new Exception("The character does not stand on the floor.");
                for(int i=0;i<40;i++)motor.Move(Vector3.forward*.05f);
                if(Mathf.Abs(player.transform.position.z-(player.spawnPosition.z+2f))>.08f)
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
