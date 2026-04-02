import { z } from "zod";

const clockPattern = /^(?:[0-9]|1[0-2]):[0-5][0-9]$/;

export const fenestrationSchema = z.object({
  vessel: z.enum(["SMA", "LRA", "RRA", "LMA", "CELIAC", "CUSTOM"]),
  ftype: z.enum(["SCALLOP", "LARGE_FEN", "SMALL_FEN"]),
  clock: z.string().regex(clockPattern, "Use clock format H:MM from 0:00 to 12:59."),
  depthMm: z.number().min(0).max(200),
  widthMm: z.number().min(4).max(25),
  heightMm: z.number().min(4).max(20),
});

export const caseSchema = z.object({
  neckDiameterMm: z.number().min(16).max(40),
  patientId: z.string().max(80).optional().or(z.literal("")),
  surgeonName: z.string().max(80).optional().or(z.literal("")),
  surgeonNote: z.string().max(400).optional().or(z.literal("")),
  fenestrations: z.array(fenestrationSchema).min(1).max(4),
});

export type CaseFormValues = z.infer<typeof caseSchema>;

