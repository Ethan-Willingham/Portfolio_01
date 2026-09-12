import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const original=execFileSync('git',['show',(process.env.BASE_REF||'6e974eb')+':js/sluice/150-render-nightsky.js'],{cwd:root,encoding:'utf8'});
const oldShader=original.slice(original.indexOf('  var SKY_GL_FS ='),original.indexOf('  function compileSkyGLShader'));
assert(oldShader.startsWith('  var SKY_GL_FS ='));
const probe=String.raw`
window.__skyQA={ready:function(){return introPhase==='done';},run:function(){
  gamePaused=true;if(gameRafId)cancelAnimationFrame(gameRafId);gameRafId=0;
  canvas.width=800;canvas.height=450;
  var oldText=(function(){${oldShader};return SKY_GL_FS;})();
  var gl=initSkyGL(),oldProgram=gl.createProgram();
  gl.attachShader(oldProgram,compileSkyGLShader(gl,gl.VERTEX_SHADER,SKY_GL_VS));
  gl.attachShader(oldProgram,compileSkyGLShader(gl,gl.FRAGMENT_SHADER,oldText));
  gl.bindAttribLocation(oldProgram,0,'aPos');gl.linkProgram(oldProgram);
  if(!gl.getProgramParameter(oldProgram,gl.LINK_STATUS))throw Error('Reference shader failed');
  var rows=[];
  for(var phase=0;phase<2;phase++)for(var i=0;i<=16;i++){
    moonPhase=phase*.5;timeOfDay=i/16;skyGLLastKey='';renderSkyGL(800,450,360);
    var w=skyGLCanvas.width,h=skyGLCanvas.height,actual=new Uint8Array(w*h*4),expected=new Uint8Array(w*h*4);
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,actual);
    gl.useProgram(oldProgram);
    for(var u=0;u<gl.getProgramParameter(skyGLProgram,gl.ACTIVE_UNIFORMS);u++){
      var info=gl.getActiveUniform(skyGLProgram,u),value=gl.getUniform(skyGLProgram,gl.getUniformLocation(skyGLProgram,info.name)),where=gl.getUniformLocation(oldProgram,info.name);
      if(info.type===gl.FLOAT)gl.uniform1f(where,value);
      else if(info.type===gl.FLOAT_VEC2)gl.uniform2fv(where,value);
      else if(info.type===gl.FLOAT_VEC3)gl.uniform3fv(where,value);
      else throw Error('Unexpected shader uniform');
    }
    gl.clear(gl.COLOR_BUFFER_BIT);bindFullscreenQuad(gl);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,expected);
    var max=0,changed=0;for(var p=0;p<actual.length;p++){var d=Math.abs(actual[p]-expected[p]);max=Math.max(max,d);if(d)changed++;}
    rows.push({time:timeOfDay,moon:moonPhase,max:max,changed:changed});
  }
  skyGLLastKey='';renderSkyGL(800,450,450);
  var calls=0,draw=gl.drawArrays;gl.drawArrays=function(){calls++;return draw.apply(this,arguments);};
  for(var i=0;i<200;i++){cam.y-=1.23;renderSkyGL(800,450,450);}
  var altitudeCalls=calls;renderSkyGL(800,450,449);timeOfDay+=.01;renderSkyGL(800,450,449);
  gl.drawArrays=draw;
  return {rows:rows,altitudeCalls:altitudeCalls,changedInputCalls:calls,error:gl.getError()};
}};`;
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}let data=fs.readFileSync(file);if(file.endsWith(path.sep+'sluice.js')){let s=data.toString(),i=s.lastIndexOf('})();');data=s.slice(0,i)+probe+s.slice(i);}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-webgpu','--use-angle=d3d11']});
try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/grand-motherload.html?nosave=1&nopause=1');
  await page.waitForFunction(()=>window.__skyQA?.ready(),undefined,{timeout:60000});
  const result=await page.evaluate(()=>__skyQA.run());
  assert.equal(result.error,0);assert.equal(result.altitudeCalls,0);assert.equal(result.changedInputCalls,2);
  assert(result.rows.every(r=>r.max<=1),'Shader pixels stay within one 8-bit level');
  console.log('PASS 34 sky shader comparisons and altitude/input cache invalidation '+JSON.stringify(result));
}finally{await browser.close();server.close();}
