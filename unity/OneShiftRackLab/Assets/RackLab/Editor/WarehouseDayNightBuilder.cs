using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    public static class WarehouseDayNightBuilder
    {
        const string Root = "Assets/RackLab/";

        [MenuItem("One Shift/Install warehouse day and night")]
        public static string Install()
        {
            WarehouseEnvironmentBuilder.Install();
            return Validate();
        }

        // Apply the working-day clock without rebuilding the warehouse shell.
        [MenuItem("One Shift/Install morning working day")]
        public static string InstallWorkingDay()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before installing daylight.");
            var cycle = Object.FindFirstObjectByType<WarehouseDayNight>();
            Require(cycle != null, "Warehouse clock missing.");
            ConfigureDaylight(cycle);
            cycle.SetHour(cycle.startHour);
            WarehouseReflectionCacheBuilder.InstallIntoScene();
            EditorUtility.SetDirty(cycle);
            EditorSceneManager.MarkSceneDirty(cycle.gameObject.scene);
            EditorSceneManager.SaveOpenScenes();
            AssetDatabase.SaveAssets();
            return Validate();
        }

        static void ConfigureDaylight(WarehouseDayNight cycle)
        {
            cycle.startHour = WarehouseDayNight.MorningHour;
            cycle.dayLengthMinutes = 30;
            cycle.daytimeAmbientIntensity = .9f;
        }

        public static void InstallIntoScene()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before installing lighting.");
            var sun = GameObject.Find("High warehouse daylight").GetComponent<Light>();
            var cycle = sun.GetComponent<WarehouseDayNight>() ?? sun.gameObject.AddComponent<WarehouseDayNight>();
            cycle.sun = sun;
            cycle.windows = Object.FindObjectsByType<WarehouseSunVolume>(FindObjectsSortMode.None);
            ConfigureDaylight(cycle);
            cycle.peakSunIntensity = 2.35f;
            cycle.beamIntensity = .75f;
            sun.lightmapBakeType = LightmapBakeType.Realtime;
            sun.shadows = LightShadows.Soft;
            WarehouseLightingRepair.ConfigureSun(sun);
            string skyPath = Root + "Materials/Environment/DayNightSky.mat";
            var sky = AssetDatabase.LoadAssetAtPath<Material>(skyPath);
            if (sky == null)
            {
                sky = new Material(Shader.Find("OneShift/Warehouse Sky")) { name = "Warehouse night and day sky" };
                AssetDatabase.CreateAsset(sky, skyPath);
            }
            cycle.sky = sky;
            cycle.roomReflection = Object.FindFirstObjectByType<ReflectionProbe>();
            if (cycle.roomReflection != null)
            {
                var probe = cycle.roomReflection;
                probe.refreshMode = ReflectionProbeRefreshMode.ViaScripting;
                probe.timeSlicingMode = ReflectionProbeTimeSlicingMode.IndividualFaces;
                probe.resolution = 128;
                probe.clearFlags = ReflectionProbeClearFlags.Skybox;
                probe.intensity = .55f;
                probe.boxProjection = true;
                probe.shadowDistance = 30;
                probe.farClipPlane = 60;
                EditorUtility.SetDirty(probe);
            }
            foreach (var camera in Object.FindObjectsByType<Camera>(FindObjectsSortMode.None))
            {
                camera.clearFlags = CameraClearFlags.Skybox;
                EditorUtility.SetDirty(camera);
            }
            // The transparent panes must not remain blue and self-lit at night.
            var glass = AssetDatabase.LoadAssetAtPath<Material>(Root + "Materials/Environment/Glass.mat");
            if (glass != null) { glass.SetColor("_BaseColor", new Color(.13f, .17f, .18f, .055f)); EditorUtility.SetDirty(glass); }
            cycle.SetHour(cycle.startHour);
            WarehouseReflectionCacheBuilder.InstallIntoScene();
            EditorUtility.SetDirty(sky);
            EditorUtility.SetDirty(cycle);
        }

        public static string Validate()
        {
            var cycle = Object.FindFirstObjectByType<WarehouseDayNight>();
            Require(cycle != null && cycle.sun != null, "Sun cycle missing.");
            WarehouseReflectionCacheBuilder.Validate();
            Require(Mathf.Abs(cycle.startHour-9)<.001f && cycle.windows.Length == 16, "Morning start or window bindings invalid.");
            Require(Mathf.Abs(cycle.dayLengthMinutes-30)<.001f, "Each daylight direction should take thirty real minutes.");
            var rows = Object.FindObjectsByType<WarehouseLightRow>(FindObjectsSortMode.None);
            var switches = Object.FindObjectsByType<WarehouseLightSwitch>(FindObjectsSortMode.None);
            Require(rows.Length == 3 && switches.Length == 3, "Expected three independent rows and three switches.");
            var pipeline = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            Require(pipeline != null && pipeline.supportsAdditionalLightShadows, "Additional light shadows disabled.");
            var renderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(Root + "Materials/RackLabRenderer.asset");
            Require(renderer.renderingMode == RenderingMode.ForwardPlus, "Forward+ required for all twelve fixtures.");
            var lights = rows.SelectMany(row => row.FixtureLights).ToArray();
            Require(lights.Length == 12 && lights.Distinct().Count() == 12, "Expected twelve unique row lights.");
            Require(lights.All(light => light != null && light.type == LightType.Spot && light.shadows == LightShadows.Soft), "Fixture shadow configuration invalid.");
            Require(rows.SelectMany(row => row.Diffusers).All(lens => lens.sharedMaterial.IsKeywordEnabled("_EMISSION")), "Diffuser emission shader variant missing.");
            Require(switches.Select(item => item.Row).Distinct().Count() == 3, "Switches share a circuit.");
            float originalHour = cycle.Hour;
            bool originalPause = cycle.paused;
            cycle.paused = false;
            var originalStates = rows.Select(row => row.IsOn).ToArray();
            try
            {
                foreach (float hour in new[] { 9f, 10f, 12f, 14f, 16f })
                {
                    cycle.SetHour(hour);
                    var direction = -cycle.TowardSun;
                    Require(cycle.sun.intensity > 0 && cycle.Daylight>.99f, "Working hours must stay fully daylight.");
                    foreach (var window in cycle.windows)
                    {
                        bool visible = window.GetComponent<Renderer>().enabled;
                        Require(!visible || Vector3.Dot(direction, window.windowInward) > .025f, "A back-facing window emits sunlight.");
                        if (!visible) continue;
                        var matrix = window.VolumeMatrix();
                        Require(Mathf.Abs(matrix.determinant) > .001f, "Singular window volume.");
                        var travel = (Vector3)matrix.GetColumn(2);
                        Require(Vector3.Dot(travel.normalized, direction) > .9999f, "Window shaft lost sun alignment.");
                        var bounds = window.GetComponent<MeshFilter>().sharedMesh.bounds;
                        Require(bounds.Contains(matrix.MultiplyPoint3x4(Vector3.zero)), "Moving sunlight is outside its mesh bounds.");
                    }
                    if (hour == 9) Require(direction.x < 0, "Morning sun must enter east windows.");
                    if (hour == 16) Require(direction.x > 0, "Evening sun must enter west windows.");
                }
                for (int selected = -1; selected < 3; selected++)
                {
                    for (int row = 0; row < 3; row++) rows[row].SetOn(row == selected);
                    for (int row = 0; row < 3; row++)
                        Require(rows[row].FixtureLights.All(light => light.enabled == (row == selected)), "Switch affects another row or leaves a light behind.");
                }
                float legSeconds=cycle.dayLengthMinutes*60;
                cycle.SetHour(WarehouseDayNight.MorningHour);
                cycle.Advance(legSeconds*.5f);
                Require(Mathf.Abs(cycle.Hour-12.5f)<.001f,"Working day midpoint is incorrect.");
                cycle.Advance(legSeconds*.5f-30);
                float beforeTurn=cycle.Hour;
                cycle.Advance(30);
                Require(Mathf.Abs(cycle.Hour-WarehouseDayNight.AfternoonHour)<.001f,"Daylight must reach 4 p.m. after thirty minutes.");
                cycle.Advance(30);
                Require(Mathf.Abs(cycle.Hour-beforeTurn)<.001f,"Afternoon reversal is not smooth and symmetric.");
                cycle.Advance(legSeconds-30);
                Require(Mathf.Abs(cycle.Hour-WarehouseDayNight.MorningHour)<.001f,"Daylight must return to morning without a night phase.");
                cycle.SetHour(cycle.startHour);
                cycle.Advance(legSeconds*1.25f);
                float wholeStepHour = cycle.Hour;
                cycle.SetHour(cycle.startHour);
                for (int step = 0; step < 4500; step++) cycle.Advance(.5f);
                Require(Mathf.Abs(cycle.Hour-wholeStepHour)<.001f,"Daylight reversal depends on frame rate.");
                cycle.SetHour(0);Require(cycle.Hour==9,"Manual clock input allows night.");
                cycle.SetHour(24);Require(cycle.Hour==16,"Manual clock input exceeds afternoon.");
                Require(RenderSettings.ambientEquatorColor.r>=.30f&&RenderSettings.ambientGroundColor.r>=.22f,"Stock shadow faces have lost the intended indirect fill.");
                cycle.paused = true;
                float pausedHour = cycle.Hour;
                cycle.Advance(60);
                Require(cycle.Hour == pausedHour, "Manual pause advances time.");
                cycle.paused = false;
                foreach (var item in switches)
                {
                    Physics.SyncTransforms();
                    Vector3 origin = item.transform.position + Vector3.forward * 1.8f;
                    Require(Physics.Raycast(origin, Vector3.back, out var hit, 2) && hit.collider.GetComponentInParent<WarehouseLightSwitch>() == item, "Switch cannot be reached from the aisle.");
                }
            }
            finally
            {
                cycle.paused = originalPause;
                cycle.SetHour(Application.isPlaying ? originalHour : cycle.startHour);
                for (int i = 0; i < rows.Length; i++) rows[i].SetOn(originalStates[i]);
            }
            string report = "Passed: 9 a.m. start; thirty-minute morning-to-4 p.m. travel and thirty-minute return; smooth symmetric reversal; frame-independent phase; manual inputs clamp to daylight; five solar times; sixteen aligned window volumes; no back-facing shafts; useful equator/ground indirect fill; twelve unique shadowed fixtures; independent three-row switching; switch raycasts; pause. Cached environment reflection retained with the local probe disabled.";
            File.WriteAllText(Root + "Reports/warehouse-lighting-validation.txt", report + "\n");
            Debug.Log(report);
            return report;
        }

        static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
    }
}
