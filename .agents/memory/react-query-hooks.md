---
name: React Query generated hook signatures
description: Orval-generated mutation hook variable shapes and common pitfalls
---
- Orval-generated mutation hooks have specific variable shapes:
  - `useRecordPayment` mutates with `{ id: number, data: BodyType }` (not `{ data: { ...body, invoiceId } }`)
  - `useApproveChangeOrder` / `useRejectChangeOrder` are separate hooks (not a generic `useUpdateChangeOrder` with status field)
  - `useDeletePayment` mutates with `{ id: number }`
- `useQueryClient` is **not** exported from `@workspace/api-client-react`. Import from `@tanstack/react-query`.

**Why:** Mis-matching the mutate payload or importing `useQueryClient` from the wrong package causes silent runtime failures that pass typecheck only if you use `as any`.
**How to apply:** Always check the generated `api.ts` `MutationOptions` type (e.g. `{ id: number; data: BodyType<...> }`) before wiring up a mutation.
