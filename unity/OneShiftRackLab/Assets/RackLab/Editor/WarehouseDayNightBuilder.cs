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

        public static void InstallIntoScene()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before installing lighting.");
            var sun = GameObject.Find("High warehouse daylight").GetComponent<Light>();
            var cycle = sun.GetComponent<WarehouseDayNight>() ?? sun.gameObject.AddComponent<WarehouseDayNight>();
            cycle.sun = sun;
            cycle.windows = Object.FindObjectsByType<WarehouseSunVolume>(FindObjectsSortMode.None);
            cycle.startHour = 4.5f;
            cycle.dayLengthMinutes = 9;
            cycle.nightLengthMinutes = 1.5f;
            cycle.peakSunIntensity = 2.35f;
            cycle.beamIntensity = .75f;
            cycle.daytimeAmbientIntensity = .8f;
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
                probe.mode = ReflectionProbeMode.Realtime;
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
            EditorUtility.SetDirty(sky);
            EditorUtility.SetDirty(cycle);
        }

        public static string Validate()
        {
            var cycle = Object.FindFirstObjectByType<WarehouseDayNight>();
            Require(cycle != null && cycle.sun != null, "Sun cycle missing.");
            Require(cycle.startHour < 6 && cycle.windows.Length == 16, "Night start or window bindings invalid.");
            Require(cycle.dayLengthMinutes >= 8 && cycle.dayLengthMinutes <= 10, "Daylight should last eight to ten real minutes.");
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
                foreach (float hour in new[] { 0f, 4.5f, 6f, 8f, 12f, 16f, 18f, 21f, 23.99f })
                {
                    cycle.SetHour(hour);
                    var direction = -cycle.TowardSun;
                    bool night = hour <= 6 || hour >= 18;
                    Require(!night || cycle.sun.intensity < .0001f, "Sun illuminates from below horizon.");
                    foreach (var window in cycle.windows)
                    {
                        bool visible = window.GetComponent<Renderer>().enabled;
                        Require(!visible || (!night && Vector3.Dot(direction, window.windowInward) > .025f), "A back-facing or night window emits sunlight.");
                        if (!visible) continue;
                        var matrix = window.VolumeMatrix();
                        Require(Mathf.Abs(matrix.determinant) > .001f, "Singular window volume.");
                        var travel = (Vector3)matrix.GetColumn(2);
                        Require(Vector3.Dot(travel.normalized, direction) > .9999f, "Window shaft lost sun alignment.");
                        var bounds = window.GetComponent<MeshFilter>().sharedMesh.bounds;
                        Require(bounds.Contains(matrix.MultiplyPoint3x4(Vector3.zero)), "Moving sunlight is outside its mesh bounds.");
                    }
                    if (hour == 8) Require(direction.x < 0, "Morning sun must enter east windows.");
                    if (hour == 16) Require(direction.x > 0, "Evening sun must enter west windows.");
                }
                for (int selected = -1; selected < 3; selected++)
                {
                    for (int row = 0; row < 3; row++) rows[row].SetOn(row == selected);
                    for (int row = 0; row < 3; row++)
                        Require(rows[row].FixtureLights.All(light => light.enabled == (row == selected)), "Switch affects another row or leaves a light behind.");
                }
                float nightHours = 24 - (WarehouseDayNight.SunsetHour - WarehouseDayNight.MorningHour);
                float openingSeconds = (WarehouseDayNight.MorningHour - cycle.startHour) * cycle.nightLengthMinutes * 60 / nightHours;
                Require(openingSeconds >= 15 && openingSeconds <= 20, "The opening night should reach morning in fifteen to twenty seconds.");
                cycle.SetHour(cycle.startHour);
                cycle.Advance(openingSeconds);
                Require(Mathf.Abs(cycle.Hour - WarehouseDayNight.MorningHour) < .001f, "Opening night fails to arrive at morning.");
                cycle.Advance(60);
                Require(cycle.Hour > 7 && cycle.Hour < 9, "Morning does not slow down for the working day.");
                cycle.SetHour(WarehouseDayNight.MorningHour);
                cycle.Advance(cycle.dayLengthMinutes * 60);
                Require(Mathf.Abs(cycle.Hour - WarehouseDayNight.SunsetHour) < .001f && cycle.sun.intensity < .0001f,
                    "The slow day must finish at sunset without skipping it.");
                cycle.Advance(cycle.nightLengthMinutes * 60);
                Require(Mathf.Abs(cycle.Hour - WarehouseDayNight.MorningHour) < .001f, "The fast overnight period fails to reach the next morning.");
                cycle.SetHour(cycle.startHour);
                cycle.Advance(30);
                float wholeStepHour = cycle.Hour;
                cycle.SetHour(cycle.startHour);
                for (int step = 0; step < 60; step++) cycle.Advance(.5f);
                Require(Mathf.Abs(cycle.Hour - wholeStepHour) < .001f, "Crossing the fast-to-slow boundary depends on frame rate.");
                cycle.SetHour(23.99f);
                cycle.Advance(1);
                Require(cycle.Hour < 1, "Clock fails at midnight.");
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
            string report = "Passed: night start; morning reached in 15-20 seconds; slow eight-to-ten-minute daylight; faster overnight return; frame-independent morning transition; nine solar times; east sunrise and west sunset; sixteen aligned window volumes with moving mesh bounds; no night or back-facing shafts; twelve unique shadowed fixtures; independent three-row switching; accessible switch raycasts; midnight wrap; pause. Forward+ and additional-light shadows enabled.";
            File.WriteAllText(Root + "Reports/warehouse-lighting-validation.txt", report + "\n");
            Debug.Log(report);
            return report;
        }

        static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
    }
}
