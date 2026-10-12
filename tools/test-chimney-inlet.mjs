// Real airflow and oxygen delivery, with no forced inlet-shutoff timer.
process.env.PHASE=process.env.PHASE || 'chimney';
await import('./test-oxygen-transport.mjs');
