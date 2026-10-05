(function(root){
 'use strict';const O=root.OneShift;
 O.bindInput=function(app){const canvas=app.renderer.canvas,ui=app.ui,pointers=new Map();let drag=null,pinch=null,longPress=0;
  const point=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  const cancel=()=>{ui.selected=[];ui.target=null;ui.build=null;ui.box=null;ui.selectionKey='';ui.update();};
  const click=(x,y,shift=false)=>{const hit=app.renderer.hit(x,y),pos=app.renderer.world(x,y),s=app.sim.s;if(ui.build){ui.issue({type:'build',kind:ui.build,x:Math.floor(pos.x),y:Math.floor(pos.y),zone:ui.zoneType});return;}
   if(ui.target?.kind==='parcel'&&hit?.kind==='truck'){ui.issue({type:'loadParcel',parcel:ui.target.id,truck:hit.id});ui.target=null;ui.update();return;}
   if(ui.selected.length){
    if(hit?.kind==='rack'){ui.target=hit;ui.selectionKey='';ui.update();return;}
    if(hit?.kind==='pallet'){if(shift){if(!ui.selected.includes(hit.id))ui.selected.push(hit.id);ui.update();return;}if(ui.selected.includes(hit.id)){ui.select(hit);return;}ui.select(hit);return;}
    const destination=hit?.kind==='truck'?{truck:hit.id}:{x:Math.floor(pos.x),y:Math.floor(pos.y),level:0,place:'storage'};
    // Painted receiving/shipping strips accept a batch, nearest free position first.
    const b=s.map.building;if(!destination.truck&&pos.y>=b.y+b.h-5&&pos.y<b.y+b.h-1){if(pos.x>=b.x+3&&pos.x<b.x+9)destination.lane='receiving';if(pos.x>=b.x+b.w-10&&pos.x<b.x+b.w-4)destination.lane='shipping';}
    let moved=0;for(const id of ui.selected){const dest={...destination};if(ui.selected.length>1&&!dest.truck&&!dest.lane){const p=app.sim.p.get(id),spot=app.sim.spot(p);if(!spot)break;Object.assign(dest,spot);}if(ui.issue({type:'move',pallet:id,dest}).ok)moved++;}
    if(moved&&!shift){ui.selected=[];ui.target=null;ui.selectionKey='';}ui.update();return;
   }
   if(hit)ui.select(hit);else{ui.cursor={x:Math.floor(pos.x),y:Math.floor(pos.y)};ui.issue({type:'walk',x:ui.cursor.x,y:ui.cursor.y});}
  };
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();cancel();});
  canvas.addEventListener('pointerdown',e=>{app.audio.unlock();if(app.rotated||app.hubPause||app.menuPause)return;canvas.focus({preventScroll:true});const p=point(e);pointers.set(e.pointerId,p);canvas.setPointerCapture(e.pointerId);clearTimeout(longPress);
   if(pointers.size===2){const a=[...pointers.values()];pinch={distance:Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y),zoom:app.renderer.camera.zoom,mid:{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2},camera:{...app.renderer.camera}};drag=null;ui.box=null;return;}
   drag={x:p.x,y:p.y,lastX:p.x,lastY:p.y,world:app.renderer.world(p.x,p.y),button:e.button,type:e.pointerType,time:performance.now(),moved:false};if(e.pointerType==='touch')longPress=setTimeout(()=>{cancel();drag=null;},650);
  });
  canvas.addEventListener('pointermove',e=>{const p=point(e);if(pointers.has(e.pointerId))pointers.set(e.pointerId,p);
   if(pinch&&pointers.size===2){const a=[...pointers.values()],distance=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y),mid={x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2};app.renderer.camera.zoom=Math.max(9,Math.min(64,pinch.zoom*distance/pinch.distance));app.renderer.camera.x=pinch.camera.x-(mid.x-pinch.mid.x)/app.renderer.camera.zoom;app.renderer.camera.y=pinch.camera.y-(mid.y-pinch.mid.y)/app.renderer.camera.zoom;return;}
   if(drag){if(Math.hypot(p.x-drag.x,p.y-drag.y)>7){drag.moved=true;clearTimeout(longPress);}if(drag.moved){if(drag.button===1||drag.type==='touch'){app.renderer.camera.x-=(p.x-drag.lastX)/app.renderer.camera.zoom;app.renderer.camera.y-=(p.y-drag.lastY)/app.renderer.camera.zoom;}else{const q=app.renderer.world(p.x,p.y);ui.box={x:Math.min(drag.world.x,q.x),y:Math.min(drag.world.y,q.y),w:Math.abs(q.x-drag.world.x),h:Math.abs(q.y-drag.world.y)};}}drag.lastX=p.x;drag.lastY=p.y;}
   else{ui.hover=app.renderer.hit(p.x,p.y);canvas.style.cursor=ui.hover||ui.selected.length?'pointer':'default';if(ui.build)ui.cursor={x:Math.floor(app.renderer.world(p.x,p.y).x),y:Math.floor(app.renderer.world(p.x,p.y).y)};}
  });
  function release(e,cancelled=false){clearTimeout(longPress);const p=point(e);pointers.delete(e.pointerId);if(pinch){if(!pointers.size)pinch=null;drag=null;return;}if(!cancelled&&drag){if(ui.box){const b=ui.box;ui.selected=app.sim.s.pallets.filter(p=>['lane','storage'].includes(p.place)&&!p.reservedBy&&p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h).map(p=>p.id);ui.target={kind:'batch'};ui.selectionKey='';}else if(!drag.moved&&drag.button===0)click(p.x,p.y,e.shiftKey);}drag=null;ui.box=null;ui.update();}
  canvas.addEventListener('pointerup',e=>release(e,app.rotated||app.hubPause||app.menuPause));canvas.addEventListener('pointercancel',e=>release(e,true));canvas.addEventListener('lostpointercapture',e=>{pointers.delete(e.pointerId);if(!pointers.size){drag=null;pinch=null;ui.box=null;}});
  canvas.addEventListener('wheel',e=>{e.preventDefault();const p=point(e),before=app.renderer.world(p.x,p.y);app.renderer.camera.zoom=Math.max(9,Math.min(64,app.renderer.camera.zoom*Math.exp(-e.deltaY*.0015)));const after=app.renderer.world(p.x,p.y);app.renderer.camera.x+=before.x-after.x;app.renderer.camera.y+=before.y-after.y;},{passive:false});
  document.addEventListener('keydown',e=>{const bindings=ui.settings.keys,key=e.key.toLowerCase(),is=action=>key===String(bindings[action]).toLowerCase();if(app.rotated||e.target.matches('input,select,textarea'))return;
   if(app.hubPause){if(is('cancel')){e.preventDefault();ui.closeHub();canvas.focus();}return;}if(app.menuPause)return;if(is('menu')){e.preventDefault();ui.settingsMenu();return;}
   if(e.target.closest('button,a,summary')&&(e.key==='Enter'||e.key===' '))return;
   if(is('pause')){e.preventDefault();app.paused=!app.paused;ui.update();return;}if(is('cancel')){e.preventDefault();cancel();canvas.focus();return;}if(is('home')){app.renderer.home(app.sim.s);return;}if(is('build')&&app.sim.s.day>=4){ui.openHub('build');return;}
   const actions=[...document.querySelectorAll('#shift-selection [data-action]:not(.close):not(:disabled)')];if(is('panel')){e.preventDefault();actions[0]?.focus();return;}for(let i=1;i<=3;i++)if(is('action'+i)){e.preventDefault();actions[i-1]?.click();return;}
   if(is('nextObject')&&e.target===canvas){e.preventDefault();ui.cursor=null;const list=app.renderer.hits;if(!list.length)return;const index=list.findIndex(h=>h.id===ui.target?.id&&h.kind===ui.target?.kind);ui.select(list[(index+(e.shiftKey?-1:1)+list.length)%list.length]);return;}
   if(['cursorUp','cursorDown','cursorLeft','cursorRight'].some(is)){e.preventDefault();ui.cursor=ui.cursor||{x:17,y:20};ui.cursor.x+=is('cursorRight')?1:is('cursorLeft')?-1:0;ui.cursor.y+=is('cursorDown')?1:is('cursorUp')?-1:0;ui.cursor.x=Math.max(0,Math.min(app.sim.s.map.w-1,ui.cursor.x));ui.cursor.y=Math.max(0,Math.min(app.sim.s.map.h-1,ui.cursor.y));return;}
   if(is('interact')){e.preventDefault();if(ui.cursor){const p=app.renderer.screen(ui.cursor.x+.5,ui.cursor.y+.5);click(p.x,p.y,e.shiftKey);}else actions[0]?.click();return;}
   for(const [k,dx,dy]of [['panUp',0,-1],['panDown',0,1],['panLeft',-1,0],['panRight',1,0]])if(is(k)){e.preventDefault();app.renderer.camera.x+=dx;app.renderer.camera.y+=dy;return;}
   if(is('zoomIn')||is('zoomOut')){e.preventDefault();app.renderer.camera.zoom=Math.max(9,Math.min(64,app.renderer.camera.zoom*(is('zoomIn')?1.3:1/1.3)));}
  });

  document.addEventListener('click',e=>{const node=e.target.closest('button');if(!node)return;app.audio.unlock();if(node.dataset.action)ui.action(node);else if(node.dataset.hub)ui.openHub(node.dataset.hub);else if(node.dataset.speed){app.speed=Number(node.dataset.speed);app.paused=false;document.querySelectorAll('[data-speed]').forEach(b=>b.setAttribute('aria-pressed',String(b===node)));ui.update();}else if(node.id==='shift-pause'){app.paused=!app.paused;ui.update();}else if(node.id==='shift-menu')ui.settingsMenu();else if(node.id==='shift-home')app.renderer.home(app.sim.s);else if(node.id==='shift-zoom-in')app.renderer.camera.zoom=Math.min(64,app.renderer.camera.zoom*1.3);else if(node.id==='shift-zoom-out')app.renderer.camera.zoom=Math.max(9,app.renderer.camera.zoom/1.3);});
  document.addEventListener('dragstart',e=>{const task=e.target.closest('[data-task]');if(task)e.dataTransfer.setData('text/plain',task.dataset.task);});document.addEventListener('dragover',e=>{if(e.target.closest('[data-worker]'))e.preventDefault();});document.addEventListener('drop',e=>{const worker=e.target.closest('[data-worker]');if(!worker)return;e.preventDefault();ui.issue({type:'assignTask',task:Number(e.dataTransfer.getData('text/plain')),worker:Number(worker.dataset.worker)});ui.renderHub();});
  document.addEventListener('change',async e=>{const node=e.target;if(node.dataset.setting){ui.settings[node.dataset.setting]=node.type==='checkbox'?node.checked:Number(node.value);O.saves.savePreferences(ui.settings);app.audio.setVolume(ui.settings.volume);document.documentElement.style.fontSize=(ui.settings.scale*16)+'px';}if(node.dataset.key){ui.settings.keys[node.dataset.key]=node.value;O.saves.savePreferences(ui.settings);}if(node.id==='shift-import'&&node.files[0]){try{const s=O.saves.decode(await node.files[0].text());app.sim.restore(s);ui.target=null;ui.selected=[];ui.lastPhase='shift';ui.action({dataset:{action:'menu-close'}});app.renderer.home(s);ui.update();}catch(error){ui.toast(error.message,true);}}});
  document.getElementById('shift-settings').addEventListener('cancel',()=>{app.menuPause=false;});
  const suspend=()=>{pointers.clear();drag=null;pinch=null;clearTimeout(longPress);ui.box=null;};window.addEventListener('blur',suspend);
  return {click,cancel,suspend};
 };
})(window);
