"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  Crosshair,
  Database,
  MoveVertical,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import { CtModelViewport } from "@/components/CtModelViewport";
import { analyseDeviceGeometry } from "@/lib/analysis";
import {
  CT_SCAN_REFERENCES,
  getMeasuredCtScanModel,
  type CtScanId,
} from "@/lib/ctDeviceCatalog";
import { sampleCase } from "@/lib/sampleCase";
import type {
  CaseInput,
  DeviceAnalysisResult,
  Fenestration,
  FenestrationType,
  VesselName,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const VESSELS: VesselName[] = [
  "CELIAC",
  "SMA",
  "RRA",
  "LRA",
  "LMA",
  "CUSTOM",
];

const OPENING_TYPES: Array<{ value: FenestrationType; label: string }> = [
  { value: "SCALLOP", label: "Scallop" },
  { value: "SMALL_FEN", label: "Small fen." },
  { value: "LARGE_FEN", label: "Large fen." },
];

function signedMm(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} mm`;
}

function scanLabel(scanId: CtScanId) {
  const reference = CT_SCAN_REFERENCES.find((item) => item.id === scanId);
  if (!reference) return scanId.toUpperCase();
  const platform =
    reference.platformId === "tx2-pro-form" ? "Cook TX2" : "Cook Zenith Alpha";
  return `${reference.id.toUpperCase()} · ${platform}`;
}

function OpeningsEditor({
  fenestrations,
  onChange,
  onClose,
}: {
  fenestrations: Fenestration[];
  onChange: (fenestrations: Fenestration[]) => void;
  onClose: () => void;
}) {
  const patch = (index: number, next: Partial<Fenestration>) => {
    onChange(
      fenestrations.map((fenestration, current) =>
        current === index ? { ...fenestration, ...next } : fenestration,
      ),
    );
  };

  return (
    <div className="absolute right-4 top-[74px] z-50 w-[min(690px,calc(100vw-32px))] overflow-hidden rounded-[22px] border border-white/15 bg-[#071a27]/96 text-white shadow-[0_30px_90px_-25px_rgba(0,0,0,0.8)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-xs font-semibold">Requested opening pattern</p>
          <p className="mt-0.5 max-w-lg text-[10px] leading-4 text-white/45">
            Enter the anatomic targets. Clock and depth are measured from the
            proximal fabric edge; the CT model will report one shared mark-set
            adjustment without moving individual openings independently.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-white/60 hover:bg-white/5"
          onClick={onClose}
        >
          Done
        </button>
      </div>

      <div className="max-h-[55vh] space-y-2 overflow-y-auto p-3">
        <div className="grid grid-cols-[1.15fr_1fr_0.72fr_0.76fr_0.55fr_0.55fr_32px] gap-2 px-2 font-mono text-[8px] uppercase tracking-[0.1em] text-white/35">
          <span>Vessel</span>
          <span>Opening</span>
          <span>Clock</span>
          <span>Edge depth</span>
          <span>W</span>
          <span>H</span>
        </div>
        {fenestrations.map((fenestration, index) => {
          const isScallop = fenestration.ftype === "SCALLOP";
          return (
            <div
              key={`${fenestration.vessel}-${index}`}
              className="grid grid-cols-[1.15fr_1fr_0.72fr_0.76fr_0.55fr_0.55fr_32px] items-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] p-2"
            >
              <select
                value={fenestration.vessel}
                aria-label={`${fenestration.vessel} vessel`}
                className="h-9 rounded-lg border border-white/10 bg-[#102b38] px-2 text-[11px] outline-none"
                onChange={(event) =>
                  patch(index, { vessel: event.target.value as VesselName })
                }
              >
                {VESSELS.map((vessel) => (
                  <option key={vessel} value={vessel}>
                    {vessel}
                  </option>
                ))}
              </select>
              <select
                value={fenestration.ftype}
                aria-label={`${fenestration.vessel} opening type`}
                className="h-9 rounded-lg border border-white/10 bg-[#102b38] px-2 text-[11px] outline-none"
                onChange={(event) => {
                  const ftype = event.target.value as FenestrationType;
                  patch(index, {
                    ftype,
                    ...(ftype === "SCALLOP" ? { depthMm: 0 } : {}),
                  });
                }}
              >
                {OPENING_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <input
                aria-label={`${fenestration.vessel} target clock`}
                value={fenestration.clock}
                inputMode="text"
                className="h-9 rounded-lg border border-white/10 bg-[#102b38] px-2 font-mono text-[11px] outline-none"
                onChange={(event) => {
                  const nextClock = event.target.value.trim();
                  if (/^(?:[1-9]|1[0-2])(?::[0-5]\d)?$/.test(nextClock)) {
                    patch(index, { clock: nextClock });
                  }
                }}
              />
              <input
                aria-label={`${fenestration.vessel} requested depth from proximal fabric edge`}
                type="number"
                min={0}
                value={isScallop ? 0 : fenestration.depthMm}
                disabled={isScallop}
                className="h-9 rounded-lg border border-white/10 bg-[#102b38] px-2 font-mono text-[11px] outline-none disabled:cursor-not-allowed disabled:opacity-35"
                onChange={(event) => patch(index, { depthMm: Number(event.target.value) })}
              />
              <input
                aria-label={`${fenestration.vessel} opening width`}
                type="number"
                min={0}
                value={fenestration.widthMm}
                disabled={isScallop}
                className="h-9 rounded-lg border border-white/10 bg-[#102b38] px-2 font-mono text-[11px] outline-none disabled:cursor-not-allowed disabled:opacity-35"
                onChange={(event) => patch(index, { widthMm: Number(event.target.value) })}
              />
              <input
                aria-label={`${fenestration.vessel} opening height`}
                type="number"
                min={0}
                value={fenestration.heightMm}
                disabled={isScallop}
                className="h-9 rounded-lg border border-white/10 bg-[#102b38] px-2 font-mono text-[11px] outline-none disabled:cursor-not-allowed disabled:opacity-35"
                onChange={(event) => patch(index, { heightMm: Number(event.target.value) })}
              />
              <button
                type="button"
                aria-label={`Remove ${fenestration.vessel}`}
                className="flex size-8 items-center justify-center rounded-lg text-white/35 hover:bg-white/5 hover:text-[#ff9a83]"
                onClick={() =>
                  onChange(
                    fenestrations.filter((_, current) => current !== index),
                  )
                }
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/65 hover:bg-white/5"
          onClick={() =>
            onChange([
              ...fenestrations,
              {
                vessel: "CUSTOM",
                ftype: "SMALL_FEN",
                clock: "12:00",
                depthMm: 20,
                widthMm: 6,
                heightMm: 6,
              },
            ])
          }
        >
          <Plus className="size-3.5" />
          Add opening
        </button>
      </div>
    </div>
  );
}

function CtLatticeAdjustment({
  result,
}: {
  result: DeviceAnalysisResult;
}) {
  const rotation = result.rotation;
  const depth = result.depthOptimisation;
  const rotationText =
    rotation.optimalDeltaDeg === 0
      ? "0°"
      : `${rotation.optimalDeltaDeg.toFixed(1)}° ${
          rotation.optimalDeltaDeg > 180 ? "CW" : "CCW"
        }`;

  return (
    <div className="absolute bottom-[66px] left-4 z-30 max-w-[calc(100vw-32px)] rounded-[16px] border border-[#b7cac5] bg-white/88 px-3.5 py-3 shadow-sm backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#0a2633]">
          Shared CT-lattice transform
        </span>
        <span className="h-3 w-px bg-[#b7cac5]" />
        <span className="flex items-center gap-1.5 text-[10px] text-[#57706b]">
          <RotateCcw className="size-3 text-[#e96f58]" />
          {rotationText}
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-[#57706b]">
          <MoveVertical className="size-3 text-[#e96f58]" />
          {signedMm(depth.optimalDeltaMm)} from edge
        </span>
      </div>
      <p className="mt-1.5 max-w-2xl text-[10px] leading-4 text-[#6a7f7a]">
        Requested openings remain a fixed pattern. The software proposes one
        global circumferential and axial translation against this measured CT
        lattice; it does not independently relocate individual holes.
      </p>
    </div>
  );
}

export function CtPmegStudio() {
  const [scanId, setScanId] = useState<CtScanId>("scan1");
  const [fenestrations, setFenestrations] = useState<Fenestration[]>(
    sampleCase.fenestrations,
  );
  const [showOpenings, setShowOpenings] = useState(false);

  const measuredScan = useMemo(() => getMeasuredCtScanModel(scanId), [scanId]);
  const caseInput: CaseInput = useMemo(
    () => ({
      // The selected physical scan, not aortic sizing, defines the model.
      neckDiameterMm: 0,
      fenestrations,
    }),
    [fenestrations],
  );
  const result = useMemo(
    () => analyseDeviceGeometry(caseInput, measuredScan.device),
    [caseInput, measuredScan.device],
  );

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#dfe8e5] text-[#0a2633]">
      <header className="relative z-40 border-b border-[#b9cbc7] bg-[#eef4f2]/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-3">
          <div className="mr-1 flex min-w-[174px] items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-[#0a2633] text-[#ff8a72]">
              <Crosshair className="size-4" strokeWidth={2.6} />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">PMEGplan</p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[#6d817d]">
                measured CT workspace
              </p>
            </div>
          </div>

          <div className="flex flex-1 flex-wrap gap-1 rounded-xl border border-[#c6d4d0] bg-white/70 p-1">
            {CT_SCAN_REFERENCES.map((reference) => (
              <button
                key={reference.id}
                type="button"
                className={cn(
                  "rounded-lg px-3 py-2 text-left text-[10px] font-semibold transition",
                  scanId === reference.id
                    ? "bg-[#0a2633] text-white"
                    : "text-[#57706b] hover:bg-white",
                )}
                onClick={() => setScanId(reference.id)}
              >
                {scanLabel(reference.id)}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-[#c6d4d0] bg-white/72 px-3 py-2.5 text-[10px] font-semibold text-[#315852]"
            onClick={() => setShowOpenings((current) => !current)}
          >
            <SlidersHorizontal className="size-3.5" />
            Openings {fenestrations.length}
            <ChevronDown
              className={cn(
                "size-3 transition-transform",
                showOpenings && "rotate-180",
              )}
            />
          </button>
        </div>
      </header>

      {showOpenings ? (
        <OpeningsEditor
          fenestrations={fenestrations}
          onChange={setFenestrations}
          onClose={() => setShowOpenings(false)}
        />
      ) : null}

      <CtModelViewport caseInput={caseInput} result={result} />
      <CtLatticeAdjustment result={result} />

      <div className="pointer-events-none absolute right-4 top-[88px] z-30 max-w-sm rounded-xl border border-[#b7cac5] bg-white/86 px-3 py-2.5 shadow-sm backdrop-blur-xl">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#315852]">
          <Database className="size-3.5 text-[#e96f58]" />
          {scanLabel(scanId)}
        </div>
        <p className="mt-1 text-[10px] leading-4 text-[#6a7f7a]">
          Actual free-state CT geometry. No size interpolation, radial scaling,
          or axial stretching is rendered.
        </p>
      </div>
    </main>
  );
}
