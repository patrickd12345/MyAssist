"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  buildCommunicationDraftAssistantIntro,
  buildSuggestedPrompts,
  buildWelcomeReply,
  type AssistantMode,
  type AssistantReply,
  type CommunicationDraftResult,
  type CommunicationDraftType,
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
  communicationDraft?: CommunicationDraftResult & { draftType: CommunicationDraftType };
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

export type CommunicationDraftInjectPayload = {
  key: number;
  draft: CommunicationDraftResult;
  draftType: CommunicationDraftType;
  sourceHint?: string;
};

export function AssistantConsole({
  context,
  compact = false,
  communicationDraftInject = null,
  onCommunicationDraftConsumed,
}: {
  context: MyAssistDailyContext;
  compact?: boolean;
  communicationDraftInject?: CommunicationDraftInjectPayload | null;
  onCommunicationDraftConsumed?: () => void;
}) {
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
  const [communicationCopyLabel, setCommunicationCopyLabel] = useState<string | null>(null);
  const lastCommunicationDraftInjectKeyRef = useRef<number | null>(null);

  useEffect(() => {
    if (!communicationDraftInject) return;
    const k = communicationDraftInject.key;
    if (lastCommunicationDraftInjectKeyRef.current === k) return;
    lastCommunicationDraftInjectKeyRef.current = k;
    const lang = communicationDraftInject.draft.language;
    const intro = buildCommunicationDraftAssistantIntro(
      communicationDraftInject.draftType,
      lang,
      communicationDraftInject.sourceHint,
    );
    setMessages((current) => [
      ...current,
      {
        id: createId(),
        role: "assistant",
        text: intro,
        communicationDraft: {
          ...communicationDraftInject.draft,
          draftType: communicationDraftInject.draftType,
        },
      },
    ]);
    onCommunicationDraftConsumed?.();
  }, [communicationDraftInject, onCommunicationDraftConsumed]);

  const promptIdeas = useMemo(
    () => (compact ? buildSuggestedPrompts(context).slice(0, 4) : buildSuggestedPrompts(context)),
    [compact, context],
  );

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

  async function copyCommunicationSnippet(label: string, text: string, messageId: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCommunicationCopyLabel(`${messageId}:${label}`);
      window.setTimeout(() => {
        setCommunicationCopyLabel((current) => (current === `${messageId}:${label}` ? null : current));
      }, 1600);
    } catch {
      setError("Could not copy to clipboard.");
    }
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
    <section className={`${compact ? "theme-subpanel rounded-[26px] p-4" : "glass-panel-strong rounded-[32px] p-6"}`}>
      {!compact ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-title text-xs font-semibold">Live assistant</p>
            <h2 className="theme-ink mt-2 text-2xl font-semibold tracking-[-0.03em]">
              Ask questions, challenge the plan, and pressure-test the day
            </h2>
            <p className="theme-muted mt-3 max-w-3xl text-sm leading-7">
              This layer reads the same daily context, then answers with a local model when available and
              falls back to deterministic guidance when it is not.
            </p>
          </div>
          <div className="theme-chip rounded-full px-4 py-2 text-xs font-medium">
            Interactive operator channel
          </div>
        </div>
      ) : null}

      <div className={compact ? "grid gap-4" : "mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]"}>
        <div className="glass-panel rounded-[28px] p-4">
          <div className={compact ? "max-h-[24rem] space-y-3 overflow-auto pr-1" : "space-y-3"}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-bubble rounded-[24px] px-4 py-4 ${
                  message.role === "assistant" ? "chat-bubble-assistant" : "chat-bubble-user"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="theme-accent text-xs font-semibold uppercase tracking-[0.16em]">
                    {message.role === "assistant" ? "MyAssist" : "You"}
                  </p>
                  {message.mode ? (
                    <span className="signal-pill rounded-full px-2.5 py-1 text-[10px] font-semibold">
                      {message.mode === "ollama" ? "Local model" : "Rule fallback"}
                    </span>
                  ) : null}
                </div>
                <p className="theme-ink mt-3 text-sm leading-7">{message.text}</p>
                {message.actions && message.actions.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {message.actions.map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => void sendMessage(`Turn this into a concrete plan: ${action}`)}
                        className="theme-chip rounded-full px-3 py-2 text-xs font-medium transition hover:bg-white/10"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                ) : null}
                {message.taskDraft ? (
                  <div className="theme-subpanel mt-4 rounded-[20px] p-4">
                    <p className="theme-accent text-xs font-semibold uppercase tracking-[0.16em]">
                      Draft task
                    </p>
                    <p className="theme-ink mt-3 text-sm font-semibold leading-6">
                      {message.taskDraft.content}
                    </p>
                    <div className="theme-muted mt-3 flex flex-wrap gap-2 text-xs">
                      {message.taskDraft.dueString ? (
                        <span className="theme-chip rounded-full px-3 py-1.5">
                          Due {message.taskDraft.dueString}
                        </span>
                      ) : null}
                      {message.taskDraft.priority ? (
                        <span className="theme-chip rounded-full px-3 py-1.5">
                          Priority P{message.taskDraft.priority}
                        </span>
                      ) : null}
                    </div>
                    {message.taskDraft.description ? (
                      <p className="theme-muted mt-3 text-sm leading-6">
                        {message.taskDraft.description}
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={creatingDraftId === message.id}
                        onClick={() => void createTaskFromDraft(message.id, message.taskDraft as TaskDraft)}
                        className="theme-button-primary rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-50"
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
                        className="theme-button-secondary rounded-full px-4 py-2 text-xs font-semibold transition"
                      >
                        Refine draft
                      </button>
                    </div>
                  </div>
                ) : null}
                {message.communicationDraft ? (
                  <div className="theme-subpanel mt-4 rounded-[20px] border border-amber-500/25 bg-amber-500/8 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-200/90">
                      Draft message (not sent)
                    </p>
                    <p className="theme-muted mt-2 text-[11px] leading-5">
                      Paste into Gmail or another client — MyAssist does not send email.
                    </p>
                    <p className="theme-accent mt-3 text-[11px] font-semibold uppercase tracking-[0.14em]">
                      Subject
                    </p>
                    <p className="theme-ink mt-1 whitespace-pre-wrap text-sm leading-6">
                      {message.communicationDraft.subject}
                    </p>
                    <p className="theme-accent mt-3 text-[11px] font-semibold uppercase tracking-[0.14em]">
                      Body
                    </p>
                    <p className="theme-ink mt-1 whitespace-pre-wrap text-sm leading-6">
                      {message.communicationDraft.body}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(
                        [
                          ["Subject", message.communicationDraft.subject],
                          ["Body", message.communicationDraft.body],
                          [
                            "All",
                            `Subject: ${message.communicationDraft.subject}\n\n${message.communicationDraft.body}`,
                          ],
                        ] as const
                      ).map(([label, chunk]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => void copyCommunicationSnippet(label, chunk, message.id)}
                          className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition"
                        >
                          {communicationCopyLabel === `${message.id}:${label}` ? "Copied" : `Copy ${label}`}
                        </button>
                      ))}
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
                        className="theme-button-secondary rounded-full px-3 py-2 text-xs font-medium transition"
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
            <p className="section-title text-xs font-semibold">Quick asks</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {promptIdeas.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                  className="theme-button-secondary rounded-full px-3 py-2 text-xs font-medium transition"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-[28px] p-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <label htmlFor="assistant-input" className="section-title text-xs font-semibold">
                Ask MyAssist
              </label>
              <textarea
                id="assistant-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask what to do first, what to defer, how to handle a meeting, or turn an item into a plan."
                className={`theme-input w-full rounded-[22px] px-4 py-3 text-sm leading-6 outline-none transition ${
                  compact ? "min-h-28" : "min-h-32"
                }`}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="theme-muted text-xs leading-6">
                  It uses local Ollama when reachable and falls back to rule logic otherwise.
                </p>
                <button
                  type="submit"
                  disabled={pending || input.trim() === ""}
                  className="theme-button-primary rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50"
                >
                  {pending ? "Thinking..." : "Ask"}
                </button>
              </div>
            </form>
            {error ? (
              <p className="theme-subpanel theme-muted mt-3 rounded-[18px] px-3 py-2 text-xs">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
