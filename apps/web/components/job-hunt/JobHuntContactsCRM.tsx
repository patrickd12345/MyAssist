"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { JobHuntPersonContact } from "@/lib/jobHuntContactTypes";
import { allPostingIdsForContact } from "@/lib/jobHuntContactUtils";

type Props = {
  /** Increment when contacts may have changed elsewhere (e.g. linked from job drawer). */
  refreshKey?: number;
  onContactsChanged?: () => void;
};

export function JobHuntContactsCRM({ refreshKey = 0, onContactsChanged }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contactParam = searchParams.get("contact")?.trim() ?? "";

  const [people, setPeople] = useState<JobHuntPersonContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "",
    company: "",
    /** Comma-separated posting / job ids (stored as linked_job_ids; primary field cleared on save). */
    posting_ids: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/job-hunt/contacts?full=1", { cache: "no-store" });
      if (res.status === 401) {
        setPeople([]);
        return;
      }
      const data = (await res.json()) as { ok?: boolean; people?: JobHuntPersonContact[]; error?: string };
      if (!data.ok || !Array.isArray(data.people)) {
        setErr(data.error ?? "Could not load contacts");
        setPeople([]);
        return;
      }
      setPeople(data.people);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  /** Keep posting ids in the edit form in sync when the list reloads (e.g. after linking from Pipeline). */
  useEffect(() => {
    if (!editingId) return;
    const p = people.find((x) => x.id === editingId);
    if (!p) return;
    setForm((prev) => ({
      ...prev,
      posting_ids: allPostingIdsForContact(p).join(", "),
    }));
  }, [people, editingId]);

  const resetForm = () => {
    setForm({ name: "", email: "", phone: "", role: "", company: "", posting_ids: "" });
    setEditingId(null);
    if (searchParams.get("contact")) router.replace("/job-hunt");
  };

  const startEdit = (p: JobHuntPersonContact) => {
    router.replace("/job-hunt");
    setEditingId(p.id);
    setForm({
      name: p.name ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
      role: p.role ?? "",
      company: p.company ?? "",
      posting_ids: allPostingIdsForContact(p).join(", "),
    });
  };

  function parsePostingIds(): string[] {
    return form.posting_ids
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const submitCreate = async () => {
    setSaving(true);
    setErr(null);
    try {
      const linked = parsePostingIds();
      const res = await fetch("/api/job-hunt/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          role: form.role || undefined,
          company: form.company || undefined,
          job_id: "",
          linked_job_ids: linked.length ? linked : undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErr(data.error ?? `HTTP ${res.status}`);
        return;
      }
      resetForm();
      await load();
      onContactsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    setErr(null);
    try {
      const linked = parsePostingIds();
      const res = await fetch(`/api/job-hunt/contacts/${encodeURIComponent(editingId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          role: form.role,
          company: form.company,
          job_id: "",
          linked_job_ids: linked,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErr(data.error ?? `HTTP ${res.status}`);
        return;
      }
      resetForm();
      await load();
      onContactsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!globalThis.confirm("Delete this contact?")) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/job-hunt/contacts/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErr(data.error ?? `HTTP ${res.status}`);
        return;
      }
      if (editingId === id) resetForm();
      else if (contactParam === id) router.replace("/job-hunt");
      await load();
      onContactsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const viewing = contactParam ? people.find((x) => x.id === contactParam) : undefined;
  const recordMissing = Boolean(contactParam) && !loading && !viewing;
  const showRecordPanel = Boolean(contactParam && viewing && !editingId);

  useEffect(() => {
    if (!showRecordPanel || !viewing) return;
    const el = document.getElementById("contact-record");
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [showRecordPanel, viewing]);

  return (
    <div className="space-y-6">
      <p className="theme-muted text-xs leading-5">
        All contacts across jobs. List any posting / job ids this person is tied to (comma-separated). No separate
        &quot;primary&quot; id — one list is enough.
      </p>
      {err ? (
        <p className="text-sm text-rose-300" role="alert">
          {err}
        </p>
      ) : null}

      {showRecordPanel && viewing ? (
        <div
          id="contact-record"
          className="rounded-[24px] border border-sky-500/25 bg-black/30 p-4"
          aria-label="Contact record"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="section-title text-base font-semibold text-zinc-100">{viewing.name ?? "Contact"}</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="theme-button-primary rounded-full px-4 py-1.5 text-xs font-semibold"
                onClick={() => startEdit(viewing)}
              >
                Edit
              </button>
              <button
                type="button"
                className="theme-button-secondary rounded-full px-4 py-1.5 text-xs font-semibold"
                onClick={() => router.replace("/job-hunt")}
              >
                Close
              </button>
            </div>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="theme-muted text-[11px] uppercase tracking-wide">Email</dt>
              <dd className="mt-0.5 text-zinc-200">{viewing.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="theme-muted text-[11px] uppercase tracking-wide">Phone</dt>
              <dd className="mt-0.5 text-zinc-200">{viewing.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="theme-muted text-[11px] uppercase tracking-wide">Role</dt>
              <dd className="mt-0.5 text-zinc-200">{viewing.role ?? "—"}</dd>
            </div>
            <div>
              <dt className="theme-muted text-[11px] uppercase tracking-wide">Company</dt>
              <dd className="mt-0.5 text-zinc-200">{viewing.company ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="theme-muted text-[11px] uppercase tracking-wide">Posting / job ids</dt>
              <dd className="mt-0.5 break-all font-mono text-[12px] text-zinc-300">
                {allPostingIdsForContact(viewing).join(", ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="theme-muted text-[11px] uppercase tracking-wide">Source</dt>
              <dd className="mt-0.5 text-zinc-400">{viewing.source}</dd>
            </div>
            <div>
              <dt className="theme-muted text-[11px] uppercase tracking-wide">Created</dt>
              <dd className="mt-0.5 text-zinc-400">
                {viewing.created_at
                  ? new Date(viewing.created_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {recordMissing ? (
        <div
          className="rounded-[24px] border border-amber-500/30 bg-amber-950/30 p-4 text-sm text-amber-100"
          role="status"
        >
          No contact matches this link.{" "}
          <button
            type="button"
            className="font-semibold text-amber-200 underline"
            onClick={() => router.replace("/job-hunt")}
          >
            Clear link
          </button>
        </div>
      ) : null}

      <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
        <p className="section-title text-xs font-semibold">{editingId ? "Edit contact" : "Add contact"}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="theme-muted">Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="theme-muted">Email</span>
            <input
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="theme-muted">Phone</span>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="theme-muted">Role</span>
            <input
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs sm:col-span-2">
            <span className="theme-muted">Company</span>
            <input
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs sm:col-span-2">
            <span className="theme-muted">Posting / job ids (comma-separated)</span>
            <input
              value={form.posting_ids}
              onChange={(e) => setForm((f) => ({ ...f, posting_ids: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm"
              placeholder="e.g. LinkedIn posting id, one or more separated by commas"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {editingId ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitEdit()}
                className="theme-button-primary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => resetForm()}
                className="theme-button-secondary rounded-full px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void submitCreate()}
              className="theme-button-primary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add contact"}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-[24px] border border-white/10">
        {loading ? (
          <p className="theme-muted p-4 text-sm">Loading…</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-white/10 bg-black/30 text-xs uppercase text-zinc-400">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email / Phone</th>
                <th className="px-3 py-2">Role · Company</th>
                <th className="px-3 py-2">Posting ids</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-2 font-medium text-zinc-100">
                    <Link
                      href={`/job-hunt?contact=${encodeURIComponent(p.id)}`}
                      scroll={false}
                      prefetch={false}
                      className="text-sky-300 underline decoration-sky-400/40 underline-offset-2 hover:text-sky-200"
                    >
                      {p.name ?? "—"}
                    </Link>
                  </td>
                  <td className="theme-muted px-3 py-2 text-xs">
                    {[p.email, p.phone].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="theme-muted px-3 py-2 text-xs">
                    {[p.role, p.company].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-zinc-300">
                    {allPostingIdsForContact(p).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{p.source}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="mr-2 text-sky-300 underline"
                      onClick={() => startEdit(p)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-rose-300 underline"
                      onClick={() => void remove(p.id)}
                      disabled={saving}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
