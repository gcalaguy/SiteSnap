---
name: Signed URL pattern for private storage
description: How to display images from private GCS storage when direct auth URLs fail with 401
---

**Problem:** `Image` (React Native) and `<img>` (web) cannot send Bearer tokens, so private storage objects accessed via authenticated API routes return 401. The "photo unavailable" fallback renders instead.

**Solution:** Use the signed URL endpoint `GET /api/storage/objects/{path}/signed-url` which returns a temporary GCS signed URL (15-minute expiry). This URL is unauthenticated — the browser or image component can load it directly.

**Architecture:**
- API endpoint: `GET /api/storage/objects/:path/signed-url` in `storage.ts` (lines 211-292)
- Ownership verification: checks all storage tables (fileAttachments, projectDocuments, workerDocuments, sitePhotos, dailyReportPhotos)
- Backend uses `getSignedURL` from Replit object storage sidecar
- Client fetches signed URL via `customFetch` (Bearer token attached), then uses the returned URL for the actual image

**Web pattern:**
- `useSignedPhotoUrl(imageUrl)` hook using `useQuery` with 10-min staleTime / 15-min gcTime
- `PhotoCard` component: fetches signed URL on mount, shows spinner while loading, renders `<img>` with signed URL
- Lightbox: fetches fresh signed URL on click to open full-size preview
- `getSignedUrlPath()` and `getPreviewPath()` helper functions normalize `/objects/` and `/api/storage/objects/` paths
- Reference implementation: `artifacts/web-dashboard/src/pages/vault.tsx` and `artifacts/web-dashboard/src/pages/field-logs.tsx`

**Mobile pattern:**
- `useSignedPhotoUrl(objectPath)` hook using `useQuery` with 10-min staleTime / 15-min gcTime
- `PhotoThumbnail` component: shows loading indicator, then `Image` with signed URL
- `PhotoLightbox` component: same pattern for full-screen preview
- Reference implementation: `artifacts/mobile/hooks/useSignedPhotoUrl.ts`, `artifacts/mobile/components/PhotoThumbnail.tsx`, `artifacts/mobile/app/project/[id].tsx`

**Why not just use the authenticated URL directly?** Because `<img>` and `Image` components cannot send custom headers (like `Authorization: Bearer`). The signed URL sidesteps this by being pre-authenticated at the GCS level.

**How to apply:** When any new page or component needs to render private storage images (photos, documents, signatures), always use the signed URL pattern rather than direct authenticated URLs.
