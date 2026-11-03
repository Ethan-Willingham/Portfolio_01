(function () {
  'use strict';
  var model = window.InboundPracticeModel;
  var main = document.getElementById('in-main');
  var sessions = Object.create(null);
  var current = null;
  var restartId = '';
  var lessonLaunchRequested = false;
  var scannerDialog, gameDialog, presentedId = '', hudState = {}, dialogKind = '';
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
  function newSession(id) { return {state:model.create(id),step:0,message:'',kind:'success',draft:{},scanned:false,walked:false,lastScan:''}; }
  function fixture() { return current.state.scenario; }
  function accounted() { return current.state.received + current.state.damaged; }
  function deliveryLeft() { return Math.max(0, fixture().delivery - accounted()); }
  function coreLabel() { return {lot:'Lot #',date:'Exp Date',serial:'Serial #'}[fixture().tracking] || 'Item value'; }
  var draftFields = {'receipt-core':'core','receipt-quantity':'quantity','receipt-damaged':'damaged','po-number':'poNumber','receipt-location':'location'};
  function draftValue(key,fallback) {
    if ((key === 'quantity' || key === 'damaged') && current.draft.receiptCount !== current.state.receipts.length) return fallback;
    return Object.prototype.hasOwnProperty.call(current.draft,key) ? current.draft[key] : fallback;
  }
  function rememberDraftField(control) {
    if (!current || !control || !draftFields[control.id]) return;
    var key = draftFields[control.id];
    current.draft[key] = control.value;
    if (key === 'quantity' || key === 'damaged') current.draft.receiptCount = current.state.receipts.length;
  }
  function rememberFormDraft() {
    if (current && scannerDialog && scannerDialog.open) scannerDialog.querySelectorAll('.in-scanner-body input,.in-scanner-body select').forEach(rememberDraftField);
  }
  function field(id,label,type,value,hint) {
    return '<label for="' + id + '">' + label + '</label><input id="' + id + '" name="' + id + '" type="' + (type || 'text') + '" value="' + escape(value == null ? '' : value) + '"' + (type === 'number' ? ' inputmode="numeric" min="0" step="1"' : '') + ' autocomplete="off"' + (hint ? ' aria-describedby="' + id + '-hint"' : '') + '>' + (hint ? '<p class="in-field-note" id="' + id + '-hint">' + hint + '</p>' : '');
  }
  function locationSelect() {
    var location = draftValue('location',current.state.location);
    return '<label for="receipt-location">' + (fixture().channel === 'web' ? 'Bin Number' : 'Receiving location') + '</label><select name="receipt-location" id="receipt-location"><option value=""' + (!location ? ' selected' : '') + '>Choose a receiving bin</option><option value="REC-02"' + (location === 'REC-02' ? ' selected' : '') + '>REC-02 / Receiving door 2</option></select><p class="in-field-note">This delivery is at REC-02. A bin is the named location where stock is recorded.</p>';
  }
  function feedback() { return '<p id="in-feedback" class="in-feedback" role="status" aria-live="polite" data-kind="' + current.kind + '"' + (!current.message ? ' hidden' : '') + '>' + escape(current.message) + '</p>'; }
  function showFeedback(message,kind,focusId) {
    current.message = message; current.kind = kind || 'error';
    var target = document.getElementById('in-feedback');
    if (target) { target.hidden = false; target.dataset.kind = current.kind; target.textContent = message; }
    floorNotice(message);
    if (window.InboundWarehouse) window.InboundWarehouse.feedback(current.kind !== 'error',message);
    if (focusId && scannerDialog && scannerDialog.open && document.getElementById(focusId)) document.getElementById(focusId).focus();
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
    if (serial) return task('Scan each serial number','Return to the warehouse. Aim the scanner at each unit label and hold left mouse. Each accepted scan receives one unit.',device('Receive Item Detail', '<p>' + s.received + ' of ' + f.delivery + ' units received.</p>' + receipts() + button('return-floor','Return to warehouse','in-primary')), 'Step 4 of 5');
    if (!current.scanned) return task('Read a delivery label','Return to the warehouse. Walk close to a carton, aim at its barcode and hold left mouse to scan.',device('Receive Item Detail',button('return-floor','Return to warehouse','in-primary')), 'Step 4 of 5');
    if (f.tracking !== 'basic') fields += field('receipt-core',coreLabel(),f.tracking === 'date' ? 'date' : 'text',draftValue('core',''),'Use the value printed on the delivery label.');
    fields += field('receipt-quantity','Qty / units arriving now','number',draftValue('quantity',''),'Count this delivery. ' + deliveryLeft() + ' units are still waiting to be recorded.');
    return task('Record what arrived','You read the label on the warehouse floor. Enter the quantity you actually received.',
      device('Receive Item Detail', '<form class="in-form" data-form="receipt" novalidate>' + fields + '<p class="in-field-note">Receiving location: ' + escape(s.location) + '</p><div class="in-actions"><button class="in-primary" type="submit">'+(f.tracking === 'basic'?'OK':'Add Line')+'</button>' + button('return-floor','Back to warehouse') + '</div></form>'), 'Step 4 of 5');
  }
  function asnTask() {
    var f = fixture();
    if (current.step === 0) return task('Open Receive Inventory','Use this tile to scan a container from an assigned ASN shipment.',device('Mobile home',button('next','Receive Inventory','in-order-button')), 'Step 1 of 4');
    if (current.step === 1) return task('Scan the container label','Return to the floor. Aim at the barcode on the front of the container and hold left mouse. This shipment is assigned to you.',device('Receive Inventory',button('return-floor','Return to warehouse','in-primary')), 'Step 2 of 4');
    if (current.step >= 3) return resultView();
    return task('Check the container contents','The supplier sent these details in advance. You do not type each quantity.',device('Receive Inventory / ASN-1001',
      '<ul class="in-manifest">' + f.manifest.map(function (line) { return '<li><strong>' + escape(line.itemName) + '</strong><span>' + line.quantity + ' units' + (line.core ? ' / ' + escape(line.core) : '') + '</span></li>'; }).join('') + '</ul><form class="in-form" data-form="asn" novalidate>' + locationSelect() + '<button class="in-primary" type="submit">OK</button></form>'), 'Step 3 of 4');
  }
  function webTask() {
    var f = fixture();
    if (current.step === 0) return task('Find the purchase order','Use Process Receipt on the web console. ASN containers are received on mobile.',device('Process Receipt','<form class="in-form" data-form="web-order" novalidate>' + field('po-number','PO Number','text',draftValue('poNumber',''),'Type ' + escape(f.po) + ' from the delivery label.') + '<button type="submit" class="in-primary">GO</button></form>'), 'Step 1 of 3');
    if (current.step >= 2) return resultView();
    return task('Choose a bin and record the delivery','Four units arrived: three good, one damaged. The damaged unit goes to the Damage bin.',device('Process Receipt / ' + escape(f.po),'<form class="in-form" data-form="receipt" novalidate>' + locationSelect() +
      field('receipt-quantity',"Add Qty Recv'd / good units",'number',draftValue('quantity',''),'Enter the good quantity only.') + field('receipt-damaged','Add Qty Damaged','number',draftValue('damaged',''),'Good and damaged quantities are added together.') + '<button class="in-primary" type="submit">COMMIT TRANSACTIONS</button></form>') + receipts(), 'Step 2 of 3');
  }
  function closeTask() {
    if (current.state.finished) return resultView();
    return task('Review the received order','All four units have been received. The order is still open until you complete it.',device('Receive Detail / ' + escape(fixture().po),receipts() + button('review-complete','OK','in-primary')), 'Step 1 of 2');
  }
  function floorNotice(message) { var node = document.getElementById('in-floor-notice'); if (node) node.textContent = message || ''; }
  function instruction() {
    var f = fixture(), s = current.state;
    if (hudState.holding) return {title:'Set the carton down',instruction:'Let go of E or the left mouse button to set it inside the marked REC-02 receiving area. Stock is recorded separately.'};
    if (s.finished) return {title:'Purchase order completed',instruction:'You can explore the warehouse, or choose another receiving lesson from Menu.'};
    if (current.closing) return {title:'Review the order',instruction:'Open the handheld screen to confirm completion or leave the order open.'};
    if (f.channel === 'close') return {title:'Review the received order',instruction:'Right click to inspect the handheld. The four cartons are received; the purchase order still needs completion.'};
    if (accounted() === f.delivery) return {title:'Delivery received',instruction:s.remaining ? 'The other '+s.remaining+' units remain on order. Open the handheld to review, or leave the order open.' : 'Your receipt is recorded. Open '+(f.channel === 'web' ? 'the office computer' : 'the handheld')+' to review the result.'};
    if (!current.walked) return {title:'Walk to the delivery',instruction:'Use WASD or the arrow keys. Look down at the cartons by Goods Receiving. Hold E to lift a box; release E to set it down.'};
    if (f.channel === 'web') return {title:'Use the office computer',instruction:'Check the four cartons: three good, one damaged. Walk to the glass office across the warehouse, aim at the monitor and press E.'};
    if (f.channel === 'asn') return current.step === 0 ? {title:'Open Receive Inventory',instruction:'Right click to inspect your handheld, then choose Receive Inventory.'} : current.step === 1 ? {title:'Scan the container',instruction:'Aim at the barcode on the front of the container and hold left mouse. F is an alternate scan key.'} : {title:'Confirm the manifest',instruction:'Right click to review the five units on your handheld. Choose OK to receive the container.'};
    if (current.step < 3) return {title:'Open your receiving task',instruction:'Right click to inspect the handheld. Choose Receiving, '+f.po+', then '+f.itemName.toLowerCase()+'.'};
    if (f.tracking === 'serial') return {title:'Scan each serial label',instruction:'Aim at each carton barcode and hold left mouse. Each accepted scan receives one unit. '+s.received+' of '+f.delivery+' received.'};
    if (!current.scanned) return {title:'Scan a delivery label',instruction:'Move close, aim at a carton barcode, and hold left mouse. Use F for a single scan.'};
    return {title:'Record what arrived',instruction:'Right click to inspect your handheld. Enter the counted quantity'+(f.tracking !== 'basic'?' and the label value':'')+', then choose '+(f.tracking === 'basic'?'OK':'Add Line')+'.'};
  }
  function taskView() { return current.closing ? completeView() : current.state.finished ? resultView() : ({mobile:mobileTask,asn:asnTask,web:webTask,close:closeTask}[fixture().channel])(); }
  function lesson() {
    return '<section class="in-game-shell" aria-label="Receiving warehouse game"><div class="in-scene-slot"></div><div class="in-game-hud"><aside class="in-game-guide" aria-label="Current task"><p class="in-eyebrow">'+escape(titles[fixture().id])+'</p><h1 id="in-game-objective"></h1><p id="in-game-instruction"></p><div class="in-game-progress" id="in-game-progress"></div></aside><nav class="in-game-tools" aria-label="Game controls">'+button('open-device',fixture().channel === 'web'?'Office':'TC22')+button('guide','Guide <kbd>H</kbd>')+button('menu','Menu <kbd>Esc</kbd>')+'</nav><span class="in-game-reticle" aria-hidden="true"></span><p class="in-game-context" id="in-game-context"></p><div class="in-game-keys"><span><kbd>WASD</kbd> Walk</span><span><kbd>E</kbd> Hold to carry</span><span>Right click: handheld</span></div></div><p id="in-floor-notice" role="status" aria-live="polite"></p></section>'+
      '<dialog class="in-scanner-dialog" id="in-scanner-dialog" aria-labelledby="in-device-title"><header class="in-scanner-header"><div><h2 id="in-device-title">TC22</h2><p>Receiving / Practice</p></div>'+button('return-floor','Return to warehouse')+'</header><div class="in-scanner-body"></div><footer class="in-scanner-footer"><span>'+escape(fixture().po)+' / REC-02</span><span>Example delivery</span></footer></dialog><dialog class="in-game-dialog" id="in-game-dialog" aria-labelledby="in-game-dialog-title"></dialog>';
  }
  function refreshHUD() {
    if (!current) return;
    var guide = instruction(), f = fixture();
    document.getElementById('in-game-objective').textContent = guide.title;
    document.getElementById('in-game-instruction').textContent = guide.instruction;
    document.getElementById('in-game-progress').textContent = accounted()+' / '+f.delivery+' delivered units recorded';
    var context = document.getElementById('in-game-context');
    context.textContent = hudState.hint ? (hudState.hintKey ? hudState.hintKey+' / ' : '')+hudState.hint : 'Left mouse: scan label / Right mouse: handheld';
    if (window.InboundWarehouse) window.InboundWarehouse.update(current.state,guide);
  }
  function onHUD(value) {
    var previous=hudState.inbound||{}, scan=value.inbound||{};
    hudState=value; if (!current) return;
    if(scan.hasWalked)current.walked=true;
    if(scan.scannerMessage && (scan.scannerFeedback==='error'||scan.scannerFeedback==='success') &&
      (scan.scannerMessage!==previous.scannerMessage||scan.scannerFeedback!==previous.scannerFeedback))floorNotice(scan.scannerMessage);
    refreshHUD();
  }
  function onDevice(open,computer) {
    if (!current || !scannerDialog) return;
    if (!open) { rememberFormDraft(); if(scannerDialog.open)scannerDialog.close(); return; }
    scannerDialog.classList.toggle('is-computer',!!computer);
    document.getElementById('in-device-title').textContent=computer?'Office computer':'TC22';
    scannerDialog.querySelector('.in-scanner-body').innerHTML=computer && fixture().channel!=='web' ? '<article class="in-task"><h2>Use your handheld for this lesson</h2><p>This receiving method uses the TC22. Return to the warehouse and right click to inspect it.</p>'+button('return-floor','Return to warehouse','in-primary')+'</article>' : taskView();
    if(!scannerDialog.open)scannerDialog.showModal();
  }
  function closeGameDialog(resume) { if(gameDialog && gameDialog.open)gameDialog.close();dialogKind='';if(window.InboundWarehouse){window.InboundWarehouse.setModal(false);if(resume)window.InboundWarehouse.play();} }
  function openGameDialog(kind) {
    if (!current) return;
    if(scannerDialog.open && window.InboundWarehouse)window.InboundWarehouse.closeDevice(false);
    dialogKind=kind;
    var f=fixture(), guide=instruction();
    var body=kind==='guide' ? '<h2 id="in-game-dialog-title">How to receive this delivery</h2><p><strong>'+escape(guide.title)+'</strong></p><p>'+escape(guide.instruction)+'</p><ul><li>WASD or arrow keys: walk. Mouse: look around.</li><li>Hold E to carry a carton. Release E to put it down. Right mouse rotates a held carton.</li><li>Hold left mouse to scan a barcode. F takes one scan.</li><li>Right click or Tab: inspect your handheld. Q: equip or stow it.</li><li>Walk to the office monitor and press E to use web receiving.</li></ul><p>'+f.delivery+' units arrived against '+f.ordered+' ordered on '+escape(f.po)+'.</p><p><a href="'+sourceRoot+sources[f.channel]+'" target="_blank" rel="noopener">Open the matching Endpoint Cloud guide (new tab)</a></p>' : '<h2 id="in-game-dialog-title">Warehouse paused</h2><p>'+escape(titles[f.id])+'. '+accounted()+' of '+f.delivery+' delivered units recorded.</p>';
    gameDialog.innerHTML=body+'<div class="in-actions">'+button('resume-game','Back to game','in-primary')+(kind==='menu'?button('guide','How to play')+button('restart','Start this lesson again')+link('inbound','Choose another lesson','in-secondary'):'')+'</div>';
    if(window.InboundWarehouse)window.InboundWarehouse.setModal(true);
    if(!gameDialog.open)gameDialog.showModal();
  }
  function nativeScan(code) {
    if (!current || !code) return;
    var f=fixture();
    if (f.channel==='asn' && current.step===1) { var selected=model.selectContainer(current.state,code); if(selected.ok){current.scanned=true;current.lastScan=code;next(2);showFeedback('Container read. Right click to check its contents.','success');}else showFeedback(selected.message);return; }
    var matches=f.tracking==='serial'?f.serials.indexOf(code)!==-1:code===(f.core||f.sku);
    if(!matches){showFeedback('That label is not the item for this task. Aim at this delivery.');return;}
    current.scanned=true;current.lastScan=code;if(f.tracking==='lot'||f.tracking==='date')current.draft.core=code;
    if(f.channel==='mobile' && current.step===3 && f.tracking==='serial'){receiveSerial(code);return;}
    render(false);showFeedback('Read '+code+'. Right click to continue on the handheld.','success');
  }
  function attachWarehouse() {
    if (!current) return;
    var target=main.querySelector('.in-scene-slot');
    if(!lessonLaunchRequested&&!window.InboundWarehouse){target.innerHTML='<div class="in-warehouse-loading"><h2>Enter the warehouse</h2><p>Walk, carry cartons and scan their labels. Use a keyboard and mouse.</p>'+button('start-3d','Play this lesson','in-primary')+'</div>';return;}
    if(window.InboundWarehouse){window.InboundWarehouse.mount(target,current.state,{guide:instruction(),onScan:nativeScan,onHUD:onHUD,onDevice:onDevice,onNotice:floorNotice,onMenu:function(){if(restartDialog.open)restartDialog.close();else if(gameDialog.open)closeGameDialog(true);else openGameDialog('menu');},onHelp:function(){openGameDialog('guide');},onAvailability:function(value){var control=main.querySelector('[data-action="open-device"]');if(control)control.disabled=!value;}});if(gameDialog.open||restartDialog.open)window.InboundWarehouse.setModal(true);return;}
    target.innerHTML='<div class="in-warehouse-loading"><h2>Opening the warehouse...</h2></div>';
    window.loadInboundWarehouse().then(function(){if(current)attachWarehouse();}).catch(function(){if(current)target.innerHTML='<div class="in-warehouse-loading"><h2>The warehouse could not load.</h2><p>Check your connection and reload this page.</p></div>';});
  }
  function render(focus,reset) {
    var route=location.hash.slice(1),id=route.split('/')[1];
    var playable=route.indexOf('practice/')===0&&model.catalog.some(function(f){return f.id===id;});
    if(!playable||presentedId!==id){
      if(window.InboundWarehouse)window.InboundWarehouse.park();
      if(scannerDialog&&scannerDialog.open)scannerDialog.close();if(gameDialog&&gameDialog.open)gameDialog.close();
      presentedId='';current=null;scannerDialog=gameDialog=null;hudState={};
    }
    document.body.classList.toggle('inbound-game',playable);document.body.classList.remove('inbound-3d');
    if(playable){
      current=sessions[id]||(sessions[id]=newSession(id));
      if(presentedId!==id){main.innerHTML=lesson();presentedId=id;scannerDialog=document.getElementById('in-scanner-dialog');gameDialog=document.getElementById('in-game-dialog');scannerDialog.addEventListener('cancel',function(e){e.preventDefault();window.InboundWarehouse.closeDevice(true);});gameDialog.addEventListener('cancel',function(e){e.preventDefault();closeGameDialog(true);});attachWarehouse();}
      scannerDialog.querySelector('.in-scanner-body').innerHTML=taskView();refreshHUD();
      if(reset&&window.InboundWarehouse)window.InboundWarehouse.update(current.state,instruction(),true);
      if(focus&&scannerDialog.open){var heading=document.getElementById('in-step-title');if(heading)heading.focus();}
    }else{main.innerHTML=route==='inbound'?inbound():route==='mobile'?mobile():home();if(focus){var title=main.querySelector('h1');title.tabIndex=-1;title.focus();}}
    document.title=current?titles[id]+' | Receiving practice':'Receiving practice';
  }
  function next(step) { current.step = step == null ? current.step + 1 : step; current.message = ''; render(true); }
  function receiptResult(result) {
    if (!result.ok) { showFeedback(result.message,'error'); return; }
    current.message = result.message; current.kind = 'success';
    current.step = fixture().channel === 'web' ? 2 : fixture().channel === 'asn' ? 3 : 4;
    render(true);
    floorNotice(result.message); if(window.InboundWarehouse)window.InboundWarehouse.feedback(true,result.message);
  }
  function receiveSerial(number) {
    if (!canReceive()) return;
    var result = model.receive(current.state,{core:number});
    if (!result.ok) { showFeedback(result.message,'error','receipt-core'); return; }
    if (deliveryLeft() === 0) receiptResult(result);
    else { current.message = result.message + ' Scan the next unit.'; current.kind = 'success'; render(false); }
    floorNotice(current.message);window.InboundWarehouse.feedback(true,current.message);
  }
  function canReceive() {
    if(!window.InboundWarehouse||!window.InboundWarehouse.checkReceiving()){showFeedback('Put every delivered carton down inside REC-02 before recording this receipt.');return false;}
    return true;
  }
  main.addEventListener('input',function (event) { rememberDraftField(event.target); });
  main.addEventListener('change',function (event) { rememberDraftField(event.target); });
  main.addEventListener('click',function (event) {
    var lessonLink = event.target.closest('a[href^="#practice/"]');
    if (lessonLink) lessonLaunchRequested = true;
    var control = event.target.closest('[data-action]');
    if (!control || !current) return;
    var action = control.dataset.action;
    if (action === 'start-3d') { lessonLaunchRequested = true; attachWarehouse(); }
    else if (action === 'open-device') { if(window.InboundWarehouse)window.InboundWarehouse.openDevice(); }
    else if (action === 'return-floor') { if(window.InboundWarehouse)window.InboundWarehouse.closeDevice(true); }
    else if (action === 'guide') openGameDialog('guide');
    else if (action === 'menu') openGameDialog('menu');
    else if (action === 'resume-game') closeGameDialog(true);
    else if (action === 'next') next();
    else if (action === 'back-step') next(Math.max(0,current.step - 1));
    else if (action === 'more') next(fixture().channel === 'web' ? 1 : fixture().channel === 'asn' ? 1 : 3);
    else if (action === 'review-complete') { current.closing = true; current.message = ''; render(true); }
    else if (action === 'cancel-close') { current.closing = false; current.message = 'The purchase order is still open. No quantities changed.'; current.kind = 'success'; render(true); }
    else if (action === 'confirm-close') {
      if(!window.InboundWarehouse||!window.InboundWarehouse.ready())return;
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
      closeGameDialog(false);
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
    if (!canReceive()) return;
    if (f.channel==='mobile' && !current.scanned) { showFeedback('Return to the floor and scan a delivery label first.'); return; }
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
  document.getElementById('in-confirm-restart').addEventListener('click',function () { if (restartId) sessions[restartId] = newSession(restartId); restartDialog.close(); hudState={}; render(true,true); if(window.InboundWarehouse)window.InboundWarehouse.play(); });
  window.addEventListener('hashchange',function () { restartDialog.close(); help.close(); render(true); });
  render(false);
}());
