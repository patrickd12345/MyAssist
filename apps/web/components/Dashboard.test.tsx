import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobHuntAction, MyAssistDailyContext } from "@/lib/types";
import { Dashboard } from "./Dashboard";

const sampleContext: MyAssistDailyContext = {
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
    {
      id: "g2",
      threadId: "th2",
      from: "Talent <jobs@company.com>",
      subject: "Schedule your interview for the engineer role",
      snippet: "We would like to schedule an interview. Please book a time that works.",
      date: "2026-03-25T11:00:00.000Z",
      job_hunt_analysis: {
        signals: ["interview_request"],
        confidence: 0.82,
        suggestedActions: [
          "create_prep_task",
          "suggest_calendar_block",
          "create_interview_event",
          "update_pipeline",
        ] satisfies JobHuntAction[],
        stageAlias: "interview",
        stageHintManager: "interview_scheduled",
        normalizedIdentity: {
          company: "Acme Corp",
          role: "Software Engineer",
          recruiterName: "Taylor Recruiter",
          threadId: "th2",
          messageId: "g2",
        },
      },
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

    if (url.includes("/api/actions")) {
      return new Response(
        JSON.stringify({
          ok: true,
          action: "job_hunt_prep_tasks",
          sourceEmailId: "g2",
          taskSummaries: [],
          refreshHints: { providers: ["gmail", "todoist"], sourceIds: ["g2"], targetIds: [] },
        }),
        { status: 200 },
      );
    }

    if (url.includes("/api/daily-context") && url.includes("provider=")) {
      return new Response(
        JSON.stringify({
          gmail_signals: sampleContext.gmail_signals,
          calendar_today: sampleContext.calendar_today,
          todoist_overdue: sampleContext.todoist_overdue,
          todoist_due_today: sampleContext.todoist_due_today,
          todoist_upcoming_high_priority: sampleContext.todoist_upcoming_high_priority,
        }),
        { status: 200 },
      );
    }

    return new Response("not found", { status: 404 });
  });
}

describe("Dashboard", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockImplementation(mockAssistantFetch());
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

  it("shows integration notice when actions API returns dedupe metadata", async () => {
    const user = userEvent.setup();
    const delegate = mockAssistantFetch();
    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/actions")) {
        return new Response(
          JSON.stringify({
            ok: true,
            action: "job_hunt_prep_tasks",
            sourceEmailId: "g2",
            dedupe: {
              deduped: true,
              message: "Prep tasks were already created recently for this thread.",
              reusedTargetIds: ["tp1"],
              reusedTargetSummaries: [{ id: "tp1", label: "[Job prep] Research company" }],
            },
            taskSummaries: [],
            refreshHints: { providers: ["gmail", "todoist"], sourceIds: ["g2"], targetIds: ["tp1"] },
          }),
          { status: 200 },
        );
      }
      return delegate(input, init);
    });

    render(<Dashboard initialData={sampleContext} initialError={null} initialSource="n8n" />);

    await user.click(screen.getAllByRole("button", { name: "Inbox" })[0]);
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Job hunt suggestions" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Create prep tasks" }));

    await waitFor(() => {
      expect(screen.getByText(/Prep tasks were already created recently/i)).toBeInTheDocument();
    });
    expect(screen.getByText("[Job prep] Research company")).toBeInTheDocument();
  });

  it("shows job hunt suggestion panel and can run prep tasks action", async () => {
    const user = userEvent.setup();
    render(<Dashboard initialData={sampleContext} initialError={null} initialSource="n8n" />);

    await user.click(screen.getAllByRole("button", { name: "Inbox" })[0]);

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Job hunt suggestions" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Create prep tasks" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/actions",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("job_hunt_prep_tasks"),
        }),
      );
    });
  });

  it("hides job hunt panel when Ignore is clicked", async () => {
    const user = userEvent.setup();
    render(<Dashboard initialData={sampleContext} initialError={null} initialSource="n8n" />);

    await user.click(screen.getAllByRole("button", { name: "Inbox" })[0]);

    const region = await screen.findByRole("region", { name: "Job hunt suggestions" });
    expect(region).toBeInTheDocument();

    await user.click(within(region).getByRole("button", { name: "Ignore" }));

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Job hunt suggestions" })).not.toBeInTheDocument();
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
