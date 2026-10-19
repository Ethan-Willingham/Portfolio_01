/* Active-sea persistence. Fixed-width records keep dense battles below the file limit.
   All simulation numbers are Float64; the format does not quantize combat or motion. */
(function(root){
  'use strict';
  const D=root.WidewakeData||(typeof require==='function'?require('./widewake-data.js'):null),W=root.WidewakeWorld||(typeof require==='function'?require('./widewake-world.js'):null);
  const kinds=['skiff','gunner','rammer','armored','boss'],abilities=['','aim','run','fan','ring','mortar'],drops=['cargo','repair','relic'];
  const specs={skiff:{hp:38,speed:100,range:150,damage:7,rate:1.8,radius:10,reward:18},gunner:{hp:75,speed:78,range:330,damage:12,rate:2.3,radius:13,reward:30},rammer:{hp:95,speed:145,range:0,damage:22,rate:1.8,radius:13,reward:28},armored:{hp:250,speed:65,range:380,damage:23,rate:2.5,radius:19,reward:65},boss:{hp:3000,speed:55,range:420,damage:25,rate:.8,radius:34,reward:2000}};
  // Catalog order is part of version 1. Append entries, or migrate the format.
  const MAX_SAVE_BYTES=1500000,ENEMY_BYTES=101,SHOT_BYTES=57,DROP_BYTES=26;
  const decoded=new WeakMap();
  const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
  const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
  const assert=(ok,message='Invalid active sea.')=>{if(!ok)throw Error(message);};
  const point=p=>{assert(p&&finite(p.x,0,W.W)&&finite(p.y,0,W.H),'Invalid sea position.');return{x:p.x,y:p.y};};
  const ready=n=>Math.max(0,n??0);
  function encode(list,size,write){
    const bytes=new Uint8Array(list.length*size),view=new DataView(bytes.buffer);list.forEach((item,i)=>write(view,i*size,item));
    let binary='';for(let i=0;i<bytes.length;i+=4096)binary+=String.fromCharCode(...bytes.subarray(i,i+4096));return btoa(binary);
  }
  function decode(text,size,max,read){
    assert(typeof text==='string'&&text.length<=Math.ceil(size*max/3)*4&&text.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(text),'Invalid sea record encoding.');
    let binary;try{binary=atob(text);}catch{throw Error('Invalid sea record encoding.');}
    assert(binary.length%size===0&&binary.length/size<=max,'Invalid sea record length.');
    const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    const view=new DataView(bytes.buffer),result=[];
    for(let offset=0;offset<bytes.length;offset+=size)result.push(read(view,offset));return result;
  }
  function enemyRead(v,o){
    const type=kinds[v.getUint8(o)],boss=v.getUint8(o+1),signal=v.getUint8(o+2),flags=v.getUint8(o+3),ability=v.getUint8(o+4),n=[];
    for(let i=0;i<12;i++)n.push(v.getFloat64(o+5+i*8,true));
    const [id,target,x,y,angle,hp,maxHp,cd,specialCD,salvos,abilityAngle,abilityTime]=n;
    assert(type&&boss<=D.bosses.length&&signal<=D.signals.length&&flags<=1&&ability<=5,'Unknown sea vessel or attack.');
    assert(integer(id,1,1e12)&&integer(target,-1,1e10)&&finite(x,0,W.W)&&finite(y,0,W.H)&&finite(angle,-1e10,1e10),'Invalid sea vessel position.');
    const b=boss?D.bosses[boss-1]:null,definition=specs[type];
    assert((!b||type==='boss')&&finite(maxHp,.01,b?b.hp:definition.hp*4)&&finite(hp,0,maxHp)&&(!b||maxHp===b.hp),'Invalid enemy hull.');
    assert(finite(cd,0,60)&&finite(specialCD,0,60)&&integer(salvos,0,1e12)&&finite(abilityAngle,-1e10,1e10)&&finite(abilityTime,0,2.2),'Invalid enemy timing.');
    assert(!flags||b,'Invalid admiral phase.');assert(!ability||(ability<=2?type==='rammer':!!b),'Invalid vessel ability.');
    const e={...definition,id,type,target,x,y,angle,hp,maxHp,cd,specialCD,salvos,enraged:!!flags,dead:false,hit:0};
    if(b)Object.assign(e,{bossId:b.id,name:b.name,reward:b.reward,rate:definition.rate*(flags ? .8 : 1)});
    if(signal)e.encounterId=D.signals[signal-1].id;
    if(ability&&ability<=2){assert(abilityTime<=(ability===1?.9:1.35));e.charge={phase:abilities[ability],angle:abilityAngle,t:abilityTime};}
    else if(ability){const max=ability===5?2.2:1.5;assert(abilityTime<=max);e.attack={kind:abilities[ability],angle:abilityAngle,t:abilityTime,max};}
    return e;
  }
  function shotRead(v,o){
    const values=[];for(let i=0;i<7;i++)values.push(v.getFloat64(o+i*8,true));const [x,y,vx,vy,damage,life,splash]=values,hostile=v.getUint8(o+56);
    assert(finite(x,0,W.W)&&finite(y,-6000,W.H+6000)&&finite(vx,-1500,1500)&&finite(vy,-1500,1500)&&finite(damage,0,1000)&&finite(life,Number.MIN_VALUE,6)&&finite(splash,0,1000)&&hostile<=1,'Invalid projectile.');
    return{x,y,px:x,py:y,vx,vy,damage,life,splash,hostile:!!hostile,radius:hostile?4:3};
  }
  function dropRead(v,o){
    const x=v.getFloat64(o,true),y=v.getFloat64(o+8,true),t=v.getFloat64(o+16,true),kind=drops[v.getUint8(o+24)],index=v.getUint8(o+25),item=(kind==='relic'?D.relics:D.goods)[index]?.id;
    assert(kind&&finite(x,0,W.W)&&finite(y,0,W.H)&&finite(t,Number.MIN_VALUE,45)&&(kind==='repair'||item),'Invalid floating salvage.');
    return{x,y,t,kind,...(kind!=='repair'?{item}:{})};
  }
  function contents(raw){return{enemies:decode(raw.enemies,ENEMY_BYTES,1200,enemyRead),bullets:decode(raw.shots,SHOT_BYTES,3500,shotRead),drops:decode(raw.drops,DROP_BYTES,4096,dropRead)};}
  function validate(raw,state){
    if(raw==null)return null;
    assert(raw.version===1&&state.atSea===true,'Invalid saved sea version or location.');
    assert(integer(raw.random,0,0xffffffff)&&finite(raw.time,0,1e10)&&finite(raw.spawn,0,60)&&integer(raw.nextEnemy,1,1e12),'Invalid sea clock.');
    assert(raw.random===state.randomState&&raw.nextEnemy===state.enemySequence,'The sea and campaign sequences disagree.');
    const parsed=contents(raw),ids=new Set(),bossIds=new Set();
    for(const e of parsed.enemies){assert(!ids.has(e.id)&&e.id<raw.nextEnemy,'Duplicate sea vessel.');ids.add(e.id);if(e.bossId){assert((e.hp===0||!state.bosses.includes(e.bossId))&&!bossIds.has(e.bossId),'Duplicate or defeated admiral.');bossIds.add(e.bossId);}if(e.encounterId)assert(e.encounterId===state.voyage.active?.id,'Invalid patrol assignment.');}
    assert(Array.isArray(raw.hazards)&&raw.hazards.length<=64,'Invalid mortar markers.');
    const hazards=raw.hazards.map(h=>{const p=point(h);assert(finite(h.radius,1,200)&&finite(h.damage,0,1000)&&finite(h.delay,.01,10)&&finite(h.elapsed,0,h.delay),'Invalid mortar timing.');return{...p,radius:h.radius,damage:h.damage,delay:h.delay,elapsed:h.elapsed};});
    const living=new Set([0,...state.fleet.map(f=>f.uid),...(state.voyage.active&&D.signals.find(s=>s.id===state.voyage.active.id)?.kind==='rescue'?[-1]:[])]),seen=new Set();
    assert(Array.isArray(raw.friendly)&&raw.friendly.length===living.size,'Invalid convoy motion.');
    const friendly=raw.friendly.map(f=>{assert(living.has(f.uid)&&!seen.has(f.uid)&&finite(f.vx,-5000,5000)&&finite(f.vy,-5000,5000)&&finite(f.cd,0,60)&&typeof f.distress==='boolean'&&finite(f.navTimer,0,60)&&(f.anchorUid===null||integer(f.anchorUid,-1,1e10)),'Invalid convoy motion.');seen.add(f.uid);return{uid:f.uid,vx:f.vx,vy:f.vy,cd:f.cd,distress:f.distress,navTimer:f.navTimer,anchorUid:f.anchorUid,detour:f.detour?point(f.detour):null};});
    const nav=raw.nav;assert(nav&&finite(nav.probeTime,0,60)&&finite(nav.probeDistance,0,W.W*2)&&finite(nav.blocked,0,60)&&typeof nav.hasLeg==='boolean','Invalid helm continuation.');
    const saved={version:1,random:raw.random,time:raw.time,spawn:raw.spawn,nextEnemy:raw.nextEnemy,enemies:raw.enemies,shots:raw.shots,drops:raw.drops,hazards,friendly,nav:{probeTime:nav.probeTime,probeDistance:nav.probeDistance,blocked:nav.blocked,hasLeg:nav.hasLeg}};
    decoded.set(saved,parsed);return saved;
  }
  function snapshot(g){
    if(g.mode!=='sea')return null;
    // Keep dead slots until the simulation removes them. Its swap removal order
    // affects subsequent targeting and random draws; a reload must keep that order.
    const shots=g.bullets.filter(b=>b.life>0),loot=g.drops.filter(d=>d.t>0);
    return{version:1,random:g.random.state(),time:g.time,spawn:Math.min(60,ready(g.spawnTimer)),nextEnemy:g.nextEnemy,
      enemies:encode(g.enemies,ENEMY_BYTES,(v,o,e)=>{v.setUint8(o,kinds.indexOf(e.type));v.setUint8(o+1,D.bosses.findIndex(b=>b.id===e.bossId)+1);v.setUint8(o+2,D.signals.findIndex(s=>s.id===e.encounterId)+1);v.setUint8(o+3,e.enraged?1:0);const a=e.charge||e.attack;v.setUint8(o+4,a?abilities.indexOf(a.phase||a.kind):0);[e.id,e.target??0,e.x,e.y,e.angle,Math.max(0,e.hp),e.maxHp,Math.min(60,ready(e.cd)),Math.min(60,ready(e.specialCD??3)),e.salvos??0,a?.angle??0,ready(a?.t)].forEach((n,i)=>v.setFloat64(o+5+i*8,n,true));}),
      shots:encode(shots,SHOT_BYTES,(v,o,b)=>{[b.x,b.y,b.vx,b.vy,b.damage,b.life,b.splash??0].forEach((n,i)=>v.setFloat64(o+i*8,n,true));v.setUint8(o+56,b.hostile?1:0);}),
      drops:encode(loot,DROP_BYTES,(v,o,d)=>{v.setFloat64(o,d.x,true);v.setFloat64(o+8,d.y,true);v.setFloat64(o+16,d.t,true);v.setUint8(o+24,drops.indexOf(d.kind));v.setUint8(o+25,d.kind==='repair'?0:(d.kind==='relic'?D.relics:D.goods).findIndex(item=>item.id===d.item));}),
      hazards:g.hazards.map(h=>({...h})),
      friendly:[g.player,...g.fleet.filter(f=>f.hp>0),...(g.encounter?.boat?[g.encounter.boat]:[])].map(f=>({uid:f.uid,vx:f.vx??0,vy:f.vy??0,cd:Math.min(60,ready(f.cd)),distress:!!f.distress,navTimer:Math.min(60,ready(f.navTimer)),anchorUid:f.anchorUid??null,detour:f.detour?{...f.detour}:null})),
      nav:{probeTime:ready(g.navProbeTime),probeDistance:ready(g.navProbeDistance),blocked:ready(g.navBlocked),hasLeg:!!g.navLeg&&g.navLeg===g.route[0]}};
  }
  function restore(g){
    const sea=g.s.sea;if(g.mode!=='sea'||!sea)return;
    assert(!g.s.voyage.active||g.encounter,'The saved encounter is outside your position.');
    assert(!g.s.production||g.production,'The saved watch cannot resume here.');
    // Validation already decoded these records. Transfer them once to the game.
    Object.assign(g,decoded.get(sea)||contents(sea));decoded.delete(sea);g.hazards=sea.hazards.map(h=>({...h}));g.time=sea.time;g.spawnTimer=sea.spawn;g.nextEnemy=sea.nextEnemy;
    g.navProbeTime=sea.nav.probeTime;g.navProbeDistance=sea.nav.probeDistance;g.navBlocked=sea.nav.blocked;g.navLeg=sea.nav.hasLeg?g.route[0]:null;
    for(const f of [g.player,...g.fleet,...(g.encounter?.boat?[g.encounter.boat]:[])]){const saved=sea.friendly.find(s=>s.uid===f.uid);if(saved)Object.assign(f,{vx:saved.vx,vy:saved.vy,cd:saved.cd,distress:saved.distress,navTimer:saved.navTimer,anchorUid:saved.anchorUid,detour:saved.detour?{...saved.detour}:null});}
    g.random.restore(sea.random);g.grid.rebuild(g.enemies);
  }
  const api={specs,validate,snapshot,restore,contents,MAX_SAVE_BYTES};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WidewakeSeaSave=api;
})(globalThis);
