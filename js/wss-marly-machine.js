/* One river-driven wheel and a displacement pump, shown as a mechanical cutaway. */
(function(root){
  'use strict';
  function rect(x,y,width,height){return {x:x,y:y,width:width,height:height};}
  function make(w,o){
    o=o||{};
    return {name:'marly-machine',title:'Machine de Marly',draft:true,marly:{gate:o.gate===undefined?.7:o.gate},
      setup:o.gate===0?'closed':'running',setups:[{id:'running',label:'River flowing',options:{}},{id:'closed',label:'Still river',options:{gate:0}}],
      setupNote:'Each comparison starts with an empty upper tank. Close the river in the main view to keep the water already lifted.',
      caption:'The river turns a waterwheel. Its crank drives a piston, and two one-way valves lift water into the upper tank.',
      primary:{kind:'marly-controls'},action:'Close river',viewBounds:rect(0,0,720,400),
      vessels:[],pipes:[],solids:[],vents:[],parts:[],slimes:[],initial:[],marks:[],meters:[],settings:{enabled:false},
      measure:{source:rect(0,0,720,400),receiver:rect(0,0,720,400)},
      boundaryNote:'This cutaway uses a reduced mechanical and hydraulic model. River drag supplies torque to an inertial wheel. Crank displacement changes the pump chamber volume; ideal one-way valves admit river water and deliver it uphill. The lifting load resists the wheel. Tank level and pipe-flow markers use the calculated water volumes. Water is represented by chamber and tank volumes, not by the playground particle solver.',
      energyBudgetStatus:'One wheel and one ideal pump illustrate the mechanism, not the historical dimensions or output. The river is an open water and energy supply. A full tank spills to the gardens. Pipe friction, valve dynamics, leakage and water hammer are omitted.'};
  }
  var previous=root.WSSDraftRuntime;
  function create(context){
    var d=context.definition;
    if(!d.marly)return previous&&previous.create?previous.create(context):null;
    var model=root.WSSMarlyModel.create(d.marly),host=document.getElementById('toy-viewport'),shell=document.getElementById('toy');
    var element=document.createElement('section');element.className='marly-demo';element.setAttribute('aria-label','Machine de Marly working model');
    element.innerHTML=`
      <header class="marly-heading"><div><p class="marly-kicker">Machine de Marly / working cutaway</p><h2>A river lifting water uphill.</h2><p class="marly-intro">Follow the wheel, the piston, then the water. Close the river to see what keeps moving.</p></div><button type="button" id="marly-explain" aria-expanded="false" aria-controls="marly-notes">How it works</button></header>
      <div class="marly-drawing"><canvas id="marly-canvas" role="img" aria-label="A river drives a paddle wheel connected by a crank to a piston pump. An intake valve admits river water, and an outlet valve sends it uphill into a reservoir."></canvas></div>
      <div class="marly-dashboard"><div id="marly-readout" class="marly-readout"><div><span>Wheel</span><output id="marly-rpm">0 rpm</output></div><div><span>Water lifted</span><output id="marly-volume">0.0 gal</output></div><div><span>Upper tank</span><output id="marly-tank">0%</output></div><p id="marly-phase" role="status">Starting the wheel</p></div>
      <div class="marly-controls"><label for="marly-gate"><span>River flow <output id="marly-gate-value">70%</output></span><input id="marly-gate" type="range" min="0" max="100" step="1" value="70"></label><button type="button" id="marly-river">Close river</button><button type="button" id="marly-brake" aria-pressed="false">Apply brake</button><button type="button" id="marly-units" aria-label="Switch to metric units">US units</button></div></div>
      <aside id="marly-notes" class="marly-notes" hidden><button type="button" id="marly-notes-close" aria-label="Close explanation">Close</button><h3>From river to reservoir</h3><ol><li>The current pushes the paddles and turns the wheel.</li><li>The crank pulls the piston back. The inlet valve opens and the chamber fills.</li><li>The piston pushes forward. The inlet closes and the outlet opens, sending water uphill.</li></ol><p>The one-way valves keep the raised water from draining back when the wheel stops.</p><p>The original Machine de Marly used 14 waterwheels and three pumping stages. This is one wheel and one pump, with a simplified calculation of torque, lifting work and water volume.</p><a href="https://musee-domaine-marly.fr/collections/vue-et-description-de-la-fameuse-machine-de-marly/" target="_blank" rel="noopener">The original machine, Musée de Marly</a></aside>`;
    host.appendChild(element);shell.classList.add('has-marly-demo');
    var canvas=element.querySelector('canvas'),ctx=canvas.getContext('2d'),metric=false,lastGate=.7,revision=0,retired=false;
    var $=function(id){return element.querySelector('#'+id);};
    var style=getComputedStyle(document.documentElement),palette={};
    ['bg','bg-raised','text','text-dim','accent','rule','rule-strong'].forEach(function(k){palette[k]=style.getPropertyValue('--'+k).trim();});
    palette.water='#8fb3c7';palette.green='#9ec79a';palette.wood='#bc9d65';palette.clay='#cf9f78';
    function write(id,value){var node=$(id);if(node.textContent!==value)node.textContent=value;}
    function state(){var s=model.stats();d.marlyReading=s;d.readingLabel=s.brake?'Brake applied':s.omega<.02?s.gate?'Wheel starting':'River closed':s.gate?'Pumping uphill':'Wheel coasting';return s;}
    function sync(){
      var s=state(),paused=root.__toy&&root.__toy.stats().paused;
      write('marly-rpm',s.rpm.toFixed(1)+' rpm');
      write('marly-volume',(s.deliveredLiters/(metric?1:3.785411784)).toFixed(1)+(metric?' L':' gal'));
      write('marly-tank',Math.round(100*s.tankLiters/s.tankCapacityLiters)+'% full');
      write('marly-gate-value',Math.round(s.gate*100)+'%');$('marly-gate').value=Math.round(s.gate*100);
      write('marly-river',s.gate>0?'Close river':'Open river');
      write('marly-brake',s.brake?'Release brake':'Apply brake');$('marly-brake').setAttribute('aria-pressed',String(s.brake));
      var note=paused?'Paused. Water and machinery are held.':s.brake?'Brake on. Release it to pump again.':s.omega<.02&&!s.gate?'River closed. The valves hold the raised water.':s.omega<.02?'River pushing the wheel.':!s.gate?'River closed. The wheel is coasting.':s.tankLiters>=s.tankCapacityLiters-.01?'Tank full. The overflow feeds the gardens.':s.phase==='intake'?'Intake stroke: drawing water from the river.':'Delivery stroke: pushing water uphill.';
      write('marly-phase',note);revision++;paint(s);
    }
    $('marly-gate').addEventListener('input',function(e){model.setGate(+e.target.value/100);if(+e.target.value)lastGate=+e.target.value/100;sync();});
    $('marly-river').addEventListener('click',function(){var gate=model.stats().gate;if(gate)lastGate=gate;model.setGate(gate?0:lastGate||.7);sync();});
    $('marly-brake').addEventListener('click',function(){model.setBrake(!model.stats().brake);sync();});
    $('marly-units').addEventListener('click',function(){metric=!metric;write('marly-units',metric?'Metric':'US units');$('marly-units').setAttribute('aria-label',metric?'Switch to US units':'Switch to metric units');sync();});
    function notes(open){$('marly-notes').hidden=!open;$('marly-explain').setAttribute('aria-expanded',String(open));if(open)$('marly-notes-close').focus();else $('marly-explain').focus();}
    $('marly-explain').addEventListener('click',function(){notes($('marly-notes').hidden);});$('marly-notes-close').addEventListener('click',function(){notes(false);});
    element.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('marly-notes').hidden){e.stopPropagation();notes(false);}});
    function line(points,color,width){ctx.beginPath();points.forEach(function(p,i){if(i)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
    function circle(x,y,r,fill,stroke,width){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width||1;ctx.stroke();}}
    function label(text,x,y,size,color,align){ctx.fillStyle=color||palette['text-dim'];ctx.font=(size||14)+'px "Segoe UI", sans-serif';ctx.textAlign=align||'left';ctx.fillText(text,x,y);}
    function flowPath(points,volume,active){
      line(points,palette['rule-strong'],18);line(points,palette['bg-raised'],12);line(points,palette.water,6);
      if(!active)return;
      var total=0,lens=[];for(var i=1;i<points.length;i++){var len=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);lens.push(len);total+=len;}
      for(var at=(volume*12)%38;at<total;at+=38){var t=at,k=0;while(t>lens[k]&&k<lens.length-1){t-=lens[k];k++;}var a=points[k],b=points[k+1],u=t/lens[k];circle(a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,2.3,palette.text);}
    }
    function valve(x,y,open){circle(x,y,11,palette['bg-raised'],open?palette.green:palette['rule-strong'],2);line([[x-6,y+4],[x+(open?8:6),y+(open?-5:4)]],open?palette.green:palette.clay,3);}
    function paintPortrait(s,width,height){
      var scale=Math.min(width/360,height/360),ox=(width-360*scale)/2,oy=(height-360*scale)/2;
      ctx.translate(ox,oy);ctx.scale(scale,scale);ctx.lineCap='round';ctx.lineJoin='round';
      var theta=s.wheelAngle,px=242-43*s.pistonFraction,tank=s.tankLiters/s.tankCapacityLiters;
      label('UPPER RESERVOIR',218,24,12,palette.text);
      flowPath([[255,234],[294,234],[294,45],[281,45],[281,151]],s.deliveredLiters,s.outletOpen);
      flowPath([[266,325],[266,251],[255,251]],s.sourceLiters,s.inletOpen);
      ctx.fillStyle=palette.water;ctx.globalAlpha=.38;ctx.fillRect(221,161-tank*84,112,tank*84);ctx.globalAlpha=1;
      line([[216,66],[216,165],[338,165],[338,66]],palette['rule-strong'],5);
      label(Math.round(tank*100)+'% full',276,190,12,palette.water,'center');
      ctx.fillStyle=palette.water;ctx.globalAlpha=.23;ctx.fillRect(12,300,336,48);ctx.globalAlpha=1;
      line([[12,300],[348,300]],palette.water,1.5);line([[12,350],[348,350]],palette['rule-strong'],3);
      for(var row=0;row<3;row++)for(var k=0;k<6;k++){
        var x=16+(k*54+(s.riverDistanceMeters||0)*22+row*11)%325;
        line([[x,309+row*13],[x+11,309+row*13]],palette.water,1.4);
      }
      label('RIVER',303,291,12,palette.water);
      line([[52,302],[80,250],[108,302]],palette['rule-strong'],8);
      circle(80,250,54,palette['bg-raised'],palette.wood,5);circle(80,250,47,null,palette.wood,1.5);
      for(var i=0;i<12;i++){
        var a=-theta+i*Math.PI/6,co=Math.cos(a),si=Math.sin(a);
        line([[80,250],[80+51*co,250+51*si]],palette.wood,2.5);
        ctx.save();ctx.translate(80+54*co,250+54*si);ctx.rotate(a);ctx.fillStyle=palette.clay;ctx.fillRect(-3,-8,6,16);ctx.restore();
      }
      circle(80,250,10,palette['bg-raised'],palette.wood,3);
      ctx.fillStyle=palette['bg-raised'];ctx.fillRect(174,223,83,45);
      ctx.fillStyle=palette.water;ctx.globalAlpha=.4;ctx.fillRect(px+7,227,251-px-7,37);ctx.globalAlpha=1;
      line([[174,223],[257,223],[257,268],[174,268]],palette['rule-strong'],4);
      var crankX=80+21*Math.cos(theta),crankY=250-21*Math.sin(theta);
      line([[80,250],[crankX,crankY]],palette.clay,5);line([[crankX,crankY],[px,245]],palette.accent,5);
      circle(crankX,crankY,4,palette['bg-raised'],palette.accent,1.5);
      ctx.fillStyle=palette.clay;ctx.fillRect(px,226,7,39);
      valve(266,281,s.inletOpen);valve(277,234,s.outletOpen);
      label('1  Wheel',21,179,13,palette.accent);
      label('2  Piston',174,206,13,palette.accent);
      label('3  Lift pipe',111,108,13,palette.accent);
      if(s.brake){ctx.fillStyle=palette.clay;ctx.fillRect(21,229,8,35);label('BRAKE',16,221,11,palette.clay);}
    }
    function paint(s){
      if(retired)return;
      var bounds=canvas.getBoundingClientRect(),pixelRatio=Math.min(devicePixelRatio||1,2),cw=Math.round(bounds.width*pixelRatio),ch=Math.round(bounds.height*pixelRatio);
      if(!cw||!ch)return;if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
      ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);ctx.clearRect(0,0,bounds.width,bounds.height);
      var scale=Math.min(bounds.width/960,bounds.height/400),ox=(bounds.width-960*scale)/2,oy=(bounds.height-400*scale)/2;
      if(bounds.width<560 && bounds.height>bounds.width*.7){paintPortrait(s,bounds.width,bounds.height);return;}
      ctx.translate(ox,oy);ctx.scale(scale,scale);ctx.lineCap='round';ctx.lineJoin='round';
      var font=Math.max(13,11/scale),theta=s.wheelAngle,frac=s.pistonFraction,px=465-60*frac;
      // The river is an open supply. Markers follow integrated river travel.
      ctx.fillStyle=palette.water;ctx.globalAlpha=.23;ctx.fillRect(30,320,585,61);ctx.globalAlpha=1;
      line([[30,320],[615,320]],palette.water,1.5);line([[30,382],[617,382]],palette['rule-strong'],4);
      for(var j=0;j<3;j++)for(var i=0;i<10;i++){var x=40+(i*65+(s.riverDistanceMeters||0)*32+j*17)%560,y=337+j*15;line([[x,y],[x+14,y]],palette.water,1.3);}
      label('RIVER',34,307,font,palette.water);
      // Wheel support, hub, spokes and twelve immersed paddles share one solved angle.
      line([[161,319],[220,228],[281,319]],palette['rule-strong'],12);
      circle(220,235,95,palette['bg-raised'],palette.wood,7);circle(220,235,82,null,palette.wood,2);
      for(i=0;i<12;i++){var a=-theta+i*Math.PI/6,co=Math.cos(a),si=Math.sin(a);line([[220,235],[220+90*co,235+90*si]],palette.wood,4);ctx.save();ctx.translate(220+94*co,235+94*si);ctx.rotate(a);ctx.fillStyle=palette.clay;ctx.fillRect(-5,-14,10,28);ctx.restore();}
      circle(220,235,18,palette['bg-raised'],palette.wood,5);
      // Closed paths connect the river intake, pump and upper reservoir.
      flowPath([[564,348],[564,256],[480,256]],s.sourceLiters,s.inletOpen);
      flowPath([[480,232],[628,232],[628,79],[771,79],[771,254]],s.deliveredLiters,s.outletOpen);
      // Reservoir level is the actual accumulated delivery. The overflow is explicit.
      var tankX=731,tankY=131,tankW=177,tankH=134,level=Math.min(1,s.tankLiters/s.tankCapacityLiters),surface=tankY+tankH-level*(tankH-10);
      ctx.fillStyle=palette.water;ctx.globalAlpha=.38;ctx.fillRect(tankX+5,surface,tankW-10,tankY+tankH-surface);ctx.globalAlpha=1;
      if(level>0)line([[tankX+5,surface],[tankX+tankW-5,surface]],palette.water,2);
      line([[tankX,tankY],[tankX,tankY+tankH],[tankX+tankW,tankY+tankH],[tankX+tankW,tankY]],palette['rule-strong'],7);
      for(i=1;i<=4;i++){var ty=tankY+tankH-i*(tankH-10)/4;line([[tankX+tankW-14,ty],[tankX+tankW-5,ty]],palette['text-dim'],1);}
      line([[749,270],[740,367],[898,367],[889,270]],palette['rule'],5);line([[745,316],[893,316]],palette['rule'],4);
      label('UPPER RESERVOIR',731,53,font,palette.text);
      label(Math.round(level*100)+'% full',820,291,font,palette.water,'center');

      if(s.overflowLiters>0&&s.outletOpen){line([[908,145],[925,165],[925,343]],palette.water,3);}
      label('To the gardens',813,391,font,palette['text-dim'],'center');
      // A horizontal, single-acting cylinder. The water volume follows the crank.
      ctx.fillStyle=palette['bg-raised'];ctx.fillRect(388,210,94,64);
      ctx.fillStyle=palette.water;ctx.globalAlpha=.4;ctx.fillRect(px+8,215,476-px-8,54);ctx.globalAlpha=1;
      line([[389,210],[480,210],[480,274],[389,274]],palette['rule-strong'],5);
      var crankX=220+28*Math.cos(theta),crankY=235-28*Math.sin(theta);
      line([[220,235],[crankX,crankY]],palette.clay,8);line([[crankX,crankY],[px,242]],palette.accent,7);
      circle(crankX,crankY,5,palette['bg-raised'],palette.accent,2);
      ctx.fillStyle=palette.clay;ctx.fillRect(px,214,9,56);line([[px+4,216],[px+4,268]],palette.accent,2);
      valve(564,295,s.inletOpen);valve(601,232,s.outletOpen);
      label('1  Waterwheel',220,96,font,palette.accent,'center');
      label('2  Piston pump',458,166,font,palette.accent,'center');
      label(s.phase==='delivery'?'Pushes water out':'Draws water in',455,190,font-1,palette['text-dim'],'center');
      label('3  Lift pipe',641,170,font,palette.accent);
      label('Inlet',528,306,font-1,palette['text-dim'],'right');
      label('Outlet',602,205,font-1,palette['text-dim'],'center');
      if(s.brake){ctx.fillStyle=palette.clay;ctx.fillRect(121,205,13,55);label('BRAKE',113,183,font,palette.clay,'center');}
    }
    var resize=new ResizeObserver(function(){sync();});resize.observe(element.querySelector('.marly-drawing'));
    sync();
    return {smoke:false,clock:function(){return model.stats().elapsed+revision*.00000001;},
      tick:function(dt){model.step(dt*root.__toy.stats().timeScale);sync();},draw:function(){sync();},stats:function(){return model.stats();},
      primary:function(){return true;},destroy:function(){retired=true;resize.disconnect();element.remove();shell.classList.remove('has-marly-demo');}};
  }
  root.WSSMarlyMachine={make:make};root.WSSMachines=root.WSSMachines||{};root.WSSMachines['marly-machine']={make:make};root.WSSDraftRuntime={create:create};
})(typeof window!=='undefined'?window:globalThis);
