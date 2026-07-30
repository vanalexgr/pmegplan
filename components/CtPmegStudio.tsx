"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Crosshair,
  Database,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import { CtModelViewport } from "@/components/CtModelViewport";
import { analyseDeviceGeometry } from "@/lib/analysis";
import {
  CT_PLATFORMS,
  isCtSizeSelection,
  selectCtComponent,
  type CtPlatformId,
} from "@/lib/ctDeviceCatalog";
import { sampleCase } from "@/lib/sampleCase";
import type { CaseInput, Fenestration, VesselName } from "@/lib/types";
import { cn } from "@/lib/utils";

const VESSELS: VesselName[] = [
  "CELIAC",
  "SMA",
  "RRA",
  "LRA",
  "LMA",
  "CUSTOM",
];

function NumberControl({
  label,
  value,
  onChange,
  suffix = "mm",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <label className="flex min-w-[104px] items-center gap-2 rounded-xl border border-[#c6d4d0] bg-white/72 px-3 py-2">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6d817d]">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={1}
        step={1}
        className="w-10 bg-transparent text-right font-mono text-xs font-semibold text-[#0a2633] outline-none"
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      <span className="font-mono text-[9px] text-[#7a8c88]">{suffix}</span>
    </label>
  );
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
    <div className="absolute right-4 top-[86px] z-50 w-[min(520px,calc(100vw-32px))] overflow-hidden rounded-[22px] border border-white/15 bg-[#071a27]/96 text-white shadow-[0_30px_90px_-25px_rgba(0,0,0,0.8)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-xs font-semibold">Planned openings</p>
          <p className="mt-0.5 text-[10px] text-white/40">
            Clock and depth are transformed into final graft coordinates.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-white/60 hover:bg-white/5"
          onClick={onClose}
        >
          Done
        </button>
      </div>

      <div className="max-h-[55vh] space-y-2 overflow-y-auto p-3">
        {fenestrations.map((fenestration, index) => (
          <div
            key={`${fenestration.vessel}-${index}`}
            className="grid grid-cols-[1.2fr_0.8fr_0.7fr_0.7fr_auto] items-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] p-2"
          >
            <select
              value={fenestration.vessel}
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
            <input
              aria-label={`${fenestration.vessel} clock`}
              value={fenestration.clock}
              className="h-9 rounded-lg border border-white/10 bg-[#102b38] px-2 font-mono text-[11px] outline-none"
              onChange={(event) => {
                const nextClock = event.target.value.trim();
                if (/^(?:[1-9]|1[0-2])(?::[0-5]\d)?$/.test(nextClock)) {
                  patch(index, { clock: nextClock });
                }
              }}
            />
            <input
              aria-label={`${fenestration.vessel} depth`}
              type="number"
              value={fenestration.depthMm}
              className="h-9 rounded-lg border border-white/10 bg-[#102b38] px-2 font-mono text-[11px] outline-none"
              onChange={(event) =>
                patch(index, { depthMm: Number(event.target.value) })
              }
            />
            <input
              aria-label={`${fenestration.vessel} opening diameter`}
              type="number"
              value={fenestration.widthMm}
              className="h-9 rounded-lg border border-white/10 bg-[#102b38] px-2 font-mono text-[11px] outline-none"
              onChange={(event) => {
                const diameter = Number(event.target.value);
                patch(index, {
                  widthMm: diameter,
                  heightMm: diameter,
                });
              }}
            />
            <button
              type="button"
              aria-label={`Remove ${fenestration.vessel}`}
              className="flex size-9 items-center justify-center rounded-lg text-white/35 hover:bg-white/5 hover:text-[#ff9a83]"
              onClick={() =>
                onChange(
                  fenestrations.filter((_, current) => current !== index),
                )
              }
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
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

export function CtPmegStudio() {
  const [platformId, setPlatformId] =
    useState<CtPlatformId>("zenith-alpha-thoracic");
  const [proximalDiameterMm, setProximalDiameterMm] = useState(24);
  const [distalDiameterMm, setDistalDiameterMm] = useState(24);
  const [requiredLengthMm, setRequiredLengthMm] = useState(150);
  const [fenestrations, setFenestrations] = useState<Fenestration[]>(
    sampleCase.fenestrations,
  );
  const [showOpenings, setShowOpenings] = useState(false);

  const selection = useMemo(
    () =>
      selectCtComponent(
        platformId,
        proximalDiameterMm,
        distalDiameterMm,
        requiredLengthMm,
      ),
    [
      distalDiameterMm,
      platformId,
      proximalDiameterMm,
      requiredLengthMm,
    ],
  );
  const caseInput: CaseInput = useMemo(
    () => ({
      neckDiameterMm: Math.round(proximalDiameterMm),
      fenestrations,
    }),
    [fenestrations, proximalDiameterMm],
  );
  const result = useMemo(
    () =>
      isCtSizeSelection(selection)
        ? analyseDeviceGeometry(caseInput, selection.device)
        : null,
    [caseInput, selection],
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
                CT model workspace
              </p>
            </div>
          </div>

          <div className="flex rounded-xl border border-[#c6d4d0] bg-white/70 p-1">
            {CT_PLATFORMS.map((platform) => (
              <button
                key={platform.id}
                type="button"
                className={cn(
                  "rounded-lg px-3 py-2 text-[10px] font-semibold transition",
                  platformId === platform.id
                    ? "bg-[#0a2633] text-white"
                    : "text-[#57706b] hover:bg-white",
                )}
                onClick={() => setPlatformId(platform.id)}
              >
                {platform.shortLabel}
              </button>
            ))}
          </div>

          <div className="flex flex-1 flex-wrap gap-2">
            <NumberControl
              label="Prox OD"
              value={proximalDiameterMm}
              onChange={setProximalDiameterMm}
            />
            <NumberControl
              label="Dist OD"
              value={distalDiameterMm}
              onChange={setDistalDiameterMm}
            />
            <NumberControl
              label="Min length"
              value={requiredLengthMm}
              onChange={setRequiredLengthMm}
            />
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

      {isCtSizeSelection(selection) && result?.size ? (
        <>
          <CtModelViewport caseInput={caseInput} result={result} />
          <div className="absolute bottom-[66px] left-4 z-30 max-w-[calc(100vw-32px)] rounded-[16px] border border-[#b7cac5] bg-white/86 px-3.5 py-3 shadow-sm backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-mono text-[11px] font-semibold text-[#0a2633]">
                {selection.component.code}-{selection.selectedLengthMm}
              </span>
              <span className="h-3 w-px bg-[#b7cac5]" />
              <span className="flex items-center gap-1.5 text-[10px] text-[#57706b]">
                <Database className="size-3 text-[#e96f58]" />
                {selection.reference.id.toUpperCase()}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.11em]",
                  selection.evidence === "measured_scan"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-900",
                )}
              >
                {selection.evidence === "measured_scan"
                  ? "Measured CT"
                  : "CT-scaled proxy"}
              </span>
            </div>
            <p className="mt-1.5 max-w-2xl text-[10px] leading-4 text-[#6a7f7a]">
              {selection.evidence === "measured_scan"
                ? "Measured free-state lattice. Nominal size remains pending packaging confirmation."
                : "Research preview: radial and axial scaling preserve the reference scan phase, but exact ring and peak topology must be verified before fabrication."}
            </p>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-lg text-center">
            <AlertTriangle className="mx-auto size-7 text-amber-600" />
            <h1 className="mt-4 text-2xl font-semibold">
              No exact IFU component match
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#627873]">
              {selection.reason}
            </p>
          </div>
        </div>
      )}

      {isCtSizeSelection(selection) && selection.lengthShortfall ? (
        <div className="absolute right-4 top-[92px] z-30 flex max-w-sm items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/95 px-3 py-2 text-[10px] leading-4 text-amber-900 shadow-sm">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          Longest available component is shorter than the requested minimum.
        </div>
      ) : null}
    </main>
  );
}
