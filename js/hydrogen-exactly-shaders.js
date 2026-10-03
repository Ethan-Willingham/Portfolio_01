export const EVALUATOR = /* wgsl */ `
struct Uniforms {
  domain: vec4<f32>,
  view: vec4<f32>,
  camera: vec4<f32>,
  tint: vec4<f32>,
  coefficients: array<vec4<f32>, 13>,
  basis: array<vec4<f32>, 13>,
  colors: array<vec4<f32>, 6>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
struct Sample { psi: vec2<f32>, density: f32, signedTerm: f32, color: vec3<f32> };
fn multiply(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x*b.x-a.y*b.y, a.x*b.y+a.y*b.x);
}
// Arbitrary linear-RGB density palette, independent of spectral wavelengths.
fn densityColor(rho: f32) -> vec3<f32> {
  let t=clamp(log2(max(rho,0.3)/0.3)/6.0,0.0,1.0)*4.0;
  let palette=array<vec3<f32>,5>(vec3<f32>(0.015,0.65,0.52),vec3<f32>(0.025,0.45,1.0),vec3<f32>(0.48,0.035,1.0),vec3<f32>(1.0,0.025,0.22),vec3<f32>(1.0,0.58,0.025));
  let i=min(u32(t),3u);
  return mix(palette[i],palette[i+1u],fract(min(t,3.99999)));
}
fn evaluate(p: vec3<f32>) -> Sample {
  let r = length(p);
  let s = length(p.xy);
  var phi = 0.0;
  if (s > 1e-8) { phi = atan2(p.y, p.x); }
  var terms: array<vec2<f32>, 13>;
  var psi = vec2<f32>(0.0);
  let count = select(13u, 4u, u.domain.z > 0.5);
  let ephi = vec2<f32>(cos(phi), sin(phi));
  var azimuth = vec2<f32>(cos(23.0*phi), sin(23.0*phi));
  for (var i = 0u; i < count; i++) {
    let b = u.basis[i];
    var value = vec2<f32>(0.0);
    if (u.domain.z < 0.5) {
      var amplitude = exp(b.w - r / b.x + b.y * log(max(2.0*s/b.x, 1e-20)));
      if (s < 1e-8) { amplitude = 0.0; }
      let sign = select(1.0, -1.0, (u32(b.y) % 2u) == 1u);
      value = sign * amplitude * azimuth;
      azimuth = multiply(azimuth, ephi);
    } else {
      let x = 2.0*r/b.x;
      let k = u32(b.x-b.y-1.0);
      let alpha = 2.0*b.y+1.0;
      var polynomial = 1.0;
      if (k > 0u) {
        var prev = 1.0;
        polynomial = 1.0+alpha-x;
        for (var j = 2u; j <= k; j++) {
          let jf = f32(j);
          let next = ((2.0*jf-1.0+alpha-x)*polynomial-(jf-1.0+alpha)*prev)/jf;
          prev = polynomial; polynomial = next;
        }
      }
      let amplitude = exp(b.w-r/b.x) * polynomial;
      // The shipped low-n basis is 2p_z, 3s, 4s, 5s. R includes x^l.
      value = vec2<f32>(amplitude * select(1.0, 2.0*p.z/b.x, b.y > 0.5), 0.0);
    }
    terms[i] = multiply(value, u.coefficients[i].xy);
    psi += terms[i];
  }
  var result: Sample;
  result.psi = psi;
  result.density = dot(psi, psi);
  result.signedTerm = 0.0;
  result.color = u.tint.rgb;
  if (u.domain.w > 2.5) { result.color=densityColor(result.density*u.domain.y*u.domain.y*u.domain.y); }
  if (u.domain.z > 0.5) {
    var weighted = vec3<f32>(0.0);
    var weight = 0.0;
    var pair = 0u;
    for (var a=0u; a<4u; a++) {
      for (var b=a+1u; b<4u; b++) {
        let crossTerm = 2.0*dot(terms[a],terms[b]);
        if (pair==0u) { result.signedTerm = crossTerm; }
        let color = u.colors[pair].rgb;
        if (length(color)>0.0) { weighted += abs(crossTerm)*color; weight += abs(crossTerm); }
        pair++;
      }
    }
    if (u.domain.w > 0.5 && u.domain.w < 1.5) {
      result.color = 0.28*u.tint.rgb + 0.95*weighted/max(weight,1e-20);
    }
    if (u.domain.w > 1.5 && u.domain.w < 2.5) {
      let strength = clamp(abs(result.signedTerm)/max(result.density,1e-20),0.0,1.0);
      let signColor = select(u.tint.bgr * 0.6, u.colors[0].rgb, result.signedTerm >= 0.0);
      result.color = mix(u.tint.rgb,signColor,strength);
    }
  }
  return result;
}
`;
export const COMPUTE = EVALUATOR + /* wgsl */ `
@group(0) @binding(1) var field: texture_storage_3d<rgba16float, write>;
@compute @workgroup_size(4,4,4)
fn volume(@builtin(global_invocation_id) id: vec3<u32>) {
  let n = u32(u.domain.x);
  if (any(id>=vec3<u32>(n))) { return; }
  let p = ((vec3<f32>(id)+0.5)/f32(n)*2.0-1.0)*u.domain.y;
  let v = evaluate(p);
  let rho = v.density * u.domain.y*u.domain.y*u.domain.y;
  textureStore(field,id,vec4<f32>(rho*v.color,rho));
}
`;
export const PROBES = EVALUATOR + /* wgsl */ `
@group(0) @binding(1) var<storage,read> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage,read_write> results: array<vec4<f32>>;
@compute @workgroup_size(32)
fn probe(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= arrayLength(&positions)) { return; }
  let v = evaluate(positions[id.x].xyz);
  results[id.x] = vec4<f32>(v.psi,v.density,v.signedTerm);
}
`;
export const RENDER = EVALUATOR + /* wgsl */ `
@group(0) @binding(1) var field: texture_3d<f32>;
@group(0) @binding(2) var smoothSampler: sampler;
struct Vertex { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };
fn fieldAt(p:vec3<f32>) -> vec4<f32> {
  if (any(abs(p)>=vec3<f32>(1.0))) { return vec4<f32>(0.0); }
  return textureSampleLevel(field,smoothSampler,p*0.5+0.5,0.0);
}
fn densityNormal(p:vec3<f32>) -> vec3<f32> {
  let h=1.0/u.domain.x;
  let dx=vec3<f32>(h,0.0,0.0); let dy=vec3<f32>(0.0,h,0.0); let dz=vec3<f32>(0.0,0.0,h);
  let g=vec3<f32>(fieldAt(p+dx).a-fieldAt(p-dx).a,fieldAt(p+dy).a-fieldAt(p-dy).a,fieldAt(p+dz).a-fieldAt(p-dz).a);
  return -g/max(length(g),1e-8);
}
// Presentation lights stay in world space as the user rotates the camera.
fn keyLight() -> vec3<f32> { return normalize(vec3<f32>(-0.55,-0.65,1.3)); }
fn surfaceShadow(hit:vec3<f32>, level:f32) -> f32 {
  var blocked=0.0;
  for (var i=0u; i<8u; i++) {
    let distance=2.5/u.domain.x+0.028*f32(i)+0.003*f32(i*i);
    let rho=fieldAt(hit+keyLight()*distance).a;
    blocked+=smoothstep(level*1.03,level*1.45,rho);
  }
  return exp(-0.24*blocked);
}
fn referencePlane(origin:vec3<f32>, forward:vec3<f32>, pixel:f32) -> vec3<f32> {
  // A synthetic receiver behind the default view, not part of the atom.
  // Fade away edge-on and from its back so it never obscures the volume.
  let facing=smoothstep(0.05,0.3,-forward.z);
  if (facing<=0.0) { return vec3<f32>(0.0); }
  let p=origin+forward*((-0.27-origin.z)/forward.z);
  let radius=length(p.xy);
  let edge=1.0-smoothstep(0.72,0.82,radius);
  if (edge<=0.0) { return vec3<f32>(0.0); }
  var density=0.0;
  for (var i=0u; i<16u; i++) {
    density+=pow(max(fieldAt(p+keyLight()*(0.035+0.05*f32(i))).a,0.0),0.65)*0.05;
  }
  let shadow=exp(-2.8*density);
  let ring=1.0-smoothstep(pixel,3.0*pixel,abs(radius-0.72));
  let gridDistance=min(abs(fract(p.x/0.24+0.5)-0.5),abs(fract(p.y/0.24+0.5)-0.5))*0.24;
  let grid=(1.0-smoothstep(pixel,2.0*pixel,gridDistance))*0.18;
  return u.tint.rgb*(0.038+0.025*(ring+grid))*edge*facing*shadow;
}
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
  let p = array<vec2<f32>,3>(vec2<f32>(-1.0,-1.0),vec2<f32>(3.0,-1.0),vec2<f32>(-1.0,3.0));
  var v: Vertex; v.position=vec4<f32>(p[i],0.0,1.0); v.uv=p[i]; return v;
}
@fragment fn fragment(v: Vertex) -> @location(0) vec4<f32> {
  let aspect=u.view.x/u.view.y;
  // Frame the occupied orbit rather than the entire finite integration box.
  let portrait=aspect<1.0 && u.view.w<0.5;
  let tilt=u.view.z-select(0.0,0.32,portrait);
  let span=select(max(select(0.78,0.51,portrait),0.86*abs(sin(tilt))),0.78,u.view.w>0.5);
  var xy=v.uv*span*vec2<f32>(max(aspect,1.0),max(1.0/aspect,1.0));
  if (aspect<1.0 && u.view.w<0.5) { xy=vec2<f32>(xy.y,-xy.x); }
  let yaw=u.camera.x;
  let right=vec3<f32>(cos(yaw),sin(yaw),0.0);
  let up=vec3<f32>(-sin(yaw)*sin(tilt),cos(yaw)*sin(tilt),cos(tilt));
  let forward=-cross(right,up);
  var radiance=vec3<f32>(0.0);
  if (u.view.w>0.5) {
    // Direct analytic equatorial cut: no interpolation across dark nodes.
    let p=select(vec3<f32>(xy*u.domain.y,0.0),vec3<f32>(xy.x*u.domain.y,0.0,xy.y*u.domain.y),u.domain.z>0.5);
    let sample=evaluate(p);
    let rho=sample.density*u.domain.y*u.domain.y*u.domain.y;
    radiance=sample.color*smoothstep(0.18,0.35,rho)*(1.0-exp(-rho*0.10))*3.2;
  } else if (u.view.w < -0.5) {
    let origin=right*xy.x+up*xy.y;
    let steps=u32(u.camera.y);
    let ds=3.4641016/f32(steps);
    var transmission=1.0;
    for (var i=0u; i<steps; i++) {
      let p=origin+forward*(-1.7320508+(f32(i)+0.5)*ds);
      if (all(abs(p)<vec3<f32>(1.0))) {
        let sample=textureSampleLevel(field,smoothSampler,p*0.5+0.5,0.0);
        // Display transfer only. Diagnostics retain rho, without this power.
        let displayDensity=select(pow(max(sample.a,0.0),1.4),sample.a,u.domain.z>0.5);
        let opacity=1.0-exp(-displayDensity*ds*u.camera.w);
        let color=sample.rgb/max(sample.a,1e-8);
        radiance+=transmission*opacity*color*2.6;
        transmission*=1.0-opacity;
      }
    }
  } else {
    // Six level sets of the sampled positive density, with refined crossings.
    // Surface lighting is a display aid; no density, phase or mass is altered.
    let origin=right*xy.x+up*xy.y;
    let plane=referencePlane(origin,forward,span/u.view.y);
    let safeForward=select(vec3<f32>(1e-8),forward,abs(forward)>vec3<f32>(1e-8));
    let boxA=(-vec3<f32>(1.0)-origin)/safeForward;
    let boxB=(vec3<f32>(1.0)-origin)/safeForward;
    let near=max(max(min(boxA.x,boxB.x),min(boxA.y,boxB.y)),min(boxA.z,boxB.z));
    let far=min(min(max(boxA.x,boxB.x),max(boxA.y,boxB.y)),max(boxA.z,boxB.z));
    if (far<=near) { return vec4<f32>(plane*u.camera.z,1.0); }
    let steps=u32(ceil((far-near)*u.camera.y/3.4641016));
    let ds=(far-near)/f32(steps);
    var previousP=origin+forward*near;
    var previous=fieldAt(previousP).a;
    var highestLevel=0u;
    var surface=vec3<f32>(0.0);
    let levels=array<f32,6>(0.3,0.9,2.7,8.1,24.3,72.9);
    for (var i=1u; i<=steps; i++) {
      let p=origin+forward*(near+f32(i)*ds);
      let current=fieldAt(p).a;
      if (highestLevel<6u && current>=levels[min(highestLevel,5u)]) {
        var nextLevel=highestLevel+1u;
        for (var j=nextLevel; j<6u; j++) {
          if (current<levels[j]) { break; }
          nextLevel=j+1u;
        }
        let levelIndex=nextLevel-1u;
        let level=levels[levelIndex];
        var lo=previousP; var hi=p;
        for (var k=0u; k<5u; k++) {
          let middle=(lo+hi)*0.5;
          if ((fieldAt(middle).a<level)==(previous<level)) { lo=middle; } else { hi=middle; }
        }
        // Reveal the highest density contour reached by this view ray.
        // Avoid mixing complementary bands into a washed-out neutral cloud.
        highestLevel=nextLevel;
        surface=(lo+hi)*0.5;
      }
      previous=current; previousP=p;
    }
    radiance=plane;
    if (highestLevel>0u) {
      let sample=fieldAt(surface);
      let color=sample.rgb/max(sample.a,1e-8);
      let outward=densityNormal(surface);
      let normal=select(outward,-outward,dot(outward,forward)>0.0);
      let viewDirection=-forward;
      let light=keyLight();
      let diffuse=max(dot(normal,light),0.0);
      let shadow=surfaceShadow(surface,levels[highestLevel-1u]);
      let rim=pow(1.0-clamp(dot(normal,viewDirection),0.0,1.0),3.0);
      let halfVector=light+viewDirection;
      let highlight=pow(max(dot(normal,halfVector/max(length(halfVector),1e-8)),0.0),48.0)*shadow;
      let fill=0.32+0.28*max(dot(normal,normalize(viewDirection+right)),0.0);
      radiance=color*(fill+3.3*diffuse*shadow+0.42*rim)+mix(color,u.tint.rgb,0.35)*highlight*1.35;
    }
  }
  return vec4<f32>(radiance*u.camera.z,1.0);
}
`;
export const DISPLAY = /* wgsl */ `
@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var smoothSampler: sampler;
@group(0) @binding(2) var<uniform> background: vec4<f32>;
struct Vertex { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
  let p=array<vec2<f32>,3>(vec2<f32>(-1.0,-1.0),vec2<f32>(3.0,-1.0),vec2<f32>(-1.0,3.0));
  var v:Vertex; v.position=vec4<f32>(p[i],0.0,1.0); v.uv=p[i]*vec2<f32>(0.5,-0.5)+0.5; return v;
}
fn srgb(x:vec3<f32>) -> vec3<f32> {
  return select(12.92*x,1.055*pow(x,vec3<f32>(1.0/2.4))-0.055,x>vec3<f32>(0.0031308));
}
@fragment fn fragment(v:Vertex) -> @location(0) vec4<f32> {
  let linear=textureSampleLevel(scene,smoothSampler,v.uv,0.0).rgb+background.rgb;
  return vec4<f32>(srgb(linear/(1.0+linear)),1.0);
}
`;
