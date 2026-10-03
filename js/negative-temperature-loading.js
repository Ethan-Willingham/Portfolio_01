// Bound browser/GPU promises that can otherwise leave initialization waiting forever.
export function withDeadline(operation, milliseconds, message) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}
