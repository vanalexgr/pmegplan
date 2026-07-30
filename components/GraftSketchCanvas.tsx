"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  renderGraftSketch,
  type GraftSketchFenestrationHitTarget,
} from "@/lib/graftSketchRenderer";
import { cn } from "@/lib/utils";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";

const AZ_DEFAULT = 0.28;
const EL_DEFAULT = 0.17;
const ZOOM_DEFAULT = 1.5;
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 2.4;
const PAN_Y_DEFAULT_RATIO = -0.11;

const EL_MIN = -0.48;
const EL_MAX = 0.55;

type InteractionMode = "rotate" | "move";

interface GraftSketchCanvasProps {
  result: DeviceAnalysisResult;
  caseInput: CaseInput;
  height?: number;
  className?: string;
  canvasClassName?: string;
  layout?: "review" | "model-only";
  fenestrationFrame?: "anatomical" | "graft";
  selectedFenestrationIndex?: number | null;
  onSelectFenestration?: (index: number) => void;
}

function clampZoom(value: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
}

export function GraftSketchCanvas({
  result,
  caseInput,
  height = 480,
  className,
  canvasClassName,
  layout = "review",
  fenestrationFrame = "anatomical",
  selectedFenestrationIndex = null,
  onSelectFenestration,
}: GraftSketchCanvasProps) {
  const defaultPanY = Math.round(height * PAN_Y_DEFAULT_RATIO);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [width, setWidth] = useState(0);
  const [mode, setMode] = useState<InteractionMode>("rotate");
  const [zoomDisplay, setZoomDisplay] = useState(Math.round(ZOOM_DEFAULT * 100));

  const azRef = useRef(AZ_DEFAULT);
  const elRef = useRef(EL_DEFAULT);
  const zoomRef = useRef(ZOOM_DEFAULT);
  const panXRef = useRef(0);
  const panYRef = useRef(defaultPanY);

  const draggingRef = useRef(false);
  const activeModeRef = useRef<InteractionMode>("rotate");
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);
  const pinchDistanceRef = useRef(0);
  const pinchCenterRef = useRef({ x: 0, y: 0 });
  const gestureOriginRef = useRef({ x: 0, y: 0 });
  const gestureMovedRef = useRef(false);
  const hitTargetsRef = useRef<GraftSketchFenestrationHitTarget[]>([]);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const syncZoomDisplay = useCallback(() => {
    setZoomDisplay(Math.round(zoomRef.current * 100));
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.floor(width * dpr);
    const targetHeight = Math.floor(height * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(dpr, dpr);

    const renderResult = renderGraftSketch({
      ctx: context,
      width,
      height,
      result,
      caseInput,
      mode: "preview",
      az: azRef.current,
      el: elRef.current,
      zoom: zoomRef.current,
      panX: panXRef.current,
      panY: panYRef.current,
      layout,
      fenestrationFrame,
      selectedFenestrationIndex,
    });
    hitTargetsRef.current = renderResult.fenestrationHitTargets;
  }, [
    caseInput,
    fenestrationFrame,
    height,
    layout,
    result,
    selectedFenestrationIndex,
    width,
  ]);

  useEffect(() => {
    paint();
  }, [paint]);

  const applyRotateDelta = useCallback((dx: number, dy: number) => {
    azRef.current += dx * 0.008;
    elRef.current = Math.max(
      EL_MIN,
      Math.min(EL_MAX, elRef.current + dy * 0.005),
    );
  }, []);

  const applyMoveDelta = useCallback((dx: number, dy: number) => {
    panXRef.current += dx;
    panYRef.current += dy;
  }, []);

  const handlePointerStart = useCallback(
    (clientX: number, clientY: number) => {
      draggingRef.current = true;
      activeModeRef.current = mode;
      lastXRef.current = clientX;
      lastYRef.current = clientY;
      gestureOriginRef.current = { x: clientX, y: clientY };
      gestureMovedRef.current = false;
    },
    [mode],
  );

  const selectAtClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !onSelectFenestration) {
        return false;
      }

      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const candidates = hitTargetsRef.current
        .map((target) => ({
          target,
          normalizedDistance:
            ((x - target.x) / target.radiusX) ** 2 +
            ((y - target.y) / target.radiusY) ** 2,
        }))
        .filter(({ normalizedDistance }) => normalizedDistance <= 1.25)
        .sort((a, b) => {
          if (a.target.front !== b.target.front) {
            return a.target.front ? -1 : 1;
          }
          return a.normalizedDistance - b.normalizedDistance;
        });

      const match = candidates[0]?.target;
      if (!match) {
        return false;
      }

      onSelectFenestration(match.index);
      return true;
    },
    [onSelectFenestration],
  );

  const onMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    handlePointerStart(event.clientX, event.clientY);
    event.preventDefault();
  }, [handlePointerStart]);

  const onWheel = useCallback((event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    zoomRef.current = clampZoom(zoomRef.current * factor);
    syncZoomDisplay();
    paint();
  }, [paint, syncZoomDisplay]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;

      const dx = event.clientX - lastXRef.current;
      const dy = event.clientY - lastYRef.current;
      if (
        Math.hypot(
          event.clientX - gestureOriginRef.current.x,
          event.clientY - gestureOriginRef.current.y,
        ) > 4
      ) {
        gestureMovedRef.current = true;
      }
      lastXRef.current = event.clientX;
      lastYRef.current = event.clientY;

      if (activeModeRef.current === "move") {
        applyMoveDelta(dx, dy);
      } else {
        applyRotateDelta(dx, dy);
      }

      paint();
    };

    const onUp = () => {
      draggingRef.current = false;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [applyMoveDelta, applyRotateDelta, paint]);

  const onTouchStart = useCallback((event: React.TouchEvent<HTMLCanvasElement>) => {
    if (event.touches.length >= 2) {
      const firstTouch = event.touches[0];
      const secondTouch = event.touches[1];
      pinchDistanceRef.current = Math.hypot(
        secondTouch.clientX - firstTouch.clientX,
        secondTouch.clientY - firstTouch.clientY,
      );
      pinchCenterRef.current = {
        x: (firstTouch.clientX + secondTouch.clientX) / 2,
        y: (firstTouch.clientY + secondTouch.clientY) / 2,
      };
      draggingRef.current = false;
      event.preventDefault();
      return;
    }

    handlePointerStart(event.touches[0].clientX, event.touches[0].clientY);
    event.preventDefault();
  }, [handlePointerStart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMove = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        gestureMovedRef.current = true;
        const firstTouch = event.touches[0];
        const secondTouch = event.touches[1];
        const nextDistance = Math.hypot(
          secondTouch.clientX - firstTouch.clientX,
          secondTouch.clientY - firstTouch.clientY,
        );

        if (pinchDistanceRef.current > 0) {
          zoomRef.current = clampZoom(
            zoomRef.current * (nextDistance / pinchDistanceRef.current),
          );
          syncZoomDisplay();
        }

        const nextCenter = {
          x: (firstTouch.clientX + secondTouch.clientX) / 2,
          y: (firstTouch.clientY + secondTouch.clientY) / 2,
        };
        applyMoveDelta(
          nextCenter.x - pinchCenterRef.current.x,
          nextCenter.y - pinchCenterRef.current.y,
        );

        pinchDistanceRef.current = nextDistance;
        pinchCenterRef.current = nextCenter;
        draggingRef.current = false;
        event.preventDefault();
        paint();
        return;
      }

      if (!draggingRef.current || event.touches.length !== 1) return;

      const dx = event.touches[0].clientX - lastXRef.current;
      const dy = event.touches[0].clientY - lastYRef.current;
      if (
        Math.hypot(
          event.touches[0].clientX - gestureOriginRef.current.x,
          event.touches[0].clientY - gestureOriginRef.current.y,
        ) > 4
      ) {
        gestureMovedRef.current = true;
      }
      lastXRef.current = event.touches[0].clientX;
      lastYRef.current = event.touches[0].clientY;

      if (activeModeRef.current === "move") {
        applyMoveDelta(dx, dy);
      } else {
        applyRotateDelta(dx, dy);
      }

      event.preventDefault();
      paint();
    };

    const onEnd = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        handlePointerStart(event.touches[0].clientX, event.touches[0].clientY);
      } else {
        draggingRef.current = false;
        const changedTouch = event.changedTouches[0];
        if (changedTouch && !gestureMovedRef.current) {
          selectAtClientPoint(changedTouch.clientX, changedTouch.clientY);
        }
      }
      pinchDistanceRef.current = 0;
    };

    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onEnd);
    canvas.addEventListener("touchcancel", onEnd);

    return () => {
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onEnd);
      canvas.removeEventListener("touchcancel", onEnd);
    };
  }, [
    applyMoveDelta,
    applyRotateDelta,
    handlePointerStart,
    paint,
    selectAtClientPoint,
    syncZoomDisplay,
  ]);

  const adjustZoom = useCallback((factor: number) => {
    zoomRef.current = clampZoom(zoomRef.current * factor);
    syncZoomDisplay();
    paint();
  }, [paint, syncZoomDisplay]);

  const resetView = useCallback(() => {
    azRef.current = AZ_DEFAULT;
    elRef.current = EL_DEFAULT;
    zoomRef.current = ZOOM_DEFAULT;
    panXRef.current = 0;
    panYRef.current = defaultPanY;
    syncZoomDisplay();
    paint();
  }, [defaultPanY, paint, syncZoomDisplay]);

  return (
    <div ref={frameRef} className={cn("w-full select-none", className)}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          onClick={(event) => {
            if (gestureMovedRef.current) {
              gestureMovedRef.current = false;
              return;
            }
            selectAtClientPoint(event.clientX, event.clientY);
          }}
          onWheel={onWheel}
          role={onSelectFenestration ? "application" : undefined}
          tabIndex={onSelectFenestration ? 0 : undefined}
          aria-label={
            onSelectFenestration
              ? "Interactive PMEG model. Drag to rotate and select a fenestration to inspect measurements."
              : undefined
          }
          className={cn(
            "w-full rounded-[18px] border border-[color:var(--border)] cursor-grab active:cursor-grabbing",
            onSelectFenestration && "cursor-crosshair",
            canvasClassName,
          )}
        />

        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span
            className="rounded-[10px] px-2 py-1 text-[11px] leading-none"
            style={{
              background: "rgba(16,33,31,0.55)",
              color: "rgba(255,255,255,0.80)",
              backdropFilter: "blur(4px)",
            }}
          >
            {mode === "move" ? "Drag to move" : "Drag to rotate"}
          </span>
          <button
            onClick={() => setMode("rotate")}
            className="rounded-[10px] px-2 py-1 text-[11px] leading-none"
            style={{
              background:
                mode === "rotate"
                  ? "rgba(16,33,31,0.78)"
                  : "rgba(16,33,31,0.55)",
              color: "rgba(255,255,255,0.86)",
              backdropFilter: "blur(4px)",
              border: "none",
              cursor: "pointer",
            }}
          >
            Rotate
          </button>
          <button
            onClick={() => setMode("move")}
            className="rounded-[10px] px-2 py-1 text-[11px] leading-none"
            style={{
              background:
                mode === "move"
                  ? "rgba(16,33,31,0.78)"
                  : "rgba(16,33,31,0.55)",
              color: "rgba(255,255,255,0.86)",
              backdropFilter: "blur(4px)",
              border: "none",
              cursor: "pointer",
            }}
          >
            Move
          </button>
          <button
            onClick={resetView}
            className="rounded-[10px] px-2 py-1 text-[11px] leading-none"
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
            onClick={() => adjustZoom(0.9)}
            className="rounded-[10px] px-2 py-1 text-[11px] leading-none"
            style={{
              background: "rgba(16,33,31,0.55)",
              color: "rgba(255,255,255,0.86)",
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
            {zoomDisplay}%
          </span>
          <button
            onClick={() => adjustZoom(1.1)}
            className="rounded-[10px] px-2 py-1 text-[11px] leading-none"
            style={{
              background: "rgba(16,33,31,0.55)",
              color: "rgba(255,255,255,0.86)",
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
