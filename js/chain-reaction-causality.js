/* Read-only contact provenance for armed contact chains. It never drives a body. */
(function(global){
  'use strict';
  const CR=global.ChainReaction=global.ChainReaction||{};
  CR.causality={watch(sim,definition){
    const c=definition.causality;
    if(!c||!Array.isArray(c.targets)||!c.targets.length)throw Error('Missing contact-chain contract');
    const initial=new Map(definition.parts.map(p=>[p.id,p]));
    for(const id of [c.source,...c.targets])if(!initial.has(id))throw Error('Missing causal body: '+id);
    for(const key of ['maxRestAngle','maxRestTravel','fallenAngle','minimumImpulse'])if(!(c[key]>0))throw Error('Invalid causal tolerance: '+key);
    const events=c.targets.map((id,i)=>({id,source:i?c.targets[i-1]:c.source,contactTick:null,motionTick:null,fallenTick:null,impulse:0})),failures=[];
    function sample(){
      const state=new Map(sim.state().map(p=>[p.id,p]));
      for(const e of events){
        const p=state.get(e.id),start=initial.get(e.id),impulse=sim.contactImpulse(e.source,e.id);
        if(e.contactTick===null&&impulse>=c.minimumImpulse){e.contactTick=sim.tick;e.impulse=impulse;}
        const moved=Math.abs(p.angle-(start.angle||0))>c.maxRestAngle||Math.hypot(p.x-start.x,p.y-start.y)>c.maxRestTravel;
        if(e.motionTick===null&&moved){e.motionTick=sim.tick;if(e.contactTick===null)failures.push({type:'motion-before-contact',id:e.id,source:e.source,tick:sim.tick});}
        if(e.fallenTick===null&&Math.abs(p.angle)>=c.fallenAngle)e.fallenTick=sim.tick;
        if(sim.tick===0&&(Math.abs(p.angle)>c.maxRestAngle||Math.hypot(p.vx,p.vy)>c.maxRestTravel||Math.abs(p.spin)>c.maxRestAngle))failures.push({type:'not-armed-at-rest',id:e.id,tick:0});
      }
    }
    sample();
    return {sample,report(required=c.required){
      const result=[...failures];
      if(required)for(const e of events){if(e.contactTick===null)result.push({type:'missing-contact',id:e.id});if(e.fallenTick===null)result.push({type:'did-not-fall',id:e.id});}
      return {events:events.map(e=>({...e})),failures:result,pass:result.length===0};
    }};
  }};
})(globalThis);
