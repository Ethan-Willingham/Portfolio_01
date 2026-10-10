/* Small scene catalog. Unaccepted machines are available only with ?lab=1. */
(function () {
  'use strict';
  var entries = [
    {id:'self-flushing-cup',title:'Self-flushing cup',accepted:false,world:{w:720,h:400},pool:true},
    {id:'tantalus',title:'Tantalus',accepted:false,world:{w:720,h:400},pool:true},
    {id:'thumb-straw',title:'The straw and the thumb',accepted:true,world:{w:720,h:400},pool:false}
  ];
  var lab = new URLSearchParams(location.search).get('lab') === '1';
  var loaded = {};
  function lookup(id) {
    return entries.find(function(e){return e.id===id && (e.accepted || lab);}) || null;
  }
  function script(url) {
    if (loaded[url]) return loaded[url];
    loaded[url] = new Promise(function(resolve,reject){
      var element=document.createElement('script');
      element.src=url+'?v='+encodeURIComponent(window.__toy.version);
      element.onload=resolve;
      element.onerror=function(){reject(new Error('Could not load this machine.'));};
      document.head.appendChild(element);
    });
    return loaded[url];
  }
  async function load(id) {
    var entry=lookup(id);
    if(!entry)throw new Error('This machine is not available.');
    await script('/js/wss-boundaries.js');
    await script('/js/wss-hands.js');
    await script('/js/wss-native.js');
    await script('/js/wss-sound.js');
    if(id==='tantalus')await script('/js/wss-machines/self-flushing-cup.js');
    await script('/js/wss-machines/'+id+'.js');
    var module=window.WSSMachines && window.WSSMachines[id];
    if(!module || typeof module.make!=='function')throw new Error('This machine did not start.');
    return module;
  }
  window.WSSMachineRegistry={lookup:lookup,load:load,list:function(){return entries.filter(function(e){return e.accepted || lab;});},lab:lab};
  var list=document.getElementById('toy-scene-list');
  if(list && (lab || entries.some(function(e){return e.accepted;}))){
    var heading=document.createElement('p');
    heading.textContent=lab ? 'Machine workshop' : 'Water machines';
    list.prepend(heading);
    window.WSSMachineRegistry.list().slice().reverse().forEach(function(e){
      var button=document.createElement('button');
      button.className='toy-chip';button.dataset.scene=e.id;
      button.setAttribute('aria-pressed','false');
      button.textContent=e.title;
      heading.after(button);
    });
  }
})();
