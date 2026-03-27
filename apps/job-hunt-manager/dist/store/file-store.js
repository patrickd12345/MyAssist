import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
export function defaultDataPath() {
    return process.env.JOB_HUNT_DATA_PATH ?? join(homedir(), ".job-hunt-manager", "store.json");
}
export function emptyState() {
    return {
        version: 1,
        userTracks: [],
        jobIndex: {},
        saved: {},
        lifecycle: {},
        transcripts: {},
        touchpoints: {},
    };
}
export function loadState(path = defaultDataPath()) {
    if (!existsSync(path)) {
        return emptyState();
    }
    try {
        const raw = readFileSync(path, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed.version !== 1)
            return emptyState();
        return {
            ...emptyState(),
            ...parsed,
            userTracks: parsed.userTracks ?? [],
            jobIndex: parsed.jobIndex ?? {},
            saved: parsed.saved ?? {},
            lifecycle: parsed.lifecycle ?? {},
            transcripts: parsed.transcripts ?? {},
            touchpoints: parsed.touchpoints ?? {},
        };
    }
    catch {
        return emptyState();
    }
}
export function saveState(state, path = defaultDataPath()) {
    const dir = dirname(path);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(path, JSON.stringify(state, null, 2), "utf8");
}
