import type { TodoistTask } from "@/lib/types";

function taskLine(t: TodoistTask): string {
  const content = t.content;
  const due = t.due as { date?: string } | undefined;
  const p = t.priority;
  const parts: string[] = [];
  if (typeof content === "string") parts.push(content);
  if (due?.date) parts.push(`due ${due.date}`);
  if (typeof p === "number") parts.push(`P${p}`);
  return parts.join(" - ") || JSON.stringify(t);
}

export function TaskList({
  title,
  tasks,
  emptyLabel,
}: {
  title: string;
  tasks: TodoistTask[];
  emptyLabel: string;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-zinc-500">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {tasks.map((t, i) => {
            const id =
              typeof t.id === "string" || typeof t.id === "number"
                ? String(t.id)
                : `idx-${i}`;
            return (
              <li
                key={id}
                className="rounded-md border border-zinc-100 px-3 py-2 dark:border-zinc-800"
              >
                {taskLine(t)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
