(function () {
  'use strict';
  var callbacks, selected = 'receive', current = null, completionShown = '', lastStep = '';
  var catalog = [
    {id:'receive',number:'01',title:'Receive & put away',time:'4 to 6 minutes',tag:'Inbound',
      description:'A supplier delivery is waiting at receiving. Check it against its purchase order, then give every carton a home.',
      steps:['Match the purchase order','Receive two labelled cartons','Transfer them into storage'],
      result:'Two cartons received and available in their recorded storage bins.',document:'PO-1001',start:'Receiving / REC-02',diagram:'receive'},
    {id:'transfer',number:'02',title:'Move stock accurately',time:'2 to 4 minutes',tag:'Inventory',
      description:'Move one carton between two rack locations. The scanner connects what you carry to what the warehouse records.',
      steps:['Scan the source bin and carton','Carry it to the highlighted destination','Confirm the new location'],
      result:'The same carton in its new bin, with a recorded stock movement.',document:'One carton / two bins',start:'Storage / Row C',diagram:'transfer'},
    {id:'pick-ship',number:'03',title:'Pick, stage & ship',time:'5 to 8 minutes',tag:'Outbound',
      description:'A customer order is ready to pick. Follow its allocation from the rack to staging, then load the collection van.',
      steps:['Pick the allocated carton','Stage and verify the order','Load the van and confirm shipment'],
      result:'One completed sales order, an exact shipment and an auditable stock record.',document:'SO-2001',start:'Storage / Row C',diagram:'ship'}
  ];
  function el(id) { return document.getElementById('warehouse-' + id); }
  function text(node,value) { value=String(value==null?'':value);if(node.textContent!==value)node.textContent=value; }
  function find(id) { return catalog.find(function(item){return item.id===id;}) || catalog[0]; }
  function node(tag,value,className) { var n=document.createElement(tag);if(value)n.textContent=value;if(className)n.className=className;return n; }
  function select(id,focus) {
    selected=find(id).id;var item=find(selected);
    document.querySelectorAll('[data-demo-select]').forEach(function(button){var active=button.dataset.demoSelect===selected;button.setAttribute('aria-pressed',String(active));});
    text(el('demo-number'),item.number+' / '+item.tag);text(el('demo-title'),item.title);text(el('demo-description'),item.description);
    text(el('demo-duration'),item.time);text(el('demo-document'),item.document);text(el('demo-start-location'),item.start);text(el('demo-result'),item.result);
    el('demo-outline').replaceChildren();item.steps.forEach(function(step){el('demo-outline').appendChild(node('li',step));});
    el('demo-diagram').dataset.flow=item.diagram;
    ['Supplier','Receiving','Storage'].forEach(function(label,index){text(el('demo-flow-'+index),item.id==='transfer'?['Source bin','Carton','Destination bin'][index]:item.id==='pick-ship'?['Pick face','Staging','Collection van'][index]:label);});
    text(el('demo-launch'),'Start '+(item.id==='receive'?'receiving':item.id==='transfer'?'transfer':'shipping')+' walkthrough');
    if(focus)el('demo-launch').focus({preventScroll:true});
  }
  function showGallery(id) {
    if(id)select(id,false);el('demo-gallery').hidden=false;
    el('launcher').classList.add('has-demo-gallery');
    el('demo-gallery-title').focus({preventScroll:true});
  }
  function hideGallery() { el('demo-gallery').hidden=true;el('launcher').classList.remove('has-demo-gallery'); }
  function help() {
    var item=find(current?current.id:selected);
    text(el('demo-help-title'),item.title);text(el('demo-help-current'),current?current.instruction:item.description);
    el('demo-help-outline').replaceChildren();item.steps.forEach(function(step){el('demo-help-outline').appendChild(node('li',step));});
    callbacks.menu('demo-help');
  }
  function init(options) {
    callbacks=options;
    var gallery=node('section',null,'warehouse-demo-gallery');gallery.id='warehouse-demo-gallery';gallery.hidden=true;
    gallery.setAttribute('aria-labelledby','warehouse-demo-gallery-title');
    gallery.innerHTML='<header class="warehouse-demo-gallery-top"><span>LATCHFORD / CUSTOMER DEMONSTRATIONS</span><button id="warehouse-demo-back" type="button">Back to title</button></header>'+
      '<div class="warehouse-demo-heading"><p class="warehouse-kicker">Hands-on walkthroughs</p><h2 id="warehouse-demo-gallery-title" tabindex="-1">A warehouse that shows its work.</h2><p>Try the scanner. Move the stock. See the record change. <br>Choose a guided scenario with everything prepared for you.</p></div>'+
      '<div class="warehouse-demo-selection"><nav id="warehouse-demo-courses" aria-label="Choose a demonstration"></nav><article class="warehouse-demo-brief" aria-labelledby="warehouse-demo-title">'+
      '<div class="warehouse-demo-brief-top"><p id="warehouse-demo-number" class="warehouse-kicker"></p><span id="warehouse-demo-duration"></span></div><h3 id="warehouse-demo-title"></h3><p id="warehouse-demo-description"></p>'+
      '<div id="warehouse-demo-diagram" class="warehouse-demo-diagram" aria-label="Workflow"><div><i aria-hidden="true"></i><span id="warehouse-demo-flow-0"></span></div><b aria-hidden="true"></b><div><i aria-hidden="true"></i><span id="warehouse-demo-flow-1"></span></div><b aria-hidden="true"></b><div><i aria-hidden="true"></i><span id="warehouse-demo-flow-2"></span></div></div>'+
      '<ol id="warehouse-demo-outline" class="warehouse-demo-outline"></ol><div class="warehouse-demo-manifest"><span id="warehouse-demo-document"></span><span id="warehouse-demo-start-location"></span></div>'+
      '<button id="warehouse-demo-launch" class="warehouse-primary" type="button"></button><p class="warehouse-demo-session-note">A fresh demonstration. No business progression required.</p></article></div>'+
      '<footer class="warehouse-demo-gallery-bottom"><span>Keyboard & mouse / Your pace / Real inventory transactions</span><p id="warehouse-demo-result"></p></footer>';
    el('launcher').appendChild(gallery);
    catalog.forEach(function(item){var button=node('button');button.type='button';button.dataset.demoSelect=item.id;button.setAttribute('aria-controls','warehouse-demo-title');
      button.appendChild(node('span',item.number,'warehouse-demo-course-number'));var copy=node('span');copy.appendChild(node('small',item.tag));copy.appendChild(node('strong',item.title));copy.appendChild(node('span',item.time));button.appendChild(copy);
      button.addEventListener('click',function(){select(item.id,false);});el('demo-courses').appendChild(button);});
    el('demo-back').addEventListener('click',function(){hideGallery();el('demos').focus();});
    el('demo-launch').addEventListener('click',function(){hideGallery();callbacks.launch(selected);});
    var guide=node('aside',null,'warehouse-demo-guide');guide.id='warehouse-demo-guide';guide.hidden=true;guide.setAttribute('aria-label','Demonstration guide');
    guide.innerHTML='<div class="warehouse-demo-guide-top"><span id="warehouse-demo-guide-course"></span><button id="warehouse-demo-help-button" type="button">Guide <kbd>H</kbd></button></div><div class="warehouse-demo-progress" role="progressbar" aria-label="Confirmed milestones" aria-valuemin="0"><span id="warehouse-demo-progress-fill"></span></div><div class="warehouse-demo-phase"><span id="warehouse-demo-phase"></span><span id="warehouse-demo-count"></span></div><h2 id="warehouse-demo-step" aria-live="polite"></h2><p id="warehouse-demo-instruction"></p><div id="warehouse-demo-action" class="warehouse-demo-action"></div>';
    el('hud').appendChild(guide);el('demo-help-button').addEventListener('click',help);
    var target=node('div',null,'warehouse-demo-target');target.id='warehouse-demo-target';target.hidden=true;target.innerHTML='<span class="warehouse-demo-target-ring" aria-hidden="true"></span><span id="warehouse-demo-target-label"></span><small id="warehouse-demo-target-distance"></small>';el('hud').appendChild(target);
    var helpSection=node('section');helpSection.id='warehouse-demo-help';helpSection.hidden=true;
    helpSection.innerHTML='<p class="warehouse-kicker">Customer demonstration</p><h3 id="warehouse-demo-help-title"></h3><p id="warehouse-demo-help-current" class="warehouse-demo-help-current"></p><ol id="warehouse-demo-help-outline" class="warehouse-demo-outline"></ol><dl class="warehouse-demo-controls"><div><dt>Hold left mouse</dt><dd>Aim and scan with the TC22.</dd></div><div><dt>Right mouse</dt><dd>Inspect its screen and choose a task.</dd></div><div><dt>Hold E</dt><dd>Carry a carton. Release to put it down.</dd></div><div><dt>Enter</dt><dd>Confirm when the physical work is ready.</dd></div></dl><div class="warehouse-session-actions"><button id="warehouse-demo-help-resume" class="warehouse-primary" type="button">Return to walkthrough</button><button id="warehouse-demo-restart" type="button">Restart walkthrough</button><button id="warehouse-demo-choose" type="button">Choose another</button></div>';
    el('menu').querySelector('.warehouse-menu-footer').before(helpSection);
    var complete=node('section',null,'warehouse-demo-complete');complete.id='warehouse-demo-complete';complete.hidden=true;
    complete.innerHTML='<p class="warehouse-kicker">Work verified</p><h3 id="warehouse-demo-complete-title">Walkthrough complete</h3><p id="warehouse-demo-complete-copy"></p><dl id="warehouse-demo-complete-stats"></dl><p class="warehouse-demo-proof">Physical stock and the warehouse record agree. You can inspect the transaction history at the office computer.</p><div class="warehouse-session-actions"><button id="warehouse-demo-next" class="warehouse-primary" type="button">Next walkthrough</button><button id="warehouse-demo-explore" type="button">Keep exploring</button><button id="warehouse-demo-complete-choose" type="button">All demonstrations</button></div>';
    el('menu').querySelector('.warehouse-menu-footer').before(complete);
    el('demo-help-resume').addEventListener('click',callbacks.resume);el('demo-explore').addEventListener('click',callbacks.resume);
    el('demo-restart').addEventListener('click',function(){callbacks.launch(current?current.id:selected);});
    ['demo-choose','demo-complete-choose'].forEach(function(id){el(id).addEventListener('click',function(){callbacks.title();showGallery(current?current.id:selected);});});
    el('demo-next').addEventListener('click',function(){var index=catalog.findIndex(function(item){return current&&item.id===current.id;});callbacks.title();showGallery(catalog[(index+1)%catalog.length].id);});
    select(selected,false);
  }
  function receive(snapshot) {
    current=snapshot&&snapshot.id?snapshot:null;
    el('demo-guide').hidden=!current;document.querySelector('.warehouse-objective').hidden=!!current;
    if(!current){el('demo-target').hidden=true;return;}
    var item=find(current.id),total=Math.max(1,current.total),completed=Math.max(0,Math.min(total,current.completed));
    text(el('demo-guide-course'),item.number+' / '+item.title);text(el('demo-phase'),current.phase);text(el('demo-count'),completed+' / '+total+' confirmed');
    var progress=el('demo-progress-fill');progress.style.width=(completed/total*100)+'%';progress.parentElement.setAttribute('aria-valuenow',completed);progress.parentElement.setAttribute('aria-valuemax',total);
    text(el('demo-step'),current.stepTitle);text(el('demo-instruction'),current.instruction);text(el('demo-action'),current.action);
    var signature=current.id+':'+current.step+':'+current.cartonId+':'+completed;
    if(signature!==lastStep){lastStep=signature;el('demo-guide').classList.remove('is-new-step');void el('demo-guide').offsetWidth;el('demo-guide').classList.add('is-new-step');}
    if(current.complete&&completionShown!==current.id){
      completionShown=current.id;text(el('demo-complete-title'),item.title);text(el('demo-complete-copy'),item.result);
      var stats=el('demo-complete-stats');stats.replaceChildren();
      [['received','Received'],['transferred','Moved'],['picked','Picked'],['shipped','Shipped']].forEach(function(pair){if(!current[pair[0]])return;var div=node('div');div.appendChild(node('dt',pair[1]));div.appendChild(node('dd',current[pair[0]]+' CTN'));stats.appendChild(div);});
      callbacks.menu('demo-complete');
    }
  }
  function presentation(value) {
    el('demo-guide').hidden=!current||!value.playing||value.covered;
    el('demo-guide').classList.toggle('is-inspecting',!!value.inspecting);
    var viewport=current&&current.targetViewport,visible=current&&!current.complete&&current.targetVisible&&viewport&&viewport.length===3&&value.playing&&!value.covered&&!value.inspecting;
    el('demo-target').hidden=!visible;if(!visible)return;
    var x=Number(viewport[0]),y=1-Number(viewport[1]),behind=Number(viewport[2])<=0;
    if(behind){x=x<.5?.96:.04;y=.54;}
    var edge=behind||x<.06||x>.94||y<.2||y>.84;
    el('demo-target').classList.toggle('is-edge',edge);
    el('demo-target').style.left=(Math.max(.07,Math.min(.93,x))*100)+'%';el('demo-target').style.top=(Math.max(.25,Math.min(.82,y))*100)+'%';
    text(el('demo-target-label'),(edge?'Go to ':'')+(current.targetLabel||current.targetCode||'Next location'));
    text(el('demo-target-distance'),Math.max(0,current.targetDistance||0).toFixed(1)+' m');
  }
  window.WarehouseDemoUI={init:init,receive:receive,setPresentation:presentation,showGallery:showGallery,hideGallery:hideGallery,help:help,
    title:function(id){return find(id).title;},valid:function(id){return catalog.some(function(item){return item.id===id;});}};
}());
