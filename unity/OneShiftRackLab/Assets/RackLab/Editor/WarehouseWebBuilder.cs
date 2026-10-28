using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace OneShift.RackLab
{
    public static class WarehouseWebBuilder
    {
        const string ScenePath = "Assets/RackLab/Scenes/RackFloor.unity";
        const string PipelinePath = "Assets/RackLab/Materials/RackLabPipeline.asset";
        const string RendererPath = "Assets/RackLab/Materials/RackLabRenderer.asset";
        const string BuildName = "OneShiftWeb";

        [MenuItem("One Shift/Build browser player")]
        public static string BuildWeb()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play mode before building.");
            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.WebGL, BuildTarget.WebGL))
                throw new InvalidOperationException("Install Web Build Support for this Unity Editor before building.");
            EditorSceneManager.SaveOpenScenes();
            AssetDatabase.SaveAssets();
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
            if (pipeline == null) throw new InvalidOperationException("Warehouse render pipeline is missing.");
            string pipelineSnapshot = EditorJsonUtility.ToJson(pipeline);
            var renderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
            if (renderer == null) throw new InvalidOperationException("Warehouse renderer is missing.");
            var contactShading = renderer.rendererFeatures.OfType<ScreenSpaceAmbientOcclusion>()
                .ToDictionary(feature => feature, feature => EditorJsonUtility.ToJson(feature));
            var settings = new WebSettingsSnapshot();
            string projectRoot = Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
            string staging = Path.Combine(projectRoot, "Builds", "WebGL", BuildName);
            string published = Path.GetFullPath(Path.Combine(projectRoot, "..", "..", "assets", "one-shift-unity"));
            Directory.CreateDirectory(staging);
            try
            {
                // Forward+ uses CPU jobs and uniform buffers in URP 17.3 and
                // supports WebGL 2. Retain it so every fixture lights the floor.
                pipeline.mainLightShadowmapResolution = 2048;
                pipeline.additionalLightsShadowmapResolution = 1024;
                pipeline.shadowCascadeCount = 2;
                pipeline.cascade2Split = .25f;
                // Keep the far roof and walls inside the directional shadow
                // volume; 40 m clipped thin panels and leaked bright sun strips.
                pipeline.shadowDistance = 60;
                pipeline.msaaSampleCount = 2;
                var serialized = new SerializedObject(pipeline);
                serialized.FindProperty("m_AdditionalLightsShadowResolutionTierHigh").intValue = 512;
                serialized.FindProperty("m_AdditionalLightsShadowResolutionTierMedium").intValue = 256;
                serialized.FindProperty("m_AdditionalLightsShadowResolutionTierLow").intValue = 128;
                serialized.FindProperty("m_SoftShadowQuality").intValue = (int)SoftShadowQuality.Low;
                serialized.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(pipeline);
                // Contact shading was still running at desktop resolution and
                // sample counts. Keep it, with a quarter-size AO buffer and
                // four samples. Restore these asset settings after the build.
                foreach (var feature in contactShading.Keys)
                {
                    var ao = new SerializedObject(feature);
                    ao.FindProperty("m_Settings.Downsample").boolValue = true;
                    ao.FindProperty("m_Settings.NormalSamples").intValue = 1;
                    ao.FindProperty("m_Settings.Samples").intValue = 2;
                    ao.FindProperty("m_Settings.BlurQuality").intValue = 1;
                    ao.ApplyModifiedPropertiesWithoutUndo();
                    EditorUtility.SetDirty(feature);
                }
                PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
                PlayerSettings.WebGL.decompressionFallback = true;
                PlayerSettings.WebGL.nameFilesAsHashes = false;
                PlayerSettings.WebGL.dataCaching = true;
                PlayerSettings.WebGL.initialMemorySize = 256;
                PlayerSettings.WebGL.maximumMemorySize = 2048;
                PlayerSettings.WebGL.memoryGrowthMode = WebGLMemoryGrowthMode.Geometric;
                PlayerSettings.WebGL.threadsSupport = false;
                PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
                PlayerSettings.WebGL.debugSymbolMode = WebGLDebugSymbolMode.Off;
                PlayerSettings.runInBackground = false;
                PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false);
                PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.OpenGLES3 });
                AssetDatabase.SaveAssets();
                var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
                {
                    scenes = new[] { ScenePath },
                    target = BuildTarget.WebGL,
                    locationPathName = staging,
                    options = BuildOptions.None
                });
                if (report.summary.result != BuildResult.Succeeded || report.summary.totalErrors != 0)
                    throw new InvalidOperationException("Browser build failed: " + report.summary.result +
                        ", " + report.summary.totalErrors + " errors. Inspect the build report before publishing.");
                WarehouseWebFramework.PrepareFile(Path.Combine(staging, "Build", BuildName + ".framework.js.unityweb"));
                var files = new[] { BuildName + ".loader.js", BuildName + ".data.unityweb",
                    BuildName + ".framework.js.unityweb", BuildName + ".wasm.unityweb" };
                string stagingBuild = Path.Combine(staging, "Build");
                foreach (string name in files)
                {
                    var file = new FileInfo(Path.Combine(stagingBuild, name));
                    if (!file.Exists || file.Length == 0) throw new IOException("Missing browser build output: " + name);
                    if (file.Length >= 100 * 1024 * 1024) throw new IOException("Build file exceeds GitHub's 100 MiB limit: " + name);
                }
                string publishedBuild = Path.Combine(published, "Build");
                Directory.CreateDirectory(publishedBuild);
                foreach (string name in files) File.Copy(Path.Combine(stagingBuild, name), Path.Combine(publishedBuild, name), true);
                string streaming = Path.Combine(staging, "StreamingAssets");
                if (Directory.Exists(streaming)) CopyDirectory(streaming, Path.Combine(published, "StreamingAssets"));
                long bytes = files.Sum(name => new FileInfo(Path.Combine(publishedBuild, name)).Length);
                string result = "Browser build succeeded: " + bytes + " compressed bytes, " + report.summary.totalErrors +
                    " errors. Published files: " + publishedBuild;
                File.WriteAllText("Assets/RackLab/Reports/warehouse-web-build-validation.txt", result + Environment.NewLine);
                return result;
            }
            finally
            {
                EditorJsonUtility.FromJsonOverwrite(pipelineSnapshot, pipeline);
                EditorUtility.SetDirty(pipeline);
                foreach (var feature in contactShading)
                {
                    EditorJsonUtility.FromJsonOverwrite(feature.Value, feature.Key);
                    EditorUtility.SetDirty(feature.Key);
                }
                settings.Restore();
                AssetDatabase.SaveAssets();
            }
        }

        static void CopyDirectory(string source, string destination)
        {
            Directory.CreateDirectory(destination);
            foreach (string file in Directory.GetFiles(source)) File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), true);
            foreach (string directory in Directory.GetDirectories(source)) CopyDirectory(directory, Path.Combine(destination, Path.GetFileName(directory)));
        }

        sealed class WebSettingsSnapshot
        {
            readonly WebGLCompressionFormat compression = PlayerSettings.WebGL.compressionFormat;
            readonly bool fallback = PlayerSettings.WebGL.decompressionFallback;
            readonly bool hashes = PlayerSettings.WebGL.nameFilesAsHashes;
            readonly bool caching = PlayerSettings.WebGL.dataCaching;
            readonly int initialMemory = PlayerSettings.WebGL.initialMemorySize;
            readonly int maximumMemory = PlayerSettings.WebGL.maximumMemorySize;
            readonly WebGLMemoryGrowthMode memoryGrowth = PlayerSettings.WebGL.memoryGrowthMode;
            readonly bool threads = PlayerSettings.WebGL.threadsSupport;
            readonly WebGLExceptionSupport exceptions = PlayerSettings.WebGL.exceptionSupport;
            readonly WebGLDebugSymbolMode symbols = PlayerSettings.WebGL.debugSymbolMode;
            readonly bool background = PlayerSettings.runInBackground;
            readonly bool defaultApis = PlayerSettings.GetUseDefaultGraphicsAPIs(BuildTarget.WebGL);
            readonly GraphicsDeviceType[] apis = PlayerSettings.GetGraphicsAPIs(BuildTarget.WebGL);

            public void Restore()
            {
                PlayerSettings.WebGL.compressionFormat = compression;
                PlayerSettings.WebGL.decompressionFallback = fallback;
                PlayerSettings.WebGL.nameFilesAsHashes = hashes;
                PlayerSettings.WebGL.dataCaching = caching;
                PlayerSettings.WebGL.initialMemorySize = initialMemory;
                PlayerSettings.WebGL.maximumMemorySize = maximumMemory;
                PlayerSettings.WebGL.memoryGrowthMode = memoryGrowth;
                PlayerSettings.WebGL.threadsSupport = threads;
                PlayerSettings.WebGL.exceptionSupport = exceptions;
                PlayerSettings.WebGL.debugSymbolMode = symbols;
                PlayerSettings.runInBackground = background;
                PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, apis);
                PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, defaultApis);
            }
        }
    }

    // The build pipeline passes a disposable scene copy here, leaving the
    // desktop scene and its higher shadow quality unchanged.
    public sealed class WarehouseWebSceneSettings : IProcessSceneWithReport
    {
        public int callbackOrder => 0;

        public void OnProcessScene(Scene scene, BuildReport report)
        {
            if (report == null || report.summary.platform != BuildTarget.WebGL) return;
            foreach (var root in scene.GetRootGameObjects())
            {
                var fixtures=root.GetComponentsInChildren<WarehouseLightRow>(true).SelectMany(row=>row.FixtureLights).ToArray();
                if(fixtures.Length==12)
                {
                    var budget=root.AddComponent<WarehouseShadowBudget>();budget.fixtures=fixtures;
                }
                foreach (var light in root.GetComponentsInChildren<UniversalAdditionalLightData>(true))
                {
                    var serialized = new SerializedObject(light);
                    bool fixture=Array.IndexOf(fixtures,light.GetComponent<Light>())>=0;
                    serialized.FindProperty("m_AdditionalLightsShadowResolutionTier").intValue = fixture?0:1;
                    serialized.ApplyModifiedPropertiesWithoutUndo();
                    if(light.GetComponent<Light>().type==LightType.Directional)light.softShadowQuality=SoftShadowQuality.Medium;
                }
                foreach (var camera in root.GetComponentsInChildren<UniversalAdditionalCameraData>(true))
                {
                    // The thin beams and bright lenses still staircase at 2x
                    // MSAA. Smooth their final displayed edges after tone mapping,
                    // also covering devices whose intermediate MSAA falls back.
                    camera.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
                    camera.antialiasingQuality = AntialiasingQuality.Medium;
                }
                foreach (var probe in root.GetComponentsInChildren<ReflectionProbe>(true)) probe.resolution = 64;
                foreach (var clock in root.GetComponentsInChildren<WarehouseDayNight>(true))
                    clock.reflectionIntervalSeconds = 20;
            }
        }
    }
}
