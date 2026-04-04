"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { renderGraftSketch } from "@/lib/graftSketchRenderer";
import { cn } from "@/lib/utils";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";

// Default projection angles (same as the fixed values in renderer v2)
const AZ_DEFAULT = 0.28;   // azimuth  — viewer ~16° clockwise of 12:00
const EL_DEFAULT = 0.17;   // elevation — ~10° top-down tilt

// Clamp elevation so the graft never flips upside-down
const EL_MIN = -0.48;
const EL_MAX =  0.55;
const ZOOM_DEFAULT = 1;
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.8;
const ZOOM_STEP = 0.15;
type InteractionMode = "rotate" | "move";

function limitPan(value: number, axisSize: number, zoom: number): number {
  const slack = Math.max(0, zoom - 1);
  const limit = axisSize * (0.14 + slack * 0.7);
  return Math.max(-limit, Math.min(limit, value));
}

interface GraftSketchCanvasProps {
  result:    DeviceAnalysisResult;
  caseInput: CaseInput;
  height?:   number;
  className?: string;
}

export function GraftSketchCanvas({
  result,
  caseInput,
  height = 480,
  className,
}: GraftSketchCanvasProps) {
  const frameRef  = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [width, setWidth] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(ZOOM_DEFAULT);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("rotate");

  // Projection angles — updated by drag interaction
  const azRef = useRef(AZ_DEFAULT);
  const elRef = useRef(EL_DEFAULT);
  const zoomRef = useRef(ZOOM_DEFAULT);
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const interactionModeRef = useRef<InteractionMode>("rotate");

  // Drag tracking (refs to avoid stale closures in event listeners)
  const dragging = useRef(false);
  const lastX    = useRef(0);
  const lastY    = useRef(0);

  // -- Resize observer ------------------------------------------------------
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // -- Core render function -------------------------------------------------
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Only resize the backing store if dimensions actually changed
    const targetW = Math.floor(width * dpr);
    const targetH = Math.floor(height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width  = targetW;
      canvas.height = targetH;
      canvas.style.width  = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    renderGraftSketch({
      ctx,
      width,
      height,
      result,
      caseInput,
      mode: "preview",
      az: azRef.current,
      el: elRef.current,
      viewScale: zoomRef.current,
      viewOffsetX: panXRef.current,
      viewOffsetY: panYRef.current,
    });
  }, [caseInput, height, result, width]);

  // Re-render when data or size changes
  useEffect(() => { paint(); }, [paint]);

  // -- Drag handlers (mouse) ------------------------------------------------
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    lastX.current = e.clientX;
    lastY.current = e.clientY;
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastX.current;
      const dy = e.clientY - lastY.current;
      lastX.current = e.clientX;
      lastY.current = e.clientY;
      if (interactionModeRef.current === "move") {
        panXRef.current = limitPan(panXRef.current + dx, width, zoomRef.current);
        panYRef.current = limitPan(panYRef.current + dy, height, zoomRef.current);
      } else {
        azRef.current += dx * 0.008;
        elRef.current  = Math.max(EL_MIN, Math.min(EL_MAX, elRef.current + dy * 0.005));
      }
      paint();
    };
    const onUp = () => { dragging.current = false; };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, [paint]);

  // -- Drag handlers (touch) ------------------------------------------------
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    dragging.current = true;
    lastX.current = e.touches[0].clientX;
    lastY.current = e.touches[0].clientY;
    e.preventDefault();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      const dx = e.touches[0].clientX - lastX.current;
      const dy = e.touches[0].clientY - lastY.current;
      lastX.current = e.touches[0].clientX;
      lastY.current = e.touches[0].clientY;
      if (interactionModeRef.current === "move") {
        panXRef.current = limitPan(panXRef.current + dx, width, zoomRef.current);
        panYRef.current = limitPan(panYRef.current + dy, height, zoomRef.current);
      } else {
        azRef.current += dx * 0.008;
        elRef.current  = Math.max(EL_MIN, Math.min(EL_MAX, elRef.current + dy * 0.005));
      }
      e.preventDefault();
      paint();
    };
    const onEnd = () => { dragging.current = false; };

    // passive: false is required so we can call preventDefault and prevent scroll
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend",  onEnd);
    return () => {
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend",  onEnd);
    };
  }, [paint]);

  // -- Reset button ---------------------------------------------------------
  const resetView = useCallback(() => {
    azRef.current = AZ_DEFAULT;
    elRef.current = EL_DEFAULT;
    zoomRef.current = ZOOM_DEFAULT;
    panXRef.current = 0;
    panYRef.current = 0;
    interactionModeRef.current = "rotate";
    setZoomLevel(ZOOM_DEFAULT);
    setInteractionMode("rotate");
    paint();
  }, [paint]);

  const adjustZoom = useCallback(
    (direction: 1 | -1) => {
      const nextZoom = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, zoomRef.current + direction * ZOOM_STEP),
      );
      zoomRef.current = Number(nextZoom.toFixed(2));
      setZoomLevel(zoomRef.current);
      paint();
    },
    [paint],
  );

  const setMode = useCallback((mode: InteractionMode) => {
    interactionModeRef.current = mode;
    setInteractionMode(mode);
  }, []);

  // -- Render ---------------------------------------------------------------
  return (
    <div ref={frameRef} className={cn("w-full select-none", className)}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          className={cn(
            "w-full touch-none rounded-[18px] border border-[color:var(--border)]",
            interactionMode === "move"
              ? "cursor-move active:cursor-move"
              : "cursor-grab active:cursor-grabbing",
          )}
        />

        {/* Interaction hint + reset — overlaid bottom-left */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span
            className="rounded-[10px] px-2 py-1 text-[11px] leading-none"
            style={{
              background: "rgba(16,33,31,0.55)",
              color: "rgba(255,255,255,0.80)",
              backdropFilter: "blur(4px)",
            }}
          >
            Drag to {interactionMode}
          </span>
          <div
            className="flex items-center gap-1 rounded-[10px] p-1"
            style={{
              background: "rgba(16,33,31,0.55)",
              backdropFilter: "blur(4px)",
            }}
          >
            {(["rotate", "move"] as const).map((mode) => {
              const isActive = interactionMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setMode(mode)}
                  className="rounded-[8px] px-2 py-1 text-[11px] leading-none transition-opacity hover:opacity-100"
                  style={{
                    background: isActive ? "rgba(255,255,255,0.18)" : "transparent",
                    color: isActive ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.72)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {mode === "rotate" ? "Rotate" : "Move"}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={resetView}
            className="rounded-[10px] px-2 py-1 text-[11px] leading-none transition-opacity hover:opacity-100 opacity-70"
            style={{
              background: "rgba(16,33,31,0.55)",
              color: "rgba(255,255,255,0.80)",
              backdropFilter: "blur(4px)",
              border: "none",
              cursor: "pointer",
            }}
          >
            Reset view
          </button>
        </div>

        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => adjustZoom(-1)}
            disabled={zoomLevel <= ZOOM_MIN}
            className="rounded-[10px] px-2 py-1 text-[11px] leading-none transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: "rgba(16,33,31,0.55)",
              color: "rgba(255,255,255,0.88)",
              backdropFilter: "blur(4px)",
              border: "none",
              cursor: "pointer",
            }}
          >
            -
          </button>
          <span
            className="rounded-[10px] px-2 py-1 text-[11px] leading-none"
            style={{
              background: "rgba(16,33,31,0.55)",
              color: "rgba(255,255,255,0.80)",
              backdropFilter: "blur(4px)",
            }}
          >
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            type="button"
            onClick={() => adjustZoom(1)}
            disabled={zoomLevel >= ZOOM_MAX}
            className="rounded-[10px] px-2 py-1 text-[11px] leading-none transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: "rgba(16,33,31,0.55)",
              color: "rgba(255,255,255,0.88)",
              backdropFilter: "blur(4px)",
              border: "none",
              cursor: "pointer",
            }}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
