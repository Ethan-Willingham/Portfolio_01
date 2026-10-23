(function (root) {
  'use strict';
  const O = root.OneShift, P = O.Sim.prototype;
  const AISLES = ['A','B','C','D'], LEVELS = 4, MAX_ORDINAL = 1000000;
  const enabled = s => s?.map?.inventoryNextOrdinal !== undefined;
  const hasOrdinal = rack => rack.inventoryOrdinal !== undefined;
  const int = value => Number.isSafeInteger(value) && value >= 0;

  function validateLayout(s, allowMissing = false) {
    const racks = s.map.racks, present = racks.some(hasOrdinal);
    if (!enabled(s)) {
      if (present) throw Error('Inventory rack ordinals need a layout counter.');
      return false;
    }
    const next = s.map.inventoryNextOrdinal;
    if (!O.manualHandling?.(s) || !int(next) || next < 4 || next > MAX_ORDINAL) throw Error('Invalid inventory layout counter.');
    const used = new Set();
    for (const rack of racks) {
      if (!hasOrdinal(rack) && allowMissing) continue;
      const ordinal = rack.inventoryOrdinal;
      if (!int(ordinal) || ordinal >= next || ordinal >= MAX_ORDINAL || used.has(ordinal)) throw Error('Invalid inventory rack ordinal.');
      if (rack.id <= 4 ? ordinal !== rack.id-1 : ordinal < 4) throw Error('Inventory rack identity does not match its aisle.');
      used.add(ordinal);
    }
    return true;
  }

  function legacyOrdinals(s) {
    const result = new Map();
    let next = 4;
    for (const rack of s.map.racks.slice().sort((a,b)=>a.id-b.id)) result.set(rack.id,rack.id<=4?rack.id-1:next++);
    return {ordinals:result,next};
  }

  // Opt in explicitly at the public manual-business boot. This writes only the
  // stable address metadata; projections below never initialize or mutate it.
  O.ensureInventoryLayout = function (sim) {
    const s = sim.s;
    if (!O.manualHandling?.(s)) return false;
    const exists = validateLayout(s,true);
    if (!exists) {
      const initial = legacyOrdinals(s);
      for (const rack of s.map.racks) rack.inventoryOrdinal = initial.ordinals.get(rack.id);
      s.map.inventoryNextOrdinal = initial.next;
      return true;
    }
    const missing = s.map.racks.filter(rack=>!hasOrdinal(rack)).sort((a,b)=>a.id-b.id);
    if (s.map.inventoryNextOrdinal+missing.filter(rack=>rack.id>4).length > MAX_ORDINAL) throw Error('Inventory address capacity reached.');
    for (const rack of missing) rack.inventoryOrdinal = rack.id<=4 ? rack.id-1 : s.map.inventoryNextOrdinal++;
    return true;
  };

  function layoutOf(sim) {
    const s = sim.s;
    if (!O.manualHandling?.(s)) return null;
    const registered = validateLayout(s);
    const fallback = registered ? null : legacyOrdinals(s).ordinals;
    return s.map.racks.map(rack=>{
      const ordinal = registered ? rack.inventoryOrdinal : fallback.get(rack.id);
      return {rack,ordinal,aisle:AISLES[ordinal%4],aisleIndex:ordinal%4,bay:Math.floor(ordinal/4)};
    }).sort((a,b)=>a.ordinal-b.ordinal);
  }

  function locationFor(layout, pallet) {
    if (!pallet || pallet.place !== 'storage' || !(pallet.cases>0) || !int(pallet.level) || pallet.level>=LEVELS) return null;
    const entry = layout.find(({rack})=>rack.y===pallet.y&&(pallet.x===rack.x||pallet.x===rack.x+1));
    if (!entry) return null;
    const side = pallet.x-entry.rack.x;
    return {aisle:entry.aisle,aisleIndex:entry.aisleIndex,bay:entry.bay,bayNumber:entry.bay+1,rack:entry.rack.id,level:pallet.level,side,slot:entry.rack.id+'-'+pallet.level+'-'+side};
  }

  O.inventoryLocation = function (sim, pallet) {
    const layout = layoutOf(sim);
    if (!layout) return null;
    return locationFor(layout,typeof pallet==='number'?sim.p.get(pallet):pallet);
  };

  function projectStock(sim, p, location) {
    return {id:p.id,item:p.item,name:O.catalog?.[p.item]?.name||O.items[p.item].name,cases:p.cases,lot:p.lot,sscc:p.sscc,receivedDay:p.receivedDay,bestBy:p.bestBy,place:p.place,confirmed:!!p.confirmed,held:!!p.hold,wrapped:!!p.wrapped,labelled:!!p.labelled,order:p.businessOrder||null,claimed:sim.claimedCases(p.id),costBasis:p.costBasis,unitCost:p.unitCost,artIndex:O.palletArtIndex(p),...location};
  }

  O.inventorySnapshot = function (sim, aisle = null, bay = 0) {
    const layout = layoutOf(sim);
    if (!layout) return null;
    const s = sim.s, slots = new Map(sim.handRackSlots().map(slot=>[slot.id,slot]));
    const stock = new Map();
    for (const pallet of s.pallets) {
      const location = locationFor(layout,pallet);
      if (location) stock.set(location.slot,projectStock(sim,pallet,location));
    }
    const lift = O.has(s,'forklift'), trained = !!s.owned.training;
    const aisles = AISLES.map((id,index)=>({id,name:'Aisle '+id,index,bays:[],bayCount:0,pallets:0,cases:0,usable:0,installed:0,available:0}));
    for (const entry of layout) {
      const {rack} = entry, name = 'Bay '+(entry.bay+1);
      const view = {id:entry.aisle+'-'+String(entry.bay+1).padStart(2,'0'),index:entry.bay,bay:entry.bay,number:entry.bay+1,aisle:entry.aisle,rack:rack.id,name,ordinal:entry.ordinal,levels:rack.levels,positions:[],pallets:0,cases:0,usable:0,installed:0,available:0};
      for (let level=0; level<LEVELS; level++) for (let side=0; side<2; side++) {
        const id = rack.id+'-'+level+'-'+side, source = slots.get(id), pallet = stock.get(id)||null;
        const installed = level<rack.levels;
        const locked = !installed || level>0&&(!lift||!trained);
        const available = !!source?.available && !locked && !pallet;
        const reason = !installed ? 'Unlock upper storage in the equipment catalog.' : level>0&&!trained ? 'Complete forklift training to use upper positions.' : level>0&&!lift ? 'A forklift is required for upper positions.' : pallet ? 'Occupied by pallet '+pallet.id+'.' : !available ? 'Reserved for incoming stock.' : '';
        view.positions.push({id,slot:id,index:level*2+side,rack:rack.id,aisle:entry.aisle,aisleIndex:entry.aisleIndex,bay:entry.bay,level,side,x:rack.x+side,y:rack.y,place:'storage',pallet:pallet?.id||null,stock:pallet,installed,locked,available,reason,name:source?.name||'Rack '+rack.id+' / '+(side?'right':'left')+' / level '+(level+1),label:'Aisle '+entry.aisle+' / '+name+' / level '+(level+1)+' / '+(side?'right':'left')});
        view.pallets += Number(!!pallet); view.cases += pallet?.cases||0;
        view.installed += Number(installed); view.usable += Number(!locked); view.available += Number(available);
      }
      const summary = aisles[entry.aisleIndex];
      summary.bays.push(view); summary.bayCount++;
      for (const key of ['pallets','cases','usable','installed','available']) summary[key] += view[key];
    }
    const requested = typeof aisle==='number' ? AISLES[aisle] : typeof aisle==='string' ? aisle.toUpperCase() : null;
    const selected = aisles.find(value=>value.id===requested)||null;
    const requestedBay = Number.isSafeInteger(bay)&&bay>=0 ? bay : 0;
    const current = selected?.bays.find(value=>value.index===requestedBay)||selected?.bays[0]||null;
    const positions = current?.positions||[];
    return {aisle:selected?.id||null,aisleIndex:selected?.index??null,bay:current?.index??requestedBay,bayNumber:current?.number||null,rack:current?.rack||null,title:current?'Aisle '+selected.id+' / '+current.name:selected?selected.name:'Inventory',aisles,bays:selected?.bays||[],positions,pallets:positions.filter(position=>position.stock).map(position=>position.stock),totalPallets:aisles.reduce((n,value)=>n+value.pallets,0),totalCases:aisles.reduce((n,value)=>n+value.cases,0),usable:aisles.reduce((n,value)=>n+value.usable,0),installed:aisles.reduce((n,value)=>n+value.installed,0),available:aisles.reduce((n,value)=>n+value.available,0)};
  };

  const command = P.command, restore = P.restore, validate = O.saves.validate;
  P.command = function (action) {
    const active = enabled(this.s);
    if (active && this.s.map.inventoryNextOrdinal>=MAX_ORDINAL && (action?.type==='buy'&&action.id==='rack'||action?.type==='build'&&action.kind==='rack')) return {ok:false,reason:'Inventory address capacity reached.'};
    const result = command.call(this,action);
    if (result.ok && active) O.ensureInventoryLayout(this);
    return result;
  };
  P.restore = function (state) {
    const active = enabled(this.s)||enabled(state);
    validateLayout(state);
    restore.call(this,state);
    if (active && O.manualHandling?.(this.s)) O.ensureInventoryLayout(this);
  };
  O.saves.validate = function (raw) {
    const state = validate(raw);
    validateLayout(state);
    return state;
  };
})(typeof globalThis!=='undefined'?globalThis:window);
