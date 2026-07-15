# SiteSnap Mobile — Design System & Redesign Spec

Scope: `artifacts/mobile` (Expo / React Native). This documents the mobile
design language and the interaction patterns added in this pass, and points
at the exact files that implement each piece so it stays a living reference,
not a wishlist.

Reference synthesis: **Linear** (contrast, restraint, status-as-signal),
**Slack mobile** (gesture-driven navigation, bottom sheets over full-page
modals), **Procore** (density that stays legible — a foreman scanning ten
Change Orders in bright sun needs to parse status/value/project in one
glance, not decode a color).

---

## 1. Design principles

1. **No shadows on cards.** Depth comes from a single hairline border and
   the card/background contrast (`#1A1A1A` on `#0F0F0F`), not elevation.
   Elevation is reserved for the one surface that actually leaves the page
   flow: bottom sheets (`constants/theme.ts` → `elevation.sheet`).
2. **Status leads, value follows.** Every dense-record card puts a bold
   status pill first (top-left) and the dollar value last (bottom-right,
   largest text on the card). That's the two things a foreman checks, in
   the order they check them.
3. **Full-card tap targets, not chevrons.** The whole card is pressable;
   chevrons/affordance icons are decoration, never required for the hit
   area.
4. **Instant gestures replace confirm-heavy flows where the action is
   reversible or re-editable** (approve/reject a Change Order). Where an
   action is destructive and hard to undo (deleting an expense/receipt),
   the swipe still exposes the action but the trigger still confirms —
   speed shouldn't cost safety on data that's gone for good.
5. **Sheets, not stacks, for anything transactional.** Creating a record or
   filtering a list shouldn't cost a full-screen navigation transition.

---

## 2. Color system

Base palette is unchanged from the existing charcoal/gold identity
(`constants/colors.ts`) — this redesign extends it rather than replacing it,
since the brand identity and dark-mode-only design were already sound; the
problem was density/navigation, not the palette.

| Token | Value | Use |
|---|---|---|
| `background` | `#0F0F0F` | App background (off-black, not pure black — reduces OLED smear and reads less "empty" on a bright job site) |
| `card` | `#1A1A1A` | Card / sheet surface |
| `border` | `#2A2A2A` | Hairline borders, the only depth cue on cards |
| `foreground` | `#FAFAFA` | Primary text |
| `mutedForeground` | `#888888` | Secondary text, meta lines |
| `primary` (brand gold) | `#C9A84C` | CTAs, active tab, links, monetary emphasis — **not** used for status (see below) |

### Status system — Approved / Pending / Draft / Void

Reused the existing `success`/`warning`/`destructive` tokens (they already
mapped almost exactly to Approved/Pending/Void) and added one new token,
`draft`, to complete the 4-state system. This keeps every status color in
the app consistent instead of each screen inventing its own (the pre-existing
`finance.tsx` and `change-order/[id].tsx` each had their own local
`STATUS_COLORS` maps with slightly different hexes for the same states —
now consolidated through `StatusPill`).

| State | Token | Hex | Rendered as |
|---|---|---|---|
| Approved | `success` | `#22C55E` | green pill, check-circle icon |
| Pending | `warning` | `#F59E0B` | amber pill, clock icon |
| Draft | `draft` *(new)* | `#64748B` | slate pill, edit icon — deliberately low-alarm; an unsubmitted record isn't a problem |
| Void / Rejected | `destructive` | `#DC2626` | red pill, slash icon |

Pills render at `${color}26` background / `${color}40` border (≈15%/25%
opacity) with full-saturation text and icon — the "modern pastel on dark"
treatment: legible without turning the list into a wall of solid color
blocks. Implementation: `components/ui/StatusPill.tsx`.

New supporting tokens added to `constants/colors.ts`:

| Token | Value | Use |
|---|---|---|
| `overlay` | `rgba(0,0,0,0.6)` | Bottom sheet backdrop scrim |
| `sheetHandle` | `#3A3A3A` | Drag-grip on sheets (needs contrast against `card`, not `background`) |

---

## 3. Typography

Unchanged type scale (`constants/theme.ts`), documented here because the
sizing already encodes the sunlight-legibility decisions this brief asked
for — worth stating explicitly rather than re-deriving:

| Style | Size / Line height | Weight | Use |
|---|---|---|---|
| `display` | 28 / 34 | Bold | Screen hero numbers (rare) |
| `title` | 20 / 26 | Bold | Card monetary values, screen titles |
| `heading` | 16 / 22 | SemiBold | Card titles, section headers |
| `body` / `bodyMedium` | 15 / 21 | Regular / Medium | Primary list/row text |
| `caption` / `captionMedium` | 13 / 18 | Regular / Medium | Meta lines (project · date) |
| `label` | 12 / 16 | SemiBold | Status pill text (small size), uppercase section eyebrows |

Legibility rules already baked into the system and worth keeping as
constraints on any new screen:

- **Minimum 13px for anything load-bearing.** Nothing below `caption` is
  used for information the user needs, only for tertiary meta.
  Sub-11px text (Procore's classic sin) doesn't survive a phone held at
  arm's length in direct sun.
  - Bold status text is drawn on solid tone-derived color, never on a
    strictly-decorative tint, so contrast holds even if OLED brightness is
    turned down to save battery outdoors.
- **Weight carries hierarchy before size does.** `bodyMedium` vs `body` is
  a 0px size difference — SemiBold/Bold vs Regular does the work, which
  survives sunlight glare better than a 1-2px size bump.
- Font: Inter (`@expo-google-fonts/inter`, already installed) — a
  humanist grotesque with a tall x-height, which is exactly the property
  that keeps it readable at small sizes in high glare; no change
  recommended here.

---

## 4. Layout & information architecture

### Bottom navigation

Already in good shape structurally (`app/(tabs)/_layout.tsx`) — 5 anchors
(Home, Projects, Capture, Tasks, Profile) plus a **hidden-tab** pattern
(Risk, Inspections, Safety, TradeHub, Admin Hub registered but not shown in
the bar, reachable from Profile → "More Tools"). That's structurally the
Slack "primary rail + overflow" pattern already; **no navigation-model
change was made this pass** — see §7 for the one real gap (Profile's "More
Tools" is a static page, not an actual slide-up sheet).

Two renderers already exist and both were left in place because they're the
right split:

- `ClassicTabLayout` — Android / non-Liquid-Glass iOS: blurred/translucent
  tab bar, gold active tint, badge on Capture for the offline queue.
- `NativeTabLayout` — Liquid-Glass-capable iOS: native `NativeTabs` +
  SF Symbols, so newer iPhones get the platform's own glass tab bar instead
  of an imitation.

### Card anatomy

Both domain cards below share one layout so Financials reads as one system
across record types:

```
┌──────────────────────────────────────────┐
│  ● Pending                          ✎    │  ← StatusPill (leads) + secondary icon
│                                            │
│  Additional drywall scope — 2nd floor     │  ← heading, up to 2 lines
│                                            │
│  Maple Ave Renovation  ·  Jul 12    $4,250│  ← muted meta (left) / value (right, `title`)
└──────────────────────────────────────────┘
```

Implementation: `components/cards/ChangeOrderCard.tsx`,
`components/cards/CostRecordCard.tsx`. Both are presentation-only (no
gesture logic baked in) so they compose with `SwipeableRow` in a list but
can also be dropped into a detail screen unwrapped.

### Bottom sheets over full-page modals

Every "create a record" flow in the app used a `<Modal presentationStyle="pageSheet">` — a full navigation transition for what's conceptually a quick, dismissable action. `components/ui/BottomSheet.tsx` replaces that:

- Backdrop fades in (`overlay` token), sheet spring-animates up from
  off-screen (Reanimated `withSpring`, damping 22 / stiffness 260 — tuned to
  feel closer to iOS's native sheet spring than a linear ease).
- Drag-to-dismiss is scoped to the handle/header row only, not the whole
  sheet — a form's `ScrollView` underneath needs an uncontested vertical pan
  gesture, so the whole-sheet-draggable version (common but wrong for
  forms) was rejected.
- Dismiss threshold: 100px drag or 800px/s flick velocity, matching the
  feel of Slack's action sheets rather than requiring a full swipe to the
  bottom of the screen.

Shipped example: `components/sheets/ChangeOrderFormSheet.tsx`, replacing the
`showCOForm` full-page `<Modal>` in `app/finance.tsx`. Same fields as
before, but the project picker is now tappable `Chip`s (reusing the pattern
`expenses.tsx` already used for its project switcher) instead of typing a
raw project ID by hand — a real UX bug fixed as a side effect of the
rebuild, not just a re-skin.

---

## 5. Gestures

### Swipe actions

`components/ui/SwipeableRow.tsx` wraps `react-native-gesture-handler`'s
`Swipeable`. Deliberately **full-swipe-to-act**, not reveal-then-tap:
crossing the threshold (60% of a 96px action panel) fires the action
immediately with a success haptic and the row snaps shut — the same feel as
Gmail/Slack's swipe-to-archive, not a tap-still-required drawer.

| Screen | Right swipe | Left swipe |
|---|---|---|
| Change Orders (`finance.tsx`) | Approve (green, only if `pending` + owner/foreman) | Reject (red) |
| Cost Records (`expenses.tsx`) | — | Delete (red, still confirms — see principle 4) |

A short drag that doesn't cross the threshold previews the action (icon +
label scale in) and springs back — nothing fires on a partial or accidental
swipe.

### Bottom sheets as the primary "quick create" surface

Covered in §4. The `+` FAB pattern in `finance.tsx` (small secondary FAB
next to the primary Voice Invoice FAB) was kept, but now opens a sheet
instead of pushing a full page.

---

## 6. What shipped this pass (file map)

| File | What it is |
|---|---|
| `constants/colors.ts` | + `draft`/`draftForeground`, `overlay`, `sheetHandle` tokens |
| `constants/theme.ts` | + `motion` (shared animation durations), `elevation.sheet` |
| `components/ui/StatusPill.tsx` | Bold 4-state status pill + `statusTone()` mapping helper |
| `components/ui/BottomSheet.tsx` | Draggable, spring-animated bottom sheet primitive |
| `components/ui/SwipeableRow.tsx` | Full-swipe-to-act row wrapper |
| `components/cards/ChangeOrderCard.tsx` | Change Order list card |
| `components/cards/CostRecordCard.tsx` | Expense / cost record list card |
| `components/sheets/ChangeOrderFormSheet.tsx` | "New Change Order" bottom sheet form |
| `app/finance.tsx` | Change Orders tab rewired: new card + swipe approve/reject + sheet create |
| `app/expenses.tsx` | List rewired: new card + swipe-to-delete |
| `app/_layout.tsx` | + `GestureHandlerRootView` (required for gesture-handler to behave correctly on Android; wasn't present before) |

## 7. Known gaps / recommended next steps

Being explicit about what this pass did **not** touch, so it doesn't read as
more complete than it is:

- **Profile's "More Tools" is still a static scrollable page**
  (`app/(tabs)/profile.tsx`), not an actual slide-up sheet. It's already
  structurally the right list (permission-gated tool shortcuts), so
  converting it to open in a `BottomSheet` from a tab-bar-adjacent trigger is
  a follow-up, not a rebuild — flagged rather than done here because Profile
  mixes account settings + tools + billing + voice-create in one screen, and
  splitting that apart is a bigger call than this pass's scope.
- **Expenses' OCR receipt-review flow still uses its own three hand-rolled
  overlay sheets** (`sheetOverlay`/`sheet` styles in `expenses.tsx`), not the
  new `BottomSheet` primitive. Left alone deliberately — it's a working,
  fairly intricate flow (camera → OCR → date picker → review), and
  migrating it wasn't worth the risk in the same pass as the list/card
  rework. Worth doing once this pattern has bedded in elsewhere.
- **No filter bottom sheet yet.** Change Orders/Cost Records still filter
  via the existing top segmented control; a Linear-style filter sheet
  (status multi-select, date range) would be the natural next use of
  `BottomSheet`.
- **Quotes and Invoices** (`InvoiceRow`/`QuoteRow` in `finance.tsx`) still
  use the old plain-row styling — the same card/swipe pattern applies
  directly once there's appetite to extend it.
