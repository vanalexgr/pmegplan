import type { CaseInput } from "@/lib/types";

export const sampleCase: CaseInput = {
  neckDiameterMm: 27,
  patientId: "Demo-2026-001",
  surgeonName: "Vangelis Alexiou",
  surgeonNote:
    "Four-vessel planning case with celiac scallop, SMA large fenestration, and bilateral renal targets used to verify rotation windows across infrarenal PMEG platforms.",
  fenestrations: [
    {
      vessel: "CELIAC",
      ftype: "SCALLOP",
      clock: "12:00",
      depthMm: 0,
      widthMm: 20,
      heightMm: 20,
    },
    {
      vessel: "SMA",
      ftype: "LARGE_FEN",
      clock: "12:30",
      depthMm: 12,
      widthMm: 8,
      heightMm: 8,
    },
    {
      vessel: "RRA",
      ftype: "SMALL_FEN",
      clock: "9:30",
      depthMm: 33,
      widthMm: 6,
      heightMm: 6,
    },
    {
      vessel: "LRA",
      ftype: "SMALL_FEN",
      clock: "2:30",
      depthMm: 35,
      widthMm: 6,
      heightMm: 8,
    },
  ],
};
