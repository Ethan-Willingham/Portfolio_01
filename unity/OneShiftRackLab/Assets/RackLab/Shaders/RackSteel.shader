Shader "OneShift/Rack Steel"
{
    Properties
    {
        _WearNoise("Wear pattern",2D) = "gray" {}
        _RackLabel("Location sticker",2D) = "white" {}
        _Wear("Wear",Range(0,1)) = 0
    }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="TransparentCutout" "Queue"="AlphaTest" }
        Cull Off
        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode"="UniversalForward" }
            HLSLPROGRAM
            #pragma vertex RackVertex
            #pragma fragment RackFragment
            #pragma target 3.0
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile_fragment _ _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_fog
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "RackFinish.hlsl"
            struct Attributes
            {
                float4 positionOS:POSITION;
                float3 normalOS:NORMAL;
                float4 color:COLOR;
                float2 uv:TEXCOORD0;
                float2 surface:TEXCOORD1;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };
            struct Varyings
            {
                float4 positionCS:SV_POSITION;
                float3 positionWS:TEXCOORD0;
                half3 normalWS:TEXCOORD1;
                float3 positionOS:TEXCOORD2;
                float3 normalOS:TEXCOORD3;
                float4 uv:TEXCOORD4;
                float4 color:COLOR;
                half fog:TEXCOORD5;
                UNITY_VERTEX_INPUT_INSTANCE_ID
                UNITY_VERTEX_OUTPUT_STEREO
            };
            Varyings RackVertex(Attributes input)
            {
                Varyings output=(Varyings)0;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input,output);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
                VertexPositionInputs p=GetVertexPositionInputs(input.positionOS.xyz);
                output.positionCS=p.positionCS;
                output.positionWS=p.positionWS;
                output.normalWS=TransformObjectToWorldNormal(input.normalOS);
                output.positionOS=input.positionOS.xyz;
                output.normalOS=input.normalOS;
                output.uv=float4(input.uv,input.surface);
                output.color=input.color;
                output.fog=ComputeFogFactor(p.positionCS.z);
                return output;
            }
            half4 RackFragment(Varyings input, bool front:SV_IsFrontFace):SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);
                clip(RackCoverage(input.uv.xy,input.uv.zw)-.5);
                float3 color;
                float metal,gloss;
                RackFinish(input.positionOS,input.normalOS,input.uv.xy,input.uv.zw,input.color,color,metal,gloss);
                InputData d=(InputData)0;
                d.positionWS=input.positionWS;
                d.normalWS=normalize(input.normalWS)*(front?1:-1);
                d.viewDirectionWS=GetWorldSpaceNormalizeViewDir(input.positionWS);
                d.shadowCoord=TransformWorldToShadowCoord(input.positionWS);
                d.bakedGI=SampleSH(d.normalWS);
                d.normalizedScreenSpaceUV=GetNormalizedScreenSpaceUV(input.positionCS);
                d.shadowMask=half4(1,1,1,1);
                SurfaceData s=(SurfaceData)0;
                s.albedo=color;
                s.alpha=1;
                s.metallic=metal;
                s.smoothness=gloss;
                s.normalTS=half3(0,0,1);
                s.occlusion=1;
                half4 result=UniversalFragmentPBR(d,s);
                result.rgb=MixFog(result.rgb,input.fog);
                return result;
            }
            ENDHLSL
        }
        Pass
        {
            Name "ShadowCaster"
            Tags {"LightMode"="ShadowCaster"}
            ZWrite On ZTest LEqual ColorMask 0
            HLSLPROGRAM
            #pragma vertex ShadowVertex
            #pragma fragment ShadowFragment
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"
            #include "RackFinish.hlsl"
            float3 _LightDirection;
            struct A {float4 p:POSITION;float3 n:NORMAL;float2 uv:TEXCOORD0;float2 s:TEXCOORD1;UNITY_VERTEX_INPUT_INSTANCE_ID};
            struct V {float4 p:SV_POSITION;float4 uv:TEXCOORD0;};
            V ShadowVertex(A a)
            {
                UNITY_SETUP_INSTANCE_ID(a);
                V o;
                float3 world=TransformObjectToWorld(a.p.xyz);
                o.p=TransformWorldToHClip(ApplyShadowBias(world,TransformObjectToWorldNormal(a.n),_LightDirection));
                #if UNITY_REVERSED_Z
                o.p.z=min(o.p.z,UNITY_NEAR_CLIP_VALUE*o.p.w);
                #else
                o.p.z=max(o.p.z,UNITY_NEAR_CLIP_VALUE*o.p.w);
                #endif
                o.uv=float4(a.uv,a.s);
                return o;
            }
            half4 ShadowFragment(V i):SV_Target {clip(RackCoverage(i.uv.xy,i.uv.zw)-.5);return 0;}
            ENDHLSL
        }
    }
    SubShader
    {
        Tags { "RenderType"="TransparentCutout" "Queue"="AlphaTest" }
        Cull Off
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows addshadow vertex:vert
        #pragma target 3.0
        #pragma multi_compile_instancing
        #include "RackFinish.hlsl"
        struct Input {float3 localPos;float3 localNormal;float4 faceData;float4 color:COLOR;float facing:VFACE;};
        void vert(inout appdata_full v,out Input o)
        {
            UNITY_INITIALIZE_OUTPUT(Input,o);
            o.localPos=v.vertex.xyz;
            o.localNormal=v.normal;
            o.faceData=float4(v.texcoord.xy,v.texcoord1.xy);
        }
        void surf(Input i,inout SurfaceOutputStandard o)
        {
            clip(RackCoverage(i.faceData.xy,i.faceData.zw)-.5);
            float3 color;float metal,gloss;
            RackFinish(i.localPos,i.localNormal,i.faceData.xy,i.faceData.zw,i.color,color,metal,gloss);
            o.Albedo=color;o.Metallic=metal;o.Smoothness=gloss;o.Alpha=1;
            o.Normal=float3(0,0,i.facing>0?1:-1);
        }
        ENDCG
    }
    Fallback "Diffuse"
}
