/* Original synthesized score and soundscape. One context, bounded voices, no timers. */
(function(root){
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const pitch=midi=>440*Math.pow(2,(midi-69)/12);
  const motifs=[
    [69,null,72,71,69,null,67,null,64,null,67,null,69,null,72,76,74,null,72,null,69,null,null,null],
    [64,null,67,69,72,null,71,null,67,null,64,null,62,null,64,67,69,null,67,null,64,null,null,null],
    [72,null,74,76,74,null,72,null,69,67,64,null,67,null,69,72,71,null,69,null,67,null,null,null],
    [69,null,67,64,62,null,64,null,67,69,72,null,71,null,67,64,62,null,64,null,69,null,null,null]
  ];
  class Audio{
    constructor(options={}){
      this.settings=options.settings||(()=>({sound:true,volume:.22,music:.35,ambience:.5,effects:.8}));
      this.active=options.active||(()=>true);this.voices=new Set();this.lastPlayed=Object.create(null);this.stats={played:0,skipped:0,peakVoices:0};this.musicStep=0;this.nextNote=0;this.lastUpdate=-1;this.scene={mode:'title',speed:0,battle:false,paused:false};
      const Context=root.AudioContext||root.webkitAudioContext;
      this.ctx=options.context||(Context?new Context():null);if(!this.ctx)return;
      const a=this.ctx;this.offline=typeof a.startRendering==='function';this.master=a.createGain();this.master.gain.value=0;this.limiter=a.createDynamicsCompressor();this.limiter.threshold.value=-12;this.limiter.knee.value=18;this.limiter.ratio.value=6;this.limiter.attack.value=.004;this.limiter.release.value=.18;
      this.master.connect(this.limiter);this.limiter.connect(options.destination||a.destination);
      this.buses={};for(const key of ['effects','music','ambience']){const bus=a.createGain();bus.gain.value=0;bus.connect(this.master);this.buses[key]=bus;}
      // Reused deterministic noise avoids allocating an audio buffer for every cannon.
      this.noise=a.createBuffer(1,Math.ceil(a.sampleRate*4),a.sampleRate);const samples=this.noise.getChannelData(0);let seed=9137,last=0;
      for(let i=0;i<samples.length;i++){seed=(seed*1664525+1013904223)>>>0;const white=seed/2147483648-1;last=(last+.035*white)/1.035;samples[i]=last*6;}
      this.makeBed();this.applyMix(true);
    }
    makeBed(){
      const a=this.ctx;this.water=a.createBufferSource();this.water.buffer=this.noise;this.water.loop=true;
      this.waterFilter=a.createBiquadFilter();this.waterFilter.type='lowpass';this.waterFilter.frequency.value=900;this.waterGain=a.createGain();this.waterGain.gain.value=0;this.water.connect(this.waterFilter);this.waterFilter.connect(this.waterGain);this.waterGain.connect(this.buses.ambience);this.water.start();
      this.engine=a.createOscillator();this.engine.type='triangle';this.engine.frequency.value=49;this.engineFilter=a.createBiquadFilter();this.engineFilter.type='lowpass';this.engineFilter.frequency.value=140;this.engineGain=a.createGain();this.engineGain.gain.value=0;this.engine.connect(this.engineFilter);this.engineFilter.connect(this.engineGain);this.engineGain.connect(this.buses.ambience);this.engine.start();
      this.pump=a.createOscillator();this.pump.type='sine';this.pump.frequency.value=64;this.pumpGain=a.createGain();this.pumpGain.gain.value=0;this.pump.connect(this.pumpGain);this.pumpGain.connect(this.buses.ambience);this.pump.start();
    }
    target(param,value,time,fast=false){param.setTargetAtTime(value,time,fast?.015:.12);}
    applyMix(fast=false){if(!this.ctx)return;const s=this.settings(),now=this.ctx.currentTime;this.target(this.master.gain,s.sound===false?0:clamp(Number(s.volume)||0,0,.5)*2,now,fast);
      for(const k of ['effects','music','ambience'])this.target(this.buses[k].gain,clamp(Number.isFinite(s[k])?s[k]:k==='music'?.35:k==='ambience'?.5:.8,0,1)*(k==='music'&&this.scene.battle?.32:1),now,fast);
    }
    needsResume(){return this.ctx?.state==='suspended'||this.ctx?.state==='interrupted';}
    wake(){if(!this.ctx||!this.active()||this.settings().sound===false||this.settings().volume<=0)return;this.applyMix();if(this.needsResume())this.ctx.resume().catch(()=>{});}
    suspend(){if(this.ctx?.state==='running'||this.ctx?.state==='interrupted')this.ctx.suspend().catch(()=>{});}
    clearEffects(){for(const voice of this.voices)if(voice.bus==='effects'){voice.gain.gain.cancelScheduledValues(this.ctx.currentTime);voice.gain.gain.setTargetAtTime(0,this.ctx.currentTime,.025);}}
    update(scene){
      this.scene=scene;if(!this.ctx||!this.active()||this.ctx.state!=='running'&&!this.offline||this.ctx.state==='closed')return;
      const now=this.ctx.currentTime;if(now-this.lastUpdate<.07)return;this.lastUpdate=now;this.applyMix();
      const sailing=scene.mode==='sea'&&!scene.paused,speed=clamp(scene.speed||0,0,1.5),swell=.78+Math.sin(now*.53)*.13+Math.sin(now*.17)*.09;
      this.target(this.waterGain.gain,(scene.mode==='title'?.018:scene.mode==='port'?.025:sailing?.036+speed*.017:.015)*swell,now);
      this.target(this.waterFilter.frequency,sailing?650+speed*600:420,now);
      this.target(this.engineGain.gain,sailing&&scene.steam?.011+speed*.012:0,now);this.target(this.engine.frequency,46+speed*29,now);
      this.target(this.pumpGain.gain,sailing&&scene.work==='oil'?.018*(.65+.35*Math.sin(now*9)):0,now);
      if(this.settings().sound===false||this.settings().volume<=0)return;
      // Sparse 6/8 phrases leave room for the sea and useful warnings.
      if(this.nextNote<now-.5)this.nextNote=now+.05;
      while(this.nextNote<now+.18){this.scoreStep(this.musicStep++,this.nextNote);this.nextNote+=.31;}
      if(!scene.paused&&now>(this.nextAmbient||0)){
        this.nextAmbient=now+9+(this.musicStep%11);
        if(scene.mode==='port'||scene.mode==='title')this.gull(now+.05);
        else if(scene.work==='fish')this.noiseVoice({at:now,duration:.5,volume:.07,frequency:1400,bus:'ambience'});
        else if(speed>.25)this.tone({at:now,frequency:130,duration:.5,volume:.025,type:'triangle',slide:88,bus:'ambience'});
      }
    }
    scoreStep(step,at){
      if((this.settings().music??.35)<=0)return;const bar=Math.floor(step/6),phrase=Math.floor(step/48)%motifs.length,index=step%48,rootNote=[45,48,43,50][Math.floor(index/12)];
      if(step%12===0){this.tone({at,frequency:pitch(rootNote),duration:1.9,volume:.065,bus:'music',type:'sine'});this.tone({at:at+.02,frequency:pitch(rootNote+19),duration:2.1,volume:.022,bus:'music',type:'triangle',filter:900});}
      if(step%6===3)this.pluck(rootNote+12,at,.032,'music');
      const note=motifs[phrase][Math.floor(index/2)];if(index%2===0&&note!==null&&bar%8!==7)this.pluck(note,at,.105,'music');
    }
    voice(source,gain,bus,nodes,at,end){
      const record={source,gain,bus,nodes};this.voices.add(record);this.stats.peakVoices=Math.max(this.stats.peakVoices,this.voices.size);
      source.onended=()=>{this.voices.delete(record);for(const node of [source,gain,...nodes])try{node.disconnect();}catch{}};
      source.start(at);source.stop(end);
    }
    tone({at=this.ctx.currentTime,frequency=440,duration=.2,volume=.1,type='sine',slide,pan=0,bus='effects',filter}){
      if(this.voices.size>=64){this.stats.skipped++;return;}const a=this.ctx,o=a.createOscillator(),g=a.createGain(),p=a.createStereoPanner(),nodes=[p];o.type=type;o.frequency.setValueAtTime(frequency,at);if(slide)o.frequency.exponentialRampToValueAtTime(slide,at+duration*.8);
      g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(Math.max(.0001,volume),at+.008);g.gain.exponentialRampToValueAtTime(.0001,at+duration);p.pan.value=clamp(pan,-1,1);
      if(filter){const f=a.createBiquadFilter();f.type='lowpass';f.frequency.value=filter;o.connect(f);f.connect(g);nodes.push(f);}else o.connect(g);
      g.connect(p);p.connect(this.buses[bus]);this.voice(o,g,bus,nodes,at,at+duration+.03);
    }
    noiseVoice({at=this.ctx.currentTime,duration=.2,volume=.2,frequency=900,pan=0,bus='effects',highpass=80}){
      if(this.voices.size>=64){this.stats.skipped++;return;}const a=this.ctx,source=a.createBufferSource(),f=a.createBiquadFilter(),hp=a.createBiquadFilter(),g=a.createGain(),p=a.createStereoPanner();source.buffer=this.noise;source.loop=true;source.playbackRate.value=.85+(this.stats.played%7)*.05;f.type='lowpass';f.frequency.value=frequency;hp.type='highpass';hp.frequency.value=highpass;p.pan.value=clamp(pan,-1,1);
      g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(Math.max(.0001,volume),at+.006);g.gain.exponentialRampToValueAtTime(.0001,at+duration);source.connect(hp);hp.connect(f);f.connect(g);g.connect(p);p.connect(this.buses[bus]);this.voice(source,g,bus,[hp,f,p],at,at+duration+.025);
    }
    pluck(note,at,volume,bus='effects',pan=0){this.tone({at,frequency:pitch(note),duration:1.1,volume,type:'triangle',filter:1600,bus,pan});this.tone({at,frequency:pitch(note+12),duration:.19,volume:volume*.14,type:'sine',bus,pan});}
    gull(at){this.tone({at,frequency:1050,slide:680,duration:.32,volume:.022,type:'sine',bus:'ambience',pan:.55});this.tone({at:at+.38,frequency:960,slide:700,duration:.26,volume:.015,type:'sine',bus:'ambience',pan:.55});}
    play(kind,detail={}){
      if(!this.ctx||!this.active()||this.settings().sound===false||this.settings().volume<=0||this.settings().effects===0||this.ctx.state!=='running'&&!this.offline||this.ctx.state==='closed')return false;
      const at=detail.at??this.ctx.currentTime,interval=({shot:.12,'enemy-shot':.28,'escort-shot':.2,impact:.075,sink:.18,hurt:.14,burst:.5,'flak-shot':.23,'mortar-shot':.38,'mortar-hit':.22,pickup:.13,splash:.3,warn:1.5,repair:.4,complete:.8,rare:.8})[kind]??.07;
      if(at-(this.lastPlayed[kind]??-100)<interval||this.voices.size>52){this.stats.skipped++;return false;}this.lastPlayed[kind]=at;this.stats.played++;
      const pan=clamp(detail.pan||0,-.85,.85),v=clamp(detail.volume??1,0,1);
      if(['shot','escort-shot','enemy-shot','burst'].includes(kind)){
        const big=kind==='burst',enemy=kind==='enemy-shot',vol=v*(big?.65:kind==='shot'?.38:.2);
        this.noiseVoice({at,duration:big?.48:.23,volume:vol,frequency:enemy?550:1100,pan});this.tone({at,frequency:big?95:145,slide:big?38:50,duration:big?.4:.19,volume:vol*.42,pan,type:'triangle',filter:500});
      }else if(kind==='flak-shot'||kind==='mortar-shot'||kind==='mortar-hit'){
        const mortar=kind!=='flak-shot',hit=kind==='mortar-hit';
        this.noiseVoice({at,duration:hit?.38:mortar?.25:.12,volume:v*(hit?.4:.27),frequency:hit?380:mortar?620:1900,pan});
        this.tone({at,frequency:mortar?82:215,slide:mortar?32:80,duration:mortar?.34:.11,volume:v*.13,type:'triangle',pan,filter:700});
      }else if(kind==='splash'){
        this.noiseVoice({at,duration:.48,volume:v*.65,frequency:1250,pan});this.noiseVoice({at:at+.055,duration:.65,volume:v*.30,frequency:420,pan});
        this.tone({at,frequency:92,slide:38,duration:.19,volume:v*.15,type:'triangle',filter:380,pan});
      }else if(kind==='impact'||kind==='hurt'||kind==='sink'){
        const sink=kind==='sink',hurt=kind==='hurt';this.noiseVoice({at,duration:sink?.62:hurt?.2:.1,volume:v*(sink?.55:hurt?.3:.21),frequency:sink?450:hurt?650:1900,pan});
        this.tone({at,frequency:sink?70:hurt?110:240,slide:sink?32:75,duration:sink?.5:.12,volume:v*(sink?.16:.075),type:'triangle',pan,filter:650});
      }else if(kind==='warn'){
        this.tone({at,frequency:330,duration:.15,volume:.12,type:'triangle',pan});this.tone({at:at+.2,frequency:294,duration:.22,volume:.10,type:'triangle',pan});
      }else if(kind==='rare'||kind==='upgrade'||kind==='complete'){
        const notes=kind==='rare'?[76,79,83,88]:kind==='upgrade'?[60,64,67,72]:[67,72,76];notes.forEach((note,i)=>this.pluck(note,at+i*.12,.12,'effects',pan));
      }else if(kind==='repair'){
        [0,.1,.23].forEach((t,i)=>this.noiseVoice({at:at+t,duration:.08,volume:.12,frequency:900+i*350,pan}));this.pluck(64,at+.28,.075);
      }else if(kind==='coin'){this.pluck(79,at,.08);this.pluck(83,at+.075,.065);}
      else if(kind==='pickup'){this.pluck(detail.kind==='repair'?72:76,at,.065,'effects',pan);}
      else if(kind==='dock'){[60,67,72].forEach((note,i)=>this.pluck(note,at+i*.16,.09));}
      else if(kind==='depart'){this.tone({at,frequency:220,slide:196,duration:.65,volume:.045,type:'triangle',filter:700});this.noiseVoice({at,duration:.28,volume:.10,frequency:1900});}
      else if(kind==='arrival'){this.pluck(67,at,.065);this.pluck(74,at+.18,.055);}
      else if(kind==='ready'){this.tone({at,frequency:660,duration:.08,volume:.04,type:'triangle'});}
      else if(kind==='tap'){this.tone({at,frequency:480,slide:340,duration:.045,volume:.05,type:'triangle'});}
      else if(kind==='info'){this.pluck(67,at,.035);}
      else return false;
      return true;
    }
    async dispose(){if(!this.ctx)return;for(const v of this.voices)try{v.source.stop();}catch{}for(const n of [this.water,this.engine,this.pump])try{n.stop();n.disconnect();}catch{}if(this.ctx.close)await this.ctx.close().catch(()=>{});}
  }
  root.WidewakeAudio=Audio;if(typeof module!=='undefined'&&module.exports)module.exports=Audio;
})(typeof window!=='undefined'?window:globalThis);
