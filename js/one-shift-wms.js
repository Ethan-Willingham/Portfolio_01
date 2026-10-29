(function () {
  'use strict';

  // Presentation only. Every receipt, allocation and movement is acknowledged
  // by the Unity warehouse before its authoritative snapshot changes here.
  var api, callbacks = {}, state = null, initialized = false;
  var presentation = {handheldOpen:false, handheldInteractive:false, consoleOpen:false, active:true};
  var handheld, handheldBody, handheldNotice, handheldFooter, deviceShade, scanReticle, consoleApp, consoleBody, consoleStatus, equipmentControl;
  var tab = 'overview', selected = '', query = '', filter = 'all', sortKey = '', sortDirection = 1;
  var lastSignature = '', lastScan = -1, searchTimer = null;
  var createOpen = false, createItem = '', createQuantity = 1, pendingCreate = null;
  var demoReadOnlyReason = 'Prepared for this walkthrough. Create and manage orders in Sandbox or your own business.';
  var pages = [
    ['overview','Overview'], ['inventory','Inventory'], ['bins','Locations'],
    ['purchaseOrders','Supplier orders'], ['salesOrders','Customer orders'],
    ['tasks','To do'], ['transactions','History']
  ];
  var tiles = [
    ['receive','Receive','Check boxes that just arrived','01'],
    ['transfer','Transfer','Put away or move a box','02'],
    ['pick','Pick','Get boxes for a customer','03'],
    ['ship','Ship','Load and send an order','04'],
    ['lookup','Item lookup','Find out what is here','05']
  ];
  function node(tag, text, className) {
    var result = document.createElement(tag);
    if (text != null) result.textContent = String(text);
    if (className) result.className = className;
    return result;
  }
  function append(parent) {
    for (var i=1;i<arguments.length;i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }
  function button(label, action, className) {
    var result = node('button',label,className); result.type='button';
    if (action) result.addEventListener('click',action);
    return result;
  }
  function qty(value) { return Math.max(0,Number(value)||0); }
  function isDemo() { return !!state && state.mode==='demo'; }
  function text(value, fallback) { return value == null || value === '' ? (fallback || '') : String(value); }
  function list(value) { return Array.isArray(value) ? value : []; }
  function lower(value) { return text(value).toLowerCase(); }
  function statusLabel(value) {
    var names={released:'Ready to pick',reserved:'Reserved for order',expected:'Awaiting receipt',loaded:'Loaded in van',picked:'Ready to load',
      po_open:'Supplier order created',so_open:'Customer order created',allocate:'Stock reserved',seed:'Opening stock',receive:'Receive',transfer:'Transfer',pick:'Pick',load:'Load',ship:'Ship',putaway:'Put away'};
    return names[lower(value)]||text(value,'Open').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ');
  }
  function status(value) {
    var chip=node('span',statusLabel(value),'wms-status');
    chip.dataset.status=lower(value).replace(/\s/g,'');return chip;
  }
  function mono(value) { return node('span',text(value,'--'),'wms-mono'); }
  function small(value) { return node('small',value); }
  function amount(value) { return node('span',qty(value).toLocaleString('en-US'),'wms-quantity'); }
  function command(action,id) {
    if (callbacks.command) callbacks.command(action,text(id));
  }
  function findItem(sku) { return list(state && state.items).find(function(i){return i.sku===sku||i.id===sku;}); }
  function skuName(sku) { var item=findItem(sku);return item ? item.name : text(sku,'Unknown item'); }
  function itemCode(item) { return text(item.sku,item.id); }
  function displayCode(sku) { var item=typeof sku==='object'?sku:findItem(sku);return item?text(item.code,itemCode(item)):text(sku); }
  function binName(id) { var bin=list(state&&state.bins).find(function(b){return b.id===id;});return bin?text(bin.name,id):text(id,'Not placed'); }
  function itemCell(sku,link) { return append(node('div',null,'wms-item-cell'),link?detailLink(skuName(sku),'inventory',sku):node('strong',skuName(sku)),small(displayCode(sku))); }
  function locationCell(id,link) { return id?append(node('div',null,'wms-item-cell'),link?detailLink(id,'bins',id):mono(id),small(binName(id))):node('span','Not placed'); }
  function explanation(title,copy) { return append(node('details',null,'wms-explanation'),node('summary',title),node('p',copy)); }
  function findOrder(kind,id) { return list(state && state[kind]).find(function(order){return order.id===id;}); }
  function orderCount(order,field) { return list(order.lines).reduce(function(sum,line){return sum+qty(line[field]);},0); }
  function isComplete(order) { return /^(complete|completed|closed|shipped|received|cancelled|canceled)$/i.test(order.status); }
  function heading(kicker,title,description) {
    var block=node('header',null,'wms-page-heading');
    append(block,node('p',kicker,'wms-eyebrow'),node('h2',title));
    if(description)block.appendChild(node('p',description,'wms-description'));
    return block;
  }
  function empty(title,detail) {
    return append(node('div',null,'wms-empty'),node('h3',title),node('p',detail));
  }
  function metric(label,value,detail) {
    return append(node('div',null,'wms-metric'),node('dt',label),node('dd',value),detail?small(detail):null);
  }
  function dataPair(label,value) { return append(node('div'),node('dt',label),node('dd',text(value,'--'))); }
  function actionButton(label,action,id,enabled,reason,className) {
    if(isDemo()&&['create-po','create-so','book-po','cancel-order','release-order'].includes(action)){enabled=false;reason=demoReadOnlyReason;}
    var result=button(label,function(){command(action,id);},className);
    result.disabled=enabled===false;result.dataset.wmsCommand=action;result.dataset.wmsId=text(id);
    if(reason)result.title=reason;
    return result;
  }
  function openPage(value,id) {
    if(pages.some(function(p){return p[0]===value;}))tab=value;
    selected=text(id);query='';filter='all';sortKey='';sortDirection=1;createOpen=false;pendingCreate=null;
    if(consoleBody)consoleBody.scrollTop=0;
    renderConsole();
  }
  function detailLink(label,page,id) {
    var result=button(label,function(){openPage(page,id);},'wms-link');
    result.dataset.wmsDetail=page+':'+id;return result;
  }
  function rowKey(value) { return text(value.id,value.sku || value.cartonId); }
  function searchable(value) {
    return Object.keys(value).map(function(key){return typeof value[key] === 'object'?'':text(value[key]);}).join(' ').toLowerCase();
  }
  function matching(rows) {
    var needle=query.trim().toLowerCase();
    return rows.filter(function(row){return (!needle||searchable(row).includes(needle)) &&
      (filter==='all'||lower(row.status || row.kind || row.type)===filter);});
  }
  function sorted(rows,columns) {
    if(!sortKey)return rows;
    var column=columns.find(function(c){return c.key===sortKey;});
    if(!column)return rows;
    return rows.slice().sort(function(a,b){
      var av=column.value?column.value(a):a[column.key],bv=column.value?column.value(b):b[column.key];
      if(typeof av==='number'&&typeof bv==='number')return (av-bv)*sortDirection;
      return text(av).localeCompare(text(bv),undefined,{numeric:true})*sortDirection;
    });
  }
  function table(columns,rows,caption,emptyMessage) {
    if(!rows.length)return empty(emptyMessage||'No matching records','Try another search or filter. Confirmed work appears here as the warehouse changes.');
    var wrapper=node('div',null,'wms-table-wrap'),grid=node('table',null,'wms-table');
    var cap=node('caption',caption);cap.className='wms-sr-only';grid.appendChild(cap);
    var head=node('thead'),headRow=node('tr');
    columns.forEach(function(column){
      var th=node('th');th.scope='col';
      if(column.numeric)th.className='wms-numeric';
      if(column.key){
        var control=button(column.label,function(){sortDirection=sortKey===column.key?-sortDirection:1;sortKey=column.key;renderConsole();},'wms-sort');
        control.title='Sort by '+column.label;th.appendChild(control);
        th.setAttribute('aria-sort',sortKey===column.key?(sortDirection===1?'ascending':'descending'):'none');
        if(sortKey===column.key)control.appendChild(node('span',sortDirection===1?'ASC':'DESC','wms-sort-direction'));
      }else th.textContent=column.label;
      headRow.appendChild(th);
    });head.appendChild(headRow);grid.appendChild(head);
    var body=node('tbody');
    sorted(rows,columns).forEach(function(row){
      var tr=node('tr');tr.dataset.record=rowKey(row);
      columns.forEach(function(column){
        var cell=node('td');if(column.numeric)cell.className='wms-numeric';
        var value=column.render?column.render(row):column.value?column.value(row):row[column.key];
        if(value instanceof Node)cell.appendChild(value);else cell.textContent=text(value,'--');
        tr.appendChild(cell);
      });body.appendChild(tr);
    });grid.appendChild(body);wrapper.appendChild(grid);return wrapper;
  }
  function tools(rows,placeholder) {
    var strip=node('div',null,'wms-toolbar'),label=node('label',null,'wms-search');
    var input=node('input');input.type='search';input.value=query;input.placeholder=placeholder||'Search records';input.id='warehouse-wms-search';
    append(label,node('span','Search','wms-sr-only'),input);strip.appendChild(label);
    input.addEventListener('input',function(){
      query=input.value;clearTimeout(searchTimer);searchTimer=setTimeout(function(){renderConsole();},100);
    });
    var values=Array.from(new Set(rows.map(function(row){return lower(row.status||row.kind||row.type);}).filter(Boolean))).sort();
    if(values.length){
      var selectLabel=node('label',null,'wms-filter'),select=node('select');select.id='warehouse-wms-filter';
      append(selectLabel,node('span','Filter','wms-sr-only'),select);
      var all=node('option','All statuses / types');all.value='all';select.appendChild(all);
      values.forEach(function(value){var option=node('option',statusLabel(value));option.value=value;select.appendChild(option);});
      select.value=filter;if(select.value!==filter){filter='all';select.value='all';}
      select.addEventListener('change',function(){filter=select.value;renderConsole();});strip.appendChild(selectLabel);
    }
    strip.appendChild(node('span',matching(rows).length+' of '+rows.length+' records','wms-record-count'));
    return strip;
  }
  function stockTable(rows,caption) {
    return table([
      {key:'sku',label:'Item',render:function(item){return itemCell(itemCode(item),true);}},
      {key:'onHand',label:'On hand',numeric:true,render:function(i){return amount(i.onHand);}},
      {key:'available',label:'Available',numeric:true,render:function(i){return amount(i.available);}},
      {key:'reserved',label:'Allocated',numeric:true,render:function(i){return amount(i.reserved);}},
      {key:'picked',label:'Picked',numeric:true,render:function(i){return amount(i.picked);}},
      {key:'inReceiving',label:'Receiving',numeric:true,render:function(i){return amount(i.inReceiving);}},
      {label:'Unit',render:function(){return 'carton';}}
    ],rows,caption,'No inventory matches');
  }
  function cartonTable(rows) {
    return table([
      {key:'id',label:'Carton ID',render:function(c){return mono(c.id);}},
      {key:'sku',label:'Item',render:function(c){return itemCell(c.sku,false);}},
      {key:'binId',label:'Recorded location',render:function(c){return c.binId?locationCell(c.binId,true):'Not received';}},
      {key:'physicalBin',label:'Actual location',render:function(c){return c.physicalBin?locationCell(c.physicalBin,false):'Being moved';}},
      {key:'status',label:'Status',render:function(c){return status(c.status);}},
      {key:'soId',label:'Document',render:function(c){return c.soId?detailLink(c.soId,'salesOrders',c.soId):c.poId?detailLink(c.poId,'purchaseOrders',c.poId):'Opening stock';}},
      {key:'quantity',label:'Cartons',numeric:true,render:function(c){return amount(c.quantity||1);}}
    ],rows,'Physical cartons and their recorded locations','No cartons in this view');
  }
  function operationDashboard() {
    var openPO=list(state.purchaseOrders).filter(function(o){return !isComplete(o);});
    var openSO=list(state.salesOrders).filter(function(o){return !isComplete(o);});
    var totals=list(state.items).reduce(function(result,item){
      result.onHand+=qty(item.onHand);result.available+=qty(item.available);result.receiving+=qty(item.inReceiving);return result;
    },{onHand:0,available:0,receiving:0});
    append(consoleBody,heading(text(state.facility,'Warehouse 01'),'Warehouse today','The office and handheld share one stock record. Each quantity is a sealed carton.'));
    append(consoleBody,append(node('dl',null,'wms-metrics'),metric('In warehouse',totals.onHand,'cartons received'),metric('Ready to pick',totals.available,'cartons free for an order'),metric('Supplier orders',openPO.length,'deliveries to receive'),metric('Customer orders',openSO.length,'orders to send')));
    var next=node('section',null,'wms-next-action'),expected=openPO.find(function(o){return o.canReceive;}),ready=openSO.find(function(o){return o.canPick;}),shipping=openSO.find(function(o){return o.canShip;}),release=openSO.find(function(o){return o.canRelease;});
    var nextTitle,nextCopy,nextLabel,nextAction;
    if(isDemo()&&state.demo){nextTitle=state.demo.complete?'Walkthrough complete':state.demo.stepTitle;nextCopy=state.demo.complete?'Every confirmed move is recorded below. Open History to follow the work from start to finish.':state.demo.instruction;nextLabel=state.demo.complete?'View history':'View handheld task';nextAction=function(){if(state.demo.complete)openPage('transactions');else if(callbacks.openHandheld)callbacks.openHandheld();};}
    else if(expected){nextTitle='Receive the delivery';nextCopy='Check the supplier order, then scan the arriving boxes with Receive on the handheld.';nextLabel='View '+expected.id;nextAction=function(){openPage('purchaseOrders',expected.id);};}
    else if(totals.receiving){nextTitle='Put received boxes away';nextCopy='Choose Transfer. Scan the receiving location, the box, and its storage location. Move the box before confirming.';nextLabel='Open Transfer';nextAction=function(){command('workflow','transfer');if(callbacks.openHandheld)callbacks.openHandheld();};}
    else if(ready){nextTitle='Pick a customer order';nextCopy='The stock is reserved. Pick on the handheld shows which boxes to bring to Ready to ship.';nextLabel='View '+ready.id;nextAction=function(){openPage('salesOrders',ready.id);};}
    else if(shipping){nextTitle='Finish the shipment';nextCopy='Load the picked boxes into the collection van. The stock leaves the record when the van departs.';nextLabel='View '+shipping.id;nextAction=function(){openPage('salesOrders',shipping.id);};}
    else if(release){nextTitle='Prepare a customer order';nextCopy='Reserve its stock here, then collect the boxes with Pick on the handheld.';nextLabel='View '+release.id;nextAction=function(){openPage('salesOrders',release.id);};}
    else{nextTitle=totals.onHand?'Choose an order to work on':'Start with a supplier delivery';nextCopy='A purchase order is your list of stock to buy. Book its delivery here, then check each arriving box on the floor.';nextLabel='View supplier orders';nextAction=function(){openPage('purchaseOrders');};}
    append(next,append(node('div'),node('p','Next useful step','wms-eyebrow'),node('h3',nextTitle),node('p',nextCopy)),button(nextLabel,nextAction,'wms-primary'));consoleBody.appendChild(next);
    var split=node('div',null,'wms-dashboard-split');
    var inbound=node('section',null,'wms-dashboard-section'),outbound=node('section',null,'wms-dashboard-section');
    append(inbound,append(node('header',null,'wms-section-heading'),node('h3','Coming in'),button('Supplier orders',function(){openPage('purchaseOrders');},'wms-link')));
    append(outbound,append(node('header',null,'wms-section-heading'),node('h3','Going out'),button('Customer orders',function(){openPage('salesOrders');},'wms-link')));
    append(inbound,orderSummary(openPO,'purchaseOrders'));append(outbound,orderSummary(openSO,'salesOrders'));append(split,inbound,outbound);consoleBody.appendChild(split);
    var exceptions=list(state.exceptions);
    var alerts=node('section',null,'wms-exceptions');
    append(alerts,append(node('header',null,'wms-section-heading'),node('h3','Attention'),small(exceptions.length+' open')));
    if(!exceptions.length)alerts.appendChild(node('p','No inventory exceptions. Physical moves still need their scan confirmations.','wms-muted'));
    exceptions.forEach(function(issue){append(alerts,append(node('article',null,'wms-exception'),node('strong',issue.title),node('p',issue.detail)));});
    consoleBody.appendChild(alerts);
    consoleBody.appendChild(explanation('From a paper stock sheet to this screen','Receive adds a delivered box. Transfer records where you put it. Pick reserves the right boxes for a customer and moves them to Ready to ship. Ship checks the van load. Scanning identifies a label; confirmation records the finished work. You still move every box yourself.'));
  }
  function orderSummary(rows,kind) {
    if(!rows.length)return node('p','No open documents.','wms-muted');
    var body=node('div',null,'wms-order-summary');
    rows.slice(0,4).forEach(function(order){
      var count=orderCount(order,'ordered'),done=orderCount(order,kind==='purchaseOrders'?'received':'shipped');
      append(body,append(node('div'),append(node('div'),detailLink(order.id,kind,order.id),small(order.partner)),append(node('div'),status(order.status),small(done+' / '+count+' cartons'))));
    });return body;
  }
  function inventoryPage() {
    var item=selected?list(state.items).find(function(i){return itemCode(i)===selected;}):null;
    if(item){
      append(consoleBody,button('All inventory',function(){openPage('inventory');},'wms-back'),heading(displayCode(item),item.name,item.description));
      append(consoleBody,append(node('dl',null,'wms-metrics'),metric('On hand',qty(item.onHand),'cartons received'),metric('Available',qty(item.available),'ready to pick'),metric('Allocated',qty(item.reserved),'reserved for an order'),metric('Inside each carton',qty(item.unitsPerCarton),item.description)));
      var cartons=list(state.cartons).filter(function(c){return c.sku===itemCode(item)&&lower(c.status)!=='shipped';});
      append(consoleBody,append(node('header',null,'wms-section-heading'),node('h3','Cartons by location'),small(cartons.length+' boxes')));
      append(consoleBody,tools(cartons,'Search carton, bin or order'),cartonTable(matching(cartons)));return;
    }
    append(consoleBody,heading('Stock / sealed cartons','Inventory','On hand is everything received. Available is stock in a pickable location that is not reserved for a customer.'));
    var rows=list(state.items);append(consoleBody,tools(rows,'Search item code or description'),stockTable(matching(rows),'Inventory quantities in sealed cartons'));
  }
  function binsPage() {
    var bin=selected?list(state.bins).find(function(b){return b.id===selected;}):null;
    if(bin){
      append(consoleBody,button('All locations',function(){openPage('bins');},'wms-back'),heading('Location '+bin.id,bin.name||bin.id,statusLabel(bin.kind)+' / '+(bin.canPick?'You can pick stock here':'Receive or move stock here before picking')));
      append(consoleBody,append(node('dl',null,'wms-metrics'),metric('On hand',qty(bin.onHand),'CTN recorded here'),metric('Capacity',qty(bin.capacity),'cartons'),metric('Available',qty(bin.available),'cartons'),metric('Occupancy',Math.round(qty(bin.onHand)/Math.max(1,qty(bin.capacity))*100)+'%','Recorded stock')));
      var cartons=list(state.cartons).filter(function(c){return c.binId===bin.id||c.physicalBin===bin.id;});
      append(consoleBody,tools(cartons,'Search cartons in this bin'),cartonTable(matching(cartons)));return;
    }
    append(consoleBody,heading('Every box has a place','Locations','A bin is a named storage spot. Receiving, shelves, Ready to ship and the van each have a location label.'));
    consoleBody.appendChild(explanation('How to read a rack address','A01-02-01 means Row A, Bay 01, Level 02, left position. Levels count from the bottom; position 01 is left and 02 is right when facing the labels. S01 is small shelf 1. Match the whole address, then scan its label.'));
    var rows=list(state.bins);append(consoleBody,tools(rows,'Search bin or zone'),table([
      {key:'id',label:'Location',render:function(b){return detailLink(b.id,'bins',b.id);}},
      {key:'name',label:'Description'},
      {key:'kind',label:'Type',render:function(b){return status(b.kind);}},
      {key:'onHand',label:'On hand',numeric:true,render:function(b){return amount(b.onHand);}},
      {key:'capacity',label:'Capacity',numeric:true,render:function(b){return amount(b.capacity);}},
      {key:'available',label:'Available',numeric:true,render:function(b){return amount(b.available);}},
      {key:'canPick',label:'Picking',render:function(b){return b.canPick?'Allowed':'No';}},
      {label:'Utilization',render:function(b){var meter=node('meter');meter.min=0;meter.max=Math.max(1,qty(b.capacity));meter.value=qty(b.onHand);meter.setAttribute('aria-label',b.id+' occupancy');meter.title=qty(b.onHand)+' / '+qty(b.capacity)+' cartons';return meter;}}
    ],matching(rows),'Warehouse bin locations','No locations match'));
  }
  function documentPage(kind) {
    var receiving=kind==='purchaseOrders',order=selected?findOrder(kind,selected):null;
    if(order){
      append(consoleBody,button(receiving?'All purchase orders':'All sales orders',function(){openPage(kind);},'wms-back'),heading(order.id,order.partner,order.reference|| (receiving?'Inbound purchase order':'Customer sales order')));
      var info=append(node('dl',null,'wms-document-info'),dataPair(receiving?'Supplier':'Customer',order.partner),dataPair('Status',statusLabel(order.status)),dataPair('Unit of measure','Sealed cartons'),dataPair('Order value',typeof order.amount==='number'?'$'+order.amount.toLocaleString('en-US'):'--'));
      consoleBody.appendChild(info);
      var actions=node('div',null,'wms-document-actions');
      if(receiving){
        if(order.canBook)actions.appendChild(actionButton('Book this delivery','book-po',order.id,true,null,'wms-primary'));
        var receiveAction=button('Receive on handheld',function(){command('receive-order',order.id);if(callbacks.openHandheld)callbacks.openHandheld();},order.canBook?'':'wms-primary');
        receiveAction.disabled=order.canReceive!==true;receiveAction.title=receiveAction.disabled?'A delivered carton must be available for this PO before receiving.':'Receive delivered cartons on the warehouse floor.';actions.appendChild(receiveAction);
      }else{
        actions.appendChild(actionButton('Reserve stock for picking','release-order',order.id,order.canRelease===true,order.actionReason,'wms-primary'));
        var pickAction=button('Pick on handheld',function(){command('pick-order',order.id);if(callbacks.openHandheld)callbacks.openHandheld();});
        pickAction.disabled=order.canPick!==true;pickAction.title=pickAction.disabled?'Reserve stock for this order before picking.':'Pick the allocated cartons on the warehouse floor.';actions.appendChild(pickAction);
        var shipAction=button(order.canShip?'Review shipment on handheld':'Ship on handheld',function(){command('ship-order',order.id);if(callbacks.openHandheld)callbacks.openHandheld();},order.canShip?'wms-primary':'');
        shipAction.disabled=order.canShip!==true;shipAction.title=shipAction.disabled?'Pick every order carton into staging before shipping.':'Continue loading and shipment confirmation on the warehouse floor.';actions.appendChild(shipAction);
      }
      if(order.canCancel)actions.appendChild(actionButton('Cancel order','cancel-order',order.id,true));
      consoleBody.appendChild(actions);
      if(isDemo())consoleBody.appendChild(node('p',demoReadOnlyReason,'wms-description'));
      if(order.actionReason)consoleBody.appendChild(node('p',order.actionReason,'wms-description'));
      var columns=[{key:'sku',label:'Item',render:function(line){return itemCell(line.sku,true);}},{key:'ordered',label:'Ordered',numeric:true,render:function(line){return amount(line.ordered);}}];
      if(receiving)columns.push({key:'received',label:'Received',numeric:true,render:function(line){return amount(line.received);}},{label:'Outstanding',numeric:true,render:function(line){return amount(qty(line.ordered)-qty(line.received));}});
      else ['allocated','picked','loaded','shipped'].forEach(function(key){columns.push({key:key,label:key[0].toUpperCase()+key.slice(1),numeric:true,render:function(line){return amount(line[key]);}});});
      columns.push({label:'Unit',render:function(){return 'carton';}});
      consoleBody.appendChild(table(columns,list(order.lines),order.id+' document lines','No document lines'));
      var relevant=list(state.cartons).filter(function(c){return receiving?c.poId===order.id:c.soId===order.id;});
      append(consoleBody,append(node('header',null,'wms-section-heading'),node('h3',receiving?'Inbound cartons':'Allocated cartons'),small(relevant.length+' boxes')));
      consoleBody.appendChild(cartonTable(relevant));
      consoleBody.appendChild(node('p',receiving?'Receiving posts each physically delivered carton into the scanned receiving bin. Transfer it to a storage bin afterward.':'Reserving stock sets boxes aside for this customer. Pick and move the exact cartons to staging, then scan them onto the carrier before shipping.','wms-footnote'));
      return;
    }
    append(consoleBody,heading(receiving?'Purchase orders / PO':'Sales orders / SO',receiving?'Supplier orders':'Customer orders',receiving?'What you ordered from a supplier. Receive each box against this list, then put it away.':'What a customer wants. Reserve the stock here, then use Pick and Ship on the handheld.'));
    var createAllowed=!isDemo()&&(state.mode==='sandbox'||qty(state.completedOrders)>0);
    var createButton=button(createOpen?'Close new document':receiving?'New purchase order':'New sales order',function(){createOpen=!createOpen;renderConsole();},'wms-primary');
    createButton.dataset.wmsCreate=kind;createButton.disabled=!createAllowed||!!pendingCreate;
    createButton.title=isDemo()?demoReadOnlyReason:createAllowed?'Create a document from the item catalog.':'Complete your first customer shipment to create more documents.';
    append(consoleBody,append(node('div',null,'wms-document-create-action'),createButton,small(isDemo()?demoReadOnlyReason:createAllowed?'Whole-carton orders / 1 to 6 cartons per order':'Complete the first customer shipment to unlock new orders.')));
    if(createOpen&&createAllowed)consoleBody.appendChild(newDocumentForm(kind));
    var rows=list(state[kind]);append(consoleBody,tools(rows,receiving?'Search PO or supplier':'Search SO or customer'),table([
      {key:'id',label:receiving?'PO number':'SO number',render:function(o){return detailLink(o.id,kind,o.id);}},
      {key:'partner',label:receiving?'Supplier':'Customer'},
      {key:'status',label:'Status',render:function(o){return status(o.status);}},
      {key:'ordered',label:'Ordered',numeric:true,value:function(o){return orderCount(o,'ordered');}},
      {key:receiving?'received':'picked',label:receiving?'Received':'Picked',numeric:true,value:function(o){return orderCount(o,receiving?'received':'picked');}},
      {key:'remaining',label:receiving?'Outstanding':'Shipped',numeric:true,value:function(o){return receiving?orderCount(o,'ordered')-orderCount(o,'received'):orderCount(o,'shipped');}},
      {key:'reference',label:'Reference'}
    ],matching(rows),receiving?'Purchase orders':'Sales orders',receiving?'No purchase orders match':'No sales orders match'));
  }
  function newDocumentForm(kind) {
    var receiving=kind==='purchaseOrders',form=node('form',null,'wms-document-form');
    form.setAttribute('aria-label',receiving?'Create purchase order':'Create sales order');
    var itemLabel=node('label','Catalog item'),select=node('select');select.id='warehouse-wms-create-item';
    list(state.items).forEach(function(item){var option=node('option',item.name+' / '+displayCode(item));option.value=itemCode(item);select.appendChild(option);});
    if(!findItem(createItem))createItem=list(state.items).length?itemCode(state.items[0]):'';select.value=createItem;
    var quantityLabel=node('label','Quantity / cartons'),quantity=node('input');quantity.type='number';quantity.id='warehouse-wms-create-quantity';quantity.min='1';quantity.max='6';quantity.step='1';quantity.required=true;quantity.value=createQuantity;
    itemLabel.appendChild(select);quantityLabel.appendChild(quantity);
    var context=node('p',null,'wms-description');
    function updateContext(){var item=findItem(select.value);context.textContent=item?item.unitsPerCarton+' pieces inside each sealed carton. '+(receiving?'Create the order, then book its supplier delivery.':'Create the order, then reserve its stock for picking.'):'No catalog item is available.';}
    select.addEventListener('change',function(){createItem=select.value;updateContext();});
    quantity.addEventListener('input',function(){createQuantity=quantity.value;});updateContext();
    var submit=button(receiving?'Create purchase order':'Create sales order',null,'wms-primary');submit.type='submit';submit.disabled=!!pendingCreate||!createItem;
    form.addEventListener('submit',function(event){
      event.preventDefault();var count=Number(quantity.value);
      if(isDemo())return;
      if(!Number.isInteger(count)||count<1||count>6||!findItem(select.value)){quantity.reportValidity();return;}
      createItem=select.value;createQuantity=count;pendingCreate={kind:kind,ids:list(state[kind]).map(function(order){return order.id;})};
      submit.disabled=true;command(receiving?'create-po':'create-so',createItem+':'+count);
    });
    append(form,itemLabel,quantityLabel,submit,context);return form;
  }
  function tasksPage() {
    append(consoleBody,heading('Work on the floor','To do','Use the handheld to work through these boxes. A confirmation updates the record after you finish the physical move.'));
    var rows=list(state.tasks);append(consoleBody,tools(rows,'Search task, item, bin or order'),table([
      {key:'id',label:'Task',render:function(t){return mono(t.id);}},
      {key:'type',label:'Work',render:function(t){return status(t.type);}},
      {key:'orderId',label:'Document',render:function(t){return t.orderId?detailLink(t.orderId,/receive/i.test(t.type)?'purchaseOrders':'salesOrders',t.orderId):'Internal move';}},
      {key:'sku',label:'Item',render:function(t){return itemCell(t.sku,false);}},
      {key:'sourceBin',label:'From',render:function(t){return locationCell(t.sourceBin,false);}},
      {key:'destinationBin',label:'To',render:function(t){return locationCell(t.destinationBin,false);}},
      {key:'quantity',label:'Cartons',numeric:true,render:function(t){return amount(t.quantity);}},
      {key:'status',label:'Status',render:function(t){return status(t.status);}}
    ],matching(rows),'Warehouse work queue','The work queue is clear'));
  }
  function transactionsPage() {
    append(consoleBody,heading('Your stock record','History','Each confirmed action leaves a record: what moved, where it went, and which order it belongs to.'));
    var rows=list(state.transactions);append(consoleBody,tools(rows,'Search carton, document, bin or item'),table([
      {key:'id',label:'Sequence',render:function(t){return mono(t.id);}},
      {key:'time',label:'Posted',render:function(t){return mono(t.time);}},
      {key:'type',label:'Operation',render:function(t){return status(t.type);}},
      {key:'cartonId',label:'Carton',render:function(t){return mono(t.cartonId);}},
      {key:'sku',label:'Item',render:function(t){return itemCell(t.sku,false);}},
      {key:'quantity',label:'Cartons',numeric:true,render:function(t){return amount(t.quantity);}},
      {key:'fromBin',label:'From',render:function(t){return mono(t.fromBin);}},
      {key:'toBin',label:'To',render:function(t){return mono(t.toBin);}},
      {key:'document',label:'Document',render:function(t){return mono(t.document);}}
    ],matching(rows),'Inventory transaction history','No transactions match'));
  }
  function retainView(target,render) {
    var focused=document.activeElement, focusId=focused&&focused.id, selectionStart=focused&&focused.selectionStart, selectionEnd=focused&&focused.selectionEnd;
    var commandName=focused&&focused.dataset.wmsCommand, commandId=focused&&focused.dataset.wmsId;
    var scroll=target.scrollTop;
    render();target.scrollTop=scroll;
    if(focusId){var replacement=document.getElementById(focusId);if(replacement&&target.contains(replacement)){replacement.focus({preventScroll:true});if(typeof selectionStart==='number'&&replacement.type==='search')replacement.setSelectionRange(selectionStart,selectionEnd);}}
    else if(commandName){var replacement=Array.from(target.querySelectorAll('[data-wms-command]')).find(function(b){return b.dataset.wmsCommand===commandName&&b.dataset.wmsId===commandId&&!b.disabled;});if(replacement)replacement.focus({preventScroll:true});}
  }
  function renderConsole() {
    if(!initialized)return;
    equipmentControl.disabled=isDemo();equipmentControl.title=isDemo()?'Equipment and finance are prepared for this walkthrough. Available in Sandbox or your own business.':'';
    consoleApp.querySelectorAll('[data-wms-page]').forEach(function(control){var active=control.dataset.wmsPage===tab;control.setAttribute('aria-current',active?'page':'false');});
    retainView(consoleBody,function(){
      consoleBody.replaceChildren();
      if(!state){consoleBody.appendChild(empty('Connecting to the warehouse','The live inventory ledger will appear here when the warehouse is ready.'));return;}
      if(tab==='inventory')inventoryPage();else if(tab==='bins')binsPage();else if(tab==='purchaseOrders'||tab==='salesOrders')documentPage(tab);else if(tab==='tasks')tasksPage();else if(tab==='transactions')transactionsPage();else operationDashboard();
    });
    consoleStatus.textContent=state?text(state.message,'Ready. All quantities are sealed cartons.'): 'Waiting for warehouse state.';
    consoleStatus.dataset.severity=state?lower(state.severity):'';
    consoleApp.querySelector('.wms-facility').textContent=state?text(state.facility,'MAIN')+' / '+text(state.mode,'Session'): 'MAIN / Session';
  }
  function handheldHome() {
    append(handheldBody,node('p','Floor operations','wms-device-eyebrow'),node('h2','Choose your work'));
    var grid=node('div',null,'wms-device-tiles');
    tiles.forEach(function(tile){
      var control=button('',function(){command('workflow',tile[0]);},'wms-device-tile');control.dataset.wmsTile=tile[0];
      append(control,node('span',tile[3],'wms-tile-number'),node('strong',tile[1]),small(tile[2]));grid.appendChild(control);
    });handheldBody.appendChild(grid);
    handheldBody.appendChild(node('p','One box = one carton. Choose a task, then follow one instruction at a time.','wms-device-note'));
  }
  function handheldDocuments(tile,workflow) {
    var receiving=tile==='receive',kind=receiving?'purchaseOrders':'salesOrders';
    var orders=list(state[kind]).filter(function(o){return !isComplete(o);});
    append(handheldBody,node('p',receiving?'Receive a delivery':tile==='pick'?'Pick for a customer':'Send an order','wms-device-eyebrow'),node('h2',receiving?'Choose a supplier order':'Choose a customer order'));
    if(!orders.length){handheldBody.appendChild(empty('No open documents',receiving?'Book a purchase order from the office computer.':'Reserve stock for a customer order at the office computer.'));return;}
    orders.forEach(function(order){
      var control=button('',function(){command(receiving?'receive-order':tile==='pick'?'pick-order':'ship-order',order.id);},'wms-device-order');
      var allowed=receiving?order.canReceive===true:tile==='pick'?order.canPick===true:order.canShip===true;
      control.disabled=!allowed;control.title=allowed?'Open this floor task.':receiving?'Book and receive a physical delivery first.':tile==='pick'?'Reserve stock for this order in the office first.':'Pick all order cartons into staging first.';
      append(control,append(node('span'),node('strong',order.id),small(order.partner)),append(node('span'),status(order.status),small(orderCount(order,'ordered')+' cartons')));handheldBody.appendChild(control);
    });
  }
  function handheldLookup() {
    var code=state.scan&&(state.scan.id||text(state.scan.code).replace(/^(BIN|CARTON|ITEM):/i,''));
    var carton=list(state.cartons).find(function(c){return c.id===code;});
    var item=findItem(carton?carton.sku:code);
    var bin=list(state.bins).find(function(b){return b.id===code;});
    append(handheldBody,node('p','Item lookup','wms-device-eyebrow'),node('h2',item?item.name:bin?'Bin '+bin.id:'Scan to look up'));
    if(item){
      append(handheldBody,node('p',displayCode(item),'wms-device-code'),node('p',item.description||'Sealed trade carton','wms-device-note'));
      var values=append(node('dl',null,'wms-device-data'),dataPair('On hand',qty(item.onHand)+' cartons'),dataPair('Available',qty(item.available)+' cartons'),dataPair('Allocated',qty(item.reserved)+' cartons'),dataPair('Pack size',qty(item.unitsPerCarton)+' units / cartons'));
      handheldBody.appendChild(values);
      if(carton)append(handheldBody,append(node('dl',null,'wms-device-data'),dataPair('Carton',carton.id),dataPair('Recorded bin',carton.binId),dataPair('Physical bin',carton.physicalBin),dataPair('Status',statusLabel(carton.status))));
      var locations=list(state.cartons).filter(function(c){return c.sku===itemCode(item)&&c.binId&&lower(c.status)!=='shipped';}).reduce(function(result,c){result[c.binId]=(result[c.binId]||0)+1;return result;},{});
      var locationList=node('div',null,'wms-device-locations');
      Object.keys(locations).forEach(function(id){append(locationList,append(node('div'),locationCell(id,false),node('strong',locations[id]+' cartons')));});
      append(handheldBody,node('h3','Stock by bin'),locationList);
    }else if(bin){
      append(handheldBody,node('p',bin.name,'wms-device-note'),append(node('dl',null,'wms-device-data'),dataPair('Type',statusLabel(bin.kind)),dataPair('On hand',qty(bin.onHand)+' cartons'),dataPair('Capacity',qty(bin.capacity)+' cartons'),dataPair('Picking',bin.canPick?'Allowed':'Not permitted')));
      var inventory=list(state.cartons).filter(function(c){return c.binId===bin.id&&lower(c.status)!=='shipped';}).reduce(function(result,c){result[c.sku]=(result[c.sku]||0)+1;return result;},{});
      var binList=node('div',null,'wms-device-locations');Object.keys(inventory).forEach(function(sku){append(binList,append(node('div'),itemCell(sku,false),node('strong',inventory[sku]+' cartons')));});handheldBody.appendChild(binList);
    }else handheldBody.appendChild(node('p','Return to the floor, aim at a printed item, carton or bin label, and left-click to scan. Right-click brings this screen closer.','wms-device-note'));
  }
  function handheldWorkflow(workflow) {
    var title=tiles.find(function(t){return t[0]===workflow.tile;});
    append(handheldBody,node('p',(title?title[1]:'Warehouse task')+(workflow.orderId?' / '+workflow.orderId:''),'wms-device-eyebrow'),node('h2',text(workflow.title,'Scan the next label')));
    if(workflow.total>0){var progress=node('progress');progress.max=qty(workflow.total);progress.value=qty(workflow.completed);progress.setAttribute('aria-label','Confirmed cartons');append(handheldBody,append(node('div',null,'wms-device-progress'),node('span',qty(workflow.completed)+' / '+qty(workflow.total)+' cartons'),progress));}
    append(handheldBody,node('p',text(workflow.instruction,'Scan the barcode requested by this task.'),'wms-device-instruction'));
    var steps=append(node('dl',null,'wms-device-task-data'));
    if(workflow.sourceBin)steps.appendChild(dataPair('From',workflow.sourceBin+' / '+binName(workflow.sourceBin)));
    if(workflow.cartonId)steps.appendChild(dataPair('Carton',workflow.cartonId));
    if(workflow.destinationBin)steps.appendChild(dataPair('To',workflow.destinationBin+' / '+binName(workflow.destinationBin)));
    if(steps.children.length)handheldBody.appendChild(steps);
    if(workflow.canConfirm)handheldBody.appendChild(actionButton(workflow.confirmLabel||'Confirm carton','confirm','',true,null,'wms-device-confirm'));
    var pending=list(state.tasks).filter(function(t){return lower(t.type)===lower(workflow.tile)&&(!workflow.orderId||t.orderId===workflow.orderId);}).slice(0,3);
    if(pending.length){
      var next=node('section',null,'wms-device-next');next.appendChild(node('h3','Task lines'));
      pending.forEach(function(t){append(next,append(node('div'),append(node('span'),node('strong',skuName(t.sku)),small(t.sourceBin||t.destinationBin)),append(node('span'),node('strong',qty(t.quantity)+' cartons'),small(statusLabel(t.status)))));});
      handheldBody.appendChild(next);
    }
  }
  function renderHandheld() {
    if(!initialized)return;
    var workflow=state&&state.workflow||{},tile=lower(workflow.tile);
    retainView(handheldBody,function(){
      handheldBody.replaceChildren();
      if(!state){handheldBody.appendChild(empty('Connecting','Waiting for the warehouse ledger.'));return;}
      if(!tile||tile==='home'||tile==='none')handheldHome();
      else if(tile==='lookup'||tile==='itemlookup'||tile==='item lookup')handheldLookup();
      else if(['receive','pick','ship'].includes(tile)&&!workflow.orderId)handheldDocuments(tile,workflow);
      else handheldWorkflow(workflow);
    });
    handheld.querySelector('.wms-device-facility').textContent=state?text(state.facility,'MAIN'):'MAIN';
    var scan=state&&state.scan||{},notice=state?text(state.message):'';
    handheldNotice.replaceChildren();handheldNotice.dataset.severity=state?lower(state.severity):'';
    if(scan.code)append(handheldNotice,node('strong',lower(scan.status)==='success'?'Read confirmed':statusLabel(scan.status)),mono(scan.code),small(scan.label));
    if(notice)handheldNotice.appendChild(node('p',notice));
    if(!scan.code&&!notice)handheldNotice.appendChild(node('p','Ready to scan.'));
    if(typeof scan.sequence==='number'&&scan.sequence!==lastScan){lastScan=scan.sequence;handheld.dataset.scan=lower(scan.status);}
    var home=handheld.querySelector('[data-device-home]');home.hidden=!tile||tile==='home'||tile==='none';
    handheld.querySelector('[data-device-cancel]').hidden=!tile||tile==='home'||tile==='lookup'||tile==='none';
    updatePresentation();
  }
  function updatePresentation() {
    if(!initialized)return;
    var equipped=presentation.handheldOpen&&presentation.active&&!presentation.consoleOpen;
    handheld.hidden=!equipped||!presentation.handheldInteractive;
    deviceShade.hidden=handheld.hidden;
    scanReticle.hidden=!equipped||presentation.handheldInteractive;
    handheld.classList.toggle('is-interactive',presentation.handheldInteractive);
    handheld.inert=!presentation.handheldInteractive;
    handheld.setAttribute('aria-label','Zebra TC22 warehouse handheld'+(presentation.handheldInteractive?', task selection':', scanning view'));
    handheldFooter.querySelector('[data-device-floor]').textContent='Return to scanning / Right click';
    consoleApp.hidden=!presentation.consoleOpen;
    var task=document.getElementById('warehouse-wms-task');if(task)task.setAttribute('aria-pressed',String(presentation.consoleOpen));
  }
  function showConsole(open) {
    presentation.consoleOpen=!!open;
    if(open){
      var business=document.getElementById('warehouse-business'),desktop=document.getElementById('warehouse-desktop-home'),task=document.getElementById('warehouse-dispatch-task');
      if(business)business.hidden=true;if(desktop)desktop.hidden=true;if(task)task.setAttribute('aria-pressed','false');
      renderConsole();
    }
    updatePresentation();
  }
  function selectBusinessEquipment() {
    var equipment=document.querySelector('[data-desk-tab="upgrades"]');
    if(equipment)equipment.click();
  }
  function init(options) {
    callbacks=options||{};
    if(initialized)return api;
    var stage=document.getElementById('warehouse-stage'),desktop=document.querySelector('.warehouse-desktop');
    if(!stage||!desktop)return api;
    handheld=append(node('aside',null,'wms-device'),node('div',null,'wms-device-speaker'));handheld.id='warehouse-wms-handheld';handheld.hidden=true;
    handheld.setAttribute('role','dialog');handheld.setAttribute('aria-modal','true');
    var deviceScreen=node('div',null,'wms-device-screen');
    append(deviceScreen,append(node('div',null,'wms-device-statusbar'),node('span','WAREHOUSE 01'),node('span','LOCAL SESSION')));
    var deviceHead=node('header',null,'wms-device-header');
    var home=button('Home',function(){command('workflow','home');});home.dataset.deviceHome='';
    append(deviceHead,append(node('div'),node('strong','Latchford WMS'),node('span','MAIN','wms-device-facility')),home);
    deviceScreen.appendChild(deviceHead);
    handheldBody=node('div',null,'wms-device-body');handheldBody.id='warehouse-wms-device-body';deviceScreen.appendChild(handheldBody);
    handheldNotice=node('div',null,'wms-device-notice');handheldNotice.id='warehouse-wms-scan-result';handheldNotice.setAttribute('role','status');handheldNotice.setAttribute('aria-live','polite');deviceScreen.appendChild(handheldNotice);
    handheldFooter=node('footer',null,'wms-device-footer');
    var floor=button('Return to scanning / Right click',function(){if(callbacks.deviceFocus)callbacks.deviceFocus(false);},'wms-device-floor');floor.dataset.deviceFloor='';
    var cancel=button('Cancel task',function(){command('cancel');});cancel.dataset.deviceCancel='';
    append(handheldFooter,floor,cancel);deviceScreen.appendChild(handheldFooter);handheld.appendChild(deviceScreen);
    var bezel=node('div',null,'wms-device-brand');append(bezel,node('strong','ZEBRA'),node('span','TC22'),button('Stow',function(){if(callbacks.closeDevice)callbacks.closeDevice();}));
    append(handheld,bezel);
    deviceShade=node('div',null,'wms-device-focus-shade');deviceShade.hidden=true;deviceShade.setAttribute('aria-hidden','true');
    deviceShade.addEventListener('click',function(){if(callbacks.deviceFocus)callbacks.deviceFocus(false);});stage.appendChild(deviceShade);stage.appendChild(handheld);
    scanReticle=node('span',null,'wms-scan-reticle');scanReticle.id='warehouse-wms-reticle';scanReticle.hidden=true;scanReticle.setAttribute('aria-hidden','true');stage.appendChild(scanReticle);
    consoleApp=node('section',null,'wms-console');consoleApp.id='warehouse-wms-console';consoleApp.hidden=true;consoleApp.setAttribute('aria-label','Warehouse management console');
    var titlebar=node('header',null,'wms-titlebar');
    append(titlebar,append(node('div'),node('b','LD','wms-app-mark'),node('strong','WMS / Warehouse management')),node('span','MAIN / Session','wms-facility'),button('Desktop',function(){showConsole(false);if(callbacks.closeConsole)callbacks.closeConsole();else{document.getElementById('warehouse-desktop-home').hidden=false;}}));
    consoleApp.appendChild(titlebar);
    var workspace=node('div',null,'wms-workspace'),navigation=node('nav',null,'wms-navigation');navigation.setAttribute('aria-label','Warehouse management');
    append(navigation,node('p','WAREHOUSE','wms-nav-label'));
    pages.forEach(function(page){var control=button(page[1],function(){openPage(page[0]);});control.dataset.wmsPage=page[0];navigation.appendChild(control);});
    equipmentControl=button('Equipment and finance',function(){showConsole(false);if(callbacks.openBusiness)callbacks.openBusiness();else document.getElementById('warehouse-dispatch-task').click();selectBusinessEquipment();},'wms-link');
    append(navigation,append(node('div',null,'wms-nav-bottom'),node('p','CTN / Sealed cartons'),equipmentControl));
    consoleBody=node('div',null,'wms-console-body');consoleBody.id='warehouse-wms-console-body';append(workspace,navigation,consoleBody);consoleApp.appendChild(workspace);
    consoleStatus=node('p');consoleStatus.setAttribute('role','status');
    append(consoleApp,append(node('footer',null,'wms-console-status'),consoleStatus,node('span','Inventory ledger / Local session')));desktop.appendChild(consoleApp);
    var taskbar=document.querySelector('.warehouse-taskbar');
    if(taskbar){var task=button('WMS',function(){showConsole(true);});task.id='warehouse-wms-task';task.setAttribute('aria-pressed','false');taskbar.insertBefore(task,taskbar.querySelector('span'));}
    var homeDesktop=document.getElementById('warehouse-desktop-home');if(homeDesktop)homeDesktop.appendChild(button('Open Warehouse Management',function(){showConsole(true);},'wms-desktop-shortcut'));
    document.querySelectorAll('[data-open-business],#warehouse-computer-minimize,#warehouse-desktop-toggle').forEach(function(control){control.addEventListener('click',function(){showConsole(false);if(control.hasAttribute('data-open-business'))selectBusinessEquipment();});});
    initialized=true;renderConsole();renderHandheld();updatePresentation();return api;
  }
  function receive(snapshot) {
    if(!initialized)init(callbacks);
    if(!snapshot)return;
    var signature=JSON.stringify(snapshot);if(signature===lastSignature)return;
    lastSignature=signature;state=snapshot;
    if(pendingCreate){
      var created=list(state[pendingCreate.kind]).find(function(order){return pendingCreate.ids.indexOf(order.id)<0;});
      var createdKind=pendingCreate.kind;pendingCreate=null;
      if(created){openPage(createdKind,created.id);return;}
    }
    if(presentation.consoleOpen)renderConsole();
    if(presentation.handheldOpen&&presentation.handheldInteractive)renderHandheld();
  }
  api=window.WarehouseWmsUI={
    init:init,receive:receive,render:receive,
    setPresentation:function(value){
      var wasDeviceOpen=presentation.handheldOpen,wasInspecting=presentation.handheldInteractive,wasConsoleOpen=presentation.consoleOpen;
      Object.assign(presentation,value||{});
      if(presentation.handheldOpen&&presentation.handheldInteractive&&(!wasDeviceOpen||!wasInspecting))renderHandheld();
      if(presentation.consoleOpen&&!wasConsoleOpen)renderConsole();
      updatePresentation();
    },
    showConsole:showConsole,
    focusConsole:function(page,id){showConsole(true);openPage(page,id);},
    getPresentation:function(){return Object.assign({},presentation);}
  };
}());
