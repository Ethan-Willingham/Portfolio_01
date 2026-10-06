/* Read-only semantic transfer observer. No callback changes the simulation. */
(function(global){
  'use strict';
  const CR=global.ChainReaction=global.ChainReaction||{};
  CR.events={VERSION:'0.1.0',watch(sim,definition){
    const starts=new Map(definition.parts.map(p=>[p.id,p]));
    const events=definition.steps.map(s=>({...s,contactTick:null,motionTick:null,impulse:0}));
    const failures=[];
    for(const s of events){
      if(!starts.has(s.from)||!starts.has(s.to))throw Error('Unknown transfer part');
      if(!['contact','unblock','rollout'].includes(s.kind)||!['x','y','angle'].includes(s.motion?.axis)||![1,-1].includes(s.motion.sign)||!(s.motion.travel>0))throw Error('Invalid transfer declaration');
    }
    function sample(){
      for(let index=0;index<events.length;index++){
        const s=events[index],body=sim.bodies.get(s.to),start=starts.get(s.to),pose=body.translation();
        const value=s.motion.axis==='angle'?body.rotation():pose[s.motion.axis];
        const moved=(value-(start[s.motion.axis]||0))*s.motion.sign>s.motion.travel;
        const impulse=sim.contactImpulse(s.from,s.to);
        if(s.contactTick===null&&impulse>=(s.minimumImpulse||.000001)){s.contactTick=sim.tick;s.impulse=impulse;}
        if(!moved||s.motionTick!==null)continue;
        s.motionTick=sim.tick;
        if(index){
          const prior=events[index-1];
          // Contact is the transfer time. The separate travel threshold confirms
          // that the recipient moves, and may finish after the next recipient's.
          const priorTick=prior.kind==='contact'?prior.contactTick:prior.motionTick;
          const transferTick=s.kind==='contact'?s.contactTick:s.motionTick;
          if(priorTick===null||transferTick===null||transferTick<priorTick)failures.push({type:'out-of-order',step:s.id,tick:sim.tick});
        }
        if(s.kind==='contact'&&s.contactTick===null)failures.push({type:'motion-before-contact',step:s.id,tick:sim.tick});
        if(s.kind==='unblock'){
          const a=sim.bodies.get(s.from);let touching=false;
          for(let i=0;i<a.numColliders();i++)for(let j=0;j<body.numColliders();j++)if(a.collider(i).contactCollider(body.collider(j),0))touching=true;
          if(touching)failures.push({type:'blocked-release',step:s.id,tick:sim.tick});
        }
        if(s.kind==='rollout'){
          const gate=sim.bodies.get(s.from),part=starts.get(s.from),marble=starts.get(s.to);
          if(gate.translation().y+part.height/2>pose.y-marble.radius)failures.push({type:'release-before-clearance',step:s.id,tick:sim.tick});
        }
      }
    }
    return {sample,report(required=true){const all=[...failures];if(required)for(const s of events)if(s.motionTick===null)all.push({type:'missing-transfer',step:s.id});return {pass:all.length===0,failures:all,events:events.map(s=>({...s}))};}};
  }};
})(globalThis);
