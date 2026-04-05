import type { CaseInput } from "@/lib/types";

export const sampleCase: CaseInput = {
  neckDiameterMm: 24,
  patientId: "Demo-2026-002",
  surgeonName: "Vangelis Alexiou",
  surgeonNote:
    "Two-renal demonstration case with slightly deeper, more oblique renal targets than the original sample. TREO still performs strongly, but the anatomy also gives Endurant II a more credible planning score instead of making the starter case feel like a TREO-only showcase.",
  fenestrations: [
    {
      vessel: "RRA",
      ftype: "SMALL_FEN",
      clock: "9:30",
      depthMm: 18,
      widthMm: 6,
      heightMm: 6,
    },
    {
      vessel: "LRA",
      ftype: "SMALL_FEN",
      clock: "2:30",
      depthMm: 20,
      widthMm: 6,
      heightMm: 8,
    },
  ],
};
