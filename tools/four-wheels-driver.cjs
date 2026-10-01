// Verification pilot. Uses player forces only, without changing the cart pose.
function drive(w) {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>((a+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
  const b=w.body,current=w.level.gates[w.gate],room=current?.room??5;
  w._pilot ||= {departing:{}};
  let target=current;
  if(w.roomIndex<room||!current) {
    const p=current?w.level.portals[w.roomIndex]:w.exit,key=current?w.roomIndex:5;
    const approach={x:p.x-p.nx*58,y:p.y-p.ny*58};
    if(Math.hypot(b.x-approach.x,b.y-approach.y)<9)w._pilot.departing[key]=true;
    target=w._pilot.departing[key]?{x:p.x+p.nx*110,y:p.y+p.ny*110}:approach;
  }
  const dx=target.x-b.x,dy=target.y-b.y,d=Math.hypot(dx,dy),speed=Math.min(60,d*1.4);
  const vx=d>1?dx/d*speed:0,vy=d>1?dy/d*speed:0,ax=(vx-b.vx)*2.3,ay=(vy-b.vy)*2.3;
  let error=wrap(Math.atan2(ay,ax)-b.a),sign=1;
  if(Math.abs(error)>Math.PI/2){error=wrap(error+Math.PI);sign=-1;}
  return {turn:clamp(error*4.5-b.omega*1.3,-1,1),push:Math.abs(error)<.7?clamp(Math.hypot(ax,ay)/(sign===1?78:50),0,1)*sign:0,brake:Math.abs(error)>.6&&Math.hypot(b.vx,b.vy)>40?1:0};
}
module.exports=drive;
