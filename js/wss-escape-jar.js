/* A visible objective observes the ordinary elastic body and real lid. */
(function(root){
  'use strict';
  function rect(x,y,width,height){return{x:x,y:y,width:width,height:height};}
  function make(w,o){
    o=o||{};var jar=rect(192,112,336,264);
    return{name:'escape-the-jar',title:'Escape the jar',draft:true,seed:o.seed||17,
      objective:{kind:'escape'},setup:o.closed?'closed':'open',
      setups:[{id:'open',label:'Open jar',options:{}},{id:'closed',label:'Closed lid',options:{closed:true}}],
      caption:'Grab the slime and lift it through the mouth. Get its whole skin out of the jar.',
      action:o.closed?'Open lid':'Close lid',primary:{kind:'escape-lid',target:rect(472,64,96,28)},
      viewBounds:rect(152,16,432,368),vessels:[{id:'jar',label:'Jar',rect:jar,sealed:false}],
      vents:[rect(192,104,336,16)],parts:[{id:'lid',type:'valve',rect:rect(192,104,336,16),open:!o.closed}],
      slimes:[{x:360,y:288,radius:32}],solids:[],pipes:[],initial:[],marks:[],meters:[],settings:{enabled:false},
      measure:{source:jar,receiver:jar},
      boundaryNote:'The ordinary elastic slime collides with the jar and its real removable lid. Grab supplies hand work. The objective reads the current rendered skin and succeeds only after every point has left the jar through its mouth. It applies no force, changes no position and gives no scripted escape.',
      energyBudgetStatus:'Elastic motion, gravity, wall contact and external hand work use the existing slime solver. This challenge has no water source, pressure mechanism or closed energy claim.'};
  }
  var previous=root.WSSDraftRuntime;
  function create(c){
    var d=c.definition;if(!d.objective||d.objective.kind!=='escape')return previous&&previous.create?previous.create(c):null;
    var b=c.bodies[0],jar=d.vessels[0].rect,time=0,escaped=false,escapedAt=null,clearTime=0,reading=null;
    b.machineFluidSkin=true;
    function lid(){return c.builder.getParts().find(function(p){return p.id===d.parts[0].buildId;});}
    function tick(dt){
      time+=dt;var ring=c.skinRing(b),bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity},bad=0;
      ring.forEach(function(p){if(!Number.isFinite(p.x)||!Number.isFinite(p.y))bad++;bounds.left=Math.min(bounds.left,p.x);bounds.right=Math.max(bounds.right,p.x);bounds.top=Math.min(bounds.top,p.y);bounds.bottom=Math.max(bounds.bottom,p.y);});
      var outside=ring.length>2&&bounds.bottom<jar.y-3;
      clearTime=outside?clearTime+dt:0;
      if(!escaped&&clearTime>.15){escaped=true;escapedAt=time;}
      var open=!!(lid()&&lid().open);d.action=open?'Close lid':'Open lid';
      d.readingLabel=escaped?'Escaped. Restart for another try.':open?'Lift the whole slime above the rim.':'The lid is closed. Open it to escape.';
      reading={seconds:time,escaped:escaped,escapedAt:escapedAt,lidOpen:open,clearSeconds:clearTime,skin:bounds,finite:bad===0,error:bad?'The slime skin is not finite.':null};
      d.objectiveReading=reading;
    }
    tick(0);
    return{smoke:false,clock:function(){return time;},tick:tick,stats:function(){return reading;},
      primary:function(){var part=lid();if(part)c.setManualValve(part.id,!part.open);return true;},
      draw:function(ctx){ctx.save();ctx.textAlign='center';ctx.font='12px Commit Mono, monospace';ctx.globalAlpha=.85;ctx.fillText(escaped?'Escaped':lid()&&!lid().open?'Open the lid':'Lift through here',360,76);ctx.restore();},
      destroy:function(){delete b.machineFluidSkin;}
    };
  }
  root.WSSEscapeJar={make:make};root.WSSDraftRuntime={create:create};
  root.WSSMachines=root.WSSMachines||{};root.WSSMachines['escape-the-jar']={make:make};
})(typeof window!=='undefined'?window:globalThis);
