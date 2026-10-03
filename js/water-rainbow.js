/* Demo-only finish. A small GPU flow field transports color coordinates
 * with the real water particles, then colors the solver's exact image mask. */
(function () {
  'use strict';
  var COMMON = `
struct Settings { world: vec4f, state: vec4f }
@group(0) @binding(0) var<uniform> settings: Settings;
struct Screen { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn screen(@builtin(vertex_index) id: u32) -> Screen {
  let corners = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
  let p = corners[id];
  var out: Screen;
  out.position = vec4f(p,0,1);
  out.uv = vec2f(p.x*.5+.5,.5-p.y*.5);
  return out;
}`;
  var FLOW = COMMON + `
@group(1) @binding(0) var<storage,read> particles: array<vec4f>;
@group(1) @binding(1) var<storage,read> auxiliary: array<vec4f>;
@group(1) @binding(2) var<storage,read> flags: array<u32>;
struct FlowPoint {
  @builtin(position) position: vec4f, @location(0) local: vec2f,
  @location(1) velocity: vec2f, @location(2) foam: f32
}
@vertex fn point(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> FlowPoint {
  let corners = array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),
                              vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
  let index = iid*4u;
  var out: FlowPoint;
  out.position = vec4f(0,0,0,1);
  out.local = corners[vid]; out.velocity = vec2f(0); out.foam = 0;
  if (index >= u32(settings.state.y)) { return out; }
  if ((flags[index] & 32u) != 0u) { return out; }
  let particle = particles[index];
  let p = (particle.xy + out.local*6.0)/settings.world.xy;
  out.position = vec4f(p.x*2.0-1.0,1.0-p.y*2.0,0,1);
  out.velocity = clamp(particle.zw/1000.0,vec2f(-2),vec2f(2));
  out.foam = auxiliary[index].y;
  return out;
}
@fragment fn flow(in: FlowPoint) -> @location(0) vec4f {
  let weight = max(0.0,1.0-dot(in.local,in.local));
  return vec4f(in.velocity*weight,weight,in.foam*weight);
}`;
  var TRANSPORT = COMMON + `
@group(1) @binding(0) var previous: texture_2d<f32>;
@group(1) @binding(1) var motion: texture_2d<f32>;
@group(1) @binding(2) var smoothSampler: sampler;
@fragment fn transport(in: Screen) -> @location(0) vec4f {
  let flow = textureSample(motion,smoothSampler,in.uv);
  let velocity = flow.xy*1000.0/max(flow.z,.001);
  let origin = in.uv*settings.world.xy/300.0;
  let departure = in.uv-velocity*settings.world.w/settings.world.xy;
  let carried = textureSample(previous,smoothSampler,departure).xy;
  // New water starts fresh. Slow renewal prevents old vortices collapsing
  // their transported pattern into a single hue.
  let reset = settings.state.x > .5 || flow.z < .05;
  let material = select(mix(carried,origin,min(.006,settings.world.w*.36)),origin,reset);
  return vec4f(material,length(velocity)/600.0,flow.w/max(flow.z,.001));
}`;
  var FINISH = COMMON + `
@group(1) @binding(0) var water: texture_2d<f32>;
@group(1) @binding(1) var material: texture_2d<f32>;
@group(1) @binding(2) var smoothSampler: sampler;
fn spectrum(hue: f32) -> vec3f {
  let ramps = abs(fract(vec3f(hue)+vec3f(0,.6666667,.3333333))*6.0-3.0);
  return clamp(ramps-1.0,vec3f(0),vec3f(1));
}
@fragment fn finish(in: Screen) -> @location(0) vec4f {
  let source = textureLoad(water,vec2i(in.position.xy),0);
  if (source.a < .002) { return vec4f(0); }
  let dye = textureSampleLevel(material,smoothSampler,in.uv,0.0);
  let time = settings.world.z;
  let p = dye.xy*2.4;
  // Slow nested warps become oil-slick ribbons as the real water stretches
  // and turns their material coordinates.
  let bend = vec2f(sin(p.y*2.1+sin(p.x*1.7-time*.16)),
                   cos(p.x*1.8+sin(p.y*1.6+time*.13)));
  let q = p+bend*.85;
  let curl = sin(q.x*2.3+cos(q.y*2.0+time*.11));
  let phase = q.x*.52+q.y*.3+curl*.45+sin(q.y*3.1-q.x*.8)*.24+time*.045;
  let rainbow = spectrum(phase);
  let iridescence = spectrum(phase+.18+sin(q.x+q.y)*.13);
  let bands = .5+.5*sin(phase*6.2831853*2.0);
  let sheen = pow(bands,14.0)*.36;
  let seam = pow(1.0-abs(sin(phase*6.2831853*3.0)),12.0);
  let caustic = pow(.5+.5*sin(q.x*7.0+sin(q.y*5.0)),12.0);
  let foam = clamp(dot(source.rgb/max(source.a,.001),vec3f(.333333))-.24,0.0,.76);
  var color = mix(rainbow,iridescence,.22)*(.76+.24*bands);
  color = mix(color,vec3f(.94,.98,1),sheen+foam*.65);
  color += iridescence*seam*.18+vec3f(.12,.15,.18)*caustic;
  color = clamp(color+vec3f(.025),vec3f(0),vec3f(1));
  return vec4f(color*source.a,source.a);
}`;

  function create(engine, size) {
    var device = engine.device, layer = document.createElement('canvas');
    layer.id = 'toy-rainbow-water';
    layer.width = engine.renderCanvas.width; layer.height = engine.renderCanvas.height;
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;';
    layer.setAttribute('aria-hidden','true'); layer.hidden = true;
    engine.renderCanvas.parentElement.appendChild(layer);
    var context = layer.getContext('webgpu');
    var uniform, flowTexture, dyeTextures, flowPipeline, transportPipeline, finishPipeline;
    var flowGroup, transportGroups, uniformGroups, sampler;
    var enabled = false, initialized = false, index = 0, lastClock = 0, frames = 0;
    var settings = new Float32Array(8);
    var result = {
      ready:false,
      setEnabled:function (on) {
        if (enabled !== !!on) initialized = false;
        enabled = !!on;
        if (!enabled || !result.ready) {
          layer.hidden = true; engine.renderCanvas.hidden = !engine.renderActive;
        }
      },
      reset:function () { initialized = false; },
      stats:function () { return { ready:result.ready,active:enabled && result.ready,frames:frames }; },
      draw:function (clock) {
        if (!engine.renderActive) { result.setEnabled(false); return; }
        if (!enabled || !result.ready) return;
        var simulationClock = engine.simulationClock;
        var dt = initialized ? Math.max(0,Math.min(.05,simulationClock-lastClock)) : 0;
        lastClock = simulationClock;
        settings.set([size.width,size.height,clock,dt,initialized ? 0 : 1,engine.uploadedCount,0,0]);
        device.queue.writeBuffer(uniform,0,settings);
        var encoder = device.createCommandEncoder({ label:'demo.rainbow' });
        function pass(target, pipeline, group, count) {
          var render = encoder.beginRenderPass({ colorAttachments:[{ view:target,
            clearValue:{ r:0,g:0,b:0,a:0 },loadOp:'clear',storeOp:'store' }] });
          render.setPipeline(pipeline);
          render.setBindGroup(0,uniformGroups.get(pipeline)); render.setBindGroup(1,group);
          render.draw(count === undefined ? 3 : 6,count === undefined ? 1 : count); render.end();
        }
        pass(flowTexture.createView(),flowPipeline,flowGroup,Math.ceil(engine.uploadedCount/4));
        pass(dyeTextures[1-index].createView(),transportPipeline,transportGroups[index]);
        var finishGroup = device.createBindGroup({ layout:finishPipeline.getBindGroupLayout(1),entries:[
          { binding:0,resource:engine.renderCtx.getCurrentTexture().createView() },
          { binding:1,resource:dyeTextures[1-index].createView() },{ binding:2,resource:sampler }
        ] });
        pass(context.getCurrentTexture().createView(),finishPipeline,finishGroup);
        device.queue.submit([encoder.finish()]); index = 1-index; initialized = true; frames++;
        layer.hidden = false; engine.renderCanvas.hidden = true;
      }
    };
    result.readyPromise = (async function () {
      if (!context) throw new Error('Rainbow canvas unavailable');
      var format = engine.renderFormat;
      uniform = device.createBuffer({ size:32,usage:GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      sampler = device.createSampler({ magFilter:'linear',minFilter:'linear' });
      function field(label) {
        return device.createTexture({ label:label,size:[Math.ceil(size.width/3),Math.ceil(size.height/3)],
          format:'rgba16float',usage:GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      }
      flowTexture = field('demo.rainbowFlow'); dyeTextures = [field('demo.rainbowA'),field('demo.rainbowB')];
      async function pipeline(code, vertex, fragment, target) {
        var module = device.createShaderModule({ code:code });
        return device.createRenderPipelineAsync({ layout:'auto',vertex:{ module:module,entryPoint:vertex },
          fragment:{ module:module,entryPoint:fragment,targets:[target] },primitive:{ topology:'triangle-list' } });
      }
      var pipelines = await Promise.all([
        pipeline(FLOW,'point','flow',{ format:'rgba16float',blend:{
          color:{ srcFactor:'one',dstFactor:'one',operation:'add' },alpha:{ srcFactor:'one',dstFactor:'one',operation:'add' } } }),
        pipeline(TRANSPORT,'screen','transport',{ format:'rgba16float' }),
        pipeline(FINISH,'screen','finish',{ format:format })
      ]);
      flowPipeline = pipelines[0]; transportPipeline = pipelines[1]; finishPipeline = pipelines[2];
      uniformGroups = new Map(pipelines.map(function (p) { return [p,device.createBindGroup({
        layout:p.getBindGroupLayout(0),entries:[{ binding:0,resource:{ buffer:uniform } }]
      })]; }));
      flowGroup = device.createBindGroup({ layout:flowPipeline.getBindGroupLayout(1),entries:[
        { binding:0,resource:{ buffer:engine.buf.pos } },{ binding:1,resource:{ buffer:engine.buf.aux } },
        { binding:2,resource:{ buffer:engine.buf.flag } }
      ] });
      transportGroups = dyeTextures.map(function (texture) {
        return device.createBindGroup({ layout:transportPipeline.getBindGroupLayout(1),entries:[
          { binding:0,resource:texture.createView() },{ binding:1,resource:flowTexture.createView() },
          { binding:2,resource:sampler }
        ] });
      });
      context.configure({ device:device,format:format,alphaMode:'premultiplied' });
      // Sample on the same GPU without a canvas upload or CPU readback.
      // The source alpha retains every wall, gap, droplet and water edge.
      engine.renderCtx.configure({ device:device,format:format,alphaMode:'premultiplied',
        usage:GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      result.ready = true;
    })().catch(function (error) {
      result.setEnabled(false); console.warn('Rainbow water unavailable:',error.message);
    });
    device.lost.then(function () { result.ready = false; result.setEnabled(false); });
    return result;
  }
  window.RainbowWater = { create:create };
})();
