using System;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    // Avoid the local-probe path affected by WebGL/ANGLE light indexing.
    // Cache the room as the environment reflection; keep direct lighting live.
    public static class WarehouseReflectionCacheBuilder
    {
        public const string CachePath = "Assets/RackLab/Materials/Environment/WarehouseRoomReflection.exr";

        [MenuItem("One Shift/Rebuild stable room reflection")]
        public static string Rebuild()
        {
            InstallIntoScene(true);
            EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene());
            AssetDatabase.SaveAssets();
            return Validate();
        }

        public static void InstallIntoScene(bool rebuild = false)
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                throw new InvalidOperationException("Stop Play before capturing the room reflection.");
            var cycle = Object.FindFirstObjectByType<WarehouseDayNight>();
            if (cycle == null || cycle.roomReflection == null)
                throw new InvalidOperationException("Install the warehouse day/night cycle and room probe first.");
            var probe = cycle.roomReflection;
            var texture = AssetDatabase.LoadAssetAtPath<Texture>(CachePath);
            if (rebuild || texture == null)
            {
                var oldMode = probe.mode;
                int oldResolution = probe.resolution;
                bool wasEnabled = probe.enabled;
                try
                {
                    // The offline bake includes the authored room and fixtures,
                    // at a neutral morning sky. It does not bake direct lighting.
                    cycle.SetHour(9);
                    probe.mode = ReflectionProbeMode.Baked;
                    probe.enabled = true;
                    probe.resolution = 128;
                    probe.hdr = true;
                    if (!Lightmapping.BakeReflectionProbe(probe, CachePath))
                        throw new InvalidOperationException("Room reflection capture failed.");
                    AssetDatabase.ImportAsset(CachePath, ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
                    texture = AssetDatabase.LoadAssetAtPath<Texture>(CachePath);
                }
                finally
                {
                    probe.mode = oldMode;
                    probe.resolution = oldResolution;
                    probe.enabled = wasEnabled;
                    cycle.SetHour(cycle.startHour);
                }
            }
            if (texture == null || texture.dimension != TextureDimension.Cube)
                throw new InvalidOperationException("The captured room reflection must be a cubemap.");
            probe.customBakedTexture = texture;
            probe.mode = ReflectionProbeMode.Custom;
            // A cached but still enabled local probe reproduced the brightness
            // jump in the browser. Keep its bounds only for future recaptures.
            probe.enabled = false;
            RenderSettings.defaultReflectionMode = DefaultReflectionMode.Custom;
            RenderSettings.customReflection = (Cubemap)texture;
            probe.refreshMode = ReflectionProbeRefreshMode.ViaScripting;
            probe.resolution = 128;
            EditorUtility.SetDirty(probe);
            EditorUtility.SetDirty(cycle);
            EditorSceneManager.MarkSceneDirty(probe.gameObject.scene);
        }

        public static string Validate()
        {
            var cycle = Object.FindFirstObjectByType<WarehouseDayNight>();
            if (cycle == null || cycle.roomReflection == null ||
                cycle.roomReflection.mode != ReflectionProbeMode.Custom ||
                cycle.roomReflection.enabled ||
                cycle.roomReflection.customBakedTexture == null ||
                RenderSettings.defaultReflectionMode != DefaultReflectionMode.Custom ||
                RenderSettings.customReflection != cycle.roomReflection.customBakedTexture ||
                AssetDatabase.GetAssetPath(cycle.roomReflection.customBakedTexture) != CachePath)
                throw new InvalidOperationException("The room must use the saved environment cubemap with the local probe disabled.");
            cycle.RequestReflection();
            if (cycle.ReflectionPending)
                throw new InvalidOperationException("Cached reflections must not queue captures or delay browser preparation.");
            return "Stable room reflection: 128-pixel cached environment cubemap, local probe disabled, no live captures or preparation wait; live sun, ambient, fixture lights and shadows retained.";
        }
    }
}
