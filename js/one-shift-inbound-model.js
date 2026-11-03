(function (root, factory) {
  'use strict';
  var model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.InboundPracticeModel = model;
}(typeof window === 'object' ? window : this, function () {
  'use strict';

  // Fictional, session-only training data. This model never calls Endpoint Cloud.
  // Every fixture uses whole units and a vendor that does not allow over-receiving.
  var catalog = [
    {id:'basic', title:'Receive items', description:'Count the delivery and record its quantity.', channel:'mobile', tracking:'basic', ordered:4, delivery:4, sku:'TAPE-48', itemName:'Packing tape', po:'PO-1001', bin:'REC-02'},
    {id:'lot', title:'Receive by lot number', description:'Record the batch number printed on the delivery.', channel:'mobile', tracking:'lot', ordered:4, delivery:4, sku:'GLOVE-M', itemName:'Work gloves', po:'PO-1002', bin:'REC-02', core:'LOT-204'},
    {id:'serial', title:'Receive by serial number', description:'Scan each unit separately using its unique number.', channel:'mobile', tracking:'serial', ordered:2, delivery:2, sku:'SCAN-01', itemName:'Handheld scanner', po:'PO-1003', bin:'REC-02', serials:['SN-1001','SN-1002']},
    {id:'date', title:'Receive by expiration date', description:'Record the date printed on the delivery.', channel:'mobile', tracking:'date', ordered:3, delivery:3, sku:'WIPE-01', itemName:'Cleaning wipes', po:'PO-1004', bin:'REC-02', core:'2027-06-30'},
    {id:'partial', title:'Receive part of an order', description:'Receive the three units that arrived. Leave the other three outstanding.', channel:'mobile', tracking:'basic', ordered:6, delivery:3, sku:'TAPE-48', itemName:'Packing tape', po:'PO-1005', bin:'REC-02'},
    {id:'asn', title:'Receive an ASN container', description:'Use the supplier\'s advance shipment details to receive a whole container.', channel:'asn', tracking:'basic', ordered:5, delivery:5, sku:'MIXED', itemName:'Mixed container', po:'PO-1006', bin:'REC-02', container:'ASN-1001', manifest:[
      {sku:'TAPE-48', itemName:'Packing tape', quantity:3, core:''},
      {sku:'GLOVE-M', itemName:'Work gloves', quantity:2, core:'LOT-204'}
    ]},
    {id:'web', title:'Receive on the web', description:'Choose a receiving location, then record good and damaged quantities.', channel:'web', tracking:'basic', ordered:4, delivery:4, deliveryGood:3, deliveryDamaged:1, sku:'TAPE-48', itemName:'Packing tape', po:'PO-1007', bin:'REC-02'},
    {id:'close', title:'Complete a purchase order', description:'Review the received quantities and decide whether to complete the order.', channel:'close', tracking:'basic', ordered:4, delivery:4, sku:'TAPE-48', itemName:'Packing tape', po:'PO-1008', bin:'REC-02'}
  ];
  catalog.forEach(function (scenario) { scenario.uom = 'EA'; scenario.unitLabel = 'units'; });
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function result(ok, message, extra) { return Object.assign({ok:ok, message:message}, extra || {}); }
  function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
  function count(value, defaultValue) {
    if (value === undefined && defaultValue !== undefined) return defaultValue;
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !value.trim()) return null;
    var number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  }
  function dateIsValid(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var date = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
  }
  function open(state) {
    return !state.finished ? null : result(false, 'This purchase order is complete. Start the practice again to make another receipt.');
  }
  function binIsValid(bin) { return bin === 'REC-01' || bin === 'REC-02'; }
  function recalculate(state) {
    var inventory = [];
    state.received = 0;
    state.damaged = 0;
    state.receipts.forEach(function (receipt) {
      receipt.lines.forEach(function (line) {
        state.received += line.quantity;
        state.damaged += line.damaged;
        [[line.quantity,line.location,'Good'],[line.damaged,'DAMAGE','Damaged']].forEach(function (part) {
          if (!part[0]) return;
          var entry = inventory.find(function (row) { return row.sku === line.sku && row.core === line.core && row.location === part[1] && row.condition === part[2]; });
          if (!entry) {
            entry = {sku:line.sku, itemName:line.itemName, core:line.core, location:part[1], condition:part[2], quantity:0};
            inventory.push(entry);
          }
          entry.quantity += part[0];
        });
      });
    });
    state.inventory = inventory;
    state.remaining = state.scenario.ordered - state.received - state.damaged;
    state.deliveryRemaining = state.scenario.delivery - state.received - state.damaged;
    state.containerReceived = state.receipts.some(function (receipt) { return !!receipt.container; });
  }
  function post(state, lines, container, requestId) {
    var receipt = {id:'R-' + state.nextReceipt++, po:state.scenario.po, location:state.location, container:container || '', requestId:requestId || '', lines:clone(lines)};
    receipt.quantity = lines.reduce(function (total, line) { return total + line.quantity; },0);
    receipt.damaged = lines.reduce(function (total, line) { return total + line.damaged; },0);
    receipt.core = lines.length === 1 ? lines[0].core : '';
    state.receipts.push(receipt);
    state.journal.push({type:'Receive', receiptId:receipt.id, po:receipt.po, lines:clone(receipt.lines)});
    state.status = 'Receiving';
    recalculate(state);
    return receipt;
  }
  function create(id, options) {
    var scenario = clone(catalog.find(function (item) { return item.id === id; }) || catalog[0]);
    var state = {scenario:scenario, integrated:!!(options && options.integrated), receipts:[], inventory:[], journal:[], received:0, damaged:0, remaining:scenario.ordered, deliveryRemaining:scenario.delivery, status:'Assigned', location:scenario.channel === 'web' ? '' : scenario.bin, selectedContainer:false, containerReceived:false, finished:false, nextReceipt:1};
    if (id === 'close') post(state, [{sku:scenario.sku, itemName:scenario.itemName, quantity:scenario.ordered, damaged:0, core:'', location:state.location}], '', 'prepared-receipt');
    return state;
  }
  function setLocation(state, bin) {
    var blocked = open(state); if (blocked) return blocked;
    bin = clean(bin).toUpperCase();
    if (!binIsValid(bin)) return result(false, 'Choose REC-01 or REC-02, the two receiving locations in this practice.');
    state.location = bin;
    return result(true, 'Receiving location set to ' + bin + '.');
  }
  function selectContainer(state, code) {
    var blocked = open(state); if (blocked) return blocked;
    if (state.scenario.channel !== 'asn') return result(false, 'Container receiving is available in the ASN practice.');
    if (state.containerReceived) return result(false, 'This container has already been received. Its inventory was recorded only once.');
    if (clean(code).toUpperCase() !== state.scenario.container) return result(false, 'Use the container label ' + state.scenario.container + ' from this delivery.');
    state.selectedContainer = state.scenario.container;
    return result(true, 'Container found. Review its contents, then choose OK.', {manifest:clone(state.scenario.manifest)});
  }
  function receive(state, input) {
    input = input || {};
    var blocked = open(state); if (blocked) return blocked;
    var scenario = state.scenario;
    var requestId = clean(input.requestId);
    if (requestId && state.receipts.some(function (receipt) { return receipt.requestId === requestId; })) return result(false, 'This receipt has already been recorded.');
    var location = input.location === undefined ? state.location : clean(input.location).toUpperCase();
    if (!binIsValid(location)) return result(false, 'Choose a receiving location before recording the receipt.');
    if (scenario.channel === 'asn') {
      if (state.containerReceived) return result(false, 'This container has already been received. Its inventory was recorded only once.');
      if (!state.selectedContainer) return result(false, 'Scan the container label first to see its contents.');
      state.location = location;
      var asnReceipt = post(state, scenario.manifest.map(function (line) { return {sku:line.sku, itemName:line.itemName, quantity:line.quantity, damaged:0, core:line.core, location:location}; }), scenario.container, requestId);
      state.selectedContainer = false;
      return result(true, 'Container received. All ' + asnReceipt.quantity + ' units are recorded in ' + location + '.', {receipt:clone(asnReceipt)});
    }
    var quantity = count(input.quantity, scenario.tracking === 'serial' ? 1 : undefined);
    var damaged = count(input.damaged, 0);
    if (quantity === null || damaged === null) return result(false, 'Enter whole quantities of zero or more. Leave no quantity field blank.');
    if (quantity + damaged <= 0) return result(false, 'Enter at least one unit to receive.');
    if (damaged && scenario.channel !== 'web') return result(false, 'Use the web receiving practice to record damaged units.');
    if (scenario.deliveryGood !== undefined && quantity > scenario.deliveryGood - state.received) return result(false, 'This delivery has ' + scenario.deliveryGood + ' good units and ' + scenario.deliveryDamaged + ' damaged unit. Only ' + (scenario.deliveryGood - state.received) + ' good units are still waiting. Enter the damaged quantity separately.');
    if (scenario.deliveryDamaged !== undefined && damaged > scenario.deliveryDamaged - state.damaged) return result(false, 'Only ' + (scenario.deliveryDamaged - state.damaged) + ' damaged units from this delivery are still waiting. Record the good units in Add Qty Recv\'d.');
    if (quantity + damaged > state.remaining) return result(false, 'That is more than the order has left. This practice vendor does not allow over-receiving.');
    if (quantity + damaged > state.deliveryRemaining) return result(false, 'Only ' + state.deliveryRemaining + ' units from this delivery are still waiting. Record what actually arrived.');
    var core = clean(input.core);
    if ((scenario.tracking === 'lot' || scenario.tracking === 'serial' || scenario.tracking === 'date') && !core) return result(false, 'Enter the ' + (scenario.tracking === 'lot' ? 'lot number' : scenario.tracking === 'serial' ? 'serial number' : 'expiration date') + ' from the delivery label.');
    if (scenario.tracking === 'date' && !dateIsValid(core)) return result(false, 'Enter a valid expiration date in YYYY-MM-DD format.');
    if (scenario.tracking === 'serial') {
      if (quantity !== 1) return result(false, 'Receive one unit for each serial number.');
      core = core.toUpperCase();
      if (scenario.serials.indexOf(core) < 0) return result(false, 'Use SN-1001 or SN-1002 from this delivery.');
      if (state.receipts.some(function (receipt) { return receipt.lines.some(function (line) { return line.core === core; }); })) return result(false, 'That serial number is already received. Scan the other unit.');
    }
    if (scenario.tracking === 'basic') core = '';
    state.location = location;
    var receipt = post(state, [{sku:scenario.sku, itemName:scenario.itemName, quantity:quantity, damaged:damaged, core:core, location:location}], '', requestId);
    return result(true, quantity + ' good ' + (quantity === 1 ? 'unit' : 'units') + ' received in ' + location + (damaged ? '; ' + damaged + ' damaged ' + (damaged === 1 ? 'unit' : 'units') + ' recorded in DAMAGE' : '') + '.', {receipt:clone(receipt)});
  }
  function complete(state) {
    var blocked = open(state); if (blocked) return blocked;
    state.finished = true;
    state.status = state.integrated ? 'Unassigned' : 'Receiving Complete';
    state.selectedContainer = false;
    state.journal.push({type:'Complete', po:state.scenario.po, status:state.status, outstanding:state.remaining});
    return result(true, state.integrated ? 'Receiving finished. Status: Unassigned. The external business system still needs to post the receipts and close the order.' : 'Purchase order closed. Status: Receiving Complete.');
  }
  function undoLast(state) {
    // Training-only correction: all stock is still at receiving, nothing is exported,
    // and a completed order must be restarted. Production Undo has further rules.
    var blocked = open(state); if (blocked) return blocked;
    if (!state.receipts.length) return result(false, 'There is no receipt to undo.');
    var receipt = state.receipts.pop();
    state.journal.push({type:'Undo', receiptId:receipt.id, po:receipt.po, lines:receipt.lines.map(function (line) { return Object.assign({}, line, {quantity:-line.quantity, damaged:-line.damaged}); })});
    state.selectedContainer = false;
    recalculate(state);
    state.status = state.receipts.length ? 'Receiving' : 'Assigned';
    return result(true, 'Last receipt undone. The delivery quantities are ready to enter again.');
  }
  return {catalog:catalog, create:create, setLocation:setLocation, selectContainer:selectContainer, receive:receive, complete:complete, undoLast:undoLast};
}));
