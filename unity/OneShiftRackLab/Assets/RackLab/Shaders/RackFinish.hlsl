#ifndef ONE_SHIFT_RACK_FINISH
#define ONE_SHIFT_RACK_FINISH

sampler2D _WearNoise;
sampler2D _RackLabel;
CBUFFER_START(UnityPerMaterial)
float _Wear;
float _SurfaceKind;
CBUFFER_END

float RackCoverage(float2 uv, float2 surface)
{
    if (surface.x > -.5) return 1;
    if (surface.x > -1.5)
    {
        if (surface.y > .5) return 1;
        float2 cell = float2(frac(uv.x * 2) - .5, frac(uv.y) - .40);
        float circle = length(cell / float2(.178,.158));
        float stem = max(abs(cell.x)/.078, abs(cell.y+.15)/.16);
        return min(circle,stem) >= 1 ? 1 : 0;
    }
    float2 cell = abs(frac(uv) - .5);
    float2 thickness = max(float2(.045,.024),fwidth(uv)*.32);
    float vertical = step(.5-thickness.x,cell.x);
    float horizontal = surface.y > .5 ? 0 : step(.5-thickness.y,cell.y);
    return max(vertical,horizontal);
}

void RackFinish(float3 position, float3 normal, float2 uv, float2 surface, float4 finish,
                out float3 albedo, out float metallic, out float smoothness)
{
    float3 axis = abs(normal);
    float2 noiseUV = axis.y > max(axis.x,axis.z) ? position.xz : (axis.x > axis.z ? position.zy : position.xy);
    float4 noise = tex2D(_WearNoise,noiseUV*.85);
    float grain = tex2D(_WearNoise,noiseUV*9.1).g;
    if (_SurfaceKind > .5)
    {
        float label = 1-step(.05,finish.a);
        float wood = step(.05,finish.a)*(1-step(.35,finish.a));
        float tape = step(.65,finish.a);
        float woodGrain = tex2D(_WearNoise,noiseUV*float2(.65,32)).g;
        float2 edgeDistance = min(uv,1-uv)*surface;
        float edgeShade = 1-smoothstep(.0005,.003,min(edgeDistance.x,edgeDistance.y));
        albedo = finish.rgb * (1 + (grain-.5)*.08);
        albedo *= lerp(1, .76+woodGrain*.42, wood);
        albedo *= 1-edgeShade*.10;
        albedo = lerp(albedo,finish.rgb*tex2D(_RackLabel,uv).rgb,label);
        metallic = 0;
        smoothness = lerp(.13,.36,tape);
        return;
    }
    float edge = 0;
    if (surface.x > 0)
    {
        float2 nearest = min(uv,1-uv)*surface;
        edge = 1-smoothstep(.002,.023,min(nearest.x,nearest.y));
    }
    else if (surface.x > -1.5)
        edge = 1-smoothstep(.02,.12,min(frac(uv.x),1-frac(uv.x)));

    float low = 1-smoothstep(.04,.8,position.y);
    float beamContact = exp(-abs(position.y-1.73)*16);
    float contact = max(low,beamContact*.8);
    float paint = step(.6,finish.a);
    float label = 1-step(.05,finish.a);
    float w = _Wear;
    float chips = smoothstep(.76,.83,noise.r + w*.13 + edge*w*.22 + contact*w*.14) * smoothstep(.03,.3,w);
    float scratches = noise.b * w * saturate(contact*.9 + edge*.6);
    chips = max(chips,scratches)*paint;
    float rust = chips * smoothstep(.41,.70,noise.g + w*.18) * smoothstep(.2,.85,w);
    float dust = w*(low*.19 + noise.r*.12);
    float3 faded = lerp(finish.rgb,finish.rgb*.83 + float3(.055,.05,.037),w*.6*paint);
    albedo = faded * (1 + (grain-.5)*.07) * (1-dust);
    albedo = lerp(albedo,float3(.18,.21,.215)*(noise.g*.35+.78),chips);
    albedo = lerp(albedo,lerp(float3(.055,.026,.012),float3(.28,.095,.025),noise.g),rust);
    albedo = lerp(albedo,finish.rgb*tex2D(_RackLabel,uv).rgb*(1-w*.21),label);
    metallic = lerp(.82,.36,paint);
    metallic = lerp(metallic,.9,chips);
    metallic *= 1-rust;
    metallic *= 1-label;
    smoothness = lerp(.54,.29,w) + (grain-.5)*.09;
    smoothness = lerp(smoothness,.17,rust);
    smoothness = lerp(smoothness,.15,label);
}
#endif
