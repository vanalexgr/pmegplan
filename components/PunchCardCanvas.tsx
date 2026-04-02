"use client";

import { useEffect, useRef, useState } from "react";

import { renderPunchCard } from "@/lib/punchCardRenderer";
import { cn } from "@/lib/utils";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";

interface PunchCardCanvasProps {
  result: DeviceAnalysisResult;
  caseInput: CaseInput;
  height?: number;
  className?: string;
}

export function PunchCardCanvas({
  result,
  caseInput,
  height = 260,
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
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
    });
  }, [caseInput, height, result, width]);

  return (
    <div ref={frameRef} className={cn("w-full", className)}>
      <canvas ref={canvasRef} className="w-full rounded-[22px]" />
    </div>
  );
}

