import { parentPort, workerData } from 'node:worker_threads';
import { solve } from './solver.js';

try {
  const result = solve(workerData.dataset, workerData.options, (progress) => parentPort.postMessage({ type: 'progress', progress }));
  parentPort.postMessage({ type: 'result', result });
} catch (err) {
  parentPort.postMessage({ type: 'error', message: err.message, stack: err.stack });
}
