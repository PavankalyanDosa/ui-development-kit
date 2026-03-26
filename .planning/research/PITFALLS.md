# Pitfalls Research

**Domain:** Angular + Electron desktop tool for SaaS identity governance (SailPoint ISC Policy Engine)
**Researched:** 2026-03-25
**Confidence:** MEDIUM-HIGH (Electron security: HIGH via official docs; ISC-specific API constraints: MEDIUM via community + API docs; rollback patterns: MEDIUM via general distributed systems literature)

---

## Critical Pitfalls

### Pitfall 1: Enabling nodeIntegration in the Renderer Process

**What goes wrong:**
`nodeIntegration: true` is set in `BrowserWindow` webPreferences — either intentionally for convenience or accidentally by copying old boilerplate. This gives renderer-executed Angular code (and any injected script) full access to Node.js APIs, the filesystem, and child_process. Remote Code Execution becomes trivial if any XSS vector exists or if an external URL is ever opened in the same window.

**Why it happens:**
Older Angular+Electron tutorials (pre-2020) assumed `nodeIntegration: true` as the only way to call Electron APIs from Angular. Developers unfamiliar with `contextBridge` default to the old pattern.

**How to avoid:**
Set `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` on every `BrowserWindow`. Expose only the specific IPC methods Angular needs through a typed `contextBridge` preload. Never expose `ipcRenderer` directly — expose named, validated wrapper functions only.

```
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false
}
```

**Warning signs:**
- Angular code imports `require('electron')` directly without going through a preload-injected global
- Preload script does `contextBridge.exposeInMainWorld('api', { ipcRenderer })` — exposes the entire IPC renderer
- Any window created without explicit `webPreferences`

**Phase to address:** Foundation / Electron Shell setup phase (must be done before any Angular-to-main-process wiring)

---

### Pitfall 2: Using electron-store's `encryptionKey` Option for PAT Secrets

**What goes wrong:**
The PAT client secret is stored using electron-store with the `encryptionKey` option, giving developers a false sense of security. electron-store uses AES-256-CBC, which is unauthenticated. A known attack on CBC mode allows an attacker to flip bits in the ciphertext and modify the stored value without knowing the key. The derived key also has a structural weakness: the IV is reused as the PBKDF2 salt, which binds them together but still leaves the ciphertext modifiable.

**Why it happens:**
electron-store's `encryptionKey` option looks like it solves credential security at a glance. The weakness is not obvious from the documentation or the API surface.

**How to avoid:**
Use Electron's `safeStorage` API to encrypt the PAT secret before writing it to electron-store. `safeStorage` uses OS-native credential stores (Keychain on macOS, DPAPI on Windows, libsecret on Linux) and produces authenticated ciphertext. Never pass the raw secret directly to `electron-store`'s `encryptionKey`.

Critical caveat: on Linux, `safeStorage.isEncryptionAvailable()` can return `false` if no secret store daemon is running (headless servers, some CI environments). Always check before encrypting and surface a clear error to the user rather than silently falling back to plaintext.

**Warning signs:**
- `new Store({ encryptionKey: 'some-hardcoded-string' })` in main process code
- No call to `safeStorage.isEncryptionAvailable()` before storing credentials
- PAT secret stored as a plain string field in the electron-store config JSON

**Phase to address:** Connection & Credential Management phase

---

### Pitfall 3: Monaco Editor Blocked by Electron Content Security Policy

**What goes wrong:**
Monaco Editor requires `unsafe-eval` in `script-src` for its JavaScript language worker, and emits extensive inline styles that require `unsafe-inline` in `style-src`. It also loads web workers as `blob:` URLs, requiring `worker-src blob:`. Any strict Electron CSP that omits these directives causes Monaco to silently fail to render, throw console errors about refused script evaluation, or display an unreadable editor with missing syntax highlighting.

**Why it happens:**
Electron's security documentation recommends a strict CSP. Monaco was designed for the browser and predates the strict-CSP era. The mismatch is a well-known open issue in the Monaco repository (GitHub issue #271 for inline styles, issue #2488 for `unsafe-eval`). There is no upstream fix that eliminates the need for these relaxations.

**How to avoid:**
- Bundle all Monaco workers locally (do not load from CDN) using webpack or the `monaco-editor-workers` npm package
- Configure `MonacoEnvironment.getWorker()` to return locally bundled workers, not blob URLs created from CDN scripts
- In the Electron CSP, add `worker-src blob:` and `script-src 'unsafe-eval'` only for the renderer window serving the Monaco editor — scope it as narrowly as possible
- Do not use `unsafe-inline` for `style-src`; instead use a nonce-based approach or accept Monaco's inline styles as a known trade-off in a local-only app

**Warning signs:**
- Monaco editor renders blank or without syntax highlighting in the Electron renderer
- Console shows "Refused to evaluate a string as JavaScript because it violates CSP"
- Worker loading errors mentioning origin mismatch between `app://` and `blob:`

**Phase to address:** Policy Definition Editor phase (first time Monaco is introduced)

---

### Pitfall 4: IPC Channel Proliferation in Preload Script

**What goes wrong:**
As features are added (git ops, ISC API calls, credential read/write, audit log, deploy pipeline), developers add individual `ipcRenderer.invoke('channel-name', ...)` calls per operation. After 20+ operations the preload script becomes a flat list of untyped string channel names with no discoverability, duplicated validation, and no consistent error handling. Refactoring later is expensive because channel names are scattered across both Angular services and main-process handlers.

**Why it happens:**
Electron's IPC tutorial examples show one channel at a time. There is no built-in mechanism to enforce channel naming conventions or type safety.

**How to avoid:**
Design the IPC surface up front as a typed API contract. Group channels by domain (e.g., `isc:`, `git:`, `store:`, `deploy:`). Use TypeScript interfaces that are shared between the preload and Angular service layer so the compiler enforces call signatures. Consider a thin bridge abstraction that generates channel names from method names rather than hand-coding strings. Expose one `window.api` object from the preload with namespaced methods, not individual globals.

**Warning signs:**
- More than ~10 raw `ipcRenderer.invoke` strings in the preload within the first milestone
- No TypeScript interface describing the full `window.api` shape
- Angular components calling `window.api` directly instead of through a service layer

**Phase to address:** Foundation / Electron Shell setup phase — define the IPC contract before any feature code is written

---

### Pitfall 5: Non-Atomic Deploy Without Pre-Deploy Snapshot

**What goes wrong:**
The deploy pipeline calls ISC APIs in dependency order (transforms → identity profile → entitlements → access profiles → roles → segments → provisioning policies). If a step partway through fails (e.g., role creation fails after transforms and identity profile were updated), the tenant is left in a mixed state: some new resources exist, identity profile mappings point to new transforms, but roles are missing. The tool has no record of what was live before the deploy began, so rollback is impossible.

**Why it happens:**
Sequential API calls look simple. Pre-deploy snapshot feels like extra work. Developers defer it as a "future enhancement" until a failed deploy corrupts a production tenant and recovery is manual.

**How to avoid:**
Capture a complete snapshot of every ISC resource the tool manages immediately before starting any write operation. Store the snapshot in the audit log (electron-store). The rollback procedure reads this snapshot and issues compensating API calls in reverse dependency order (delete new resources, restore patched ones with their original payloads). The snapshot must also capture the UUIDs of all objects created during the deploy so rollback knows which newly created resources to delete.

The deploy must be written as an ordered list of steps where each step records its undo action before executing its do action. This is the Saga pattern applied to a single-client deployment.

**Warning signs:**
- Deploy function is a sequential `await` chain with no compensation logic
- No pre-deploy state captured before the first write call
- Rollback is documented as "manually undo in ISC UI"

**Phase to address:** Deployment Pipeline phase — rollback is not a feature to add later; it must be designed into the deploy architecture from day one

---

### Pitfall 6: Transform Delete/Recreate Race When Referenced by Identity Profile

**What goes wrong:**
ISC transforms have immutable `name` and `type` fields. If a policy is renamed, the tool must delete the old transform and create a new one with the new name. If the identity profile still has a `reference` mapping pointing to the old transform name when the delete is issued, ISC returns an error or silently leaves a dangling reference. Conversely, if the tool removes the identity profile mapping first, triggers an identity refresh mid-deploy, and then the new transform is not yet created, identities process with a missing attribute.

**Why it happens:**
The delete/recreate requirement is documented but the interaction with identity profile references is not. Developers assume they can delete and recreate freely without pre-clearing the mapping.

**How to avoid:**
Enforce strict ordering for transform rename/delete:
1. Remove the identity profile attribute mapping that references the old transform name
2. Delete the old transform
3. Create the new transform
4. Re-add the identity profile attribute mapping pointing to the new name

Never issue a "Delete Transform" API call while the identity profile's `identityAttributeConfig` still references it. Build a dependency check into the deploy diff logic.

**Warning signs:**
- Deploy logic deletes and recreates transforms in a single step without touching the identity profile first
- No ordering enforcement between transform operations and identity profile PATCH operations in the deploy pipeline

**Phase to address:** Transform Generation + Deployment Pipeline phase

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hard-code ISC base URL format in deploy service | Avoids URL configuration complexity | Breaks if SailPoint changes URL structure; doesn't support sandbox/VA tenants | Never — use configured tenant URL from start |
| Store access token in electron-store between sessions | Survives app restarts without re-auth | Violates PAT security model; token expiry is opaque; creates stale token bugs | Never — keep token in memory only |
| Single flat IPC channel namespace | Fast to prototype | Unmanageable at 20+ operations; no type safety | Prototype only, never ship to milestone 1 |
| Skip pre-deploy snapshot on "small" deploys | Faster deploys | No rollback path for partial failures | Never for deploys that touch identity profile or roles |
| Use electron-store `encryptionKey` for PAT | One line of code | Unauthenticated CBC encryption; modifiable by attacker | Never for secrets — use `safeStorage` |
| Load Monaco workers from CDN | Zero local bundling setup | Fails offline; forces CSP relaxation for external origins | Never — app must work on air-gapped tenant networks |
| Sequential ISC PATCH calls without idempotency keys | Simple code | Retry logic re-applies already-applied changes; double-patching roles/APs causes inconsistency | Never in the deploy pipeline |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| ISC OAuth token | Refresh immediately on 401 and retry | Use a proactive refresh 60s before expiry; a 401 mid-deploy may mean rate limit, not just expiry |
| ISC Transforms API | PUT to update transforms | Transforms use PUT for full replacement but `name` and `type` are still immutable — verify with GET after update; use DELETE+POST for renames |
| ISC Identity Profile PATCH | Send full `identityAttributeConfig` object | The PATCH rejects if identity tasks are in progress; add retry-with-backoff specifically for 409 Conflict responses on identity profile updates |
| ISC Roles pagination | Fetch roles with a single request | Roles list caps at 50 per page; must implement pagination loop with `offset` parameter to get all roles before attempting create-or-update logic |
| ISC Entitlements | Use entitlement name/DN in access profile payloads | Access profiles require entitlement UUID; always resolve name → UUID via `GET /v2025/entitlements?filters=source.id eq "..."` immediately before deploy, not at policy save time (UUIDs can change) |
| ISC Segments | Build complex `visibilityCriteria` | Segment criteria supports only `AND` + `EQUALS` at one level deep — any nested or OR logic silently fails or returns a 400 |
| ISC Rate Limits | Retry immediately on 429 | ISC returns `Retry-After` header; honor it; add jitter to prevent synchronized retries across multiple deploy steps |
| isomorphic-git + LightningFS | Assume writes are durable after commit | Call `fs.flush()` after every git operation; LightningFS can apply file operations out of order on crash |
| isomorphic-git authentication | Use same auth for HTTP push as for clone | HTTP push to private repos requires explicit `http.onAuth` callback returning `{ username, password }` — omitting it causes a silent push failure, not an error |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Resolving entitlement UUIDs at policy save time | Stale UUIDs cause access profile creation failures silently | Always resolve immediately before deploy, not on save | Whenever entitlements are re-aggregated on the tenant |
| Fetching all ISC resources for diff viewer without pagination | Diff viewer shows incomplete or wrong state | Implement pagination for every list endpoint (roles, access profiles, transforms) before building diff logic | At ~51 objects of any type |
| Auto-committing to git on every keystroke in Monaco | Git log becomes thousands of micro-commits; push times grow | Debounce auto-commit to fire only on explicit Save or policy close | Immediately with an active user |
| Batched git push timer running when window is closing | Push is killed mid-operation; corrupts git index | On `will-quit`, flush any pending push synchronously before allowing quit | Every app close |
| Storing full ISC API response payloads in audit log per deploy | electron-store file grows unbounded | Store diffs only (before/after for changed fields); cap log to last N entries with rotation | After ~50 deploys with many resources |
| Angular zone.js change detection over large ISC API response objects | UI jank when displaying 100+ policies/roles in diff viewer | Use `OnPush` change detection strategy and `trackBy` in ngFor; run ISC API calls outside Angular zone (`NgZone.runOutsideAngular`) | At 20+ policies with 5+ sources each |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| PAT secret in git commit (config export, debug log, etc.) | Permanent credential exposure in git history | Pre-commit hook scans for client_id/client_secret patterns; never include credentials in any exported file; scrub before every git add |
| Logging ISC API request bodies containing Bearer token | Token theft from log files | Strip `Authorization` header from all logged requests; log only method, URL, status code, and response time |
| `nodeIntegration: true` for "easier" Angular-Electron wiring | Full Node.js access from renderer; RCE via XSS | Use contextBridge preload exclusively; zero exceptions |
| Opening external URLs in the main Electron window | Navigating away from app URL gives external site Node access if security defaults were relaxed | Use `shell.openExternal()` for all external links; add `will-navigate` handler to block non-app URLs |
| `safeStorage` fallback to plaintext on Linux headless | PAT secret stored unencrypted on disk | Check `safeStorage.getSelectedStorageBackend()` on Linux; warn user and block credential save if backend is `basic_text` |
| PAT secret included in electron-store export used for debugging | Secret leaves local machine | Add `scrubCredentials()` function called before any log or export; test scrubbing in CI |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Deploy progress modal with no per-step granularity | Admin has no idea what failed when deploy errors mid-way | Show named step indicators (e.g., "Deploying transforms...", "Updating identity profile...") with success/fail/in-progress icons per step |
| Rollback that silently fails | Tenant left in corrupt state without admin knowing | Show rollback as a separate progress modal; report rollback success/failure per step; surface manual recovery steps if rollback itself fails |
| Drift detection warning with no diff detail | Admin dismisses warning without understanding what drifted | Show exactly which fields changed outside the tool since last deploy (field-level diff of ISC live state vs. last deploy snapshot) |
| Git push failure that is swallowed | Audit trail silently not backed up | Surface git push errors in a persistent notification; do not mark audit entry as "synced" until push succeeds |
| "Apply Changes" (identity refresh) without estimated impact | Admin triggers refresh not realizing it will re-evaluate 10,000 identities | Fetch affected identity count via ISC before confirming; show in modal before admin confirms |
| Monaco editor validation errors not surfaced until deploy | Admin discovers invalid policy JSON at deploy time, not at edit time | Wire Monaco JSON schema validation to a component-level error state; disable Save button when schema validation fails |

---

## "Looks Done But Isn't" Checklist

- [ ] **Deploy pipeline:** Appears to deploy all resources — verify it also handles the case where a resource already exists (create vs. update branching) and logs which path was taken
- [ ] **Rollback:** Appears to undo changes — verify it handles the case where the compensating API call itself returns 404 (resource was deleted by another process) without crashing the rollback loop
- [ ] **Token refresh:** Appears to keep auth alive — verify the refresh fires 60s before expiry under realistic timing (test with a mock token that expires in 90s)
- [ ] **ISC pagination:** Appears to fetch all roles/APs — verify by creating 51 roles on a test tenant and confirming the diff viewer shows all 51
- [ ] **Credential security:** PAT secret "encrypted" — verify the electron-store JSON file on disk does not contain the raw secret in any field; confirm `safeStorage` is being used, not `encryptionKey`
- [ ] **Git auto-commit:** Appears to commit on policy save — verify the committer identity is the configured service account (not the OS git global config) and the commit message contains the operator name from ISC
- [ ] **Transform delete/recreate:** Appears to rename transforms — verify that the identity profile mapping is removed before the old transform is deleted (test by renaming a policy that has been deployed at least once)
- [ ] **IPC preload security:** `window.api` appears to expose all needed methods — verify `ipcRenderer` itself is NOT accessible from the renderer devtools console
- [ ] **Monaco CSP:** Editor appears to load — verify it works with `webSecurity: true` (not just in dev mode with security relaxed)
- [ ] **Batched git push on quit:** Push appears to sync — verify that closing the window while a commit is pending but unpushed does trigger the push before quit completes

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Partial deploy with no rollback snapshot | HIGH | Manually audit ISC for every resource type the tool manages; compare against last known-good policy file; manually delete/restore via ISC admin UI |
| PAT secret committed to git | HIGH | Rotate the PAT immediately in ISC admin UI; force-push rewrite of git history (or delete and recreate repo); audit ISC logs for unauthorized API calls during exposure window |
| nodeIntegration left enabled in shipped build | HIGH | Patch release with corrected webPreferences; notify users to update immediately; check for any exposed sensitive data in renderer-accessible memory |
| electron-store using CBC encryption for secrets | MEDIUM | Migrate: read all secrets with old key, re-encrypt with safeStorage, delete old electron-store fields; ship as a migration on first launch of patched version |
| Monaco fails to load due to CSP | LOW | Add required CSP directives (`unsafe-eval`, `worker-src blob:`) scoped to the editor window; bundle workers locally; redeploy |
| IPC channel naming conflicts after proliferation | MEDIUM | Refactor into namespaced typed bridge interface; requires coordinated change across preload, main process handlers, and Angular services |
| git index corruption from missing `fs.flush()` | MEDIUM | Delete local git repo and re-initialize; all audit history since last remote push is lost — this is why batched push interval must be short |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| nodeIntegration enabled | Foundation / Electron Shell | Devtools console: `window.require` is undefined; no Node APIs accessible from renderer |
| Credential storage via electron-store CBC | Connection & Credential Management | electron-store JSON file on disk contains no raw secret; `safeStorage` API calls visible in main process logs |
| Monaco CSP failure | Policy Definition Editor | Monaco loads and validates JSON with `webSecurity: true` in production BrowserWindow config |
| IPC channel proliferation | Foundation / Electron Shell | TypeScript interface for `window.api` exists and is enforced at compile time; no raw `ipcRenderer` in Angular code |
| Non-atomic deploy / no pre-deploy snapshot | Deployment Pipeline | Kill the app mid-deploy; verify rollback restores all resources to pre-deploy state; audit log contains pre-deploy snapshot |
| Transform delete/recreate ordering | Transform Generation + Deployment Pipeline | Deploy a policy rename; verify identity profile mapping is removed before old transform delete is called |
| ISC pagination missing | Deployment Pipeline / Diff Viewer | Integration test with tenant containing 51+ roles confirms all are returned by list queries |
| Entitlement UUID staleness | Deployment Pipeline | Deploy after tenant re-aggregation; verify access profiles created with current UUIDs, not cached ones |
| Rate limit handling | Deployment Pipeline | Simulate 429 responses in test; verify exponential backoff with jitter is applied and deploy eventually succeeds |
| LightningFS missing `fs.flush()` | Audit & Git phase | Kill app mid-commit repeatedly; verify git repo remains valid on restart |
| PAT in git commit | Audit & Git phase | Pre-commit hook blocks commits containing `clientSecret` or `client_secret` patterns; verified in CI |
| Batched push not flushed on quit | Audit & Git phase | Commit a policy, immediately close app, verify push appears on remote |

---

## Sources

- [Electron Security Documentation](https://www.electronjs.org/docs/latest/tutorial/security) — HIGH confidence; official
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) — HIGH confidence; official
- [Breaking electron-store's encryption — Jesse Li](https://blog.jse.li/posts/electron-store-encryption/) — MEDIUM confidence; technical deep-dive on CBC weakness
- [electron-store GitHub (sindresorhus)](https://github.com/sindresorhus/electron-store) — HIGH confidence; official library docs
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage) — HIGH confidence; official
- [safeStorage Linux plaintext fallback (Electron issue #33640)](https://github.com/electron/electron/issues/33640) — HIGH confidence; official issue tracker
- [Monaco Editor CSP inline styles (issue #271)](https://github.com/microsoft/monaco-editor/issues/271) — HIGH confidence; official issue tracker
- [Monaco Editor unsafe-eval (issue #2488)](https://github.com/microsoft/monaco-editor/issues/2488) — HIGH confidence; official issue tracker
- [monaco-editor-workers npm package](https://www.npmjs.com/package/monaco-editor-workers) — MEDIUM confidence; community package for local worker bundling
- [Electron IPC Memory Leak (issue #27039)](https://github.com/electron/electron/issues/27039) — HIGH confidence; official issue tracker
- [isomorphic-git — pure JS git for Node/browser](https://isomorphic-git.org/) — HIGH confidence; official
- [isomorphic-git LightningFS flush caveat](https://isomorphic-git.org/docs/en/faq) — MEDIUM confidence; official FAQ
- [SailPoint ISC Rate Limit Documentation](https://developer.sailpoint.com/docs/api/rate-limit/) — HIGH confidence; official SailPoint developer docs
- [SailPoint ISC Handling Rate Limits](https://developer.sailpoint.com/docs/connectivity/saas-connectivity/in-depth/handling-rate-limits/) — HIGH confidence; official SailPoint developer docs
- [SailPoint ISC Transform Immutability (CLI Transforms docs)](https://developer.sailpoint.com/docs/tools/cli/transforms/) — MEDIUM confidence; inferred from official docs + community forum
- [Identity Profile cannot update while tasks in progress (SailPoint community)](https://developer.sailpoint.com/discuss/t/the-system-cannot-update-identity-profile-while-identity-tasks-are-in-progress/76971) — MEDIUM confidence; community-verified behavior
- [Electron Penetration Testing — Doyensec](https://blog.doyensec.com/2019/04/03/subverting-electron-apps-via-insecure-preload.html) — MEDIUM confidence; security research
- [Electron Security Risks and CVE Case Studies — SecureLayer7](https://blog.securelayer7.net/electron-app-security-risks/) — LOW confidence; secondary analysis

---
*Pitfalls research for: Angular + Electron desktop identity governance tool (SailPoint ISC Policy Engine)*
*Researched: 2026-03-25*
