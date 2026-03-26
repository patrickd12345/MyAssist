import "dotenv/config";
import { getIntegrationToken } from "./lib/integrations/tokenStore.js";
import { integrationService } from "./lib/integrations/service.js";

async function main() {
  const userId = "585853a1-202b-4021-8638-3b0e22cb7b27"; // From previous dir listing
  const token = await getIntegrationToken(userId, "google_calendar");
  console.log("=== TOKEN SCOPES ===");
  console.log(token?.scope);

  console.log("=== CALENDAR EVENTS ===");
  const events = await integrationService.fetchCalendarEvents(userId);
  console.log("Events array length:", events?.length);
  if (events && events.length > 0) {
    console.log("First event:", events[0].summary, events[0].start);
  }
}

main().catch(console.error);
