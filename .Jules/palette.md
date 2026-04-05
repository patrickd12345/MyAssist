## 2026-04-05 - Icon-Only ARIA Labels in TaskList
**Learning:** Icon-only buttons using symbols like ▲ and ▼ are entirely inaccessible to screen readers without explicit ARIA labels. They rely entirely on visual context and implicit cultural knowledge of these icons to convey their meaning, which fails WCAG 2.1.
**Action:** Always verify that every `<button>` tag using an SVG or text symbol has an explicit `aria-label` describing its action.
