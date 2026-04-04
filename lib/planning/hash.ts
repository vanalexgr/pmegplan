import type { CaseInput } from "@/lib/types";

export function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Deterministic FNV-1a hash of a serialisable value. Key order independent. */
export function hashSnapshot(caseInput: CaseInput, selectedDeviceIds: string[], projectId: string): number {
  // Normalise: sort selectedDeviceIds, sort fenestration fields consistently
  const payload = {
    neckDiameterMm: caseInput.neckDiameterMm,
    fenestrations: [...caseInput.fenestrations].map(f => ({
      vessel: f.vessel,
      ftype: f.ftype,
      clock: f.clock,
      depthMm: f.depthMm,
      widthMm: f.widthMm,
      heightMm: f.heightMm,
    })),
    deviceIds: [...selectedDeviceIds].sort(),
    projectId,
  };
  
  // Use the existing FNV-1a pattern already in lib/planning/project.ts
  const str = JSON.stringify(payload);  // single alloc, normalised structure
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
