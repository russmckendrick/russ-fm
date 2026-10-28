/** Runs The Galaxy's force layout off the main thread (see galaxyWorkerClient.ts). */
import { layoutGalaxy, type ForceJob } from './galaxyForce';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<ForceJob>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = e => {
  const P = layoutGalaxy(e.data, done => scope.postMessage({ progress: done }));
  scope.postMessage({ positions: P }, [P.buffer]);
};
