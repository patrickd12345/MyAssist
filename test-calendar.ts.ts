import { integrationService } from "./apps/web/lib/integrations/service";
import * as dotenv from "dotenv";

dotenv.config({ path: "./apps/web/.env.local" });

async function run() {
  const users = [
    "585853a1-202b-4021-8638-3b0e22cb7b27",
    "56c6de7e-2be9-455b-a99c-c66b6ef777bf"
  ];
  for (const id of users) {
    console.log(`Checking calendar for ${id}...`);
    try {
      const events = await integrationService.fetchCalendarEvents(id);
      console.log(`User ${id} calendar result:`, events?.length ?? "null (no token or error)", events);
    } catch (e) {
      console.error(`Error for ${id}:`, e.message);
    }
  }
}

run();
