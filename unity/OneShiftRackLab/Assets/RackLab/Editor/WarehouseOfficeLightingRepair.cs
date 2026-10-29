using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace OneShift.RackLab
{
    // Repair only the existing office lighting, retaining authored geometry,
    // the two actual fills, and the warehouse's shadow-map budget.
    public static class WarehouseOfficeLightingRepair
    {
        const string Root="Assets/RackLab/";
        const string LensPath=Root+"Materials/Office/Officelightdiffuser.mat";
        [MenuItem("One Shift/Repair steady office fixtures")]
        public static string Install()
        {
            if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play before repairing office fixtures.");
            var scene=SceneManager.GetActiveScene();
            if(scene.path!=Root+"Scenes/RackFloor.unity")throw new InvalidOperationException("Open RackFloor.unity first.");
            var office=GameObject.Find("Warehouse front office");
            if(office==null)throw new InvalidOperationException("Install the front office first.");
            var material=AssetDatabase.LoadAssetAtPath<Material>(LensPath);
            var shader=Shader.Find("Universal Render Pipeline/Unlit");
            if(material==null||shader==null)throw new InvalidOperationException("Office diffuser material or URP unlit shader missing.");
            Undo.RecordObject(material,"Keep office fixture faces steady");
            material.shader=shader;material.shaderKeywords=Array.Empty<string>();
            material.SetColor("_BaseColor",new Color(1.15f,1.10f,.96f));
            material.globalIlluminationFlags=MaterialGlobalIlluminationFlags.None;
            EditorUtility.SetDirty(material);
            foreach(var renderer in office.GetComponentsInChildren<Renderer>(true).Where(r=>r.sharedMaterials.Contains(material)))
            {
                Undo.RecordObject(renderer,"Remove shadow and reflection variation from office lenses");
                renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
                renderer.lightProbeUsage=LightProbeUsage.Off;renderer.reflectionProbeUsage=ReflectionProbeUsage.Off;
                EditorUtility.SetDirty(renderer);
            }
            foreach(var light in office.GetComponentsInChildren<Light>(true).Where(l=>l.name=="Office ceiling fill"))
            {
                Undo.RecordObject(light,"Retain full-quality office fills");
                light.renderMode=LightRenderMode.ForcePixel;light.shadows=LightShadows.None;
                EditorUtility.SetDirty(light);
            }
            WarehouseReflectionCacheBuilder.InstallIntoScene();
            EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
            return Validate();
        }
        public static string Validate()
        {
            var office=GameObject.Find("Warehouse front office");
            if(office==null)throw new InvalidOperationException("Office missing.");
            var fills=office.GetComponentsInChildren<Light>(true);
            if(fills.Length!=2||fills.Any(l=>l.type!=LightType.Point||l.shadows!=LightShadows.None||l.renderMode!=LightRenderMode.ForcePixel||Mathf.Abs(l.intensity-13)>.001f||Mathf.Abs(l.range-6.2f)>.001f))
                throw new InvalidOperationException("Office must retain exactly two constant 13-intensity, 6.2 m unshadowed point fills.");
            var material=AssetDatabase.LoadAssetAtPath<Material>(LensPath);
            var lenses=office.GetComponentsInChildren<Renderer>(true).Where(r=>r.sharedMaterials.Contains(material)).ToArray();
            if(material==null||material.shader.name!="Universal Render Pipeline/Unlit"||lenses.Length==0||lenses.Any(r=>r.shadowCastingMode!=ShadowCastingMode.Off||r.receiveShadows||r.reflectionProbeUsage!=ReflectionProbeUsage.Off))
                throw new InvalidOperationException("Office lenses must emit steadily without shadow or reflection dependencies.");
            string result="Office fixture validation passed: two unchanged unshadowed point fills; shared unlit diffuser faces with no shadow, probe or reflection variation. No new lights or shadow maps. "+WarehouseReflectionCacheBuilder.Validate()+" Native office-entry rendering still requires browser inspection.";
            File.WriteAllText(Root+"Reports/warehouse-office-lighting-validation.txt",result+Environment.NewLine);return result;
        }
    }
}
