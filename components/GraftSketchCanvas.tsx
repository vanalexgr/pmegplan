"use client";

import { useEffect, useRef, useState } from "react";

import { renderGraftSketch } from "@/lib/graftSketchRenderer";
import { cn } from "@/lib/utils";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";

interface GraftSketchCanvasProps {
  result: DeviceAnalysisResult;
  caseInput: CaseInput;
  height?: number;
  className?: string;
}

export function GraftSketchCanvas({
  result,
  caseInput,
  height = 480,
  className,
}: GraftSketchCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    renderGraftSketch({ ctx, width, height, result, caseInput, mode: "preview" });
  }, [caseInput, height, result, width]);

  return (
    <div ref={frameRef} className={cn("w-full", className)}>
      <canvas ref={canvasRef} className="w-full rounded-[18px] border border-[color:var(--border)]" />
    </div>
  );
}
