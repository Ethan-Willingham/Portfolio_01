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
            foreach (var file in new[] { "warehouse-rack-lods.fbx", "connected-rack-modules.fbx", "owner-pallets-lods.fbx", "carton-load-lods.fbx" }) PrepareModel(file);
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
                finishes[i].SetFloat("_SurfaceKind", 0);
                finishes[i] = Save(finishes[i], Root + "Materials/Rack" + conditions[i] + ".mat");
            }
            font = Resources.Load<Font>("RackLabFont");
            BuildRoom(finishes, conditions);
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

        static void BuildRoom(Material[] finishes, string[] conditions)
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
            PalletRowBuilder.Build(finishes, font);
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
            player.transform.position=new Vector3(-4.6f,.04f,-5.4f);
            player.transform.rotation=Quaternion.Euler(0, 25, 0);
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
            WarehouseFloorBuilder.ReplaceSurface();
            EditorSceneManager.SaveScene(SceneManager.GetActiveScene(),ScenePath);
            EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene(ScenePath,true)};
            AssetDatabase.SaveAssets();
            Physics.SyncTransforms();
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
            Physics.SyncTransforms();
            var row = GameObject.Find("Connected pallet rack - three bays");
            if (row == null) throw new Exception("Connected rack row missing.");
            var frames = row.GetComponentsInChildren<LODGroup>().Where(g => g.name.StartsWith("Shared upright frame")).OrderBy(g => g.transform.position.x).ToArray();
            var bays = row.GetComponentsInChildren<PalletRackBay>().OrderBy(g => g.transform.position.x).ToArray();
            if (frames.Length != 4 || bays.Length != 3) throw new Exception("Three connected bays must share exactly four frames.");
            for (int i = 0; i < frames.Length; i++)
            {
                var bounds = frames[i].GetLODs()[0].renderers[0].bounds;
                if (bounds.size.x > .4f || Mathf.Abs(bounds.size.y - PalletRackBay.FrameHeight) > .01f)
                    throw new Exception("Frame export includes duplicate or misplaced geometry: " + bounds);
                if (i > 0 && Mathf.Abs(frames[i].transform.position.x - frames[i-1].transform.position.x - PalletRowBuilder.BayPitch) > .001f)
                    throw new Exception("Connected bay pitch is incorrect.");
            }
            int loadCount = 0;
            foreach (var bay in bays)
            {
                if (bay.palletPositions.Length != 6) throw new Exception("Expected six full-pallet slots per bay.");
                foreach (var slot in bay.palletPositions)
                {
                    foreach (float x in new[] { -.25f, .25f })
                        if (Physics.CheckBox(slot.position + new Vector3(x, .062f, -.05f), new Vector3(.06f, .02f, .55f)))
                            throw new Exception("Front fork pocket obstructed at " + bay.name + "/" + slot.name);
                    foreach (float z in new[] { -.3302f, .3302f })
                        if (Physics.CheckBox(slot.position + new Vector3(0, .034925f, z), new Vector3(.49f, .015f, .05f)))
                            throw new Exception("Side fork notch obstructed at " + bay.name + "/" + slot.name);
                }
                foreach (var load in bay.exampleLoads)
                {
                    var renderers = load.GetComponentsInChildren<LODGroup>().SelectMany(g => g.GetLODs()[0].renderers).ToArray();
                    var bounds = renderers[0].bounds;
                    foreach (var renderer in renderers.Skip(1)) bounds.Encapsulate(renderer.bounds);
                    if (Mathf.Abs(bounds.size.x - PalletRackBay.PalletWidth) > .006f || Mathf.Abs(bounds.size.z - PalletRackBay.PalletDepth) > .006f)
                        throw new Exception("Pallet scaled or oriented incorrectly: " + bounds);
                    var contacts = Physics.OverlapBox(bounds.center + Vector3.up * .10f, bounds.extents - Vector3.one * .006f);
                    if (contacts.Any(c => !c.transform.IsChildOf(load.transform)))
                        throw new Exception("Load has insufficient lift clearance: " + load.name + " / " + string.Join(",", contacts.Where(c => !c.transform.IsChildOf(load.transform)).Select(c => c.name)));
                    loadCount++;
                }
            }
            var originals = GameObject.Find("Original green racks").GetComponentsInChildren<RackWearVariant>();
            if (originals.Length != 3) throw new Exception("Original racks were not retained.");
            foreach (var rack in originals)
                if (Mathf.Abs(rack.GetComponent<LODGroup>().GetLODs()[0].renderers[0].bounds.size.y - 3.66f) > .01f)
                    throw new Exception("Original rack was replaced by the tall model.");
            var samples = GameObject.Find("Four pallet finishes - full size").GetComponentsInChildren<LODGroup>();
            if (samples.Length != 4) throw new Exception("All four pallet finishes must be present.");
            foreach (var sample in samples)
            {
                var bounds = sample.GetLODs()[0].renderers[0].bounds;
                if (Mathf.Abs(bounds.size.x - 1.016f) > .005f || Mathf.Abs(bounds.size.z - 1.2192f) > .005f || bounds.size.y < .12f || bounds.size.y > .13f)
                    throw new Exception("Imported source pallet bounds are wrong: " + bounds);
                var material = sample.GetLODs()[0].renderers[0].sharedMaterials[0];
                if (material.GetTexture("_BaseMap") == null || material.GetTexture("_BumpMap") == null || material.GetTexture("_MetallicGlossMap") == null)
                    throw new Exception("Pallet PBR maps missing.");
            }
            foreach (var group in UnityEngine.Object.FindObjectsByType<LODGroup>(FindObjectsSortMode.None))
            {
                var lods = group.GetLODs();
                if (lods.Length != 3) throw new Exception("Missing LODs on " + group.name);
                long previous = long.MaxValue;
                foreach (var lod in lods)
                {
                    long triangles = 0;
                    foreach (var renderer in lod.renderers)
                    {
                        var mesh = renderer.GetComponent<MeshFilter>().sharedMesh;
                        for (int m = 0; m < mesh.subMeshCount; m++) triangles += (long)mesh.GetIndexCount(m) / 3;
                        if (renderer.sharedMaterials.Length != mesh.subMeshCount || renderer.sharedMaterials.Any(m => m == null)) throw new Exception("Material slots do not match mesh.");
                    }
                    if (triangles > previous) throw new Exception("LOD complexity increases.");
                    previous = triangles;
                }
            }
            var player = UnityEngine.Object.FindFirstObjectByType<RackWalkController>();
            if (player == null || !Physics.Raycast(player.transform.position + Vector3.up, Vector3.down, 2)) throw new Exception("Player floor missing.");
            var errors = ShaderUtil.GetShaderMessages(Shader.Find("OneShift/Rack Steel")).Where(m => m.severity == ShaderCompilerMessageSeverity.Error).ToArray();
            if (errors.Length > 0) throw new Exception(string.Join("\n", errors.Select(e => e.message)));
            string report = "Validated: 3 original green racks retained; 3 connected pallet bays share exactly 4 upright frames at 2.53 m centres; 18 full-size pallet positions; " + loadCount + " occupied slots; all 4 owner pallet variants at 1:1 scale (1.016 x 1.2192 m); original PBR maps; 3 LODs; open front and side fork pockets; 100 mm lift clearance; player and floor. Full pallets overhang the 1.07 m frame by about 75 mm at front and rear.";
            File.WriteAllText(Root + "Reports/validation.txt", report + "\n");
            Debug.Log(report); return report;
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
            var rack=GameObject.Find("Connected pallet rack - three bays").GetComponent<RackWearVariant>();
            var condition=rack.condition;
            try
            {
                player.ResetPosition();
                motor.enabled = false;
                // Test free walking in the entrance, then collide with a shared upright guard.
                player.transform.SetPositionAndRotation(new Vector3(-3.795f, .04f, -3f), Quaternion.identity);
                motor.enabled = true;
                for (int i = 0; i < 30; i++) motor.Move(Vector3.down * .04f);
                if (!motor.isGrounded || Mathf.Abs(player.transform.position.y) > .08f) throw new Exception("Character floor support failed.");
                for (int i = 0; i < 40; i++) motor.Move(Vector3.forward * .05f);
                if (Mathf.Abs(player.transform.position.z + 1f) > .08f) throw new Exception("Entrance aisle obstructed.");
                for (int i = 0; i < 160; i++) motor.Move(Vector3.forward * .05f);
                var stopped = player.transform.position;
                if (stopped.z < 2.45f || stopped.z > 2.65f) throw new Exception("Shared upright collision failed: " + stopped);
                rack.Cycle();
                if(rack.condition!=(condition+1)%3)throw new Exception("Wear did not cycle.");
                foreach(var lod in rack.GetComponentsInChildren<LODGroup>().Where(g=>g.name.StartsWith("Shared upright")||g.name.StartsWith("Pallet bay")).SelectMany(g=>g.GetLODs()))
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
