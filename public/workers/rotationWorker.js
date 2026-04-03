/**
 * rotationWorker.ts  —  PMEGplan.io
 *
 * Web Worker that runs the full-circumference rotation scan off the main thread.
 * This prevents the UI from freezing during analysis of 4 devices (each ~800 steps).
 *
 * USAGE (in rotationOptimizer.ts or analysis.ts):
 *
 *   // Create worker (Next.js 14 App Router — put file in /public/workers/)
 *   const worker = new Worker(new URL('/workers/rotationWorker.js', window.location.origin));
 *
 *   worker.postMessage({ fens, segs, circ, wireRadius, stepMm: 0.1 });
 *
 *   worker.onmessage = (e) => {
 *     const result: RotationResult = e.data;
 *     resolve(result);
 *   };
 *
 * HOW TO DEPLOY:
 *   1. Compile this file separately (tsc --outDir public/workers rotationWorker.ts)
 *      OR copy the JS output to public/workers/rotationWorker.js
 *   2. In next.config.ts add: { webpack: (config) => { config.output.workerPublicPath = "/_next/"; return config; } }
 *   3. The worker runs in a browser context — no Next.js imports.
 *
 * ALTERNATIVE (simpler — no build step):
 *   Inline the worker logic as a Blob URL using createObjectURL.
 *   See lib/rotationOptimizer.ts for the Blob approach.
 */
// ── Core geometry (no imports) ─────────────────────────────────────────────────
function clockToArc(clock, circ) {
    const [h, m] = clock.split(":").map(Number);
    return (((h % 12) * 60 + m) / 720) * circ;
}
function wrapDist(delta, circ) {
    const d = Math.abs(delta % circ);
    return Math.min(d, circ - d);
}
function ptSegDist(px, py, ax, ay, bx, by, circ) {
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    if (L2 === 0)
        return Math.hypot(wrapDist(px - ax, circ), py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
    return Math.hypot(wrapDist(px - (ax + t * dx), circ), py - (ay + t * dy));
}
function minDistToStruts(cx, cy, segs, circ) {
    let min = Infinity;
    for (const [ax, ay, bx, by] of segs) {
        const d = ptSegDist(cx, cy, ax, ay, bx, by, circ);
        if (d < min)
            min = d;
    }
    return min;
}
// ── Worker message handler ─────────────────────────────────────────────────────
self.onmessage = (e) => {
    const { fens, segs, circ, wireRadius, stepMm = 0.1 } = e.data;
    const roundFens = fens.filter(f => f.ftype !== "SCALLOP");
    const thresholds = roundFens.map(f => Math.max(f.widthMm, f.heightMm) / 2 + wireRadius);
    const scanData = [];
    let bestMinDist = -1;
    let optimalDelta = 0;
    let bestCompromise = -1;
    let bestCompDelta = 0;
    const steps = Math.ceil(circ / stepMm);
    for (let i = 0; i < steps; i++) {
        const delta = i * stepMm;
        const distPerFen = roundFens.map(f => {
            const cx = (clockToArc(f.clock, circ) + delta) % circ;
            return minDistToStruts(cx, f.depthMm, segs, circ);
        });
        const allClear = distPerFen.every((d, j) => d >= thresholds[j]);
        const minDist = distPerFen.length > 0 ? Math.min(...distPerFen) : Infinity;
        scanData.push({ deltaMm: delta, deltaDeg: (delta / circ) * 360, distPerFen, allClear });
        if (allClear && minDist > bestMinDist) {
            bestMinDist = minDist;
            optimalDelta = delta;
        }
        if (minDist > bestCompromise) {
            bestCompromise = minDist;
            bestCompDelta = delta;
        }
    }
    // Detect contiguous valid windows
    const validWindows = [];
    let inW = false;
    let winStart = 0;
    for (const pt of scanData) {
        if (pt.allClear && !inW) {
            inW = true;
            winStart = pt.deltaMm;
        }
        else if (!pt.allClear && inW) {
            inW = false;
            validWindows.push({ startMm: winStart, endMm: pt.deltaMm - stepMm, startDeg: (winStart / circ) * 360, endDeg: ((pt.deltaMm - stepMm) / circ) * 360 });
        }
    }
    if (inW) {
        const last = scanData[scanData.length - 1].deltaMm;
        validWindows.push({ startMm: winStart, endMm: last, startDeg: (winStart / circ) * 360, endDeg: (last / circ) * 360 });
    }
    const result = {
        optimalDeltaMm: bestMinDist > 0 ? optimalDelta : bestCompDelta,
        optimalDeltaDeg: ((bestMinDist > 0 ? optimalDelta : bestCompDelta) / circ) * 360,
        validWindows,
        hasConflictFreeRotation: bestMinDist > 0,
        bestCompromiseMm: bestCompDelta,
        bestCompromiseDeg: (bestCompDelta / circ) * 360,
        scanData,
    };
    self.postMessage(result);
};
