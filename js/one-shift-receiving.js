(function (root) {
  'use strict';
  const O = root.OneShift, P = O.Sim.prototype;
  const legacy = {command:P.command, occupied:P.occupied, businessSpot:P.businessSpot};
  const supplier = t => t?.direction === 'in' && t.supplier;
  const receiptFor = (t,id) => (t?.receipt || []).find(r => r.pallet === id);
  const failure = reason => ({ok:false,reason});
  const event = (s,text) => {s.events.push({kind:'scan',text,tick:s.tick});if(s.events.length>80)s.events.shift();};

  // Receipt acceptance and physical putaway are separate. A scan never adds cases,
  // charges cash, or makes goods available before the worker reaches the rack.
  P.setManualReceiving = function(enabled=true) {
    if (!O.business(this.s)) return false;
    this.s.commerce.manualReceiving = !!enabled;
    return this.s.commerce.manualReceiving;
  };
  P.receivingAccepted = function(id) {
    return this.s.trucks.some(t => supplier(t) && !!receiptFor(t,id));
  };
  P.receivingReachable = function(t,p) {
    return !t.manifest.some(id => {
      const other = this.p.get(id);
      return other?.place === 'trailer' && Math.floor(other.index/2) < Math.floor(p.index/2) && !receiptFor(t,id);
    });
  };
  P.occupied = function(x,y,level=0,except=null) {
    if (legacy.occupied.call(this,x,y,level,except)) return true;
    if (!O.business(this.s)) return false;
    return this.s.trucks.some(t => supplier(t) && (t.receipt || []).some(r => {
      const p = this.p.get(r.pallet), d = r.destination;
      return r.manual && d && p?.place === 'trailer' && p.id !== except && d.x === x && d.y === y && d.level === level;
    }));
  };
  P.businessSpot = function(w,p) {
    const t = p && this.t.get(p.truckId), receipt = receiptFor(t,p?.id), d = receipt?.destination;
    if (!receipt?.manual || !d || p.place !== 'trailer') return legacy.businessSpot.call(this,w,p);
    const s = this.s, high = O.has(s,'forklift') && ['player','driver','robot'].includes(w.role);
    const rack = s.map.racks.find(r => r.id === d.rack && r.y === d.y && d.x >= r.x && d.x < r.x+2);
    if (!rack || d.level >= rack.levels || d.level && !high || this.occupied(d.x,d.y,d.level,p.id)) return null;
    return O.pathing.path(s,w,{x:d.x,y:d.y+(O.has(s,'forklift')?2:1)},high) ? {...d} : null;
  };
  P.receivingPlan = function(id) {
    const s = this.s, p = this.p.get(id), t = p && this.t.get(p.truckId);
    if (!O.business(s) || !s.commerce.manualReceiving) return failure('Open receiving to scan stock.');
    if (!p || !supplier(t)) return failure('Choose a pallet from an incoming load.');
    if (p.place !== 'trailer' || receiptFor(t,p.id)) return failure('This pallet has already been scanned.');
    if (s.phase !== 'shift' || s.minute >= s.shiftEnd) return failure('Receive this load during the next shift.');
    if (t.status !== 'docked' || t.departureRequested || !s.map.doors.some(d => d.id === t.door)) return failure('Wait for the trailer to dock.');
    if (t.seal !== t.expectedSeal) return failure('The trailer seal does not match.');
    if (p.reservedBy) return failure('This pallet is already being handled.');
    if (p.hold || p.condition === 'damage') return failure('This pallet needs a damage review.');
    if (!this.receivingReachable(t,p)) return failure('Scan the front row first.');
    const workers = s.workers.slice().sort((a,b) => (a.queue.length+Number(!!a.task))-(b.queue.length+Number(!!b.task)) || a.id-b.id);
    for (const w of workers) {
      const destination = this.businessSpot(w,p);
      if (!destination) continue;
      const start = this.approach(p), high = O.has(s,'forklift') && ['player','driver','robot'].includes(w.role);
      if (O.pathing.path(s,w,start,high) && O.pathing.path(s,start,{x:destination.x,y:destination.y+(O.has(s,'forklift')?2:1)},high)) {
        return {ok:true,pallet:p.id,truck:t.id,worker:w.id,destination};
      }
    }
    return failure('Free a reachable rack position before scanning.');
  };
  P.receivingPallets = function(truckId) {
    const t = this.t.get(truckId);
    if (!O.business(this.s) || !supplier(t)) return [];
    return t.manifest.map(id => {
      const p = this.p.get(id);if(!p)return null;
      const receipt = receiptFor(t,id), scanned = !!receipt || p.place !== 'trailer';
      const plan = scanned ? failure('This pallet has already been scanned.') : this.receivingPlan(id);
      return {id:p.id,index:p.index,row:Math.floor(p.index/2),side:p.index%2,item:p.item,name:O.catalog[p.item]?.name || O.items[p.item].name,cases:receipt?.received ?? p.cases,sscc:p.sscc,label:O.labels.encode(p.sscc).text,lot:receipt?.lot || p.lot,bestBy:p.bestBy,receivedDay:p.receivedDay,place:p.place,scanned,accepted:scanned,busy:!!p.reservedBy,reachable:this.receivingReachable(t,p),canScan:plan.ok,reason:plan.reason || '',destination:receipt?.destination ? {...receipt.destination} : null};
    }).filter(Boolean);
  };
  P.receivingLoads = function() {
    if (!O.business(this.s)) return [];
    return this.s.trucks.filter(t => supplier(t) && t.status !== 'gone').map(t => {
      const pallets = this.receivingPallets(t.id), accepted = pallets.filter(p => p.scanned).length;
      return {id:t.id,truck:t.id,purchase:t.purchase || null,opening:!!t.openingShipment,status:t.status,door:t.door,doorNumber:this.s.map.doors.findIndex(d => d.id === t.door)+1,total:pallets.length,remaining:pallets.length-accepted,accepted,cases:pallets.reduce((n,p) => n+p.cases,0),arrival:t.arrival,deliveryDay:t.deliveryDay || this.s.day,pallets};
    });
  };
  P.prepareReceivingOpening = function() {
    const s = this.s, c = s.commerce;
    if (!O.business(s)) return failure('Start a business to receive stock.');
    if (c.receivingOpening) return {ok:true,truck:c.receivingOpening,reused:true};
    const stock = s.pallets.filter(p => p.place === 'storage' && !p.reservedBy && !p.businessOrder);
    if (s.day !== 1 || s.tick || s.trucks.length || s.journal.length || c.completed || c.purchases.length || c.queue.length || stock.length !== 6 || s.pallets.length !== 6 || s.workers.some(w => w.task || w.queue.length)) return failure('The opening load is only available in a new business.');
    const door = s.map.doors[0];if(!door)return failure('A receiving door is required.');
    this.setManualReceiving(true);
    const t = this.truck('in','trail',s.minute,[],[],{supplier:true,openingShipment:true,kind:'semi',status:'docked',door:door.id,checked:true,opened:true,inspected:true,deadline:10000,freeMinutes:10000,deliveryDay:s.day});
    stock.forEach((p,index) => {
      Object.assign(p,{place:'trailer',truckId:t.id,index,level:0,scanned:false,confirmed:false},O.docks.slot(s,door,index));
      t.manifest.push(p.id);
    });
    c.receivingOpening = t.id;
    this.occTick = -1;
    event(s,'Your opening stock is at the dock.');
    return {ok:true,truck:t.id,pallets:t.manifest.slice()};
  };
  P.command = function(c) {
    const s = this.s;
    if (c?.type === 'receivePallet') {
      const plan = this.receivingPlan(c.pallet);if(!plan.ok)return plan;
      const p = this.p.get(c.pallet), t = this.t.get(p.truckId);
      const receipt = {pallet:p.id,expected:p.expected,received:p.cases,condition:'sound',manual:true,sscc:p.sscc,lot:p.lot,scannedDay:s.day,scannedTick:s.tick,destination:{...plan.destination}};
      t.receipt.push(receipt);
      t.checked = t.inspected = t.opened = true;
      p.scanned = p.confirmed = true;p.bookCases = p.cases;p.recordedCondition = 'sound';
      this.occTick = -1;
      O.noteTerms(s,['SSCC','GS1-128','Case count','Putaway']);
      event(s,O.catalog[p.item].name+' / '+p.cases+' cases scanned.');
      return {ok:true,pallet:p.id,truck:t.id,receipt:{...receipt,destination:{...receipt.destination}},destination:{...plan.destination}};
    }
    if (O.business(s) && s.commerce.manualReceiving && c?.pallet) {
      const p = this.p.get(c.pallet), t = p && this.t.get(p.truckId);
      if (supplier(t) && p.place === 'trailer') {
        if (c.type === 'scan' || c.type === 'confirm') return failure('Use the receiving scanner for this load.');
        if (c.type === 'move' && !receiptFor(t,p.id)) return failure('Scan this pallet in receiving first.');
      }
    }
    return legacy.command.call(this,c);
  };

  const validate = O.saves.validate;
  O.saves.validate = function(raw) {
    const s = validate(raw);if(!O.business(s))return s;
    const c = s.commerce;
    if (c.manualReceiving !== undefined && typeof c.manualReceiving !== 'boolean') throw Error('Invalid receiving mode.');
    if (c.receivingOpening !== undefined && (!Number.isSafeInteger(c.receivingOpening) || c.receivingOpening < 1 || c.receivingOpening >= s.nextId)) throw Error('Invalid opening shipment.');
    const reserved = new Set();
    for (const t of s.trucks.filter(supplier)) {
      if (!Array.isArray(t.receipt)) throw Error('Invalid receiving receipt.');
      const accepted = new Set();
      for (const r of t.receipt.filter(r => r?.manual)) {
        const p = s.pallets.find(p => p.id === r.pallet), d = r.destination;
        if (r.manual !== true || !p || !t.manifest.includes(p.id) || accepted.has(p.id) || !Number.isSafeInteger(r.received) || r.received < 1 || r.received > 10000 || !Number.isSafeInteger(r.expected) || r.expected < 0 || r.expected > 10000 || r.sscc !== p.sscc || typeof r.lot !== 'string' || r.lot.length > 100 || r.condition !== 'sound' || !Number.isSafeInteger(r.scannedDay) || r.scannedDay < 1 || r.scannedDay > s.day || !Number.isSafeInteger(r.scannedTick) || r.scannedTick < 0 || r.scannedTick > s.tick) throw Error('Invalid receiving receipt.');
        accepted.add(p.id);
        const rack = d && s.map.racks.find(q => q.id === d.rack && q.y === d.y && d.x >= q.x && d.x < q.x+2);
        if (!d || d.place !== 'storage' || !Number.isInteger(d.x) || !Number.isInteger(d.y) || !Number.isInteger(d.level) || d.level < 0 || !rack || d.level >= rack.levels) throw Error('Invalid receiving destination.');
        if (p.place === 'trailer') {
          if (!p.scanned || !p.confirmed || p.cases !== r.received || p.lot !== r.lot) throw Error('Receiving record does not match its pallet.');
          const key = d.x+'/'+d.y+'/'+d.level;
          if (reserved.has(key) || s.pallets.some(q => q.id !== p.id && q.place === 'storage' && q.cases && q.x === d.x && q.y === d.y && q.level === d.level)) throw Error('Receiving position reserved twice.');
          reserved.add(key);
        }
      }
    }
    return s;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
