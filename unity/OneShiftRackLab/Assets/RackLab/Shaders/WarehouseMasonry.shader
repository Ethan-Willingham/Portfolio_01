Shader "OneShift/Warehouse Masonry"
{
    Properties
    {
        _BaseColor("Painted block",Color) = (.79,.765,.695,1)
        _MortarColor("Recessed mortar",Color) = (.64,.63,.57,1)
        _Smoothness("Smoothness",Range(0,1)) = .18
        _BlockSize("Block size in metres",Vector) = (.4064,.2032,0,0)
        _MortarWidth("Mortar width in metres",Range(.003,.016)) = .008
        _Relief("Mortar recess in metres",Range(0,.006)) = .002
    }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" "Queue"="Geometry" }
        Cull Back
        ZWrite On

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        CBUFFER_START(UnityPerMaterial)
            half4 _BaseColor;
            half4 _MortarColor;
            float4 _BlockSize;
            half _Smoothness;
            float _MortarWidth;
            float _Relief;
        CBUFFER_END
        ENDHLSL

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode"="UniversalForwardOnly" }
            HLSLPROGRAM
            #pragma target 3.0
            #pragma vertex MasonryVertex
            #pragma fragment MasonryFragment
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile _ _CLUSTER_LIGHT_LOOP
            #pragma multi_compile_fragment _ _ADDITIONAL_LIGHT_SHADOWS
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile_fragment _ _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_fragment _ _SCREEN_SPACE_OCCLUSION
            #pragma multi_compile_fog
            #pragma multi_compile_instancing
            // Painted blockwork is matte. Keep its diffuse light, mortar
            // relief and real shadows without a glossy direct-light lobe.
            #define _SPECULARHIGHLIGHTS_OFF 1
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            struct MasonryAttributes
            {
                float4 positionOS:POSITION;
                float3 normalOS:NORMAL;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };
            struct MasonryVaryings
            {
                float4 positionCS:SV_POSITION;
                float3 positionWS:TEXCOORD0;
                half3 normalWS:TEXCOORD1;
                half4 fogAndVertexLight:TEXCOORD2;
                UNITY_VERTEX_INPUT_INSTANCE_ID
                UNITY_VERTEX_OUTPUT_STEREO
            };
            MasonryVaryings MasonryVertex(MasonryAttributes input)
            {
                MasonryVaryings output=(MasonryVaryings)0;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input,output);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
                VertexPositionInputs p=GetVertexPositionInputs(input.positionOS.xyz);
                output.positionCS=p.positionCS;
                output.positionWS=p.positionWS;
                output.normalWS=TransformObjectToWorldNormal(input.normalOS);
                output.fogAndVertexLight=half4(ComputeFogFactor(p.positionCS.z),VertexLighting(p.positionWS,output.normalWS));
                return output;
            }
            float MasonryHash(float2 p)
            {
                float3 q=frac(float3(p.xyx)*.1031);
                q+=dot(q,q.yzx+33.33);
                return frac((q.x+q.y)*q.z);
            }
            float MasonryNoise(float2 p)
            {
                float2 cell=floor(p),f=frac(p);
                f=f*f*(3-2*f);
                return lerp(lerp(MasonryHash(cell),MasonryHash(cell+float2(1,0)),f.x),
                            lerp(MasonryHash(cell+float2(0,1)),MasonryHash(cell+1),f.x),f.y);
            }
            half4 MasonryFragment(MasonryVaryings input):SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
                float3 normalWS=normalize(input.normalWS);
                float3 a=abs(normalWS);
                // The two wall projections share world height, keeping courses aligned around corners.
                float2 wallUV=a.x>a.z?input.positionWS.zy:input.positionWS.xy;
                if(a.y>max(a.x,a.z)) wallUV=input.positionWS.xz;
                float2 size=max(_BlockSize.xy,float2(.05,.05));
                float2 grid=wallUV/size;
                float row=floor(grid.y);
                grid.x+=frac(row*.5);
                float2 cell=floor(grid),within=frac(grid);
                float2 edge=min(within,1-within)*size;
                float edgeDistance=min(edge.x,edge.y);
                float pixelSize=max(length(fwidth(wallUV)),.0001);
                float aa=pixelSize*.55;
                float joint=_MortarWidth*.5;
                float face=smoothstep(joint-aa,joint+aa,edgeDistance);
                // A shallow bevel catches grazing daylight without making the blocks look inflated.
                float bevel=smoothstep(joint-aa,joint+.003+aa,edgeDistance);
                float blockVariation=lerp(.973,1.027,MasonryHash(cell));
                float fineVisibility=1-smoothstep(.0015,.009,pixelSize);
                float pores=MasonryNoise(wallUV*240);
                float aggregate=MasonryNoise(wallUV*51);
                float fine=(pores-.5)*fineVisibility;
                half3 blockColor=_BaseColor.rgb*blockVariation*(1+fine*.037+(aggregate-.5)*.018);
                half3 color=lerp(_MortarColor.rgb,blockColor,face);
                float ground=saturate((.5-input.positionWS.y)/.5);
                color*=1-ground*ground*(.024+.025*MasonryNoise(wallUV*3.7));

                // Screen derivatives turn the millimetre-scale recess and pores into a physical surface normal.
                float height=bevel*_Relief+fine*.00012*face;
                float3 dpdx=ddx(input.positionWS),dpdy=ddy(input.positionWS);
                float3 r1=cross(dpdy,normalWS),r2=cross(normalWS,dpdx);
                float determinant=dot(dpdx,r1);
                float3 gradient=(ddx(height)*r1+ddy(height)*r2)*sign(determinant)/max(abs(determinant),.0000001);
                normalWS=normalize(normalWS-gradient);

                InputData data=(InputData)0;
                data.positionWS=input.positionWS;
                data.normalWS=normalWS;
                data.viewDirectionWS=GetWorldSpaceNormalizeViewDir(input.positionWS);
                #if defined(_MAIN_LIGHT_SHADOWS_SCREEN)
                    data.shadowCoord=ComputeScreenPos(TransformWorldToHClip(input.positionWS));
                #else
                    data.shadowCoord=TransformWorldToShadowCoord(input.positionWS);
                #endif
                data.bakedGI=SampleSH(normalWS);
                data.vertexLighting=input.fogAndVertexLight.yzw;
                data.normalizedScreenSpaceUV=GetNormalizedScreenSpaceUV(input.positionCS);
                data.shadowMask=half4(1,1,1,1);
                SurfaceData surface=(SurfaceData)0;
                surface.albedo=color;
                surface.alpha=1;
                surface.metallic=0;
                surface.smoothness=_Smoothness*lerp(.55,1,face);
                surface.normalTS=half3(0,0,1);
                surface.occlusion=lerp(.86,1,bevel);
                half4 result=UniversalFragmentPBR(data,surface);
                result.rgb=MixFog(result.rgb,input.fogAndVertexLight.x);
                return result;
            }
            ENDHLSL
        }
        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode"="ShadowCaster" }
            ZWrite On
            ZTest LEqual
            ColorMask 0
            HLSLPROGRAM
            #pragma target 3.0
            #pragma vertex ShadowPassVertex
            #pragma fragment ShadowPassFragment
            #pragma multi_compile_instancing
            #pragma multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW
            #include "Packages/com.unity.render-pipelines.universal/Shaders/ShadowCasterPass.hlsl"
            ENDHLSL
        }
        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode"="DepthOnly" }
            ZWrite On
            ColorMask R
            HLSLPROGRAM
            #pragma target 3.0
            #pragma vertex DepthOnlyVertex
            #pragma fragment DepthOnlyFragment
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/Shaders/DepthOnlyPass.hlsl"
            ENDHLSL
        }
        Pass
        {
            Name "DepthNormals"
            Tags { "LightMode"="DepthNormalsOnly" }
            ZWrite On
            HLSLPROGRAM
            #pragma target 3.0
            #pragma vertex DepthNormalsVertex
            #pragma fragment DepthNormalsFragment
            #pragma multi_compile_instancing
            #pragma multi_compile_fragment _ _GBUFFER_NORMALS_OCT
            #include "Packages/com.unity.render-pipelines.universal/Shaders/DepthNormalsPass.hlsl"
            ENDHLSL
        }
    }
    Fallback "Universal Render Pipeline/Lit"
}
