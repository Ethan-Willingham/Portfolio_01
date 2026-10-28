using System.IO;
using UnityEditor;
using UnityEngine;

namespace OneShift.RackLab
{
    public static class WarehouseCareerBuilder
    {
        [MenuItem("One Shift/Install career resources")]
        public static string Install()
        {
            const string folder="Assets/RackLab/Resources";
            Directory.CreateDirectory(folder);AssetDatabase.Refresh();
            foreach(var name in new[]{"WarehouseGuide","WarehouseTrade"})
            {
                string path=folder+"/"+name+".mat";
                var material=AssetDatabase.LoadAssetAtPath<Material>(path);
                if(material==null){material=new Material(Shader.Find(name=="WarehouseGuide"?"Universal Render Pipeline/Unlit":"Universal Render Pipeline/Lit"));AssetDatabase.CreateAsset(material,path);}
                material.color=new Color(.62f,.50f,.31f);
                if(material.HasProperty("_Smoothness"))material.SetFloat("_Smoothness",.16f);
                EditorUtility.SetDirty(material);
            }
            AssetDatabase.SaveAssets();
            return "Career materials retained in Resources, including the floor-guide shader and stock font.";
        }
    }
}
