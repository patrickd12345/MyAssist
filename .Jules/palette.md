## 2024-04-01 - Add missing aria-controls and tabpanel to Job Hunt UI
**Learning:** Found an accessibility issue pattern where `role="tab"` buttons lacked `id` and `aria-controls` attributes linking them to their respective panels, which were missing `role="tabpanel"` and `aria-labelledby`.
**Action:** Ensure tabs in `JobHuntCockpit.tsx` have `id` and `aria-controls`, and ensure `JobHuntDiscovery`, `JobHuntPipeline`, and `JobHuntContactsCRM` panels include `role="tabpanel"` and `aria-labelledby` referencing the matching tab IDs.
