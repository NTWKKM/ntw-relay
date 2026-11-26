# Personal Drop — Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Single-Owner Isolation**: Every document in `/drops/{dropId}` belongs strictly to `ownerId == request.auth.uid`. No user may read (`get` or `list`), create, update, or delete another user's drops.
2. **Verified Identity**: All write operations (`create`, `update`, `delete`) require `request.auth != null && request.auth.token.email_verified == true`.
3. **Path Variable Hardening**: Every single-document operation validates `dropId` matches `^[a-zA-Z0-9_\-]+$` with `size() <= 128`.
4. **Volumetric & Schema Enforcement**: Every string has an explicit `.size()` bound (`content <= 50000`, `fileName <= 255`, `mimeType <= 128`, `previewDataUrl <= 160000`); `fileSize` is bounded to `0..10485760` bytes; `chunkCount` is an int `0..14`; `type` is restricted to `['text', 'image', 'file']`; `previewDataUrl` must match `^data:image/jpeg;base64,[A-Za-z0-9+/=]+$`.
5. **Strict Key Allowlist (Anti-Shadow-Field)**: `create` requires `['ownerId', 'type', 'content', 'createdAt']` and permits only `['ownerId', 'type', 'content', 'fileName', 'fileSize', 'mimeType', 'chunkCount', 'previewDataUrl', 'isCode', 'createdAt']`. Legacy Storage fields (`downloadUrl`, `storagePath`) are rejected.
6. **Immutability & Action-Based Updates**: `ownerId` and `createdAt` are immutable. Only toggling `isCode` is allowed on `update`, gated by `isValidDrop(incoming())` and `affectedKeys().hasOnly(['isCode'])`.
7. **Temporal Integrity**: `createdAt` on `create` must equal `request.time`.
8. **Chunk Isolation** (`/drops/{dropId}/chunks/{chunkId}`): fields exactly `['ownerId', 'index', 'data']`; `ownerId == request.auth.uid`; `index` int `0..13` and `chunkId == string(index)`; `data` is `bytes` of `1..786432`; create requires verified email; reads/list/delete owner-only; updates denied. Parent doc is written after its chunks, so chunk rules do not `get()` the parent.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Read/List**: `get` or `list` `/drops` with `auth = null`.
2. **Cross-Tenant Get**: Authenticated user B attempts `get` on user A's `/drops/drop_a1`.
3. **Unscoped List Query**: Authenticated user B executes `list` on `/drops` without `where('ownerId', '==', uidB)` (fails rule-side `resource.data.ownerId == request.auth.uid`).
4. **Identity Spoofing on Create**: User A attempts `create` with `ownerId: "user_b_uid"`.
5. **Unverified Email Write**: Authenticated user with `email_verified: false` attempts `create` on `/drops/drop_1`.
6. **Shadow Field Injection**: Valid owner sends extra ghost field `{ ..., isAdmin: true }` on `create`.
7. **ID Poisoning**: Document ID contains 200 characters or invalid characters (`../evil$id`).
8. **Content Resource Exhaustion (DoW)**: `content` exceeds 50,000 characters.
9. **XSS Scheme in Preview**: `previewDataUrl: "javascript:alert(1)"` or `data:text/html,...`.
10. **Chunk Abuse**: chunk with spoofed `ownerId`, `data` > 786,432 bytes, `index` ≥ 14 or ≠ `chunkId`, extra fields, any chunk update, or cross-tenant chunk read/list.
11. **Backdated Timestamp**: `create` sends client-forged `createdAt` != `request.time`.
12. **Immutable Field / Value Poisoning on Update**: Owner attempts to mutate `ownerId`, `createdAt`, `content`, or sets `isCode: "not-a-boolean"`.
