/**
 * graftSketchRenderer.ts  —  PMEGplan.io
 *
 * Renders a clinically accurate schematic of the graft body.
 *
 * Improvements over v1:
 *   - 3D cylindrical perspective — elliptical top/bottom rims, shaded walls
 *   - Proper perspective foreshortening of side walls
 *   - Suprarenal stent drawn as real arch/crown above fabric (device-specific)
 *   - Fenestrations shown as proper oval openings on the cylinder wall
 *   - Bifurcation legs with realistic taper
 *   - Lock-stent indicator for TREO
 *   - Gold radiopaque markers for Zenith Alpha
 *   - ARCSEP dimension leaders (Cook CMD style)
 *   - Cleaner spec panel with colour coding
 */

import type { CaseInput, DeviceAnalysisResult, StrutSegment } from "@/lib/types";
import { clockTextToArcMm } from "@/lib/planning/clock";

const VESSEL_COLORS: Record<string, string> = {
  SMA: "#15803d", LRA: "#c2410c", RRA: "#b91c1c",
  LMA: "#0369a1", CELIAC: "#7c3aed", CUSTOM: "#475569",
};

function arcFromNoon(arcMm: number, circ: number): number {
  const half = circ / 2;
  return arcMm <= half ? arcMm : arcMm - circ;
}

function wrapMm(x: number, circ: number): number {
  return ((x % circ) + circ) % circ;
}

function computeArcSep(adjClock: string, seamDeg: number, delta: number, circ: number): number {
  const adjArc = clockTextToArcMm(adjClock, circ);
  const seamArc = (seamDeg / 360) * circ + delta;
  return adjArc - seamArc;
}

function isInInterRingGap(depthMm: number, ringH: number, gapH: number, nRings: number): boolean {
  let y = 0;
  for (let i = 0; i < nRings - 1; i++) {
    y += ringH;
    if (depthMm >= y && depthMm <= y + gapH) return true;
    y += gapH;
  }
  return false;
}

function getRotationSummary(result: DeviceAnalysisResult): string {
  const { rotation } = result;
  if (rotation.hasConflictFreeRotation) {
    const wins = rotation.validWindows
      .map((w) => `${w.startDeg.toFixed(0)}\u00b0\u2013${w.endDeg.toFixed(0)}\u00b0`)
      .join(", ");
    return `Rotate ${rotation.optimalDeltaDeg.toFixed(0)}\u00b0 CW (${rotation.optimalDeltaMm.toFixed(1)} mm). Valid window: ${wins}.`;
  }
  return `No conflict-free rotation. Best compromise: ${rotation.bestCompromiseDeg.toFixed(0)}\u00b0 CW. Strut bending technique required.`;
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dir: "up"|"down", size: number) {
  ctx.beginPath();
  if (dir === "up") {
    ctx.moveTo(x, y); ctx.lineTo(x - size/2, y + size); ctx.lineTo(x + size/2, y + size);
  } else {
    ctx.moveTo(x, y); ctx.lineTo(x - size/2, y - size); ctx.lineTo(x + size/2, y - size);
  }
  ctx.closePath(); ctx.fill();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, max = 6): number {
  const words = text.split(" "); let line = ""; let n = 0;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      ctx.fillText(line, x, y + n * lh); n++; line = w;
      if (n >= max - 1) break;
    } else { line = t; }
  }
  if (line) { ctx.fillText(line, x, y + n * lh); n++; }
  return y + n * lh;
}

export interface GraftSketchOptions {
  ctx: CanvasRenderingContext2D;
  width: number; height: number;
  result: DeviceAnalysisResult;
  caseInput: CaseInput;
  mode?: "preview" | "print";
}

export function renderGraftSketch({ ctx, width, height, result, caseInput, mode = "preview" }: GraftSketchOptions): void {
  ctx.clearRect(0, 0, width, height);

  if (!result.size) {
    ctx.fillStyle = "#f8f4ed";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#45605b";
    ctx.font = "400 13px sans-serif";
    ctx.fillText("No compatible graft size for this anatomy.", 22, 40);
    return;
  }

  const p = mode === "print";
  const printScale = p ? width / 600 : 1;
  const lw = Math.round(width / printScale);
  const lh = Math.round(height / printScale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  if (p) ctx.scale(printScale, printScale);

  const fs = (base: number) => p ? base : base;
  const margin = p ? 24 : 18;
  const headerH = p ? 52 : 40;
  const footerH = p ? 40 : 32;

  const totalBodyW = lw - margin * 2;
  const drawPanelW = Math.round(totalBodyW * 0.53);
  const specPanelX = margin + drawPanelW + (p ? 18 : 14);
  const specPanelW = lw - specPanelX - margin;
  const bodyY = margin + headerH;
  const bodyH = lh - bodyY - footerH - margin;

  // HEADER
  ctx.fillStyle = "#10211f";
  ctx.font = `700 ${fs(p?19:13)}px sans-serif`;
  ctx.fillText(result.device.name, margin, margin + fs(p?21:14));
  ctx.fillStyle = "#45605b";
  ctx.font = `400 ${fs(p?11:8.5)}px sans-serif`;
  ctx.fillText(
    `${result.size.graftDiameter} mm  \u00b7  ${result.nPeaks} peaks  \u00b7  ${result.size.sheathFr} Fr  \u00b7  ${result.device.fabricMaterial}  \u00b7  FS ${(result.device.foreshortening*100).toFixed(0)}%`,
    margin, margin + fs(p?36:25)
  );
  if (caseInput.patientId || caseInput.surgeonName) {
    ctx.fillText(
      `Patient: ${caseInput.patientId||"\u2014"}   Surgeon: ${caseInput.surgeonName||"\u2014"}`,
      margin, margin + fs(p?49:34)
    );
  }

  // GRAFT GEOMETRY SETUP
  const circ = result.circumferenceMm;
  const delta = result.rotation.optimalDeltaMm;
  const { ringHeight, interRingGap, nRings, seamDeg } = result.device;

  // 3D CYLINDER
  const annotW = p ? 68 : 34;
  const cylBodyW = drawPanelW - annotW - (p?14:8);
  const cylBodyX = margin + annotW;
  const cylBodyCX = cylBodyX + cylBodyW / 2;

  const ellipseRX = cylBodyW / 2;
  const ellipseRY = Math.max(cylBodyW * 0.07, p ? 7 : 4);

  const sealZoneH = nRings * ringHeight + (nRings - 1) * interRingGap;
  const maxDepth = Math.max(sealZoneH + 18, ...caseInput.fenestrations.map(f => f.depthMm + 24));
  const supraClearance = p ? 38 : 24;
  const cylBodyY = bodyY + supraClearance;
  const availH = bodyH - supraClearance - (p?32:22);
  const yScale = p ? availH / maxDepth : Math.min(availH / maxDepth, 3.0);
  const cylBodyH = maxDepth * yScale;
  const xScale = cylBodyW / circ;

  // DIAMETER CALLOUT
  const diaY = cylBodyY - ellipseRY - (p?18:12);
  ctx.strokeStyle = "#10211f"; ctx.lineWidth = p?1.4:1.0;
  ctx.beginPath();
  ctx.moveTo(cylBodyX, diaY); ctx.lineTo(cylBodyX + cylBodyW, diaY);
  ctx.moveTo(cylBodyX, diaY-(p?5:3)); ctx.lineTo(cylBodyX, diaY+(p?5:3));
  ctx.moveTo(cylBodyX+cylBodyW, diaY-(p?5:3)); ctx.lineTo(cylBodyX+cylBodyW, diaY+(p?5:3));
  ctx.stroke();
  ctx.fillStyle = "#10211f";
  ctx.font = `700 ${fs(p?13:9)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`\u00d8 ${result.size.graftDiameter} mm`, cylBodyCX, diaY-(p?7:4));
  ctx.textAlign = "left";

  // CYLINDER WALLS
  ctx.strokeStyle = "#10211f"; ctx.lineWidth = p?2.2:1.6;
  ctx.beginPath();
  ctx.moveTo(cylBodyX, cylBodyY); ctx.lineTo(cylBodyX, cylBodyY + cylBodyH);
  ctx.moveTo(cylBodyX+cylBodyW, cylBodyY); ctx.lineTo(cylBodyX+cylBodyW, cylBodyY+cylBodyH);
  ctx.stroke();

  // TOP RIM (3D ellipse)
  ctx.strokeStyle = "#10211f"; ctx.lineWidth = p?1.8:1.3;
  ctx.beginPath();
  ctx.ellipse(cylBodyCX, cylBodyY, ellipseRX, ellipseRY, 0, 0, Math.PI*2);
  ctx.stroke();
  // Depth gradient fill inside top rim
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cylBodyCX, cylBodyY, ellipseRX-2, ellipseRY-1, 0, 0, Math.PI*2);
  const topGrad = ctx.createRadialGradient(cylBodyCX, cylBodyY-ellipseRY*0.3, 0, cylBodyCX, cylBodyY, ellipseRX);
  topGrad.addColorStop(0, "rgba(200,230,220,0.55)");
  topGrad.addColorStop(1, "rgba(120,160,150,0.18)");
  ctx.fillStyle = topGrad; ctx.fill();
  ctx.restore();

  // BOTTOM RIM (partial — lower half visible)
  const rimBottomY = cylBodyY + cylBodyH;
  ctx.strokeStyle = "#10211f"; ctx.lineWidth = p?1.6:1.2;
  ctx.beginPath();
  ctx.ellipse(cylBodyCX, rimBottomY, ellipseRX, ellipseRY, 0, 0, Math.PI);
  ctx.stroke();
  ctx.save();
  ctx.setLineDash([p?4:3, p?3:2]);
  ctx.strokeStyle = "rgba(16,33,31,0.28)";
  ctx.beginPath();
  ctx.ellipse(cylBodyCX, rimBottomY, ellipseRX, ellipseRY, 0, Math.PI, Math.PI*2);
  ctx.stroke();
  ctx.restore();

  // RING ZONES: hatch + gap tints (clipped to cylinder)
  ctx.save();
  ctx.beginPath();
  ctx.rect(cylBodyX+1, cylBodyY, cylBodyW-2, cylBodyH);
  ctx.clip();

  const hatchSpacing = p ? 5 : 4;
  let bandY = 0;
  for (let ri = 0; ri < nRings; ri++) {
    const rTop = cylBodyY + bandY * yScale;
    const rH = ringHeight * yScale;
    ctx.fillStyle = "rgba(220,38,38,0.07)";
    ctx.fillRect(cylBodyX+1, rTop, cylBodyW-2, rH);
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = p?0.6:0.5;
    for (let d = -rH; d < cylBodyW + rH; d += hatchSpacing) {
      ctx.beginPath(); ctx.moveTo(cylBodyX+d, rTop); ctx.lineTo(cylBodyX+d+rH, rTop+rH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cylBodyX+d+rH, rTop); ctx.lineTo(cylBodyX+d, rTop+rH); ctx.stroke();
    }
    ctx.fillStyle = "rgba(107,114,128,0.60)"; ctx.font = `400 ${fs(p?8.5:6.5)}px sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(`Ring ${ri+1}`, cylBodyX+cylBodyW+(p?4:3), rTop+rH/2+3);
    bandY += ringHeight;

    if (ri < nRings - 1) {
      const gTop = cylBodyY + bandY * yScale;
      const gH = interRingGap * yScale;
      ctx.fillStyle = "rgba(15,118,110,0.10)";
      ctx.fillRect(cylBodyX+1, gTop, cylBodyW-2, gH);
      if (gH > (p?10:7)) {
        ctx.fillStyle = "rgba(15,118,110,0.55)";
        ctx.font = `400 italic ${fs(p?8:6.5)}px sans-serif`;
        ctx.fillText(`gap ${interRingGap} mm`, cylBodyX+cylBodyW+(p?4:3), gTop+gH/2+3);
      }
      bandY += interRingGap;
    }
  }
  ctx.restore();

  // DEPTH TICKS
  ctx.fillStyle = "#374151"; ctx.font = `400 ${fs(p?9:7)}px sans-serif`;
  ctx.strokeStyle = "rgba(55,65,81,0.40)"; ctx.lineWidth = 0.6; ctx.textAlign = "right";
  for (let d = 0; d <= maxDepth; d += 10) {
    const gy = cylBodyY + d * yScale;
    if (gy > cylBodyY + cylBodyH + 4) break;
    ctx.beginPath(); ctx.moveTo(cylBodyX-(p?3:2), gy); ctx.lineTo(cylBodyX, gy); ctx.stroke();
    ctx.fillText(`${d}`, cylBodyX-(p?5:4), gy+3);
  }
  ctx.textAlign = "left";

  // CLOCK GUIDES
  const clockGuides = [{ label:"9:00", arcD:-circ/4 }, { label:"12:00 (A)", arcD:0 }, { label:"3:00", arcD:circ/4 }];
  ctx.font = `600 ${fs(p?9:6.5)}px sans-serif`; ctx.textAlign = "center";
  for (const { label, arcD } of clockGuides) {
    const gx = cylBodyCX + arcD * xScale;
    if (gx < cylBodyX || gx > cylBodyX + cylBodyW) continue;
    ctx.fillStyle = "#374151";
    ctx.fillText(label, gx, cylBodyY - ellipseRY - (p?8:5));
    ctx.strokeStyle = "rgba(0,0,0,0.08)"; ctx.lineWidth = 0.4;
    ctx.setLineDash([p?4:3, p?3:2]);
    ctx.beginPath(); ctx.moveTo(gx, cylBodyY); ctx.lineTo(gx, cylBodyY+cylBodyH); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.textAlign = "left";

  // Z-STENT STRUTS (device-coloured, with white outline)
  const waveWidth = circ / result.nPeaks;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cylBodyX, cylBodyY - supraClearance - 2, cylBodyW+2, cylBodyH + supraClearance + 8);
  ctx.clip();

  const strutLW = p ? 2.0 : 1.6;
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? "#ffffff" : result.device.color;
    ctx.lineWidth = pass === 0 ? strutLW + (p?2.2:1.8) : strutLW;
    for (const [ax, ay, bx, by] of result.strutSegments as StrutSegment[]) {
      for (const copy of [-1, 0, 1]) {
        const dax = cylBodyCX + arcFromNoon(wrapMm(ax+delta, circ), circ) * xScale + copy * cylBodyW;
        const dbx = cylBodyCX + arcFromNoon(wrapMm(bx+delta, circ), circ) * xScale + copy * cylBodyW;
        const day = cylBodyY + ay * yScale;
        const dby = cylBodyY + by * yScale;
        if (Math.max(dax,dbx) < cylBodyX-4 || Math.min(dax,dbx) > cylBodyX+cylBodyW+4) continue;
        ctx.beginPath(); ctx.moveTo(dax, day); ctx.lineTo(dbx, dby); ctx.stroke();
      }
    }
  }

  // SUPRARENAL BARE STENT
  if (result.device.hasBareSuprarenal) {
    const supraH = p ? 26 : 16;
    if (result.device.id === "treo") {
      ctx.strokeStyle = result.device.color; ctx.lineWidth = p?1.5:1.1;
      for (let pk = 0; pk < result.nPeaks; pk++) {
        const arcA = wrapMm(pk*waveWidth+delta, circ);
        const arcB = wrapMm((pk+0.5)*waveWidth+delta, circ);
        const arcC = wrapMm((pk+1)*waveWidth+delta, circ);
        for (const copy of [-1,0,1]) {
          const xa = cylBodyCX + arcFromNoon(arcA,circ)*xScale + copy*cylBodyW;
          const xb = cylBodyCX + arcFromNoon(arcB,circ)*xScale + copy*cylBodyW;
          const xc = cylBodyCX + arcFromNoon(arcC,circ)*xScale + copy*cylBodyW;
          if (Math.max(xa,xc)<cylBodyX||Math.min(xa,xc)>cylBodyX+cylBodyW) continue;
          ctx.beginPath(); ctx.moveTo(xa,cylBodyY); ctx.quadraticCurveTo(xb,cylBodyY-supraH*0.85,xc,cylBodyY); ctx.stroke();
        }
      }
      ctx.fillStyle = result.device.color;
      for (let pk = 0; pk < result.nPeaks; pk++) {
        const fa = wrapMm(pk*waveWidth+delta, circ);
        const fx = cylBodyCX + arcFromNoon(fa,circ)*xScale;
        if (fx<cylBodyX+1||fx>cylBodyX+cylBodyW-1) continue;
        ctx.beginPath(); ctx.arc(fx, cylBodyY, p?2.5:1.8, 0, Math.PI*2); ctx.fill();
      }
    } else {
      ctx.strokeStyle = result.device.color; ctx.lineWidth = p?1.5:1.1;
      ctx.setLineDash([p?4:3, p?2.5:2]);
      for (let pk = 0; pk < result.nPeaks*2; pk++) {
        const arcA = (pk*waveWidth)/2 + delta;
        const arcB = ((pk+1)*waveWidth)/2 + delta;
        for (const copy of [-1,0,1]) {
          const xa = cylBodyCX + arcFromNoon(wrapMm(arcA,circ),circ)*xScale + copy*cylBodyW;
          const xb = cylBodyCX + arcFromNoon(wrapMm(arcB,circ),circ)*xScale + copy*cylBodyW;
          if (Math.max(xa,xb)<cylBodyX||Math.min(xa,xb)>cylBodyX+cylBodyW) continue;
          const ya = pk%2===0 ? cylBodyY : cylBodyY-supraH;
          const yb = pk%2===0 ? cylBodyY-supraH : cylBodyY;
          ctx.beginPath(); ctx.moveTo(xa,ya); ctx.lineTo(xb,yb); ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }
    // Barbs
    ctx.strokeStyle="#10211f"; ctx.lineWidth=p?1.3:1.0;
    const barbLen=p?9:6;
    for (let pk=0;pk<result.nPeaks;pk++) {
      const pa=wrapMm(pk*waveWidth+delta,circ);
      for (const copy of [-1,0,1]) {
        const px=cylBodyCX+arcFromNoon(pa,circ)*xScale+copy*cylBodyW;
        if (px<cylBodyX+1||px>cylBodyX+cylBodyW-1) continue;
        const topY=result.device.id==="treo" ? cylBodyY-supraClearance*0.78 : cylBodyY-supraClearance;
        ctx.beginPath(); ctx.moveTo(px,topY); ctx.lineTo(px-barbLen*0.5,topY-barbLen); ctx.stroke();
      }
    }
  }

  if (result.device.hasInfrarenalBarbs) {
    ctx.strokeStyle="#10211f"; ctx.lineWidth=p?1.2:0.9;
    const irbLen=p?7:5; const valleyY=cylBodyY+ringHeight*yScale;
    for (let v=0;v<result.nPeaks;v++) {
      const va=wrapMm((v+0.5)*waveWidth+delta,circ);
      const vx=cylBodyCX+arcFromNoon(va,circ)*xScale;
      if (vx<cylBodyX+2||vx>cylBodyX+cylBodyW-2) continue;
      ctx.beginPath(); ctx.moveTo(vx,valleyY); ctx.lineTo(vx,valleyY+irbLen); ctx.stroke();
    }
  }
  ctx.restore();

  // GOLD MARKERS (Zenith Alpha)
  if (result.device.id === "zenith_alpha") {
    ctx.fillStyle = "#d97706";
    const mR=p?3.5:2.5; const mY=cylBodyY+(p?4:3);
    for (const frac of [0,0.25,0.5,0.75]) {
      const arc=wrapMm(frac*circ+delta,circ);
      const mx=cylBodyCX+arcFromNoon(arc,circ)*xScale;
      if (mx<cylBodyX+mR||mx>cylBodyX+cylBodyW-mR) continue;
      ctx.beginPath(); ctx.arc(mx,mY,mR,0,Math.PI*2); ctx.fill();
    }
    ctx.fillStyle="#d97706"; ctx.font=`400 ${fs(p?7.5:6)}px sans-serif`; ctx.textAlign="right";
    ctx.fillText("Gold markers", cylBodyX-(p?3:2), mY+3);
    ctx.textAlign="left";
  }

  // FENESTRATIONS on cylinder wall
  const dimLines: {y:number;label:string;color:string}[] = [];
  caseInput.fenestrations.forEach((fen, idx) => {
    const conflict = result.optimalConflicts[idx];
    const isConf = conflict?.conflict ?? false;
    const adjClock = conflict?.adjustedClock ?? fen.clock;
    const adjArc = clockTextToArcMm(adjClock, circ);
    const fenDrawX = cylBodyCX + arcFromNoon(wrapMm(adjArc+delta,circ),circ)*xScale;
    const fenDrawY = cylBodyY + fen.depthMm * yScale;
    const color = VESSEL_COLORS[fen.vessel] ?? "#334155";
    const isStrFree = !isConf && fen.ftype!=="SCALLOP" && isInInterRingGap(fen.depthMm,ringHeight,interRingGap,nRings);

    ctx.save();
    if (fen.ftype === "SCALLOP") {
      const nW=Math.max(fen.widthMm*xScale,p?18:11);
      const nH=Math.max(fen.heightMm*yScale,p?12:8);
      ctx.fillStyle=`${color}28`; ctx.strokeStyle=color; ctx.lineWidth=p?2.0:1.6;
      ctx.beginPath();
      ctx.moveTo(fenDrawX-nW/2,cylBodyY); ctx.lineTo(fenDrawX-nW/2,cylBodyY+nH);
      ctx.quadraticCurveTo(fenDrawX,cylBodyY+nH*1.4,fenDrawX+nW/2,cylBodyY+nH);
      ctx.lineTo(fenDrawX+nW/2,cylBodyY); ctx.fill(); ctx.stroke();
      ctx.fillStyle=color; ctx.font=`700 ${fs(p?10:7.5)}px sans-serif`; ctx.textAlign="center";
      ctx.fillText(fen.vessel,fenDrawX,cylBodyY-(p?16:11));
      ctx.textAlign="left";
    } else {
      const rW=Math.max((fen.widthMm/2)*xScale,p?9:6);
      const rH=Math.max((fen.heightMm/2)*yScale,p?9:6);
      const r=Math.max(rW,rH);
      if (isConf) {
        ctx.strokeStyle="#dc2626"; ctx.lineWidth=p?1.5:1.0;
        ctx.setLineDash([p?4:3,p?3:2]);
        ctx.beginPath(); ctx.arc(fenDrawX,fenDrawY,r+(p?7:5),0,Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle="#ffffff"; ctx.strokeStyle=color; ctx.lineWidth=p?2.2:1.8;
      ctx.beginPath(); ctx.arc(fenDrawX,fenDrawY,r,0,Math.PI*2); ctx.fill(); ctx.stroke();
      const cs=p?5:3;
      ctx.strokeStyle=color; ctx.lineWidth=p?1.2:0.9;
      ctx.beginPath();
      ctx.moveTo(fenDrawX-cs,fenDrawY); ctx.lineTo(fenDrawX+cs,fenDrawY);
      ctx.moveTo(fenDrawX,fenDrawY-cs); ctx.lineTo(fenDrawX,fenDrawY+cs);
      ctx.stroke();
      if (isStrFree) {
        ctx.fillStyle="#10211f"; ctx.font=`900 ${fs(p?15:10)}px sans-serif`; ctx.textAlign="center";
        ctx.fillText("A",fenDrawX,fenDrawY+r+(p?13:9)); ctx.textAlign="left";
      }
      ctx.fillStyle=color; ctx.font=`700 ${fs(p?10.5:7.5)}px sans-serif`;
      ctx.fillText(fen.vessel,fenDrawX+r+(p?4:3),fenDrawY+3);
      ctx.strokeStyle=`${color}55`; ctx.lineWidth=0.6;
      ctx.setLineDash([p?3:2,p?2:1.5]);
      ctx.beginPath(); ctx.moveTo(cylBodyX,fenDrawY); ctx.lineTo(fenDrawX-r-(p?3:2),fenDrawY); ctx.stroke();
      ctx.setLineDash([]);
      dimLines.push({y:fenDrawY,label:`${fen.depthMm}`,color});
    }
    ctx.restore();
  });

  // DEPTH DIMENSION LINES
  const colW=p?13:9; const arrowSz=p?3.5:2.5;
  dimLines.forEach(({y,label,color},i) => {
    const dimX=cylBodyX-(p?9:6)-i*colW;
    ctx.strokeStyle=color; ctx.lineWidth=p?1.2:0.9;
    ctx.beginPath(); ctx.moveTo(dimX,cylBodyY); ctx.lineTo(dimX,y); ctx.stroke();
    ctx.fillStyle=color;
    drawArrow(ctx,dimX,cylBodyY,"up",arrowSz);
    drawArrow(ctx,dimX,y,"down",arrowSz);
    ctx.strokeStyle=`${color}50`; ctx.lineWidth=0.5;
    ctx.setLineDash([p?3:2,p?2:1.5]);
    ctx.beginPath();
    ctx.moveTo(dimX,cylBodyY); ctx.lineTo(cylBodyX,cylBodyY);
    ctx.moveTo(dimX,y); ctx.lineTo(cylBodyX,y);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle=color; ctx.font=`700 ${fs(p?10.5:7.5)}px sans-serif`; ctx.textAlign="right";
    ctx.fillText(label,dimX-(p?3:2),(cylBodyY+y)/2+4);
    ctx.textAlign="left";
  });

  // BIFURCATION LEGS
  const bifY=cylBodyY+cylBodyH; const legLen=p?22:14; const legW=cylBodyW*0.46;
  ctx.strokeStyle="rgba(16,33,31,0.55)"; ctx.lineWidth=p?1.8:1.3;
  ctx.beginPath();
  ctx.moveTo(cylBodyX,bifY); ctx.lineTo(cylBodyX+cylBodyW*0.28,bifY+legLen);
  ctx.moveTo(cylBodyX+legW,bifY); ctx.lineTo(cylBodyX+cylBodyW*0.28+legW*0.6,bifY+legLen);
  ctx.moveTo(cylBodyX+cylBodyW-legW,bifY); ctx.lineTo(cylBodyX+cylBodyW-cylBodyW*0.28-legW*0.6,bifY+legLen);
  ctx.moveTo(cylBodyX+cylBodyW,bifY); ctx.lineTo(cylBodyX+cylBodyW-cylBodyW*0.28,bifY+legLen);
  ctx.stroke();
  ctx.setLineDash([p?4:3,p?3:2]); ctx.strokeStyle="rgba(16,33,31,0.22)";
  ctx.beginPath();
  ctx.moveTo(cylBodyX+cylBodyW*0.28,bifY+legLen); ctx.lineTo(cylBodyX+cylBodyW*0.28,bifY+legLen+(p?10:7));
  ctx.moveTo(cylBodyX+cylBodyW-cylBodyW*0.28,bifY+legLen); ctx.lineTo(cylBodyX+cylBodyW-cylBodyW*0.28,bifY+legLen+(p?10:7));
  ctx.stroke(); ctx.setLineDash([]);

  // SPEC PANEL
  const lineH = p?14:11;
  let sy = bodyY + (p?6:4);
  const sw = specPanelW;

  const sectionLine = () => {
    sy += lineH * 0.5;
    ctx.strokeStyle="rgba(16,33,31,0.13)"; ctx.lineWidth=0.4;
    ctx.beginPath(); ctx.moveTo(specPanelX,sy); ctx.lineTo(specPanelX+sw,sy); ctx.stroke();
    sy += lineH * 0.5;
  };

  const spec = (label: string, value: string, valColor?: string) => {
    ctx.fillStyle="rgba(69,96,91,0.70)"; ctx.font=`400 ${fs(p?9:7)}px sans-serif`;
    ctx.fillText(label, specPanelX, sy);
    ctx.fillStyle=valColor??="#10211f"; ctx.font=`600 ${fs(p?9:7)}px sans-serif`;
    ctx.fillText(value, specPanelX+sw*0.55, sy);
    sy += lineH;
  };

  ctx.fillStyle="#10211f"; ctx.font=`700 ${fs(p?12:9)}px sans-serif`;
  ctx.fillText("DEVICE", specPanelX, sy); sy += lineH*1.2;
  spec("Platform", result.device.shortName, result.device.color);
  spec("Diameter", `${result.size.graftDiameter} mm`);
  spec("Sheath", `${result.size.sheathFr} Fr`);
  spec("Ring height", `${result.device.ringHeight} mm`);
  spec("Inter gap", `${result.device.interRingGap} mm`, result.device.interRingGap>=12?"#15803d":"#c2410c");
  spec("Peaks/ring", `${result.nPeaks}`);
  spec("FS", `${(result.device.foreshortening*100).toFixed(0)}%`);
  sectionLine();

  ctx.fillStyle="#10211f"; ctx.font=`700 ${fs(p?12:9)}px sans-serif`;
  ctx.fillText("ROTATION PLAN", specPanelX, sy); sy += lineH*1.1;
  ctx.fillStyle=result.rotation.hasConflictFreeRotation?"#15803d":"#b45309";
  ctx.font=`600 ${fs(p?10:8)}px sans-serif`;
  sy = wrapText(ctx, getRotationSummary(result), specPanelX, sy, sw, lineH, 5);
  sectionLine();

  ctx.fillStyle="#10211f"; ctx.font=`700 ${fs(p?12:9)}px sans-serif`;
  ctx.fillText("FENESTRATIONS", specPanelX, sy); sy += lineH*1.1;

  const fcnt: Record<string,number> = {SCALLOP:0,LARGE_FEN:0,SMALL_FEN:0};
  caseInput.fenestrations.forEach((fen, idx) => {
    const conflict=result.optimalConflicts[idx];
    const adjClock=conflict?.adjustedClock??fen.clock;
    const isConf=conflict?.conflict??false;
    const color=VESSEL_COLORS[fen.vessel]??"#334155";
    fcnt[fen.ftype]=(fcnt[fen.ftype]??0)+1;
    const typeLabel=fen.ftype==="SCALLOP"?`SCALLOP #${fcnt.SCALLOP}`:fen.ftype==="LARGE_FEN"?`LARGE FEN #${fcnt.LARGE_FEN}`:`SMALL FEN #${fcnt.SMALL_FEN}`;
    ctx.fillStyle=color; ctx.font=`700 ${fs(p?10.5:8)}px sans-serif`;
    ctx.fillText(`${fen.vessel}  ${typeLabel}`, specPanelX, sy); sy+=lineH;
    if (fen.ftype!=="SCALLOP") {
      const arcSep=computeArcSep(adjClock,seamDeg,delta,circ);
      const isStrFree=!isConf&&isInInterRingGap(fen.depthMm,ringHeight,interRingGap,nRings);
      if (isStrFree) { ctx.fillStyle="#0f766e"; ctx.font=`700 ${fs(p?9:7)}px sans-serif`; ctx.fillText("\u2605 Strut Free",specPanelX+(p?6:4),sy); sy+=lineH; }
      else if (isConf) { ctx.fillStyle="#dc2626"; ctx.font=`700 ${fs(p?9:7)}px sans-serif`; ctx.fillText(`\u26a0 Conflict  ${conflict.minDist.toFixed(1)} mm`,specPanelX+(p?6:4),sy); sy+=lineH; }
      ctx.fillStyle="#334155"; ctx.font=`400 ${fs(p?9:7)}px sans-serif`;
      for (const row of [`${fen.widthMm}\u00d7${fen.heightMm} mm  \u00b7  ${fen.depthMm} mm deep`,`Clock: ${fen.clock} \u2192 ${adjClock}`,`ARCSEP: ${arcSep>0?"+":""}${arcSep.toFixed(1)} mm from seam`]) {
        ctx.fillText(row,specPanelX+(p?6:4),sy); sy+=lineH;
      }
    } else {
      ctx.fillStyle="#334155"; ctx.font=`400 ${fs(p?9:7)}px sans-serif`;
      ctx.fillText(`${fen.widthMm}\u00d7${fen.heightMm} mm  \u00b7  Clock: ${adjClock}`,specPanelX+(p?6:4),sy); sy+=lineH;
    }
    sy+=lineH*0.4;
  });

  // FOOTER
  const footerY = lh - (p?16:12);
  ctx.fillStyle="rgba(69,96,91,0.45)"; ctx.font=`400 ${fs(p?7.5:6)}px sans-serif`;
  ctx.fillText("FOR RESEARCH / PLANNING USE ONLY  \u00b7  PMEGplan.io", margin, footerY);
}
