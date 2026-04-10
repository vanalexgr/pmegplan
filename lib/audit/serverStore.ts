import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { get, list, put } from "@vercel/blob";

import { hashString } from "@/lib/planning/hash";
import {
  auditEventPayloadSchema,
  auditEventRecordSchema,
  type AuditEventPayload,
  type AuditEventRecord,
} from "@/lib/audit/types";

const AUDIT_LOG_PATH = join(process.cwd(), "data", "audit-log.json");
const AUDIT_BLOB_PREFIX = "audit-events/";
const MAX_AUDIT_EVENTS = 1000;

function isBlobAuditEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function isRunningOnVercel() {
  return Boolean(process.env.VERCEL);
}

async function ensureAuditLogDirectory() {
  await mkdir(dirname(AUDIT_LOG_PATH), { recursive: true });
}

function createEventRecord(
  payload: AuditEventPayload,
  requestContext?: AuditEventRecord["requestContext"],
) {
  const validatedPayload = auditEventPayloadSchema.parse(payload);
  const occurredAt = new Date().toISOString();

  return auditEventRecordSchema.parse({
    ...validatedPayload,
    id: hashString(
      JSON.stringify({
        occurredAt,
        type: validatedPayload.type,
        sessionId: validatedPayload.actor.sessionId,
        projectId: validatedPayload.caseSnapshot?.projectId ?? "",
      }),
    ),
    occurredAt,
    requestContext,
  });
}

function getBlobPathname(event: AuditEventRecord) {
  const [datePart] = event.occurredAt.split("T");
  const safeDatePart = datePart ?? "unknown-date";

  return `${AUDIT_BLOB_PREFIX}${safeDatePart}/${event.occurredAt}_${event.id}.json`;
}

async function readAuditEventsFromFile(): Promise<AuditEventRecord[]> {
  try {
    const fileText = await readFile(AUDIT_LOG_PATH, "utf8");
    const parsed = JSON.parse(fileText) as unknown;
    return auditEventRecordSchema.array().parse(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    return [];
  }
}

async function writeAuditEventsToFile(events: AuditEventRecord[]) {
  await ensureAuditLogDirectory();
  await writeFile(
    AUDIT_LOG_PATH,
    JSON.stringify(events.slice(0, MAX_AUDIT_EVENTS), null, 2),
    "utf8",
  );
}

async function readAuditEventsFromBlob(): Promise<AuditEventRecord[]> {
  let cursor: string | undefined;
  let hasMore = true;
  const records: AuditEventRecord[] = [];

  while (hasMore && records.length < MAX_AUDIT_EVENTS) {
    const page = await list({
      prefix: AUDIT_BLOB_PREFIX,
      limit: Math.min(200, MAX_AUDIT_EVENTS - records.length),
      cursor,
    });

    for (const blob of page.blobs) {
      const blobResult = await get(blob.pathname, {
        access: "private",
        useCache: false,
      });

      if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
        continue;
      }

      const jsonText = await new Response(blobResult.stream).text();

      try {
        const parsed = JSON.parse(jsonText) as unknown;
        records.push(auditEventRecordSchema.parse(parsed));
      } catch {
        continue;
      }
    }

    hasMore = page.hasMore;
    cursor = page.cursor;
  }

  return records
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, MAX_AUDIT_EVENTS);
}

async function writeAuditEventToBlob(event: AuditEventRecord) {
  await put(getBlobPathname(event), JSON.stringify(event, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/json",
  });
}

export async function readAuditEvents(): Promise<AuditEventRecord[]> {
  if (isBlobAuditEnabled()) {
    return readAuditEventsFromBlob();
  }

  if (isRunningOnVercel()) {
    throw new Error(
      "Shared audit storage is not configured. Add Vercel Blob to the project so BLOB_READ_WRITE_TOKEN is available.",
    );
  }

  return readAuditEventsFromFile();
}

export async function appendAuditEvent(
  payload: AuditEventPayload,
  requestContext?: AuditEventRecord["requestContext"],
): Promise<AuditEventRecord> {
  const nextEvent = createEventRecord(payload, requestContext);

  if (isBlobAuditEnabled()) {
    await writeAuditEventToBlob(nextEvent);
    return nextEvent;
  }

  if (isRunningOnVercel()) {
    throw new Error(
      "Shared audit storage is not configured. Add Vercel Blob to the project so BLOB_READ_WRITE_TOKEN is available.",
    );
  }

  const events = await readAuditEventsFromFile();
  const nextEvents = [nextEvent, ...events]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, MAX_AUDIT_EVENTS);

  await writeAuditEventsToFile(nextEvents);

  return nextEvent;
}
