"use client";

import {
  type AuditActor,
  type AuditEventPayload,
  type AuditEventRecord,
} from "@/lib/audit/types";

const AUDIT_SESSION_STORAGE_KEY = "pmegplan.audit-session-id";
const AUDIT_OPERATOR_STORAGE_KEY = "pmegplan.audit-operator";

export interface OperatorProfile {
  name: string;
  email: string;
  organization: string;
}

function canUseStorage() {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function trimText(value: string) {
  return value.trim();
}

export function sanitizeOperatorProfile(profile: OperatorProfile): OperatorProfile {
  return {
    name: trimText(profile.name),
    email: trimText(profile.email),
    organization: trimText(profile.organization),
  };
}

export function loadOperatorProfile(): OperatorProfile {
  if (!canUseStorage()) {
    return {
      name: "",
      email: "",
      organization: "",
    };
  }

  try {
    const raw = window.localStorage.getItem(AUDIT_OPERATOR_STORAGE_KEY);
    if (!raw) {
      return {
        name: "",
        email: "",
        organization: "",
      };
    }

    const parsed = JSON.parse(raw) as Partial<OperatorProfile>;
    return sanitizeOperatorProfile({
      name: parsed.name ?? "",
      email: parsed.email ?? "",
      organization: parsed.organization ?? "",
    });
  } catch {
    return {
      name: "",
      email: "",
      organization: "",
    };
  }
}

export function saveOperatorProfile(profile: OperatorProfile) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    AUDIT_OPERATOR_STORAGE_KEY,
    JSON.stringify(sanitizeOperatorProfile(profile)),
  );
}

function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `session_${Math.random().toString(36).slice(2, 12)}`;
}

export function getOrCreateAuditSessionId() {
  if (!canUseStorage()) {
    return createSessionId();
  }

  const existing = window.localStorage.getItem(AUDIT_SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = createSessionId();
  window.localStorage.setItem(AUDIT_SESSION_STORAGE_KEY, next);
  return next;
}

export function buildAuditActor(
  sessionId: string,
  profile: OperatorProfile,
): AuditActor {
  const sanitized = sanitizeOperatorProfile(profile);

  return {
    sessionId,
    name: sanitized.name || undefined,
    email: sanitized.email || undefined,
    organization: sanitized.organization || undefined,
  };
}

export async function postAuditEvent(payload: AuditEventPayload) {
  const response = await fetch("/api/audit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Could not store audit event.");
  }

  const json = (await response.json()) as { event: AuditEventRecord };
  return json.event;
}
