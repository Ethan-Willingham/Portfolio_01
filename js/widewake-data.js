/* Widewake content. Port coordinates are geographic; prices and encounters are fiction. */
(function (root) {
  'use strict';
  const goods = [
    { id:'sugar', name:'Sugar', base:32, color:'#dfc288', icon:'sack' },
    { id:'coffee', name:'Coffee', base:58, color:'#b8796d', icon:'sack' },
    { id:'tea', name:'Tea', base:72, color:'#9ec79a', icon:'crate' },
    { id:'spice', name:'Spices', base:110, color:'#d9978c', icon:'sack' },
    { id:'cloth', name:'Textiles', base:68, color:'#b79bc4', icon:'roll' },
    { id:'wood', name:'Timber', base:36, color:'#cf9f78', icon:'wood' },
    { id:'iron', name:'Iron', base:84, color:'#8fb3c7', icon:'ingot' },
    { id:'oil', name:'Crude oil', base:96, color:'#a4a293', icon:'barrel' },
    { id:'fish', name:'Fish', base:44, color:'#8fb3c7', icon:'fish' },
    { id:'pearl', name:'Pearls', base:270, color:'#e8e2d6', icon:'pearl' }
  ];
  // id, name, country, longitude, latitude, cheap export, wanted import, danger, art sheet, cell, local detail
  const rows = [
    ['havana','Havana','Cuba',-82.37,23.14,'sugar','tea',1,1,0,'Sugar sacks on the quay. A little cutter with a great deal of ocean ahead.'],
    ['nassau','Nassau','The Bahamas',-77.34,25.08,'pearl','sugar',1,1,1,'Shallow water, shell divers, and a good price for Cuban sugar.'],
    ['new-york','New York','United States',-74.01,40.70,'iron','coffee',2,1,2,'The foundries want coffee. The freighters leave heavy with iron.'],
    ['reykjavik','Reykjavik','Iceland',-21.94,64.15,'fish','wood',3,1,3,'Cold-water boats unload before the weather turns. Timber is scarce.'],
    ['bergen','Bergen','Norway',5.32,60.39,'wood','spice',3,2,0,'Red warehouses, drying nets, and the smell of pine boards.'],
    ['london','London','United Kingdom',0.70,51.48,'cloth','tea',2,2,1,'At the Thames anchorage, the tea brokers are always buying.'],
    ['lisbon','Lisbon','Portugal',-9.14,38.70,'cloth','sugar',2,2,2,'Traders at the river mouth swap cloth for sweet cargo.'],
    ['marseille','Marseille','France',5.35,43.29,'cloth','oil',3,2,3,'The Mediterranean yards need fuel. Their cloth travels everywhere.'],
    ['alexandria','Alexandria','Egypt',29.87,31.20,'sugar','iron',3,3,0,'Low stone walls, cotton bales, and work for an iron merchant.'],
    ['dakar','Dakar','Senegal',-17.43,14.67,'fish','cloth',2,3,1,'Painted fishing boats fill the beach below the market.'],
    ['cape-town','Cape Town','South Africa',18.43,-33.91,'iron','spice',4,3,2,'Table Mountain above the docks. Rough water beyond the cape.'],
    ['rio','Rio de Janeiro','Brazil',-43.17,-22.90,'coffee','iron',2,3,3,'Coffee comes down from the hills. Buy it before the next fleet does.'],
    ['buenos-aires','Buenos Aires','Argentina',-58.36,-34.60,'wood','tea',3,4,0,'Wide brown water and warehouses full of timber.'],
    ['valparaiso','Valparaiso','Chile',-71.63,-33.03,'iron','cloth',4,4,1,'Colorful houses climb the hill above the Pacific anchorage.'],
    ['san-francisco','San Francisco','United States',-122.48,37.81,'wood','spice',3,4,2,'Fog hides the far shore. There is money in spices from the west.'],
    ['honolulu','Honolulu','Hawaii',-157.87,21.30,'sugar','iron',3,4,3,'An island stop in a very large ocean. Keep the hold stocked.'],
    ['yokohama','Yokohama','Japan',139.65,35.45,'tea','oil',4,5,0,'Tea chests, low tiled roofs, and a harbor full of workboats.'],
    ['shanghai','Shanghai','China',121.90,31.20,'cloth','coffee',4,5,1,'Textiles leave by the boatload from the river anchorage.'],
    ['singapore','Singapore','Singapore',103.85,1.25,'spice','wood',4,5,2,'The straits gather ships from both sides of the world.'],
    ['mumbai','Mumbai','India',72.82,18.94,'spice','iron',3,5,3,'Pepper sacks stack higher than the dockmaster. Watch the monsoon.'],
    ['muscat','Muscat','Oman',58.59,23.62,'oil','fish',4,6,0,'White houses, ochre hills, and oil tenders along the quay.'],
    ['mombasa','Mombasa','Kenya',39.68,-4.06,'coffee','cloth',3,6,1,'Dhows carry coffee past the old stone fort.'],
    ['sydney','Sydney','Australia',151.26,-33.84,'wood','tea',4,6,2,'Sandstone docks and a long trip to almost anywhere.'],
    ['auckland','Auckland','New Zealand',174.80,-36.83,'fish','oil',4,6,3,'Green islands shelter the fishing fleet from the open Pacific.']
  ];
  const ports=rows.map(r=>Object.fromEntries(['id','name','country','lon','lat','cheap','wanted','danger','sheet','cell','detail'].map((k,i)=>[k,r[i]])));
  const hulls=[
    { id:'cutter',name:'Cutter',cost:0,rank:1,hp:200,speed:150,hold:40,guns:1,description:'A quick little boat. Enough room to start something.' },
    { id:'brig',name:'Brig',cost:2800,rank:2,hp:380,speed:165,hold:70,guns:2,description:'A second cannon and room for a proper cargo.' },
    { id:'corvette',name:'Corvette',cost:7500,rank:4,hp:650,speed:180,hold:100,guns:3,description:'Fast enough to choose a fight. Strong enough to stay.' },
    { id:'frigate',name:'Frigate',cost:18000,rank:6,hp:1100,speed:175,hold:150,guns:4,description:'Four guns, a deep hold, and a place at the front of a fleet.' },
    { id:'leviathan',name:'Leviathan',cost:42000,rank:8,hp:1900,speed:170,hold:230,guns:6,description:'A floating fortress for the far side of the ocean.' }
  ];
  const boats=[
    {id:'escort',name:'Gunboat',cost:950,rank:1,hp:180,hold:12,speed:190,damage:19,rate:.85,range:450,description:'Follows your flagship and fires at nearby threats.'},
    {id:'trawler',name:'Fishing trawler',cost:750,rank:1,hp:320,hold:60,speed:165,damage:8,rate:1.5,range:270,description:'Works marked fishing grounds while you hold off raiders.'},
    {id:'freighter',name:'Cargo lighter',cost:700,rank:1,hp:260,hold:110,speed:155,damage:9,rate:1.6,range:300,description:'A generous hold and a little stern gun.'},
    {id:'oilrig',name:'Oil tender',cost:2200,rank:3,hp:480,hold:100,speed:155,damage:10,rate:1.4,range:320,description:'Extracts crude from offshore fields. Needs a patient escort.'},
    {id:'destroyer',name:'Destroyer',cost:4800,rank:4,hp:480,hold:24,speed:190,damage:45,rate:.65,range:600,description:'Twin long-range guns keep a wide circle clear.'},
    {id:'repair',name:'Repair launch',cost:3400,rank:3,hp:240,hold:35,speed:180,damage:10,rate:1.2,range:320,description:'Repairs nearby friendly hulls during a voyage.'}
  ];
  const relics=[
    {id:'brass',name:'Brass fire control',rarity:'Uncommon',description:'Cannon reloads 18% faster.',stat:'rate',value:.82},
    {id:'magnet',name:'Salvage winch',rarity:'Uncommon',description:'Collect floating salvage from twice as far away.',stat:'magnet',value:2},
    {id:'turbine',name:'Bluewater turbine',rarity:'Rare',description:'Cruising speed increases 20%.',stat:'speed',value:1.2},
    {id:'shell',name:'Thunder shells',rarity:'Rare',description:'Cannon hits explode across a small area.',stat:'splash',value:65},
    {id:'plate',name:'Whalebone plating',rarity:'Rare',description:'Incoming hull damage reduced by 22%.',stat:'armor',value:.78},
    {id:'heart',name:'Heart of the current',rarity:'Legendary',description:'Your whole fleet slowly repairs at sea.',stat:'heal',value:2.5},
    {id:'glass',name:'Deepwater glass',rarity:'Legendary',description:'Doubles the chance of a rare catch.',stat:'rare',value:2}
  ];
  const fish=[
    {id:'flying',name:'Flying fish',region:'warm',value:180,rarity:'Uncommon',color:'#8fb3c7'},
    {id:'mahi',name:'Golden mahi-mahi',region:'warm',value:450,rarity:'Rare',color:'#dfc288'},
    {id:'moon',name:'Moon jelly',region:'warm',value:320,rarity:'Rare',color:'#b79bc4'},
    {id:'bluefin',name:'Giant bluefin',region:'cold',value:560,rarity:'Rare',color:'#8fb3c7'},
    {id:'ice',name:'Glass icefish',region:'cold',value:700,rarity:'Rare',color:'#e8e2d6'},
    {id:'oarfish',name:'Ribbon oarfish',region:'deep',value:1200,rarity:'Legendary',color:'#d9978c'},
    {id:'coelacanth',name:'Coelacanth',region:'deep',value:1800,rarity:'Legendary',color:'#b79bc4'},
    {id:'sunfish',name:'Little sunfish',region:'warm',value:240,rarity:'Uncommon',color:'#cf9f78'},
    {id:'lantern',name:'Lanternfish',region:'deep',value:850,rarity:'Rare',color:'#dfc288'}
  ];
  const sites=[
    ['bahama-bank','Bahama Bank','fish',-78.2,26.1,1,'warm'],
    ['gulf','Gulf field','oil',-90,25.5,2,'warm'],
    ['grand-banks','Grand Banks','fish',-49,44,2,'cold'],
    ['iceland-bank','Iceland shelf','fish',-24,62,3,'cold'],
    ['north-sea','North Sea field','oil',2,57,3,'cold'],
    ['canary','Canary grounds','fish',-18,26,2,'warm'],
    ['brazil-field','Santos field','oil',-40,-25,3,'warm'],
    ['patagonia','Patagonian shelf','fish',-61,-45,4,'cold'],
    ['cape-field','Cape field','oil',15,-35,4,'deep'],
    ['arabian','Arabian field','oil',61,23,4,'warm'],
    ['mozambique','Mozambique Channel','fish',43,-17,3,'deep'],
    ['bengal','Bay of Bengal','fish',87,13,3,'warm'],
    ['java','Java Sea field','oil',110,-5,4,'warm'],
    ['japan-trench','Japan Trench','fish',145,35,5,'deep'],
    ['coral','Coral Sea','fish',155,-20,4,'warm'],
    ['tasman','Tasman deep','fish',164,-39,5,'deep'],
    ['pacific-deep','Mid-Pacific deep','fish',-151,16,5,'deep'],
    ['alaska','Alaskan grounds','fish',-149,55,4,'cold']
  ].map(r=>Object.fromEntries(['id','name','type','lon','lat','danger','region'].map((k,i)=>[k,r[i]])));
  const bosses=[
    {id:'widow',name:'The Red Widow',lon:-62,lat:27,rank:3,hp:2600,reward:2400,relic:'shell',description:'A raider flagship east of the Bahamas.'},
    {id:'iron-king',name:'The Iron King',lon:56,lat:-8,rank:5,hp:5800,reward:6500,relic:'heart',description:'An armored convoy in the western Indian Ocean.'},
    {id:'last-light',name:'Last Light',lon:-164,lat:-12,rank:8,hp:12000,reward:18000,relic:'glass',description:'The largest pirate fleet in the Pacific.'}
  ];
  const upgrades=[
    {id:'guns',name:'Cannons',base:400,description:'+20% cannon damage per level.'},
    {id:'hull',name:'Hull bracing',base:300,description:'+70 flagship hull per level.'},
    {id:'engine',name:'Engine',base:350,description:'+8% speed for the whole fleet per level.'},
    {id:'hold',name:'Cargo racks',base:220,description:'+16 cargo capacity on your flagship per level.'}
  ];
  const signals=[
    {id:'calypso',name:'The Calypso wreck',kind:'wreck',lon:-74,lat:28,danger:1,reward:420,relic:'brass',text:'A yellow funnel sticks out of the water. The captain’s safe is still below deck. Raiders have been picking over the floating cargo.',quickGood:'wood',quickQty:8},
    {id:'lantern',name:'A lantern in the swell',kind:'rescue',lon:-53,lat:39,danger:2,reward:900,boatName:'Little Mercy',text:'A hospital launch has broken its propeller. Its captain can patch the shaft, but armed boats are approaching. Keep the launch afloat for 45 seconds.'},
    {id:'cooper',name:'The wandering cooper',kind:'trader',lon:-29,lat:42,danger:2,good:'cloth',qty:14,price:520,text:'A cargo lighter carries more cloth than its captain can sell. The offer is for the whole stack. He is in no hurry to reach land.'},
    {id:'bell',name:'The bell under the ice',kind:'wreck',lon:-26,lat:61,danger:3,reward:1100,relic:'plate',text:'The wreck’s bell knocks against a buried mast. A diver signals that a sound hull plate can be brought up, if you can hold position.',quickGood:'iron',quickQty:10},
    {id:'pilgrim',name:'The Pilgrim’s last engine',kind:'rescue',lon:-12,lat:34,danger:2,reward:850,boatName:'Pilgrim',text:'A packet boat is burning dirty fuel. Give its engineer 45 seconds to clear the intake while you keep the raiders off.'},
    {id:'sargasso',name:'Sargasso blockade',kind:'battle',lon:-49,lat:22,danger:2,reward:1200,text:'Raiders have chained empty barges across a shipping lane. Clear their patrol and the local merchants will pay for the passage.'},
    {id:'namib',name:'The sand-colored ghost',kind:'wreck',lon:10,lat:-24,danger:3,reward:1700,relic:'turbine',text:'An abandoned survey ship rides low beside the desert coast. Its engine is worth more than the cargo. Cutting it free will draw attention.',quickGood:'oil',quickQty:16},
    {id:'spice-runner',name:'The broken dhow',kind:'rescue',lon:51,lat:-5,danger:4,reward:2400,boatName:'Blue Heron',text:'The dhow’s rudder is jammed hard to port. Her crew know these waters well. Buy them 45 seconds and they can get her moving again.'},
    {id:'sunda',name:'The Sunda provisioner',kind:'trader',lon:99,lat:-6,danger:3,good:'spice',qty:18,price:1150,text:'A provisioner is selling pepper from a water-stained ledger. The sacks are dry. There is room to make a profit at the Cape.'},
    {id:'glass-current',name:'The glass-current wreck',kind:'wreck',lon:149,lat:33,danger:4,reward:2600,relic:'magnet',text:'Loose fittings glitter in unusually clear water. The wreck lies deep enough that the recovery line will need time.',quickGood:'pearl',quickQty:8},
    {id:'orchard',name:'A floating orchard',kind:'trader',lon:165,lat:-28,danger:3,good:'tea',qty:22,price:850,text:'Planters have lashed their cargo across an old barge. The tea is sealed in waxed chests. The captain would rather sell here than risk the next storm.'},
    {id:'silent-station',name:'The silent weather station',kind:'battle',lon:-174,lat:-9,danger:5,reward:4200,relic:'shell',text:'A stolen weather ship is guiding Last Light’s patrols. Clear the boats around it and break the Pacific warning chain.'},
    {id:'compass',name:'A compass pointing home',kind:'rescue',lon:-144,lat:19,danger:4,reward:2500,boatName:'Homeward',text:'A fishing boat’s engine has stopped. Her skipper keeps turning a pocket compass in his hand. Defend her while the crew gets the engine running.'},
    {id:'southern-bell',name:'The southern bell',kind:'wreck',lon:-67,lat:-52,danger:4,reward:2300,relic:'plate',text:'A survey vessel went down trying to round the cape. The wreck still holds its iron bracing. The water around it is watched.',quickGood:'iron',quickQty:18},
    {id:'fog-bank',name:'Patrol in the fog',kind:'battle',lon:-128,lat:38,danger:3,reward:1900,text:'Three stolen fishing boats have been turned into gun platforms. Their escorts are intercepting every freighter that comes south.'}
  ];
  const charters=[
    {id:'company',title:'A company of your own',voice:'Mara, the Havana dockmaster',intro:'Twelve sacks of sugar and a borrowed gunboat. Nassau will buy the sugar. After that, put a trawler to work and come back with something larger than this cutter.',reward:800,xp:120,steps:[
      {kind:'stat',key:'sugar',total:6,text:'Sell 6 sugar in Nassau.',target:'nassau'},
      {kind:'stat',key:'fish',total:12,text:'Land 12 fish with a working trawler.',target:'bahama-bank'},
      {kind:'hull',key:'brig',text:'Make the brig your flagship.',service:'yard'}]},
    {id:'atlantic',title:'The western blockade',voice:'Ines, the Nassau shipwright',intro:'The Calypso went down east of here carrying gun fittings. Past her wreck, the Red Widow has been stopping ships bound for Europe. Bring a fleet you can afford to repair.',reward:1800,xp:350,steps:[
      {kind:'signal',key:'calypso',text:'Recover something from the Calypso.',target:'calypso'},
      {kind:'boss',key:'widow',text:'Break the Red Widow’s blockade.',target:'widow'},
      {kind:'port',key:'lisbon',text:'Reach Lisbon across the Atlantic.',target:'lisbon'}]},
    {id:'north',title:'A cold-water ledger',voice:'Edda, the Reykjavik harbormaster',intro:'There is a market beyond the warm-water routes. Bergen has timber. We need it. Work a northern fishing ground along the way; the holds should never come home empty.',reward:2400,xp:500,steps:[
      {kind:'port',key:'bergen',text:'Visit the timber docks in Bergen.',target:'bergen'},
      {kind:'work',key:'cold',text:'Complete a fishing operation in cold water.',target:'iceland-bank'},
      {kind:'delivery',key:'north-timber',port:'reykjavik',good:'wood',qty:18,text:'Hand over 18 timber in Reykjavik.',target:'reykjavik'}]},
    {id:'cape',title:'A long way round',voice:'Jonas, a Cape Town engineer',intro:'The yards south of the Cape run on fuel. Put an oil tender to work, bring the convoy around Africa, and find the Iron King. His mortars can reach a stationary workboat.',reward:5000,xp:800,steps:[
      {kind:'stat',key:'oil',total:20,text:'Extract 20 oil with a tender.',target:'north-sea'},
      {kind:'port',key:'cape-town',text:'Reach Cape Town.',target:'cape-town'},
      {kind:'port',key:'mombasa',text:'Call at Mombasa.',target:'mombasa'},
      {kind:'boss',key:'iron-king',text:'Sink the Iron King.',target:'iron-king'}]},
    {id:'east',title:'Beyond the straits',voice:'Lin, a Singapore broker',intro:'There are tea buyers to the south and deep fishing grounds beyond Japan. A frigate and a few dependable escorts will go farther than a crowded fleet of little guns.',reward:6500,xp:1200,steps:[
      {kind:'port',key:'singapore',text:'Reach Singapore through the straits.',target:'singapore'},
      {kind:'port',key:'yokohama',text:'Reach Yokohama.',target:'yokohama'},
      {kind:'work',key:'deep',text:'Protect a complete deep-water fishing operation.',target:'japan-trench'},
      {kind:'hull',key:'frigate',text:'Commission a frigate or larger flagship.',service:'yard'}]},
    {id:'home',title:'The long wake home',voice:'Mara, in a letter carried east',intro:'Last Light has a fleet in the open Pacific. Take out the warning station, then go after the flagship. When the sea is clear, there is still a place for you at the old Havana quay.',reward:12000,xp:2000,steps:[
      {kind:'signal',key:'silent-station',text:'Clear the stolen weather station.',target:'silent-station'},
      {kind:'boss',key:'last-light',text:'Defeat Last Light in the Pacific.',target:'last-light'},
      {kind:'return',key:'havana',text:'Bring the fleet home to Havana.',target:'havana'}]}
  ];
  const ranks=[0,100,450,1300,2800,5000,8000,12000,18000,28000];
  const data={version:'0.3.0',goods,ports,hulls,boats,relics,fish,sites,bosses,upgrades,signals,charters,ranks};
  if(typeof module!=='undefined'&&module.exports)module.exports=data;
  root.WidewakeData=data;
})(typeof globalThis!=='undefined'?globalThis:this);
