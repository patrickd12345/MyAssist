#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const API_BASE = "https://api.todoist.com/api/v1";

function argValue(flag, fallback = "") {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function normalizeText(v) {
  return String(v ?? "").trim();
}

function toTodoistPriority(reminderPriority) {
  const p = Number(reminderPriority || 0);
  if (!Number.isFinite(p) || p <= 0) return 4; // default
  if (p <= 4) return 1;
  if (p === 5) return 2;
  if (p <= 8) return 3;
  return 4;
}

function parseInput(jsonRaw) {
  const parsed = JSON.parse(jsonRaw);
  if (!Array.isArray(parsed)) {
    throw new Error("Input must be a JSON array.");
  }
  return parsed;
}

function toTaskPayload(reminder, addListAsLabel) {
  const title = normalizeText(reminder.title || reminder.name);
  if (!title) return null;

  const payload = {
    content: title,
    description: normalizeText(reminder.notes || reminder.body),
    priority: toTodoistPriority(reminder.priority),
  };

  const dueDate = reminder.dueDate || reminder.due_date || null;
  if (dueDate) {
    const d = new Date(dueDate);
    if (!Number.isNaN(d.getTime())) {
      payload.due_datetime = d.toISOString();
    }
  }

  if (addListAsLabel) {
    const listName = normalizeText(reminder.list);
    if (listName) {
      payload.labels = [listName];
    }
  }

  if (!payload.description) delete payload.description;
  if (!payload.due_datetime) delete payload.due_datetime;
  if (!payload.labels) delete payload.labels;

  return payload;
}

function dueKeyFromTask(task) {
  const due = task?.due;
  return normalizeText(due?.datetime || due?.date || "");
}

function dedupeKey(content, due) {
  return `${normalizeText(content).toLowerCase()}||${normalizeText(due)}`;
}

async function todoistRequest(token, method, endpoint, body = null) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`${method} ${endpoint} -> ${res.status}: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

async function fetchExistingTaskKeys(token) {
  const keys = new Set();
  let cursor = "";
  let page = 0;

  while (page < 30) {
    page += 1;
    const qs = new URLSearchParams();
    qs.set("limit", "200");
    if (cursor) qs.set("cursor", cursor);

    const data = await todoistRequest(token, "GET", `/tasks?${qs.toString()}`);
    const rows = Array.isArray(data?.results) ? data.results : [];
    for (const t of rows) {
      keys.add(dedupeKey(t?.content, dueKeyFromTask(t)));
    }

    const nextCursor = normalizeText(data?.next_cursor);
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return keys;
}

async function main() {
  const inputPath = argValue("--input");
  const token = normalizeText(process.env.TODOIST_API_TOKEN);
  const dryRun = !hasFlag("--apply");
  const includeCompleted = hasFlag("--include-completed");
  let disableDedupe = hasFlag("--no-dedupe");
  const addListAsLabel = !hasFlag("--no-list-label");

  if (!inputPath) {
    throw new Error(
      "Missing --input path. Example: node tools/import-apple-reminders-to-todoist.mjs --input ~/Desktop/apple-reminders-export.json --apply",
    );
  }
  if (!token && !dryRun) {
    throw new Error("Missing TODOIST_API_TOKEN env var (required with --apply).");
  }
  if (!token && dryRun && !disableDedupe) {
    console.warn(
      "TODOIST_API_TOKEN not set: dry-run will proceed with --no-dedupe behavior.",
    );
    disableDedupe = true;
  }

  const raw = await fs.readFile(path.resolve(inputPath), "utf8");
  const reminders = parseInput(raw);

  const existingKeys = disableDedupe ? new Set() : await fetchExistingTaskKeys(token);
  const planned = [];
  const skipped = [];

  for (const reminder of reminders) {
    const completed = Boolean(reminder.completed);
    if (completed && !includeCompleted) {
      skipped.push({ reason: "completed", title: reminder.title || reminder.name || "" });
      continue;
    }

    const payload = toTaskPayload(reminder, addListAsLabel);
    if (!payload) {
      skipped.push({ reason: "missing-title", title: "" });
      continue;
    }

    const key = dedupeKey(payload.content, payload.due_datetime || "");
    if (!disableDedupe && existingKeys.has(key)) {
      skipped.push({ reason: "duplicate", title: payload.content });
      continue;
    }

    planned.push(payload);
    existingKeys.add(key);
  }

  console.log(`Input reminders: ${reminders.length}`);
  console.log(`Planned creates: ${planned.length}`);
  console.log(`Skipped: ${skipped.length}`);
  if (skipped.length > 0) {
    const counts = skipped.reduce((acc, s) => {
      const k = s.reason;
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    console.log("Skip reasons:", counts);
  }

  if (dryRun) {
    console.log("\nDry run only. Add --apply to create tasks in Todoist.");
    console.log("Example payload preview:");
    console.log(JSON.stringify(planned.slice(0, 5), null, 2));
    return;
  }

  let created = 0;
  for (const payload of planned) {
    await todoistRequest(token, "POST", "/tasks", payload);
    created += 1;
    if (created % 25 === 0) {
      console.log(`Created ${created}/${planned.length}`);
    }
  }

  console.log(`Done. Created ${created} task(s) in Todoist.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
