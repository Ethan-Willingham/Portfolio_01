/* Finite pressure apparatus drafts. Motion belongs to native water and gas. */
(function(root){
  'use strict';
  function rect(x,y,width,height){return {x:x,y:y,width:width,height:height};}
  function point(x,y){return {x:x,y:y};}
  function vessel(d,id,r,sealed){d.vessels.push({id:id,label:id,rect:r,sealed:!!sealed});return r;}
  function pipe(d,points,bore,filled){d.pipes.push({points:points,bore:bore});if(filled)d.initial.push({kind:'pipe',points:points,bore:bore,tile:8});}
  function fill(d,r){d.initial.push({kind:'rect',rect:r});}
  function base(id,title,caption,options){
    return {name:id,title:title,caption:caption,draft:true,seed:options.seed||17,setup:'ordinary',setups:[],
      vessels:[],pipes:[],solids:[],vents:[],parts:[],slimes:[],initial:[],meters:[],marks:[],
      viewBounds:{x:16,y:16,width:688,height:368},action:'Open air vent',
      primary:{kind:'cap',opening:{axis:'x',at:448,start:64,end:80},closed:true,openLabel:'Close air vent',closedLabel:'Open air vent'},
      settings:{particlePressure:true,projectedVelocity:true,directGather:true,collapseEmptyCells:true,geometricGas:true,nonlinearGas:true,
        vaporClosure:true,boundaryReconstruction:true,cellSize:8,soundSpeed:2500,iterations:32,redBlack:true,roomPressurePsi:14.7,minimumPressure:-80000},
      boundaries:{pool:false,tap:null,drain:null,caps:[],reservoirY:376},
      boundaryNote:'Draft. Actual finite water and room air occupy the drawn apparatus. Glass walls and visitor-operated ideal caps are the physical boundaries.',
      energyBudgetStatus:'Gravity and initial hydrostatic imbalance supply water motion. No authored flow rate, trajectory, timer, water source or drain is present. Native gas amount and isothermal pressure follow the existing solver; fine interface and calibrated turbulent losses are unresolved.'};
  }
  function thermal(d,h,probe,options){
    d.settings.phaseChange=true;d.primary={kind:'steam-heat-toggle'};d.action=options.unheated?'Turn heater on':'Turn heater off';
    d.steam={heated:!options.unheated,capped:true,powerWatts:1500,initialC:100,vaporConductance:.2,phaseRelaxationSeconds:.5,
      heater:h,vent:probe,outlet:point(probe.x,probe.y-24),ventDiameterInches:.25,ventCoefficient:.62,whistleLengthInches:2,
      hideWhistleDrawing:true,captionOn:d.caption,captionOff:'The declared heater is off. Actual water and vapor cool, draft.'};
    d.setups=[{id:'ordinary',label:'Heater on',options:{}},{id:'unheated',label:'No heater',options:{unheated:true}}];d.setup=options.unheated?'unheated':'ordinary';
    d.boundaryNote+=' A declared 1,500-watt immersed heater heats actual native water. The separate gas-only whistle port is capped; water can still move through the real uptake tube.';
    d.energyBudgetStatus='The existing whole-parcel steam companion pays actual phase mass and sensible plus latent enthalpy. Vapor pressure follows native gas lineage, and finite cooling can condense it back. The heater supplies the declared external energy. Sustained unsupported vapor, calibrated heat transfer, detailed steam momentum, compressional work and full system-energy closure remain unresolved.';
  }
  function make(id,world,options){
    if((id==='boyle-j-tube'||id==='torricelli-tube')&&root.WSSPressureScales)return root.WSSPressureScales.make(id,world,options);
    options=options||{};if(world.w!==720||world.h!==400||(world.tile||8)!==8)throw Error('Pressure drafts need a 720 by 400 world.');
    var d,r,receiver,opening;
    if(id==='glugging-bottle'){
      d=base(id,'Glugging bottle','Watch water leave while native air rises through the shared mouth. Open the side vent to drain faster.',options);
      d.settings.phaseChange=true;d.entrainedAir={entrainedArea:200};
      r=vessel(d,'Bottle',rect(272,48,176,176),true);receiver=vessel(d,'Basin',rect(16,312,688,72),false);
      pipe(d,[point(364,204),point(364,292)],32,true);fill(d,rect(280,80,160,136));
      d.vents.push(rect(440,64,8,16));opening={axis:'x',at:448,start:64,end:80};d.primary.opening=opening;d.primary.label='Air vent';d.primary.closed=!options.vented;
      d.boundaries.caps=options.vented?[]:[opening];d.action=options.vented?'Close air vent':'Open air vent';d.setup=options.vented?'vented':'ordinary';
      d.setups=[{id:'ordinary',label:'Shared mouth',options:{}},{id:'vented',label:'Air vent open',options:{vented:true}}];
      d.meters.push({id:'mouth',a:point(360,288),b:point(376,288),axis:'y',positive:1});
      d.measure={source:r,receiver:receiver,gasProbe:point(352,64),outlet:point(368,296),sourceLevel:80,bore:32};
      d.boundaryNote='The finite bottle shares a 32-pixel mouth between outgoing native water and incoming native air. No air is injected into the bottle. A visitor-operated side vent gives room air a separate path; the native pressure model determines the different draining rates. Small detached pockets use the finite bubble transport model, while connected headspace stays in the native gas solver.';
      d.energyBudgetStatus+=' Native mouth water and captured ambient gas drive intermittent counterflow without a flow timer. Detailed gas interface breakup and turbulent losses are unresolved.';
    }else if(id==='boyle-j-tube'){
      d=base(id,"Boyle's J-tube",'The taller water column squeezes the trapped air. Open its vent to compare, draft.',options);
      r=vessel(d,'Trapped air',rect(216,80,80,264),true);receiver=vessel(d,'Open arm',rect(424,32,80,312),false);
      pipe(d,[point(260,316),point(468,316)],24,true);fill(d,rect(224,248,64,88));fill(d,rect(432,64,64,272));
      d.vents.push(rect(288,96,8,16));opening={axis:'x',at:296,start:96,end:112};d.primary.opening=opening;d.primary.closed=!options.vented;
      d.boundaries.caps=options.vented?[]:[opening];d.action=options.vented?'Close air vent':'Open air vent';d.setup=options.vented?'vented':'ordinary';
      d.setups=[{id:'ordinary',label:'Trapped gas',options:{}},{id:'vented',label:'Gas vent open',options:{vented:true}}];
      d.marks=[{id:'initial-gas-base',x:224,y:248,width:64},{id:'open-water-level',x:432,y:64,width:64}];
      d.measure={source:receiver,receiver:r,gasProbe:point(256,128),sourceLevel:64,bore:24};
      d.boundaryNote+=' The open arm and sealed short arm share a real water-filled base. Initial gas amount stays trapped until the visitor opens its side vent. The scale remains 24 world pixels per inch.';
    }else if(id==='water-tower'){
      d=base(id,'Water tower','Close a tap and compare the real jets at three heights, draft.',options);
      r=vessel(d,'Tower tank',rect(64,32,160,112),false);receiver=vessel(d,'Basin',rect(16,352,688,32),false);
      pipe(d,[point(196,116),point(276,116),point(276,324)],24,true);fill(d,rect(72,56,144,80));
      [196,260,324].forEach(function(y,i){var name=['upper','middle','lower'][i];pipe(d,[point(276,y),point(548,y)],24,true);
        d.parts.push({type:'valve',id:name,rect:rect(456,y-12,8,24),direction:'right',open:i!==2||!options.closed});
        d.meters.push({id:name,a:point(536,y-12),b:point(536,y+12),axis:'x',positive:1});});
      d.primary={kind:'valve',id:'lower'};d.action=options.closed?'Open valve':'Close valve';
      d.measure={source:r,receiver:receiver,sourceLevel:56,outlet:point(552,324),bore:24};
      d.boundaryNote+=' The three visible taps are real manual valve parts. Click each tap or use the main button for the lowest tap. The finite elevated header is not replenished.';
    }else if(id==='pascal-barrel'){
      d=base(id,"Pascal's barrel",'A narrow column loads an ideal breakable wall panel, draft.',options);
      r=vessel(d,'Barrel',rect(128,224,184,112),true);receiver=vessel(d,'Basin',rect(16,344,688,40),false);
      pipe(d,[point(172,52),point(172,244)],8,true);pipe(d,[point(292,292),point(548,292)],24,false);
      fill(d,rect(136,232,168,96));d.initial.push({kind:'pipe',points:[point(292,292),point(308,292)],bore:24,tile:8});
      d.setup=options.stronger?'stronger':'ordinary';opening={axis:'x',at:312,start:280,end:304};d.boundaries.burstDisk={opening:opening,strength:options.stronger?1000000:20000,direction:1};
      d.primary={kind:'pour',target:point(172,44)};d.action='Pour into the narrow tube';
      d.setups=[{id:'ordinary',label:'Ordinary panel',options:{}},{id:'stronger',label:'Stronger panel',options:{stronger:true}}];
      d.meters=[{id:'wall-outlet',a:point(536,280),b:point(536,304),axis:'x',positive:1}];
      d.measure={source:r,receiver:receiver,sourceLevel:64,outlet:point(552,292),bore:24,flowSection:Object.assign({positive:1},opening)};
      d.boundaryNote+=' The thin upright tube is open at its top. Native pressure on either side of the ideal barrel panel triggers its irreversible opening; the stronger comparison changes only its threshold.';
      d.energyBudgetStatus+=' The ideal panel has no elastic wall fracture, inertia, fragments or fracture work. The visitor can add real water by pouring; that external input is not a closed-inventory run.';
    }else if(id==='moka-pot'){
      d=base(id,'Moka pot','Heat the lower chamber to push water toward the upper cup, draft.',options);
      r=vessel(d,'Boiler',rect(112,224,144,128),true);receiver=vessel(d,'Upper cup',rect(416,32,128,112),false);
      pipe(d,[point(220,324),point(220,112),point(460,112)],16,false);fill(d,rect(120,280,128,64));
      thermal(d,rect(128,328,112,8),point(180,248),options);
      d.measure={source:r,receiver:receiver,gasProbe:point(180,248),sourceLevel:280,bore:16,outlet:point(464,112)};
      d.energyBudgetStatus+=' The coffee-bed resistance is absent; this is a pressure-driven tube, not calibrated percolation.';
    }else if(id==='torricelli-tube'){
      d=base(id,"Torricelli's tube",'A short sealed water column stands above the bath. Its vacuum is unresolved, draft.',options);
      r=vessel(d,'Sealed tube',rect(336,48,32,272),true);receiver=vessel(d,'Bath',rect(144,296,432,88),false);
      pipe(d,[point(348,308),point(348,340)],16,true);fill(d,rect(344,56,16,256));fill(d,rect(152,320,416,56));
      d.vents.push(rect(360,64,8,16));opening={axis:'x',at:368,start:64,end:80};d.primary.opening=opening;d.boundaries.caps=[opening];
      d.measure={source:r,receiver:receiver,gasProbe:point(352,64),sourceLevel:56,bore:16};
      d.boundaryNote+=' The physical tube is eleven inches tall at the toy scale, not a full water barometer. The stock pressure floor and vapor closure do not establish a Torricellian vacuum.';
    }else if(id==='venturi-aspirator'){
      d=base(id,'Venturi and water aspirator','Watch the constriction and its real side air inlet, draft.',options);
      r=vessel(d,'Header',rect(32,32,144,152),false);receiver=vessel(d,'Basin',rect(16,344,688,40),false);
      pipe(d,[point(156,148),point(240,148),point(240,260),point(332,260)],32,true);
      pipe(d,[point(332,260),point(428,260)],16,true);pipe(d,[point(428,260),point(572,260)],32,true);
      pipe(d,[point(388,260),point(388,196)],8,false);fill(d,rect(40,56,128,120));
      opening={axis:'y',at:200,start:384,end:392};d.primary.opening=opening;d.primary.closed=false;d.primary.openLabel='Close air inlet';d.primary.closedLabel='Open air inlet';d.action='Close air inlet';
      d.meters=[{id:'throat',a:point(408,256),b:point(408,272),axis:'x',positive:1}];
      d.measure={source:r,receiver:receiver,sourceLevel:56,bore:16,gasProbe:point(388,216),outlet:point(576,264)};
      d.energyBudgetStatus+=' The narrowing is stepped glass geometry. Air must actually enter through the side branch; aspiration and turbulent mixing are not assumed.';
    }else if(id==='savery-pump'){
      d=base(id,"Savery's steam pump",'Heat and cool the chamber, using the two real manual valves, draft.',options);
      r=vessel(d,'Steam chamber',rect(272,200,144,160),true);receiver=vessel(d,'Delivery',rect(544,32,144,112),false);
      vessel(d,'Supply bath',rect(32,280,176,104),false);
      pipe(d,[point(180,348),point(300,348)],24,false);pipe(d,[point(388,340),point(460,340),point(460,100),point(580,100)],24,false);
      fill(d,rect(40,304,160,72));fill(d,rect(280,296,128,56));
      d.parts=[{type:'valve',id:'inlet',rect:rect(232,336,8,24),direction:'right',open:false},{type:'valve',id:'delivery',rect:rect(448,264,24,8),direction:'up',open:true}];
      thermal(d,rect(288,344,112,8),point(344,232),options);
      d.measure={source:r,receiver:receiver,sourceLevel:296,bore:24,gasProbe:point(344,232),outlet:point(584,100)};
      d.energyBudgetStatus+=' The two valves are visitor operated. Sustained vapor support, vacuum refill and an automatic check-valve cycle have not been established.';
    }else if(id==='pulsometer'){
      d=base(id,'Pulsometer','Two real heated chambers share a delivery tube. Automatic alternation is missing, draft.',options);
      r=vessel(d,'Left chamber',rect(128,232,144,128),true);var right=vessel(d,'Right chamber',rect(408,232,144,128),true);
      receiver=vessel(d,'Delivery',rect(584,32,112,112),false);vessel(d,'Supply bath',rect(280,280,120,104),false);
      pipe(d,[point(196,340),point(196,188),point(644,188),point(644,108)],16,false);
      pipe(d,[point(476,340),point(476,188)],16,false);pipe(d,[point(340,348),point(252,348)],16,false);pipe(d,[point(340,348),point(420,348)],16,false);
      fill(d,rect(136,296,128,56));fill(d,rect(416,296,128,56));fill(d,rect(288,312,104,64));
      d.parts=[{type:'valve',id:'left-inlet',rect:rect(280,344,8,16),direction:'left',open:false},{type:'valve',id:'right-inlet',rect:rect(392,344,8,16),direction:'right',open:false}];
      thermal(d,rect(144,344,384,8),point(196,256),options);
      d.measure={source:r,receiver:receiver,sourceLevel:296,bore:16,gasProbe:point(196,256),outlet:point(648,108)};
      d.energyBudgetStatus+=' A single declared wide heater shares its power among actual wet donors in both chambers. No timer or pressure-switching mechanism alternates them; the historical pumping cycle is not implemented.';
    }else if(id==='trompe'){
      d=base(id,'Trompe','Falling water passes a real air inlet into a lower receiver, draft.',options);
      r=vessel(d,'Header',rect(112,32,160,80),false);receiver=vessel(d,'Air receiver',rect(200,256,192,112),true);vessel(d,'Basin',rect(432,344,264,40),false);
      pipe(d,[point(228,84),point(228,324)],24,true);pipe(d,[point(228,164),point(324,164)],16,false);pipe(d,[point(372,340),point(548,340)],24,false);
      fill(d,rect(120,48,144,56));fill(d,rect(208,312,176,48));
      opening={axis:'x',at:320,start:160,end:176};d.primary.opening=opening;d.primary.closed=false;d.primary.openLabel='Close air inlet';d.primary.closedLabel='Open air inlet';d.action='Close air inlet';
      d.measure={source:r,receiver:receiver,sourceLevel:48,bore:24,gasProbe:point(300,280),outlet:point(552,340)};
      d.energyBudgetStatus+=' There is no air pump or bubble injection. Falling water must entrain actual native gas through the side inlet, and compression/separation are not assumed to succeed.';
    }else if(id==='hydraulic-ram'){
      d=base(id,'Hydraulic ram','Close the waste valve and watch the delivery branch, draft.',options);
      r=vessel(d,'Header',rect(32,32,144,144),false);receiver=vessel(d,'High delivery',rect(512,16,160,96),false);vessel(d,'Waste basin',rect(192,344,280,40),false);
      vessel(d,'Air chamber',rect(384,144,64,80),true);
      pipe(d,[point(156,148),point(156,284),point(356,284),point(356,356)],24,true);
      pipe(d,[point(292,284),point(292,68),point(548,68)],24,false);pipe(d,[point(292,220),point(420,220),point(420,196)],16,false);
      fill(d,rect(40,96,128,72));
      d.parts=[{type:'valve',id:'waste',rect:rect(344,320,24,8),direction:'down',open:true},{type:'valve',id:'delivery',rect:rect(280,120,24,8),direction:'up',open:true}];
      d.primary={kind:'valve',id:'waste'};d.action='Close valve';
      d.measure={source:r,receiver:receiver,sourceLevel:96,bore:24,outlet:point(552,68)};
      d.boundaryNote+=' The waste and delivery valves are manual. No inertial waste-valve body or automatic impact-closing/check-valve cycle exists.';
      d.energyBudgetStatus+=' No pumping claim follows from ordinary gravity-fed flow. The receiver starts above the source free surface and the delivery branch starts dry.';
    }else if(id==='water-hammer'){
      d=base(id,'Water hammer','Close the real downstream cut. The pressure-wave model is incomplete, draft.',options);
      r=vessel(d,'Header',rect(32,32,144,144),false);receiver=vessel(d,'Basin',rect(16,344,688,40),false);
      if(options.airChamber!==false)vessel(d,'Air chamber',rect(352,80,64,80),true);
      pipe(d,[point(156,148),point(572,148)],32,true);fill(d,rect(40,64,128,104));
      opening={axis:'x',at:496,start:136,end:168};d.primary.opening=opening;d.primary.closed=false;d.primary.openLabel='Close downstream cut';d.primary.closedLabel='Open downstream cut';d.action='Close downstream cut';
      d.setups=[{id:'ordinary',label:'With air chamber',options:{}},{id:'no-chamber',label:'No air chamber',options:{airChamber:false}}];d.setup=options.airChamber===false?'no-chamber':'ordinary';
      d.measure={source:r,receiver:receiver,sourceLevel:64,bore:32,outlet:point(576,152),flowSection:Object.assign({positive:1},opening)};
      d.boundaryNote+=' The visitor changes an ideal stationary cut without sweeping water volume. The optional chamber contains real native air. A fast physical valve and resolved acoustic propagation are not established.';
      d.energyBudgetStatus+=' This draft does not label a local pressure response as a validated traveling water-hammer wave.';
    }else if(id==='ctesibius-clock'){
      d=base(id,"Ctesibius' float clock",'The float follows water accumulating below a finite header, draft.',options);
      r=vessel(d,'Header',rect(80,32,144,144),false);receiver=vessel(d,'Clock bowl',rect(280,192,304,192),false);
      pipe(d,[point(196,156),point(356,156),point(356,212)],8,true);fill(d,rect(88,56,128,112));fill(d,rect(288,336,288,40));
      d.slimes=[{x:472,y:320,radius:20}];d.primary={kind:'pour',target:point(148,48)};d.action='Pour into the header';
      [232,256,280,304,328,352].forEach(function(y,i){d.marks.push({id:'float-scale-'+i,x:456,y:y,width:56});});
      d.measure={source:r,receiver:receiver,sourceLevel:56,bore:8,outlet:point(360,216)};
      d.boundaryNote+=' The real elastic slime acts as a float in accumulating native water; no timer places it. The ruler is a position scale, not calibrated seconds.';
      d.energyBudgetStatus+=' A constant-head regulator, geared clock hand and calibrated time scale are absent. The existing ordinary slime coupling is one way and does not close body-water momentum or energy. The visitor may add real water to the header.';
    }else throw Error('Unknown pressure draft.');
    return d;
  }
  root.WSSMachines=root.WSSMachines||{};
  ['glugging-bottle','boyle-j-tube','water-tower','pascal-barrel','moka-pot','torricelli-tube','venturi-aspirator','savery-pump','pulsometer','trompe','hydraulic-ram','water-hammer','ctesibius-clock'].forEach(function(id){root.WSSMachines[id]={make:function(world,options){return make(id,world,options);}};});
})(typeof window!=='undefined'?window:globalThis);
