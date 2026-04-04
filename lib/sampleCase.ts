import type { CaseInput } from "@/lib/types";

export const sampleCase: CaseInput = {
  neckDiameterMm: 27,
  patientId: "Demo-2026-001",
  surgeonName: "Vangelis Alexiou",
  surgeonNote:
    "Two-renal demonstration case with realistic juxtarenal spacing at roughly 13-16 mm below the proximal edge, used to compare infrarenal PMEG planning windows without forcing an impractical 90-degree-style graft rotation.",
  fenestrations: [
    {
      vessel: "RRA",
      ftype: "SMALL_FEN",
      clock: "9:00",
      depthMm: 14,
      widthMm: 6,
      heightMm: 6,
    },
    {
      vessel: "LRA",
      ftype: "SMALL_FEN",
      clock: "3:00",
      depthMm: 16,
      widthMm: 6,
      heightMm: 8,
    },
  ],
};
