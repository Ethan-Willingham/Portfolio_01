(function(root){
 'use strict';const O=root.OneShift;
 // Scene targets own selection. There is no map camera or floor cursor.
 O.bindInput=function(app){const ui=app.ui;
  const cancel=()=>{app.scenes?.select?.(null);ui.selected=[];ui.target=null;ui.update();};
  document.addEventListener('keydown',e=>{
   if(app.receivingPause||app.rotated||e.target.matches('input,select,textarea'))return;
   const key=e.key.toLowerCase(),is=action=>key===String(ui.settings.keys[action]).toLowerCase();
   if(app.hubPause){if(is('cancel')){e.preventDefault();ui.closeHub();app.scenes.element.focus();}return;}
   if(app.menuPause)return;
   if(is('menu')){e.preventDefault();ui.settingsMenu();return;}
   if(e.target.closest('button,a,summary')&&(e.key==='Enter'||e.key===' '))return;
   if(is('pause')){e.preventDefault();app.paused=!app.paused;ui.update();}
   else if(is('cancel')){e.preventDefault();cancel();}
  });
  document.addEventListener('click',e=>{
   const node=e.target.closest('button');if(!node||app.rotated)return;app.audio.unlock();
   if(node.dataset.action)ui.action(node);
   else if(node.dataset.hub)ui.openHub(node.dataset.hub);
   else if(node.dataset.speed){app.speed=Number(node.dataset.speed);app.paused=false;document.querySelectorAll('[data-speed]').forEach(b=>b.setAttribute('aria-pressed',String(b===node)));ui.update();}
   else if(node.id==='shift-pause'){app.paused=!app.paused;ui.update();}
   else if(node.id==='shift-menu')ui.settingsMenu();
  });
  document.addEventListener('change',async e=>{
   const node=e.target;
   if(node.dataset.setting){ui.settings[node.dataset.setting]=node.type==='checkbox'?node.checked:Number(node.value);O.saves.savePreferences(ui.settings);app.audio.setVolume(ui.settings.volume);document.documentElement.style.fontSize=(ui.settings.scale*16)+'px';app.scenes.resize();}
   if(node.dataset.key){ui.settings.keys[node.dataset.key]=node.value;O.saves.savePreferences(ui.settings);}
   if(node.id==='shift-queue-worker')ui.queueWorker=Number(node.value);
   if(node.id==='shift-import'&&node.files[0]){try{app.sim.restore(O.saves.decode(await node.files[0].text()));ui.target=null;ui.selected=[];ui.lastPhase='shift';ui.action({dataset:{action:'menu-close'}});app.scenes.open('storage');ui.update();}catch(error){ui.toast(error.message,true);}}
  });
  document.getElementById('shift-settings').addEventListener('cancel',()=>{app.menuPause=false;});
  const suspend=()=>{app.scenes?.suspend();};window.addEventListener('blur',suspend);
  return {cancel,suspend};
 };
})(window);
