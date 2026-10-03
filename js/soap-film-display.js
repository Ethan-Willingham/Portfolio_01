export const displayExposure=8,defaultRichness=1.6;
export function displayColor(rgb,richness=defaultRichness){const Y=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722,c=rgb.map(v=>Math.max(0,Y+(v-Y)*richness)),peak=Math.max(...c),scale=peak>0?(1-Math.exp(-peak))/peak:0;return c.map(v=>{const x=v*scale;return x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;});}
export const displayShader=`
@group(0) @binding(0) var image:texture_2d<f32>;
@group(0) @binding(1) var<uniform> settings:vec4f;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {var a=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(a[i],0,1);}
fn encode(c:vec3f)->vec3f{return select(12.92*c,1.055*pow(c,vec3f(1.0/2.4))-.055,c>vec3f(.0031308));}
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f {
 let scene=max(textureLoad(image,vec2i(pos.xy),0).rgb,vec3f(0));let Y=dot(scene,vec3f(.2126,.7152,.0722));
 let rich=max(mix(vec3f(Y),scene,settings.x),vec3f(0));let peak=max(rich.r,max(rich.g,rich.b));
 let mapped=rich*((1-exp(-peak))/max(peak,1e-8));return vec4f(encode(mapped),1);
}`;
