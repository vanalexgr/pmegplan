import type { CaseInput } from "@/lib/types";

export const sampleCase: CaseInput = {
  neckDiameterMm: 27,
  patientId: "Demo-2026-001",
  surgeonName: "Vangelis Alexiou",
  surgeonNote:
    "Sample planning case used to verify rotation windows across infrarenal PMEG platforms.",
  fenestrations: [
    {
      vessel: "SMA",
      ftype: "SCALLOP",
      clock: "12:45",
      depthMm: 22,
      widthMm: 20,
      heightMm: 20,
    },
    {
      vessel: "LRA",
      ftype: "SMALL_FEN",
      clock: "3:45",
      depthMm: 35,
      widthMm: 6,
      heightMm: 6,
    },
    {
      vessel: "RRA",
      ftype: "SMALL_FEN",
      clock: "9:45",
      depthMm: 38,
      widthMm: 6,
      heightMm: 6,
    },
  ],
};

