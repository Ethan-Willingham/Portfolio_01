/* Small scene catalog. Unaccepted machines are available only with ?lab=1. */
(function () {
  'use strict';
  var entries = [
    {id:'water-balloons',capability:'Water slimes',title:'Water balloons',cue:'Drag, fling, then pop the skin.',preview:'water-balloon',accepted:true,world:{w:720,h:400},pool:false},
    {id:'thermoscope',capability:'Fire',title:"Galileo's thermoscope",cue:'Warm the bulb. Watch the water fall.',preview:'thermoscope',accepted:true,world:{w:720,h:400},pool:false},
    {id:'douse-fire',capability:'Fire',title:'Put out the fire',cue:'Pour water onto the glowing plume.',preview:'fire',accepted:true,world:{w:720,h:400},pool:false},
    {id:'self-flushing-cup',title:'Self-flushing cup',cue:'Open or close the tap.',preview:'cup',accepted:true,world:{w:720,h:400},pool:true},
    {id:'tantalus',title:'Tantalus',cue:'Watch the fixed mouth line.',preview:'tantalus',accepted:true,world:{w:720,h:400},pool:true},
    {id:'roman-inverted-siphon',title:'Roman inverted siphon',cue:'Close or open the intake.',preview:'inverted-siphon',accepted:true,world:{w:720,h:400},pool:false},
    {id:'thumb-straw',title:'The straw and the thumb',cue:'Hold the top, then release.',preview:'straw',accepted:true,world:{w:720,h:400},pool:false},
    {id:'smoke-ring-cannon',capability:'Smoke',title:'The smoke-ring cannon',cue:'Tap the back. Catch the swirl with a slime.',preview:'smoke-cannon',accepted:true,world:{w:720,h:400},pool:false},
    {id:'smoke-wind-tunnel',capability:'Smoke',title:'The slime wind tunnel',cue:'Stop the fan. Watch the wake change.',preview:'smoke-tunnel',accepted:true,world:{w:720,h:400},pool:false},
    {id:'burst-disk',title:'The burst disk',cue:'Compare two membrane strengths.',preview:'burst-disk',accepted:true,world:{w:720,h:400},pool:false}
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
    if(id==='douse-fire')await script('/js/wss-fire.js');
    if(id==='smoke-ring-cannon')await script('/js/wss-smoke-cannon.js');
    if(id==='smoke-wind-tunnel'){await script('/js/wss-smoke-cannon.js');await script('/js/wss-smoke-wind-tunnel.js');}
    if(id==='water-balloons')await script('/js/wss-water-balloons.js');
    if(id==='burst-disk')await script('/js/wss-burst-disk.js');
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
    if(kind==='thermoscope'){
      path('M27 6h21v13H27ZM33 19v24M42 19v24M15 29v19h44V29','toy-preview-glass');
      path('M16 36h17v-4h9v4h16v11H16Z','toy-preview-water');
      path('M32 14h11','toy-preview-mouth');
    }else if(kind==='water-balloon'){
      path('M36 6c-15 0-23 15-18 27 5 15 30 15 36 0C59 21 51 6 36 6Z','toy-preview-glass');
      path('M17 26h39c-1 25-38 25-39 0Z','toy-preview-water');
    }else if(kind==='fire'){
      path('M25 43h23v-4H25Z','toy-preview-glass');
      path('M28 37c-5-8 10-14 5-25 14 10 20 23 8 25Z','toy-preview-slime');
      path('M12 7h10v4H12M17 13v15','toy-preview-stream');
    }else if(kind==='smoke-cannon'){
      path('M7 16h22v6M7 36h22v-6M7 16v20','toy-preview-glass');
      path('M34 23c-5-8 8-10 8-3s-8 6-5 1M34 31c-5 8 8 10 8 3s-8-6-5-1','toy-preview-stream');
      path('M52 19c-9 0-9 15 0 15s11-15 0-15Z','toy-preview-slime');
    }else if(kind==='smoke-tunnel'){
      path('M8 13h57M8 39h57M8 16v20M30 13v8','toy-preview-glass');
      path('M11 23h10M11 30h10M40 24c10-9 17 8 25-2M40 31c10 9 17-8 25 2','toy-preview-stream');
      path('M31 21c-9 0-9 15 0 15s11-15 0-15Z','toy-preview-slime');
    }else if(kind==='inverted-siphon'){
      path('M5 8v20h16V8M53 21v21h15V21M15 25h12v19h19V33h13','toy-preview-glass');
      path('M6 12h14v15H6ZM54 33h13v8H54Z','toy-preview-water');
      path('M16 25h11v19h19V33h14','toy-preview-stream');
    }else if(kind==='burst-disk'){
      path('M10 8v27h18V8M27 23h27v8H27','toy-preview-glass');
      path('M11 14h15v20H11Z M27 24h16v6H27Z','toy-preview-water');
      path('M44 23v8','toy-preview-mouth');
      path('M55 32v7','toy-preview-stream');
    }else if(kind==='straw'){
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
    ['Fire','Smoke'].forEach(function(group){var choices=entries.filter(function(e){return e.accepted && e.capability===group;});if(choices.length){heading(group);choices.forEach(machine);}});
    heading('Earlier water machines');entries.filter(function(e){return e.accepted && !e.capability;}).forEach(machine);
    var workshop=window.WSSMachineRegistry.list().filter(function(e){return !e.accepted;});
    if(workshop.length){heading('Workshop');workshop.forEach(machine);}
    heading('Original scenes');originals.forEach(function(button){list.appendChild(button);});
  }
})();
