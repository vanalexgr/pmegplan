# Usage Logs

This app stores planner usage events on the server, but those logs are no longer shown inside the planner UI.

## What is logged

Each tracked event can include:

- event type, timestamp, and session ID
- operator name, email, and organisation if the user fills them in
- patient ID, surgeon name, neck diameter, fenestration count, and selected devices
- top recommendation and score after analysis
- request metadata such as IP address and user agent

Tracked actions include planner open, analysis start, analysis complete, analysis invalidation after edits, sample load, saved project load, device selection changes, workspace edits, share-link copy, and export download.

## Required setup

You already need `BLOB_READ_WRITE_TOKEN` for storage on Vercel.

To make log reading private, add a second environment variable in the Vercel `pmegplan` project:

- Name: `AUDIT_LOGS_ADMIN_TOKEN`
- Value: a long random secret that only you know
- Environment: `Production`

After adding or changing it, redeploy the project.

## How to read the logs

Run this from your terminal:

```bash
export PMEGPLAN_BASE_URL="https://pmegplan.vercel.app"
export AUDIT_LOGS_ADMIN_TOKEN="your-secret-token"

curl -sS \
  -H "Authorization: Bearer $AUDIT_LOGS_ADMIN_TOKEN" \
  "$PMEGPLAN_BASE_URL/api/audit?limit=100" | python3 -m json.tool
```

Notes:

- `limit` can be between `1` and `200`
- do not share the admin token
- if you prefer, you can send the token as `x-audit-admin-token` instead of `Authorization: Bearer ...`

## Useful summaries

Count events by type:

```bash
curl -sS \
  -H "Authorization: Bearer $AUDIT_LOGS_ADMIN_TOKEN" \
  "$PMEGPLAN_BASE_URL/api/audit?limit=200" \
  | jq '.events | group_by(.type) | map({type: .[0].type, count: length})'
```

Show who used the app and what was planned:

```bash
curl -sS \
  -H "Authorization: Bearer $AUDIT_LOGS_ADMIN_TOKEN" \
  "$PMEGPLAN_BASE_URL/api/audit?limit=200" \
  | jq '.events[] | {
      occurredAt,
      type,
      operator: (.actor.email // .actor.name // .actor.sessionId),
      organization: .actor.organization,
      patientId: .caseSnapshot.patientId,
      surgeonName: .caseSnapshot.surgeonName,
      selectedDevices: .caseSnapshot.selectedDeviceIds,
      recommendation: .resultSummary.recommendedDeviceName,
      graftDiameterMm: .resultSummary.recommendedGraftDiameterMm
    }'
```

## Failure modes

- `401 Unauthorized`: the token is missing or wrong
- `503`: `AUDIT_LOGS_ADMIN_TOKEN` is not configured in the deployed environment
- storage errors: check the Vercel function logs and confirm `BLOB_READ_WRITE_TOKEN` is still present
