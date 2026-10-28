using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace OneShift.RackLab
{
    // Three 512-pixel slices plus nine 128-pixel slices fit the existing 1024
    // atlas. Spend detail on fixtures near the actual view, instead of asking
    // every warehouse light to render a larger shadow map on every frame.
    public sealed class WarehouseShadowBudget : MonoBehaviour
    {
        public Light[] fixtures;
        UniversalAdditionalLightData[] data;
        bool[] detailed;
        Camera view;
        float nextRefresh;
        const string NearTier = "{\"m_AdditionalLightsShadowResolutionTier\":2}";
        const string FarTier = "{\"m_AdditionalLightsShadowResolutionTier\":0}";

        void Awake()
        {
            data=new UniversalAdditionalLightData[fixtures.Length];
            detailed=new bool[fixtures.Length];
            for(int i=0;i<fixtures.Length;i++)data[i]=fixtures[i].GetComponent<UniversalAdditionalLightData>();
            Refresh();
        }

        void LateUpdate()
        {
            if(Time.unscaledTime<nextRefresh)return;
            nextRefresh=Time.unscaledTime+.4f;Refresh();
        }

        void Refresh()
        {
            if(view==null)view=Camera.main;
            if(view==null)return;
            Vector3 position=view.transform.position;
            int a=-1,b=-1,c=-1;float sa=float.PositiveInfinity,sb=sa,sc=sa;
            for(int i=0;i<fixtures.Length;i++)
            {
                Vector3 delta=fixtures[i].transform.position-position;delta.y=0;
                // Hysteresis avoids reallocating adjacent slices when the
                // camera merely turns or sways near a distance boundary.
                float score=delta.sqrMagnitude*(detailed[i] ? .8f : 1f);
                if(score<sa){c=b;sc=sb;b=a;sb=sa;a=i;sa=score;}
                else if(score<sb){c=b;sc=sb;b=i;sb=score;}
                else if(score<sc){c=i;sc=score;}
            }
            for(int i=0;i<fixtures.Length;i++)
            {
                detailed[i]=i==a||i==b||i==c;
                // URP exposes this serialized tier as a read-only property.
                // Overwrite that one field through Unity's runtime serializer;
                // all light bias, layer and cookie settings remain intact.
                // The Web pipeline maps High to 512 and Low to 128. Do not
                // write custom pixel counts to Light.shadowResolution: this
                // Unity version rejects values outside its native enum.
                int tier=detailed[i]?UniversalAdditionalLightData.AdditionalLightsShadowResolutionTierHigh:
                    UniversalAdditionalLightData.AdditionalLightsShadowResolutionTierLow;
                if(data[i].additionalLightsShadowResolutionTier!=tier)
                    JsonUtility.FromJsonOverwrite(detailed[i]?NearTier:FarTier,data[i]);
                data[i].softShadowQuality=detailed[i]?SoftShadowQuality.Medium:SoftShadowQuality.Low;
            }
        }
    }
}
