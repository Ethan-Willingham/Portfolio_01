/* Reject repeating sheltered-water lattices without hiding the wind waves. */
const assert=require('node:assert/strict'),W=require('../../js/widewake-waves.js');
const environment={swell:0,swellX:0,swellY:0,wind:1,windX:0,windY:0,travel:0,travelX:0,travelY:0};
const water=(x,y,t)=>W.sample(x,y,t,9,.77,false,{},environment).height;
// Negative control: the three crossing fronts that produced the owner's grid.
function oldFronts(x,y,t){let h=0;
  for(const [length,amplitude,angle,phase,crestLength]of [[29,.19,-2.27,5.3,79],[17,.1,-.96,1.9,47],[9.7,.045,-1.85,4.8,31]]){
    const dx=Math.cos(angle),dy=Math.sin(angle),k=2*Math.PI/length,omega=Math.sqrt(9.81*k),along=dx*x+dy*y,across=-dy*x+dx*y;
    const group=along*k*.23+across*2*Math.PI/crestLength*.71-t*omega*.17+phase*2.7,p=along*k-t*omega+phase;
    h+=amplitude*(.78+.22*Math.sin(group))*(Math.sin(p)+.16*Math.sin(p)*Math.cos(p));
  }return h;
}
function repetition(at){
  const points=Array.from({length:256},(_,n)=>[500*(n*.754877666%1)-250,500*(n*.569840291%1)-250]);let maximum=-1;
  // Search translations over several wavelengths in every direction. Irregular
  // points avoid aliasing the measurement with the wave spacing being checked.
  for(const t of [0,7.3,18]){const a=points.map(([x,y])=>at(x,y,t));
    for(let d=24;d<=100;d+=2)for(let angle=0;angle<Math.PI*2;angle+=Math.PI/48){
      let sa=0,sb=0,aa=0,bb=0,ab=0;const dx=d*Math.cos(angle),dy=d*Math.sin(angle);
      for(let n=0;n<points.length;n++){const b=at(points[n][0]+dx,points[n][1]+dy,t);sa+=a[n];sb+=b;aa+=a[n]*a[n];bb+=b*b;ab+=a[n]*b;}
      maximum=Math.max(maximum,(ab-sa*sb/256)/Math.sqrt((aa-sa*sa/256)*(bb-sb*sb/256)));
    }
  }return maximum;
}
const old=repetition(oldFronts),current=repetition(water);
assert.ok(old>.95,'the regression must detect the original repeating lattice');
assert.ok(current<.75,'wind fronts must lose coherence over several wavelengths: '+current);
let energy=0;for(let n=0;n<1024;n++){const x=500*(n*.754877666%1)-250,y=500*(n*.569840291%1)-250;energy+=water(x,y,n*.131)**2;}
const rms=Math.sqrt(energy/1024);assert.ok(rms>.075&&rms<.16,'removing the lattice must retain small physical wind waves: '+rms);
console.log('PASS irregular wind fronts, sensitive lattice regression and retained wave energy',{old,current,rms});
