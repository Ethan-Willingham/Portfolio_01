(function () {
  'use strict';
  var model = window.InboundPracticeModel;
  var main = document.getElementById('in-main');
  var sessions = Object.create(null);
  var current = null;
  var restartId = '';
  var lessonLaunchRequested = false;
  var sourceRoot = 'https://endpoint.my.site.com/supportportal/s/article/';
  var sources = {
    mobile: 'Receive-Items-on-Mobile', asn: 'Receive-Purchase-Orders-with-Advanced-Ship-Notices-ASNs',
    web: 'Receiving-on-the-Web', close: 'Close-Purchase-Orders-from-Mobile'
  };
  var titles = {basic:'Receive a basic item',lot:'Receive by lot number',serial:'Receive by serial number',date:'Receive by expiration date',partial:'Receive part of an order',asn:'Receive an ASN container',web:'Receive on the web',close:'Complete a purchase order'};
  function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function link(route, label, cls) { return '<a class="' + (cls || 'in-link') + '" href="#' + route + '">' + label + '</a>'; }
  function button(action, label, cls) { return '<button type="button" data-action="' + action + '" class="' + (cls || 'in-secondary') + '">' + label + '</button>'; }
  function breadcrumbs(lesson) { return '<nav class="in-breadcrumb" aria-label="Your place">' + link('', 'Home') + '<span aria-hidden="true">/</span>' + (lesson ? link('inbound', 'Inbound') : '<span aria-current="page">Inbound</span>') + (lesson ? '<span aria-hidden="true">/</span><span aria-current="page">' + escape(lesson) + '</span>' : '') + '</nav>'; }
  function card(route, eyebrow, title, copy, action, recommended) {
    return '<a href="#' + route + '" class="in-method' + (recommended ? ' is-recommended' : '') + '"><span class="in-eyebrow">' + eyebrow + '</span><strong>' + title + '</strong><p>' + copy + '</p><span class="in-method-action">' + action + ' <span aria-hidden="true">&gt;</span></span></a>';
  }
  function home() {
    return '<section class="in-home"><div class="in-intro"><p class="in-eyebrow">Learn by doing</p><h1>What would you like to do?</h1><p>Choose a task. We will walk through it together.</p></div>' +
      '<a href="#inbound" class="in-start"><span class="in-start-copy"><strong>Inbound</strong><span>Receive a delivery into the warehouse.</span><span class="in-method-action">Choose how to receive</span></span><span class="in-start-art" aria-hidden="true"></span><span class="in-arrow" aria-hidden="true">&gt;</span></a><p class="in-note">Take your time. You can repeat any step.</p></section>';
  }
  function inbound() {
    return breadcrumbs() + '<div class="in-intro"><p class="in-eyebrow">Inbound / Receiving</p><h1>How are you receiving?</h1><p>Choose the way your delivery arrives. Each example is ready to practice.</p></div><div class="in-methods">' +
      card('mobile','Purchase order / Mobile','Receive items','Check each item against a purchase order, the list of goods your supplier should send.','Choose an item type',true) +
      card('practice/asn','ASN / Mobile','Receive a container','An advance shipping notice (ASN) already lists what is inside. Scan one container, then check its contents.','Practice container receiving') +
      card('practice/web','Purchase order / Web','Use the web console','Practice the backup method when the mobile app is unavailable. Includes a damaged item.','Practice web receiving') +
      '</div><section class="in-related"><div><h2>Finished receiving?</h2><p>Practice the separate step of completing a purchase order.</p></div>' + link('practice/close','Complete an order','in-secondary') + '</section>' +
      '<details class="in-help-text"><summary>Which method should I choose?</summary><p>Use Receive items when you enter each item and quantity. Use Receive a container when your supplier has sent an ASN. ASN receiving uses the mobile app; it is not available on the web.</p><p><a href="' + sourceRoot + 'Receiving-Types" target="_blank" rel="noopener">Read about receiving types (new tab)</a></p></details>' +
      '<p class="in-note">Each example opens in the 3D warehouse. The warehouse downloads once, then stays ready as you change lessons.</p>';
  }
  function mobile() {
    return breadcrumbs('Receive items') + '<div class="in-intro"><p class="in-eyebrow">Purchase order / Mobile</p><h1>What does the item need?</h1><p>New to receiving? Start with a basic item. Then try the other examples.</p></div><div class="in-courses">' +
      card('practice/basic','Start here','Quantity only','Count the delivered items and record how many arrived.','Practice a basic item',true) +
      card('practice/lot','Lot tracked','A lot number','Record the batch number printed on the delivery label.','Practice lot receiving') +
      card('practice/serial','Serial tracked','A serial number','Scan the unique number on each unit. Each scan receives one.','Practice serial receiving') +
      card('practice/date','Date tracked','An expiration date','Read the date on the label and record the quantity.','Practice date receiving') +
      card('practice/partial','Partial delivery','Only part arrived','Receive what arrived and leave the rest of the order open.','Practice a partial receipt') + '</div>' + link('inbound','Back to receiving methods');
  }
  function newSession(id) { return {state:model.create(id),step:0,message:'',kind:'success',draft:{}}; }
  function fixture() { return current.state.scenario; }
  function accounted() { return current.state.received + current.state.damaged; }
  function deliveryLeft() { return Math.max(0, fixture().delivery - accounted()); }
  function coreLabel() { return {lot:'Lot #',date:'Exp Date',serial:'Serial #'}[fixture().tracking] || 'Item value'; }
  function field(id,label,type,value,hint) {
    return '<label for="' + id + '">' + label + '</label><input id="' + id + '" name="' + id + '" type="' + (type || 'text') + '" value="' + escape(value || '') + '"' + (type === 'number' ? ' inputmode="numeric" min="0" step="1"' : '') + ' autocomplete="off"' + (hint ? ' aria-describedby="' + id + '-hint"' : '') + '>' + (hint ? '<p class="in-field-note" id="' + id + '-hint">' + hint + '</p>' : '');
  }
  function locationSelect() {
    var s = current.state;
    return '<label for="receipt-location">' + (fixture().channel === 'web' ? 'Bin Number' : 'Receiving location') + '</label><select name="receipt-location" id="receipt-location"><option value="">Choose a receiving bin</option><option value="REC-02"' + (s.location === 'REC-02' ? ' selected' : '') + '>REC-02 / Receiving door 2</option></select><p class="in-field-note">This delivery is at REC-02. A bin is the named location where stock is recorded.</p>';
  }
  function feedback() { return '<p id="in-feedback" class="in-feedback" role="status" aria-live="polite" data-kind="' + current.kind + '"' + (!current.message ? ' hidden' : '') + '>' + escape(current.message) + '</p>'; }
  function showFeedback(message,kind,focusId) {
    current.message = message; current.kind = kind || 'error';
    var target = document.getElementById('in-feedback');
    target.hidden = false; target.dataset.kind = current.kind; target.textContent = message;
    if (focusId && document.getElementById(focusId)) document.getElementById(focusId).focus();
  }
  function receipts() {
    var entries = current.state.inventory;
    if (!entries.length) return '<p class="in-note">No inventory recorded yet.</p>';
    return '<div class="in-table-wrap"><table class="in-receipts"><caption>Recorded inventory</caption><thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Location</th><th scope="col">Details</th></tr></thead><tbody>' + entries.map(function (r) {
      return '<tr><td>' + escape(r.itemName) + '</td><td>' + r.quantity + '</td><td>' + escape(r.location) + '</td><td>' + escape((r.core ? r.core + ' / ' : '') + r.condition) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function visual() {
    var f = fixture(), s = current.state;
    var details = f.tracking === 'serial' ? f.serials.join(' / ') : f.core || '';
    return '<aside class="in-visual" aria-labelledby="in-delivery-title"><p class="in-eyebrow">Your example delivery</p><h2 id="in-delivery-title">' + (f.channel === 'asn' ? 'One labelled container' : escape(f.itemName)) + '</h2><p>' + (f.channel === 'close' ? 'The delivery has already been received.' : f.delivery + ' units arrived. ' + (f.channel === 'web' ? '3 are good and 1 is damaged.' : f.id === 'partial' ? 'The order is for 6. The other 3 have not arrived.' : 'Read the label before recording them.')) + '</p>' +
      '<p class="in-label-values">Delivery label: <strong>' + escape(f.channel === 'asn' ? 'ASN-1001' : f.sku) + '</strong>' + (details ? '<br>' + escape(coreLabel()) + ': <strong>' + escape(details) + '</strong>' : '') + '</p>' +
      '<dl class="in-counts"><div><dt>Ordered</dt><dd>' + f.ordered + '</dd></div><div><dt>Received good</dt><dd>' + s.received + '</dd></div>' + (f.channel === 'web' ? '<div><dt>Damaged</dt><dd>' + s.damaged + '</dd></div>' : '') + '<div><dt>Still on order</dt><dd>' + s.remaining + '</dd></div></dl>' +
      '<div class="in-bin"><strong>' + (accounted() ? 'Stock has been recorded' : 'Waiting to be recorded') + '</strong><p>' + (accounted() ? s.received + ' good units in receiving.' + (s.damaged ? ' ' + s.damaged + ' in DAMAGE.' : '') : 'The delivery is here. The stock record changes when you receive it.') + '</p></div></aside>';
  }
  function task(title,copy,content,label) {
    return '<article class="in-task"><p class="in-step">' + (label || 'Your next step') + '</p><h2 id="in-step-title" tabindex="-1">' + title + '</h2><p>' + copy + '</p>' + feedback() + content + '</article>';
  }
  function device(title,html) { return '<div class="in-device"><div class="in-device-bar">' + title + '<span>Practice</span></div>' + html + '</div>'; }
  function resultView() {
    var s = current.state, f = fixture();
    var title = s.finished ? 'Purchase order completed' : 'Receipt recorded';
    var description = s.finished ? (s.integrated ? 'The status is Unassigned. In an integrated setup, export and closure in the external system still follow.' : 'The status is Receiving Complete. This practice order is closed.') :
      (deliveryLeft() ? 'You recorded part of the delivery. Continue with the units still waiting.' : s.remaining ? 'You received the delivery that arrived. The rest stays on the purchase order for a later delivery.' : 'All delivered units are recorded. Completing the purchase order is a separate action.');
    var actions = '<div class="in-actions">';
    if (!s.finished && deliveryLeft()) actions += button('more','Receive more of this delivery','in-primary');
    else if (!s.finished && f.channel !== 'asn') actions += button('review-complete',s.remaining ? 'Review before completing' : 'Complete this purchase order','in-primary');
    else actions += link('inbound','Choose another example','in-primary');
    actions += link('inbound',s.remaining && !s.finished ? 'Leave the order open' : 'Back to receiving','in-secondary') + '</div>';
    if (!s.finished && s.receipts.length && f.channel !== 'close') actions += button('undo','Undo the last practice receipt','in-link');
    return task(title, description, '<p class="in-status-row">Order status: <strong>' + escape(s.status) + '</strong></p>' + receipts() + actions + '<p class="in-note">This example changes only the practice record on this page.</p>', 'Result');
  }
  function completeView() {
    var s = current.state;
    return task('Complete this purchase order?', 'Choose Yes only when you are finished receiving against this order.',
      '<dl class="in-facts"><div><dt>Received good</dt><dd>' + s.received + '</dd></div><div><dt>Damaged</dt><dd>' + s.damaged + '</dd></div><div><dt>Still on order</dt><dd>' + s.remaining + '</dd></div></dl>' +
      (s.remaining ? '<p class="in-feedback" data-kind="error">There are ' + s.remaining + ' units still on order. Completing now does not receive them. Leave the order open if more will arrive.</p>' : '') +
      '<label for="integration-setup">Practice setup</label><select id="integration-setup"><option value="no"' + (!s.integrated ? ' selected' : '') + '>No connected external system</option><option value="yes"' + (s.integrated ? ' selected' : '') + '>Connected external system (ERP)</option></select><p class="in-field-note">Without a connection: Receiving Complete. With a connection: Unassigned, awaiting export and external closure.</p>' +
      '<div class="in-actions">' + button('confirm-close','Yes, complete order','in-primary') + button('cancel-close','No, keep order open') + '</div>', 'Confirm completion');
  }
  function mobileTask() {
    var f = fixture(), s = current.state;
    if (current.step === 0) return task('Open Receiving','This is the tile for purchase orders on the mobile app.',device('Mobile home',button('next','Receiving','in-order-button')), 'Step 1 of 5');
    if (current.step === 1) return task('Choose your purchase order','This example order is already assigned to you.',device('Receive',button('next',escape(f.po) + '<small>Bracken Trade Supplies / Assigned to you</small>','in-order-button')), 'Step 2 of 5');
    if (current.step === 2) return task('Choose the delivered item','Match the item number on the delivery label.',device('Receive Detail / ' + escape(f.po),button('next',escape(f.itemName) + '<small>' + escape(f.sku) + ' / ' + f.ordered + ' ordered / ' + s.received + ' received</small>','in-order-button')), 'Step 3 of 5');
    if (current.step >= 4) return resultView();
    var serial = f.tracking === 'serial';
    var fields = '';
    if (f.tracking !== 'basic') fields += field('receipt-core',coreLabel(),f.tracking === 'date' ? 'date' : 'text','',serial ? 'Read a unique number from the delivery label.' : 'Use the value printed on the delivery label.');
    if (!serial) fields += field('receipt-quantity','Qty / units arriving now','number','','Count this delivery. ' + deliveryLeft() + ' units are still waiting to be recorded.');
    if (serial) fields += '<p class="in-field-note">Click each labelled box in the warehouse to scan it. Each scan receives one unit. You can also type its number below.</p>';
    return task(serial ? 'Scan each serial number' : 'Record what arrived',serial ? 'Each unit needs its own serial number. Click its box in the 3D view, or type the number and choose Scan.' : 'Read the delivery label. Enter the quantity you actually received.',
      device('Receive Item Detail', '<form class="in-form" data-form="receipt" novalidate>' + fields + '<p class="in-field-note">Receiving location: ' + escape(s.location) + '</p><div class="in-actions"><button class="in-primary" type="submit">' + (serial ? 'Scan serial number' : 'OK') + '</button>' + button('back-step','Back') + '</div></form>'), 'Step 4 of 5');
  }
  function asnTask() {
    var f = fixture();
    if (current.step === 0) return task('Open Receive Inventory','Use this tile to scan a container from an assigned ASN shipment.',device('Mobile home',button('next','Receive Inventory','in-order-button')), 'Step 1 of 4');
    if (current.step === 1) return task('Scan the container label','Click the container in the warehouse to scan it. This shipment is already assigned to you.',device('Receive Inventory','<form class="in-form" data-form="container" novalidate>' + field('container-code','Container barcode','text','','You can also type ASN-1001 from its label.') + '<div class="in-actions"><button type="submit" class="in-primary">Look up container</button></div></form>'), 'Step 2 of 4');
    if (current.step >= 3) return resultView();
    return task('Check the container contents','The supplier sent these details in advance. You do not type each quantity.',device('Receive Inventory / ASN-1001',
      '<ul class="in-manifest">' + f.manifest.map(function (line) { return '<li><strong>' + escape(line.itemName) + '</strong><span>' + line.quantity + ' units' + (line.core ? ' / ' + escape(line.core) : '') + '</span></li>'; }).join('') + '</ul><form class="in-form" data-form="asn" novalidate>' + locationSelect() + '<button class="in-primary" type="submit">OK</button></form>'), 'Step 3 of 4');
  }
  function webTask() {
    var f = fixture();
    if (current.step === 0) return task('Find the purchase order','Use Process Receipt on the web console. ASN containers are received on mobile.',device('Process Receipt','<form class="in-form" data-form="web-order" novalidate>' + field('po-number','PO Number','text','','Type ' + escape(f.po) + ' from the delivery label.') + '<button type="submit" class="in-primary">GO</button></form>'), 'Step 1 of 3');
    if (current.step >= 2) return resultView();
    return task('Choose a bin and record the delivery','Four units arrived: three good, one damaged. The damaged unit goes to the Damage bin.',device('Process Receipt / ' + escape(f.po),'<form class="in-form" data-form="receipt" novalidate>' + locationSelect() +
      field('receipt-quantity',"Add Qty Recv'd / good units",'number','','Enter the good quantity only.') + field('receipt-damaged','Add Qty Damaged','number','','Good and damaged quantities are added together.') + '<button class="in-primary" type="submit">COMMIT TRANSACTIONS</button></form>') + receipts(), 'Step 2 of 3');
  }
  function closeTask() {
    if (current.state.finished) return resultView();
    return task('Review the received order','All four units have been received. The order is still open until you complete it.',device('Receive Detail / ' + escape(fixture().po),receipts() + button('review-complete','OK','in-primary')), 'Step 1 of 2');
  }
  function lesson() {
    var f = fixture();
    var body = current.closing ? completeView() : current.state.finished ? resultView() : ({mobile:mobileTask,asn:asnTask,web:webTask,close:closeTask}[f.channel])();
    return breadcrumbs(titles[f.id]) + '<header class="in-lesson-head"><p class="in-eyebrow">' + (f.channel === 'web' ? 'Web console' : 'Mobile app') + ' / Guided practice</p><h1>' + titles[f.id] + '</h1></header>' +
      '<div class="in-workspace"><div class="in-world-column"><div class="in-scene-slot"></div><p class="in-scan-readout" id="in-scan-readout" role="status">Click a box in the warehouse to read its label.</p>' + visual() + '</div>' + body + '</div><div class="in-task-commands">' + link(f.channel === 'mobile' ? 'mobile' : 'inbound','Back to examples') + button('restart','Start again','in-link') + '</div><p class="in-lesson-source">Guided 3D practice with simplified software screens. <a href="' + sourceRoot + sources[f.channel] + '" target="_blank" rel="noopener">Open the matching Endpoint Cloud guide (new tab)</a>.</p>';
  }
  function nativeScan(code) {
    if (!current) return;
    var f = fixture();
    if (!code) { document.getElementById('in-scan-readout').textContent = 'Click a labelled box to read it.'; return; }
    document.getElementById('in-scan-readout').textContent = 'Label read: ' + code;
    if (f.channel === 'asn' && current.step === 1) { var found = model.selectContainer(current.state,code); if (found.ok) next(2); else showFeedback(found.message); }
    else if (f.channel === 'mobile' && current.step === 2 && (code === f.sku || f.tracking !== 'basic')) next(3);
    else if (f.channel === 'mobile' && current.step === 3) {
      if (f.tracking === 'serial') receiveSerial(code);
      else if (f.tracking === 'lot' || f.tracking === 'date') { document.getElementById('receipt-core').value = code; showFeedback('Label read. Enter how many units arrived.','success','receipt-quantity'); }
      else showFeedback('Item label read: ' + code + '. Count the delivery, then enter the quantity.','success','receipt-quantity');
    }
  }
  function attachWarehouse() {
    if (!current) return;
    var target = main.querySelector('.in-scene-slot');
    main.querySelector('.in-task').inert = true;
    if (!lessonLaunchRequested && !window.InboundWarehouse) { target.innerHTML = '<div class="in-visual"><h2>Your 3D receiving lesson</h2><p>The warehouse loads once for all examples.</p>' + button('start-3d','Open the warehouse','in-primary') + '</div>'; return; }
    if (window.InboundWarehouse) { window.InboundWarehouse.mount(target,current.state,{onScan:nativeScan}); return; }
    target.innerHTML = '<p class="in-note" role="status">Opening the warehouse...</p>';
    window.loadInboundWarehouse().then(function () { if (current) attachWarehouse(); }).catch(function () { if (current) target.innerHTML = '<p>Could not load the warehouse. Check your connection and reload.</p>'; });
  }
  function render(focus) {
    if (window.InboundWarehouse) window.InboundWarehouse.park();
    var route = location.hash.slice(1), id = route.split('/')[1];
    current = null;
    if (route.indexOf('practice/') === 0 && model.catalog.some(function (f) { return f.id === id; })) {
      current = sessions[id] || (sessions[id] = newSession(id)); main.innerHTML = lesson();
    } else main.innerHTML = route === 'inbound' ? inbound() : route === 'mobile' ? mobile() : home();
    document.title = current ? titles[id] + ' | Receiving practice' : 'Receiving practice';
    document.body.classList.toggle('inbound-3d',!!current);
    if (current) attachWarehouse();
    if (focus) { var heading = document.getElementById('in-step-title') || main.querySelector('h1'); heading.tabIndex = -1; heading.focus(); }
  }
  function next(step) { current.step = step == null ? current.step + 1 : step; current.message = ''; render(true); }
  function receiptResult(result) {
    if (!result.ok) { showFeedback(result.message,'error'); return; }
    current.message = result.message; current.kind = 'success';
    current.step = fixture().channel === 'web' ? 2 : fixture().channel === 'asn' ? 3 : 4;
    render(true);
  }
  function receiveSerial(number) {
    var result = model.receive(current.state,{core:number});
    if (!result.ok) { showFeedback(result.message,'error','receipt-core'); return; }
    if (deliveryLeft() === 0) receiptResult(result);
    else { current.message = result.message + ' Scan the next unit.'; current.kind = 'success'; render(false); document.getElementById('receipt-core').focus(); }
  }
  main.addEventListener('click',function (event) {
    var lessonLink = event.target.closest('a[href^="#practice/"]');
    if (lessonLink) lessonLaunchRequested = true;
    var control = event.target.closest('[data-action]');
    if (!control || !current) return;
    var action = control.dataset.action;
    if (action === 'start-3d') { lessonLaunchRequested = true; attachWarehouse(); }
    else if (action === 'next') next();
    else if (action === 'back-step') next(Math.max(0,current.step - 1));
    else if (action === 'more') next(fixture().channel === 'web' ? 1 : fixture().channel === 'asn' ? 1 : 3);
    else if (action === 'review-complete') { current.closing = true; current.message = ''; render(true); }
    else if (action === 'cancel-close') { current.closing = false; current.message = 'The purchase order is still open. No quantities changed.'; current.kind = 'success'; render(true); }
    else if (action === 'confirm-close') {
      current.state.integrated = document.getElementById('integration-setup').value === 'yes';
      var completion = model.complete(current.state);
      if (completion.ok) { current.closing = false; current.message = ''; render(true); } else showFeedback(completion.message);
    } else if (action === 'undo') {
      var undo = model.undoLast(current.state);
      if (!undo.ok) { showFeedback(undo.message); return; }
      current.step = fixture().channel === 'web' ? 1 : fixture().channel === 'asn' ? 1 : 3;
      current.message = undo.message; current.kind = 'success'; render(true);
    } else if (action === 'restart') {
      restartId = fixture().id;
      restartDialog.showModal();
      if (window.InboundWarehouse) window.InboundWarehouse.setModal(true);
    }
  });
  main.addEventListener('submit',function (event) {
    var form = event.target.closest('[data-form]');
    if (!form || !current) return;
    event.preventDefault();
    var data = new FormData(form), f = fixture();
    if (form.dataset.form === 'web-order') {
      if (String(data.get('po-number')).trim().toUpperCase() !== f.po) { showFeedback('Use ' + f.po + ', the purchase order on this delivery label.','error','po-number'); return; }
      next(1); return;
    }
    if (form.dataset.form === 'container') {
      var selected = model.selectContainer(current.state,String(data.get('container-code')).trim());
      if (selected.ok) next(2); else showFeedback(selected.message,'error','container-code');
      return;
    }
    if (f.tracking === 'serial') { receiveSerial(String(data.get('receipt-core')).trim()); return; }
    if ((f.tracking === 'lot' || f.tracking === 'date') && String(data.get('receipt-core')).trim() !== f.core) {
      showFeedback('For this delivery, use ' + f.core + ' exactly as printed on the label.','error','receipt-core'); return;
    }
    var location = data.get('receipt-location');
    if (location !== null && !location) { showFeedback('Choose a receiving bin before recording any stock.','error','receipt-location'); return; }
    var payload = form.dataset.form === 'asn' ? {} : {quantity:data.get('receipt-quantity'),damaged:data.get('receipt-damaged') || 0,core:data.get('receipt-core') || ''};
    if (location !== null) payload.location = location;
    receiptResult(model.receive(current.state,payload));
  });
  var help = document.getElementById('in-help-dialog');
  document.getElementById('in-help').addEventListener('click',function () { help.showModal(); if(window.InboundWarehouse)window.InboundWarehouse.setModal(true); });
  help.addEventListener('close',function () { if(window.InboundWarehouse)window.InboundWarehouse.setModal(false); });
  document.getElementById('in-close-help').addEventListener('click',function () { help.close(); });
  var restartDialog = document.createElement('dialog');
  restartDialog.className = 'in-dialog'; restartDialog.setAttribute('aria-labelledby','in-restart-title');
  restartDialog.innerHTML = '<h2 id="in-restart-title">Start this example again?</h2><p>This clears your practice receipts for this example. The other examples keep their progress.</p><div class="in-actions"><button class="in-primary" id="in-confirm-restart" type="button">Start again</button><button id="in-cancel-restart" type="button">Keep practicing</button></div>';
  document.getElementById('inbound-app').appendChild(restartDialog);
  restartDialog.addEventListener('close',function () { if(window.InboundWarehouse)window.InboundWarehouse.setModal(false); });
  document.getElementById('in-cancel-restart').addEventListener('click',function () { restartDialog.close(); });
  document.getElementById('in-confirm-restart').addEventListener('click',function () { if (restartId) sessions[restartId] = newSession(restartId); restartDialog.close(); render(true); });
  window.addEventListener('hashchange',function () { restartDialog.close(); help.close(); render(true); });
  render(false);
}());
