/* A complete, disposable endgame watch. Never reads or writes voyage storage. */
(function(root){
  'use strict';
  const B=root.WidewakeBattle,TAU=Math.PI*2;
  const arsenal=Object.freeze({
    gun:{...B.weapons.gun,damage:42,burst:4,spacing:.055,interval:.22},
    guard:{...B.weapons.guard,range:560,interval:.24,damage:42},
    flak:{...B.weapons.flak,range:860,splash:76,damage:95,burst:2,spacing:.12,interval:.8},
    mortar:{...B.weapons.mortar,range:1280,interval:2.9,damage:240,splash:112}
  });
  const fronts=[
    {name:'First contact',angles:[-2.5,.65],width:.95,fast:.18,armor:.035},
    {name:'Crosscurrent',angles:[-.7,2.2],width:.65,fast:.38,armor:.05},
    {name:'Iron tide',angles:[-2.1,.2,2.9],width:.8,fast:.20,armor:.11},
    {name:'The encirclement',angles:[-2.7,-1.1,.65,2],width:.62,fast:.4,armor:.07},
    {name:'Last light',angles:[-2.3,-.5,1.25,2.8],width:.9,fast:.46,armor:.13}
  ];
  class Endgame extends B.Battle{
    constructor({seed=90210,population=16384,duration=180}={}){
      super({population:0,seed,duration});
      this.endgame=true;this.automatic=true;this.population=Math.min(32768,population);this.phase=0;this.phaseName=fronts[0].name;
      this.events=[];this.loot=[];this.nextCrate=800;this.repaired=0;this.salvos=0;this.fired=new Uint32Array(24);this.weaponShots=new Uint32Array(4);
      this.nextPincer=12;this.pincer=0;this.admission=0;this.damageTaken=0;this.peakKillsPerSecond=0;this.recentKills=0;this.lastKills=0;
      let gun=0,battery=0,screen=0;
      for(const s of this.ships){
        if(s.type==='gunboat'){const a=gun++/12*TAU;s.slot={x:Math.cos(a)*315,y:Math.sin(a)*315};s.angle=a;}
        else if(s.type==='battery'){const a=battery++/4*TAU+Math.PI/4;s.slot={x:Math.cos(a)*200,y:Math.sin(a)*200};s.angle=a;}
        else if(s.type==='screen'){s.slot={x:screen++?235:-235,y:15};s.angle=s.slot.x>0?0:Math.PI;}
        else if(s.id===0){s.slot={x:0,y:190};s.angle=-Math.PI/4;}
        s.x=s.px=s.slot.x;s.y=s.py=s.slot.y;s.previousAngle=s.angle;
      }
      const tender=this.ships.find(s=>s.type==='repair');this.mounts.push({ship:tender.id,weapon:'guard',along:10,angle:0,flash:0,recoil:0,cooldown:.3});
      for(const m of this.mounts){m.cooldown=(m.ship*.13+Math.abs(m.along)*.017)%arsenal[m.weapon].interval;m.burstLeft=0;}
      for(let i=0;i<this.population;i++)this.spawn(true,i);
      this.raiders.index();this.events.push('Protect the workboats. Weapons fire automatically.');
    }
    weaponSpec(m,s){if(!m.spec)m.spec=s.working?{...arsenal.guard,interval:.65}:arsenal[m.weapon];return m.spec;}
    spawn(initial=false,index=0){
      const r=this.random,f=fronts[this.phase||0],n=initial?index:this.admission++,front=n%f.angles.length;
      const angle=f.angles[front]+(r()-.5)*f.width+(initial&&index>4000?(r()-.5)*.65:0);
      const radius=initial?(index<1900?570+r()*600:1150+r()*1850):1450+r()*1050;
      const kind=n%650===649?3:r()<f.armor?2:r()<f.fast?1:0;
      if(this.raiders.add(this.center.x+Math.cos(angle)*radius,this.center.y+Math.sin(angle)*radius,kind,r))this.spawned++;
    }
    reinforce(){
      // Short flanking raids interrupt the long fronts. Admission stays
      // capped at 48 boats per tick even after a full broadside clears a pocket.
      if(this.time>=this.nextPincer){this.pincer=110+this.phase*32;this.nextPincer+=19;}
      const missing=Math.min(48,this.population-this.raiders.count);
      for(let n=0;n<missing;n++){
        if(this.pincer>0){const r=this.random,a=fronts[this.phase].angles[0]+Math.PI*.6+(r()-.5)*.35,d=650+r()*220,kind=this.pincer%(this.phase?11:35)===0?3:1;this.pincer--;
          if(this.raiders.add(this.center.x+Math.cos(a)*d,this.center.y+Math.sin(a)*d,kind,r))this.spawned++;
        }else this.spawn();
      }
    }
    broadside(){const fired=super.broadside();if(fired){this.salvos++;this.burstCooldown=9;}return fired;}
    hurt(s,n){super.hurt(s,n);this.damageTaken+=n;}
    kill(i,reward=true){
      const a=this.raiders,heavy=a.kind[i]===3,x=a.x[i],y=a.y[i],alive=a.hp[i]!==-999;
      super.kill(i,reward);
      if(!alive||!reward)return;
      if(heavy&&this.deathBudget<24)this.effects.add(x,y,34,0);
      if(this.kills>=this.nextCrate&&this.loot.length<16){this.nextCrate=this.kills+1400;this.loot.push({x,y,life:45});}
    }
    toggleWork(){const work=super.toggleWork();this.events.push(work?'Hold here. Protect the workboats.':'Fleet following. Work paused.');return work;}
    step(dt,input={x:0,y:0}){
      if(this.result)return;
      const phase=Math.min(fronts.length-1,Math.floor(this.time/36));
      if(phase!==this.phase){this.phase=phase;this.phaseName=fronts[phase].name;this.events.push(this.phaseName);}
      // Fire/aim are deliberately ignored, including injected controller input.
      super.step(dt,{x:input.x||0,y:input.y||0,boost:!!input.boost,reverse:!!input.reverse});
      for(let i=this.loot.length-1;i>=0;i--){const c=this.loot[i];c.life-=dt;const p=this.player;
        if(Math.hypot(c.x-p.x,c.y-p.y)<95){for(const s of this.ships)if(s.hp>0)s.hp=Math.min(s.maxHp,s.hp+s.maxHp*.16);this.repaired++;this.effects.add(p.x,p.y,32,2);this.sound('repair',p.x,p.y);this.events.push('Fleet patched');this.loot.splice(i,1);}
        else if(c.life<=0)this.loot.splice(i,1);
      }
      if(this.tick%60===0){this.recentKills=this.kills-this.lastKills;this.lastKills=this.kills;this.peakKillsPerSecond=Math.max(this.peakKillsPerSecond,this.recentKills);}
      // Bound notifications while a tab is rendering slowly or a test is stepping.
      if(this.events.length>4)this.events.splice(0,this.events.length-4);
    }
    report(){return{...super.report(),phase:this.phaseName,salvos:this.salvos,repairs:this.repaired,damageTaken:this.damageTaken,peakKillsPerSecond:this.peakKillsPerSecond,firingShips:Array.from(this.fired).filter(n=>n>0).length,weaponShots:Array.from(this.weaponShots)};}
  }
  root.WidewakeCombat={Endgame,arsenal,fronts};if(typeof module!=='undefined'&&module.exports)module.exports=root.WidewakeCombat;
})(globalThis);
