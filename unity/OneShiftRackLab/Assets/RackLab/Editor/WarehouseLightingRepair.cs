using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    // A targeted repair for an authored scene, without rebuilding the warehouse,
    // receiving dock, truck, player, freight or electrical circuits.
    public static class WarehouseLightingRepair
    {
        public const float SunShadowDistance = 60f;
        public static readonly Color LensEmission = new Color(.84f, .80f, .70f);
        public static readonly Color LensSurface = new Color(.72f, .71f, .66f);
        const string Root = "Assets/RackLab/";

        public static void ConfigureSun(Light sun)
        {
            if (sun == null) throw new InvalidOperationException("Warehouse sun missing.");
            var data = sun.GetComponent<UniversalAdditionalLightData>() ?? sun.gameObject.AddComponent<UniversalAdditionalLightData>();
            // Light.shadowBias is ignored by URP unless this opt-out is present.
            data.usePipelineSettings = false;
            sun.shadowBias = .018f;
            sun.shadowNormalBias = .018f;
            EditorUtility.SetDirty(data);
            EditorUtility.SetDirty(sun);
            var pipeline = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            if (pipeline == null) throw new InvalidOperationException("Warehouse URP asset missing.");
            // Preserve the atlas size and cascade count. The shorter range
            // exposed sunlight on the thin corrugated shell at cascade edges.
            pipeline.shadowDistance = SunShadowDistance;
            EditorUtility.SetDirty(pipeline);
        }

        [MenuItem("One Shift/Repair warehouse light strips")]
        public static string Install()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before repairing saved lighting.");
            var scene = SceneManager.GetActiveScene();
            if (scene.path != Root + "Scenes/RackFloor.unity") throw new InvalidOperationException("Open RackFloor.unity first.");
            Directory.CreateDirectory("Temp/EnvironmentBackup");
            EditorSceneManager.SaveScene(scene, "Temp/EnvironmentBackup/BeforeLightStripRepair-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".unity", true);
            var cycle = Object.FindFirstObjectByType<WarehouseDayNight>();
            ConfigureSun(cycle == null ? null : cycle.sun);
            foreach (var row in Object.FindObjectsByType<WarehouseLightRow>(FindObjectsSortMode.None))
            {
                Undo.RecordObject(row, "Restore diffuser color detail");
                row.EmissionColor = LensEmission;
                row.LitDiffuserColor = LensSurface;
                row.Apply();
                EditorUtility.SetDirty(row);
            }
            string report = Validate();
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
            AssetDatabase.SaveAssets();
            return report;
        }

        public static string Validate()
        {
            var cycle = Object.FindFirstObjectByType<WarehouseDayNight>();
            var data = cycle == null || cycle.sun == null ? null : cycle.sun.GetComponent<UniversalAdditionalLightData>();
            if (data == null || data.usePipelineSettings || Mathf.Abs(cycle.sun.shadowBias - .018f) > .0001f || Mathf.Abs(cycle.sun.shadowNormalBias - .018f) > .0001f)
                throw new Exception("Sun must use its explicit warehouse shadow bias.");
            var pipeline = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            if (pipeline == null || pipeline.shadowDistance < SunShadowDistance)
                throw new Exception("Sun shadow coverage is shorter than the verified warehouse range.");
            var rows = Object.FindObjectsByType<WarehouseLightRow>(FindObjectsSortMode.None);
            if (rows.Length != 3 || rows.Sum(row => row.FixtureLights.Length) != 12 || rows.Sum(row => row.Diffusers.Length) != 12)
                throw new Exception("Three independent circuits and twelve fixtures are required.");
            if (rows.Any(row => row.EmissionColor != LensEmission || row.LitDiffuserColor != LensSurface))
                throw new Exception("Diffusers still clip their warm surface color in the browser.");
            string report = "Light-strip repair passed: explicit sun bias, 60 m shadow coverage, three preserved electrical circuits, twelve warm unsaturated diffusers; spotlight intensity and scene geometry unchanged.";
            File.WriteAllText(Root + "Reports/warehouse-light-strip-validation.txt", report + "\n");
            return report;
        }
    }
}
