/* Campaign, optional sea encounters, and their portable save state. */
(function(root){
  'use strict';
  const D=root.WidewakeData||(typeof require==='function'?require('./widewake-data.js'):null);
  const W=root.WidewakeWorld||(typeof require==='function'?require('./widewake-world.js'):null);
  const by=(a,id)=>a.find(x=>x.id===id);
  const fresh=()=>({charters:[],resolved:{},worked:{},deliveries:[],active:null});
  function validate(raw){
    if(raw===undefined)return fresh();if(!raw||typeof raw!=='object')throw new Error('Invalid voyage log.');const s=fresh();
    if(!Array.isArray(raw.charters)||raw.charters.some((id,i)=>id!==D.charters[i]?.id))throw new Error('Invalid charter sequence.');s.charters=[...raw.charters];
    if(!raw.resolved||typeof raw.resolved!=='object'||!raw.worked||typeof raw.worked!=='object')throw new Error('Invalid voyage log.');
    for(const [id,result]of Object.entries(raw.resolved)){if(!by(D.signals,id)||!['recovered','cargo','rescued','cleared','traded'].includes(result))throw new Error('Invalid encounter record.');s.resolved[id]=result;}
    for(const [id,n]of Object.entries(raw.worked)){if(!by(D.sites,id)||!Number.isInteger(n)||n<0||n>1e6)throw new Error('Invalid working grounds.');s.worked[id]=n;}
    if(!Array.isArray(raw.deliveries)||raw.deliveries.some(id=>!D.charters.some(c=>c.steps.some(step=>step.kind==='delivery'&&step.key===id))))throw new Error('Invalid charter delivery.');s.deliveries=[...new Set(raw.deliveries)];
    if(raw.active){const a=raw.active,signal=by(D.signals,a.id);if(!signal||signal.kind==='trader'||s.resolved[a.id]||!Number.isFinite(a.progress)||a.progress<0||a.progress>60||!Number.isFinite(a.hp)||a.hp<0||a.hp>1000)throw new Error('Invalid active encounter.');s.active={id:a.id,progress:a.progress,hp:a.hp};}
    return s;
  }
  function install(Game){Object.assign(Game.prototype,{
    setupVoyage(){
      this.signals=D.signals.map(s=>({...s,...this.earth.nearestWater(W.point(s.lon,s.lat),60)}));this.encounter=null;this.signalNotice=null;
      const active=this.s.voyage.active,signal=active&&by(this.signals,active.id);
      if(this.mode==='sea'&&signal&&W.distance(this.player,signal)<1100)this.beginEncounter(signal,active);
    },
    charter(){return D.charters[this.s.voyage.charters.length]||null;},
    charterStep(step){
      let progress=0,total=step.total||1;
      if(step.kind==='stat')progress=this.s.stats[step.key]||0;
      if(step.kind==='hull')progress=Number(D.hulls.indexOf(this.hull())>=D.hulls.indexOf(by(D.hulls,step.key)));
      if(step.kind==='port')progress=Number(this.s.visits.includes(step.key));
      if(step.kind==='boss')progress=Number(this.s.bosses.includes(step.key));
      if(step.kind==='signal')progress=Number(!!this.s.voyage.resolved[step.key]);
      if(step.kind==='work')progress=Number(D.sites.some(s=>s.type==='fish'&&s.region===step.key&&this.s.voyage.worked[s.id]>0));
      if(step.kind==='delivery')progress=Number(this.s.voyage.deliveries.includes(step.key));
      if(step.kind==='return')progress=Number(this.mode==='port'&&this.s.port===step.key&&this.s.bosses.includes('last-light'));
      return{...step,progress:Math.min(progress,total),total,done:progress>=total};
    },
    charterStatus(){const c=this.charter();if(!c)return null;const steps=c.steps.map(s=>this.charterStep(s));return{...c,steps,ready:steps.every(s=>s.done),number:this.s.voyage.charters.length+1};},
    charterGuidance(step=this.charterStatus()?.steps.find(s=>!s.done)){
      if(!step)return{service:'voyage',label:'Complete charter',text:'Complete this charter at any port\u2019s voyage desk.'};
      const worker=step.kind==='work'||step.kind==='stat'&&step.key==='fish'?'trawler':step.kind==='stat'&&step.key==='oil'?'oilrig':null;
      if(worker&&!this.s.fleet.some(f=>f.type===worker)){
        const spec=by(D.boats,worker);return{service:'fleet',focus:worker,label:worker==='trawler'?'Find a trawler':'Find an oil tender',text:'Hire '+(worker==='trawler'?'a fishing trawler':'an oil tender')+' from Fleet at a port. '+spec.cost.toLocaleString('en-US')+' coins'+(this.rank<spec.rank?', captain rank '+spec.rank:'')+'.'};
      }
      if(step.kind==='stat'&&step.key==='sugar'&&this.s.port==='nassau'&&this.mode==='port')return{service:'trade',focus:'sugar',label:'Sell sugar',text:step.text};
      return{...step,label:step.service==='yard'?'Shipyard':step.target?'Chart':'Voyage',text:step.text};
    },
    charterDelivery(key){const step=this.charter()?.steps.find(s=>s.kind==='delivery'&&s.key===key);if(!step||this.mode!=='port'||this.s.port!==step.port||this.s.voyage.deliveries.includes(key)||this.quantity(step.good)<step.qty)return false;this.removeCargo(step.good,step.qty);this.s.voyage.deliveries.push(key);this.log('Charter cargo delivered: '+step.qty+' '+by(D.goods,step.good).name.toLowerCase()+'.');this.change();return true;},
    claimCharter(){const c=this.charterStatus();if(!c?.ready||this.mode!=='port')return false;this.s.voyage.charters.push(c.id);this.s.coins+=c.reward;this.s.xp+=c.xp;this.log('Charter complete: '+c.title+'. '+c.reward+' coins paid.');this.event(c.id==='home'?'Home again. The campaign is complete. The ocean and your fleet are still yours.':'A new charter is waiting at the voyage desk.','rare');this.change();return true;},
    nearbySignal(){return this.signals.find(s=>!this.s.voyage.resolved[s.id]&&W.distance(this.player,s)<220)||null;},
    signalChoice(id,choice){
      const s=by(this.signals,id);if(!s||this.mode!=='sea'||W.distance(this.player,s)>220||this.s.voyage.resolved[id]||this.encounter||this.production)return false;
      if(choice==='trade'&&s.kind==='trader'){
        if(this.s.coins<s.price||this.cargoSpace(s.good)<s.qty)return false;this.s.coins-=s.price;this.addCargo(s.good,s.qty);this.s.voyage.resolved[id]='traded';this.s.xp+=90;this.log('Bought '+s.qty+' '+by(D.goods,s.good).name.toLowerCase()+' from '+s.name+'.');this.change();return true;
      }
      if(choice==='cargo'&&s.kind==='wreck'){
        if(this.cargoSpace(s.quickGood)<s.quickQty)return false;this.addCargo(s.quickGood,s.quickQty);this.s.voyage.resolved[id]='cargo';this.s.xp+=70;this.log('Recovered the floating cargo at '+s.name+'. The wreck was left behind.');this.change();return true;
      }
      if(choice!=='work'||s.kind==='trader')return false;this.cancelCourse();this.beginEncounter(s);this.log(s.kind==='rescue'?s.boatName+' needs 45 seconds. Keep her afloat.':s.kind==='wreck'?'Recovery line overboard. Hold nearby for 24 seconds.':'The patrol has spotted you. Clear every marked raider.');return true;
    },
    beginEncounter(signal,saved){
      const hp=650,boat=signal.kind==='rescue'?{x:signal.x,y:signal.y,angle:-.5,hp:saved?.hp??hp,maxHp:hp,radius:16,type:'freighter',uid:-1,temporary:true,data:{name:signal.boatName,cargo:{}},wake:[{x:signal.x,y:signal.y}],vx:0,vy:0}:null;
      this.encounter={signal,boat,progress:saved?.progress||0,wave:8};this.spawnTimer=10;this.encounterWave(signal.kind==='battle'?8+signal.danger*4:3+signal.danger*2);
    },
    encounterWave(n){const op=this.encounter;if(!op)return;for(let i=0;i<n;i++){const kind=op.signal.danger>=3&&i%5===0?'armored':i%3===0?'rammer':i%2===0?'gunner':'skiff',e=this.spawn(kind,op.signal,true);if(e)e.encounterId=op.signal.id;}},
    finishEncounter(success){
      const op=this.encounter;if(!op)return;this.encounter=null;this.s.voyage.active=null;
      if(success){const s=op.signal;this.s.voyage.resolved[s.id]=s.kind==='rescue'?'rescued':s.kind==='battle'?'cleared':'recovered';this.s.coins+=s.reward;this.s.xp+=100+s.danger*40;if(s.relic)this.salvage(s.relic);this.log(s.name+': '+s.reward+' coins recovered.','complete');}
      else this.event('Operation abandoned. You can return to try again.','warn');
      for(const e of this.enemies)if(e.encounterId===op.signal.id)e.encounterId=null;this.change();
    },
    stepVoyage(dt){
      if(this.encounter){const op=this.encounter,limit=op.signal.kind==='wreck'?24:45;
        if(W.distance(this.player,op.signal)>1100||op.boat&&op.boat.hp<=0){this.finishEncounter(false);return;}
        if(op.signal.kind==='battle'){if(!this.enemies.some(e=>e.hp>0&&e.encounterId===op.signal.id))this.finishEncounter(true);}
        else{if(W.distance(this.player,op.signal)<650)op.progress+=dt;op.wave-=dt;if(op.wave<=0){this.encounterWave(2+op.signal.danger*2);op.wave=12;}if(op.progress>=limit)this.finishEncounter(true);}
      }
      const signal=this.nearbySignal();if(signal&&this.signalNotice!==signal.id){this.signalNotice=signal.id;this.event('Signal nearby: '+signal.name+'. Approach to investigate.');}
    },
    snapshotVoyage(){this.s.voyage.active=this.encounter?{id:this.encounter.signal.id,progress:this.encounter.progress,hp:this.encounter.boat?.hp||0}:null;}
  });}
  const api={fresh,validate,install};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WidewakeVoyage=api;
})(typeof globalThis!=='undefined'?globalThis:this);
