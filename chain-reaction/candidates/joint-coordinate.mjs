export function jointCoordinate(sim,joint) {
 const a=sim.bodies.get(joint.a),b=sim.bodies.get(joint.b),pa=a.translation(),pb=b.translation(),aa=a.rotation(),ab=b.rotation();
 const rotate=(v,t)=>({x:v.x*Math.cos(t)-v.y*Math.sin(t),y:v.x*Math.sin(t)+v.y*Math.cos(t)}),ra=rotate(joint.anchorA,aa),rb=rotate(joint.anchorB,ab),axis=rotate(joint.axis,aa),length=Math.hypot(axis.x,axis.y);
 return ((pb.x+rb.x-pa.x-ra.x)*axis.x+(pb.y+rb.y-pa.y-ra.y)*axis.y)/length;
}
