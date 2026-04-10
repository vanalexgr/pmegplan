import { z } from "zod";

import { ALL_DEVICES } from "@/lib/devices";

const knownDeviceIds = new Set(ALL_DEVICES.map((device) => device.id));
const auditPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const auditEventTypeSchema = z.enum([
  "planner_opened",
  "analysis_started",
  "analysis_completed",
  "analysis_invalidated",
  "sample_loaded",
  "saved_project_loaded",
  "device_selection_changed",
  "workspace_edit",
  "share_link_copied",
  "export_bundle_downloaded",
]);

export type AuditEventType = z.infer<typeof auditEventTypeSchema>;

export const auditActorSchema = z.object({
  sessionId: z.string().min(1).max(120),
  name: z.string().max(120).optional(),
  email: z.string().max(160).optional(),
  organization: z.string().max(120).optional(),
});

export type AuditActor = z.output<typeof auditActorSchema>;

export const auditCaseSnapshotSchema = z.object({
  projectId: z.string().min(1).optional(),
  patientId: z.string().max(80).optional(),
  surgeonName: z.string().max(80).optional(),
  neckDiameterMm: z.number().min(0).max(100).optional(),
  fenestrationCount: z.number().int().min(0).max(4).optional(),
  selectedDeviceIds: z
    .array(z.string())
    .refine(
      (deviceIds) => deviceIds.every((deviceId) => knownDeviceIds.has(deviceId)),
      "Audit payload contains an unknown device id.",
    )
    .optional(),
});

export const auditResultSummarySchema = z.object({
  recommendedDeviceId: z.string().nullable().optional(),
  recommendedDeviceName: z.string().nullable().optional(),
  recommendedGraftDiameterMm: z.number().nullable().optional(),
  recommendedScore: z.number().nullable().optional(),
  compatibleDeviceCount: z.number().int().min(0).optional(),
});

export const auditDetailsSchema = z
  .record(z.string(), auditPrimitiveSchema)
  .optional();

export const auditEventPayloadSchema = z.object({
  type: auditEventTypeSchema,
  actor: auditActorSchema,
  caseSnapshot: auditCaseSnapshotSchema.optional(),
  resultSummary: auditResultSummarySchema.optional(),
  details: auditDetailsSchema,
});

export type AuditEventPayload = z.output<typeof auditEventPayloadSchema>;

export const auditRequestContextSchema = z.object({
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  forwardedFor: z.string().optional(),
});

export const auditEventRecordSchema = auditEventPayloadSchema.extend({
  id: z.string().min(1),
  occurredAt: z.string().min(1),
  requestContext: auditRequestContextSchema.optional(),
});

export type AuditEventRecord = z.output<typeof auditEventRecordSchema>;
