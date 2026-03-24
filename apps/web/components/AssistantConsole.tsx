"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  buildSuggestedPrompts,
  buildWelcomeReply,
  type AssistantMode,
  type AssistantReply,
  type TaskDraft,
} from "@/lib/assistant";
import type { MyAssistDailyContext } from "@/lib/types";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  actions?: string[];
  followUps?: string[];
  mode?: AssistantMode;
  taskDraft?: TaskDraft | null;
};

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function replyToMessage(reply: AssistantReply): ChatMessage {
  return {
    id: createId(),
    role: "assistant",
    text: reply.answer,
    actions: reply.actions,
    followUps: reply.followUps,
    mode: reply.mode,
    taskDraft: reply.taskDraft ?? null,
  };
}

export function AssistantConsole({ context }: { context: MyAssistDailyContext }) {
  const welcome = useMemo(() => {
    const reply = buildWelcomeReply(context);
    return {
      id: "welcome",
      role: "assistant" as const,
      text: reply.answer,
      actions: reply.actions,
      followUps: reply.followUps,
      mode: reply.mode,
      taskDraft: reply.taskDraft ?? null,
    };
  }, [context]);
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingDraftId, setCreatingDraftId] = useState<string | null>(null);

  const promptIdeas = useMemo(() => buildSuggestedPrompts(context), [context]);

  async function sendMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setError(null);
    setMessages((current) => [
      ...current,
      {
        id: createId(),
        role: "user",
        text: trimmed,
      },
    ]);
    setInput("");

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          context,
        }),
      });

      const body = (await response.json()) as AssistantReply & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      setMessages((current) => [...current, replyToMessage(body)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  async function createTaskFromDraft(messageId: string, draft: TaskDraft) {
    setCreatingDraftId(messageId);
    setError(null);

    try {
      const response = await fetch("/api/todoist/tasks/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      });

      const body = (await response.json()) as { error?: string; task?: { content?: string } };
      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          text: `Task created in Todoist: ${body.task?.content ?? draft.content}.`,
          actions: ["Refresh the dashboard", "Break it into steps"],
          followUps: ["Create another task.", "What should I focus on first today?"],
          mode: "fallback",
          taskDraft: null,
        },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Task creation failed");
    } finally {
      setCreatingDraftId(null);
    }
  }

  return (
    <section className="glass-panel-strong rounded-[32px] p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-title text-xs font-semibold text-[#8a654f]">Live assistant</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#20140c]">
            Ask questions, challenge the plan, and pressure-test the day
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#6f5f50]">
            This layer reads the same daily context, then answers with a local model when available and
            falls back to deterministic guidance when it is not.
          </p>
        </div>
        <div className="metric-chip rounded-full px-4 py-2 text-xs font-medium text-[#7d604f]">
          Interactive operator channel
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="glass-panel rounded-[28px] p-4">
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-bubble rounded-[24px] px-4 py-4 ${
                  message.role === "assistant" ? "chat-bubble-assistant" : "chat-bubble-user"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a654f]">
                    {message.role === "assistant" ? "MyAssist" : "You"}
                  </p>
                  {message.mode ? (
                    <span className="signal-pill rounded-full px-2.5 py-1 text-[10px] font-semibold">
                      {message.mode === "ollama" ? "Local model" : "Rule fallback"}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-7 text-[#20140c]">{message.text}</p>
                {message.actions && message.actions.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {message.actions.map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => void sendMessage(`Turn this into a concrete plan: ${action}`)}
                        className="metric-chip rounded-full px-3 py-2 text-xs font-medium text-[#6b4a36] transition hover:bg-white"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                ) : null}
                {message.taskDraft ? (
                  <div className="mt-4 rounded-[20px] border border-[#d8c1ad] bg-white/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a654f]">
                      Draft task
                    </p>
                    <p className="mt-3 text-sm font-semibold leading-6 text-[#20140c]">
                      {message.taskDraft.content}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#7d604f]">
                      {message.taskDraft.dueString ? (
                        <span className="metric-chip rounded-full px-3 py-1.5">
                          Due {message.taskDraft.dueString}
                        </span>
                      ) : null}
                      {message.taskDraft.priority ? (
                        <span className="metric-chip rounded-full px-3 py-1.5">
                          Priority P{message.taskDraft.priority}
                        </span>
                      ) : null}
                    </div>
                    {message.taskDraft.description ? (
                      <p className="mt-3 text-sm leading-6 text-[#6f5f50]">
                        {message.taskDraft.description}
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={creatingDraftId === message.id}
                        onClick={() => void createTaskFromDraft(message.id, message.taskDraft as TaskDraft)}
                        className="rounded-full bg-[#1f140f] px-4 py-2 text-xs font-semibold text-[#fff7ef] transition hover:bg-[#2b1a11] disabled:opacity-50"
                      >
                        {creatingDraftId === message.id ? "Creating..." : "Create task"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void sendMessage(
                            `Refine this draft task before creating it: ${message.taskDraft?.content}${
                              message.taskDraft?.dueString ? `, due ${message.taskDraft.dueString}` : ""
                            }`,
                          )
                        }
                        className="rounded-full border border-[#d8c1ad] px-4 py-2 text-xs font-semibold text-[#6b4a36] transition hover:bg-white/70"
                      >
                        Refine draft
                      </button>
                    </div>
                  </div>
                ) : null}
                {message.followUps && message.followUps.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.followUps.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => void sendMessage(item)}
                        className="rounded-full border border-[#d8c1ad] px-3 py-2 text-xs font-medium text-[#7d604f] transition hover:bg-white/70"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-panel rounded-[28px] p-4">
            <p className="section-title text-xs font-semibold text-[#8a654f]">Quick asks</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {promptIdeas.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                  className="rounded-full border border-[#d8c1ad] bg-white/60 px-3 py-2 text-xs font-medium text-[#6b4a36] transition hover:bg-white"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-[28px] p-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <label htmlFor="assistant-input" className="section-title text-xs font-semibold text-[#8a654f]">
                Ask MyAssist
              </label>
              <textarea
                id="assistant-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask what to do first, what to defer, how to handle a meeting, or turn an item into a plan."
                className="min-h-32 w-full rounded-[22px] border border-[#d8c1ad] bg-white/70 px-4 py-3 text-sm leading-6 text-[#20140c] outline-none transition placeholder:text-[#9b836f] focus:border-[#ba4b2f]"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs leading-6 text-[#7d604f]">
                  It uses local Ollama when reachable and falls back to rule logic otherwise.
                </p>
                <button
                  type="submit"
                  disabled={pending || input.trim() === ""}
                  className="rounded-full bg-[#1f140f] px-4 py-2.5 text-sm font-semibold text-[#fff7ef] transition hover:bg-[#2b1a11] disabled:opacity-50"
                >
                  {pending ? "Thinking..." : "Ask"}
                </button>
              </div>
            </form>
            {error ? (
              <p className="mt-3 rounded-[18px] border border-[#d8c1ad] px-3 py-2 text-xs text-[#7d604f]">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
