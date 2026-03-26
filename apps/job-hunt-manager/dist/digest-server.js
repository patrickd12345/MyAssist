import { createServer } from "node:http";
import { HuntService } from "./services/hunt-service.js";
import { defaultDataPath } from "./store/file-store.js";
const port = Number(process.env.JOB_HUNT_DIGEST_PORT ?? "3847");
const dataPath = process.env.JOB_HUNT_DATA_PATH ?? defaultDataPath();
const svc = new HuntService(dataPath);
createServer((req, res) => {
    if (req.url === "/digest" || req.url?.startsWith("/digest?")) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(svc.buildDigest(), null, 2));
        return;
    }
    if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, service: "job-hunt-manager-digest", dataPath }));
        return;
    }
    res.statusCode = 404;
    res.end("not found");
}).listen(port, "127.0.0.1", () => {
    process.stdout.write(`job-hunt digest http://127.0.0.1:${port}/digest (data: ${dataPath})\n`);
});
