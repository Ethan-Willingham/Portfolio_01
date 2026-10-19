/* Working at sea: forecasts, moving grounds, cargo rhythms and raider approaches. */
(function(root){
  'use strict';
  const D=root.WidewakeData||(typeof require==='function'?require('./widewake-data.js'):null);
  const W=root.WidewakeWorld||(typeof require==='function'?require('./widewake-world.js'):null);
  const {wrap,dx,distance,clamp}=W,TAU=Math.PI*2;
  const profiles={
    shoal:{name:'Shoal nets',duration:60,interval:3,load:3,waves:9,rare:.075,description:'Small catches come aboard every three seconds. Hold the ground while the nets work.'},
    drift:{name:'Following the school',duration:60,interval:3,load:3,waves:9,rare:.09,description:'The school moves across the bank. Your trawlers follow it; keep their moving flanks covered.'},
    deep:{name:'Deep water hauls',duration:72,interval:12,load:12,waves:12,rare:.3,description:'Twelve fish per haul, with twelve seconds between loads. Gunboats try to stand off and shell the trawlers.'},
    pump:{name:'Steady pumping',duration:60,interval:3,load:4,waves:9,rare:0,description:'Four barrels every three seconds. The tender must stay on the well while you cover it.'},
    pressure:{name:'Pressure cycles',duration:72,interval:12,load:16,waves:12,rare:0,description:'Sixteen barrels per pressure cycle. Raiders rush the tender from alternating sides as each load comes up.'}
  };
  const favored={'bahama-bank':'flying','grand-banks':'bluefin','iceland-bank':'ice',patagonia:'bluefin',alaska:'ice',mozambique:'coelacanth','japan-trench':'oarfish',tasman:'oarfish','pacific-deep':'lantern',coral:'mahi',bengal:'moon',canary:'sunfish'};
  const hash=s=>{let n=2166136261;for(const c of s){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0;};
  const watchNames=['Standard watch','Double watch','Triple watch'],loadScale=[1,1.5,2],waveScale=[1,3,7];
  function plan(site,day,watches=1){
    const id=site.type==='oil'?(site.danger>=3?'pressure':'pump'):site.region==='deep'?'deep':site.region==='cold'?'drift':'shoal';
    const seed=hash(site.id),bearing=((seed+Math.floor(day)*137)%360)*Math.PI/180;
    // The forecast changes with the day, not with a deploy/recall reroll.
    const condition=(seed+Math.floor(day))%3,profile=profiles[id];
    const outlook=[{name:'Open water',text:'Broad approaches. Raiders spread across the approach.',spread:1.2,style:'mixed'},
      {name:'Runners sighted',text:'Fast boats approach in a narrow pack. Watch for a rush.',spread:.55,style:'rush'},
      {name:'Guns on the horizon',text:'More gunboats on the approach. Close the distance before they settle.',spread:.85,style:'guns'}][condition];
    if(id==='deep'){outlook.name=['Dispersed gunners','Gunboat column','Flanking gunboats'][condition];outlook.text='Gunboats favor this ground. Their approach '+(condition===1?'is narrow.':'covers a wider front.');outlook.style='guns';}
    if(id==='pressure'){outlook.name=['Scattered runners','A tight rush','Runners on the flanks'][condition];outlook.text='Fast boats favor this well. Their approach '+(condition===1?'is narrow.':'covers a wider front.');outlook.style='rush';}
    return {...profile,id,day:Math.floor(day),watches,watchName:watchNames[watches-1],cycleDuration:profile.duration,duration:profile.duration*watches,bearing,condition,outlook,
      total:profile.duration/profile.interval*loadScale.slice(0,watches).reduce((n,scale)=>n+Math.round(profile.load*scale),0),favored:favored[site.id]||null,pay:Math.round((100+site.danger*75)*[1,2.5,5][watches-1])};
  }
  const finite=(n,lo,hi)=>typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi;
  function validateFish(raw){const out={};if(raw===undefined)return out;if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid landed catches.');for(const [id,n]of Object.entries(raw)){if(!D.fish.some(f=>f.id===id)||!Number.isInteger(n)||n<0||n>1e7)throw new Error('Invalid landed catches.');if(n)out[id]=n;}return out;}
  function validateCatchReport(raw){if(raw==null)return null;const fish=validateFish(raw.fish),paid=raw.paid;if(!D.ports.some(p=>p.id===raw.port)||!Number.isInteger(raw.day)||raw.day<1||raw.day>1e8||!Number.isInteger(paid)||!finite(paid,1,1e10)||!Object.keys(fish).length)throw new Error('Invalid naturalist receipt.');return{port:raw.port,day:raw.day,fish,paid};}
  function validateRecords(raw){const out={};if(raw===undefined)return out;if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid work records.');for(const [id,n]of Object.entries(raw)){if(!D.sites.some(s=>s.id===id)||!Number.isInteger(n)||n<1||n>3)throw new Error('Invalid work records.');out[id]=n;}return out;}
  function validateProduction(raw,ids,day){
    if(!raw)return null;
    const site=D.sites.find(s=>s.id===raw.site);if(!site||!finite(raw.progress,0,1000))throw new Error('Invalid work in progress.');
    const watches=raw.watches??1;if(!Number.isInteger(watches)||watches<1||watches>3)throw new Error('Invalid working watch.');
    const planDay=raw.planDay??Math.floor(day),p=plan(site,planDay,watches);
    if(!Number.isInteger(planDay)||planDay<1||planDay>1e8||!finite(raw.wave??0,0,1000)||!Number.isInteger(raw.wave??0))throw new Error('Invalid work forecast.');
    const loaded=raw.loaded??0,loadedFromResume=raw.loadedFromResume??raw.loaded===undefined;if(!Number.isInteger(loaded)||loaded<0||loaded>100000||typeof loadedFromResume!=='boolean')throw new Error('Invalid work cargo.');
    const timer=raw.timer??5;if(!finite(timer,0,60))throw new Error('Invalid work approach timer.');
    let approach=null;if(raw.approach){const a=raw.approach;if(!finite(a.angle,-TAU*2,TAU*2)||!['mixed','rush','guns'].includes(a.style)||a.flank!=null&&!finite(a.flank,-TAU*2,TAU*2))throw new Error('Invalid raider approach.');approach={angle:a.angle,style:a.style,...(a.flank!=null?{flank:a.flank}:{})};}
    let drift=null;if(raw.drift){if(!finite(raw.drift.x,-140,140)||!finite(raw.drift.y,-140,140)||Math.hypot(raw.drift.x,raw.drift.y)>141)throw new Error('Invalid work drift.');drift={x:raw.drift.x,y:raw.drift.y};}
    const uids=Array.isArray(raw.uids)?[...new Set(raw.uids.filter(id=>ids.has(id)))].slice(0,24):[raw.uid];
    return {site:site.id,watches,progress:Math.min(raw.progress,p.duration),wave:raw.wave||0,uid:raw.uid,uids,planDay,loaded,loadedFromResume,timer,approach,drift};
  }
  function validateReport(raw){
    if(!raw)return null;
    const watches=raw.watches??1;if(!Number.isInteger(watches)||watches<1||watches>3||!D.sites.some(s=>s.id===raw.site)||!Number.isInteger(raw.day)||raw.day<1||raw.day>1e8||!['complete','recall','distance','full','lost'].includes(raw.result)||!Number.isInteger(raw.loaded)||raw.loaded<0||raw.loaded>100000||!Number.isInteger(raw.paid)||raw.paid<0||raw.paid>2500||raw.sinceResume!==undefined&&typeof raw.sinceResume!=='boolean'||raw.returnPending!==undefined&&typeof raw.returnPending!=='boolean')throw new Error('Invalid work report.');
    return {site:raw.site,watches,returnPending:raw.returnPending??false,day:raw.day,result:raw.result,loaded:raw.loaded,paid:raw.paid,sinceResume:raw.sinceResume??false};
  }
  function bearing(angle){return ['E','SE','S','SW','W','NW','N','NE'][((Math.round(angle/(Math.PI/4))%8)+8)%8];}
  function install(Game){
    Object.assign(Game.prototype,{
      workPlan(site,day=this.s.day,watches=1){return plan(site,day,watches);},
      workRecord(site){return this.s.workRecords[site.id]||(this.s.voyage.worked[site.id]?1:0);},
      workUnlocked(site,watches){return Number.isInteger(watches)&&watches>=1&&watches<=3&&watches<=this.workRecord(site)+1;},
      workStage(op=this.production){return op?Math.min(op.plan.watches-1,Math.floor((op.progress+1e-7)/op.plan.cycleDuration)):0;},
      workInterval(){return this.production.plan.waves*[1,.85,.7][this.workStage()];},
      prepareWork(site,boat,workers,saved={}){
        const p=plan(site,saved.planDay??this.s.day,saved.watches??1),op={site,boat,workers,plan:p,progress:saved.progress||0,wave:saved.wave||0,loaded:saved.loaded||0,loadedFromResume:saved.loadedFromResume||false,approach:saved.approach||null,drift:{x:0,y:0}};
        if(p.id==='drift'){
          // Check every station's full travel segment. Never slide a worker
          // through a headland because a procedural drift happened to point inland.
          for(let j=saved.drift?-1:0;j<8;j++){
            const angle=p.bearing+j*Math.PI/4,drift=j===-1?saved.drift:{x:Math.cos(angle)*140,y:Math.sin(angle)*140};
            if(workers.every((f,i)=>{const from=this.workOrigin(op,i),to={x:wrap(from.x+drift.x),y:from.y+drift.y};return this.earth.water(to.x,to.y,15)&&this.earth.clear(from,to,15);})) {op.drift=drift;break;}
          }
        }
        return op;
      },
      workOrigin(op,i){const x=wrap(op.site.x+(i%3-1)*45),y=op.site.y+Math.floor(i/3)*45;return this.earth.water(x,y,15)?{x,y}:{x:op.site.x,y:op.site.y};},
      station(boat){const op=this.production,origin=this.workOrigin(op,op.workers.indexOf(boat)),travel=Math.sin(Math.PI*(op.progress%op.plan.cycleDuration)/op.plan.cycleDuration);return {x:wrap(origin.x+op.drift.x*travel),y:origin.y+op.drift.y*travel};},
      workStatus(){const op=this.production;if(!op)return '';
        const low=Math.ceil(Math.min(...op.workers.map(f=>f.hp/f.maxHp))*100),next=Math.max(1,Math.ceil(op.plan.interval-op.progress%op.plan.interval));
        const action=distance(op.boat,this.station(op.boat))>=35?'Taking station':op.plan.id==='deep'?'Hauling in '+next+'s':op.plan.id==='pressure'?'Next load in '+next+'s':op.plan.id==='drift'?'Following school':'Working';
        return (op.plan.watches>1?'Watch '+(this.workStage()+1)+'/'+op.plan.watches+' / ':'')+action+' / '+op.loaded+(op.loadedFromResume?' since resume':' loaded')+' / hull '+low+'% / '+Math.max(0,Math.ceil(op.plan.duration-op.progress))+'s';
      },
      workApproach(){const op=this.production;if(!op)return;
        const p=op.plan,preferred=p.bearing+(op.wave%2?Math.PI:0),style=p.outlook.style;
        const choose=(preferred,avoid=null)=>{let angle=preferred,best=-1;for(let i=0;i<16;i++){
          const offset=i===0?0:Math.ceil(i/2)*(i%2?1:-1)*Math.PI/8,a=preferred+offset;
          if(avoid!=null&&Math.abs(Math.atan2(Math.sin(a-avoid),Math.cos(a-avoid)))<Math.PI/2)continue;
          const clear=[-.4,0,.4].reduce((n,fan)=>{const q={x:wrap(op.site.x+Math.cos(a+fan*p.outlook.spread)*840),y:op.site.y+Math.sin(a+fan*p.outlook.spread)*840};return n+(this.earth.water(q.x,q.y,30)&&this.earth.clear(q,op.boat,15)?1:0);},0);
          if(clear>best){best=clear;angle=a;}if(clear===3)break;
        }return best>0?Math.atan2(Math.sin(angle),Math.cos(angle)):null;};
        const angle=choose(preferred)??Math.atan2(Math.sin(preferred),Math.cos(preferred)),flank=this.workStage()>0?choose(angle+Math.PI,angle):null;
        op.approach={angle,style,...(flank!=null?{flank}:{})};this.cue('warn');this.uiDirty=true;
      },
      workWave(){const op=this.production;if(!op)return;const approach=op.approach;if(!approach)this.workApproach();
        const {angle,style,flank}=op.approach,stage=this.workStage(),n=(3+op.site.danger*2+Math.floor((op.progress%op.plan.cycleDuration)/20)+(op.workers.length-1)*3)*waveScale[stage],spread=op.plan.outlook.spread;
        for(let i=0;i<n;i++){
          const r=this.random(),kind=op.site.danger>=4&&r<.12+stage*.1?'armored':style==='guns'?(r<.72?'gunner':'skiff'):style==='rush'?(r<.42+stage*.1?'rammer':'skiff'):(r<.24+stage*.1?'rammer':r<.5+stage*.12?'gunner':'skiff');
          // Spawns are in the announced sector, in clear water with a path to
          // the workers. A coast may block an approach, but never moves it behind you.
          const secondary=flank!=null&&i%2===1,sector=secondary?flank:angle,index=flank==null?i:Math.floor(i/2),size=flank==null?n:secondary?Math.floor(n/2):Math.ceil(n/2),a=sector+((index+.5)/size-.5)*spread;
          const q=[720+this.random()*240,840,720,960].map(radius=>({x:wrap(op.site.x+Math.cos(a)*radius),y:op.site.y+Math.sin(a)*radius})).find(q=>this.earth.water(q.x,q.y,30)&&this.earth.clear(q,op.boat,15));
          if(!q)continue;
          const e=this.spawn(kind,op.site,true,q);if(e)Object.assign(e,q,{angle:a+Math.PI});
        }
        op.wave++;op.approach=null;this.uiDirty=true;
      },
      stepWork(dt){const op=this.production;if(!op)return;
        if(op.boat.hp<=0){this.finishProduction(false,'lost');return;}
        if(distance(this.player,op.site)>1100){this.finishProduction(false,'distance');return;}
        if(op.progress>=op.plan.duration){this.finishProduction(true);return;}
        if(distance(op.boat,this.station(op.boat))>=35)return;
        const prev=op.progress,stage=this.workStage();op.progress=Math.min(op.plan.duration,op.progress+dt);const tick=Math.floor((op.progress+1e-7)/op.plan.interval);
        if(tick>Math.floor((prev+1e-7)/op.plan.interval)){
          // A rare specimen replaces one fish in this actual haul. It never
          // creates an extra hold slot or silently pays out before reaching land.
          const before=new Map(this.cargoShips().map(f=>[f.uid,f.cargo[op.site.type]||0]));
          let qty=0;for(const worker of op.workers)if(distance(worker,this.station(worker))<45)qty+=this.addCargo(op.site.type,Math.round(op.plan.load*loadScale[stage]),worker.uid);
          op.loaded+=qty;this.s.stats[op.site.type]+=qty;
          if(qty&&op.site.type==='fish'&&(this.s.stats.rare===0&&op.progress>=12||this.random()<op.plan.rare*(1+stage*.35)*this.modifier('rare'))){const hold=this.cargoShips().find(f=>(f.cargo.fish||0)>(before.get(f.uid)||0));this.rareCatch(op.site,hold?.uid);}
          this.change();
          if(op.progress>=op.plan.duration-1e-7){this.finishProduction(true);return;}
          if(!this.cargoSpace(op.site.type)){this.finishProduction(false,'full');return;}
          if(this.workStage()>stage){this.log('Watch '+(stage+2)+' begins. Heavier raids from two sides. Recall now if the holds or hulls need a harbor.','warn');op.approach=null;this.spawnTimer=Math.max(this.spawnTimer,4);}
        }
      },
      rareCatch(site,uid){const hold=this.cargoShips().find(f=>f.uid===uid&&(f.cargo.fish||0)>0);if(!hold)return null;
        const pool=D.fish.filter(f=>f.region===site.region),fav=plan(site,this.s.day).favored;
        const weight=f=>({Uncommon:6,Rare:3,Legendary:1}[f.rarity]||1)*(f.id===fav?2:1);let draw=this.random()*pool.reduce((n,f)=>n+weight(f),0),f=pool.at(-1);
        for(const item of pool){draw-=weight(item);if(draw<0){f=item;break;}}
        if(!f)return null;const first=!this.s.fishbook[f.id];hold.cargo.fish--;hold.cargo['catch-'+f.id]=(hold.cargo['catch-'+f.id]||0)+1;this.s.fishbook[f.id]=(this.s.fishbook[f.id]||0)+1;this.s.stats.rare++;this.s.xp+=80;
        this.log(f.name+' aboard '+hold.name+'. Bring it to any harbor for '+f.value+' coins.','rare',{discovery:'fish',item:f.id,first,aboard:hold.name,value:f.value});this.change();return f;
      },
      catchesAboard(){return D.fish.map(f=>({...f,qty:this.quantity('catch-'+f.id)})).filter(f=>f.qty>0);},
      landCatches(){if(this.mode!=='port')return null;if(this.s.workReport)this.s.workReport.returnPending=false;const catches=this.catchesAboard();if(!catches.length)return null;const fish={};let paid=0;for(const f of catches){this.removeCargo('catch-'+f.id,f.qty);fish[f.id]=f.qty;paid+=f.qty*f.value;this.s.landedFish[f.id]=(this.s.landedFish[f.id]||0)+f.qty;}
        const report=this.s.catchReport={port:this.s.port,day:this.s.day,fish,paid};this.s.coins+=paid;this.log('The naturalist received '+catches.reduce((n,f)=>n+f.qty,0)+' rare catches. '+paid+' coins paid.','complete');this.change();return report;
      }
    });
  }
  const api={plan,profiles,watchNames,bearing,validateProduction,validateReport,validateFish,validateCatchReport,validateRecords,install};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WidewakeWork=api;
})(typeof globalThis!=='undefined'?globalThis:this);
