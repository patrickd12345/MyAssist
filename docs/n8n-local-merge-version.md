# Local n8n: Merge nodes show "?" and `execute` errors

## Symptom

- Merge nodes render as **unknown** (question mark).
- Errors like: `Cannot read properties of undefined (reading 'execute')`.
- Workflow cannot activate.

## Cause

The repo workflow was exported from a **newer** n8n where the Merge node used **`typeVersion: 3.2`**.

**n8n 1.82.x** (and the `n8n@1.82.0` dev dependency in this repo) only registers Merge versions **1, 2, 2.1, and 3** — there is **no 3.2** in that build. Unknown `typeVersion` loads no node class, which triggers the `execute` error.

A second issue on **n8n 1.82**: the **Schedule Trigger** JSON must include **`field`** inside each `rule.interval[]` item (for example `"field": "days"` for a daily run). An export that only had `triggerAtHour` / `triggerAtMinute` without `field` can leave the trigger in an invalid state and block activation.

## Fix

1. Use the updated `n8n/myassist_unified.json` in this repo (Merge nodes use **`typeVersion: 3`**).
2. Re-import the workflow (or replace the two Merge nodes in the editor: delete broken nodes, add **Merge** from the palette, set mode **Append**, reconnect wires).

## Re-import (CLI)

From repo root (local n8n should be stopped if import complains; otherwise try with it running):

```sh
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('n8n/myassist_unified.json','utf8'));fs.writeFileSync('n8n/myassist_unified.import.json',JSON.stringify([j]));"
npx n8n import:workflow --input n8n/myassist_unified.import.json
```

Then open the imported **MyAssist - Daily Context** workflow, attach credentials, and **activate**.

## Longer term

- Prefer **same major n8n line** locally as in production (n8n Cloud), **or**
- Export workflows from the **oldest** n8n version still supported so node `typeVersion` values stay compatible.
