"use client";

import { useEffect, useRef, useState } from "react";

import {
  buildPunchCardScaleContext,
  computePunchCardHeight,
  renderPunchCard,
} from "@/lib/punchCardRenderer";
import { cn } from "@/lib/utils";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";

interface PunchCardCanvasProps {
  result: DeviceAnalysisResult;
  caseInput: CaseInput;
  className?: string;
}

export function PunchCardCanvas({
  result,
  caseInput,
  className,
}: PunchCardCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  // 1 CSS px = 1/96 inch = 25.4/96 mm at standard screen/print resolution.
  // Setting canvas.style.width in mm before window.print() ensures the
  // browser prints the canvas at exactly the declared physical size.
  const MM_TO_CSS_PX = 96 / 25.4;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) {
      return;
    }

    const height = computePunchCardHeight(width, result, caseInput, "preview");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(dpr, dpr);

    renderPunchCard({
      ctx: context,
      width,
      height,
      result,
      caseInput,
      mode: "preview",
      tieClock: caseInput.tieClock ?? [4, 6, 8],
      showCalibration: true,
      cutMarginMm: 8,
      filmHeightMm: caseInput.filmHeightMm,
    });
  }, [caseInput, result, width]);

  // Re-render at physical scale before printing; restore after.
  // We inject a @page rule with the exact card dimensions so the PDF is always
  // exactly one page and the browser cannot add margins or re-scale.
  useEffect(() => {
    function handleBeforePrint() {
      const canvas = canvasRef.current;
      if (!canvas || !result.size) return;

      // Canvas width so chart = circumferenceMm exactly at 96 dpi.
      const sc = buildPunchCardScaleContext("print");
      const physW = sc.v_52_20 + sc.leftAxisW
        + result.circumferenceMm * MM_TO_CSS_PX
        + sc.rightAnnotW + sc.v_52_20;
      const physH = computePunchCardHeight(physW, result, caseInput, "print");

      // Physical dimensions in mm.
      const physW_mm = physW / MM_TO_CSS_PX;
      const physH_mm = physH / MM_TO_CSS_PX;

      // Inject a @page rule so the PDF page matches the card exactly.
      let styleEl = document.getElementById("pmeg-page-style") as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "pmeg-page-style";
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `@page { size: ${physW_mm.toFixed(2)}mm ${physH_mm.toFixed(2)}mm; margin: 0; }`;

      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.floor(physW * dpr);
      canvas.height = Math.floor(physH * dpr);
      canvas.style.width  = `${physW_mm}mm`;
      canvas.style.height = `${physH_mm}mm`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      renderPunchCard({
        ctx,
        width: physW,
        height: physH,
        result,
        caseInput,
        mode: "print",
        tieClock: caseInput.tieClock ?? [4, 6, 8],
        showCalibration: true,
        filmHeightMm: caseInput.filmHeightMm,
      });
    }

    function handleAfterPrint() {
      const canvas = canvasRef.current;
      const frame  = frameRef.current;
      if (!canvas || !frame) return;
      // Remove injected @page rule.
      document.getElementById("pmeg-page-style")?.remove();
      canvas.style.width  = "";
      canvas.style.height = "";
      // Restore preview render at current container width.
      const w = frame.getBoundingClientRect().width;
      if (w > 0) setWidth(w);
    }

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint",  handleAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint",  handleAfterPrint);
    };
  }, [result, caseInput, MM_TO_CSS_PX]);

  return (
    <div ref={frameRef} className={cn("w-full", className)}>
      <canvas ref={canvasRef} className="w-full rounded-[22px]" />
    </div>
  );
}
