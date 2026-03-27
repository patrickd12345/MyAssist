"use client";

import { useState } from "react";
import type { CommunicationDraftType, DraftLanguage } from "@/lib/assistant";

export function CommunicationDraftToolbar({
  defaultDraftType,
  lang,
  onLangChange,
  onInject,
}: {
  defaultDraftType: CommunicationDraftType;
  lang: DraftLanguage;
  onLangChange: (next: DraftLanguage) => void;
  onInject: (type: CommunicationDraftType) => void;
}) {
  const [draftType, setDraftType] = useState<CommunicationDraftType>(defaultDraftType);
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-[14px] border border-white/10 bg-black/25 px-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="theme-muted text-[10px] font-semibold uppercase tracking-[0.14em]">
          Reply draft
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onLangChange("en")}
            className={`rounded-full px-2 py-1 text-[10px] font-semibold transition ${
              lang === "en" ? "theme-button-primary" : "theme-chip"
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => onLangChange("fr")}
            className={`rounded-full px-2 py-1 text-[10px] font-semibold transition ${
              lang === "fr" ? "theme-button-primary" : "theme-chip"
            }`}
          >
            FR
          </button>
        </div>
        <select
          value={draftType}
          onChange={(e) => setDraftType(e.target.value as CommunicationDraftType)}
          className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-zinc-100"
          aria-label="Draft type"
        >
          <option value="follow_up">Follow-up</option>
          <option value="interview_accept">Interview accept</option>
          <option value="interview_reschedule">Reschedule</option>
          <option value="thank_you">Thank you</option>
        </select>
      </div>
      <button
        type="button"
        onClick={() => onInject(draftType)}
        className="theme-button-secondary w-fit rounded-full px-3 py-1.5 text-[11px] font-semibold"
      >
        Draft reply
      </button>
    </div>
  );
}
