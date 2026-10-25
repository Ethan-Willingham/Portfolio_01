/* Gunfire, hull contact and sea strikes must be distinct and bounded. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-combat-audio');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true});try{
  const p=await browser.newPage();await p.setContent('<p>Combat mix check</p>');await p.addScriptTag({path:path.resolve(__dirname,'../../js/widewake-audio.js')});
  const renders=await p.evaluate(async()=>{
    async function render(kind){const rate=48000,ctx=new OfflineAudioContext(2,rate*6,rate),settings={sound:kind!=='muted',volume:.35,effects:kind==='effects-muted'?0:.7,music:0,ambience:0},a=new WidewakeAudio({context:ctx,settings:()=>settings});
      if(kind==='sequence')for(const [cue,at,pan]of [['gun',.15,-.4],['guard',.75,.4],['hostile',1.3,.1],['metal-hit',1.85,-.3],['water-hit',2.4,.3],['flak',3.0,-.2],['mortar',3.6,.2],['mortar-hit',4.5,0]])a.combat(cue,{at,pan});
      else if(kind==='dense')for(let n=0;n<1200;n++)a.combat(['gun','guard','metal-hit','water-hit','flak','mortar-hit'][n%6],{at:.2,pan:n%2?.4:-.4});
      else a.combat(kind==='muted'||kind==='effects-muted'?'gun':kind,{at:.2});
      const b=await ctx.startRendering();await new Promise(r=>setTimeout(r,0));let peak=0,energy=0,difference=0;
      for(let i=0;i<b.length;i++){const x=b.getChannelData(0)[i],y=b.getChannelData(1)[i];if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Nonfinite mix');peak=Math.max(peak,Math.abs(x),Math.abs(y));energy+=x*x+y*y;if(i)difference=Math.max(difference,Math.abs(x-b.getChannelData(0)[i-1]));}
      let wav;if(kind==='sequence'){const buffer=new ArrayBuffer(44+b.length*4),v=new DataView(buffer),str=(i,s)=>{for(let k=0;k<s.length;k++)v.setUint8(i+k,s.charCodeAt(k));};str(0,'RIFF');v.setUint32(4,buffer.byteLength-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,b.length*4,true);for(let i=0;i<b.length;i++)for(let c=0;c<2;c++)v.setInt16(44+i*4+c*2,b.getChannelData(c)[i]*32767,true);let text='';const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));wav=btoa(text);}
      return{kind,peak,energy,difference,voices:a.stats.peakVoices,remaining:a.voices.size,skipped:a.stats.skipped,wav};
    }
    const list=[];for(const kind of ['gun','guard','metal-hit','water-hit','sequence','dense','muted','effects-muted'])list.push(await render(kind));return list;
  });
  for(const r of renders){if(r.wav){fs.writeFileSync(path.join(out,'gun-hull-water-sequence.wav'),Buffer.from(r.wav,'base64'));delete r.wav;}assert.ok(r.peak<.92,r.kind+' clips');assert.ok(r.voices<=64);assert.equal(r.remaining,0);if(r.kind.includes('muted'))assert.equal(r.energy,0);else assert.ok(r.energy>0,r.kind+' has no sound');}
  assert.notEqual(renders[2].energy,renders[3].energy);assert.ok(renders.find(r=>r.kind==='dense').skipped>1100);
  console.log('PASS gun/hull/water cues, distinct sound, unclipped mix, muted silence, polyphony limits and cleanup');console.log(JSON.stringify(renders));console.log(out);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
