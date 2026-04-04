## UX Journal
## 2025-02-12 - ARIA Labels and Keyboard Access for Icon-Only Bump Buttons
**Learning:** The "Bump up/down" buttons in the TaskList component lacked ARIA labels to explain their purpose to screen readers, and had no focus indicators, making them difficult to discover and use for keyboard-only or screen reader users. The container had a hover state that showed the buttons, but this was inaccessible via keyboard.
**Action:** Added `aria-label` to these buttons (including the dynamic task content), applied `focus-visible:ring-2` to provide clear keyboard focus indicators, and added `focus-within:opacity-100` to the container so the buttons become visible when a user tabs into them.
