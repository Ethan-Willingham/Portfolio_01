/* Widewake simulation and campaign. No DOM or rendering dependencies. */
(function(root){
  'use strict';
  const D=root.WidewakeData||(typeof require==='function'?require('./widewake-data.js'):null);
  const W=root.WidewakeWorld||(typeof require==='function'?require('./widewake-world.js'):null);
  const {dx,wrap,distance,point,geo,clamp,SpatialHash}=W;
  const TAU=Math.PI*2, SAVE_VERSION=1;
  const count=c=>Object.values(c||{}).reduce((a,b)=>a+b,0);
  const angleDiff=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
  const hash=(s)=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
  function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  const by=(list,id)=>list.find(x=>x.id===id);
  const names=['Wren','Plover','Moth','Kestrel','Minnow','Nettle','Sparrow','Mackerel','Pipit','Dipper','Lark','Tern','Petrel','Curlew','Gannet','Sandpiper','Cormorant','Heron','Gull','Swift','Finch','Snipe','Osprey','Egret'];
  function fresh(){return {version:SAVE_VERSION,coins:780,xp:0,day:1,seconds:0,port:'havana',lastPort:'havana',hull:'cutter',hp:200,
    upgrades:{guns:0,hull:0,engine:0,hold:0},cargo:{sugar:12},fleet:[{uid:1,type:'escort',name:'Wren',hp:180,cargo:{}}],nextUid:2,
    items:[],equipped:[],fishbook:{},visits:['havana'],bosses:[],claimed:[],deliveries:[],completedContracts:[],impact:{},
    stats:{kills:0,profit:0,fish:0,oil:0,operations:0,sugar:0,miles:0,rare:0},
    settings:{sound:true,volume:.22,autoFire:true,shake:true},journal:[],location:null,production:null,atSea:false,seed:hash(Date.now())};}
  function validate(raw){
    if(!raw||raw.version!==SAVE_VERSION)throw new Error('This chart belongs to a different save version.');
    const s=fresh();
    const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
    for(const k of ['coins','xp','day','seconds','hp','nextUid','seed'])if(!finite(raw[k],0,1e10))throw new Error('The save has an invalid '+k+'.');
    if(!by(D.ports,raw.port)||!by(D.ports,raw.lastPort)||!by(D.hulls,raw.hull))throw new Error('The save has an unknown port or hull.');
    const cargo=c=>{if(!c||Array.isArray(c)||typeof c!=='object')throw new Error('Invalid cargo manifest.');const out={};for(const [k,v]of Object.entries(c)){if(!by(D.goods,k)||!Number.isInteger(v)||v<0||v>100000)throw new Error('Invalid cargo manifest.');out[k]=v;}return out;};
    Object.assign(s,raw);s.cargo=cargo(raw.cargo);
    if(!Array.isArray(raw.fleet)||raw.fleet.length>24)throw new Error('Invalid fleet.');
    const ids=new Set();s.fleet=raw.fleet.map(f=>{if(!by(D.boats,f.type)||!finite(f.hp,0,1e5)||!Number.isInteger(f.uid)||f.uid<1||ids.has(f.uid))throw new Error('Invalid vessel.');ids.add(f.uid);return{uid:f.uid,type:f.type,name:names[(f.uid-1)%names.length],hp:f.hp,cargo:cargo(f.cargo)};});
    s.upgrades={};for(const u of D.upgrades){const n=raw.upgrades?.[u.id];if(!Number.isInteger(n)||n<0||n>8)throw new Error('Invalid upgrade.');s.upgrades[u.id]=n;}
    if(!Number.isInteger(s.nextUid)||s.nextUid<=Math.max(0,...ids))throw new Error('Invalid vessel sequence.');
    if(count(s.cargo)>by(D.hulls,s.hull).hold+s.upgrades.hold*16||s.fleet.some(f=>count(f.cargo)>by(D.boats,f.type).hold))throw new Error('Cargo exceeds a vessel’s hold.');
    for(const [key,list]of [['visits',D.ports],['bosses',D.bosses],['items',D.relics],['equipped',D.relics]]){
      if(!Array.isArray(raw[key])||raw[key].length>100||raw[key].some(id=>!by(list,id)))throw new Error('Invalid '+key+'.');s[key]=[...new Set(raw[key])];
    }
    s.equipped=s.equipped.filter(id=>s.items.includes(id)).slice(0,3);
    s.stats={...fresh().stats};for(const k of Object.keys(s.stats)){if(!finite(raw.stats?.[k],0,1e12))throw new Error('Invalid logbook.');s.stats[k]=raw.stats[k];}
    s.fishbook={};for(const f of D.fish)if(finite(raw.fishbook?.[f.id],1,1e7))s.fishbook[f.id]=Math.floor(raw.fishbook[f.id]);
    s.settings={...fresh().settings,...raw.settings};s.settings.volume=clamp(Number(s.settings.volume)||0,0,.5);
    s.claimed=Array.isArray(raw.claimed)?raw.claimed.filter(x=>typeof x==='string').slice(0,60):[];
    s.completedContracts=Array.isArray(raw.completedContracts)?raw.completedContracts.filter(x=>typeof x==='string').slice(-200):[];
    s.deliveries=Array.isArray(raw.deliveries)?raw.deliveries.filter(c=>by(D.ports,c.to)&&by(D.ports,c.from)&&by(D.goods,c.good)&&Number.isInteger(c.qty)&&c.qty>0&&c.qty<=30&&finite(c.reward,0,1e5)&&typeof c.id==='string').slice(0,3):[];
    s.impact={};for(const p of D.ports)for(const g of D.goods){const k=p.id+':'+g.id;if(finite(raw.impact?.[k],-10000,10000))s.impact[k]=raw.impact[k];}
    s.journal=Array.isArray(raw.journal)?raw.journal.filter(x=>typeof x==='string').map(x=>x.slice(0,200)).slice(-30):[];
    if(raw.location&&!['x','y','angle'].every(k=>finite(raw.location[k],k==='angle'?-1e10:0,k==='y'?W.H:1e10)))throw new Error('Invalid position.');
    s.production=raw.production&&by(D.sites,raw.production.site)&&finite(raw.production.progress,0,1000)?{site:raw.production.site,progress:raw.production.progress,wave:finite(raw.production.wave,0,1000)?raw.production.wave:0,uid:raw.production.uid,uids:Array.isArray(raw.production.uids)?raw.production.uids.filter(id=>ids.has(id)).slice(0,24):[raw.production.uid]}:null;
    return s;
  }
  class Game{
    constructor(earth,saved){
      this.earth=earth;this.s=saved?validate(saved):fresh();this.random=rng(this.s.seed+Math.floor(this.s.seconds*100));
      this.ports=D.ports.map(p=>({...p,...earth.nearestWater(point(p.lon,p.lat),45)}));
      this.sites=D.sites.map(p=>({...p,...earth.nearestWater(point(p.lon,p.lat),100)}));
      this.bossSites=D.bosses.map(p=>({...p,...earth.nearestWater(point(p.lon,p.lat),100)}));
      this.enemies=[];this.bullets=[];this.drops=[];this.effects=[];this.events=[];this.grid=new SpatialHash();
      this.mode=this.s.atSea?'sea':'port';this.paused=false;this.time=0;this.spawnTimer=8;this.autoSaveTimer=0;this.route=[];this.target=null;this.autopilot=false;this.burstCD=0;this.repairCD=0;this.formation='screen';this.nextEnemy=1;this.production=null;this.danger=1;this.uiDirty=true;this.onEvent=null;
      this.setupFleet();
      if(this.s.production&&this.mode==='sea'){
        const site=by(this.sites,this.s.production.site),boat=this.fleet.find(f=>f.uid===this.s.production.uid&&f.hp>0&&f.type===(site?.type==='fish'?'trawler':'oilrig'));
        if(site&&boat&&distance(this.player,site)<1000){const workers=this.fleet.filter(f=>f.type===boat.type&&f.hp>0&&(f===boat||(this.s.production.uids||[]).includes(f.uid)));this.production={site,boat,workers,progress:this.s.production.progress,wave:this.s.production.wave};for(const f of workers)Object.assign(f,this.station(f));}
      }
    }
    get rank(){const thresholds=[0,100,300,650,1200,2200,3600,5800,9000,15000];let n=1;for(let i=1;i<thresholds.length;i++)if(this.s.xp>=thresholds[i])n=i+1;return n;}
    get fleetLimit(){return Math.min(24,3+this.rank*2);}
    hull(){return by(D.hulls,this.s.hull);}
    hpMax(){return this.hull().hp+this.s.upgrades.hull*70;}
    holdMax(){return this.hull().hold+this.s.upgrades.hold*16;}
    modifier(stat,fallback=1){let n=fallback;for(const id of this.s.equipped){const item=by(D.relics,id);if(item.stat===stat)n=item.value;}return n;}
    setupFleet(){
      const port=by(this.ports,this.s.port),loc=this.s.atSea&&this.s.location?this.s.location:port;
      const pos=this.earth.nearestWater(loc,15);
      this.player={...pos,angle:loc.angle??-Math.PI/2,vx:0,vy:0,hp:Math.min(this.s.hp,this.hpMax()),maxHp:this.hpMax(),radius:15,cd:0,type:this.s.hull,uid:0,trail:[],data:this.s};
      this.wake=[{x:pos.x,y:pos.y}];
      this.fleet=this.s.fleet.map((data,i)=>{
        const spec=by(D.boats,data.type),q=this.earth.nearestWater({x:wrap(pos.x+(i%3-1)*55),y:pos.y+70+Math.floor(i/3)*55},15);
        return{...q,angle:this.player.angle,hp:Math.min(data.hp,spec.hp),maxHp:spec.hp,radius:13,cd:i*.16,type:data.type,uid:data.uid,trail:[],data,spec,vx:0,vy:0};
      });
    }
    event(text,kind='info'){this.events.push({text,kind,t:5});if(this.events.length>6)this.events.shift();this.uiDirty=true;if(this.onEvent)this.onEvent(kind,text);}
    log(text){this.s.journal.push('Day '+this.s.day+': '+text);this.s.journal=this.s.journal.slice(-30);this.event(text);}
    change(){this.uiDirty=true;this.checkGoals();}
    cargoShips(){return [{cargo:this.s.cargo,capacity:this.holdMax(),name:this.hull().name,uid:0},...this.s.fleet.map(f=>({cargo:f.cargo,capacity:by(D.boats,f.type).hold,name:f.name,uid:f.uid}))];}
    quantity(id){return this.cargoShips().reduce((n,f)=>n+(f.cargo[id]||0),0);}
    used(){return this.cargoShips().reduce((n,f)=>n+count(f.cargo),0);}
    capacity(){return this.cargoShips().reduce((n,f)=>n+f.capacity,0);}
    addCargo(id,qty,preferred){let n=Math.min(Math.max(0,Math.floor(qty)),this.capacity()-this.used()),left=n;let ships=this.cargoShips();if(preferred!==undefined)ships=ships.sort((a,b)=>(b.uid===preferred)-(a.uid===preferred));
      for(const f of ships){const q=Math.min(left,f.capacity-count(f.cargo));f.cargo[id]=(f.cargo[id]||0)+q;left-=q;if(!left)break;}return n-left;
    }
    removeCargo(id,qty){let left=Math.min(Math.floor(qty),this.quantity(id)),n=left;for(const f of this.cargoShips()){const q=Math.min(f.cargo[id]||0,left);f.cargo[id]=(f.cargo[id]||0)-q;left-=q;if(!left)break;}return n;}
    market(portId=this.s.port,goodId,impact=this.s.impact[portId+':'+goodId]||0){const p=by(D.ports,portId),g=by(D.goods,goodId),r=rng(hash(portId+goodId+Math.floor(this.s.day/2)));
      const event=this.marketEvent(portId),mult=p.cheap===goodId?.56:p.wanted===goodId?1.55:1;
      const pressure=clamp(impact*.003,-.14,.2);
      const v=g.base*mult*(.91+r()*.18)*(1+pressure)*(event.good===goodId?event.mult:1);
      return{buy:Math.ceil(v*1.09),sell:Math.max(1,Math.floor(v*.88)),stock:Math.max(0,Math.floor((p.cheap===goodId?100:35)+r()*20-impact))};
    }
    marketEvent(portId=this.s.port){const p=by(D.ports,portId),r=rng(hash('news'+portId+Math.floor(this.s.day/3))),good=D.goods[Math.floor(r()*D.goods.length)],mult=r()<.5?.78:1.3;return{good:good.id,mult,text:mult>1?'A shortage is pushing up the price of '+good.name.toLowerCase()+'.':'A supply ship brought extra '+good.name.toLowerCase()+'. Prices are down.'};}
    // Price every unit through the same market curve. A batch must cost the
    // same as individual trades, so moving the price cannot fund a round trip.
    quoteTrade(id,requested,buy=true){
      if(!by(D.goods,id)||!Number.isFinite(requested)||requested<=0)return{qty:0,total:0};
      const price=this.market(this.s.port,id),limit=Math.floor(Math.min(requested,buy?Math.min(price.stock,this.capacity()-this.used()):this.quantity(id))),impact=this.s.impact[this.s.port+':'+id]||0;
      let qty=0,total=0;
      for(;qty<limit;qty++){const unit=this.market(this.s.port,id,impact+(buy?qty:-qty))[buy?'buy':'sell'];if(buy&&total+unit>this.s.coins)break;total+=unit;}
      return{qty,total};
    }
    trade(id,requested,buy=true){if(this.mode!=='port'||!by(D.goods,id))return false;const {qty,total}=this.quoteTrade(id,requested,buy);
      if(!qty){if(buy)this.event('Not enough coins, stock, or cargo room.','warn');return false;}
      if(buy){this.s.coins-=total;this.addCargo(id,qty);}
      else{this.removeCargo(id,qty);this.s.coins+=total;this.s.stats.profit+=total;this.s.xp+=Math.max(1,Math.round(qty*.7));if(this.s.port==='nassau'&&id==='sugar')this.s.stats.sugar+=qty;}
      const key=this.s.port+':'+id;this.s.impact[key]=(this.s.impact[key]||0)+(buy?qty:-qty);this.event((buy?'Bought ':'Sold ')+qty+' '+by(D.goods,id).name.toLowerCase()+' for '+total+' coins.','coin');this.change();return true;
    }
    repairCost(){return Math.ceil((this.hpMax()-this.player.hp)*.4+this.fleet.reduce((n,f)=>n+(f.maxHp-f.hp)*.3,0));}
    repair(){if(this.mode!=='port')return false;const cost=this.repairCost();if(this.s.coins<cost){this.event('Repairs need '+cost+' coins.','warn');return false;}this.s.coins-=cost;this.player.hp=this.hpMax();this.s.hp=this.player.hp;for(const f of this.fleet)f.data.hp=f.hp=f.maxHp;this.event(cost?'Fleet repaired for '+cost+' coins.':'Every hull is sound.');this.change();return true;}
    buyBoat(id){const spec=by(D.boats,id);if(this.mode!=='port'||!spec||this.rank<spec.rank||this.s.coins<spec.cost||this.s.fleet.length>=this.fleetLimit)return false;
      const uid=this.s.nextUid++;this.s.coins-=spec.cost;this.s.fleet.push({uid,type:id,name:names[(uid-1)%names.length],hp:spec.hp,cargo:{}});this.setupFleet();this.log(spec.name+' joined the fleet.');this.change();return true;}
    sellBoat(uid){if(this.mode!=='port')return false;const boat=this.s.fleet.find(f=>f.uid===uid);if(!boat)return false;if(count(boat.cargo)){this.event('Empty this boat before selling it.','warn');return false;}this.s.coins+=Math.floor(by(D.boats,boat.type).cost*.55);this.s.fleet=this.s.fleet.filter(f=>f.uid!==uid);this.setupFleet();this.change();return true;}
    upgrade(id){const u=by(D.upgrades,id);if(this.mode!=='port'||!u||this.s.upgrades[id]>=8)return false;const cost=this.upgradeCost(id);if(this.s.coins<cost)return false;this.s.coins-=cost;this.s.upgrades[id]++;if(id==='hull'){this.player.hp+=70;this.s.hp=this.player.hp;this.player.maxHp=this.hpMax();}this.event(u.name+' upgraded.','upgrade');this.change();return true;}
    upgradeCost(id){return Math.round(by(D.upgrades,id).base*Math.pow(1.65,this.s.upgrades[id]));}
    buyHull(id){const h=by(D.hulls,id);if(this.mode!=='port'||!h||this.rank<h.rank||this.s.coins<h.cost||D.hulls.indexOf(h)<=D.hulls.indexOf(this.hull()))return false;
      this.s.coins-=h.cost;this.s.hull=id;this.s.hp=this.hpMax();this.setupFleet();this.log('The '+h.name+' is your new flagship.');this.change();return true;}
    equip(id){if(this.mode!=='port'||!this.s.items.includes(id))return false;const i=this.s.equipped.indexOf(id);if(i>=0)this.s.equipped.splice(i,1);else if(this.s.equipped.length<3)this.s.equipped.push(id);else{this.event('Three fittings are installed. Remove one first.','warn');return false;}this.change();return true;}
    contractOffers(){const port=by(this.ports,this.s.port),near=this.ports.filter(p=>p.id!==port.id).sort((a,b)=>distance(port,a)-distance(port,b)).slice(0,5);const r=rng(hash('contract'+port.id+this.s.day));
      return [0,1,2].map((n)=>{const to=near[(n+Math.floor(r()*2))%near.length],good=n===0?port.cheap:D.goods[Math.floor(r()*D.goods.length)].id,qty=6+Math.floor(r()*10);return{id:port.id+'-'+this.s.day+'-'+n,from:port.id,to:to.id,good,qty,reward:Math.round(by(D.goods,good).base*qty*1.45+180),day:this.s.day};}).filter(c=>!this.s.completedContracts.includes(c.id)&&!this.s.deliveries.some(a=>a.id===c.id));}
    acceptContract(id){if(this.mode!=='port'||this.s.deliveries.length>=3)return false;const c=this.contractOffers().find(c=>c.id===id);if(!c)return false;this.s.deliveries.push(c);this.event('Contract accepted. Buy the cargo, then deliver it in '+by(D.ports,c.to).name+'.');this.change();return true;}
    deliver(id){if(this.mode!=='port')return false;const c=this.s.deliveries.find(c=>c.id===id);if(!c||c.to!==this.s.port||this.quantity(c.good)<c.qty)return false;this.removeCargo(c.good,c.qty);this.s.coins+=c.reward;this.s.xp+=100;this.s.deliveries=this.s.deliveries.filter(x=>x.id!==id);this.s.completedContracts.push(id);this.log('Delivery paid '+c.reward+' coins.');this.change();return true;}
    goals(){return[
      {id:'first-sale',name:'A little working capital',text:'Sell 6 sugar in Nassau.',progress:this.s.stats.sugar,total:6,reward:400,xp:100},
      {id:'first-battle',name:'Clear a passage',text:'Sink 8 raiders.',progress:this.s.stats.kills,total:8,reward:500,xp:100},
      {id:'first-fish',name:'A working boat',text:'Land 12 fish from a fishing ground.',progress:this.s.stats.fish,total:12,reward:600,xp:150},
      {id:'five-ports',name:'Beyond the familiar shore',text:'Visit 5 ports.',progress:this.s.visits.length,total:5,reward:1200,xp:250},
      {id:'first-oil',name:'Black gold',text:'Extract 20 barrels of oil.',progress:this.s.stats.oil,total:20,reward:1600,xp:300},
      {id:'collector',name:'Something strange in the nets',text:'Find 3 different rare fish.',progress:Object.keys(this.s.fishbook).length,total:3,reward:2200,xp:400},
      {id:'fleet',name:'A company at sea',text:'Own 8 support boats.',progress:this.s.fleet.length,total:8,reward:3500,xp:600},
      {id:'ten-ports',name:'Two oceans from home',text:'Visit 12 ports.',progress:this.s.visits.length,total:12,reward:5000,xp:900},
      {id:'raiders',name:'Safe passage',text:'Sink 250 raiders.',progress:this.s.stats.kills,total:250,reward:5000,xp:800},
      {id:'bosses',name:'The last blockade',text:'Defeat all 3 pirate admirals.',progress:this.s.bosses.length,total:3,reward:15000,xp:1800},
      {id:'world',name:'The whole wide world',text:'Visit all 24 ports.',progress:this.s.visits.length,total:24,reward:25000,xp:2500}
    ];}
    checkGoals(){for(const g of this.goals())if(!this.s.claimed.includes(g.id)&&g.progress>=g.total){this.s.claimed.push(g.id);this.s.coins+=g.reward;this.s.xp+=g.xp;this.log(g.name+': '+g.reward+' coins earned.');}}
    sail(){if(this.mode!=='port')return false;this.mode='sea';this.s.atSea=true;this.setupFleet();this.spawnTimer=8;this.time=0;this.event('WASD to sail. Guns fire automatically. M opens the world chart.');this.change();return true;}
    nearestPort(){let best=null,d=Infinity;for(const p of this.ports){const pd=distance(this.player,p);if(pd<d){d=pd;best=p;}}return{port:best,distance:d};}
    dock(){if(this.mode!=='sea')return false;const near=this.nearestPort();if(near.distance>190){this.event('Move within the harbor ring to dock.','warn');return false;}
      this.finishProduction(false);this.mode='port';this.s.atSea=false;this.s.port=this.s.lastPort=near.port.id;this.player.x=near.port.x;this.player.y=near.port.y;
      if(!this.s.visits.includes(near.port.id)){this.s.visits.push(near.port.id);this.s.xp+=85;this.s.coins+=100;this.log('First arrival in '+near.port.name+'. A 100 coin harbor grant.');}
      this.s.hp=this.player.hp;for(const f of this.fleet)f.data.hp=f.hp;this.enemies.length=0;this.bullets.length=0;this.drops.length=0;this.route=[];this.autopilot=false;this.target=null;this.change();return true;
    }
    navigate(target){if(this.mode!=='sea')this.sail();const path=this.earth.route(this.player,target);if(!path){this.event('No safe water route found. Choose a nearby waypoint.','warn');return false;}this.route=path;this.target={...target};this.autopilot=true;this.event('Course set for '+(target.name||'the marked water')+'. Steer to take the helm.');this.change();return true;}
    cancelCourse(){this.autopilot=false;this.route=[];this.target=null;this.uiDirty=true;}
    nearbySite(){return this.sites.find(s=>distance(this.player,s)<240)||null;}
    startProduction(){if(this.mode!=='sea')return false;if(this.production){this.finishProduction(false);return true;}
      const site=this.nearbySite();if(!site){this.event('Find a fishing ground or oil field on the chart.','warn');return false;}
      const type=site.type==='fish'?'trawler':'oilrig',workers=this.fleet.filter(f=>f.type===type&&f.hp>0),boat=workers[0];
      if(!boat){this.event('This site needs a '+by(D.boats,type).name.toLowerCase()+'.','warn');return false;}
      if(this.capacity()-this.used()<4){this.event('Make room in the fleet cargo holds first.','warn');return false;}
      this.cancelCourse();this.production={site,boat,workers,progress:0,wave:0};this.spawnTimer=5;this.log((workers.length===1?boat.data.name:workers.length+' workboats')+' moving onto '+site.name+'. Keep the raiders away.');return true;
    }
    station(boat){const op=this.production,i=op.workers.indexOf(boat),x=wrap(op.site.x+(i%3-1)*45),y=op.site.y+Math.floor(i/3)*45;return this.earth.water(x,y,15)?{x,y}:{x:op.site.x,y:op.site.y};}
    finishProduction(success){if(!this.production)return;const p=this.production;
      if(success){this.s.stats.operations++;this.s.coins+=100+p.site.danger*75;this.s.xp+=70+p.site.danger*30;this.log('Work complete at '+p.site.name+'. Cargo secured.');}
      else this.event('Production stopped. Cargo already loaded stays aboard.');this.production=null;this.s.production=null;this.change();
    }
    rareCatch(site){const region=site.region,pool=D.fish.filter(f=>f.region===region);const f=pool[Math.floor(this.random()*pool.length)];if(!f)return;this.s.fishbook[f.id]=(this.s.fishbook[f.id]||0)+1;this.s.stats.rare++;this.s.coins+=f.value;this.s.xp+=80;this.log('Rare catch: '+f.name+'. The naturalist paid '+f.value+' coins.');this.event(f.name,'rare');this.change();}
    salvage(item){if(!this.s.items.includes(item)){this.s.items.push(item);this.log('Recovered '+by(D.relics,item).name+'. Fit it at a shipyard.');this.event(by(D.relics,item).name,'rare');}else this.s.coins+=220;this.change();}
    burst(){if(this.mode!=='sea'||this.paused||this.burstCD>0)return false;this.burstCD=9;const p=this.player,n=16+this.hull().guns*4;
      for(let i=0;i<n;i++)this.shoot(p,i/n*TAU,42*(1+this.s.upgrades.guns*.2),false,{speed:420,life:1.6,splash:35});this.event('All guns!','burst');return true;}
    fieldRepair(){if(this.mode!=='sea'||this.paused||this.repairCD>0||this.s.coins<100||this.player.hp>=this.hpMax()&&this.fleet.every(f=>f.hp>=f.maxHp))return false;this.s.coins-=100;this.repairCD=25;this.player.hp=Math.min(this.hpMax(),this.player.hp+100);for(const f of this.fleet)f.hp=Math.min(f.maxHp,f.hp+55);this.event('Emergency repairs. 100 coins.');this.change();return true;}
    shoot(from,angle,damage,hostile,opts={}){if(this.bullets.length>=3500)return;const speed=opts.speed||430;
      this.bullets.push({x:wrap(from.x+Math.cos(angle)*19),y:from.y+Math.sin(angle)*19,px:from.x,py:from.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,damage,hostile,life:opts.life||1.6,splash:opts.splash||0,radius:hostile?4:3});
    }
    spawn(kind='skiff',center=this.player,force=false){if(this.enemies.length>=1200)return null;
      const defs={skiff:{hp:38,speed:100,range:150,damage:7,rate:1.8,radius:10,reward:18},gunner:{hp:75,speed:78,range:330,damage:12,rate:2.3,radius:13,reward:30},rammer:{hp:95,speed:145,range:0,damage:22,rate:1.8,radius:13,reward:28},armored:{hp:250,speed:65,range:380,damage:23,rate:2.5,radius:19,reward:65},boss:{hp:3000,speed:55,range:420,damage:25,rate:.8,radius:34,reward:2000}};
      const def=defs[kind],a=this.random()*TAU,r=force?450+this.random()*500:720+this.random()*430;
      let q={x:wrap(center.x+Math.cos(a)*r),y:center.y+Math.sin(a)*r};if(!this.earth.water(q.x,q.y,30)){if(!force)return null;q=this.earth.nearestWater(q,30);}
      const scale=1+Math.max(0,this.danger-1)*.12;
      const e={...q,...def,type:kind,id:this.nextEnemy++,angle:a+Math.PI,cd:.7+this.random(),hp:def.hp*scale,maxHp:def.hp*scale,hit:0,dead:false,target:0};this.enemies.push(e);return e;
    }
    wave(n,center=this.player){for(let i=0;i<n;i++){const r=this.random(),kind=this.danger>=4&&r<.12?'armored':r<.24?'rammer':r<.5?'gunner':'skiff';this.spawn(kind,center);}}
    damage(e,n){if(e.hp<=0)return;e.hp-=n;e.hit=.12;if(e.hp>0)return;
      this.s.stats.kills++;this.s.xp+=e.type==='boss'?500:7;this.s.coins+=e.reward;this.effects.push({x:e.x,y:e.y,t:.6,max:.6,size:e.radius*2,type:'blast'});
      if(e.bossId){const b=by(D.bosses,e.bossId);this.s.bosses.push(b.id);this.salvage(b.relic);this.log(b.name+' has gone down. '+b.reward+' coins recovered.');}
      else if(this.random()<.055){const pool=D.relics.filter(r=>r.rarity!=='Legendary');this.drops.push({x:e.x,y:e.y,kind:'relic',item:pool[Math.floor(this.random()*pool.length)].id,t:45});}
      else if(this.random()<.38)this.drops.push({x:e.x,y:e.y,kind:this.random()<.28?'repair':'cargo',item:D.goods[Math.floor(this.random()*8)].id,t:35});
      if(this.effects.length>160)this.effects.shift();this.change();if(this.onEvent)this.onEvent('hit');
    }
    hurt(ship,n){if(ship.hp<=0)return;ship.hp-=n*this.modifier('armor');if(ship===this.player){this.s.hp=ship.hp;if(this.onEvent)this.onEvent('hurt');}else ship.data.hp=ship.hp;
      if(ship.hp<=0&&ship!==this.player){this.log(ship.data.name+' sank. Its cargo was lost.');if(this.production?.workers.includes(ship)){this.production.workers=this.production.workers.filter(f=>f!==ship);if(this.production.workers.length)this.production.boat=this.production.workers[0];else this.finishProduction(false);}this.s.fleet=this.s.fleet.filter(f=>f.uid!==ship.uid);this.change();}
    }
    rescue(){const home=by(this.ports,this.s.lastPort);this.s.coins=Math.max(260,Math.floor(this.s.coins*.75));for(const f of this.cargoShips())for(const k of Object.keys(f.cargo))f.cargo[k]=Math.floor(f.cargo[k]*.5);
      this.s.hp=this.hpMax();for(const f of this.s.fleet)f.hp=by(D.boats,f.type).hp;this.s.port=home.id;this.s.atSea=false;this.s.location=null;this.mode='port';this.enemies=[];this.bullets=[];this.drops=[];this.production=null;this.route=[];this.target=null;this.autopilot=false;this.setupFleet();this.log('Towed to '+home.name+'. Salvagers took a quarter of your coins and half the remaining cargo.');this.change();}
    step(dt,input={}){
      if(this.mode!=='sea'||this.paused)return;dt=clamp(dt,0,.05);this.time+=dt;this.s.seconds+=dt;this.burstCD=Math.max(0,this.burstCD-dt);this.repairCD=Math.max(0,this.repairCD-dt);
      const oldDay=this.s.day;this.s.day=1+Math.floor(this.s.seconds/120);if(oldDay!==this.s.day){for(const k in this.s.impact)this.s.impact[k]*=.5;this.uiDirty=true;}
      const p=this.player;let ix=input.x||0,iy=input.y||0;const manual=Math.hypot(ix,iy)>.1;
      if(manual&&this.autopilot)this.cancelCourse();
      if(this.autopilot&&this.route.length){const q=this.route[0],d=distance(p,q);if(d<40){this.route.shift();if(!this.route.length){this.autopilot=false;this.event('Arrived at '+(this.target?.name||'your waypoint')+'.');}}
        else {ix=dx(p.x,q.x)/d;iy=(q.y-p.y)/d;}}
      const magnitude=Math.hypot(ix,iy);if(magnitude>0){ix/=Math.max(1,magnitude);iy/=Math.max(1,magnitude);const wanted=Math.atan2(iy,ix);p.angle+=clamp(angleDiff(p.angle,wanted),-3.5*dt,3.5*dt);}
      const speed=this.hull().speed*(1+this.s.upgrades.engine*.08)*this.modifier('speed')*(input.boost?1.35:1);
      const blend=1-Math.exp(-dt*3.5);p.vx+=(ix*speed-p.vx)*blend;p.vy+=(iy*speed-p.vy)*blend;
      const oldX=p.x,oldY=p.y;const moved=this.earth.move(p,p.x+p.vx*dt,p.y+p.vy*dt);if(!moved){p.vx*=.6;p.vy*=.6;}
      this.s.stats.miles+=Math.hypot(dx(oldX,p.x),p.y-oldY)/W.SCALE*60;
      if(distance(p,this.wake[this.wake.length-1])>35){this.wake.push({x:p.x,y:p.y});if(this.wake.length>1000)this.wake.shift();}
      const near=this.nearestPort(),safe=near.distance<250;this.danger=Math.max(1,near.port.danger+Math.floor(this.rank/4));
      this.grid.rebuild(this.enemies);
      p.cd-=dt;
      const target=this.grid.nearest(p.x,p.y,600);
      if(p.cd<=0&&(this.s.settings.autoFire&&target||input.fire)){
        const tx=input.fire&&input.aim?input.aim.x:target?.x??p.x+Math.cos(p.angle)*100,ty=input.fire&&input.aim?input.aim.y:target?.y??p.y+Math.sin(p.angle)*100;
        const a=Math.atan2(ty-p.y,dx(p.x,tx)),n=this.hull().guns;
        for(let i=0;i<n;i++)this.shoot(p,a+(i-(n-1)/2)*.055,28*(1+this.s.upgrades.guns*.2),false,{splash:this.modifier('splash',0)});
        p.cd=.62*this.modifier('rate');if(this.onEvent)this.onEvent('shot');
      }
      const allies=[p,...this.fleet.filter(f=>f.hp>0)];
      for(let i=this.fleet.length-1;i>=0;i--){const f=this.fleet[i];if(f.hp<=0){this.fleet.splice(i,1);continue;}
        const working=this.production?.workers.includes(f),spread=this.formation==='tight'?55:this.formation==='screen'?105:145;
        const row=Math.floor(i/4)+1,side=i%4-1.5,ax=Math.cos(p.angle),ay=Math.sin(p.angle);
        const station=working?this.station(f):null;
        let tx=working?station.x:wrap(p.x-ax*(row*spread+40)-ay*side*spread),ty=working?station.y:p.y-ay*(row*spread+40)+ax*side*spread;
        if(!this.earth.water(tx,ty,15)){tx=p.x;ty=p.y;}
        f.navTimer=(f.navTimer||0)-dt;
        if(!working&&f.navTimer<=0){f.navTimer=.45;f.detour=null;if(!this.earth.clear(f,{x:tx,y:ty},15)){
          let nearest=0,best=Infinity;for(let j=0;j<this.wake.length;j++){const d=distance(f,this.wake[j]);if(d<best){best=d;nearest=j;}}
          for(let j=nearest;j<Math.min(this.wake.length,nearest+18);j++){if(this.earth.clear(f,this.wake[j],15))f.detour=this.wake[j];else break;}
        }}
        if(!working&&f.detour){tx=f.detour.x;ty=f.detour.y;}
        const vx=dx(f.x,tx),vy=ty-f.y,d=Math.hypot(vx,vy),fs=f.spec.speed*(1+this.s.upgrades.engine*.08)*this.modifier('speed');
        if(d>6){const a=Math.atan2(vy,vx);f.angle+=clamp(angleDiff(f.angle,a),-3*dt,3*dt);const v=Math.min(fs*(d>450?1.8:1),d*2.2);this.earth.move(f,f.x+vx/d*v*dt,f.y+vy/d*v*dt);}
        f.cd-=dt;if(f.cd<=0){const enemy=this.grid.nearest(f.x,f.y,f.spec.range);if(enemy){const a=Math.atan2(enemy.y-f.y,dx(f.x,enemy.x));this.shoot(f,a,f.spec.damage*(1+this.s.upgrades.guns*.1),false,{splash:f.type==='destroyer'?35:0});f.cd=f.spec.rate;}else f.cd=.15;}
        if(f.type==='repair')for(const ally of allies)if(distance(f,ally)<300)ally.hp=Math.min(ally.maxHp,ally.hp+dt*3.8);
      }
      const heal=this.modifier('heal',0);if(heal)for(const a of allies)a.hp=Math.min(a.maxHp,a.hp+heal*dt);
      // Target selection is staggered. Projectiles use the spatial grid, never an all-pairs scan.
      for(let i=this.enemies.length-1;i>=0;i--){const e=this.enemies[i];e.hit=Math.max(0,e.hit-dt);
        if(e.hp<=0||distance(e,p)>2800){this.enemies[i]=this.enemies[this.enemies.length-1];this.enemies.pop();continue;}
        let victim=p;if(this.production)for(const worker of this.production.workers)if(distance(e,worker)<distance(e,victim))victim=worker;
        if((Math.floor(this.time*4)+e.id)%3===0){let d=distance(e,victim);for(const f of this.fleet){const q=distance(e,f);if(q<d){victim=f;d=q;}}e.target=victim.uid;}
        else victim=allies.find(a=>a.uid===e.target)||victim;
        if(distance(e,near.port)<150){e.hp=0;continue;}
        const vx=dx(e.x,victim.x),vy=victim.y-e.y,d=Math.max(1,Math.hypot(vx,vy));let a=Math.atan2(vy,vx);e.angle+=clamp(angleDiff(e.angle,a),-2.4*dt,2.4*dt);
        let factor=e.type==='rammer'?1:d<e.range*.7?-.3:1;
        // Small deterministic lateral motion keeps large groups legible without pairwise separation.
        const sway=Math.sin(this.time*.8+e.id)*.32;
        this.earth.move(e,e.x+(vx/d*Math.cos(sway)-vy/d*Math.sin(sway))*e.speed*factor*dt,e.y+(vy/d*Math.cos(sway)+vx/d*Math.sin(sway))*e.speed*factor*dt);
        e.cd-=dt;if(d<e.range&&e.cd<=0){this.shoot(e,a,e.damage,true,{speed:210,life:3});if(e.type==='boss'){this.shoot(e,a-.25,e.damage,true,{speed:210,life:3});this.shoot(e,a+.25,e.damage,true,{speed:210,life:3});}e.cd=e.rate;}
        if(d<e.radius+victim.radius+4&&e.cd<=0){this.hurt(victim,e.damage);e.cd=1;this.damage(e,e.type==='rammer'?e.maxHp:12);}
      }
      for(let i=this.bullets.length-1;i>=0;i--){const b=this.bullets[i];b.life-=dt;b.px=b.x;b.py=b.y;b.x=wrap(b.x+b.vx*dt);b.y+=b.vy*dt;let hit=null;
        if(b.hostile){for(const f of allies)if(f.hp>0&&this.segmentHit(b,f)){hit=f;break;}if(hit)this.hurt(hit,b.damage);}
        else this.grid.query(b.x,b.y,55,e=>{if(!hit&&e.hp>0&&this.segmentHit(b,e))hit=e;});
        if(hit&&!b.hostile){this.damage(hit,b.damage);if(b.splash)this.grid.query(b.x,b.y,b.splash,e=>{if(e!==hit&&e.hp>0&&distance(e,b)<b.splash)this.damage(e,b.damage*.6);});}
        if(hit||b.life<=0||this.earth.land(b.x,b.y)){this.bullets[i]=this.bullets[this.bullets.length-1];this.bullets.pop();}
      }
      for(let i=this.drops.length-1;i>=0;i--){const d=this.drops[i];d.t-=dt;const dist=distance(p,d);if(dist<150*this.modifier('magnet')){d.x=wrap(d.x+dx(d.x,p.x)*dt*4);d.y+=(p.y-d.y)*dt*4;}
        if(dist<35){if(d.kind==='relic')this.salvage(d.item);else if(d.kind==='repair')p.hp=Math.min(this.hpMax(),p.hp+35);else {this.addCargo(d.item,1+Math.floor(this.random()*3));this.s.coins+=12;}d.t=0;this.uiDirty=true;}
        if(d.t<=0){this.drops[i]=this.drops[this.drops.length-1];this.drops.pop();}
      }
      this.spawnTimer-=dt;if(this.spawnTimer<=0){if(!safe){const n=this.production?5+this.production.site.danger*4+Math.floor(this.production.progress/15)+(this.production.workers.length-1)*4:2+this.danger*2+Math.floor(this.s.fleet.length*.7);this.wave(n,this.production?.boat||p);}this.spawnTimer=this.production?9:12;}
      for(const b of this.bossSites)if(!this.s.bosses.includes(b.id)&&distance(p,b)<450&&!this.enemies.some(e=>e.bossId===b.id)){
        const e=this.spawn('boss',b,true);if(e){Object.assign(e,{x:b.x,y:b.y,hp:b.hp,maxHp:b.hp,reward:b.reward,bossId:b.id,name:b.name});this.wave(12+b.rank*3,b);this.log(b.name+' is closing in.');}}
      if(this.production){const op=this.production;if(op.boat.hp<=0)this.finishProduction(false);
        else if(distance(p,op.site)>1100){this.event('Too far from the working boat. Production stopped.','warn');this.finishProduction(false);}
        else if(distance(op.boat,this.station(op.boat))<35){const prev=op.progress;op.progress+=dt;const tick=Math.floor(op.progress/3);
          if(tick>Math.floor(prev/3)){let qty=0;for(const worker of op.workers)if(distance(worker,this.station(worker))<45)qty+=this.addCargo(op.site.type,op.site.type==='fish'?3:4,worker.uid);this.s.stats[op.site.type]+=qty;
            if(op.site.type==='fish'&&(tick===4&&this.s.stats.rare===0||this.random()<.075*this.modifier('rare')))this.rareCatch(op.site);
            if(!qty){this.event('The holds are full. Work stopped.');this.finishProduction(false);}this.change();}
          if(this.production&&op.progress>=60)this.finishProduction(true);
        }
      }
      for(let i=this.effects.length-1;i>=0;i--)if((this.effects[i].t-=dt)<=0)this.effects.splice(i,1);
      for(let i=this.events.length-1;i>=0;i--)if((this.events[i].t-=dt)<=0)this.events.splice(i,1);
      if(p.hp<=0){this.rescue();return;}
      this.s.hp=p.hp;for(const f of this.fleet)f.data.hp=f.hp;
      this.autoSaveTimer+=dt;
    }
    segmentHit(b,e){const vx=dx(b.px,b.x),vy=b.y-b.py,ex=dx(b.px,e.x),ey=e.y-b.py,t=clamp((ex*vx+ey*vy)/(vx*vx+vy*vy||1),0,1);return(ex-vx*t)**2+(ey-vy*t)**2<(e.radius+b.radius)**2;}
    snapshot(){this.s.hp=this.player.hp;this.s.atSea=this.mode==='sea';this.s.location={x:this.player.x,y:this.player.y,angle:this.player.angle};this.s.production=this.production?{site:this.production.site.id,progress:this.production.progress,wave:this.production.wave,uid:this.production.boat.uid,uids:this.production.workers.map(f=>f.uid)}:null;for(const f of this.fleet)f.data.hp=f.hp;return JSON.parse(JSON.stringify(this.s));}
  }
  const api={Game,fresh,validate,rng,hash,count,SAVE_VERSION};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WidewakeCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
