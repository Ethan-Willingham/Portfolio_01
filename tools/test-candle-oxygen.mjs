// Spatial oxygen regression, including full sealed extinction and an open control.
process.env.PHASE=process.env.PHASE || 'candle';
await import('./test-oxygen-transport.mjs');
