# n8n Dormant Status

- n8n is currently dormant.
- Reason: OAuth is now handled in the app.
- Workflow exports under `n8n/` are intentionally preserved and should not be modified in place.
- Docker config, credentials examples, and backups are intentionally retained.
- n8n can be reactivated later if orchestration is needed again.

## Re-enable n8n

1. Uncomment the `n8n` service in `docker-compose.yml`.
2. Start the runtime with `docker compose up -d n8n` from the repo root.
3. Reconnect or recreate any required credentials in the n8n UI.
4. Re-import the preserved workflow JSON from `n8n/` if the runtime is using a fresh data volume.
5. Restore any app environment variables or proxy settings needed for the chosen workflow path.
