---
name: Radix Tabs forceMount pattern
description: Prevent expensive unmount/remount churn on tab switches
---
- Adding `forceMount` prop to `<TabsContent>` plus `data-[state=inactive]:hidden` class prevents expensive unmount/remount churn. Component state (scroll position, input focus, internal hooks) is preserved across tab switches.

**Why:** In `financials.tsx`, switching tabs destroyed all summary/payment/CO state and triggered re-fetches, causing visible layout shifts and jank.
**How to apply:** Whenever tab content is expensive or stateful, apply `forceMount` and CSS-hide inactive panels rather than letting React unmount them.
