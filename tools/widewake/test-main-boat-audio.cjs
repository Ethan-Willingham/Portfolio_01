/* Current Reach motor: offline listening renders and real audio lifecycle checks. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright');
const out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-main-boat-audio');fs.mkdirSync(out,{recursive:true});
let browser;
(async()=>{try{
  browser=await chromium.launch({headless:true,...(process.env.WIDEWAKE_TEST_BROWSER?{executablePath:process.env.WIDEWAKE_TEST_BROWSER}:{})});
  const page=await browser.newPage();await page.setContent('<button id="start">Start audio</button>');await page.addScriptTag({path:path.resolve(__dirname,'../../js/widewake-audio.js')});
  const renders=await page.evaluate(async()=>{
    async function render(kind){
      const rate=48000,duration=13,ctx=new OfflineAudioContext(2,rate*duration,rate),settings={sound:kind!=='muted',volume:.35,effects:kind==='effects-muted'?0:.65,ambience:0,music:0};
      let sources=0;const create=ctx.createBufferSource.bind(ctx);ctx.createBufferSource=()=>{sources++;return create();};
      const a=new WidewakeAudio({context:ctx,settings:()=>settings});const allocated=sources,states=[];
      for(let i=0;i<duration*10;i++){
        const time=i/10,throttle=time<2?0:time<4?(time-2)/2:time<8?1:0,speed=time<3?0:time<6?(time-3)/3:time<8?1:time<11?1-(time-8)/3:0;
        const scene={mode:kind==='port'?'port':'sea',paused:kind==='paused',throttle,speed,load:time>=6&&time<8?1:0,hull:kind==='heavy'?'flagship':'launch'};
        a.updateMotor(scene,time,.1);if(i%10===0)states.push({...a.motorState,time});
      }
      const output=await ctx.startRendering(),left=output.getChannelData(0),right=output.getChannelData(1);let peak=0,sum=0,largestStep=0;
      for(let i=0;i<left.length;i++){if(!Number.isFinite(left[i])||!Number.isFinite(right[i]))throw Error('non-finite motor output');peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));sum+=left[i]*left[i]+right[i]*right[i];if(i)largestStep=Math.max(largestStep,Math.abs(left[i]-left[i-1]));}
      const rms=(start,end)=>{let energy=0;for(let i=start*rate;i<end*rate;i++)energy+=left[i]**2;return Math.sqrt(energy/((end-start)*rate));};
      const energies={idle:rms(1,2),acceleration:rms(4,5),cruise:rms(5,6),loaded:rms(7,8),coast:rms(10,11)};
      let wav;if(kind==='launch'||kind==='heavy'){
        const bytes=new ArrayBuffer(44+output.length*4),v=new DataView(bytes),str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
        str(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,output.length*4,true);
        for(let i=0;i<output.length;i++){v.setInt16(44+i*4,left[i]*32767,true);v.setInt16(46+i*4,right[i]*32767,true);}const raw=new Uint8Array(bytes);let text='';for(let i=0;i<raw.length;i+=8192)text+=String.fromCharCode(...raw.subarray(i,i+8192));wav=btoa(text);
      }
      return{kind,peak,rms:Math.sqrt(sum/(left.length*2)),largestStep,energies,states,sources,allocated,voices:a.voices.size,motorSamples:a.motorBuffer.length,wav};
    }
    const results=[];for(const kind of ['launch','heavy','muted','effects-muted','paused','port'])results.push(await render(kind));return results;
  });
  for(const render of renders){
    if(render.wav){fs.writeFileSync(path.join(out,render.kind+'-idle-accelerate-load-coast.wav'),Buffer.from(render.wav,'base64'));delete render.wav;}
    assert.ok(render.peak<.92,render.kind+' clips');assert.ok(render.largestStep<.02,render.kind+' has a discontinuity');assert.equal(render.sources,render.allocated,'motor updates allocate sources');assert.equal(render.voices,0,'engine uses action voice pool');assert.ok(render.motorSamples<70000,'motor buffer exceeds fixed size');
    if(['muted','effects-muted','paused','port'].includes(render.kind))assert.equal(render.peak,0,render.kind+' leaks motor sound');
    else{assert.ok(render.energies.idle>.0005,'idle is inaudible');assert.ok(render.energies.loaded>render.energies.idle*1.5,'throttle and load do not change body');assert.ok(render.energies.coast<render.energies.loaded*.7,'coasting does not relax');assert.ok(render.states[4].rpm>render.states[1].rpm*1.6,'engine does not respond before hull reaches speed');}
  }
  assert.ok(renders[1].states[7].rpm<renders[0].states[7].rpm,'heavy hull should have a slower engine character');
  console.log('PASS seamless finite launch and heavy-hull renders, responsive revs, load, coasting, muted/paused/harbor silence and fixed source allocation');
  const cues=await page.evaluate(async()=>{
    const ctx=new OfflineAudioContext(2,48000*8,48000),a=new WidewakeAudio({context:ctx,settings:()=>({sound:true,volume:.5,effects:1,music:0,ambience:.5})});
    a.update({mode:'sea',speed:1,throttle:1,load:1,hull:'launch'});
    for(let i=0;i<12;i++)a.play(['burst','flak-shot','mortar-hit','splash','impact','sink'][i%6],{at:.3+i*.3});
    const output=await ctx.startRendering();await new Promise(resolve=>setTimeout(resolve,0));let peak=0;for(const sample of output.getChannelData(0)){if(!Number.isFinite(sample))throw Error('non-finite combat mix');peak=Math.max(peak,Math.abs(sample));}return{peak,peakVoices:a.stats.peakVoices,voices:a.voices.size};
  });assert.ok(cues.peak<.92,'combat and motor mix clips');assert.ok(cues.peakVoices<=64);assert.equal(cues.voices,0);console.log('PASS motor and combat cues share a bounded mix and clean up ended action voices');
  await page.evaluate(()=>{window.audioActive=true;document.querySelector('#start').onclick=()=>{window.motor=new WidewakeAudio({active:()=>audioActive,settings:()=>({sound:true,volume:.2,effects:.65,music:0,ambience:0})});motor.wake();motor.update({mode:'sea',speed:.7,throttle:1,load:.4,hull:'launch'});};});await page.click('#start');await page.waitForFunction(()=>motor.ctx.state==='running');
  await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>motor.engineGain.gain.value>.02),'the launch engine is silent');
  const state=await page.evaluate(async()=>{motor.suspend();while(motor.ctx.state!=='suspended')await new Promise(r=>setTimeout(r,10));const time=motor.ctx.currentTime,voices=motor.voices.size;window.audioActive=false;motor.wake();motor.update({mode:'sea',speed:1,throttle:1});await new Promise(r=>setTimeout(r,100));return{time,after:motor.ctx.currentTime,state:motor.ctx.state,voices,before:voices,afterVoices:motor.voices.size};});assert.equal(state.time,state.after,'suspended motor keeps advancing');assert.equal(state.state,'suspended');assert.equal(state.afterVoices,state.voices);
  await page.evaluate(()=>{window.audioActive=true;motor.wake();});await page.waitForFunction(()=>motor.ctx.state==='running');
  await page.evaluate(()=>motor.update({mode:'port',speed:0,paused:false}));await page.waitForTimeout(1000);assert.ok(await page.evaluate(()=>motor.engineGain.gain.value<.0001),'harbor transition retains the engine');
  const disposal=await page.evaluate(async()=>{await motor.dispose();return{state:motor.ctx.state};});assert.equal(disposal.state,'closed');
  console.log('PASS launch engine starts from a gesture, suspends without background work, resumes and fades at the harbor, and disposes');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(renders,null,2));console.log('Motor listening samples and report: '+out);
}finally{await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
