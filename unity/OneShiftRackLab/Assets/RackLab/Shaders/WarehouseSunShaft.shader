Shader "OneShift/Warehouse Sun Shaft"
{
    Properties
    {
        [HDR] _Tint("Sunlit dust tint", Color) = (1, .82, .58, 1)
        _Density("Dust density per metre", Range(0, .15)) = .03
        _EdgeSoftness("Soft window edges", Range(.005, .45)) = .12
        _NoiseScale("Dust cloud scale", Range(.01, 2)) = .26
        _NoiseAmount("Dust cloud variation", Range(0, 1)) = .22
        _WindowGrid("Window panes (columns, rows)", Vector) = (3, 2, 0, 0)
        _MullionWidth("Mullion shadow width", Range(0, .1)) = .012
        _MullionStrength("Mullion shadow strength", Range(0, 1)) = .45
        _DistanceFadeStart("Distance fade start", Float) = 35
        _DistanceFadeEnd("Distance fade end", Float) = 75
        [HideInInspector] _UseVolumeMatrix("Use custom volume matrix", Float) = 0
    }

    SubShader
    {
        Tags
        {
            "RenderPipeline" = "UniversalPipeline"
            "RenderType" = "Transparent"
            "Queue" = "Transparent+10"
            "IgnoreProjector" = "True"
            "DisableBatching" = "True"
        }

        Pass
        {
            Name "SunlitDust"
            Tags { "LightMode" = "SRPDefaultUnlit" }
            // Integrate once at the back of each convex volume, also when inside it.
            Cull Front
            ZWrite Off
            ZTest Always
            Blend One One
            ColorMask RGB

            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex ShaftVertex
            #pragma fragment ShaftFragment
            #pragma multi_compile_instancing
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile_fragment _ _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"
            // Transparent volumes need the sunlight shadow atlas at each sample,
            // not the screen-space shadows resolved on opaque receiver surfaces.
            #define _SURFACE_TYPE_TRANSPARENT 1
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float4 _Tint;
                float4 _WindowGrid;
                float _Density;
                float _EdgeSoftness;
                float _NoiseScale;
                float _NoiseAmount;
                float _MullionWidth;
                float _MullionStrength;
                float _DistanceFadeStart;
                float _DistanceFadeEnd;
                float _UseVolumeMatrix;
                float4x4 _WorldToVolume;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                UNITY_VERTEX_INPUT_INSTANCE_ID
                UNITY_VERTEX_OUTPUT_STEREO
            };

            Varyings ShaftVertex(Attributes input)
            {
                Varyings output = (Varyings)0;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, output);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                return output;
            }

            // The local box is [-.5,.5]. Its z=-.5 face is the window. For a
            // baked sheared mesh, the component supplies the full affine inverse.
            float3 PointInVolume(float3 positionWS)
            {
                if (_UseVolumeMatrix > .5)
                    return mul(_WorldToVolume, float4(positionWS, 1)).xyz;
                return TransformWorldToObject(positionWS);
            }

            float3 DirectionInVolume(float3 directionWS)
            {
                if (_UseVolumeMatrix > .5)
                    return mul((float3x3)_WorldToVolume, directionWS);
                // Do not normalize: ray parameters must remain in world metres.
                return mul((float3x3)GetWorldToObjectMatrix(), directionWS);
            }

            float2 IntersectVolume(float3 origin, float3 direction)
            {
                float3 directionSign = step(0, direction) * 2 - 1;
                float3 inverseDirection = directionSign / max(abs(direction), 1e-7);
                float3 first = (-.5 - origin) * inverseDirection;
                float3 last = (.5 - origin) * inverseDirection;
                float3 entry = min(first, last);
                float3 exit = max(first, last);
                return float2(max(entry.x, max(entry.y, entry.z)),
                              min(exit.x, min(exit.y, exit.z)));
            }

            float DustAt(float3 positionVS, float3 positionWS)
            {
                float3 unit = positionVS + .5;
                float2 rim = min(unit.xy, 1 - unit.xy);
                float2 edge = smoothstep(0, max(_EdgeSoftness, .001), rim);
                float envelope = edge.x * edge.y;
                // A soft beginning hides the pane boundary; the distant end
                // dissipates rather than ending in a visible rectangular sheet.
                envelope *= smoothstep(0, .025, unit.z);
                envelope *= 1 - smoothstep(.52, 1, unit.z);

                float2 grid = max(round(_WindowGrid.xy), 1);
                float2 cell = frac(unit.xy * grid);
                float2 barDistance = min(cell, 1 - cell) / grid;
                float penumbra = lerp(.008, .065, saturate(unit.z));
                float2 bars = smoothstep(_MullionWidth, _MullionWidth + penumbra, barDistance);
                bars = lerp(1, bars, step(1.5, grid));
                envelope *= lerp(1, bars.x * bars.y, _MullionStrength);

                // Slow, broad density fluctuations. Individual specks belong to
                // the sparse dust particles, not a noisy full-screen overlay.
                float3 cloud = positionWS * _NoiseScale + float3(.013, -.009, .006) * _Time.y;
                float noise = sin(dot(cloud, float3(.72, .41, .56)))
                            * sin(dot(cloud, float3(-.34, .88, .31)) + 1.7);
                return envelope * max(0, 1 + noise * _NoiseAmount);
            }

            half4 ShaftFragment(Varyings input) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);

                float2 uv = GetNormalizedScreenSpaceUV(input.positionCS);
                float sceneDepth = SampleSceneDepth(uv);
                #if UNITY_REVERSED_Z
                    const float nearDepth = 1;
                    const float farDepth = 0;
                #else
                    const float nearDepth = UNITY_NEAR_CLIP_VALUE;
                    const float farDepth = 1;
                    sceneDepth = lerp(UNITY_NEAR_CLIP_VALUE, 1, sceneDepth);
                #endif

                float3 nearWS = ComputeWorldSpacePosition(uv, nearDepth, UNITY_MATRIX_I_VP);
                float3 farWS = ComputeWorldSpacePosition(uv, farDepth, UNITY_MATRIX_I_VP);
                float3 sceneWS = ComputeWorldSpacePosition(uv, sceneDepth, UNITY_MATRIX_I_VP);
                float3 directionWS = normalize(farWS - nearWS);
                float3 originWS = unity_OrthoParams.w > .5 ? nearWS : GetCameraPositionWS();
                float3 originVS = PointInVolume(originWS);
                float3 directionVS = DirectionInVolume(directionWS);

                float2 interval = IntersectVolume(originVS, directionVS);
                float entry = max(0, interval.x);
                float sceneDistance = max(0, dot(sceneWS - originWS, directionWS));
                float exit = min(interval.y, sceneDistance);
                float rayLength = max(0, exit - entry);
                clip(rayLength - .0001);

                // World-space integration prevents thin, face-on views from
                // becoming bright solid planes. Opaque depth clips the ray at
                // racking, stock, walls and the floor before any samples run.
                const int steps = 16;
                float stepLength = rayLength / steps;
                float pixelNoise = frac(sin(dot(floor(input.positionCS.xy), float2(12.9898, 78.233))) * 43758.5453);
                float sampleDistance = entry + (.35 + .3 * pixelNoise) * stepLength;
                float integral = 0;
                half4 shadowParams = GetMainLightShadowParams();
                ShadowSamplingData shadowSampling = GetMainLightShadowSamplingData();
                [unroll]
                for (int i = 0; i < steps; ++i)
                {
                    float3 positionWS = originWS + directionWS * sampleDistance;
                    float3 positionVS = originVS + directionVS * sampleDistance;
                    float distanceFade = 1 - smoothstep(_DistanceFadeStart,
                        max(_DistanceFadeStart + .01, _DistanceFadeEnd), sampleDistance);
                    // Racks and stock block the incoming sun as well as the
                    // camera ray. Sample the real shadow atlas inside the air.
                    half sunlight = MainLightRealtimeShadow(TransformWorldToShadowCoord(positionWS),
                        shadowParams, shadowSampling);
                    #if defined(MAIN_LIGHT_CALCULATE_SHADOWS)
                        sunlight = lerp(sunlight, 1, GetMainLightShadowFade(positionWS));
                    #endif
                    integral += DustAt(positionVS, positionWS) * distanceFade * sunlight;
                    sampleDistance += stepLength;
                }

                float scattering = 1 - exp(-max(0, _Density) * integral * stepLength);
                return half4(_Tint.rgb * (_Tint.a * scattering), 0);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
