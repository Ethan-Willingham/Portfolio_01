// This function runs in the browser against the actual WGSL kernels.
export async function checkFireKernels(device) {
  const results = [];
  function check(label, pass, detail) { results.push({ label, pass: !!pass, detail }); }
  function close(a,b,tol=3e-5) { return Math.abs(a-b) <= tol*Math.max(1,Math.abs(a),Math.abs(b)); }
  const sim = FireWGPU.create({ device, width: 48, testing: true });
  await sim.readyPromise;
  if (!sim.available) throw new Error(sim.errors.join('\n'));
  const n=sim.width*sim.height, mask=new Int32Array(n*2).fill(-1), fields=new Float32Array(n*8);
  const fill = a => { for(let i=0;i<n;i++) fields.set(a,i*8); };
  const total = (a,k) => { let t=0;for(let i=k;i<a.length;i+=8)t+=a[i];return t; };
  const mass = a => [0,1,2,3,5].reduce((sum,k)=>sum+total(a,k),0);
  fill([.08,0,1.1,0,1062,0,0,0]);
  let s=await sim.testKernel('react',{fields,mask});
  check('hot fuel cannot react without oxygen',close(total(s.fields,0),total(fields,0),1e-7)&&total(s.fields,6)===0);
  fill([.04,.25,.89,0,0,0,0,0]);
  s=await sim.testKernel('react',{fields,mask});
  check('cold mixed gas does not ignite itself',close(total(s.fields,0),total(fields,0),1e-7)&&total(s.fields,4)===0);
  fill([.04,.25,.89,0,1062,0,0,0]);
  s=await sim.testKernel('react',{fields,mask});
  const burn=.04*(1-Math.exp(-100/60)), soot=burn*.015;
  const t=(1200-780)/(1400-780), activation=t*t*(3-2*t), oxidized=soot*(1-Math.exp(-5/60*activation));
  const expectedEnergy=(1062+burn*26000-soot*32000+oxidized*32000)*Math.exp(-.55/60);
  check('reaction conserves reactant and product mass',close(mass(s.fields),mass(fields),1e-6),{before:mass(fields),after:mass(s.fields)});
  check('reaction follows the oxygen budget and CPU reference energy',close(s.fields[1],.25-burn*3.4-oxidized*2.667)&&close(s.fields[4],expectedEnergy),{expectedEnergy,actualEnergy:s.fields[4]});
  const velocity=new Float32Array(n*4);
  for(let i=0;i<n;i++) {
    fields.set([.02+.01*Math.sin(i*.23),.2,.9,.002,200+i%71,.04,0,0],i*8);
    velocity[i*4]=.025*Math.sin(i*.11);velocity[i*4+1]=.025*Math.cos(i*.17);
  }
  const initial=fields.slice();
  for(let k=0;k<40;k++){s=await sim.testKernel('transport',{fields:k===0?fields:undefined,velocities:k===0?velocity:undefined,mask,damper:0});}
  const errors=[0,1,2,3,4,5].map(k=>Math.abs(total(s.fields,k)/total(initial,k)-1));
  check('sealed transport conserves every species and enthalpy',Math.max(...errors)<2e-6,errors);
  check('transport remains finite and positive',s.fields.every(x=>Number.isFinite(x)&&x>=0));
  // An impermeable wall divides two reservoirs, with no diffusion or flow across it.
  fill([0,.275,.905,0,0,0,0,0]);
  const barrier=mask.slice(), middle=Math.floor(sim.width/2);
  for(let y=0;y<sim.height;y++)for(let x=0;x<sim.width;x++){
    let i=y*sim.width+x;if(x<middle)fields[i*8]=.1;if(x===middle)barrier[i*2]=-2;
  }
  for(let k=0;k<20;k++)s=await sim.testKernel('transport',{fields:k===0?fields:undefined,velocities:velocity,mask:barrier,damper:0});
  let leak=0;for(let y=0;y<sim.height;y++)for(let x=middle+1;x<sim.width;x++)leak+=s.fields[(y*sim.width+x)*8];
  check('sealed solid faces block fuel transport',leak===0,leak);
  fill([0,.275,.905,0,0,0,0,0]);velocity.fill(0);
  for(let y=1;y<sim.height-2;y++)for(let x=1;x<sim.width-2;x++){
    let i=y*sim.width+x;velocity[i*4]=.012*Math.sin(x*.83+y*.67);velocity[i*4+1]=.012*Math.cos(x*.73-y*.89);
  }
  function divergence(v){
    let sum=0;for(let y=0;y<sim.height;y++)for(let x=0;x<sim.width;x++){
      let i=y*sim.width+x,dx=(x===sim.width-1?0:v[i*4])-(x===0?0:v[(i-1)*4]);
      let dy=(y===sim.height-1?0:v[i*4+1])-(y===0?0:v[(i-sim.width)*4+1]);sum+=(dx+dy)**2;
    }return Math.sqrt(sum/n)/(0.8/sim.width);
  }
  s=await sim.testKernel('projection',{fields,velocities:velocity,mask,damper:0});
  const before=divergence(velocity),after=divergence(s.velocities);
  check('pressure projection reduces velocity divergence',after<before*.2,{before,after});
  sim.reset();sim.step(1/60,[],{damper:0});
  fill([.02,.275,.905,.001,250,.03,0,0]);
  s=await sim.testKernel('transport',{fields,damper:0});
  function gasTotals(s){let totals=[0,0];for(let i=0;i<n;i++){if(s.mask[i*2]!==-1)continue;let o=i*8;totals[0]+=s.fields[o]+s.fields[o+1]+s.fields[o+2]+s.fields[o+3]+s.fields[o+5];totals[1]+=s.fields[o+4];}return totals;}
  const initialGas=gasTotals(s),body={id:1,x:160,y:165,r:32,baseR:34,angle:0,life:100,volatile:.28,carbon:.72,vertices:[[132,137],[188,137],[188,193],[132,193]]};
  s=await sim.testKernel('geometry',{chunks:[body]});
  body.x+=50;for(let v of body.vertices)v[0]+=50;
  s=await sim.testKernel('geometry',{chunks:[body]});
  body.held=true;s=await sim.testKernel('geometry',{chunks:[body]});
  const movedGas=gasTotals(s);
  check('inserting, moving and lifting coal conserves gas mass and enthalpy',close(initialGas[0],movedGas[0],1e-6)&&close(initialGas[1],movedGas[1],1e-6),{before:initialGas,after:movedGas});
  sim.dispose();
  return results;
}
