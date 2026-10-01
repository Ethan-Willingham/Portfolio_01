/* Emergence lab inside Obi Juan. One clock, owned by the main app.
 * CPU local models + batched WebGL sprites, with a Canvas fallback.
 * No timers, workers or independent animation loops run the simulations. */
(function () {
  'use strict';
  const M=window.GXEmergenceModels,defs=M.definitions;
  const root=document.getElementById('galaxy-wrapper'),host=root.querySelector('.demo-canvas-wrapper');
  const small=matchMedia('(pointer: coarse)').matches||navigator.hardwareConcurrency<=4;
  const palette=['#9ec79a','#dfc288','#8fb3c7','#d9978c'],bg=getComputedStyle(root).getPropertyValue('--bg-raised').trim()||'#1e2420';
  const rgb=palette.map(c=>[parseInt(c.slice(1,3),16)/255,parseInt(c.slice(3,5),16)/255,parseInt(c.slice(5,7),16)/255]);
  let worlds=[],id=null,paused=false,signals=false,tool=null,dirty=true,accum=0,metricClock=0,width=0,height=0,dpr=1;
  let compare=false,comparison='',seed=731,selection=null,pointer=null,moveFood=-1,saved=[],pendingConfig=null;
  const camera={az:.7,el:.42,r:1.35,zoom:1,cx:.5,cy:.5,cz:.5};
  const pointers=new Map();let pinch=0;
  const layer=document.createElement('div');layer.className='em-layer';layer.hidden=true;
  const fieldCanvas=document.createElement('canvas'),surface=document.createElement('canvas');
  fieldCanvas.className='em-field';surface.className='em-surface';surface.tabIndex=0;surface.setAttribute('aria-label','Interactive emergence world');
  const metrics=document.createElement('div');metrics.className='em-metrics';metrics.setAttribute('aria-live','off');
  layer.append(fieldCanvas,surface,metrics);host.insertBefore(layer,host.querySelector('.gx-current'));
  const ctx=fieldCanvas.getContext('2d'),fieldImage=document.createElement('canvas'),fieldCtx=fieldImage.getContext('2d');
  let fieldPixels=null;
  let gl=null,program=null,buffer=null,points=null,fallbackCanvas=null,pointCount=0;
  // Keep the last image when a model is paused or between fixed simulation steps.
  try{gl=surface.getContext('webgl2',{alpha:true,antialias:false,powerPreference:'low-power',premultipliedAlpha:true,preserveDrawingBuffer:true});}catch(e){}
  if(gl){
    const vertex=`#version 300 es
      in vec2 pos; in float size; in float angle; in vec4 color; in float kind; in float depth;
      uniform vec2 resolution; uniform float ratio;
      out vec4 tint; out float rotation; out float shape;
      void main(){gl_Position=vec4(pos.x/resolution.x*2.-1.,1.-pos.y/resolution.y*2.,clamp((depth-.05)/3.95,0.,1.)*2.-1.,1);gl_PointSize=size*ratio;tint=color;rotation=angle;shape=kind;}`;
    const fragment=`#version 300 es
      precision mediump float;
      in vec4 tint; in float rotation; in float shape; out vec4 outColor;
      float segment(vec2 p,vec2 a,vec2 b){vec2 d=b-a;return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.,1.));}
      void main(){vec2 p=gl_PointCoord*2.-1.;float c=cos(rotation),s=sin(rotation);p=mat2(c,-s,s,c)*p;float d;
        if(shape>1.5){
          float flap=(shape-2.)/.3,tip=.43+flap*.48,sweep=-.45+flap*.28;
          d=min(length(p/vec2(.48,.11))*.11,min(segment(p,vec2(.12,0.),vec2(sweep,tip)),segment(p,vec2(.12,0.),vec2(sweep,-tip))));
          d=min(d,segment(p,vec2(-.35,0.),vec2(-.68,.16)));
          d=min(d,segment(p,vec2(-.35,0.),vec2(-.68,-.16)));
        }else{
          d=min(length((p-vec2(.43,0.))/vec2(.22,.20)),min(length(p/vec2(.19,.18)),length((p+vec2(.38,0.))/vec2(.28,.23))))*.18;
          float gait=sin((shape-1.)*40.)*.1;
          for(int j=0;j<3;j++){float x=-.23+float(j)*.23;d=min(d,segment(p,vec2(x,0.),vec2(x-.2+gait,.48)));d=min(d,segment(p,vec2(x,0.),vec2(x+.2-gait,-.48)));}
          d=min(d,segment(p,vec2(.48,.1),vec2(.76,.29)));d=min(d,segment(p,vec2(.48,-.1),vec2(.76,-.29)));
          if(shape>1.3)d=min(d,length(p-vec2(.78,0.))-.12);
        }
        float a=1.-smoothstep(.035,.10,d);if(a*tint.a<.015)discard;outColor=vec4(tint.rgb,a*tint.a);}`;
    function shader(type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
    try{
      program=gl.createProgram();const v=shader(gl.VERTEX_SHADER,vertex),f=shader(gl.FRAGMENT_SHADER,fragment);gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      let offset=0;for(const [name,n]of [['pos',2],['size',1],['angle',1],['color',4],['kind',1],['depth',1]]){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,n,gl.FLOAT,false,40,offset*4);offset+=n;}
      gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    }catch(e){console.warn('Emergence sprite renderer:',e.message);gl=null;}
  }
  if(!gl){fallbackCanvas=document.createElement('canvas');fallbackCanvas.className='em-particle-fallback';layer.insertBefore(fallbackCanvas,surface);surface.style.opacity='0';}
  surface.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;syncUI();metrics.textContent='Graphics paused. Reload to restore the world.';});
  surface.addEventListener('webglcontextrestored',()=>location.reload());
  const controls=document.createElement('div');controls.id='gx-emergence-controls';controls.hidden=true;controls.className='em-controls';
  controls.innerHTML=`<button type="button" id="em-preset-open" class="em-preset-open" aria-haspopup="dialog" aria-controls="em-lab"><img alt="" width="40" height="30"><span></span><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
    <div class="em-playback"><button type="button" id="em-pause">Pause</button><button type="button" id="em-restart">Restart</button><button type="button" id="em-lab-open" aria-haspopup="dialog" aria-controls="em-lab">Lab</button></div>
    <label class="em-touch"><span>Touch the world</span><select id="em-tool" aria-label="World interaction"></select></label>
    <p class="em-mini">Change a rule. Watch what follows.</p>`;
  document.getElementById('gx-scene-runtime').appendChild(controls);
  const dialog=document.createElement('dialog');dialog.id='em-lab';dialog.className='em-lab';dialog.setAttribute('aria-labelledby','em-lab-title');
  dialog.innerHTML=`<div class="em-lab-head"><div><p>Emergence lab</p><h2 id="em-lab-title"></h2></div><button type="button" id="em-lab-close" autofocus>Back to world</button></div>
    <div class="em-lab-body"><section><h3>Start somewhere</h3><div id="em-presets" class="em-presets"></div></section>
    <div class="em-lab-columns"><section><h3>Touch the world</h3><div id="em-tools" class="em-tools"></div><label class="em-check"><input id="em-signals" type="checkbox"> <span id="em-signal-label">Reveal signals</span></label><label class="em-check" id="em-hawk-control"><input id="em-hawk" type="checkbox"> Hawk hunting</label><p id="em-tool-help" class="em-help"></p></section>
    <section><h3>Change the rules <span id="em-rule-target"></span></h3><div id="em-rules"></div></section></div>
    <section class="em-experiment"><label class="em-check"><input type="checkbox" id="em-compare"> Compare one changed rule</label><p id="em-comparison">Both worlds start from exactly the same state.</p></section>
    <section><h3>Keep this setup</h3><div class="em-save-actions"><button id="em-save" type="button">Save setup</button><button id="em-share" type="button">Copy setup link</button><button id="em-new-seed" type="button">New seed</button><button id="em-refill" type="button">Refill food</button></div><p id="em-message" role="status"></p><div id="em-saved" class="em-saved"></div></section>
    <details class="em-model-notes"><summary>How this model works</summary><p id="em-about"></p><a id="em-source" target="_blank" rel="noopener"></a></details></div>`;
  root.appendChild(dialog);
  const $=s=>document.getElementById(s);
  try{const list=JSON.parse(localStorage.getItem('gx-emergence-setups')||'[]');if(Array.isArray(list))saved=list.filter(s=>s&&s.config&&Object.hasOwn(defs,s.config.id)).slice(0,6);}catch(e){}

  function hint(){
    if(!id)return;
    const text={view:'Drag to pan · Pinch or scroll to zoom',orbit:'Drag to rotate · Pinch or scroll to zoom',scatter:'Tap the flock to scatter nearby birds',predator:'Tap to release a hawk · Drag to move it',wall:id==='boids'?'Tap to place an obstacle':'Drag to draw a wall',erase:'Drag to erase',food:'Tap to add food · Tap a pile to refill it',move:'Drag food or the nest to move it',cut:'Drag to erase scent',inspect:'Tap an individual to see its local world'}[tool];
    $('galaxy-hint').textContent=text||'Touch the world';$('em-tool-help').textContent=text||'';
    surface.style.cursor=['orbit','view'].includes(tool)?'grab':tool==='inspect'?'pointer':'crosshair';
    surface.setAttribute('aria-label',defs[id].name+'. '+text+'. Use the Lab for keyboard-accessible tools and rules.');
  }
  function syncUI(){
    if(!id)return;
    const w=worlds[compare?1:0],def=defs[id];
    $('em-pause').textContent=paused?'Play':'Pause';$('em-pause').setAttribute('aria-pressed',String(paused));
    $('em-preset-open').querySelector('span').textContent=def.presets.find(p=>p[0]===w.preset)?.[1]||'Custom setup';
    $('em-preset-open').querySelector('img').src='assets/galaxy-previews/'+id+'.svg?v=1.76';
    $('em-lab-title').textContent=def.name;$('em-about').textContent=def.about;$('em-source').href=def.source[1];$('em-source').textContent=def.source[0];
    $('em-compare').checked=compare;$('em-signals').checked=signals;$('em-rule-target').textContent=compare?'Right world':'';
    $('em-comparison').textContent=compare?'Left: original rules. Right: '+comparison.toLowerCase()+'. Rule edits affect the right world.':'Both worlds start from exactly the same state.';
    $('em-tool').value=tool;
    $('em-refill').hidden=id!=='ants';
    $('em-hawk-control').hidden=id!=='boids';$('em-hawk').checked=!!w.predator;
    $('em-signal-label').textContent=id==='ants'?'Food scent + home scent':'Show neighbors and steering';
    for(const btn of $('em-tools').children)btn.setAttribute('aria-pressed',String(btn.dataset.tool===tool));
    for(const btn of $('em-presets').children)btn.setAttribute('aria-pressed',String(btn.dataset.preset===w.preset));
    for(const rule of def.rules){const input=$('em-rule-'+rule[0]);if(input){input.value=w.p[rule[0]];input.parentElement.querySelector('output').textContent=Number(w.p[rule[0]]).toFixed(rule[4]<.01?3:rule[4]<1?2:0);}}
    hint();dirty=true;metricClock=1;
  }
  function buildUI(){
    const def=defs[id];$('em-tool').replaceChildren();$('em-tools').replaceChildren();$('em-rules').replaceChildren();$('em-presets').replaceChildren();
    for(const [key,label]of def.tools){const short={food:'Add food',move:'Move food / nest',scatter:'Scatter',predator:'Hawk',wall:id==='boids'?'Obstacle':'Draw wall',cut:'Erase scent',erase:'Erase',inspect:id==='boids'?'Follow bird':'Follow ant'};const option=new Option(short[key]||label,key);$('em-tool').add(option);const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.dataset.tool=key;btn.addEventListener('click',()=>{chooseTool(key);dialog.close();surface.focus({preventScroll:true});});$('em-tools').appendChild(btn);}
    for(const [key,label]of def.presets){const btn=document.createElement('button');btn.type='button';btn.dataset.preset=key;const image=document.createElement('img');image.src='assets/galaxy-previews/'+id+'-'+key+'.svg?v=1.76';image.alt='';image.width=160;image.height=100;const name=document.createElement('span');name.textContent=label;btn.append(image,name);btn.addEventListener('click',()=>restart(key));$('em-presets').appendChild(btn);}
    for(const [key,label,min,max,step]of def.rules){const row=document.createElement('label');row.className='em-rule';const name=document.createElement('span');name.textContent=label;const out=document.createElement('output');const input=document.createElement('input');input.type='range';input.id='em-rule-'+key;input.min=min;input.max=max;input.step=step;input.setAttribute('aria-label',label);out.htmlFor=input.id;
      input.addEventListener('input',()=>{const w=worlds[compare?1:0];w.p[key]=Number(input.value);out.textContent=Number(input.value).toFixed(step<.01?3:step<1?2:0);if(compare){comparison='Custom '+label.toLowerCase();$('em-comparison').textContent='Left: original rules. Right: '+comparison.toLowerCase()+'.';}dirty=true;});row.append(name,out,input);$('em-rules').appendChild(row);}
    renderSaved();syncUI();
  }
  function chooseTool(key){tool=key;pointer=null;worlds.forEach(w=>{w.pointer=null;if(key!=='inspect')w.selected=-1;});if(key!=='inspect')selection=null;syncUI();}
  function activate(next,config){
    if(!Object.hasOwn(defs,next)){deactivate();return;}
    id=next;compare=false;paused=false;selection=null;accum=0;seed=Number.isFinite(config?.seed)?config.seed>>>0:731;
    layer.hidden=false;controls.hidden=false;root.dataset.emergence='true';camera.zoom=1;
    camera.cx=.5;camera.cy=.5;camera.cz=.5;
    tool=defs[id].tools[0][0];worlds=[new M.World(id,seed,small,config?.preset,config||{})];
    buildUI();
    dirty=true;
  }
  function deactivate(){id=null;worlds=[];layer.hidden=true;controls.hidden=true;delete root.dataset.emergence;pauseInput();if(dialog.open)dialog.close();}
  function restart(preset,config){
    if(!id)return;const baseline=worlds[0],change=compare?Object.fromEntries(Object.entries(worlds[1].p).filter(([key,value])=>value!==baseline.p[key])):null;
    worlds=[new M.World(id,seed,small,preset||baseline.preset,config||{})];
    // Restart the exact setup, including edited rules, food and barriers.
    if(!preset&&!config)worlds[0]=new M.World(id,seed,small,baseline.preset,baseline.configuration());
    if(compare){worlds.push(worlds[0].clone());if(change)Object.assign(worlds[1].p,change);if(Object.keys(change||{}).length===1&&Object.keys(change).every(k=>worlds[0].p[k]===worlds[1].p[k])){const key=Object.keys(change)[0];worlds[1].p[key]=defs[id].defaults[key]===worlds[0].p[key]?defs[id].rules.find(r=>r[0]===key)[2]:defs[id].defaults[key];comparison='Changed '+defs[id].rules.find(r=>r[0]===key)[1].toLowerCase();}}
    selection=null;accum=0;dirty=true;syncUI();
  }
  function toggleCompare(enabled){
    compare=enabled;
    if(enabled){worlds.push(worlds[0].clone());const [key,value,label]=defs[id].compare;worlds[1].p[key]=value;comparison=label;}else worlds.length=1;
    if(enabled){const [key,value]=defs[id].compare;if(worlds[0].p[key]===value){worlds[1].p[key]=defs[id].defaults[key]!==value?defs[id].defaults[key]:defs[id].rules.find(r=>r[0]===key)[2];comparison='Changed '+defs[id].rules.find(r=>r[0]===key)[1].toLowerCase();}}
    selection=null;syncUI();
  }
  function renderSaved(){
    const list=$('em-saved');list.replaceChildren();
    saved.forEach((entry,index)=>{const row=document.createElement('div'),btn=document.createElement('button'),del=document.createElement('button');btn.type=del.type='button';btn.textContent=entry.name;del.textContent='Remove';del.setAttribute('aria-label','Remove '+entry.name);btn.addEventListener('click',()=>{pendingConfig=entry.config;root.querySelector('.gx-scene-field[data-category="emergence"] select').value=entry.config.id;root.querySelector('.gx-scene-field[data-category="emergence"] select').dispatchEvent(new Event('change'));if(id===entry.config.id)activate(id,entry.config);dialog.close();});del.addEventListener('click',()=>{saved.splice(index,1);persist();renderSaved();});row.append(btn,del);list.appendChild(row);});
  }
  function persist(){try{localStorage.setItem('gx-emergence-setups',JSON.stringify(saved));return true;}catch(e){$('em-message').textContent='This browser cannot store setups. Copy a link instead.';return false;}}
  function openLab(){if(id){syncUI();dialog.showModal();}}
  $('em-preset-open').addEventListener('click',openLab);$('em-lab-open').addEventListener('click',openLab);$('em-lab-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
  $('em-pause').addEventListener('click',()=>{paused=!paused;accum=0;syncUI();});$('em-restart').addEventListener('click',()=>restart());
  $('em-tool').addEventListener('change',e=>chooseTool(e.target.value));$('em-signals').addEventListener('change',e=>{signals=e.target.checked;dirty=true;});$('em-hawk').addEventListener('change',e=>{const w=worlds[compare?1:0];if(e.target.checked)w.setPredator(.5,.55,.5);else w.predator=null;dirty=true;syncUI();});$('em-compare').addEventListener('change',e=>toggleCompare(e.target.checked));
  $('em-refill').addEventListener('click',()=>{worlds.forEach(w=>w.food.forEach(f=>f.amount=f.capacity));dirty=true;$('em-message').textContent='Food replenished. The colony keeps its trails.';});
  $('em-new-seed').addEventListener('click',()=>{seed=(seed+1)>>>0;restart(worlds[0].preset);$('em-message').textContent='New starting positions. Seed '+seed+'.';});
  $('em-save').addEventListener('click',()=>{const config=worlds[compare?1:0].configuration();config.view={...camera};saved.unshift({name:defs[id].name+' · '+(defs[id].presets.find(p=>p[0]===config.preset)?.[1]||'Setup')+' · '+seed,config});saved=saved.slice(0,6);if(persist())$('em-message').textContent='Saved on this device.';renderSaved();});
  $('em-share').addEventListener('click',async()=>{
    const config=worlds[compare?1:0].configuration();config.view={...camera};const url=new URL(location.href);url.hash='em='+encodeURIComponent(JSON.stringify({v:1,...config}));
    try{await navigator.clipboard.writeText(url.href);$('em-message').textContent='Setup link copied. It recreates these rules, food and walls.';}catch(e){const input=document.createElement('input');input.type='text';input.readOnly=true;input.value=url.href;input.setAttribute('aria-label','Setup link');$('em-message').replaceChildren(input);input.select();}
  });
  function readLink(){try{const hash=location.hash;if(!hash.startsWith('#em='))return null;const c=JSON.parse(decodeURIComponent(hash.slice(4)));if(c.v!==1||!Object.hasOwn(defs,c.id)||hash.length>45000)return null;if(!defs[c.id].presets.some(p=>p[0]===c.preset))return null;return c;}catch(e){return null;}}
  pendingConfig=readLink();

  function resize(){
    const w=host.clientWidth,h=host.clientHeight,r=Math.min(devicePixelRatio||1,small?1.5:2);
    if(w===width&&h===height&&r===dpr){fitWorlds();return;} width=w;height=h;dpr=r;
    for(const c of [fieldCanvas,surface,fallbackCanvas].filter(Boolean)){c.width=Math.max(1,Math.round(w*r));c.height=Math.max(1,Math.round(h*r));}
    ctx.setTransform(r,0,0,r,0,0);if(gl)gl.viewport(0,0,surface.width,surface.height);fitWorlds();dirty=true;
  }
  function fitWorlds(){if(id==='ants')worlds.forEach((w,index)=>{const r=rect(index);w.setAspect(r.w/r.h);});}
  function rect(index){
    const pane=width/worlds.length,x=index*pane;
    let w=pane-32,h=height-110,left=x+16,top=76;
    if(height<270){top=48;h=height-74;}
    return {x:left,y:top,w:Math.max(1,w),h:Math.max(1,h),left:x,pane};
  }
  function basis(){
    const c=Math.cos(camera.az),s=Math.sin(camera.az),ce=Math.cos(camera.el),se=Math.sin(camera.el);
    return {right:[-s,0,c],up:[-se*c,ce,-se*s],forward:[-ce*c,-se,-ce*s]};
  }
  function project(w,i,r,b){
    if(id!=='boids')return {x:r.x+(.5+(w.x[i]-camera.cx)*camera.zoom)*r.w,y:r.y+(.5+(w.y[i]-camera.cy)*camera.zoom)*r.h,size:1,visible:true};
    const dx=w.x[i]-camera.cx,dy=w.y[i]-camera.cy,dz=w.z[i]-camera.cz;
    const depth=camera.r+dx*b.forward[0]+dy*b.forward[1]+dz*b.forward[2],f=Math.min(r.w,r.h)*1.2/Math.max(.1,depth);
    return {x:r.x+r.w/2+(dx*b.right[0]+dy*b.right[1]+dz*b.right[2])*f,y:r.y+r.h/2-(dx*b.up[0]+dy*b.up[1]+dz*b.up[2])*f,size:f/Math.min(r.w,r.h),depth,visible:depth>.08&&depth<4};
  }
  function worldPos(clientX,clientY){
    const bounds=surface.getBoundingClientRect(),px=clientX-bounds.left,py=clientY-bounds.top,index=M.clamp(Math.floor(px/(width/worlds.length)),0,worlds.length-1),r=rect(index);
    let z=.5,x=camera.cx+(px-r.x-r.w/2)/r.w/camera.zoom,y=camera.cy+(py-r.y-r.h/2)/r.h/camera.zoom;
    if(id==='boids'){const b=basis(),scale=camera.r/(Math.min(r.w,r.h)*1.2),sx=(px-r.x-r.w/2)*scale,sy=-(py-r.y-r.h/2)*scale;x=camera.cx+sx*b.right[0]+sy*b.up[0];y=camera.cy+sx*b.right[1]+sy*b.up[1];z=camera.cz+sx*b.right[2]+sy*b.up[2];
      // Place at a visible bird's depth, so a rotated view remains spatially honest.
      const w=worlds[index];let best=Infinity,nearest=-1;for(let i=0;i<w.n;i++){const p=project(w,i,r,b),d=(p.x-px)**2+(p.y-py)**2;if(p.visible&&d<best){best=d;nearest=i;}}
      if(nearest>=0){const depth=camera.r+(w.x[nearest]-camera.cx)*b.forward[0]+(w.y[nearest]-camera.cy)*b.forward[1]+(w.z[nearest]-camera.cz)*b.forward[2],f=depth/(Math.min(r.w,r.h)*1.2),dx=(px-r.x-r.w/2)*f,dy=-(py-r.y-r.h/2)*f,along=depth-camera.r;x=camera.cx+dx*b.right[0]+dy*b.up[0]+along*b.forward[0];y=camera.cy+dx*b.right[1]+dy*b.up[1]+along*b.forward[1];z=camera.cz+dx*b.right[2]+dy*b.up[2]+along*b.forward[2];}
    }
    return {x,y,z,index,px,py,r};
  }
  function intervene(pos,initial){
    if(!id)return;const w=worlds[pos.index];
    if(tool==='inspect'&&id==='boids'){let best=Infinity;const b=basis();for(let i=0;i<w.n;i++){const p=project(w,i,pos.r,b),d=Math.hypot(p.x-pos.px,p.y-pos.py);if(d<best){best=d;w.selected=i;}}}
    else if(tool==='move'){
      if(initial){let best=.065;moveFood=w.nest&&w.distance(w.nest.x-pos.x,w.nest.y-pos.y)<best?-2:-1;w.food.forEach((f,i)=>{const d=w.distance(f.x-pos.x,f.y-pos.y);if(d<best){best=d;moveFood=i;}});}
      if(moveFood>=0||moveFood===-2)w.movePlace(moveFood,pos.x,pos.y);
    }else if(initial||['wall','erase','cut','predator'].includes(tool))w.intervene(tool,pos.x,pos.y,undefined,pos.z);
    if(tool==='predator')$('em-hawk').checked=!!w.predator;
    selection=tool==='inspect'?{index:pos.index,cell:w.selected}:selection;dirty=true;
  }
  surface.addEventListener('pointerdown',e=>{
    if(!id)return;e.preventDefault();surface.focus({preventScroll:true});surface.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>1){if(pointer)pointer.gesture=true;const p=[...pointers.values()];pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);return;}
    pointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,index:worldPos(e.clientX,e.clientY).index,dragged:false,gesture:false};
  });
  surface.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>1){const p=[...pointers.values()],next=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(pinch>0){if(id==='boids')camera.r=M.clamp(camera.r*pinch/Math.max(1,next),.55,2.5);else camera.zoom=M.clamp(camera.zoom*next/pinch,.6,3);}pinch=next;dirty=true;return;}
    if(!pointer||e.pointerId!==pointer.id||pointer.gesture)return;
    if(tool==='orbit'){camera.az-=(e.clientX-pointer.x)*.006;camera.el=M.clamp(camera.el+(e.clientY-pointer.y)*.006,-1.3,1.3);dirty=true;}
    else if(tool==='view'){
      const r=rect(pointer.index);camera.cx-=(e.clientX-pointer.x)/r.w/camera.zoom;camera.cy-=(e.clientY-pointer.y)/r.h/camera.zoom;
      camera.cx=M.clamp(camera.cx,.05,.95);camera.cy=M.clamp(camera.cy,.05,.95);dirty=true;
    }else if(Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)>6){
      if(!pointer.dragged){intervene(worldPos(pointer.startX,pointer.startY),true);pointer.dragged=true;}
      intervene(worldPos(e.clientX,e.clientY),false);
    }
    pointer.x=e.clientX;pointer.y=e.clientY;
  });
  function endPointer(e){
    if(pointer&&e.pointerId===pointer.id&&!pointer.gesture&&!pointer.dragged&&e.type==='pointerup'&&!['orbit','view'].includes(tool))intervene(worldPos(e.clientX,e.clientY),true);
    pointers.delete(e.pointerId);try{surface.releasePointerCapture(e.pointerId);}catch(err){}
    if(pointers.size){const [key,p]=[...pointers.entries()][0];pointer={id:key,x:p.x,y:p.y,gesture:true};pinch=0;}else{pointer=null;pinch=0;moveFood=-1;worlds.forEach(w=>w.pointer=null);}
  }
  surface.addEventListener('pointerup',endPointer);surface.addEventListener('pointercancel',endPointer);
  function pauseInput(){for(const key of pointers.keys())try{surface.releasePointerCapture(key);}catch(e){}pointers.clear();pointer=null;pinch=0;worlds.forEach(w=>w.pointer=null);}
  surface.addEventListener('wheel',e=>{e.preventDefault();const scale=Math.exp(M.clamp(e.deltaY,-200,200)*.0015);if(id==='boids')camera.r=M.clamp(camera.r*scale,.55,2.5);else camera.zoom=M.clamp(camera.zoom/scale,.6,3);dirty=true;},{passive:false});
  surface.addEventListener('keydown',e=>{
    // Keep fullscreen shortcuts from also reaching the older flight controls.
    e.stopPropagation();
    if(e.key===' '){e.preventDefault();paused=!paused;syncUI();}
    else if(e.key.toLowerCase()==='h'){e.preventDefault();root.classList.toggle('gx-clean');}
    else if(e.key.toLowerCase()==='f'){e.preventDefault();$('galaxy-fly').click();}
    else if(e.key==='Escape'&&root.classList.contains('gx-pseudo-fs')){e.preventDefault();$('galaxy-fly').click();}
    else if(e.key.toLowerCase()==='r')restart();
    else if(e.key.toLowerCase()==='l')openLab();
    else if(e.key==='Enter'){e.preventDefault();const index=compare?1:0;worlds[index].intervene(tool==='orbit'?'scatter':tool,.5,.5);dirty=true;}
    else if(id==='boids'&&e.key.startsWith('Arrow')){e.preventDefault();camera.az+=(e.key==='ArrowLeft'?.12:e.key==='ArrowRight'?-.12:0);camera.el=M.clamp(camera.el+(e.key==='ArrowUp'?-.12:e.key==='ArrowDown'?.12:0),-1.3,1.3);dirty=true;}
    else if(id==='ants'&&e.key.startsWith('Arrow')){e.preventDefault();camera.cx=M.clamp(camera.cx+(e.key==='ArrowLeft'?-.03:e.key==='ArrowRight'?.03:0)/camera.zoom,.05,.95);camera.cy=M.clamp(camera.cy+(e.key==='ArrowUp'?-.03:e.key==='ArrowDown'?.03:0)/camera.zoom,.05,.95);dirty=true;}
    else if(e.key==='+'||e.key==='='||e.key==='-'){e.preventDefault();const scale=e.key==='-'?1.1:.9;if(id==='boids')camera.r=M.clamp(camera.r*scale,.55,2.5);else camera.zoom=M.clamp(camera.zoom/scale,.6,3);dirty=true;}
  });
  for(const key of ['galaxy-hide','galaxy-show'])$(key).addEventListener('click',()=>{if(id)surface.focus({preventScroll:true});});

  function drawField(w,r){
    if(id!=='ants')return;
    if(fieldImage.width!==w.cols||fieldImage.height!==w.rows||!fieldPixels){fieldImage.width=w.cols;fieldImage.height=w.rows;fieldPixels=fieldCtx.createImageData(w.cols,w.rows);}const data=fieldPixels.data;
    for(let i=0;i<w.field.length;i++){
      const food=Math.pow(1-Math.exp(-w.field[i]*.055),1.7),home=signals?(1-Math.exp(-w.home[i]*.055))*.65:0,sum=food+home,k=i*4;
      for(let c=0;c<3;c++)data[k+c]=sum>0?Math.round((rgb[1][c]*food+rgb[2][c]*home)/sum*255):0;
      data[k+3]=Math.round(Math.min(1,sum)*(signals?170:115));
    }
    fieldCtx.putImageData(fieldPixels,0,0);ctx.save();ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);ctx.clip();ctx.imageSmoothingEnabled=true;
    ctx.drawImage(fieldImage,r.x+r.w*(.5-camera.cx*camera.zoom),r.y+r.h*(.5-camera.cy*camera.zoom),r.w*camera.zoom,r.h*camera.zoom);ctx.restore();
  }
  function worldPoint(x,y,r){return {x:r.x+(.5+(x-camera.cx)*camera.zoom)*r.w,y:r.y+(.5+(y-camera.cy)*camera.zoom)*r.h};}
  function drawHabitat(w,r){
    if(id!=='ants')return;
    const start=worldPoint(.008/w.spanX,.008/w.spanY,r),end=worldPoint(1-.008/w.spanX,1-.008/w.spanY,r);
    ctx.save();ctx.strokeStyle=getComputedStyle(root).getPropertyValue('--rule').trim();ctx.globalAlpha=.38;ctx.lineWidth=1;
    ctx.strokeRect(start.x,start.y,end.x-start.x,end.y-start.y);ctx.restore();
  }
  function drawPlaces(w,r,b){
    ctx.font='500 10px "Commit Mono", monospace';ctx.textBaseline='middle';
    if(w.nest){
      const p=worldPoint(w.nest.x,w.nest.y,r),rad=Math.max(9,.026*Math.min(r.w,r.h)*camera.zoom);
      ctx.strokeStyle=palette[1];ctx.lineWidth=1;ctx.globalAlpha=.17;
      for(let i=1;i<=3;i++){ctx.beginPath();ctx.arc(p.x,p.y,rad+i*5,0,Math.PI*2);ctx.stroke();}
      ctx.globalAlpha=1;ctx.fillStyle=bg;ctx.beginPath();ctx.arc(p.x,p.y,rad,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=palette[1];ctx.beginPath();ctx.arc(p.x,p.y,rad*.25,0,Math.PI*2);ctx.fill();ctx.fillText('NEST',p.x-12,p.y-rad-12);
    }
    w.food.forEach(f=>{
      const p=worldPoint(f.x,f.y,r),rad=Math.max(7,.037*Math.min(r.w,r.h)*camera.zoom),fraction=f.amount/f.capacity;
      ctx.strokeStyle=palette[0];ctx.globalAlpha=.22;ctx.beginPath();ctx.arc(p.x,p.y,rad+5,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
      if(f.amount>0){for(let j=0;j<Math.ceil(28*fraction);j++){const a=j*2.399,rr=Math.sqrt(j/28)*rad;ctx.fillStyle=j%3?palette[0]:palette[1];ctx.beginPath();ctx.arc(p.x+Math.cos(a)*rr,p.y+Math.sin(a)*rr,Math.max(1.6,rad*.12),0,Math.PI*2);ctx.fill();}}
      ctx.fillStyle=palette[0];ctx.fillText(f.amount>0?String(f.amount):'REFILL',p.x-12,p.y-rad-11);
    });
    ctx.fillStyle=getComputedStyle(root).getPropertyValue('--line-mid').trim();
    for(const wall of w.walls){
      let p=worldPoint(wall.x,wall.y,r),rad=wall.r*Math.min(r.w,r.h)*camera.zoom;
      if(id==='boids'){p=project({x:[wall.x],y:[wall.y],z:[wall.z??.5]},0,r,b);rad=wall.r*Math.min(r.w,r.h)*p.size;if(!p.visible)continue;ctx.globalAlpha=.18;}
      if(id==='ants'&&wall.ex!==undefined){const end=worldPoint(wall.ex,wall.ey,r);ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=rad*2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(end.x,end.y);ctx.stroke();ctx.lineCap='butt';}
      ctx.beginPath();ctx.arc(p.x,p.y,Math.max(3,rad),0,Math.PI*2);ctx.fill();
      if(id==='boids'){ctx.globalAlpha=.55;ctx.strokeStyle=palette[2];ctx.lineWidth=1;ctx.stroke();ctx.beginPath();ctx.ellipse(p.x,p.y,rad,rad*.3,camera.az,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(p.x,p.y,rad*.3,rad,camera.az,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    }
    if(tool==='move'&&id==='ants'){ctx.strokeStyle=palette[1];ctx.setLineDash([3,4]);for(const p of [w.nest,...w.food]){const q=worldPoint(p.x,p.y,r);ctx.beginPath();ctx.arc(q.x,q.y,Math.max(18,Math.min(r.w,r.h)*.055*camera.zoom),0,Math.PI*2);ctx.stroke();}ctx.setLineDash([]);}
  }
  function drawInspection(w,r,b){
    if(w.selected<0&&!signals)return;
    const selected=w.selected<0?Math.min(12,w.n-1):w.selected;
    if(selected<0)return;const point=project(w,selected,r,b);ctx.strokeStyle=palette[1];ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(point.x,point.y,9,0,Math.PI*2);ctx.stroke();
    if(id==='ants'){
      if(w.selected>=0){ctx.globalAlpha=.35;ctx.beginPath();for(let k=0;k<w.routeCount[selected];k++){const p=worldPoint(w.routeX[selected*w.routeLimit+k],w.routeY[selected*w.routeLimit+k],r);if(k===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}ctx.stroke();ctx.globalAlpha=1;}
      const look=.023,angle=.58,a=w.a[selected];for(const offset of [-angle,0,angle]){const p=worldPoint(w.x[selected]+Math.cos(a+offset)*look/w.spanX,w.y[selected]+Math.sin(a+offset)*look/w.spanY,r);ctx.beginPath();ctx.moveTo(point.x,point.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.stroke();}
    }else{
      const rad=w.p.range;
      w.grid.build(w);const near=[],speed=Math.hypot(w.vx[selected],w.vy[selected],w.vz[selected]);
      w.grid.neighbors(w,selected,rad,j=>{const dx=w.x[j]-w.x[selected],dy=w.y[j]-w.y[selected],dz=w.z[j]-w.z[selected],d=dx*dx+dy*dy+dz*dz;if(d>rad*rad||d<1e-9)return;if((dx*w.vx[selected]+dy*w.vy[selected]+dz*w.vz[selected])/Math.sqrt(d)/speed<-.55)return;near.push({j,d});});near.sort((a,b)=>a.d-b.d);
      ctx.globalAlpha=.3;for(const {j}of near.slice(0,7)){const p=project(w,j,r,b);ctx.beginPath();ctx.moveTo(point.x,point.y);ctx.lineTo(p.x,p.y);ctx.stroke();}ctx.globalAlpha=1;
      for(const [keys,color,scale]of [[['vx','vy','vz'],palette[2],.45],[['ax','ay','az'],palette[1],.25]]){const p=project({x:[w.x[selected]+w[keys[0]][selected]*scale],y:[w.y[selected]+w[keys[1]][selected]*scale],z:[w.z[selected]+w[keys[2]][selected]*scale]},0,r,b);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(point.x,point.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,Math.PI*2);ctx.fill();}

      if(id!=='boids'){ctx.globalAlpha=.3;ctx.beginPath();ctx.ellipse(point.x,point.y,rad*r.w*camera.zoom,rad*r.h*camera.zoom,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    }
  }
  function drawDepth(w,r,b){
    if(id!=='boids')return;
    // A quiet floor supplies parallax and a horizon without enclosing the birds.
    const point=(x,y,z)=>project({x:[x],y:[y],z:[z]},0,r,b);
    ctx.save();ctx.strokeStyle=getComputedStyle(root).getPropertyValue('--line-mid').trim();ctx.lineWidth=1;
    for(let axis=0;axis<2;axis++)for(let line=0;line<=8;line++){
      ctx.globalAlpha=line===4?.38:.21;ctx.beginPath();let started=false;
      for(let step=0;step<=24;step++){
        const p=point(axis?step/24:line/8,.065,axis?line/8:step/24);
        if(!p.visible){started=false;continue;}
        if(started)ctx.lineTo(p.x,p.y);else{ctx.moveTo(p.x,p.y);started=true;}
      }ctx.stroke();
    }
    // The projected shadow grounds the flock and makes its height legible.
    ctx.fillStyle=bg;ctx.globalAlpha=.08;
    for(let i=0;i<w.n;i+=12){const p=point(w.x[i],.066,w.z[i]);if(!p.visible)continue;ctx.beginPath();ctx.ellipse(p.x,p.y,9*p.size,4*p.size,-camera.az,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
  function draw(){
    if(!width||!height)return;ctx.clearRect(0,0,width,height);ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
    const atmosphere=ctx.createRadialGradient(width*.5,height*.48,0,width*.5,height*.48,Math.max(width,height)*.65);atmosphere.addColorStop(0,id==='ants'?'rgba(158,199,154,.055)':'rgba(143,179,199,.055)');atmosphere.addColorStop(1,'rgba(30,36,32,0)');ctx.fillStyle=atmosphere;ctx.fillRect(0,0,width,height);
    if(id==='ants'){ctx.fillStyle='rgba(158,199,154,.065)';for(let i=0;i<260;i++){const x=((i*157)%997)/997*width,y=((i*269)%991)/991*height;ctx.fillRect(x,y,1,1);}}
    const max=worlds.reduce((n,w)=>n+w.n+1,0);if(!points||points.length<max*10)points=new Float32Array(max*10);pointCount=0;const b=basis();
    worlds.forEach((w,index)=>{
      const r=rect(index);ctx.save();ctx.beginPath();ctx.rect(r.left,0,r.pane,height);ctx.clip();drawDepth(w,r,b);drawField(w,r);drawHabitat(w,r);drawPlaces(w,r,b);drawInspection(w,r,b);
      const count=w.n;
      for(let i=0;i<count;i++){
        const p=project(w,i,r,b);if(!p.visible||p.x<r.left||p.x>r.left+r.pane||p.y<0||p.y>height)continue;
        let size=4,angle=w.a[i],color=rgb[w.species[i]],alpha=.85,kind=0;
        if(id==='boids'){
          size=M.clamp(13*Math.pow(p.size,1.25),2.5,24);angle=Math.atan2(-(w.vx[i]*b.up[0]+w.vy[i]*b.up[1]+w.vz[i]*b.up[2]),w.vx[i]*b.right[0]+w.vy[i]*b.right[1]+w.vz[i]*b.right[2]);
          const heat=w.light[i],near=M.clamp((camera.r+.38-p.depth)/.76,0,1),haze=(1-near)*.65;
          const base=signals?rgb[w.species[i]?2:1]:rgb[0].map((v,j)=>v*(1-heat*.7)+rgb[1][j]*heat*.7);
          color=base.map((v,j)=>(v*(1-haze)+rgb[2][j]*haze)*(.65+near*.35));alpha=.46+near*.54;
          kind=2+(Math.sin(w.time*13*w.rate[i]+w.phase[i])*.5+.5)*.3;
        }
        if(id==='ants'){size=(small?6.5:8)*M.clamp(Math.min(r.w,r.h)/(small?340:600),.45,1.4)*Math.sqrt(camera.zoom);kind=1+(w.carry[i]===1?.35:0)+Math.sin(w.time*18+w.phase[i])*.04;color=rgb[w.carry[i]===1?1:2];alpha=w.carry[i]===1?1:.75;}
        if(i===w.selected){size*=1.7;color=rgb[3];alpha=1;}
        const k=pointCount*10;points[k]=p.x;points[k+1]=p.y;points[k+2]=size;points[k+3]=angle;points.set(color,k+4);points[k+7]=alpha;points[k+8]=kind;points[k+9]=p.depth||1;pointCount++;
      }
      if(w.predator){const h=w.predator,p=project({x:[h.x],y:[h.y],z:[h.z]},0,r,b);if(p.visible){const k=pointCount*10;points[k]=p.x;points[k+1]=p.y;points[k+2]=M.clamp(32*p.size,12,48);points[k+3]=Math.atan2(-(h.vx*b.up[0]+h.vy*b.up[1]+h.vz*b.up[2]),h.vx*b.right[0]+h.vy*b.right[1]+h.vz*b.right[2]);points.set(rgb[3],k+4);points[k+7]=1;points[k+8]=2.15+Math.sin(w.time*8)*.14;points[k+9]=p.depth;pointCount++;}}
      ctx.restore();
    });
    if(compare){ctx.strokeStyle='#4a544b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(width/2,0);ctx.lineTo(width/2,height);ctx.stroke();}
    if(gl){if(id==='boids'){gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);}else gl.disable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);gl.uniform2f(gl.getUniformLocation(program,'resolution'),width,height);gl.uniform1f(gl.getUniformLocation(program,'ratio'),dpr);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,points.subarray(0,pointCount*10),gl.DYNAMIC_DRAW);gl.drawArrays(gl.POINTS,0,pointCount);}
    else{
      const fc=fallbackCanvas.getContext('2d');fc.setTransform(dpr,0,0,dpr,0,0);fc.clearRect(0,0,width,height);
      const order=Array.from({length:pointCount},(_,i)=>i);if(id==='boids')order.sort((a,b)=>points[b*10+9]-points[a*10+9]);
      for(const i of order){
        const k=i*10,x=points[k],y=points[k+1],s=points[k+2];fc.save();fc.translate(x,y);fc.rotate(points[k+3]);fc.scale(s/2,s/2);fc.strokeStyle=fc.fillStyle='rgba('+Math.round(points[k+4]*255)+','+Math.round(points[k+5]*255)+','+Math.round(points[k+6]*255)+','+points[k+7]+')';fc.lineWidth=.13;
        if(points[k+8]>1.5){const tip=.4+(points[k+8]-2)*1.6;fc.beginPath();fc.moveTo(-.45,tip);fc.lineTo(.12,0);fc.lineTo(-.45,-tip);fc.moveTo(-.5,0);fc.lineTo(.5,0);fc.stroke();}
        else{for(const [x,rx]of [[-.38,.28],[0,.19],[.43,.22]]){fc.beginPath();fc.ellipse(x,0,rx,.2,0,0,Math.PI*2);fc.fill();}for(let j=0;j<3;j++){const x=-.23+j*.23;fc.beginPath();fc.moveTo(x-.2,.48);fc.lineTo(x,0);fc.lineTo(x+.2,-.48);fc.stroke();}if(points[k+8]>1.3){fc.beginPath();fc.arc(.78,0,.12,0,Math.PI*2);fc.fill();}}
        fc.restore();
      }

    }
    dirty=false;
  }
  function updateMetrics(){
    metrics.replaceChildren();worlds.forEach((w,index)=>{const group=document.createElement('div');const name=document.createElement('strong');name.textContent=compare?(index?'Changed rules':'Original rules'):(paused?'Paused':w.metric()[0]);const detail=document.createElement('span');detail.textContent=compare?w.metric()[0]:w.metric()[1];group.append(name,detail);if(id==='ants'){const legend=document.createElement('span');legend.className='em-legend';legend.innerHTML='<i class="em-food-key"></i>Food'+(signals?' <i class="em-home-key"></i>Home':' · Blue scouts, gold carriers');group.appendChild(legend);}
      if(w.selected>=0){const lens=document.createElement('span'),i=w.selected;
        lens.textContent=id==='ants'?(w.carry[i]===1?'Carrying food home':w.carry[i]===2?'Returning to nest':'Searching for food')+' · '+w.routeCount[i]+' remembered turns':w.neighbors[i]+' visible neighbors · '+Math.round(w.light[i]*100)+'% steering';
        group.appendChild(lens);
      }metrics.appendChild(group);});
  }
  function tick(dt){
    if(!id)return;resize();metricClock+=dt;
    // The modal remains interactive while worlds keep their fixed-step clock.
    if(!paused){
      const step=1/30;accum=Math.min(accum+dt,step*2);let advanced=false;
      while(accum>=step){worlds.forEach(w=>w.step(step));accum-=step;advanced=true;}
      if(advanced)dirty=true;
      if(id==='boids'&&!pointer){camera.az+=dt*.12;dirty=true;}
      if(id==='boids'){const w=selection?worlds[selection.index]:worlds[0],i=selection?w.selected:-1,k=1-Math.exp(-dt*3);let x=0,y=0,z=0;if(i>=0){x=w.x[i];y=w.y[i];z=w.z[i];}else{for(let j=0;j<w.n;j++){x+=w.x[j];y+=w.y[j];z+=w.z[j];}x/=w.n;y/=w.n;z/=w.n;}camera.cx+=(x-camera.cx)*k;camera.cy+=(y-camera.cy)*k;camera.cz+=(z-camera.cz)*k;}
    }
    if(dirty){draw();if(metricClock>.25||paused){updateMetrics();metricClock=0;}}
  }
  function fallback(){
    // Browsers without WebGPU can still run the complete Emergence lab.
    // This loop is used only when the main WebGPU app cannot start.
    const select=root.querySelector('.gx-scene-field[data-category="emergence"] select');
    const category=$('gx-watch-category');let request=null,last=0,visible=true,focused=document.hasFocus();
    $('galaxy-status').style.display='none';root.setAttribute('aria-busy','false');
    $('gx-explore-tab').disabled=true;$('gx-explore-tab').title='Explore needs WebGPU in this browser';
    for(const option of category.options)option.disabled=option.value!=='emergence';category.value='emergence';
    root.querySelectorAll('.gx-scene-field').forEach(el=>el.dataset.active=String(el.dataset.category==='emergence'));
    function choose(next){select.value=next;select.classList.add('gx-cat-select--active');root.dataset.scene=next;root.dataset.mode='watch';$('gx-current-name').textContent=defs[next].name;$('gx-current-summary').textContent=defs[next].summary;window.GXEmergence.activate(next);window.GXPicker?.sync();}
    select.addEventListener('change',()=>choose(select.value));$('gx-watch-tab').addEventListener('click',()=>choose(select.value));
    window.GXPicker?.init(root,{pathfinding:'bfs',sorting:'quick',emergence:pendingConfig?.id||'boids',randomness:'mulberry',attractors:'lorenz',fractals:'sierpinski',numbers:'collatz',geometry:'hopf'});choose(pendingConfig?.id||'boids');
    $('gx-info-open').addEventListener('click',()=>{ $('gx-info-title').textContent=defs[id].name;$('galaxy-blurb').textContent=defs[id].about;$('gx-info-dialog').showModal();});
    $('gx-info-close').addEventListener('click',()=>$('gx-info-dialog').close());
    for(const key of ['galaxy-hide','galaxy-show'])$(key).addEventListener('click',()=>root.classList.toggle('gx-clean'));
    $('galaxy-fly').addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen();else if(root.requestFullscreen)root.requestFullscreen().catch(()=>root.classList.toggle('gx-pseudo-fs'));else root.classList.toggle('gx-pseudo-fs');});
    function allowed(){return visible&&document.visibilityState==='visible'&&focused;}
    function frame(now){request=null;if(!allowed())return;tick(last?Math.min((now-last)/1000,.05):.016);last=now;request=requestAnimationFrame(frame);}
    function sync(){pauseInput();if(!allowed()){if(request!==null)cancelAnimationFrame(request);request=null;last=0;}else if(request===null){last=0;request=requestAnimationFrame(frame);}}
    document.addEventListener('visibilitychange',()=>{focused=document.hasFocus();sync();});window.addEventListener('blur',()=>{focused=false;sync();});window.addEventListener('focus',()=>{focused=true;sync();});window.addEventListener('pagehide',()=>{visible=false;sync();});window.addEventListener('pageshow',()=>{visible=true;focused=document.hasFocus();sync();});
    if(window.IntersectionObserver)new IntersectionObserver(entries=>{visible=entries.at(-1).isIntersecting;sync();}).observe(root);sync();
  }
  window.GXEmergence={is:id=>Object.hasOwn(defs,id),activate:(next)=>{const config=pendingConfig?.id===next?pendingConfig:null;pendingConfig=null;activate(next,config);if(config?.view)for(const k of ['az','el','r','zoom','cx','cy'])if(Number.isFinite(config.view[k]))camera[k]=M.clamp(config.view[k],k==='el'?-1.3:k==='az'?-100:['cx','cy'].includes(k)?.05:.55,k==='el'?1.3:k==='az'?100:['cx','cy'].includes(k)?.95:3);},deactivate,tick,pauseInput,hint,
    fallback,
    get active(){return id!==null;},get linkedScene(){return pendingConfig?.id||null;},about:()=>id?defs[id].about:'',
    snapshot:()=>({id,paused,compare,tool,signals,seed,camera:{...camera},worlds:worlds.map(w=>({steps:w.steps,time:w.time,p:{...w.p},metric:w.metric(),food:w.food.map(f=>({...f})),walls:w.walls.length,selected:w.selected,nest:w.nest?{...w.nest}:null,predator:w.predator?{...w.predator}:null,delivered:w.delivered,carrying:w.carry.reduce((a,b)=>a+(b===1),0),finite:w.x.every(Number.isFinite)&&w.y.every(Number.isFinite)&&w.field.every(Number.isFinite)}))})};
})();
