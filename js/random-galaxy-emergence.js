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
  const camera={az:.7,el:.42,r:1.2,zoom:1,cx:.5,cy:.5,cz:.5};
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
      in vec2 pos; in float size; in float angle; in vec4 color; in float kind;
      uniform vec2 resolution; uniform float ratio;
      out vec4 tint; out float rotation; out float shape;
      void main(){gl_Position=vec4(pos.x/resolution.x*2.-1.,1.-pos.y/resolution.y*2.,0,1);gl_PointSize=size*ratio;tint=color;rotation=angle;shape=kind;}`;
    const fragment=`#version 300 es
      precision mediump float;
      in vec4 tint; in float rotation; in float shape; out vec4 outColor;
      void main(){vec2 p=gl_PointCoord*2.-1.;float c=cos(rotation),s=sin(rotation);p=mat2(c,-s,s,c)*p;
        float a=0.;
        if(shape>3.5){float d=length(p);a=exp(-d*d*5.)*.7+(1.-smoothstep(.04,.26,d))*.3;}
        else if(shape>2.5){float body=length(p/vec2(.38,.72));float head=length((p-vec2(0.,-.52))/vec2(.33));a=max(1.-smoothstep(.88,1.,body),1.-smoothstep(.88,1.,head));}
        else if(shape>1.5){a=step(-.65,p.x)*step(p.x,.86)*step(abs(p.y),(.86-p.x)*.48);}
        else if(shape>.5){float d=min(length((p-vec2(.45,0.))/vec2(.26,.24)),min(length(p/vec2(.24)),length((p+vec2(.45,0.))/vec2(.3,.24))));a=1.-smoothstep(.8,1.,d);}
        else{float d=length(p);a=1.-smoothstep(.76,1.,d);}
        if(a*tint.a<.015)discard;outColor=vec4(tint.rgb,a*tint.a);}`;
    function shader(type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
    try{
      program=gl.createProgram();const v=shader(gl.VERTEX_SHADER,vertex),f=shader(gl.FRAGMENT_SHADER,fragment);gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      let offset=0;for(const [name,n]of [['pos',2],['size',1],['angle',1],['color',4],['kind',1]]){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,n,gl.FLOAT,false,36,offset*4);offset+=n;}
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
    <div class="em-lab-columns"><section><h3>Touch the world</h3><div id="em-tools" class="em-tools"></div><label class="em-check"><input id="em-signals" type="checkbox"> Reveal signals</label><p id="em-tool-help" class="em-help"></p></section>
    <section><h3>Change the rules <span id="em-rule-target"></span></h3><div id="em-rules"></div><div id="em-matrix" hidden></div></section></div>
    <section class="em-experiment"><label class="em-check"><input type="checkbox" id="em-compare"> Compare one changed rule</label><p id="em-comparison">Both worlds start from exactly the same state.</p></section>
    <section><h3>Keep this setup</h3><div class="em-save-actions"><button id="em-save" type="button">Save setup</button><button id="em-share" type="button">Copy setup link</button><button id="em-new-seed" type="button">New seed</button></div><p id="em-message" role="status"></p><div id="em-saved" class="em-saved"></div></section>
    <details class="em-model-notes"><summary>How this model works</summary><p id="em-about"></p><a id="em-source" target="_blank" rel="noopener"></a></details></div>`;
  root.appendChild(dialog);
  const $=s=>document.getElementById(s);
  try{const list=JSON.parse(localStorage.getItem('gx-emergence-setups')||'[]');if(Array.isArray(list))saved=list.filter(s=>s&&s.config&&Object.hasOwn(defs,s.config.id)).slice(0,6);}catch(e){}
  const seedReady=fetch('assets/emergence/lenia-orbium.json?v=1.74').then(r=>{if(!r.ok)throw Error('Orbium seed unavailable');return r.json();}).then(a=>{M.setOrbium(a.cells);return true;}).catch(e=>{console.warn(e.message);return false;});

  function hint(){
    if(!id)return;
    const text={orbit:'Drag to rotate · Pinch or scroll to zoom',scatter:'Tap the flock to scatter nearby birds',predator:'Tap or drag to move the predator',wall:id==='boids'?'Tap to place an obstacle':'Drag to draw a wall',erase:'Drag to erase',food:'Tap to place food',move:'Drag a food source to move it',cut:'Drag to cut the network',pulse:'Tap to scramble nearby rhythms',pull:'Drag to pull particles',repel:'Drag to push particles',organism:'Tap to place a swimmer',inspect:'Tap an individual to see its local world'}[tool];
    $('galaxy-hint').textContent=text||'Touch the world';$('em-tool-help').textContent=text||'';
    surface.style.cursor=tool==='orbit'?'grab':tool==='inspect'?'pointer':'crosshair';
    surface.setAttribute('aria-label',defs[id].name+'. '+text+'. Use the Lab for keyboard-accessible tools and rules.');
  }
  function syncUI(){
    if(!id)return;
    const w=worlds[compare?1:0],def=defs[id];
    $('em-pause').textContent=paused?'Play':'Pause';$('em-pause').setAttribute('aria-pressed',String(paused));
    $('em-preset-open').querySelector('span').textContent=def.presets.find(p=>p[0]===w.preset)?.[1]||'Custom setup';
    $('em-preset-open').querySelector('img').src='assets/galaxy-previews/'+id+'.svg?v=1.74';
    $('em-lab-title').textContent=def.name;$('em-about').textContent=def.about;$('em-source').href=def.source[1];$('em-source').textContent=def.source[0];
    $('em-compare').checked=compare;$('em-signals').checked=signals;$('em-rule-target').textContent=compare?'Right world':'';
    $('em-comparison').textContent=compare?'Left: original rules. Right: '+comparison.toLowerCase()+'. Edits affect the right world.':'Both worlds start from exactly the same state.';
    $('em-tool').value=tool;
    for(const btn of $('em-tools').children)btn.setAttribute('aria-pressed',String(btn.dataset.tool===tool));
    for(const btn of $('em-presets').children)btn.setAttribute('aria-pressed',String(btn.dataset.preset===w.preset));
    for(const rule of def.rules){const input=$('em-rule-'+rule[0]);if(input){input.value=w.p[rule[0]];input.parentElement.querySelector('output').textContent=Number(w.p[rule[0]]).toFixed(rule[4]<.01?3:rule[4]<1?2:0);}}
    hint();dirty=true;metricClock=1;
  }
  function buildUI(){
    const def=defs[id];$('em-tool').replaceChildren();$('em-tools').replaceChildren();$('em-rules').replaceChildren();$('em-presets').replaceChildren();
    for(const [key,label]of def.tools){const option=new Option(label,key);$('em-tool').add(option);const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.dataset.tool=key;btn.addEventListener('click',()=>chooseTool(key));$('em-tools').appendChild(btn);}
    for(const [key,label]of def.presets){const btn=document.createElement('button');btn.type='button';btn.dataset.preset=key;const image=document.createElement('img');image.src='assets/galaxy-previews/'+id+'-'+key+'.svg?v=1.74';image.alt='';image.width=160;image.height=100;const name=document.createElement('span');name.textContent=label;btn.append(image,name);btn.addEventListener('click',()=>restart(key));$('em-presets').appendChild(btn);}
    for(const [key,label,min,max,step]of def.rules){const row=document.createElement('label');row.className='em-rule';const name=document.createElement('span');name.textContent=label;const out=document.createElement('output');const input=document.createElement('input');input.type='range';input.id='em-rule-'+key;input.min=min;input.max=max;input.step=step;input.setAttribute('aria-label',label);out.htmlFor=input.id;
      input.addEventListener('input',()=>{const w=worlds[compare?1:0];w.p[key]=Number(input.value);out.textContent=Number(input.value).toFixed(step<.01?3:step<1?2:0);if(compare){comparison='Custom '+label.toLowerCase();$('em-comparison').textContent='Left: original rules. Right: '+comparison.toLowerCase()+'.';}dirty=true;});row.append(name,out,input);$('em-rules').appendChild(row);}
    buildMatrix();renderSaved();syncUI();
  }
  function chooseTool(key){tool=key;pointer=null;worlds.forEach(w=>{w.pointer=null;if(key!=='inspect')w.selected=-1;});if(key!=='inspect')selection=null;syncUI();}
  function buildMatrix(){
    const matrix=$('em-matrix');matrix.hidden=id!=='particlelife';matrix.replaceChildren();if(matrix.hidden)return;
    const title=document.createElement('p');title.className='em-help';title.textContent='Row feels column. Tap: repel, neutral, attract.';matrix.appendChild(title);
    const table=document.createElement('table');table.className='em-relationships';const colors=['Green','Gold','Blue','Coral'];
    const head=document.createElement('tr');head.appendChild(document.createElement('td'));for(let j=0;j<4;j++){const th=document.createElement('th');th.scope='col';const dot=document.createElement('span');dot.style.background=palette[j];dot.title=colors[j];dot.textContent=colors[j][0];th.appendChild(dot);head.appendChild(th);}table.appendChild(head);
    for(let i=0;i<4;i++){const row=document.createElement('tr'),th=document.createElement('th');th.scope='row';const dot=document.createElement('span');dot.style.background=palette[i];dot.textContent=colors[i][0];th.appendChild(dot);row.appendChild(th);
      for(let j=0;j<4;j++){const cell=document.createElement('td'),btn=document.createElement('button');btn.type='button';const update=()=>{const val=worlds[compare?1:0].matrix[i*4+j];btn.textContent=val<-.05?'−':val>.05?'+':'0';btn.dataset.relationship=val<-.05?'repel':val>.05?'attract':'neutral';btn.setAttribute('aria-label',colors[i]+' toward '+colors[j]+': '+btn.dataset.relationship+'. Click to change.');};btn.addEventListener('click',()=>{const w=worlds[compare?1:0],k=i*4+j;w.matrix[k]=w.matrix[k]<-.05?0:w.matrix[k]>.05?-1:1;update();dirty=true;});update();cell.appendChild(btn);row.appendChild(cell);}table.appendChild(row);
    }matrix.appendChild(table);
  }
  function activate(next,config){
    if(!Object.hasOwn(defs,next)){deactivate();return;}
    id=next;compare=false;paused=false;selection=null;accum=0;seed=Number.isFinite(config?.seed)?config.seed>>>0:731;
    layer.hidden=false;controls.hidden=false;root.dataset.emergence='true';camera.zoom=1;
    if(id==='boids'){camera.cx=.5;camera.cy=.5;camera.cz=.5;}
    tool=defs[id].tools[0][0];worlds=[new M.World(id,seed,small,config?.preset,config||{})];
    buildUI();
    if(id==='lenia'){const startingWorld=worlds[0];seedReady.then(ready=>{if(id!=='lenia'||worlds[0]!==startingWorld)return;if(!ready){metrics.textContent='The organism seed could not load. Reload to retry.';paused=true;return;}restart(worlds[0].preset,config);});}
    dirty=true;
  }
  function deactivate(){id=null;worlds=[];layer.hidden=true;controls.hidden=true;delete root.dataset.emergence;pauseInput();if(dialog.open)dialog.close();}
  function restart(preset,config){
    if(!id)return;const baseline=worlds[0],change=compare?{...worlds[1].p}:null,matrix=compare?Array.from(worlds[1].matrix):null;
    worlds=[new M.World(id,seed,small,preset||baseline.preset,config||{})];
    // Restart the exact setup, including edited rules, food and barriers.
    if(!preset&&!config)worlds[0]=new M.World(id,seed,small,baseline.preset,baseline.configuration());
    if(compare){worlds.push(worlds[0].clone());if(change)worlds[1].p=change;if(matrix)worlds[1].matrix.set(matrix);}
    selection=null;accum=0;dirty=true;buildMatrix();syncUI();
  }
  function toggleCompare(enabled){
    compare=enabled;
    if(enabled){worlds.push(worlds[0].clone());const [key,value,label]=defs[id].compare;worlds[1].p[key]=value;comparison=label;}else worlds.length=1;
    if(enabled){const [key,value]=defs[id].compare;if(worlds[0].p[key]===value){worlds[1].p[key]=defs[id].defaults[key]!==value?defs[id].defaults[key]:defs[id].rules.find(r=>r[0]===key)[2];comparison='Changed '+defs[id].rules.find(r=>r[0]===key)[1].toLowerCase();}}
    selection=null;buildMatrix();syncUI();
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
  $('em-tool').addEventListener('change',e=>chooseTool(e.target.value));$('em-signals').addEventListener('change',e=>{signals=e.target.checked;dirty=true;});$('em-compare').addEventListener('change',e=>toggleCompare(e.target.checked));
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
    if(w===width&&h===height&&r===dpr)return; width=w;height=h;dpr=r;
    for(const c of [fieldCanvas,surface,fallbackCanvas].filter(Boolean)){c.width=Math.max(1,Math.round(w*r));c.height=Math.max(1,Math.round(h*r));}
    ctx.setTransform(r,0,0,r,0,0);if(gl)gl.viewport(0,0,surface.width,surface.height);dirty=true;
  }
  function rect(index){
    const pane=width/worlds.length,x=index*pane;
    let w=pane-32,h=height-110,left=x+16,top=76;
    if(height<270){top=48;h=height-74;}
    if(id==='lenia'){const side=Math.max(1,Math.min(w,h));left+=(w-side)/2;top+=(h-side)/2;w=h=side;}
    return {x:left,y:top,w:Math.max(1,w),h:Math.max(1,h),left:x,pane};
  }
  function basis(){
    const c=Math.cos(camera.az),s=Math.sin(camera.az),ce=Math.cos(camera.el),se=Math.sin(camera.el);
    return {right:[-s,0,c],up:[-se*c,ce,-se*s],forward:[-ce*c,-se,-ce*s]};
  }
  function project(w,i,r,b){
    if(id!=='boids')return {x:r.x+(.5+(w.x[i]-.5)*camera.zoom)*r.w,y:r.y+(.5+(w.y[i]-.5)*camera.zoom)*r.h,size:1,visible:true};
    const dx=w.x[i]-camera.cx,dy=w.y[i]-camera.cy,dz=w.z[i]-camera.cz;
    const depth=camera.r+dx*b.forward[0]+dy*b.forward[1]+dz*b.forward[2],f=Math.min(r.w,r.h)*1.2/Math.max(.1,depth);
    return {x:r.x+r.w/2+(dx*b.right[0]+dy*b.right[1]+dz*b.right[2])*f,y:r.y+r.h/2-(dx*b.up[0]+dy*b.up[1]+dz*b.up[2])*f,size:f/Math.min(r.w,r.h),visible:depth>.08};
  }
  function worldPos(clientX,clientY){
    const bounds=surface.getBoundingClientRect(),px=clientX-bounds.left,py=clientY-bounds.top,index=M.clamp(Math.floor(px/(width/worlds.length)),0,worlds.length-1),r=rect(index);
    let x=.5+(px-r.x-r.w/2)/r.w/camera.zoom,y=.5+(py-r.y-r.h/2)/r.h/camera.zoom;
    if(id==='boids'){const b=basis(),scale=camera.r/(Math.min(r.w,r.h)*1.2),sx=(px-r.x-r.w/2)*scale,sy=-(py-r.y-r.h/2)*scale;x=camera.cx+sx*b.right[0]+sy*b.up[0];y=camera.cy+sx*b.right[1]+sy*b.up[1];}
    return {x,y,index,px,py,r};
  }
  function intervene(pos,initial){
    if(!id)return;const w=worlds[pos.index];
    if(tool==='inspect'&&id==='boids'){let best=Infinity;const b=basis();for(let i=0;i<w.n;i++){const p=project(w,i,pos.r,b),d=Math.hypot(p.x-pos.px,p.y-pos.py);if(d<best){best=d;w.selected=i;}}}
    else if(tool==='move'){
      if(initial){let best=.08;moveFood=-1;w.food.forEach((f,i)=>{const d=Math.hypot(f.x-pos.x,f.y-pos.y);if(d<best){best=d;moveFood=i;}});}
      if(moveFood>=0){w.food[moveFood].x=M.clamp(pos.x,.02,.98);w.food[moveFood].y=M.clamp(pos.y,.02,.98);}
    }else if(tool==='pull'||tool==='repel')w.pointer={x:pos.x,y:pos.y,sign:tool==='pull'?1:-1};
    else if(initial||['wall','erase','cut','predator'].includes(tool))w.intervene(tool,pos.x,pos.y);
    selection=tool==='inspect'?{index:pos.index,cell:w.selected}:selection;dirty=true;
  }
  surface.addEventListener('pointerdown',e=>{
    if(!id)return;e.preventDefault();surface.focus({preventScroll:true});surface.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>1){const p=[...pointers.values()];pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);return;}
    pointer={id:e.pointerId,x:e.clientX,y:e.clientY,index:worldPos(e.clientX,e.clientY).index};if(tool!=='orbit')intervene(worldPos(e.clientX,e.clientY),true);
  });
  surface.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>1){const p=[...pointers.values()],next=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(pinch>0){if(id==='boids')camera.r=M.clamp(camera.r*pinch/next,.55,2.5);else camera.zoom=M.clamp(camera.zoom*next/pinch,.6,3);}pinch=next;dirty=true;return;}
    if(!pointer||e.pointerId!==pointer.id)return;
    if(tool==='orbit'){camera.az-=(e.clientX-pointer.x)*.006;camera.el=M.clamp(camera.el+(e.clientY-pointer.y)*.006,-1.3,1.3);dirty=true;}
    else intervene(worldPos(e.clientX,e.clientY),false);
    pointer.x=e.clientX;pointer.y=e.clientY;
  });
  function endPointer(e){
    pointers.delete(e.pointerId);try{surface.releasePointerCapture(e.pointerId);}catch(err){}
    if(pointers.size){const [key,p]=[...pointers.entries()][0];pointer={id:key,x:p.x,y:p.y};pinch=0;}else{pointer=null;pinch=0;moveFood=-1;worlds.forEach(w=>w.pointer=null);}
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
    else if(e.key==='+'||e.key==='='||e.key==='-'){e.preventDefault();const scale=e.key==='-'?1.1:.9;if(id==='boids')camera.r=M.clamp(camera.r*scale,.55,2.5);else camera.zoom=M.clamp(camera.zoom/scale,.6,3);dirty=true;}
  });
  for(const key of ['galaxy-hide','galaxy-show'])$(key).addEventListener('click',()=>{if(id)surface.focus({preventScroll:true});});

  function drawField(w,r){
    if(!['ants','physarum','lenia'].includes(id))return;
    const n=w.size;if(fieldImage.width!==n||!fieldPixels){fieldImage.width=fieldImage.height=n;fieldPixels=fieldCtx.createImageData(n,n);}const image=fieldPixels,data=image.data;
    for(let i=0;i<w.field.length;i++){
      let v=w.field[i];
      if(id==='ants')v=1-Math.exp(-v*(signals?.35:.16));
      else if(id==='physarum')v=Math.pow(1-Math.exp(-v*.2),1.25);else if(signals)v=M.clamp(w.potential[i]/.2,0,1);else v=Math.sqrt(v);
      let red,green,blue;if(id==='ants'){red=143;green=179;blue=199;}
      else if(id==='physarum'){red=80+160*v;green=105+123*v;blue=80+94*v;}
      else{red=85+120*v;green=140+84*v;blue=94+68*v;}
      const k=i*4;data[k]=red;data[k+1]=green;data[k+2]=blue;data[k+3]=Math.round(v*(id==='ants'?180:255));
    }
    fieldCtx.putImageData(image,0,0);ctx.save();ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);ctx.clip();ctx.imageSmoothingEnabled=true;
    ctx.drawImage(fieldImage,r.x+r.w*(1-camera.zoom)/2,r.y+r.h*(1-camera.zoom)/2,r.w*camera.zoom,r.h*camera.zoom);ctx.restore();
  }
  function worldPoint(x,y,r){return {x:r.x+(.5+(x-.5)*camera.zoom)*r.w,y:r.y+(.5+(y-.5)*camera.zoom)*r.h};}
  function drawPlaces(w,r,b){
    ctx.font='500 11px "Commit Mono", monospace';ctx.textBaseline='middle';
    if(w.nest){const p=worldPoint(w.nest.x,w.nest.y,r);ctx.fillStyle=bg;ctx.strokeStyle=palette[1];ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,15,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=palette[1];ctx.fillText('HOME',p.x-14,p.y-24);}
    w.food.forEach((f,i)=>{if(f.amount<=0)return;const p=worldPoint(f.x,f.y,r),rad=6+Math.sqrt(f.amount)/5;ctx.fillStyle=palette[0];ctx.beginPath();ctx.arc(p.x,p.y,rad,0,Math.PI*2);ctx.fill();ctx.strokeStyle=palette[0];ctx.globalAlpha=.3;ctx.beginPath();ctx.arc(p.x,p.y,rad+5,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;if(id==='ants'){ctx.fillStyle=palette[0];ctx.fillText(String(Math.ceil(f.amount)),p.x-10,p.y-rad-10);}});
    ctx.fillStyle=getComputedStyle(root).getPropertyValue('--rule-strong').trim()||'#5a675c';
    for(const wall of w.walls){let p=worldPoint(wall.x,wall.y,r),rad=wall.r*Math.min(r.w,r.h)*camera.zoom;if(id==='boids'){const projected=project({x:[wall.x],y:[wall.y],z:[.5]},0,r,b);p=projected;rad=wall.r*Math.min(r.w,r.h)*projected.size;}
      ctx.beginPath();ctx.arc(p.x,p.y,Math.max(3,rad),0,Math.PI*2);ctx.fill();}
    if(w.predator){const p=project({x:[w.predator.x],y:[w.predator.y],z:[.5]},0,r,b);ctx.strokeStyle=palette[3];ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.moveTo(p.x-19,p.y);ctx.lineTo(p.x+19,p.y);ctx.moveTo(p.x,p.y-19);ctx.lineTo(p.x,p.y+19);ctx.stroke();}
  }
  function drawInspection(w,r,b){
    if(w.selected<0&&!signals)return;
    const selected=w.selected<0?Math.min(12,w.n-1):w.selected;
    if(id==='lenia'){if(selected<0)return;const x=(selected%w.size+.5)/w.size,y=((selected/w.size|0)+.5)/w.size,p=worldPoint(x,y,r);ctx.strokeStyle=palette[1];ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,13/w.size*r.w*camera.zoom,0,Math.PI*2);ctx.stroke();ctx.fillStyle=palette[1];ctx.font='11px "Commit Mono",monospace';ctx.fillText('density '+w.field[selected].toFixed(2),Math.min(p.x+16,r.x+r.w-100),Math.max(r.y+14,p.y-17));return;}
    if(selected<0)return;const point=project(w,selected,r,b);ctx.strokeStyle=palette[1];ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(point.x,point.y,9,0,Math.PI*2);ctx.stroke();
    if(id==='ants'||id==='physarum'){
      const look=id==='ants'?.025:w.p.sensor/w.size,angle=id==='ants'?1.1:.65,a=w.a[selected];for(const offset of [-angle,0,angle]){const p=worldPoint(w.x[selected]+Math.cos(a+offset)*look,w.y[selected]+Math.sin(a+offset)*look,r);ctx.beginPath();ctx.moveTo(point.x,point.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.stroke();}
    }else{
      const rad=id==='boids'?.105:id==='fireflies'?w.p.radius:id==='particlelife'?w.p.radius:.045;
      w.grid.build(w);let count=0;w.grid.neighbors(w,selected,rad,j=>{const dx=M.delta(w.x[j]-w.x[selected]),dy=M.delta(w.y[j]-w.y[selected]),dz=id==='boids'?w.z[j]-w.z[selected]:0;if(dx*dx+dy*dy+dz*dz>rad*rad||count++>28)return;const p=project(w,j,r,b);ctx.globalAlpha=.25;ctx.beginPath();ctx.moveTo(point.x,point.y);ctx.lineTo(p.x,p.y);ctx.stroke();});ctx.globalAlpha=1;
      if(id!=='boids'){ctx.globalAlpha=.3;ctx.beginPath();ctx.ellipse(point.x,point.y,rad*r.w*camera.zoom,rad*r.h*camera.zoom,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    }
  }
  function draw(){
    if(!width||!height)return;ctx.clearRect(0,0,width,height);ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
    // A quiet reference grid makes the scale and local sensing legible.
    ctx.strokeStyle='rgba(158,199,154,.022)';ctx.lineWidth=1;for(let x=20;x<width;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}for(let y=20;y<height;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
    const max=worlds.reduce((n,w)=>n+w.n,0);if(!points||points.length<max*9)points=new Float32Array(max*9);pointCount=0;const b=basis();
    worlds.forEach((w,index)=>{
      const r=rect(index);ctx.save();ctx.beginPath();ctx.rect(r.left,0,r.pane,height);ctx.clip();drawField(w,r);drawPlaces(w,r,b);drawInspection(w,r,b);
      const count=id==='crowds'?Math.round(w.n*w.p.density):w.n;
      for(let i=0;i<count;i++){
        const p=project(w,i,r,b);if(!p.visible||p.x<r.left||p.x>r.left+r.pane||p.y<0||p.y>height)continue;
        let size=4,angle=w.a[i],color=rgb[w.species[i]],alpha=.85,kind=0;
        if(id==='boids'){size=M.clamp(7*p.size,2.2,10);angle=Math.atan2(-(w.vx[i]*b.up[0]+w.vy[i]*b.up[1]+w.vz[i]*b.up[2]),w.vx[i]*b.right[0]+w.vy[i]*b.right[1]+w.vz[i]*b.right[2]);color=rgb[i%3];kind=2;}
        if(id==='ants'){size=small?6:7.5;kind=1;color=rgb[w.carry[i]?1:2];alpha=w.carry[i]?1:.8;}
        if(id==='physarum'){size=1.6;alpha=signals?.8:.14;color=rgb[1];}
        if(id==='fireflies'){const light=w.light[i];size=8+light*24;alpha=.28+light*.72;kind=4;color=signals?rgb[Math.floor(w.phase[i]/(Math.PI*2)*4)%4]:rgb[1];}
        if(id==='particlelife'){size=4.5;alpha=.95;}
        if(id==='crowds'){size=small?9:11;kind=3;color=rgb[w.species[i]?2:1];angle=Math.atan2(w.vy[i],w.vx[i])-Math.PI/2;}
        const k=pointCount*9;points[k]=p.x;points[k+1]=p.y;points[k+2]=size;points[k+3]=angle;points.set(color,k+4);points[k+7]=alpha;points[k+8]=kind;pointCount++;
      }
      ctx.restore();
    });
    if(compare){ctx.strokeStyle='#4a544b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(width/2,0);ctx.lineTo(width/2,height);ctx.stroke();}
    if(gl){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);gl.uniform2f(gl.getUniformLocation(program,'resolution'),width,height);gl.uniform1f(gl.getUniformLocation(program,'ratio'),dpr);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,points.subarray(0,pointCount*9),gl.DYNAMIC_DRAW);gl.drawArrays(gl.POINTS,0,pointCount);}
    else{
      const fc=fallbackCanvas.getContext('2d');fc.setTransform(dpr,0,0,dpr,0,0);fc.clearRect(0,0,width,height);
      for(let i=0;i<pointCount;i++){const k=i*9,x=points[k],y=points[k+1],s=points[k+2];fc.fillStyle='rgba('+Math.round(points[k+4]*255)+','+Math.round(points[k+5]*255)+','+Math.round(points[k+6]*255)+','+points[k+7]+')';fc.beginPath();fc.arc(x,y,s/2,0,Math.PI*2);fc.fill();}
    }
    dirty=false;
  }
  function updateMetrics(){
    metrics.replaceChildren();worlds.forEach((w,index)=>{const group=document.createElement('div');const name=document.createElement('strong');name.textContent=compare?(index?'Changed rules':'Original rules'):(paused?'Paused':w.metric()[0]);const detail=document.createElement('span');detail.textContent=compare?w.metric()[0]:w.metric()[1];group.append(name,detail);
      if(w.selected>=0){const lens=document.createElement('span'),i=w.selected;
        lens.textContent=id==='ants'?(w.carry[i]?'Carrying food home':'Searching for food')+' · scent '+w.sample(w.x[i],w.y[i]).toFixed(1):id==='physarum'?'Signal '+w.sample(w.x[i],w.y[i]).toFixed(1):id==='fireflies'?'Phase '+Math.round(w.phase[i]/(Math.PI*2)*100)+'%':id==='lenia'?'Cell density '+w.field[i].toFixed(2):'Following individual '+(i+1);
        group.appendChild(lens);
      }metrics.appendChild(group);});
  }
  function tick(dt){
    if(!id)return;resize();metricClock+=dt;
    // The modal remains interactive while worlds keep their fixed-step clock.
    if(!paused){
      const step=id==='lenia'?1/15:1/30;accum=Math.min(accum+dt,step*2);let advanced=false;
      while(accum>=step){worlds.forEach(w=>w.step(step));accum-=step;advanced=true;}
      if(advanced)dirty=true;
      if(id==='boids'&&!pointer){camera.az+=dt*.12;dirty=true;}
      if(id==='boids'){const w=selection?worlds[selection.index]:null,i=w?w.selected:-1,k=1-Math.exp(-dt*3);camera.cx+=((i>=0?w.x[i]:.5)-camera.cx)*k;camera.cy+=((i>=0?w.y[i]:.5)-camera.cy)*k;camera.cz+=((i>=0?w.z[i]:.5)-camera.cz)*k;}
    }
    if(dirty){draw();if(metricClock>.25){updateMetrics();metricClock=0;}}
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
    window.GXPicker?.init(root,{pathfinding:'bfs',sorting:'quick',emergence:pendingConfig?.id||'boids',space:'saturn',randomness:'mulberry',attractors:'lorenz',fractals:'sierpinski',numbers:'collatz',geometry:'hopf'});choose(pendingConfig?.id||'boids');
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
  window.GXEmergence={is:id=>Object.hasOwn(defs,id),activate:(next)=>{const config=pendingConfig?.id===next?pendingConfig:null;pendingConfig=null;activate(next,config);if(config?.view)for(const k of ['az','el','r','zoom'])if(Number.isFinite(config.view[k]))camera[k]=M.clamp(config.view[k],k==='el'?-1.3:k==='az'?-100:.55,k==='el'?1.3:k==='az'?100:3);},deactivate,tick,pauseInput,hint,
    fallback,
    get active(){return id!==null;},get linkedScene(){return pendingConfig?.id||null;},about:()=>id?defs[id].about:'',
    snapshot:()=>({id,paused,compare,tool,signals,seed,camera:{...camera},worlds:worlds.map(w=>({steps:w.steps,time:w.time,p:{...w.p},metric:w.metric(),food:w.food.map(f=>({...f})),walls:w.walls.length,selected:w.selected,mass:w.id==='lenia'?w.field.reduce((a,b)=>a+b,0):null,finite:w.x.every(Number.isFinite)&&w.y.every(Number.isFinite)&&w.field.every(Number.isFinite)}))})};
})();
