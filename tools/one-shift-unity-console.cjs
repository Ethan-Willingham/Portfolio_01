'use strict';

// Unity probes format support before creating the graphics device. These exact
// startup warnings, and three unused bundled shaders discovered before the
// first observed game state, are retained but do not indicate a render failure.
// Missing boundaries never grant an exemption.
const formatProbe = 'WebGL: INVALID_ENUM: getInternalformatParameter: invalid internalformat';
const unusedShaders = [
  'Hidden/CoreSRP/CoreCopy',
  'Hidden/Universal Render Pipeline/StencilDitherMaskSeed',
  'Hidden/Universal/HDRDebugView'
];
const failurePattern = /shader.*(?:error|failed|unsupported|not supported)|INVALID_(?:OPERATION|ENUM|VALUE)|GL_INVALID|RuntimeError|memory access out of bounds|WebGL context lost|CONTEXT_LOST_WEBGL/i;

function classifyUnityConsole(messages, statePrefix = 'ONE_SHIFT_STATE ') {
  const deviceCreatedIndex = messages.findIndex(message => message.text.includes('Creating OpenGL ES 3.0 graphics device'));
  const firstStateIndex = messages.findIndex(message => message.text.includes(statePrefix));
  const startupProbeWarnings = [], unusedShaderWarnings = [], shaderFailures = [];
  messages.forEach((message, index) => {
    if (deviceCreatedIndex >= 0 && index < deviceCreatedIndex &&
        (firstStateIndex < 0 || index < firstStateIndex) &&
        message.type === 'warning' && message.text === formatProbe) {
      startupProbeWarnings.push(message);
    } else if (firstStateIndex >= 0 && index < firstStateIndex && message.type === 'log' &&
        unusedShaders.some(name => message.text.trim() === name + ' shader is not supported on this GPU (none of subshaders/fallbacks are suitable)')) {
      unusedShaderWarnings.push(message);
    } else if (message.type === 'error' || failurePattern.test(message.text)) {
      shaderFailures.push(message);
    }
  });
  return {deviceCreatedIndex, firstStateIndex, startupProbeWarnings, unusedShaderWarnings, shaderFailures};
}

module.exports = {classifyUnityConsole};
