import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webEnv = resolve(__dirname, "../../web/.env.local");
if (existsSync(webEnv)) {
  config({ path: webEnv });
}
