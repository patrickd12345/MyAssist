# n8n Dormant Status

- n8n is currently **dormant** relative to the **MyAssist web app runtime**.
- **Current truth:** Daily context and the Today view are driven by **in-app OAuth** to **Gmail**, **Google Calendar**, and **Todoist**. The app is a **live integration window** over those providers; it is **not** n8n-fed in production or local dev unless someone deliberately re-wires a custom stack.
- **Reason OAuth moved:** Provider connection and reads/writes are owned by `apps/web` adapters; no orchestration webhook is required for the baseline product.
- Workflow exports under `n8n/` are intentionally preserved and should not be modified in place.
- Docker config, credentials examples, and backups are intentionally retained.
- Detailed troubleshooting for **historical** workflow imports remains in `docs/n8n-*.md` (clearly labeled dormant); those docs are **not** current setup steps for running MyAssist.
- n8n can be reactivated later if orchestration is needed again.

## Re-enable n8n

1. Uncomment the `n8n` service in `docker-compose.yml`.
2. Start the runtime with `docker compose up -d n8n` from the repo root.
3. Reconnect or recreate any required credentials in the n8n UI.
4. Re-import the preserved workflow JSON from `n8n/` if the runtime is using a fresh data volume.
5. Restore any app environment variables or proxy settings needed for the chosen workflow path.
