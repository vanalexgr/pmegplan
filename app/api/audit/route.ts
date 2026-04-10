import type { NextRequest } from "next/server";

import { appendAuditEvent, readAuditEvents } from "@/lib/audit/serverStore";
import { auditEventPayloadSchema } from "@/lib/audit/types";

export const dynamic = "force-dynamic";

const AUDIT_ADMIN_TOKEN_HEADER = "x-audit-admin-token";
const GET_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  Vary: `Authorization, ${AUDIT_ADMIN_TOKEN_HEADER}`,
};

function getForwardedFor(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) {
    return undefined;
  }

  return forwardedFor.split(",")[0]?.trim() || undefined;
}

function getConfiguredAdminToken() {
  const token = process.env.AUDIT_LOGS_ADMIN_TOKEN?.trim();
  return token ? token : null;
}

function getProvidedAdminToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim() || null;
  }

  const headerToken = request.headers.get(AUDIT_ADMIN_TOKEN_HEADER)?.trim();
  return headerToken ? headerToken : null;
}

export async function GET(request: NextRequest) {
  const configuredToken = getConfiguredAdminToken();
  if (!configuredToken) {
    return Response.json(
      {
        error:
          "Audit log access is not configured. Set AUDIT_LOGS_ADMIN_TOKEN to enable private usage-log access.",
      },
      {
        status: 503,
        headers: GET_RESPONSE_HEADERS,
      },
    );
  }

  const providedToken = getProvidedAdminToken(request);
  if (providedToken !== configuredToken) {
    return Response.json(
      {
        error: "Unauthorized.",
      },
      {
        status: 401,
        headers: GET_RESPONSE_HEADERS,
      },
    );
  }

  try {
    const limitText = request.nextUrl.searchParams.get("limit");
    const limit = Number.parseInt(limitText ?? "50", 10);
    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), 200)
      : 50;
    const events = await readAuditEvents();

    return Response.json({
      events: events.slice(0, safeLimit),
    }, {
      headers: GET_RESPONSE_HEADERS,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load audit events.",
      },
      {
        status: 500,
        headers: GET_RESPONSE_HEADERS,
      },
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
