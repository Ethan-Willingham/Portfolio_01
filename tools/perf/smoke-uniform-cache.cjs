// Exact setter-state proof, including signed zero, nonfinite values and fresh
// program locations. AFTER can select an unshipped source candidate.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');const root=path.resolve(__dirname,'../..');
const full=fs.readFileSync(process.env.AFTER||path.join(root,'js/sluice/190-smoke-webgl.js'),'utf8');
const source=full.slice(0,full.indexOf('  // ====== Smoke: WebGL fluid sim'));
const {execFileSync}=require('child_process');
const referenceFull=process.env.BEFORE?fs.readFileSync(process.env.BEFORE,'utf8'):execFileSync('git',['show',(process.env.BEFORE_REF||'4219c6f6c5e2bf86316d5e14ac156720f0184598')+':js/sluice/190-smoke-webgl.js'],{cwd:root,encoding:'utf8'});
const reference=referenceFull.slice(0,referenceFull.indexOf('  // ====== Smoke: WebGL fluid sim'));
function shaderSources(text){const names=Array.from(text.matchAll(/\bvar ([A-Z_]+) =/g),m=>m[1]),context=vm.createContext({});vm.runInContext(text.replace('      init: init,','      _shaders:{'+names.join(',')+'},\n      init: init,'),context);return JSON.parse(JSON.stringify(context.SmokeFluid._shaders));}
assert.deepEqual(shaderSources(source),shaderSources(reference),'All sixteen GLSL shader sources are unchanged');
assert.equal((source.match(/gl\.uniform(?:1i|1f|2f|3f)\(/g)||[]).length,4,'All active setters route through four cache helpers');assert(!/gl\.uniformMatrix|gl\.uniform[1234][fi]v\(/.test(source),'No unhandled matrix/vector-array setters');assert.equal((source.match(/gl\.linkProgram\(/g)||[]).length,1,'Linking occurs only in createProgram');assert(/function createProgram[^]*?var program = gl.createProgram\(\);[^]*?gl.linkProgram\(program\);/.test(source),'A link always uses a newly created program');
const ctx=vm.createContext({});vm.runInContext(source.replace('      init: init,','      _testUniform:function(fake){gl=fake;return {uniform1i,uniform1f,uniform2f,uniform3f};},\n      init: init,'),ctx);
let expected=new Map(),actual=new Map(),baselineCalls=0,cachedCalls=0;const fake={},f32bits=v=>{const a=new Float32Array([v]);return new Uint32Array(a.buffer)[0]};
for(const method of ['uniform1i','uniform1f','uniform2f','uniform3f'])fake[method]=(location,...values)=>{cachedCalls++;if(location!=null)actual.set(location,{method,bits:values.map(v=>method==='uniform1i'?v|0:f32bits(v))});};const api=ctx.SmokeFluid._testUniform(fake);
const values=[0,-0,1,-1,Math.PI,1+2**-30,1+2**-29,Infinity,-Infinity,NaN,new Float32Array(new Uint32Array([0x7fc00001]).buffer)[0],new Float32Array(new Uint32Array([0x7fc00002]).buffer)[0]];
let checks=0;for(let cycle=0;cycle<3;cycle++){const keys=Array.from({length:4},(_,program)=>({program,cycle}));for(const method of Object.keys(fake)){const n=+method[7];for(let r=0;r<3;r++)for(const x of values)for(const key of [...keys,null,undefined]){const lanes=[x,-x,x+1].slice(0,n);baselineCalls++;if(key!=null)expected.set(key,{method,bits:lanes.map(v=>method==='uniform1i'?v|0:f32bits(v))});api[method](key,...lanes);assert.deepEqual(actual.get(key),expected.get(key));checks++;}}}
const result={passed:true,checks,baselineCalls,cachedCalls,signedZeroAndNonfinitePreserved:true,newProgramLocationsIndependent:true,shaderSourcesIdentical:true};console.log(JSON.stringify(result));
