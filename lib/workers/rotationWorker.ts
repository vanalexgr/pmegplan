/// <reference lib="webworker" />

import { optimiseRotation } from "@/lib/rotationOptimizer";
import type { Fenestration, StrutSegment } from "@/lib/types";

export interface RotationWorkerRequest {
  fenestrations: Fenestration[];
  segs: StrutSegment[];
  circ: number;
  wireRadius: number;
  stepMm?: number;
}

self.onmessage = (event: MessageEvent<RotationWorkerRequest>) => {
  const { fenestrations, segs, circ, wireRadius, stepMm } = event.data;
  const result = optimiseRotation(fenestrations, segs, circ, wireRadius, stepMm);
  self.postMessage(result);
};
