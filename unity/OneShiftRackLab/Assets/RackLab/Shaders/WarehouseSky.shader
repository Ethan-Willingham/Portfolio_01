Shader "OneShift/Warehouse Sky"
{
    Properties
    {
        _SunDirection("Direction to sun", Vector) = (1,-.2,0,0)
        _SunColor("Sun color", Color) = (1,.8,.5,1)
        _Daylight("Daylight", Range(0,1)) = 0
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
            struct Attributes { float4 vertex:POSITION; };
            struct Varyings { float4 position:SV_POSITION; float3 direction:TEXCOORD0; };
            Varyings vert(Attributes v)
            {
                Varyings o;
                o.position = UnityObjectToClipPos(v.vertex);
                o.direction = v.vertex.xyz;
                return o;
            }
            half4 frag(Varyings i):SV_Target
            {
                float3 ray = normalize(i.direction);
                float up = saturate(ray.y);
                float3 zenith = lerp(float3(.002,.004,.013),float3(.11,.30,.58),_Daylight);
                float3 horizon = lerp(float3(.009,.016,.032),float3(.64,.76,.82),_Daylight);
                float3 color = lerp(horizon,zenith,pow(up,.45));
                float alignment = saturate(dot(ray,normalize(_SunDirection)));
                float twilight = (1-smoothstep(.08,.40,abs(_SunDirection.y))) * smoothstep(-.18,0,_SunDirection.y);
                color += float3(.63,.16,.025) * twilight * pow(alignment,8) * pow(1-up,3);
                float disc = smoothstep(cos(.30*UNITY_PI/180),cos(.24*UNITY_PI/180),alignment);
                float halo = pow(alignment,400) * .14;
                color += _SunColor.rgb * (disc*5+halo) * smoothstep(-.012,.01,_SunDirection.y);
                float2 cell = floor(float2(atan2(ray.z,ray.x),asin(ray.y))*950);
                float star = frac(sin(dot(cell,float2(127.1,311.7)))*43758.5453);
                color += smoothstep(.9985,1,star) * .32 * (1-_Daylight) * smoothstep(0,.2,up);
                color = lerp(float3(.006,.008,.009),color,smoothstep(-.035,.015,ray.y));
                return half4(color,1);
            }
            ENDHLSL
        }
    }
}
