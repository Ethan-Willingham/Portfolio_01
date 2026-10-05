(function(root){'use strict';const O=root.OneShift;
 class Audio{
  constructor(){this.context=null;this.volume=.25;this.voices=[];}
  async unlock(){try{if(!this.context){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.context=new C();this.master=this.context.createGain();this.master.connect(this.context.destination);this.master.gain.value=this.volume*.25;this.ambience();}if(this.context.state==='suspended')await this.context.resume();}catch{}}
  ambience(){const c=this.context;this.air=c.createGain();this.air.gain.value=0;this.air.connect(this.master);this.motor=c.createGain();this.motor.gain.value=0;this.motor.connect(this.master);const buffer=c.createBuffer(1,c.sampleRate*8,c.sampleRate),data=buffer.getChannelData(0);let seed=1471,last=0;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;last=(last+((seed/4294967296)*2-1)*.015)/1.015;data[i]=last*4;}const noise=c.createBufferSource();noise.buffer=buffer;noise.loop=true;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1200;noise.connect(filter);filter.connect(this.air);noise.start();this.ambientSources=[noise];for(const frequency of [60,120]){const source=c.createOscillator();source.type='sine';source.frequency.value=frequency;source.connect(this.motor);source.start();this.ambientSources.push(source);}}
  update(s,active){if(!this.context||this.context.state!=='running')return;const t=this.context.currentTime,running=active&&s.phase==='shift';this.air.gain.setTargetAtTime(running?.07:0,t,.25);this.motor.gain.setTargetAtTime(running&&(s.owned.cold||s.owned.line)&&!(s.powerUntil>s.minute)?.015:0,t,.4);}
  setVolume(n){this.volume=Math.max(0,Math.min(1,n));if(this.master)this.master.gain.setTargetAtTime(this.volume*.25,this.context.currentTime,.02);}
  play(kind){const c=this.context;if(!c||c.state!=='running'||!this.volume)return;const t=c.currentTime;
   while(this.voices.length&&this.voices[0].end<t)this.voices.shift();if(this.voices.length>=8)return;
   const noise=['truck','dock','setdown','wrap'].includes(kind),duration=kind==='truck'?.65:kind==='dock'?.45:kind==='wrap'?.4:.13,gain=c.createGain();gain.connect(this.master);gain.gain.setValueAtTime(.001,t);gain.gain.linearRampToValueAtTime(noise?.25:.16,t+.015);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
   let source;if(noise){const buffer=c.createBuffer(1,Math.ceil(c.sampleRate*duration),c.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(.3+.7*Math.exp(-i/(data.length*.2)));source=c.createBufferSource();source.buffer=buffer;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=kind==='truck'?700:kind==='wrap'?3200:1800;source.connect(filter);filter.connect(gain);}else{source=c.createOscillator();source.type=kind==='error'?'sawtooth':'sine';source.frequency.setValueAtTime(kind==='scan'?1300:kind==='error'?130:kind==='fee'?760:430,t);source.frequency.exponentialRampToValueAtTime(kind==='scan'?1800:kind==='error'?90:540,t+duration);source.connect(gain);}
   source.start(t);source.stop(t+duration+.01);source.onended=()=>{source.disconnect();gain.disconnect();};this.voices.push({source,end:t+duration});
  }
  suspend(){this.context?.suspend().catch(()=>{});}
  close(){this.context?.close().catch(()=>{});}
 }
 O.Audio=Audio;
})(window);
