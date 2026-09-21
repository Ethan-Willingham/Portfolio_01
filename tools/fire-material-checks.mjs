// Uses frozen polygons to isolate exchange from the moving-boundary approximation.
export async function checkFireMaterials(device) {
  const results=[];
  const check=(label,pass,detail)=>results.push({label,pass:!!pass,detail});
  const make=(material='coal',moisture=0)=>({id:1,x:160,y:165,r:32,baseR:34,angle:0,life:100,
    volatile:material==='wood'?.76:.28,carbon:material==='wood'?.24:.72,moisture,heat:0,core:0,material,
    vertices:[[132,137],[188,137],[188,193],[132,193]]});
  const sim=FireWGPU.create({device,width:96});await sim.readyPromise;
  async function advance(body,frames,{damper=0,air=0}={}) {
    for(let f=0;f<frames;f+=4){sim.step(Math.min(4,frames-f)/60,[body],{damper,air});await device.queue.onSubmittedWorkDone();await new Promise(r=>setTimeout(r,0));}
    return sim.snapshot();
  }
  function totals(s) {
    let gas=0,water=0,E=0;
    for(let i=0;i<s.width*s.height;i++){if(s.mask[i*2]!==-1)continue;let o=i*8;gas+=(s.fields[o]+s.fields[o+1]+s.fields[o+2]+s.fields[o+3]+s.fields[o+5])*s.volume;water+=s.fields[o+5]*s.volume;E+=s.fields[o+4]*s.volume;}
    return {mass:gas+.018*(s.bodies[0]+s.bodies[1]+s.bodies[2]),water:water+.018*s.bodies[2],gasEnergy:E};
  }
  let body=make();await advance(body,1);let a=totals(await sim.snapshot());
  sim.ignite(body);let s=await advance(body,60),b=totals(s);
  check('sealed solid and gas exchange conserves total mass',Math.abs(a.mass-b.mass)<1e-6,{before:a.mass,after:b.mass});
  a=totals(s);sim.quench(body,.001);s=await advance(body,4);b=totals(s);
  check('quench water is applied once across a four-step batch',Math.abs(b.water-a.water-.001)<1e-7,{waterAdded:b.water-a.water});
  check('quenching absorbs heat and retains bounded temperatures',s.bodies[3]>=300&&s.bodies[3]<1300,{surfaceKelvin:s.bodies[3]});
  async function burning({damper=1,air=0,material='coal',moisture=0,frames=600}={}){
    sim.reset();let body=make(material,moisture);sim.ignite(body);let s=await advance(body,frames,{damper,air});
    return {fuel:s.bodies[0]+s.bodies[1],volatile:s.bodies[0],water:s.bodies[2],skin:s.bodies[3],core:s.bodies[4],oxygen:s.bodies[8],gasBurn:sim.gasBurnKgPerSecond};
  }
  const open=await burning(),closed=await burning({damper:0}),bellows=await burning({air:1});
  check('shutting the draft reduces fuel consumption',closed.fuel>open.fuel,{open,closed});
  check('bellows change oxygen supply and increase combustion',bellows.fuel<open.fuel,{open,bellows});
  const wet=await burning({moisture:.09}),wood=await burning({material:'wood'});
  // A wet body spends energy drying while a dry body can release volatiles immediately.
  check('wet material spends energy drying and burns more slowly',wet.water>=0&&wet.fuel>open.fuel+.005,{dry:open,wet});
  check('wood releases more volatile fuel than coal',.76-wood.volatile>.28-open.volatile,{coalVolatiles:.28-open.volatile,woodVolatiles:.76-wood.volatile});
  sim.reset();body=make();sim.ignite(body);const batched=await advance(body,4);
  sim.reset();body=make();sim.ignite(body);for(let i=0;i<4;i++)sim.step(1/60,[body],{damper:0});const separate=await sim.snapshot();
  let diff=0;for(let i=0;i<batched.fields.length;i++)diff=Math.max(diff,Math.abs(batched.fields[i]-separate.fields[i]));
  check('fixed steps and ignition are independent of frame batching',diff<1e-5,{maxFieldDifference:diff});
  sim.reset();body=make();body.volatile=0;body.carbon=.001;body.heat=body.core=.7;
  s=await advance(body,240,{damper:1});
  check('final carbon becomes hot ash with finite cooling',body.ash&&body.fuel===0&&body.surfaceKelvin>=300,{fuel:body.fuel,stage:body.stage,surfaceKelvin:body.surfaceKelvin});
  sim.reset();body=make();sim.ignite(body);sim.step(1/60,[body],{damper:1});sim.step(1/60,[],{damper:1});
  await device.queue.onSubmittedWorkDone();await new Promise(r=>setTimeout(r,0));
  check('stale GPU readback cannot update removed fuel',body.surfaceKelvin===undefined);
  sim.dispose();return results;
}
