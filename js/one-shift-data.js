(function (root) {
  'use strict';
  const O = root.OneShift = root.OneShift || {};
  O.VERSION = '1.0';
  O.items = {
    stove: {name:'Camp stoves', color:'#bd916c', ti:8, hi:5, pack:4},
    lantern: {name:'Trail lanterns', color:'#c7b26e', ti:8, hi:5, pack:6},
    chair: {name:'Folding chairs', color:'#879a87', ti:6, hi:4, pack:2},
    soup: {name:'Garden soup', color:'#a7b48b', ti:10, hi:5, pack:12},
    berry: {name:'Berry cups', color:'#b68f92', ti:10, hi:4, pack:12},
    towel: {name:'Cotton towels', color:'#d4c9b3', ti:8, hi:5, pack:8},
    radio: {name:'Pocket radios', color:'#92a7aa', ti:8, hi:4, pack:8},
    notebook: {name:'Pocket notebooks', color:'#be9e80', ti:10, hi:5, pack:24},
    housing: {name:'Lamp housings', color:'#acb3a2', ti:8, hi:4, pack:10},
    cable: {name:'Power cables', color:'#9ca4b0', ti:8, hi:5, pack:10},
    kit: {name:'Reading lamp kits', color:'#c6ae8b', ti:8, hi:4, pack:1}
  };
  O.clients = [
    {id:'trail', name:'Fern Trail Goods', type:'Outdoor goods', items:['stove','lantern','chair'], rule:'FIFO', volume:4, receive:18, ship:12, storage:.67, cases:.65, rep:0, requires:[], days:14, profile:'pallet', blurb:'Full pallets, a few case orders. Room to learn.'},
    {id:'grove', name:'Grove Pantry', type:'Food', items:['soup','berry'], rule:'FEFO', volume:5, receive:22, ship:16, storage:1.1, cases:.8, rep:65, requires:['cold'], days:21, profile:'pallet', blurb:'Best-by dates matter. Keep it cold.'},
    {id:'linen', name:'Linen Window', type:'Retail', items:['towel'], rule:'FIFO', volume:6, receive:20, ship:18, storage:.75, cases:.9, rep:70, requires:['labeler'], days:14, profile:'case', blurb:'Retail labels and a firm pickup window.'},
    {id:'signal', name:'Still Signal', type:'Electronics', items:['radio'], rule:'FIFO', volume:4, receive:25, ship:20, storage:1.2, cases:1.2, rep:75, requires:['cage'], days:21, profile:'pallet', blurb:'A locked cage earns a better rate.'},
    {id:'paper', name:'Paper Finch', type:'Online seller', items:['notebook'], rule:'FIFO', volume:3, receive:18, ship:12, storage:.7, cases:1.5, rep:60, requires:['pack'], days:14, profile:'parcel', blurb:'Small orders, all due at the parcel cutoff.'},
    {id:'lumen', name:'Lumen Workshop', type:'Manufacturer', items:['housing','cable'], rule:'FIFO', volume:4, receive:18, ship:16, storage:.67, cases:.9, rep:65, requires:['bench'], days:21, profile:'kit', blurb:'Two components become one lamp kit.'},
    {id:'reserve', name:'Quiet Reserve', type:'Long storage', items:['chair'], rule:'FIFO', volume:10, receive:12, ship:10, storage:1.4, cases:.5, rep:55, requires:[], days:30, profile:'storage', blurb:'Low turnover. Your space does the work.'},
    {id:'relay', name:'Field Relay', type:'Cross-dock', items:['stove','lantern'], rule:'FIFO', volume:8, receive:15, ship:16, storage:0, cases:.6, rep:60, requires:['crossdock'], days:14, profile:'crossdock', blurb:'In this morning, out this afternoon.'}
  ];
  const equipment = [
    ['rack','Ground rack',55,[], 'storage','Two pallet positions. Choose where they go.'],
    ['walkie','Electric walkie',260,[], 'throughput','Less effort and faster floor moves. Training included.'],
    ['training','Forklift training',80,[], 'people','Instruction, practice and a workplace evaluation.'],
    ['usedLift','Used forklift',620,['training'], 'throughput','Go vertical. Lower price, more maintenance.'],
    ['lift','Electric forklift',980,['training'], 'throughput','Faster moves with a dependable battery.'],
    ['upper','Upper rack levels',180,['forklift'], 'storage','Four levels in each rack bay.'],
    ['reach','Reach truck',1250,['forklift','upper'], 'storage','Higher storage, narrower working aisles.'],
    ['narrow','Narrow-aisle layout',350,['reach'], 'storage','Recover floor space with two-tile aisles.'],
    ['door','Another dock door',240,[], 'throughput','Receive and ship at the same time.'],
    ['appointments','Dock appointments',120,[], 'rules','Spread new arrivals through the shift.'],
    ['wrapStand','Wrap stand',95,[], 'throughput','A dedicated place to wrap picked pallets.'],
    ['wrapper','Stretch-wrap machine',430,['wrapStand'], 'throughput','Wrap while your worker does something else.'],
    ['labeler','Print-and-apply labeler',180,[], 'throughput','Correct retail labels, less hand work.'],
    ['conveyor','Shipping conveyor',520,['wrapper'], 'robots','Carries staged pallets to waiting outbound trucks.'],
    ['sorter','Parcel sortation',840,['conveyor','pack'], 'robots','Separates parcel orders by route.'],
    ['zones','Putaway zones',110,[], 'rules','Paint a storage area. It supplies destinations.'],
    ['pickFace','Pick faces',170,['zones'], 'rules','Ground positions replenished from reserve.'],
    ['waves','Order waves',160,[], 'rules','Release work together by departing truck.'],
    ['heatmap','Travel heat map',75,[], 'rules','See the paths your workers use most.'],
    ['cold','Cold room',480,[], 'services','Food storage with temperature control.'],
    ['cage','Secure cage',310,[], 'services','Separate, locked electronics storage.'],
    ['bench','Kitting bench',145,[], 'services','Combine components into paid kits.'],
    ['ticket','Retail ticketing',120,['bench'], 'services','Add price tickets and retailer labels.'],
    ['gifts','Gift-set table',160,['bench'], 'services','Pack two products as a gift set.'],
    ['displays','Display builds',220,['bench'], 'services','Build store-ready displays.'],
    ['returns','Returns station',190,[], 'services','Inspect and return sound goods to stock.'],
    ['refurb','Refurbishing tools',280,['returns'], 'services','Recover damaged cases after repair.'],
    ['assembly','Assembly station',450,['bench'], 'factory','Make lamp kits under a work order.'],
    ['kanban','Line-side bins',160,['assembly'], 'factory','Replenish both components before the line stops.'],
    ['line','Two-station line',720,['assembly'], 'factory','Assembly followed by inspection.'],
    ['inspection','Inspection fixture',310,['line'], 'factory','Catch defective kits before shipping.'],
    ['arm','Palletizing arm',1400,['line','inspection'], 'robots','Finish factory pallets automatically.'],
    ['shelves','Picking shelves',110,[], 'fulfillment','More pick faces for small products.'],
    ['cart','Pick cart',130,['shelves'], 'fulfillment','Move several parcel orders in one walk.'],
    ['pack','Pack station',210,['shelves'], 'fulfillment','Pick, pack and label small orders.'],
    ['cartonFlow','Carton flow rack',350,['pack'], 'fulfillment','Cases roll forward to the pick face.'],
    ['yard','Trailer parking',135,[], 'yard','Paid parking for visiting trailers.'],
    ['drop','Drop-trailer spaces',240,['yard'], 'yard','Store trailers without their tractors.'],
    ['shunter','Yard tractor',680,['drop'], 'yard','Move dropped trailers between doors.'],
    ['baler','Cardboard baler',260,[], 'recycling','Turn stripped cardboard into saleable bales.'],
    ['repair','Pallet repair bench',145,[], 'recycling','Repair empty wooden pallets for reuse.'],
    ['crossdock','Cross-dock lane',130,[], 'services','Transfer inbound goods directly to outbound.'],
    ['expansion','Expansion bay',540,[], 'storage','Another 1,920 square feet of working floor.'],
    ['secondBuilding','Second building',1800,['expansion'], 'storage','More storage and a linked dock.'],
    ['charger','Battery charger',160,['forklift'], 'throughput','Swap and recharge batteries during the shift.'],
    ['maintenance','Maintenance bench',170,['forklift'], 'throughput','Prevent breakdowns between shifts.'],
    ['robot','Mobile pallet robot',1250,['zones','forklift'], 'robots','Moves staged pallets into your zones.'],
    ['autoLift','Autonomous forklift',2100,['robot','upper'], 'robots','Takes routine storage and loading jobs.'],
    ['asrs','Automated storage',2600,['autoLift','reach'], 'storage','High-density storage with automatic retrieval.'],
    ['secondShift','Second shift',450,['forklift'], 'people','Keep working under the lights until 9 PM.']
  ];
  O.liveEquipment = new Set(['rack','walkie','training','usedLift','lift','upper','reach','door','appointments','wrapStand','wrapper','labeler','zones','cold','cage','bench','ticket','gifts','displays','returns','refurb','assembly','line','yard','drop','baler','repair','crossdock','expansion','charger','robot','autoLift','secondShift']);
  O.equipment = equipment.map(([id,name,cost,requires,branch,description])=>({id,name,cost,requires,branch,description}));
  O.staff = [
    {name:'Mara',role:'receiver',wage:48,color:'#a1b59b'},
    {name:'Eli',role:'driver',wage:58,color:'#a5b9bf'},
    {name:'June',role:'picker',wage:48,color:'#cab28e'},
    {name:'Ravi',role:'loader',wage:48,color:'#b5a5bd'}
  ];
  O.services = [
    {id:'kit', name:'Lamp kits', requires:'bench', inputs:{housing:1,cable:1}, output:'kit', fee:3, seconds:2},
    {id:'ticket', name:'Retail ticketing',requires:'ticket',inputs:{towel:1},output:'towel',fee:1.2,seconds:1},
    {id:'gift', name:'Trail gift sets',requires:'gifts',inputs:{stove:1,lantern:1},output:'kit',fee:3.2,seconds:2.3},
    {id:'display',name:'Store displays',requires:'displays',inputs:{towel:2},output:'kit',fee:3.8,seconds:2.5},
    {id:'return',name:'Returns inspection',requires:'returns',inputs:{notebook:1},output:'notebook',fee:1.8,seconds:1.5},
    {id:'refurb',name:'Radio repair',requires:'refurb',inputs:{radio:1},output:'radio',fee:2.8,seconds:2},
    {id:'assembly',name:'Lamp assembly',requires:'assembly',inputs:{housing:1,cable:1},output:'kit',fee:4,seconds:3}
  ];
  O.sources = {
    gs1:'https://ref.gs1.org/guidelines/logistic-label/',
    safety:'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.178',
    services:'https://redstagfulfillment.com/warehouse-services/',
    rates:'https://metcorpusa.com/pricing',
    production:'https://www.lean.org/lexicon-terms/',
    freight:'https://www.fmcsa.dot.gov/research-and-analysis/research/investigation-detention-time-commercial-motor-vehicle-industry'
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
