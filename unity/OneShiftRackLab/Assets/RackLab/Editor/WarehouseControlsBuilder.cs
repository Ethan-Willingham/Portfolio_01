using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace OneShift.RackLab
{
    // Updates only control tuning on the saved truck and walker. The warehouse,
    // independent stock, joints and collision geometry remain authored assets.
    public static class WarehouseControlsBuilder
    {
        const string Root = "Assets/RackLab/";
        const string PrefabPath = Root + "Prefabs/WarehouseForklift.prefab";

        [MenuItem("One Shift/Refine warehouse controls")]
        public static string Install()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                throw new InvalidOperationException("Stop Play before installing saved control tuning.");
            var scene = SceneManager.GetActiveScene();
            if (scene.path != Root + "Scenes/RackFloor.unity")
                throw new InvalidOperationException("Open RackFloor.unity before installing controls.");
            Directory.CreateDirectory("Temp/ControlsBackup");
            string stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
            EditorSceneManager.SaveScene(scene, "Temp/ControlsBackup/BeforeControls-" + stamp + ".unity", true);
            File.Copy(PrefabPath, "Temp/ControlsBackup/Forklift-" + stamp + ".prefab", true);
            var prefab = PrefabUtility.LoadPrefabContents(PrefabPath);
            try
            {
                Configure(prefab.GetComponent<ForkliftDriveController>());
                PrefabUtility.SaveAsPrefabAsset(prefab, PrefabPath);
            }
            finally { PrefabUtility.UnloadPrefabContents(prefab); }
            foreach (var driver in Object.FindObjectsByType<ForkliftDriveController>(FindObjectsSortMode.None))
            {
                Undo.RecordObject(driver, "Refine forklift controls");
                Configure(driver);
                if (PrefabUtility.IsPartOfPrefabInstance(driver)) PrefabUtility.RecordPrefabInstancePropertyModifications(driver);
            }
            foreach (var walking in Object.FindObjectsByType<RackWalkController>(FindObjectsSortMode.None))
            {
                Undo.RecordObject(walking, "Refine warehouse walking");
                walking.groundAcceleration = 18;
                walking.groundDeceleration = 24;
                walking.airAcceleration = 3;
                walking.jumpHeight = .34f;
                EditorUtility.SetDirty(walking);
                if (PrefabUtility.IsPartOfPrefabInstance(walking)) PrefabUtility.RecordPrefabInstancePropertyModifications(walking);
            }
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
            AssetDatabase.SaveAssets();
            return "Saved responsive rear steering, finite lift-off drag, and grounded walking tuning. Run controls, driving and hydraulic validation before export.";
        }

        static void Configure(ForkliftDriveController driver)
        {
            if (driver == null) throw new InvalidOperationException("Forklift drive controller missing.");
            driver.throttleResponse = 4.8f;
            driver.coastingBrakeTorque = 1200;
            driver.steeringRate = 210;
            driver.steeringReturnRate = 260;
            EditorUtility.SetDirty(driver);
        }
    }
}
