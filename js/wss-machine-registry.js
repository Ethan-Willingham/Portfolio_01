/* Small scene catalog. Unaccepted machines are available only with ?lab=1. */
(function () {
  'use strict';
  var entries = [
    {id:'self-flushing-cup',title:'Self-flushing cup',cue:'Open or close the tap.',preview:'cup',accepted:true,world:{w:720,h:400},pool:true},
    {id:'tantalus',title:'Tantalus',cue:'Watch the fixed mouth line.',preview:'tantalus',accepted:true,world:{w:720,h:400},pool:true},
    {id:'thumb-straw',title:'The straw and the thumb',cue:'Hold the top, then release.',preview:'straw',accepted:true,world:{w:720,h:400},pool:false}
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
  // Static apparatus sketches identify scenes, not snapshots of the solver.
  function preview(kind) {
    var ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 72 52');
    svg.setAttribute('class','toy-scene-preview');
    svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    function path(d,style) {
      var shape=document.createElementNS(ns,'path');
      shape.setAttribute('d',d);shape.setAttribute('class',style);svg.appendChild(shape);
    }
    path('M3 43v6h66v-6','toy-preview-glass');
    path('M4 45h64v3H4Z','toy-preview-water');
    if(kind==='straw'){
      path('M31 9v24M42 9v24','toy-preview-glass');
      path('M33 15h7v17h-7Z','toy-preview-water');
      path('M36 35v5','toy-preview-stream');
      path('M28 9c0-4 3-6 7-5l8 2c3 1 4 3 3 5','toy-preview-hand');
    }else{
      path('M9 11v25h38V20M42 32V13h14v29M46 32V17h6v25M18 4h7v6','toy-preview-glass');
      path('M10 25h31v8h5v2H10Z','toy-preview-water');
      path('M25 13v7','toy-preview-stream');
      if(kind==='tantalus'){
        path('M11 22c-2-8 9-11 14-5 3 6-4 12-11 10-3 0-5-2-3-5Z','toy-preview-slime');
        path('M27 18h9','toy-preview-mouth');
      }
    }
    return svg;
  }
  var list=document.getElementById('toy-scene-list');
  if(list && (lab || entries.some(function(e){return e.accepted;}))){
    // Move the existing controls intact so their state and handlers survive.
    var originals=Array.from(list.querySelectorAll('[data-scene]'));
    Array.from(list.querySelectorAll('p')).forEach(function(p){p.remove();});
    function heading(label) {
      var p=document.createElement('p');p.textContent=label;list.appendChild(p);
    }
    function machine(e) {
      var button=document.createElement('button');
      button.className='toy-chip toy-machine-choice';button.dataset.scene=e.id;
      button.setAttribute('aria-pressed','false');
      button.appendChild(preview(e.preview));
      var copy=document.createElement('span');copy.className='toy-scene-copy';
      var name=document.createElement('span');name.className='toy-scene-name';name.textContent=e.title;
      var cue=document.createElement('span');cue.className='toy-scene-cue';cue.textContent=e.cue;
      copy.appendChild(name);copy.appendChild(cue);button.appendChild(copy);list.appendChild(button);
    }
    heading('Water machines');entries.filter(function(e){return e.accepted;}).forEach(machine);
    var workshop=window.WSSMachineRegistry.list().filter(function(e){return !e.accepted;});
    if(workshop.length){heading('Workshop');workshop.forEach(machine);}
    heading('Original scenes');originals.forEach(function(button){list.appendChild(button);});
  }
})();
