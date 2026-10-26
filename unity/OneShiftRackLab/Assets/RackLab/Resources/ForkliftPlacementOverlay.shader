Shader "OneShift/Forklift Placement Overlay"
{
    Properties { _Color ("Hidden geometry", Color) = (0.83,0.77,0.63,0.58) }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "Queue"="Transparent+50" "RenderType"="Transparent" }
        Pass
        {
            Name "Occluded geometry only"
            Tags { "LightMode"="SRPDefaultUnlit" }
            ZWrite Off
            ZTest Greater
            Cull Off
            Blend SrcAlpha OneMinusSrcAlpha
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            CBUFFER_START(UnityPerMaterial)
                half4 _Color;
            CBUFFER_END
            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings { float4 positionCS : SV_POSITION; };
            Varyings Vert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                return output;
            }
            half4 Frag(Varyings input) : SV_Target { return _Color; }
            ENDHLSL
        }
    }
}
