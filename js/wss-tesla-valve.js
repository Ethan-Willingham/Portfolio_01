/* Stored head drives real water through a passive empirical loop resistance. */
(function(root){
  'use strict';
  function rect(x,y,width,height){return{x:x,y:y,width:width,height:height};}
  function make(w,o){
    o=o||{};var reverse=!!o.reverse,left=rect(48,104,176,280),right=rect(496,104,176,280);
    var route=[{x:208,y:320},{x:512,y:320}],pipes=[{points:route,bore:24}];
    [224,400].forEach(function(x){pipes.push({points:[{x:x,y:320},{x:x+24,y:264},{x:x+80,y:264},{x:x+80,y:320}],bore:24});});
    var initial=pipes.map(function(p){return{kind:'pipe',points:p.points,bore:p.bore,tile:8};});
    initial.push({kind:'rect',rect:rect(56,reverse?344:176,160,reverse?32:200)},{kind:'rect',rect:rect(504,reverse?176:344,160,reverse?200:32)});
    return{name:'tesla-valve',title:'Tesla valve',seed:o.seed||17,draft:true,
      teslaValve:true,tesla:{reverse:false,symmetric:!!o.symmetric},
      setup:(reverse?'reverse':'forward')+(o.symmetric?'-symmetric':''),
      setups:[{id:'forward',label:'Forward head',options:{}},{id:'reverse',label:'Reverse head',options:{reverse:true}},{id:'forward-symmetric',label:'Forward, symmetric resistance',options:{symmetric:true}},{id:'reverse-symmetric',label:'Reverse, symmetric resistance',options:{reverse:true,symmetric:true}}],
      caption:'Water runs through the same fixed loops in either direction. Try reverse head and compare how much reaches the other tank.',
      action:reverse?'Try forward head':'Try reverse head',primary:{kind:'tesla-direction',target:rect(284,112,152,32)},
      viewBounds:rect(32,72,656,320),vessels:[{id:'left',label:reverse?'Receiver':'Stored head',rect:left,sealed:false},{id:'right',label:reverse?'Stored head':'Receiver',rect:right,sealed:false}],pipes:pipes,
      initial:initial,slimes:[],parts:[],vents:[],solids:[rect(224,336,272,8)],marks:[],meters:[],settings:{enabled:false},boundaries:{pool:false,tap:null,drain:null,caps:[]},
      measure:{source:reverse?right:left,receiver:reverse?left:right},
      source:{title:'Nguyen et al., Tesla valve flow (2021)',url:'https://arxiv.org/abs/2103.17222'},
      boundaryNote:'Gravity acting on the finite high reservoir drives native MLS-MPM water through two fixed loops. The coarse grid does not resolve their turbulent mixing. A passive empirical resistance removes momentum from current channel flow, returning its impulse to the fixed walls. Its reverse loss grows with Reynolds number, guided by Nguyen et al. The symmetric comparison gives both directions the same loss. Switching head starts a fresh water inventory with the high and low levels swapped; it does not move parcels in a running simulation.',
      energyBudgetStatus:'This is a reduced empirical Tesla-valve model, not a calibrated geometry-only prediction. It dissipates kinetic energy and never adds work, imposes a flow, closes a valve or transfers water between tanks. Actual tank inventories and the removed fluid work are measured.',
      teslaDirection:reverse};
  }
  var previous=root.WSSDraftRuntime;
  async function create(c){
    var d=c.definition;if(!d.teslaValve)return previous&&previous.create?previous.create(c):null;
    var loss=await root.WSSTeslaLoss.create(c),start=c.liquid.simulationClock,initial=null;
    function reading(){var L=c.liquid,a=L.liquid.arrays,n=L.liquid.getCount(),r=d.measure.receiver,count=0,bad=0;
      for(var i=0;i<n;i++){if(a.x[i]>r.x+8&&a.x[i]<r.x+r.width-8&&a.y[i]>r.y&&a.y[i]<r.y+r.height-8)count++;if(!Number.isFinite(a.x[i])||!Number.isFinite(a.y[i])||!Number.isFinite(a.vx[i])||!Number.isFinite(a.vy[i]))bad++;}
      if(initial===null)initial=count;var sample=loss.stats();d.readingLabel='Received '+Math.max(0,count-initial)+' water parcels';
      d.teslaReading={seconds:L.simulationClock-start,reverse:d.teslaDirection,receiver:count,initialReceiver:initial,transferred:count-initial,count:n,bad:bad,loss:sample,error:sample.error};return d.teslaReading;
    }
    reading();return{smoke:false,tick:reading,stats:reading,destroy:loss.destroy};
  }
  root.WSSTeslaValve={make:make};root.WSSDraftRuntime={create:create};root.WSSMachines=root.WSSMachines||{};root.WSSMachines['tesla-valve']={make:make};
})(typeof window!=='undefined'?window:globalThis);
