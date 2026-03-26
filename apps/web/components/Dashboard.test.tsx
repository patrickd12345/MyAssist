import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";

const sampleContext = {
  generated_at: "2026-03-25T12:00:00.000Z",
  run_date: "2026-03-25",
  todoist_overdue: [{ id: "t1", content: "Overdue thing", priority: 2 }],
  todoist_due_today: [],
  todoist_upcoming_high_priority: [],
  gmail_signals: [
    {
      id: "g1",
      threadId: "th1",
      from: "Monarch <hello@updates.monarch.com>",
      subject: "Your trial is ending soon, you will be automatically charged",
      snippet: "Renewal coming up.",
      date: "2026-03-25T10:00:00.000Z",
    },
  ],
  calendar_today: [],
};

function mockAssistantFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const raw = init?.body && typeof init.body === "string" ? init.body : "{}";
    const body = JSON.parse(raw) as { kind?: string };

    if (url.includes("/api/assistant")) {
      if (body.kind === "headline") {
        return new Response(JSON.stringify({ answer: "Synthetic headline for test." }), { status: 200 });
      }
      if (body.kind === "memory_status") {
        return new Response(JSON.stringify({ resolved_items: [] }), { status: 200 });
      }
      if (body.kind === "situation_brief") {
        return new Response(
          JSON.stringify({
            brief: {
              pressure_summary: "Test pressure",
              top_priorities: ["One priority"],
              conflicts_and_risks: ["One risk"],
              defer_recommendations: ["Defer X"],
              next_actions: ["Do Y"],
              confidence_and_limits: "Snapshot only.",
              memory_insights: [],
            },
          }),
          { status: 200 },
        );
      }
      if (body.kind === "situation_feedback") {
        return new Response(JSON.stringify({ ok: true, memory_entries: 1 }), { status: 200 });
      }
      if (body.kind === "resolve_item") {
        return new Response(JSON.stringify({ ok: true, memory_entries: 2 }), { status: 200 });
      }
    }
    if (url.includes("/api/gmail/mark-read")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response("not found", { status: 404 });
  });
}

describe("Dashboard", () => {
  const mockFetch = mockAssistantFetch();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockClear();
  });

  it("shows demo banner when source is mock", () => {
    render(
      <Dashboard initialData={sampleContext} initialError={null} initialSource="mock" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Demo mode is active.");
  });

  it("loads headline and situation brief from the assistant API", async () => {
    const user = userEvent.setup();
    render(
      <Dashboard initialData={sampleContext} initialError={null} initialSource="n8n" />,
    );

    await waitFor(() => {
      expect(screen.getByText("Synthetic headline for test.")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getAllByText("Test pressure").length).toBeGreaterThanOrEqual(1);
    });

    await user.click(screen.getAllByRole("button", { name: "Tasks" })[0]);
    expect(screen.getAllByText("Brief picks").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("One priority").length).toBeGreaterThanOrEqual(1);
  });

  it("submits situation feedback when Useful is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Dashboard initialData={sampleContext} initialError={null} initialSource="n8n" />,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Test pressure").length).toBeGreaterThanOrEqual(1);
    });

    const situationSection = screen.getAllByText("Situation brief")[0].closest("section");
    expect(situationSection).toBeTruthy();
    const useful = within(situationSection as HTMLElement).getAllByRole("button", { name: "Useful" })[0];
    await waitFor(() => {
      expect(useful).not.toBeDisabled();
    });

    await user.click(useful);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/assistant",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("situation_feedback"),
        }),
      );
    });
  });

  it("persists handled email items and hides them from the list", async () => {
    const user = userEvent.setup();
    render(
      <Dashboard initialData={sampleContext} initialError={null} initialSource="n8n" />,
    );
    await user.click(screen.getAllByRole("button", { name: "Inbox" })[0]);

    const subject = "Your trial is ending soon, you will be automatically charged";
    const emailHeading = screen.getAllByRole("heading", { name: "In this pull" }).at(-1);
    const emailSection = emailHeading?.closest("section");
    expect(emailSection).toBeTruthy();
    await waitFor(() => {
      expect(within(emailSection as HTMLElement).getAllByText(subject).length).toBeGreaterThanOrEqual(1);
    });

    const handledButtons = within(emailSection as HTMLElement).getAllByRole("button", { name: "Handled" });
    await user.click(handledButtons[0]);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/assistant",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("resolve_item"),
        }),
      );
    });
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/gmail/mark-read",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("messageId"),
        }),
      );
    });

    await waitFor(() => {
      expect(within(emailSection as HTMLElement).queryByText(subject)).not.toBeInTheDocument();
    });
  });

  it("switches dashboard tabs and shows focused content", async () => {
    const user = userEvent.setup();
    render(
      <Dashboard initialData={sampleContext} initialError={null} initialSource="n8n" />,
    );

    await user.click(screen.getAllByRole("button", { name: "Tasks" })[0]);
    expect(screen.getByRole("heading", { name: "Todoist lists" })).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Calendar" })[0]);
    expect(screen.getByRole("heading", { name: "Today and next" })).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Assistant" })[0]);
    expect(screen.getByRole("heading", { name: "Fast support when you need it" })).toBeInTheDocument();
  });
});
