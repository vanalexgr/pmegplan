import type { NextRequest } from "next/server";

import { appendAuditEvent, readAuditEvents } from "@/lib/audit/serverStore";
import { auditEventPayloadSchema } from "@/lib/audit/types";

export const dynamic = "force-dynamic";

function getForwardedFor(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) {
    return undefined;
  }

  return forwardedFor.split(",")[0]?.trim() || undefined;
}

export async function GET(request: NextRequest) {
  try {
    const limitText = request.nextUrl.searchParams.get("limit");
    const limit = Number.parseInt(limitText ?? "50", 10);
    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), 200)
      : 50;
    const events = await readAuditEvents();

    return Response.json({
      events: events.slice(0, safeLimit),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load audit events.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const json = (await request.json()) as unknown;
    const parsed = auditEventPayloadSchema.safeParse(json);

    if (!parsed.success) {
      return Response.json(
        {
          error: "Invalid audit payload.",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const event = await appendAuditEvent(parsed.data, {
      ipAddress: request.headers.get("x-real-ip") ?? getForwardedFor(request),
      forwardedFor: request.headers.get("x-forwarded-for") ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return Response.json({ event }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not store audit event.",
      },
      { status: 500 },
    );
  }
}
