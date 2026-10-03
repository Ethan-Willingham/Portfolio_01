// CPU-only acceptance checks against the actual diagnostic and journal sources.
// No browser, GPU work or production mutations.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export function createLiveIssueFixture() {
  const recorder=fs.readFileSync(root+'/js/sluice/021-performance-recording.js','utf8');
  const fields=recorder.match(/var playPerfFields = (\[[\s\S]*?\]);/);
  assert(fields,'Actual recorder field declaration exists');
  let now=0, pendingGPU=[], counter=null;
  const context=vm.createContext({
    Float32Array,Math,Object,Array,Date,Map,Set,
    performance:{now:()=>now,timeOrigin:1000000},
    document:{hidden:false,hasFocus:()=>true},navigator:{userAgent:'Local issue VM'},
    location:{href:'local-test'},GAME_VERSION:'unit',
    window:{__sluicePerformance:{},__sluiceGPUTrace:{setActive:()=>{},drain:()=>pendingGPU.splice(0),status:()=>({supported:true,pending:0})}},
    playPerfFields:vm.runInNewContext(fields[1]),playPerfBucketLimit:96,playPerfChunkSize:1024,
    playPerfState:()=>({test:true}),playPerfKeys:[],playPerfActive:false,playPerfAuto:false,playPerfTrace:null,
    diagnosticOn:true,perfOverlayOn:()=>context.diagnosticOn,
    liquidWGPU:{setDiagnosticsActive:()=>{},getDiagnostics:()=>counter,getReadbackAge:()=>0},
    jelloBodies:[],keys:{},player:{x:1,y:2,vx:0,vy:0},cam:{x:0,y:0},
    surfaceSlimeGrip:null,bathMode:false,gamePaused:false,mobileLandscapeBlocked:false,
    introPhase:'done',liquidCount:0,snow:{active:0,grains:[],parked:[]},
    jelloRecordedOuterTicks:0,jelloRecordedMicrosteps:0,jelloContactsThisFrame:0,
    terrainChunkRebuildsThisFrame:0,perfBucketsRaw:{},setTimeout:()=>0
  });
  for(const name of ['022-live-performance.js','023-live-issues.js']) {
    const filename=root+'/js/sluice/'+name;
    assert(fs.existsSync(filename),'Diagnostic source is ready: '+filename);
    vm.runInContext(fs.readFileSync(filename,'utf8'),context,{filename:name});
  }
  function step({cpu=1,interval=1000/120,raw={},view=0,...state}={}) {
    now+=interval;Object.assign(context,state);context.perfBucketsRaw=raw;
    context.perfLiveBegin();context.perfLiveFrame(now,interval,cpu,view);
    return context.perfLiveSnapshot();
  }
  function advance(seconds) {for(let i=0;i<Math.ceil(seconds*120);i++)step();}
  return {context,step,advance,now:()=>now,
    setNow:value=>{now=value;},
    gpu:rows=>{pendingGPU.push(...rows);},counter:value=>{counter=value;}};
}

export function runLiveIssueChecks() {
  const fixture=createLiveIssueFixture(), c=fixture.context, names=[];
  function check(name, value) {assert(value,name);names.push(name);}
  function explain(frame,rows=[]) {return c.perfLiveExplainFrame(frame,rows);}
  function frame(id,cpu,interval,raw) {
    return {frameId:id,atMs:1000,intervalMs:interval,arrivalMs:interval,cpuMs:cpu,
      active:1,view:0,visible:1,paused:0,snowActive:1000,awakeResidents:3,microsteps:3,
      buckets:raw,phases:c.perfLivePhases(raw,cpu)};
  }
  function sample(id,options={}) {
    return {name:'liquid.frame',frameId:id,at:1000,ms:22,spanMs:24,partial:false,invalidTimestamp:false,
      passes:[{name:'snow.contacts',ms:18,emptyTimestamp:false},{name:'liquid.g2p',ms:4,emptyTimestamp:false}],...options};
  }
  const cpuFrame=frame(501,30,40,{'update.jello':22,'jello.substepsAll':21,'jello.internal':20,'render.total':5,'render.terrain':5});
  const cpu=explain(cpuFrame);
  check('Leading CPU diagnosis comes from disjoint phase',cpu.certainty==='CPU measured'&&/slime/i.test(cpu.title+' '+cpu.summary));
  check('Plain explanation provides finite evidence',typeof cpu.key==='string'&&Array.isArray(cpu.evidence)&&cpu.evidence.every(line=>typeof line==='string'&&!/NaN|Infinity/.test(line)));
  const lowCPU=frame(502,2,50,{'update.main':1,'render.terrain':1});
  check('Unmatched costly GPU cannot explain current gap',explain(lowCPU,[sample(501)]).certainty==='Cause unknown');
  fixture.setNow(80000);
  check('Stale latest GPU cannot explain a different current frame',explain(lowCPU,[sample(1,{at:0,ms:200})]).certainty==='Cause unknown');
  const matched=explain(lowCPU,[sample(502)]);
  check('Exact-frame costly GPU identifies sampled snow work',matched.certainty==='GPU sampled'&&/snow/i.test(matched.title+' '+matched.summary));
  check('Historic exact-frame sample remains valid for frozen event',explain(lowCPU,[sample(502,{at:1000})]).certainty==='GPU sampled');
  for(const [label,flags] of [['partial',{partial:true}],['invalid timestamp',{invalidTimestamp:true}],['invalid row',{invalid:true}],['non-finite total',{ms:Infinity}]])
    check('Reject '+label+' GPU diagnosis',explain(lowCPU,[sample(502,flags)]).certainty==='Cause unknown');
  const healthy=explain(frame(503,2,1000/120,{'update.main':1,'render.terrain':1}));
  check('Within-budget frame is not an issue',healthy.certainty==='Within budget');
  const crowded=Object.assign({},lowCPU,{snowActive:1000000,awakeResidents:200,microsteps:1000});
  check('Large particle counts do not invent a measured cause',explain(crowded).certainty==='Cause unknown');
  c.perfLive.latestGPU={'liquid.frame':sample(1,{at:0,ms:200})};
  const liveStats={cpu:2,phases:lowCPU.phases,fps:20,frames:60};
  check('Stale GPU cannot label the live window',c.perfLiveLiveDiagnosis(liveStats).certainty==='Cause unknown');
  c.perfLive.latestGPU={'liquid.frame':sample(1,{at:fixture.now(),ms:40})};
  const liveGPU=c.perfLiveLiveDiagnosis(liveStats);
  check('Recent unmatched GPU is labeled as a separate latest sample',liveGPU.certainty==='GPU sampled'&&liveGPU.summary.startsWith('Latest GPU sample:'));
  c.perfLive.latestGPU={'liquid.frame':sample(1,{at:fixture.now()+1000,ms:40})};
  check('Future-dated GPU cannot label the live window',c.perfLiveLiveDiagnosis(liveStats).certainty==='Cause unknown');
  check('No active frames shows a waiting diagnosis',c.perfLiveLiveDiagnosis({...liveStats,frames:0}).title==='Waiting for play');

  const loading=createLiveIssueFixture(),l=loading.context;
  l.introPhase='warmup';loading.advance(3);
  check('Loading time does not consume active journal grace',l.perfLive.activeMs===0&&l.perfLive.issueReadyAt===null);
  l.introPhase='done';const firstPlay=loading.step({cpu:80,raw:{'update.jello':70}});
  check('Expensive first gameplay frame after long loading is excluded',l.perfLiveIssueList().length===0);
  loading.advance(0.8);l.gamePaused=true;loading.advance(3);l.gamePaused=false;
  l.document.hidden=true;loading.advance(3);l.document.hidden=false;
  loading.step({cpu:80,raw:{'update.jello':70}});
  check('Pause and hidden intervals do not consume remaining active grace',l.perfLive.issueReadyAt===null&&l.perfLiveIssueList().length===0);
  loading.advance(1.3);loading.step({cpu:80,raw:{'update.jello':70}});
  check('Journal starts after two accumulated active seconds',l.perfLive.issueReadyAt!==null&&l.perfLiveIssueList().some(issue=>issue.id==='cpu-slimes'));
  const bootIssueCount=l.perfLiveIssueList().length;
  loading.gpu([sample(firstPlay.frameId,{at:firstPlay.atMs,ms:100,passes:[{name:'snow.contacts',ms:100}]})]);l.perfLiveGPUCollect();
  check('Late GPU from a loading-grace frame stays excluded',l.perfLiveIssueList().length===bootIssueCount&&!l.perfLiveIssueList().some(issue=>issue.id==='gpu-snow'));

  const pacing=createLiveIssueFixture(),p=pacing.context;
  pacing.advance(3);p.perfLiveClearIssues();
  const expensive=pacing.step({cpu:60,raw:{'update.jello':55}});
  pacing.step({cpu:1,interval:180,raw:{'update.main':0.5}});
  const gapIssue=p.perfLiveIssueList()[0],gapEvent=gapIssue.event;
  check('Gap journal preserves preceding measured CPU frame',gapEvent.kind==='gap'&&gapEvent.previous.frameId===expensive.frameId&&gapEvent.previous.cpuMs===60&&gapEvent.current.cpuMs===1);
  check('Gap diagnosis attributes preceding slime work',gapIssue.id==='cpu-slimes'&&gapIssue.certainty==='CPU measured'&&gapIssue.summary.includes('60.0'));
  check('CPU stall and its following gap count as one occurrence',gapIssue.occurrences===1&&gapIssue.severity===180);
  check('Gap baseline excludes preceding expensive frame',gapEvent.reference.cpuMs===1);

  const gpuHistory=createLiveIssueFixture(),g=gpuHistory.context;
  gpuHistory.advance(75);g.perfLiveClearIssues();
  const gpuFrame=gpuHistory.step({cpu:1,raw:{'update.main':1}});
  gpuHistory.step();
  const found=g.perfLiveFrameIndex(gpuFrame.frameId);
  check('Late GPU lookup finds exact frame after circular buffer wrap',found&&g.perfLiveRow(found.index).frameId===gpuFrame.frameId);
  check('Late GPU lookup rejects frame evicted by time',g.perfLiveFrameIndex(10)===null);
  const gpuRow=sample(gpuFrame.frameId,{at:gpuFrame.atMs,ms:60,passes:[{name:'snow.contacts',ms:55},{name:'liquid.g2p',ms:5}]});
  gpuHistory.gpu([gpuRow]);g.perfLiveGPUCollect();
  const gpuIssue=g.perfLiveIssueList().find(issue=>issue.id==='gpu-snow');
  check('Late exact GPU sample creates measured journal issue',gpuIssue?.kind==='gpu'&&gpuIssue.severity===60&&gpuIssue.event.current.frameId===gpuFrame.frameId&&gpuIssue.certainty==='GPU sampled');
  g.perfLiveSelectIssue(gpuIssue.id);
  const frozenGPU=g.perfLiveGetSelectedIssue();
  const laterFrame=gpuHistory.step({cpu:1});gpuHistory.step();
  gpuHistory.gpu([sample(laterFrame.frameId,{at:laterFrame.atMs,ms:90,passes:[{name:'snow.contacts',ms:85},{name:'liquid.g2p',ms:5}]})]);g.perfLiveGPUCollect();
  check('New costly GPU sample does not move selected GPU event',g.perfLiveGetSelectedIssue().event.frameId===frozenGPU.event.frameId&&g.perfLiveIssueList().find(issue=>issue.id==='gpu-snow').severity===90);
  gpuHistory.gpu([sample(gpuFrame.frameId,{name:'smoke.frame',at:gpuFrame.atMs,ms:40,passes:[{name:'smoke.simulate',ms:40}]})]);g.perfLiveGPUCollect();
  const augmented=g.perfLiveGetSelectedIssue();
  check('Exact late GPU evidence augments selected event without moving context',augmented.event.frameId===frozenGPU.event.frameId&&augmented.event.current.frameId===gpuFrame.frameId&&augmented.event.gpu.some(row=>row.name==='smoke.frame'));
  const retainedCount=g.perfLiveIssueList().length;
  gpuHistory.gpu([sample(10,{at:0,ms:500})]);g.perfLiveGPUCollect();
  check('Unmatched evicted GPU sample does not create journal cause',g.perfLiveIssueList().length===retainedCount);

  const typed=createLiveIssueFixture(),t=typed.context;
  typed.advance(3);t.perfLiveClearIssues();
  const costlyCPU=typed.step({cpu:12,raw:{'update.jello':12}});typed.step();
  typed.gpu([sample(costlyCPU.frameId,{at:costlyCPU.atMs,ms:60,passes:[{name:'snow.contacts',ms:60}]})]);t.perfLiveGPUCollect();
  const typedGPU=t.perfLiveIssueList().find(issue=>issue.id==='gpu-snow');
  t.perfLiveSelectIssue(typedGPU.id);
  const typedBefore=t.perfLiveGetSelectedIssue(),gpuDiagnosis=t.perfLiveExplainIssue(typedBefore.event);
  check('GPU issue retains its specific sampled source',typedBefore.event.sourceGPU==='liquid.frame');
  check('GPU issue inspection retains sampled snow cause with costly CPU',gpuDiagnosis.certainty==='GPU sampled'&&/snow/i.test(gpuDiagnosis.title)&&gpuDiagnosis.summary.includes('60.0'));
  typed.gpu([sample(costlyCPU.frameId,{name:'smoke.frame',at:costlyCPU.atMs,ms:80,passes:[{name:'render.particles',ms:80}]})]);t.perfLiveGPUCollect();
  const typedAfter=t.perfLiveGetSelectedIssue(),stillSnow=t.perfLiveExplainIssue(typedAfter.event);
  check('Later more costly drawing encoder does not relabel selected snow issue',typedAfter.event.frameId===typedBefore.event.frameId&&typedAfter.event.sourceGPU==='liquid.frame'&&stillSnow.certainty==='GPU sampled'&&/snow/i.test(stillSnow.title)&&stillSnow.summary.includes('60.0'));

  const mixed=createLiveIssueFixture(),m=mixed.context;
  mixed.advance(3);m.perfLiveClearIssues();
  const cpu500=mixed.step({cpu:500,raw:{'update.jello':500}});
  mixed.step({cpu:1,interval:500});
  mixed.gpu([sample(cpu500.frameId,{at:cpu500.atMs,ms:9,passes:[{name:'snow.contacts',ms:9}]})]);m.perfLiveGPUCollect();
  check('Large CPU and gap do not inflate a nine millisecond GPU sample to a major issue',!m.perfLiveIssueList().some(issue=>issue.id.startsWith('gpu-')));
  mixed.gpu([sample(cpu500.frameId,{at:cpu500.atMs,ms:30,passes:[{name:'snow.contacts',ms:30}]})]);m.perfLiveGPUCollect();
  const gpu30=m.perfLiveIssueList().find(issue=>issue.id==='gpu-snow');
  check('Thirty millisecond GPU issue keeps measured GPU severity beside costly CPU',gpu30?.severity===30&&gpu30.event.current.cpuMs===500);
  check('GPU issue retains large gap as context without inflating its badge',gpu30.event.gapMs===500&&gpu30.event.severity===30);

  // Use real recording callbacks, not a copied journal implementation.
  const history=createLiveIssueFixture(), h=history.context;
  history.advance(3);
  h.perfLiveClearIssues();
  history.step({cpu:80,raw:{'update.jello':70}});
  const first=h.perfLiveIssueList();
  check('Major measured slowdown creates journal category',first.length===1&&first[0].major&&first[0].severity>=80&&first[0].occurrences===1);
  const id=first[0].id,worstFrame=first[0].event.current.frameId;
  h.perfLiveSelectIssue(id);
  const inspected=h.perfLiveGetSelectedIssue();
  check('Selecting issue freezes its captured event',h.perfLive.selectedIssue===id&&inspected?.event.current.frameId===worstFrame);
  history.advance(35);
  check('Journal outlives rolling history',h.perfLiveIssueList().some(issue=>issue.id===id&&issue.event.current.frameId===worstFrame));
  check('Selected inspector survives recovery beyond thirty seconds',h.perfLiveGetSelectedIssue()?.event.current.frameId===worstFrame);
  h.diagnosticOn=false;h.perfLiveBegin();h.diagnosticOn=true;h.perfLiveBegin();
  check('Journal survives developer mode toggles',h.perfLiveIssueList().some(issue=>issue.id===id));
  check('Frozen selection survives developer mode toggles',h.perfLive.selectedIssue===id&&h.perfLiveGetSelectedIssue()?.event.current.frameId===worstFrame);
  history.advance(2.1);
  history.step({cpu:50,raw:{'update.jello':40}});
  const repeated=h.perfLiveIssueList().find(issue=>issue.id===id);
  check('Repeated category increments count and keeps worse event',repeated?.occurrences>=2&&repeated.event.current.frameId===worstFrame&&repeated.severity>=80);
  history.step({cpu:120,raw:{'update.jello':110}});
  const replaced=h.perfLiveIssueList().find(issue=>issue.id===id);
  check('New worse category event replaces retained worst',replaced?.severity>=120&&replaced.event.current.frameId!==worstFrame);
  check('New worse same-category event does not move frozen inspector',h.perfLiveGetSelectedIssue()?.event.current.frameId===worstFrame);
  history.step({cpu:100,raw:{'snow.cpu':90,'update.rain':90}});
  check('Different issue does not change selection',h.perfLive.selectedIssue===id&&h.perfLiveGetSelectedIssue()?.event.current.frameId===worstFrame);
  check('Issue ordering is descending by severity',h.perfLiveIssueList().every((issue,i,list)=>!i||list[i-1].severity>=issue.severity));
  const before=JSON.stringify(h.perfLiveIssueList()).length;
  for(let i=0;i<500;i++)history.step({cpu:90,raw:{'update.jello':80}});
  const many=h.perfLiveIssueList();
  check('Repeated occurrences consume bounded grouped storage',many.length<=16&&JSON.stringify(many).length<before*2+4096&&many.every(issue=>Number.isFinite(issue.occurrences)&&Number.isFinite(issue.severity)));
  for(const phase of Array.from(h.perfLivePhaseNames))history.step({cpu:90,raw:{[phase]:80}});
  check('Many phase names still use at most sixteen known categories',h.perfLiveIssueList().length<=16);
  history.advance(35);
  const capture=h.perfLiveCapture();
  check('Rolling export retains issues older than frame history',capture.issues.some(issue=>issue.id===id&&issue.outsideHistory&&issue.atMs<0));
  check('Export includes frozen selected historical issue',capture.selectedIssue?.id===id&&capture.selectedIssue.outsideHistory);
  h.perfLiveSelectIssue(null);
  check('Back returns to live without erasing issues',h.perfLive.selectedIssue===null&&h.perfLiveIssueList().length>0);
  h.perfLiveClearIssues();
  check('Explicit clear removes journal and selection',h.perfLiveIssueList().length===0&&h.perfLive.selectedIssue===null&&h.perfLiveGetSelectedIssue()===null);
  return {passed:true,checks:names.length,checkNames:names,browserLaunched:false,GPUWork:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  console.log(JSON.stringify(runLiveIssueChecks()));
