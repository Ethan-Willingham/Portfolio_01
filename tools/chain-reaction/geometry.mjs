// Read-only geometry preflight, before a physics tick can hide a bad armed layout.
export function initialGeometry(definition,sim,tolerance=.002){
 const failures=[];let checked=0;
 for(let i=0;i<definition.parts.length;i++)for(let j=i+1;j<definition.parts.length;j++){
  const a=definition.parts[i],b=definition.parts[j];
  if(a.fixed&&b.fixed)continue;
  if((definition.joints||[]).some(q=>q.a===a.id&&q.b===b.id||q.a===b.id&&q.b===a.id))continue;
  const A=sim.bodies.get(a.id),B=sim.bodies.get(b.id);
  for(let m=0;m<A.numColliders();m++)for(let n=0;n<B.numColliders();n++){
   const ca=a.colliders?.[m]||a,cb=b.colliders?.[n]||b;
   if(!((ca.layer??a.layer??65535)&(cb.layer??b.layer??65535)))continue;
   checked++;const contact=A.collider(m).contactCollider(B.collider(n),0);
   if(contact&&contact.distance < -tolerance)failures.push({a:a.id,b:b.id,colliderA:m,colliderB:n,penetration:-contact.distance});
  }
 }
 return {pass:failures.length===0,checked,tolerance,failures};
}

// A collision mask may separate only disjoint visible depth intervals.
export function depthLayers(definition){
 const failures=[];
 const cells=definition.parts.flatMap(p=>(p.colliders||[{...p,z:0}]).map(c=>({id:p.id,layer:c.layer??p.layer,z:(p.z||0)+(c.z||0),depth:c.depth??p.depth??(c.shape==='ball'?c.radius*2:undefined)})));
 for(const c of cells)if(!Number.isInteger(c.layer)||c.layer<1||c.layer>65535||!Number.isFinite(c.z)||!(c.depth>0))failures.push({type:'invalid-depth',id:c.id});
 for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){
  const a=cells[i],b=cells[j];if(a.id===b.id||(a.layer&b.layer))continue;
  if(Math.abs(a.z-b.z)<(a.depth+b.depth)/2)failures.push({type:'excluded-overlapping-depth',a:a.id,b:b.id});
 }
 return {pass:failures.length===0,failures,cells:cells.length};
}
