'use strict';
const assert = require('node:assert/strict');
const {classifyUnityConsole} = require('./one-shift-unity-console.cjs');
const probe = {type:'warning', text:'WebGL: INVALID_ENUM: getInternalformatParameter: invalid internalformat'};
const device = {type:'log', text:'Creating OpenGL ES 3.0 graphics device'};
const state = {type:'log', text:'ONE_SHIFT_STATE {"frameCount":120}'};
const shader = name => ({type:'log', text:name + ' shader is not supported on this GPU (none of subshaders/fallbacks are suitable)'});
let checks = 0;
function test(label, callback) { callback(); checks++; console.log('PASS ' + label); }
function mustFail(message, before = [], after = []) {
  const report = classifyUnityConsole([...before, message, ...after]);
  assert.deepEqual(report.shaderFailures, [message]);
  assert.equal(report.startupProbeWarnings.length + report.unusedShaderWarnings.length, 0);
}

test('Exact warning is exempt only before graphics creation', () => {
  const report = classifyUnityConsole([probe,device,state]);
  assert.deepEqual(report.startupProbeWarnings,[probe]); assert.deepEqual(report.shaderFailures,[]);
});
test('The same warning after graphics creation fails', () => mustFail(probe,[device],[state]));
test('The same warning during gameplay fails', () => mustFail(probe,[device,state]));
test('A missing creation boundary does not exempt the probe', () => mustFail(probe,[],[state]));
test('An observed game state before a late creation log prevents exemption', () => mustFail(probe,[state],[device]));
test('An error-level probe is always a failure', () => mustFail({...probe,type:'error'},[],[device,state]));
test('Whitespace does not widen the exact probe exemption', () => mustFail({...probe,text:probe.text+' '},[],[device,state]));
test('Additional text does not widen the exact probe exemption', () => mustFail({...probe,text:probe.text+' while rendering'},[],[device,state]));
for (const name of ['Hidden/CoreSRP/CoreCopy','Hidden/Universal Render Pipeline/StencilDitherMaskSeed','Hidden/Universal/HDRDebugView']) {
  const message = shader(name);
  test(name + ' is exempt during startup discovery', () => {
    const report=classifyUnityConsole([device,message,state]);
    assert.deepEqual(report.unusedShaderWarnings,[message]); assert.deepEqual(report.shaderFailures,[]);
  });
  test(name + ' fails after the first observed state', () => mustFail(message,[device,state]));
}
test('Missing first-state boundary does not exempt a bundled shader', () => mustFail(shader('Hidden/CoreSRP/CoreCopy'),[device]));
test('Error-level bundled shader messages are never exempt', () => mustFail({...shader('Hidden/CoreSRP/CoreCopy'),type:'error'},[device],[state]));
test('Other unsupported shaders fail during startup', () => mustFail(shader('Warehouse/ActualSurface'),[device],[state]));
test('Bundled shader wording must remain exact', () => mustFail({...shader('Hidden/CoreSRP/CoreCopy'),text:shader('Hidden/CoreSRP/CoreCopy').text+' failed'},[device],[state]));
for (const text of ['WebGL context lost','CONTEXT_LOST_WEBGL','RuntimeError: unreachable','memory access out of bounds','WebGL: INVALID_OPERATION','WebGL: INVALID_VALUE','GL_INVALID_ENUM','shader compilation failed']) {
  test(text + ' remains a failure', () => mustFail({type:'warning',text},[],[device,state]));
}
test('Every console error remains a failure', () => mustFail({type:'error',text:'Unexpected player failure'},[],[device,state]));
test('Routine engine logs are retained without becoming failures', () => {
  assert.deepEqual(classifyUnityConsole([{type:'log',text:'Warehouse loaded'},device,state]).shaderFailures,[]);
});
console.log(checks + ' console classification checks passed.');
