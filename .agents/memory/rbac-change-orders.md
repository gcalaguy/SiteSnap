---
name: RBAC Change Orders Wiring
description: How Change Orders visibility is enforced across web, mobile, and API.
---

- **Backend**: `GET /change-orders` and `GET /change-orders/:id` are protected by `requireOwnerOrForeman` middleware.
- **Web Dashboard**: `useListChangeOrders` is called with `enabled: isOwnerOrForeman`; the "Change Orders" tab is conditionally rendered.
- **Mobile**: Same hook pattern; collapsible section under the Overview tab gated by `isOwnerOrForeman`.
- **DB**: `changeOrdersTable` already has `projectId` FK + indexes; no schema changes needed.
