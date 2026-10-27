Shader "OneShift/Warehouse Sky"
{
    Properties
    {
        _SunDirection("Direction to sun", Vector) = (1,-.2,0,0)
        _SunColor("Sun color", Color) = (1,.8,.5,1)
        _Daylight("Daylight", Range(0,1)) = 0
        _CloudOffset("Clock-driven cloud drift", Vector) = (0,0,0,0)
    }
    SubShader
    {
        Tags { "Queue"="Background" "RenderType"="Background" "PreviewType"="Skybox" }
        Cull Off ZWrite Off
        Pass
        {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            float3 _SunDirection;
            float4 _SunColor;
            float _Daylight;
            float2 _CloudOffset;
            struct Attributes { float4 vertex:POSITION; };
            struct Varyings { float4 position:SV_POSITION; float3 direction:TEXCOORD0; };
            Varyings vert(Attributes v)
            {
                Varyings o;
                o.position = UnityObjectToClipPos(v.vertex);
                o.direction = v.vertex.xyz;
                return o;
            }

            // A single analytic sky pass: no cloud meshes, textures, ray march,
            // extra lights or shadow maps. This hash avoids trigonometry per cell.
            float hash21(float2 p)
            {
                float3 q = frac(float3(p.xyx) * .1031);
                q += dot(q, q.yzx + 33.33);
                return frac((q.x + q.y) * q.z);
            }

            float cloudNoise(float2 p)
            {
                float2 cell = floor(p);
                float2 f = frac(p);
                f = f * f * (3 - 2 * f);
                return lerp(lerp(hash21(cell), hash21(cell + float2(1,0)), f.x),
                    lerp(hash21(cell + float2(0,1)), hash21(cell + 1), f.x), f.y);
            }

            half4 frag(Varyings i):SV_Target
            {
                float3 ray = normalize(i.direction);
                float3 sun = normalize(_SunDirection);
                float up = saturate(ray.y);
                float3 zenith = lerp(float3(.002,.005,.014),float3(.115,.29,.49),_Daylight);
                float3 horizon = lerp(float3(.014,.021,.034),float3(.63,.70,.73),_Daylight);
                float3 color = lerp(horizon,zenith,pow(up,.45));
                float alignment = saturate(dot(ray,sun));
                float twilight = (1-smoothstep(.07,.32,abs(sun.y))) * smoothstep(-.20,-.025,sun.y);
                color += float3(.55,.17,.045) * twilight * pow(alignment,6) * pow(1-up,3);

                // Broad broken clouds thin out at the horizon. Three noise samples
                // keep this much cheaper than a volumetric cloud system.
                float2 cloudUV = ray.xz / (max(ray.y,0) + .22) * 2.25 + _CloudOffset;
                float broad = cloudNoise(cloudUV);
                float detail = cloudNoise(cloudUV * 2.07 + 17.3);
                float fine = cloudNoise(cloudUV * 4.13 + 41.7);
                float density = broad * .64 + detail * .25 + fine * .11;
                float cloud = smoothstep(.55,.76,density) * smoothstep(.025,.16,ray.y);
                float3 cloudColor = lerp(float3(.021,.029,.047),
                    lerp(float3(.43,.49,.54),float3(.88,.86,.79),saturate((density-.5)*3.3)),_Daylight);
                cloudColor += float3(.32,.10,.025) * twilight * pow(alignment,3);
                color = lerp(color,cloudColor,cloud * .86);

                // The visible disc uses the exact direction of the shadow-casting
                // directional light. Derivatives keep the small edge stable in WebGL.
                float sunRadius = cos(.28 * UNITY_PI / 180);
                float discWidth = max(fwidth(alignment),.000001);
                float disc = smoothstep(sunRadius-discWidth,sunRadius+discWidth,alignment);
                float halo = pow(alignment,350) * .10 + pow(alignment,32) * .012;
                color += _SunColor.rgb * (disc*3.75+halo) * smoothstep(-.012,.01,sun.y) * (1-cloud*.82);

                // Stereographic coordinates avoid longitude seams and pole pinching.
                // Stars stay fixed; only the cloud offset follows the game clock.
                float2 starUV = ray.xz / (1 + max(ray.y,0)) * 260;
                float2 starCell = floor(starUV);
                float seed = hash21(starCell);
                float2 starCentre = float2(hash21(starCell + 8.1),hash21(starCell + 19.7)) * .6 + .2;
                float starDistance = length(frac(starUV)-starCentre);
                float starWidth = max(length(fwidth(starUV))*.45,.02);
                float star = (1-smoothstep(.045,.045+starWidth,starDistance)) * step(.994,seed);
                color += float3(.61,.69,.82) * star * .38 * (1-_Daylight) * (1-cloud) * smoothstep(.06,.24,up);
                float3 groundHaze = lerp(float3(.006,.008,.012),float3(.17,.20,.20),_Daylight);
                color = lerp(groundHaze,color,smoothstep(-.09,.025,ray.y));
                return half4(color,1);
            }
            ENDHLSL
        }
    }
}
