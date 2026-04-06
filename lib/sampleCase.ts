import type { CaseInput } from "@/lib/types";

export const sampleCase: CaseInput = {
  neckDiameterMm: 24,
  patientId: "Demo-2026-002",
  surgeonName: "VGA",
  surgeonNote: "Two-renal demonstration case.",
  fenestrations: [
    {
      vessel: "RRA",
      ftype: "SMALL_FEN",
      clock: "9:30",
      depthMm: 14,
      widthMm: 6,
      heightMm: 6,
    },
    {
      vessel: "LRA",
      ftype: "SMALL_FEN",
      clock: "2:30",
      depthMm: 14,
      widthMm: 6,
      heightMm: 6,
    },
  ],
};
