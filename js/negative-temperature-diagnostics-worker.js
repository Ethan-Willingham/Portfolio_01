import { measure } from './negative-temperature-model.js?v=3';

self.onmessage = ({ data: { field, parameters, time } }) => {
  try {
    self.postMessage({ diagnostics: measure(field, parameters, time) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
