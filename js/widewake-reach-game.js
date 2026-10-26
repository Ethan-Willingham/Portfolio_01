/* Bracken Reach campaign. The navigation region is the world, including in combat.
   Pure simulation and validated saves; the browser owns presentation and storage. */
(function(root){
  'use strict';
  const E=root.WidewakeEstuary,B=root.WidewakeBattle,clamp=E.clamp;
  const version='0.43.1',SAVE_VERSION=1;
  const goods={salt:{name:'Salt',color:'#d8d8bd'},tools:{name:'Tools',color:'#92a9ad'},grain:{name:'Grain',color:'#c4ac72'},timber:{name:'Timber',color:'#a68b65'},fish:{name:'Fish',color:'#78b3b5'},oil:{name:'Oil',color:'#8a909e'},relic:{name:'Salvage',color:'#dbc18c'}};
  const markets={yard:{salt:12,tools:30,grain:23,timber:25,fish:18,oil:44,relic:140},reeds:{salt:22,tools:48,grain:10,timber:24,fish:9,oil:35,relic:155},mill:{salt:27,tools:54,grain:18,timber:11,fish:24,oil:52,relic:190}};
  Object.assign(markets,{
    lantern:{salt:22,tools:38,grain:10,timber:23,fish:12,oil:38,relic:155},
    kilns:{salt:19,tools:25,grain:16,timber:32,fish:21,oil:30,relic:165},
    canopy:{salt:28,tools:50,grain:9,timber:13,fish:15,oil:45,relic:190},
    bells:{salt:26,tools:58,grain:28,timber:34,fish:25,oil:50,relic:230},
    wheel:{salt:23,tools:26,grain:12,timber:15,fish:26,oil:44,relic:200},
    glass:{salt:24,tools:22,grain:32,timber:42,fish:30,oil:27,relic:220},
    crown:{salt:29,tools:55,grain:36,timber:48,fish:34,oil:60,relic:280}
  });
  const boats={gunboat:{name:'Escort',cost:1100,rank:2,hold:20,draft:2.6,weapon:'guard'},trawler:{name:'Trawler',cost:680,rank:2,hold:80,draft:2.1,weapon:'guard'},repair:{name:'Tender',cost:1400,rank:3,hold:70,draft:1.8,weapon:'guard'},oilrig:{name:'Oil tender',cost:2400,rank:3,hold:100,draft:4.2,weapon:'guard'},screen:{name:'Flak boat',cost:3800,rank:4,hold:25,draft:2.8,weapon:'flak'},battery:{name:'Mortar boat',cost:5200,rank:4,hold:25,draft:3.2,weapon:'mortar'}};
  const hulls={launch:{name:'Launch',cost:0,rank:1,hold:32,draft:.45,speed:36},gunboat:{name:'Patrol boat',cost:2000,rank:2,hold:64,draft:2.6,speed:72},flagship:{name:'Frigate',cost:7200,rank:4,hold:140,draft:3.8,speed:68}};
  const sites=[{id:'shoal',name:'Tern Shoal',x:450,y:1100,type:'fish',duration:65,rank:2,radius:130,rare:'Glass mullet'},
    {id:'river',name:'Stillwater Pool',x:-750,y:-4300,type:'fish',duration:90,rank:3,radius:65,rare:'Copper pike'},
    {id:'oil',name:'Outer Sound',x:600,y:2300,type:'oil',duration:100,rank:3,radius:380,rare:'Amber nautilus'}];
  const names=['Kite','Wren','Tern','Mender','Cairn','Plover','Gannet','Finch','Kestrel','Moth','Pipit','Nettle','Curlew','Heron','Snipe','Rook','Ward','Sparrow','Minnow','Lark','Petrel','Cormorant','Cinder','Ash'];
  const upgrades={engine:{name:'Engine',base:240},hold:{name:'Hold',base:180},guns:{name:'Guns',base:300},hull:{name:'Hull',base:220}};
  const used=s=>Object.values(s.manifest).reduce((a,b)=>a+b,0);
  const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
  function ship(type,id=0){const spec=type==='launch'?E.vessels.launch:B.roles[type],hull=hulls[type],boat=boats[type];return{id,type,name:names[id]||'Boat '+id,...spec,draft:(id===0?hull:boat)?.draft||2,hold:(id===0?hull:boat)?.hold||40,maxHp:spec.hp,hp:spec.hp,x:-550,y:600,px:-550,py:600,angle:0,previousAngle:0,vx:0,vy:0,turn:0,helm:null,hit:0,flash:0,turret:0,slot:{x:0,y:0},working:type==='trawler'||type==='oilrig',cargo:0,manifest:{}};}
  class Game extends E.Navigation{
    constructor(){
      super();this.convoyOrder='spaced';const combat=new B.Battle({population:0});
      for(const key of ['shots','effects','raiders','contacts','random','kills','spawned','lost','burstCooldown','burstCursor','burstTimer','lastHit','impactBudget','sounds','soundBudget','deathBudget'])this[key]=combat[key];
      this.ships=[ship('launch')];this.visualRoles={...E.vessels,...B.roles};this.port='yard';this.lastPort='yard';this.coins=520;this.rank=1;this.levels={engine:0,hold:0,guns:0,hull:0};this.stats={soldSalt:0,soldTimber:0,soldTools:0,soldGrain:0,soldOil:0,fish:0,oil:0,profit:0,watches:0};this.earned=[];this.collection=[];this.discoveries=[];this.events=[];this.loot=[];this.marketTurn=0;this.marketVolumes={};this.work=false;this.workTime=0;this.center={x:0,y:0};this.operation=null;this.nextEncounter=45;this.encounter=0;this.recovery=null;this.convoyTrail=[];this.traveled=0;this.ships[0].manifest.salt=8;this.rebuildMounts();this.updateStats();this.recordConvoy(true);
    }
    notify(text){this.events.push(text);if(this.events.length>8)this.events.shift();}
    get capacity(){return this.ships.filter(s=>s.hp>0).reduce((n,s)=>n+s.hold,0);}
    get cargo(){return this.ships.filter(s=>s.hp>0).reduce((n,s)=>n+used(s),0);}
    amount(good){return this.ships.filter(s=>s.hp>0).reduce((n,s)=>n+(s.manifest[good]||0),0);}
    updateStats(){const flagshipSpeed=hulls[this.player.type].speed;for(const s of this.ships){const spec=s.type==='launch'?E.vessels.launch:B.roles[s.type];s.speed=(s.id===0?flagshipSpeed:Math.min(spec.speed*1.65*B.crewPace(s.id),flagshipSpeed*.82))*(1+this.levels.engine*.10);s.maxHp=spec.hp*(1+this.levels.hull*.18);s.hold=((s.id===0?hulls[s.type]:boats[s.type])?.hold||32)+this.levels.hold*8;s.cargo=used(s);}}
    rebuildMounts(){this.mounts=[];for(const s of this.ships){const weapon=s.id===0?(s.type==='flagship'?'gun':'guard'):boats[s.type].weapon,n=s.type==='flagship'?3:s.type==='gunboat'?2:1;for(let i=0;i<n;i++)this.mounts.push({ship:s.id,weapon,along:s.type==='launch'?1.7:s.length*(.08+i*.22),angle:s.angle,flash:0,recoil:0,cooldown:.2+i*.15});}}
    objective(){if(!this.earned.includes('salt'))return{title:'A first delivery',detail:'Sell 8 salt at Lantern Quay',port:'lantern'};if(!this.earned.includes('fish'))return{title:'A working fleet',detail:'Finish a fishing watch at Tern Shoal',site:'shoal'};if(!this.earned.includes('jungle'))return{title:'Under the canopy',detail:'Sell 12 tools at Canopy Landing',port:'canopy'};if(!this.earned.includes('timber'))return{title:'Timber home',detail:'Sell 12 timber at Tern Yard',port:this.amount('timber')>=12?'yard':'canopy'};if(!this.earned.includes('oil'))return{title:'The outer sound',detail:'Finish an oil watch offshore',site:'oil'};if(!this.earned.includes('bells'))return{title:'Above the drowned town',detail:'Sell 24 grain at Bellwether',port:'bells'};if(!this.earned.includes('crown'))return{title:'The shipbreakers',detail:'Sell 24 oil at Crown Anchorage',port:'crown'};return{title:'A living on the water',detail:'Keep trading, working and exploring the Reach'};}
    reward(id,condition,coins,rank,message){if(condition&&!this.earned.includes(id)){this.earned.push(id);this.coins+=coins;this.rank=Math.max(this.rank,rank);this.notify(message+' · '+coins+' c');}}
    progress(){this.reward('salt',this.stats.soldSalt>=8,350,2,'Fleet unlocked');this.reward('fish',this.stats.fish>0,500,3,'Shipyard unlocked');this.reward('timber',this.stats.soldTimber>=12,500,3,'River trade established');this.reward('oil',this.stats.oil>0,1200,4,'Heavy escorts unlocked');this.reward('jungle',this.stats.soldTools>=12,650,3,'Canopy delivery complete');this.reward('bells',this.stats.soldGrain>=24,900,4,'Bellwether provisioned');this.reward('crown',this.stats.soldOil>=24,1800,4,'Crown delivery complete');}
    price(good,buy=true,port=this.port,offset=0){if(!goods[good]||!markets[port])return 0;const base=markets[port][good],volume=(this.marketVolumes[port+':'+good]||0)+offset,season=1+Math.sin(this.marketTurn*.8+Object.keys(goods).indexOf(good)*1.7)*.035;return Math.max(1,Math.round(base*season*(buy?1:.82)*(1+clamp(volume,-80,80)*.0015)));}
    quote(good,count,buy=true){let total=0;for(let i=0;i<count;i++)total+=this.price(good,buy,this.port,(buy?1:-1)*i);return total;}
    load(good,qty,preferred=null){let left=qty;const list=[...this.ships].filter(s=>s.hp>0).sort((a,b)=>(a===preferred?-100:0)-(b===preferred?-100:0)+(a.id===0?1:0)-(b.id===0?1:0));for(const s of list){const n=Math.min(left,s.hold-used(s));if(n>0){s.manifest[good]=(s.manifest[good]||0)+n;left-=n;s.cargo=used(s);}if(!left)break;}return qty-left;}
    trade(good,count,buy){if(!this.port||!goods[good]||!Number.isInteger(count)||count<1||count>1000)return false;const total=this.quote(good,count,buy);if(buy&&(total>this.coins||count>this.capacity-this.cargo)||!buy&&count>this.amount(good))return false;
      if(buy)this.load(good,count);else{let left=count;for(const s of this.ships){if(s.hp<=0)continue;const n=Math.min(left,s.manifest[good]||0);s.manifest[good]=(s.manifest[good]||0)-n;s.cargo=used(s);left-=n;}}
      this.coins+=buy?-total:total;this.marketVolumes[this.port+':'+good]=(this.marketVolumes[this.port+':'+good]||0)+(buy?count:-count);if(!buy){this.stats.profit+=total;if(good==='salt'&&['reeds','lantern'].includes(this.port))this.stats.soldSalt+=count;if(good==='timber'&&this.port==='yard')this.stats.soldTimber+=count;if(good==='tools'&&this.port==='canopy')this.stats.soldTools+=count;if(good==='grain'&&this.port==='bells')this.stats.soldGrain+=count;if(good==='oil'&&this.port==='crown')this.stats.soldOil+=count;}this.progress();return{count,total};
    }
    berth(s,id=this.port){const p=E.ports.find(p=>p.id===id)||E.ports[0];for(let r=20;r<=300;r+=12)for(let a=0;a<12;a++){const angle=a/12*Math.PI*2,x=p.x+Math.cos(angle)*r,y=p.y+Math.sin(angle)*r;if([0,Math.PI/4,Math.PI/2,Math.PI*.75].some(angle=>this.field.clearance(s,x,y,angle,.5)<.5))continue;if(this.ships.some(other=>other!==s&&other.hp>0&&(Math.hypot(x-other.x,y-other.y)<(s.length+other.length)*.55||other.berthPort===id&&other.berthTarget&&Math.hypot(x-other.berthTarget.x,y-other.berthTarget.y)<(s.length+other.length)*.55)))continue;return{x,y,angle:0};}return null;}
    hire(type){const spec=boats[type];if(!this.port||!spec||this.rank<spec.rank||this.coins<spec.cost||this.ships.length>=24)return false;const s=ship(type,this.ships.length),at=this.berth(s);if(!at)return false;Object.assign(s,at,{px:at.x,py:at.y,previousAngle:0});this.ships.push(s);this.coins-=spec.cost;this.updateStats();this.rebuildMounts();this.notify(s.name+' joined the fleet');return true;}
    changeHull(type){const spec=hulls[type];if(!this.port||!spec||this.rank<spec.rank||this.coins<spec.cost||type===this.player.type)return false;const s=ship(type),at=this.berth(s);if(!at||used(this.player)>spec.hold+this.levels.hold*8)return false;s.manifest=this.player.manifest;Object.assign(s,at,{px:at.x,py:at.y,previousAngle:0});this.ships[0]=s;this.coins-=spec.cost;this.updateStats();this.rebuildMounts();this.convoyTrail=[];this.recordConvoy(true);return true;}
    upgrade(key){const spec=upgrades[key];if(!this.port||this.rank<3||!spec||this.levels[key]>=5)return false;const price=spec.base*(this.levels[key]+1);if(this.coins<price)return false;this.coins-=price;this.levels[key]++;const fraction=this.ships.map(s=>s.hp/s.maxHp);this.updateStats();this.ships.forEach((s,i)=>s.hp=s.maxHp*fraction[i]);return true;}
    repairCost(){return Math.ceil(this.ships.reduce((n,s)=>n+Math.max(0,s.maxHp-s.hp)*.12,0));}
    repair(){const cost=this.repairCost();if(!this.port||cost>this.coins)return false;this.coins-=cost;for(const s of this.ships){if(s.hp<=0){const at=this.berth(s);if(at)Object.assign(s,at,{px:at.x,py:at.y});}s.hp=s.maxHp;}return true;}
    routeHull(){const p={...this.player};for(const s of this.ships)if(s.hp>0){p.length=Math.max(p.length,s.length);p.width=Math.max(p.width,s.width);p.draft=Math.max(p.draft,s.draft);}const spec=p.type==='launch'?{speed:20}:B.roles[p.type];p.cruiseSpeed=Math.min(spec.speed*(1+this.levels.engine*.10),...this.ships.filter(s=>s.hp>0).map(s=>s.speed));p.departureTime=this.time;return p;}
    castOff(){if(!this.port)return false;this.lastPort=this.port;this.port=null;this.arrived=null;this.convoyTrail=[];this.traveled=0;this.recordConvoy(true);for(const s of this.ships){s.followD=0;s.orderKey=null;s.orderRoute=null;s.helm=null;s.needsJoin=s.id>0;}return true;}
    nearPort(){return E.ports.find(p=>Math.hypot(p.x-this.player.x,p.y-this.player.y)<Math.max(32,this.player.length*.7));}
    nearThreats(){let n=0;for(let i=0;i<this.raiders.count;i++)if(this.raiders.hp[i]>0&&Math.hypot(this.raiders.x[i]-this.player.x,this.raiders.y[i]-this.player.y)<220)n++;return n;}
    dock(){const p=this.nearPort();if(!p||this.nearThreats()||Math.hypot(this.player.vx,this.player.vy)>3)return false;const late=this.ships.some(s=>s.hp>0&&Math.hypot(s.x-p.x,s.y-p.y)>360);if(late)return false;this.port=this.lastPort=p.id;this.cancel();this.stopWork();this.marketTurn++;for(const k of Object.keys(this.marketVolumes))this.marketVolumes[k]*=.75;this.visited.add(p.id);for(const s of this.ships){s.vx=s.vy=s.turn=s.throttle=0;s.helm=null;}return true;}
    nearSite(){return sites.find(s=>Math.hypot(s.x-this.player.x,s.y-this.player.y)<s.radius);}
    startWork(){const site=this.nearSite(),type=site?.type==='fish'?'trawler':'oilrig',workers=this.ships.filter(s=>s.type===type&&s.hp>0&&used(s)<s.hold);if(this.port||!site||this.rank<site.rank||!workers.length)return false;this.cancel();this.work=true;this.workTime=0;this.center={x:site.x,y:site.y};this.operation={id:site.id,elapsed:0,production:0,nextWave:6,remaining:0,rare:false};for(let i=0;i<workers.length;i++){const s=workers[i];s.slot={x:(i-(workers.length-1)/2)*Math.min(site.radius*.5,55),y:Math.min(42,site.radius*.5)};if(this.field.clearance(s,site.x+s.slot.x,site.y,0)<.3)s.slot={x:0,y:0};}this.notify('Workboats deploying');return true;}
    stopWork(){this.work=false;this.operation=null;this.workTime=0;}
    setConvoyOrder(order){
      if(!['close','spaced'].includes(order))return false;
      this.convoyOrder=order;return true;
    }
    transferCargo(fromId,toId,good,count){
      if(!this.port||!Object.hasOwn(goods,good)||!Number.isInteger(count)||count<1)return false;
      const from=this.ships.find(s=>s.id===fromId&&s.hp>0),to=this.ships.find(s=>s.id===toId&&s.hp>0);
      if(!from||!to||from===to||(from.manifest[good]||0)<count||to.hold-used(to)<count)return false;
      from.manifest[good]-=count;to.manifest[good]=(to.manifest[good]||0)+count;
      from.cargo=used(from);to.cargo=used(to);return true;
    }
    recordConvoy(force=false){const p=this.player,last=this.convoyTrail.at(-1);if(!last||force||Math.hypot(p.x-last.x,p.y-last.y)>4){if(last)this.traveled+=Math.hypot(p.x-last.x,p.y-last.y);this.convoyTrail.push({x:p.x,y:p.y,d:this.traveled});if(this.convoyTrail.length>4096)this.convoyTrail.shift();}}
    followFleet(dt){const path=this.convoyTrail,port=this.arrived&&E.ports.find(p=>p.id===this.arrived.id),site=this.operation&&sites.find(s=>s.id===this.operation.id);let spacing=0;
      for(let i=1;i<this.ships.length;i++){
        const s=this.ships[i];s.px=s.x;s.py=s.y;s.previousAngle=s.angle;if(s.hp<=0)continue;
        spacing+=((s.length+this.ships[i-1].length)*.65+8+(s.id*7%13))*(this.convoyOrder==='close'?.8:1);let target,final=false;
        const working=site&&s.type===(site.type==='fish'?'trawler':'oilrig');
        if(working){
          const key='work:'+site.id;if(s.orderKey!==key){s.needsJoin=false;s.orderKey=key;s.orderRoute=this.field.route(s,{id:key,name:site.name,x:site.x+s.slot.x,y:site.y+s.slot.y});}
        }else if(port&&Math.hypot(this.player.vx,this.player.vy)<2){
          const key='berth:'+port.id;if(s.orderKey!==key){s.orderKey=key;const at=this.berth(s,port.id);s.berthTarget=at;s.berthPort=port.id;s.orderRoute=at&&this.field.route(s,{id:key,name:port.name,...at});}
        }else if(s.needsJoin&&!s.orderRoute){
          // Leave each berth by a checked channel approach before following the
          // captain's wake. A large stern cannot cut straight across the quay.
          if((this.tick+s.id*7)%30!==0)continue;const join=path.find(p=>p.d>=60);if(!join)continue;
          s.orderKey='join';s.joinD=join.d;s.orderRoute=this.field.route(s,{id:'join',name:'Convoy',x:join.x,y:join.y});if(!s.orderRoute)continue;
        }else if(s.orderKey&&s.orderKey!=='join'){s.orderKey=null;s.orderRoute=null;s.followD=path.reduce((best,p)=>Math.hypot(p.x-s.x,p.y-s.y)<Math.hypot(best.x-s.x,best.y-s.y)?p:best,path[0]).d;}
        if(s.orderRoute){const r=s.orderRoute;while(r.index<r.points.length-1&&Math.hypot(r.points[r.index].x-s.x,r.points[r.index].y-s.y)<Math.max(10,s.speed*.65))r.index++;target=r.points[r.index];final=r.index===r.points.length-1;}
        else{
          // Follow the route in order. A lagging boat must not steer directly
          // across the inside bank toward the captain's current wake position.
          const limit=Math.max(path[0].d,this.traveled-spacing);s.followD=Math.max(path[0].d,s.followD||path[0].d);
          let at=0;while(at<path.length-1&&path[at].d<s.followD)at++;
          while(at<path.length-1&&path[at+1].d<=limit&&Math.hypot(path[at].x-s.x,path[at].y-s.y)<Math.max(12,s.speed*.75)){at++;s.followD=path[at].d;}
          target=path[at];final=target.d>=limit-5;
        }
        if(!target)continue;const dx=target.x-s.x,dy=target.y-s.y,d=Math.hypot(dx,dy);if(s.orderKey==='join'&&final&&d<Math.max(9,s.length*.2)){s.followD=s.joinD;s.needsJoin=false;s.orderKey=null;s.orderRoute=null;continue;}const before={x:s.x,y:s.y,angle:s.angle};
        const turn=Math.abs(B.angleDelta(Math.atan2(dy,dx),s.angle)),amount=(final?Math.min(1,d/(s.speed*1.3)):1)*(turn>.6?.45:turn>.3?.7:1);
        B.crewStep(s,this.contacts?this.contacts.steer(s,dx,dy,amount,this):{x:dx/(d||1)*amount,y:dy/(d||1)*amount},dt,this.tick,true);this.sea.stepShip(s,dt);
        const water=this.field.sample(s.x,s.y,this._fleetWater||(this._fleetWater={}));s.x+=water.currentX*dt;s.y+=water.currentY*dt;
        if(this.field.clearance(s)<.12){s.x=before.x;s.y=before.y;s.angle=before.angle;s.vx=s.vy=s.turn=s.throttle=0;s.helm=null;}
        if(s.type==='repair')for(const other of this.ships)if(other.hp>0&&Math.hypot(other.x-s.x,other.y-s.y)<100)other.hp=Math.min(other.maxHp,other.hp+dt*1.5);
      }
    }
    clearShot(x,y,tx,ty){if(Math.min(y,ty)>1410&&Math.min(x,tx)>-4000&&Math.max(x,tx)<4000)return true;const n=Math.ceil(Math.hypot(tx-x,ty-y)/12);for(let i=0;i<=n;i++)if(this.field.sample(x+(tx-x)*i/Math.max(1,n),y+(ty-y)*i/Math.max(1,n),this._water||(this._water={})).depth<0)return false;return true;}
    enemyWaypoint(x,y,target){if(this.clearShot(x,y,target.x,target.y))return target;
      const nodes=this.field.nodes;let closest=0,d=Infinity;for(let i=0;i<nodes.length;i++){const n=nodes[i],dd=(x-n.x)**2+(y-n.y)**2;if(dd<d){d=dd;closest=i;}}
      // A shared shortest-path tree is rebuilt only as the convoy advances.
      if(!this.flow||this.time-this.flow.time>1){let goal=0,best=Infinity;for(let i=0;i<nodes.length;i++){const n=nodes[i],dd=(target.x-n.x)**2+(target.y-n.y)**2;if(dd<best){best=dd;goal=i;}}const dist=new Float64Array(nodes.length).fill(Infinity),next=new Int32Array(nodes.length).fill(-1),done=new Uint8Array(nodes.length);dist[goal]=0;for(let k=0;k<nodes.length;k++){let at=-1,min=Infinity;for(let i=0;i<nodes.length;i++)if(!done[i]&&dist[i]<min){at=i;min=dist[i];}if(at<0)break;done[at]=1;for(const edge of nodes[at].edges)if(edge.channel!=='cut'&&min+edge.distance<dist[edge.to]){dist[edge.to]=min+edge.distance;next[edge.to]=at;}}this.flow={next,time:this.time};}
      return nodes[d<32*32&&this.flow.next[closest]>=0?this.flow.next[closest]:closest];
    }
    enemyWater(x,y){
      if(x<-3975||x>3975||y<-7975||y>3975)return false;
      if(y>1440)return true;
      // Conservative 8 m cells include every heading of a 23 m raider plus
      // the cell's half-diagonal. Cache this shared field, not per-vessel probes.
      const cx=Math.round(x/8),cy=Math.round(y/8),key=cx+cy*2048,cache=this.enemyCells||(this.enemyCells=new Map());
      if(cache.has(key))return cache.get(key);const clear=this.field.clearance({length:38,width:38,draft:.8},cx*8,cy*8,0,.15)>=.15;
      if(cache.size>=65536)cache.clear();cache.set(key,clear);return clear;
    }
    moveEnemy(i,dt,vx=this.raiders.vx[i],vy=this.raiders.vy[i]){const a=this.raiders,w=this.field.sample(a.x[i],a.y[i],this._enemyWater||(this._enemyWater={})),x=a.x[i]+(vx+w.currentX)*dt,y=a.y[i]+(vy+w.currentY)*dt;const moved=this.enemyWater(x,y);if(moved){a.x[i]=x;a.y[i]=y;}else{a.vx[i]*=.2;a.vy[i]*=.2;}if(w.heat>0){a.hp[i]-=w.heat*dt;if(a.hp[i]<=0)this.kill(i,false);}return moved;}
    threat(){const w=this.field.sample(this.player.x,this.player.y,this._threatWater||(this._threatWater={})),tier=w.region.tier;return{tier,count:[0,5,10,18,28][tier],cap:[0,12,28,48,80][tier],interval:[100,85,78,70,62][tier],region:w.region};}
    wave(count,working=false){
      const threat=this.threat();count=Math.min(count,Math.max(0,(working?Math.max(24,threat.cap):threat.cap)-this.raiders.count));
      const a=this.raiders,p=this.player,probe={length:23,width:8,draft:.8},rear=new Float64Array(16).fill(340),sector=(x,y)=>Math.floor((Math.atan2(y,x)+Math.PI)/(Math.PI*2)*16)%16;
      const rearAt=(x,y)=>{const i=sector(x,y);return Math.max(rear[i],rear[(i+1)%16],rear[(i+15)%16]);};let admitted=0;
      // Waves join behind the existing attackers. Sample the rear once per
      // wave, so admitting a group cannot push its own entry farther away.
      for(let i=0;i<a.count;i++)if(a.hp[i]>0){const x=a.x[i]-p.x,y=a.y[i]-p.y,k=sector(x,y);rear[k]=Math.max(rear[k],Math.hypot(x,y)+80);}
      const nodes=p.y>1450?null:this.field.nodes.filter(n=>n.channel!=='cut'&&Math.hypot(n.x-p.x,n.y-p.y)>=rearAt(n.x-p.x,n.y-p.y)&&!B.spawnVisible(this,n.x,n.y)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)).slice(0,32);
      for(let n=0;n<count*12&&admitted<count&&a.count<2048;n++){
        let x,y;
        if(!nodes){const angle=this.random()*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle),radius=B.spawnRadius(this,p,angle,rearAt(c,s)+this.random()*280,180);x=p.x+c*radius;y=p.y+s*radius;}
        else{if(!nodes.length)break;const node=nodes[Math.floor(this.random()*nodes.length)];x=node.x+(this.random()-.5)*node.width*.5;y=node.y+(this.random()-.5)*node.width*.5;}
        if(x<E.bounds.left||x>E.bounds.right||y<E.bounds.top||y>E.bounds.bottom||Math.hypot(x-p.x,y-p.y)<rearAt(x-p.x,y-p.y)||B.spawnVisible(this,x,y)||this.ships.some(s=>s.hp>0&&Math.hypot(x-s.x,y-s.y)<180)||this.field.clearance(probe,x,y,0,.5)<.5||E.ports.some(port=>Math.hypot(x-port.x,y-port.y)<180))continue;
        const roll=this.random(),tier=threat.tier,kind=tier>=3&&roll<.3?2:tier>=2&&roll<.6?1:0;if(a.add(x,y,kind,this.random)){admitted++;this.spawned++;}
      }
      a.index();return admitted;
    }
    sound(...args){B.Battle.prototype.sound.apply(this,args);}
    impact(...args){B.Battle.prototype.impact.apply(this,args);}
    damage(...args){B.Battle.prototype.damage.apply(this,args);}
    hurt(s,n){if(s.hp<=0)return;s.hp=Math.max(0,s.hp-n);s.hit=.16;if(!s.hp){s.manifest={};s.cargo=0;this.lost++;this.effects.add(s.x,s.y,s.length,0);this.notify(s.name+' lost');}this.sound('hurt',s.x,s.y);}
    kill(i,reward=true){if(this.raiders.hp[i]===-999)return;const x=this.raiders.x[i],y=this.raiders.y[i];B.Battle.prototype.kill.call(this,i,reward);if(reward&&(this.kills%3===0||this.random()<.2)&&this.loot.length<128)this.loot.push({x,y,good:this.kills%21===0?'relic':'tools',count:1,life:240});}
    broadside(){if(this.port||this.player.type==='launch'||this.burstCooldown>0)return false;return B.Battle.prototype.broadside.call(this);}
    autoBroadside(){
      const s=this.player,a=this.raiders;if(this.port||s.type==='launch'||s.hp<=0||this.burstCooldown>0||this.tick%12!==0)return;
      // Both gun banks fire a rolling salvo when a raider crosses their arc.
      // A bounded cell query avoids rescanning every enemy for every mount.
      const c=Math.cos(s.angle),sn=Math.sin(s.angle),range=B.BROADSIDE.range*.75;
      for(const side of [-1,1]){const x=s.x-sn*range*.5*side,y=s.y+c*range*.5*side,i=a.nearest(x,y,range*.5);if(i<0)continue;
        const dx=a.x[i]-s.x,dy=a.y[i]-s.y,d=Math.hypot(dx,dy),along=dx*c+dy*sn;
        if(d<range&&Math.abs(along)<d*.25&&this.clearShot(s.x,s.y,a.x[i],a.y[i])){this.broadside();break;}
      }
    }
    emitBroadside(){B.Battle.prototype.emitBroadside.call(this);}
    weaponSpec(m,s){
      if(!m.spec||m.grade!==this.levels.guns){const base=B.weapons[m.weapon];m.grade=this.levels.guns;m.spec={...base,range:s.type==='launch'?210:base.range*.9,damage:base.damage*(1+this.levels.guns*.2),interval:base.interval*(s.type==='launch'?4:s.working?4:1.5)};}
      return m.spec;
    }
    combat(dt,input){this.soundBudget=this.deathBudget=this.impactBudget=0;this.sounds.length=0;this.burstCooldown=Math.max(0,this.burstCooldown-dt);if(this.burstCursor<B.BROADSIDE.rounds){this.burstTimer-=dt;while(this.burstTimer<=0&&this.burstCursor<B.BROADSIDE.rounds){this.emitBroadside();this.burstTimer+=B.BROADSIDE.interval;}}
      const a=this.raiders;a.compact();a.index();a.step(dt,this);a.index();this.contacts?.solve(this,dt);this.autoBroadside();for(const s of this.ships)s.hit=Math.max(0,s.hit-dt);
      B.fireFleet(this,dt);
      this.shots.step(dt,this);this.effects.step(dt);
      for(let i=this.loot.length-1;i>=0;i--){const item=this.loot[i];item.life-=dt;const s=this.ships.find(s=>s.hp>0&&s.hold>used(s)&&Math.hypot(item.x-s.x,item.y-s.y)<Math.max(18,s.width));if(s&&this.load(item.good,item.count,s)){this.notify(goods[item.good].name+' recovered');this.loot.splice(i,1);}else if(item.life<=0)this.loot.splice(i,1);}
    }
    production(dt){const op=this.operation;if(!op)return;const site=sites.find(s=>s.id===op.id),workers=this.ships.filter(s=>s.hp>0&&s.type===(site.type==='fish'?'trawler':'oilrig')&&used(s)<s.hold);if(!workers.length||Math.hypot(this.player.x-site.x,this.player.y-site.y)>site.radius+300){this.stopWork();this.notify('Workboats recalled');return;}const ready=workers.filter(s=>Math.hypot(s.x-site.x-s.slot.x,s.y-site.y-s.slot.y)<22);this.workActive=!!ready.length;if(!ready.length)return;op.elapsed+=dt;this.workTime=op.elapsed;
      if(op.elapsed>=op.nextWave){this.wave(10+Math.min(3,ready.length)*4+this.threat().tier*3,true);op.nextWave+=16;}
      if(Math.floor(op.elapsed/2)>op.production){op.production=Math.floor(op.elapsed/2);for(const s of ready)this.load(site.type,1,s);}
      if(op.elapsed>=site.duration){this.stats[site.type]+=ready.reduce((n,s)=>n+(s.manifest[site.type]||0),0);this.stats.watches++;if(!this.collection.includes(site.rare)){this.collection.push(site.rare);this.load('relic',1,ready[0]);this.notify(site.rare+' discovered');}else if(this.random()<.25){this.load('relic',1,ready[0]);this.notify('A rare catch aboard '+ready[0].name);}this.coins+=120+this.rank*35;this.stopWork();this.notify('Watch complete. Cargo secured.');this.progress();}
    }
    recover(){this.stopWork();this.cancel();this.raiders.count=this.shots.count=this.shots.hostile=0;this.loot=[];const p=E.ports.find(p=>p.id===this.lastPort)||E.ports[0],s=this.player;s.hp=s.maxHp*.65;s.manifest={};s.x=s.px=p.x;s.y=s.py=p.y;s.angle=s.previousAngle=0;s.vx=s.vy=s.turn=s.throttle=0;s.sea=null;this.coins=Math.max(100,this.coins-Math.min(120,Math.floor(this.coins*.15)));this.port=p.id;this.arrived=null;this.convoyTrail=[];this.recordConvoy(true);for(const other of this.ships.slice(1)){const at=this.berth(other,p.id);if(at)Object.assign(other,at,{px:at.x,py:at.y,vx:0,vy:0,turn:0,throttle:0,helm:null});}this.recovery='Recovered at '+p.name+'. Flagship cargo was lost.';this.notify(this.recovery);}
    step(dt,input={x:0,y:0}){if(this.port)return;dt=clamp(dt,0,1/30);const cruise=this.player.speed,manual=Math.hypot(input.x||0,input.y||0)>.04||Math.abs(input.throttle||0)>.04||Math.abs(input.steer||0)>.04;
      // The helmsman keeps the fleet together and respects the existing bend
      // speeds. Taking the helm immediately restores the captain's full speed.
      if(this.route&&!manual){const spec=this.player.type==='launch'?{speed:20}:B.roles[this.player.type];this.player.speed=Math.min(spec.speed*(1+this.levels.engine*.10),...this.ships.filter(s=>s.hp>0).map(s=>s.speed));}
      super.step(dt,input);this.player.speed=cruise;this.recordConvoy();this.followFleet(dt);this.combat(dt,input);this.production(dt);
      for(const s of this.ships)if(s.hp>0){const w=this.field.sample(s.x,s.y,this._heatWater||(this._heatWater={}));if(w.heat>0){const damage=w.heat*dt;if(s.hp<=damage)this.hurt(s,damage);else{s.hp-=damage;if(this.tick%15===0)s.hit=.12;}}}
      if(this.tick%30===0)for(const mark of root.WidewakeWaterways.landmarks)if(!this.discoveries.includes(mark.id)&&Math.hypot(mark.x-this.player.x,mark.y-this.player.y)<180){this.discoveries.push(mark.id);this.notify(mark.name);break;}
      if(!this.operation&&this.time>=this.nextEncounter){const threat=this.threat();this.nextEncounter=this.time+threat.interval;if(!E.ports.some(p=>Math.hypot(p.x-this.player.x,p.y-this.player.y)<250)){this.wave(threat.count);this.encounter++;}}
      if(this.player.hp<=0)this.recover();
    }
    save(){
      const pack=(part,keys)=>{if(part===this.raiders)keys=[...keys,'angle','turn','desiredAngle','desiredSpeed','drive','steeringReady','gunAngle','fireAt','surface','surfaceReady','attackPhase','passX','passY'];if(part===this.shots)keys=[...keys,'verticalSpeed','targetHeight'];return{count:part.count,...Object.fromEntries(keys.map(k=>[k,Array.from(part[k].subarray(0,part.count))]))};};
      return JSON.stringify({schema:'widewake-reach',version:SAVE_VERSION,build:version,convoyOrder:this.convoyOrder,sea:this.sea.snapshot(),coins:this.coins,rank:this.rank,levels:this.levels,ships:this.ships,port:this.port,lastPort:this.lastPort,time:this.time,tick:this.tick,distance:this.distance,visited:[...this.visited],discoveries:this.discoveries,stats:this.stats,earned:this.earned,collection:this.collection,marketTurn:this.marketTurn,marketVolumes:this.marketVolumes,operation:this.operation,center:this.center,workTime:this.workTime,nextEncounter:this.nextEncounter,encounter:this.encounter,random:this.random.state(),kills:this.kills,spawned:this.spawned,lost:this.lost,loot:this.loot,route:this.route,arrived:this.arrived?.id||null,convoyTrail:this.convoyTrail,traveled:this.traveled,burstCooldown:this.burstCooldown,burstCursor:this.burstCursor,burstTimer:this.burstTimer,mounts:this.mounts.map(({spec,grade,...mount})=>mount),raiders:pack(this.raiders,['x','y','vx','vy','pushX','pushY','waveX','waveY','hp','cooldown','id','kind','target']),raiderSequence:this.raiders.sequence,hullContacts:this.contacts.total,shots:pack(this.shots,['x','y','vx','vy','life','total','damage','splash','height','startHeight','pierce','kind','startX','startY','endX','endY','previousHit','owner'])});
    }
    static restore(text){try{return Game.readSave(text);}catch(error){const known=['Save too large','This is not a Bracken Reach save.','This voyage uses a different save version.'];throw Error(known.includes(error.message)?error.message:'This voyage is damaged or incomplete.');}}
    static readSave(text){if(typeof text!=='string'||text.length>2_000_000)throw Error('Save too large');const d=JSON.parse(text);if(!d||d.schema!=='widewake-reach')throw Error('This is not a Bracken Reach save.');if(d.version!==SAVE_VERSION)throw Error('This voyage uses a different save version.');
      const need=(ok)=>{if(!ok)throw Error('Invalid voyage save');};const num=(value,min=0,max=1e9)=>{need(finite(value,min,max));return value;};
      need(Array.isArray(d.ships)&&d.ships.length>=1&&d.ships.length<=24);const g=new Game();g.coins=num(d.coins);g.rank=num(d.rank,1,4);need(Number.isInteger(g.rank));for(const k of Object.keys(upgrades)){g.levels[k]=num(d.levels?.[k],0,5);need(Number.isInteger(g.levels[k]));}
      if(d.convoyOrder!==undefined)need(['close','spaced'].includes(d.convoyOrder));g.convoyOrder=d.convoyOrder||'spaced';g.sea.restore(d.sea);g.ships=d.ships.map((v,i)=>{need(v&&v.id===i&&(i===0?hulls[v.type]:boats[v.type]));const s=ship(v.type,i);if(v.sea){s.sea={};for(const k of ['z','pitch','roll','vz','vp','vr','x','y','pz','ppitch','proll','surface','exposure'])s.sea[k]=num(v.sea[k],-10000,10000);need(Math.abs(s.sea.z)<10&&Math.abs(s.sea.pitch)<1&&Math.abs(s.sea.roll)<1);for(const k of ['lastRise','trough','peakRise','jumpAt','landAt','landX','landY','landAngle','landSpeed','impact','landCount','contact'])if(v.sea[k]!==undefined)s.sea[k]=num(v.sea[k],-1e9,1e9);need(v.sea.airborne===undefined||typeof v.sea.airborne==='boolean');s.sea.airborne=!!v.sea.airborne;if(s.sea.airborne)need(Number.isFinite(s.sea.jumpAt));if(s.sea.landCount!==undefined)need(Number.isInteger(s.sea.landCount)&&s.sea.landCount>=0);if(s.sea.contact!==undefined)need(s.sea.contact>=0&&s.sea.contact<=1);}for(const k of ['x','y'])s[k]=s[k==='x'?'px':'py']=num(v[k],k==='x'?E.bounds.left:E.bounds.top,k==='x'?E.bounds.right:E.bounds.bottom);s.angle=s.previousAngle=num(v.angle,-Math.PI*2,Math.PI*2);for(const k of ['vx','vy','turn'])s[k]=num(v[k]||0,-200,200);s.throttle=v.throttle===undefined?0:Math.max(0,num(v.throttle,-.3,1.35));if(v.helm!=null){need(typeof v.helm==='object');s.helm={x:num(v.helm.x,-1,1),y:num(v.helm.y,-1,1)};need(Math.hypot(s.helm.x,s.helm.y)<=1.001);}s.hp=num(v.hp,0,30000);need(v.manifest&&typeof v.manifest==='object');for(const [k,n]of Object.entries(v.manifest)){need(Object.hasOwn(goods,k)&&Number.isInteger(n));s.manifest[k]=num(n,0,1000);}s.slot={x:num(v.slot?.x||0,-1000,1000),y:num(v.slot?.y||0,-1000,1000)};if(v.berthTarget){s.berthTarget={x:num(v.berthTarget.x,-4000,4000),y:num(v.berthTarget.y,-8000,4000)};s.berthPort=E.ports.some(p=>p.id===v.berthPort)?v.berthPort:null;}s.followD=num(v.followD||0);s.needsJoin=!!v.needsJoin;s.joinD=num(v.joinD||0);if(v.orderRoute){need(Array.isArray(v.orderRoute.points)&&v.orderRoute.points.length>0&&v.orderRoute.points.length<=2000);s.orderKey=String(v.orderKey).slice(0,40);s.orderRoute={points:v.orderRoute.points.map(p=>({x:num(p.x,-4000,4000),y:num(p.y,-8000,4000)})),index:num(v.orderRoute.index,0,v.orderRoute.points.length-1)};}return s;});g.updateStats();need(g.player.hp>0);for(const s of g.ships){need(used(s)<=s.hold&&s.hp<=s.maxHp+.01);need(g.field.clearance(s)>=-.01);}
      const port=id=>E.ports.some(p=>p.id===id);need(d.port===null||port(d.port));need(port(d.lastPort));g.port=d.port;g.lastPort=d.lastPort;g.time=num(d.time);g.tick=num(d.tick);g.distance=num(d.distance);g.traveled=num(d.traveled);g.random=B.random(num(d.random,0,4294967295));need(Array.isArray(d.visited)&&d.visited.length<=E.ports.length+sites.length&&Array.isArray(d.earned)&&d.earned.length<=7&&Array.isArray(d.collection)&&d.collection.length<=3);g.visited=new Set(d.visited.filter(id=>[...E.ports,...sites].some(p=>p.id===id)));g.earned=d.earned.filter(id=>['salt','fish','timber','oil','jungle','bells','crown'].includes(id));if(d.discoveries!==undefined){need(Array.isArray(d.discoveries)&&d.discoveries.length<=root.WidewakeWaterways.landmarks.length);g.discoveries=[...new Set(d.discoveries.filter(id=>root.WidewakeWaterways.landmarks.some(m=>m.id===id)))];}g.collection=d.collection.filter(id=>sites.some(s=>s.rare===id));for(const k of Object.keys(g.stats))g.stats[k]=num(d.stats?.[k]===undefined&&['soldTools','soldGrain','soldOil'].includes(k)?0:d.stats?.[k]);g.marketTurn=num(d.marketTurn);g.marketVolumes={};for(const [k,n]of Object.entries(d.marketVolumes||{})){need(Object.keys(markets).some(p=>Object.keys(goods).some(g=>k===p+':'+g)));g.marketVolumes[k]=num(n,-100000,100000);}
      for(const key of ['kills','spawned','lost','nextEncounter','encounter','workTime','burstCooldown','burstCursor','burstTimer'])g[key]=num(d[key],key==='burstTimer'?-.1:0);if(d.hullContacts!==undefined){g.contacts.total=num(d.hullContacts);need(Number.isInteger(g.contacts.total));}g.center={x:num(d.center.x,-4000,4000),y:num(d.center.y,-8000,4000)};
      if(d.operation){need(sites.some(s=>s.id===d.operation.id));g.operation={id:d.operation.id,elapsed:num(d.operation.elapsed,0,120),production:num(d.operation.production,0,100),nextWave:num(d.operation.nextWave,0,150)};g.work=true;}
      const point=p=>({x:num(p.x,-4000,4000),y:num(p.y,-8000,4000)});need(Array.isArray(d.convoyTrail)&&d.convoyTrail.length<=4096);g.convoyTrail=d.convoyTrail.map(p=>({...point(p),d:num(p.d)}));
      if(d.route){need([...E.ports,...sites].some(p=>p.id===d.route.destination?.id)&&Array.isArray(d.route.points)&&d.route.points.length>0&&d.route.points.length<=2000);g.route={destination:[...E.ports,...sites].find(p=>p.id===d.route.destination.id),points:d.route.points.map(point),distance:num(d.route.distance),index:num(d.route.index,0,d.route.points.length-1),name:d.route.name==='Reed cut'?'Reed cut':'Main channel'};}
      g.arrived=[...E.ports,...sites].find(p=>p.id===d.arrived)||null;need(Array.isArray(d.loot)&&d.loot.length<=128);g.loot=d.loot.map(p=>{need(goods[p.good]);return{...point(p),good:p.good,count:num(p.count,1,10),life:num(p.life,0,240)};});
      const unpack=(target,data,limit,keys)=>{need(data&&Number.isInteger(data.count)&&data.count>=0&&data.count<=limit);target.count=data.count;for(const key of keys){need(Array.isArray(data[key])&&data[key].length===data.count);for(let i=0;i<data.count;i++)target[key][i]=num(data[key][i],-100000,1e9);}target.px.set(target.x);target.py.set(target.y);};
      unpack(g.raiders,d.raiders,2048,['x','y','vx','vy','hp','cooldown','id','kind','target']);for(let i=0;i<g.raiders.count;i++)need(g.raiders.kind[i]<=2&&g.raiders.target[i]<g.ships.length);
      const motionKeys=['angle','turn','desiredAngle','desiredSpeed','drive','steeringReady','gunAngle','fireAt','surface','surfaceReady'],hasMotion=motionKeys.some(k=>d.raiders[k]!==undefined);
      if(hasMotion)for(const key of motionKeys){need(Array.isArray(d.raiders[key])&&d.raiders[key].length===g.raiders.count);for(let i=0;i<g.raiders.count;i++){
        const flag=key==='steeringReady'||key==='surfaceReady',angle=['angle','desiredAngle','gunAngle'].includes(key),min=flag?0:angle?-Math.PI*2:key==='fireAt'?-1000:key==='surface'?-100:key==='turn'?-4:0,max=flag?1:angle?Math.PI*2:key==='fireAt'?1e9:key==='surface'?100:key==='turn'?4:180;
        const value=num(d.raiders[key][i],min,max);if(flag)need(Number.isInteger(value));g.raiders[key][i]=value;
      }}else for(let i=0;i<g.raiders.count;i++){g.raiders.angle[i]=g.raiders.desiredAngle[i]=g.raiders.gunAngle[i]=Math.atan2(g.raiders.vy[i],g.raiders.vx[i]);g.raiders.drive[i]=g.raiders.desiredSpeed[i]=Math.hypot(g.raiders.vx[i],g.raiders.vy[i]);g.raiders.steeringReady[i]=1;g.raiders.fireAt[i]=-1000;}
      g.raiders.previousAngle.set(g.raiders.angle);
      const pressureKeys=['attackPhase','passX','passY'],hasPressure=pressureKeys.some(k=>d.raiders[k]!==undefined);
      if(hasPressure)for(const key of pressureKeys){need(Array.isArray(d.raiders[key])&&d.raiders[key].length===g.raiders.count);for(let i=0;i<g.raiders.count;i++){const value=num(d.raiders[key][i],key==='attackPhase'?0:-1,1);if(key==='attackPhase')need(Number.isInteger(value));g.raiders[key][i]=value;}}
      for(let i=0;i<g.raiders.count;i++)if(g.raiders.attackPhase[i])need(Math.abs(Math.hypot(g.raiders.passX[i],g.raiders.passY[i])-1)<.01);
      for(let i=0;i<g.raiders.count;i++){g.raiders.forwardX[i]=Math.cos(g.raiders.angle[i]);g.raiders.forwardY[i]=Math.sin(g.raiders.angle[i]);}
      // Version-one saves before water blasts have no residual pressure.
      for(const key of ['waveX','waveY'])if(d.raiders[key]!==undefined){need(Array.isArray(d.raiders[key])&&d.raiders[key].length===g.raiders.count);for(let i=0;i<g.raiders.count;i++)g.raiders[key][i]=num(d.raiders[key][i],-10,10);}
      if(d.raiders.pushX!==undefined||d.raiders.pushY!==undefined){
        for(const key of ['pushX','pushY']){need(Array.isArray(d.raiders[key])&&d.raiders[key].length===g.raiders.count);for(let i=0;i<g.raiders.count;i++)g.raiders[key][i]=num(d.raiders[key][i],-B.BLAST.maxSpeed,B.BLAST.maxSpeed);}
        for(let i=0;i<g.raiders.count;i++)need(Math.hypot(g.raiders.pushX[i],g.raiders.pushY[i])<=B.BLAST.maxSpeed+.001);
      }
      g.raiders.sequence=num(d.raiderSequence,1,4294967295);g.raiders.index();unpack(g.shots,d.shots,8192,['x','y','vx','vy','life','total','damage','splash','height','pierce','kind','startX','startY','endX','endY','previousHit','owner']);if(d.shots.startHeight!==undefined)need(Array.isArray(d.shots.startHeight)&&d.shots.startHeight.length===g.shots.count);for(let i=0;i<g.shots.count;i++)g.shots.startHeight[i]=d.shots.startHeight===undefined?g.shots.height[i]:num(d.shots.startHeight[i],-100,200);g.shots.previousHeight.set(g.shots.height);g.shots.hostile=0;for(let i=0;i<g.shots.count;i++){need(Number.isInteger(g.shots.kind[i])&&g.shots.kind[i]>=0&&g.shots.kind[i]<=3&&g.shots.total[i]>0&&g.shots.life[i]>0&&g.shots.life[i]<=g.shots.total[i]+.01&&g.shots.damage[i]>0&&g.shots.damage[i]<=10000&&g.shots.splash[i]>=0&&g.shots.splash[i]<=1000&&g.shots.pierce[i]>=1&&(g.shots.owner[i]===255||g.shots.owner[i]<g.ships.length));if(g.shots.kind[i]===3)g.shots.hostile++;}
      const trajectory=d.shots.verticalSpeed!==undefined||d.shots.targetHeight!==undefined;
      if(trajectory)for(const key of ['verticalSpeed','targetHeight'])need(Array.isArray(d.shots[key])&&d.shots[key].length===g.shots.count);
      for(let i=0;i<g.shots.count;i++){
        g.shots.targetHeight[i]=trajectory?num(d.shots.targetHeight[i],-100,200):g.shots.kind[i]===2?0:1.05;
        g.shots.verticalSpeed[i]=trajectory?num(d.shots.verticalSpeed[i],-100000,100000):g.shots.kind[i]===2?0:B.Shots.launchVertical(g.shots.startHeight[i],g.shots.targetHeight[i],Math.hypot(g.shots.endX[i]-g.shots.startX[i],g.shots.endY[i]-g.shots.startY[i]),Math.hypot(g.shots.vx[i],g.shots.vy[i]));
      }
      g.rebuildMounts();if(Array.isArray(d.mounts)&&d.mounts.length===g.mounts.length)g.mounts.forEach((m,i)=>{m.cooldown=num(d.mounts[i].cooldown,-1e9,20);m.angle=num(d.mounts[i].angle,-7,7);m.desiredAngle=d.mounts[i].desiredAngle===undefined?m.angle:num(d.mounts[i].desiredAngle,-7,7);});g.field.time=g.time;g.field.sample(g.player.x,g.player.y,g.water);return g;
    }
  }
  const api={Game,version,goods,markets,boats,hulls,sites,upgrades,used};root.WidewakeReach=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
