// A geometric display path for the solver's slack rope. It changes no body or joint.
(function(global){'use strict';
 const CR=global.ChainReaction=global.ChainReaction||{};
 CR.ropeCenterline=function(a,b,length,samples=49){
  const chord=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
  const points=sag=>Array.from({length:samples},(_,n)=>{const t=n/(samples-1);return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t-4*sag*t*(1-t),z:a.z+(b.z-a.z)*t};});
  const arc=p=>p.slice(1).reduce((sum,q,n)=>sum+Math.hypot(q.x-p[n].x,q.y-p[n].y,q.z-p[n].z),0);
  if(length<=chord)return points(0);
  let low=0,high=length;
  for(let n=0;n<28;n++){const middle=(low+high)/2;if(arc(points(middle))<length)low=middle;else high=middle;}
  return points((low+high)/2);
 };
})(globalThis);
