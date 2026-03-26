# Project Research Summary

**Project:** Policy Engine — SailPoint ISC Affiliation Policy Configuration Tool
**Domain:** Angular + Electron desktop identity governance administration (IGA) tool
**Researched:** 2026-03-25
**Confidence:** HIGH (stack + architecture verified against live codebase and official docs; features verified against ISC API documentation; pitfalls verified against official Electron and ISC sources)

## Executive Summary

The Policy Engine is an IGA configuration tool being added to an existing Angular 21 + Electron 36 monorepo (`ui-development-kit`). Its core value is reducing 1–2 months of manual SailPoint ISC configuration to minutes by auto-generating transforms, identity profile attribute wiring, access profiles, roles, segments, and provisioning policies from a single policy definition. The product niche is narrow and well-defined: no existing ISC community tool (Community Toolbox, Configuration Hub) provides policy-driven resource generation or local-first safe deployment. All stack decisions are constrained by what is already in the repo — this is not a greenfield build.

The recommended approach is: local-first store with explicit deploy gate, IPC-isolated architecture following the UDK's established contextBridge pattern, saga-style deploy pipeline with pre-deploy snapshot and rollback, and Monaco-based JSON policy editing with embedded schema validation. All ISC API calls must originate in the Electron main process — never the renderer — to enforce the credential security boundary. Git-backed audit history using `isomorphic-git` (pure JS, no native binaries) with a service account committer provides the audit trail that compliance-conscious admins require.

The top risks are architectural: allowing `nodeIntegration: true` in the renderer (RCE surface), using `electron-store`'s CBC `encryptionKey` for PAT secrets instead of OS-native `safeStorage` (weak encryption), and skipping the pre-deploy snapshot (making rollback impossible). A secondary risk is deploy ordering: ISC enforces that transforms must exist before the identity profile can reference them, and identity profile mappings must be removed before a transform can be deleted. These constraints are not negotiable and must be encoded in the deploy pipeline from day one, not retrofitted later.

---

## Key Findings

### Recommended Stack

The project is constrained to Angular 21.2.4 + Electron 36.8.1 already in the repo. Only four new runtime dependencies are required: `isomorphic-git` (pure-JS git, no system git binary dependency), `@jean-merelis/ngx-monaco-editor@21.0.0` (only actively maintained Angular 21-compatible Monaco wrapper), `monaco-editor@0.55.1`, and `axios-retry@4.5.0` (ISC rate limit handling). The `sailpoint-api-client` should be updated from 1.8.1 to 1.8.6 (latest v2025 client) and pinned there — the v2026 API released 2026-03-24 should not be chased in v1. All other dependencies (Angular Material, Angular CDK, diff, js-yaml, RxJS, axios) are already in the repo.

**Core technologies:**
- Angular 21.2.4 + Angular Material 21.2.2 + CDK 21.2.2 — UI framework and components, already in repo; use `cdkDropList` + `cdkDrag` for priority reordering, `MatDialog` for deploy/diff modals
- Electron 36.8.1 + `electron.safeStorage` — desktop shell with OS-native credential encryption; do NOT upgrade to Electron 41 mid-project (breaking ABI changes)
- `isomorphic-git@1.37.4` — pure-JS git for auto-commit + batched push; use with Node `fs`, not LightningFS (Electron main process has real Node fs)
- `@jean-merelis/ngx-monaco-editor@21.0.0` + `monaco-editor@0.55.1` — Angular 21-compatible Monaco wrapper with embedded JSON schema validation
- `sailpoint-api-client@1.8.6` — official typed ISC REST client; pin to v2025 paths, do not use v2026 endpoints
- `axios-retry@4.5.0` — ISC 429 handling with exponential backoff and `Retry-After` header respect
- `electron.safeStorage` + Node `fs` (built-in) — OS keychain-backed encryption for PAT secret and git token; replaces deprecated `keytar` already removed from the repo

**Critical version constraints:**
- TypeScript must stay at 5.9.3 (repo-pinned); do not attempt to upgrade
- Electron must stay at 36.8.1 for this project; do not upgrade mid-build (36→41 has breaking changes)
- Do not install ESM-only packages (e.g., `electron-store` v11) in the `app/` workspace — `tsconfig.serve.json` compiles to CommonJS
- The `@angular/cli@17.3.17` vs `@angular/core@21` mismatch in the repo is intentional; do not attempt to resolve it

See `.planning/research/STACK.md` for full rationale and alternatives considered.

---

### Expected Features

The MVP is well-defined. Every P1 feature is required for the tool to eliminate the manual ISC configuration workflow. No P1 feature should be deferred — the full set was determined by the dependencies between ISC resources (transforms must be deployed before identity profile wiring, which must happen before access profiles, etc.).

**Must have (table stakes — P1):**
- ISC connection configuration + connection test with tenant validation + bootstrap (default transforms + identity attributes if absent)
- Policy CRUD (create, edit, copy, delete) with drag-and-drop priority reordering
- Monaco-based JSON policy definition editor with embedded ISC schema validation — errors surface at edit time, not deploy time
- Entitlements configuration per policy (birthright + requestable) with ISC typeahead search for name-to-UUID resolution
- OU mapping per policy per target source
- "Configure Policies" master toggle and "Policies in Scope" chip selection
- Transform generation (4 types: `get-affiliations`, `get-primary-affiliation`, `set-lifecycle-state`, `{source}-ou`)
- Identity profile attribute wiring (PATCH identity profile with transform references)
- Access profile + role + segment generation per policy
- Provisioning policy update per source per policy
- Pre-deploy diff viewer with create/update/delete/no-change categorization per resource
- Drift detection warning before deploy (compares live ISC state to last deploy snapshot)
- Dependency-ordered deploy pipeline with per-step progress modal (in-progress/success/failed per step)
- Rate limit handling (HTTP 429 + `Retry-After` header + exponential backoff with jitter)
- Rollback on partial deploy failure (pre-deploy snapshot + LIFO compensation)
- "Apply Changes" (ISC identity refresh) with affected identity count preview
- Local audit log (in-app, filterable by policy/action/date)
- Git auto-commit on policy save with operator attribution (service account committer, operator name in commit body)
- Batched git push (configurable interval, default 5 min, skip if nothing new)
- Git settings configuration (service account, remote URL, auth token, push interval)

**Should have — add after v1 validation (P2):**
- Simple/Medium lifecycle type support — defer until `complex` type is proven in production tenants
- Entitlement browser (visual picker from ISC) — defer until admins report friction with DN/name search
- Inline transform editor — defer until admins report friction editing transforms separately in ISC
- Multi-policy import via JSON bulk upload — defer until admins with 10+ policies report data entry friction

**Defer (v2+, P3):**
- Dev-to-Prod policy promotion (export/import between tenants) — requires multi-tenant credential architecture rethink
- Policy impact simulation (population matching) — requires ISC identity search query builder feature
- OAuth browser auth — replace PAT once core tool is validated and PAT is a known blocker
- Policy versioning / named snapshots — named restore points beyond git expertise

**Anti-features (never build):**
- Real-time sync / auto-deploy — destroys the local-first safety model and makes rollback impossible
- Multi-operator concurrent editing — electron-store is single-process; concurrent writes corrupt state
- Full ISC admin portal — out of scope; tool is deliberately narrow

See `.planning/research/FEATURES.md` for full feature dependency map, prioritization matrix, and competitor analysis.

---

### Architecture Approach

The architecture follows the UDK's established two-process Electron pattern: Angular renderer process communicates with the Node.js main process exclusively through typed IPC channels via `contextBridge`. All ISC API calls, credential handling, git operations, and file I/O live in the main process. The renderer is never allowed to hold credentials or call ISC directly. The local `electron-store` (encrypted via `safeStorage`) is the source of truth; ISC is the deployment target. State flows from electron-store into Angular's `BehaviorSubject` reactive streams on app start and after every write.

**Major components:**
1. **IPC bridge** (`app/policy-engine/preload-api.ts` + `app/policy-engine/ipc-handlers.ts`) — typed channel contract between renderer and main process; all IPC namespaced under `pe:` prefix; registered via `setupPolicyEngineHandlers()` in `app/main.ts`
2. **policy-store module** (`app/policy-engine/policy-store/`) — electron-store backed by `safeStorage` AES for policy persistence; the local source of truth
3. **isc-client module** (`app/policy-engine/isc-client/`) — PAT client_credentials OAuth flow, in-memory token cache with proactive 60s-before-expiry refresh, `sailpoint-api-client` + `axios-retry` for all ISC REST calls
4. **deploy module** (`app/policy-engine/deploy/`) — saga-style orchestrator (`pipeline.ts`) with ordered `DeployStep[]` array, each step having `execute()` + `compensate()`; pre-deploy snapshot captured before first write; rollback runs compensation in LIFO order on any failure; progress events streamed to renderer via `webContents.send`
5. **git module** (`app/policy-engine/git/`) — `isomorphic-git` with Node `fs`; auto-commit on policy save; `scheduler.ts` interval-based batched push (configurable, default 5 min); explicit `http.onAuth` callback for private repo push
6. **audit module** (`app/policy-engine/audit/`) — append-only log stored in electron-store; captures deploy records (who, what, diff, outcome, timestamp); queried by Angular audit log viewer
7. **Angular feature module** (`src/app/policy-engine/`) — lazy-loaded; services are thin IPC facades using `ElectronApiFactoryService`; state managed via `BehaviorSubject` + `async` pipe; `OnPush` change detection for performance

**Key patterns:**
- Typed IPC facade — every channel is a TypeScript function, not a raw string; never expose `ipcRenderer` directly to renderer
- Saga deploy orchestrator — ordered steps with compensation stack; only correct approach for multi-resource external API deployments
- Local-first with explicit publish — editor writes to local store + git commit; ISC only touched on user-initiated Deploy
- PAT in main process only — renderer never sees credentials; all auth lives behind IPC boundary

See `.planning/research/ARCHITECTURE.md` for full component diagram, data flow diagrams, and build order implications.

---

### Critical Pitfalls

1. **`nodeIntegration: true` in renderer** — gives Angular (and any XSS) full Node.js access. Prevention: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` on every `BrowserWindow`; expose only named IPC wrappers via `contextBridge`, never `ipcRenderer` itself. Must be verified before any feature code is written.

2. **Using `electron-store` `encryptionKey` for PAT secrets** — unauthenticated CBC-mode encryption with a hardcoded key; modifiable by an attacker without knowing the key. Prevention: use `safeStorage.encryptString()` before writing any credential to disk. The UDK repo already uses this pattern in `app/authentication/config.ts`. On Linux headless: check `safeStorage.getSelectedStorageBackend()` and surface an error if backend is `basic_text` rather than silently writing plaintext.

3. **Non-atomic deploy without pre-deploy snapshot** — a mid-deploy failure leaves ISC in a partial state with no rollback path. Prevention: capture a full snapshot of every ISC resource the tool manages before the first write operation; store in audit log; rollback reads snapshot and issues compensating API calls in reverse dependency order. This is not a "later enhancement" — it must be designed into the deploy pipeline from day one.

4. **Transform delete/recreate ordering with identity profile references** — deleting a transform while the identity profile still references it by name causes ISC API errors or dangling references. Prevention: enforce strict order — (1) remove identity profile mapping, (2) delete old transform, (3) create new transform, (4) re-add identity profile mapping. Build this dependency check into the deploy diff logic.

5. **Monaco Editor blocked by Electron CSP** — Monaco requires `unsafe-eval` and `worker-src blob:` to function; a strict CSP causes silent failures (blank editor, no syntax highlighting). Prevention: bundle all Monaco workers locally (never CDN), configure `MonacoEnvironment.getWorker()` for local workers, and add only the minimum required CSP relaxations scoped to the editor window. Must be verified with `webSecurity: true` in production BrowserWindow config.

**Additional pitfalls to address during implementation:**
- ISC roles/APs list endpoints cap at 50 per page — must implement pagination loops before building diff viewer (test with 51+ objects on a tenant)
- Entitlement UUIDs must be resolved immediately before each deploy, not cached at policy save time (UUIDs change after re-aggregation)
- Identity profile PATCH returns 409 Conflict if identity tasks are in progress — need retry-with-backoff specifically for this response code
- IPC channel proliferation (20+ channels for Policy Engine) — design the typed API contract with namespaced domains before writing any feature IPC code
- Git push not flushed on app quit — on `will-quit`, flush any pending push synchronously before allowing quit

See `.planning/research/PITFALLS.md` for full pitfall details, technical debt patterns, integration gotchas, and the "Looks Done But Isn't" verification checklist.

---

## Implications for Roadmap

The architecture's build order (from ARCHITECTURE.md) directly maps to a natural phase structure. Each phase unblocks the next through a clear dependency chain. The feature dependency tree in FEATURES.md confirms this ordering is not optional — ISC's own resource dependency constraints enforce it.

### Phase 1: Foundation — Electron Shell + IPC Bridge + Local Store

**Rationale:** Everything else depends on the IPC bridge and local persistence working. Angular cannot render meaningful UI until it can read/write policies. All subsequent phases add feature code on top of this foundation. This phase also enforces the security baseline before any feature code can introduce vulnerabilities.

**Delivers:** Typed IPC API contract, policy CRUD to encrypted local store via `safeStorage`, settings UI (ISC connection config, git settings), app scaffold with lazy-loaded policy engine module.

**Addresses:**
- ISC connection configuration + PAT credential storage
- Git settings configuration (service account, remote URL, push interval)
- Policy CRUD (create, edit, delete, copy) persisted to encrypted local store

**Avoids:**
- Pitfall 1 (nodeIntegration) — security baseline established before any feature code
- Pitfall 2 (electron-store CBC for secrets) — `safeStorage` pattern from day one
- Pitfall 4 (IPC channel proliferation) — typed `policyEnginePreloader` API contract defined up front

**Research flag:** Standard patterns. The UDK repo already has the IPC bridge pattern (`app/github/`, `app/authentication/`). Copy and adapt — no additional research needed.

---

### Phase 2: ISC Connection + Bootstrap + Identity/Entitlement Search

**Rationale:** The policy editor (Phase 3) requires live ISC data for identity profile selection, identity search, and entitlement search. The connection layer and bootstrap must work before any policy data entry can be completed. This phase also validates the ISC API integration pattern (PAT auth, token refresh, rate limiting) before the high-stakes deploy pipeline is built.

**Delivers:** Connection test with tenant validation, automatic bootstrap of default `affiliations`/`primaryAffiliation` attributes and `get-affiliations`/`get-primary-affiliation` transforms if absent, identity typeahead search (name → UUID), entitlement typeahead search (DN/name → UUID scoped to source), identity profile dropdown populated from live ISC.

**Uses:** `sailpoint-api-client@1.8.6`, `axios-retry@4.5.0`, `isc-client/client.ts` with in-memory token cache and proactive refresh

**Avoids:**
- Pitfall of 401 mid-deploy from stale token — proactive 60s-before-expiry refresh established here
- ISC pagination gaps — implement pagination loops for all list endpoints in this phase, before diff viewer is built

**Research flag:** ISC-specific. The `GET /v2025/search` endpoint behavior for identity typeahead, the `GET /v2025/entitlements` filter syntax, and the bootstrap PATCH/POST patterns for identity attributes/transforms should be validated against the live API during implementation. MEDIUM confidence on exact API behavior from research.

---

### Phase 3: Policy Definition Editor + Policy Management UI

**Rationale:** Policy CRUD shells exist from Phase 1. This phase fills in the full policy editor experience — Monaco with schema validation, priority drag-and-drop reordering, entitlements configuration per policy, OU mapping, "Policies in Scope" chip selection, and the "Configure Policies" master toggle. None of this writes to ISC; all changes go to local store only.

**Delivers:** Full policy authoring workflow — Monaco editor with embedded ISC policy schema, drag-and-drop priority reorder list, per-policy entitlement/OU configuration, master toggle and scope selection, git auto-commit on save with operator attribution, git scheduler for batched push.

**Uses:** `@jean-merelis/ngx-monaco-editor@21.0.0` + `monaco-editor@0.55.1`, Angular CDK `cdkDropList` + `cdkDrag`, `isomorphic-git@1.37.4`, Angular Material `MatChipsModule`

**Avoids:**
- Pitfall 3 (Monaco CSP) — bundle Monaco workers locally, verify with `webSecurity: true` in this phase
- Performance trap of committing on every keystroke — debounce auto-commit to fire only on explicit Save or policy close
- Performance trap of missing `fs.flush()` — verify git repo stays valid after simulated crashes

**Research flag:** Monaco CSP + Angular 21 integration is moderately documented but has known quirks. Recommend testing the CSP configuration early in this phase before building the full editor UI — the blank editor failure mode is silent and time-consuming to debug.

---

### Phase 4: Transform Generation + Resource Generators

**Rationale:** This is the core value computation — all downstream ISC objects are generated from policy definitions. This phase has no user-facing UI beyond a "preview generated resources" view; its output feeds directly into the deploy pipeline (Phase 5). Transform generation depends on the complete policy model being stable (Phase 3 must be complete).

**Delivers:** Transform generation engine (all 4 types: `get-affiliations`, `get-primary-affiliation`, `set-lifecycle-state`, `{source}-ou`), identity profile attribute wiring logic, access profile + role generator per policy, segment generator, provisioning policy updater per source.

**Key constraint:** Transform generation requires ALL policies and their priority order simultaneously — it cannot be generated from a subset. The `get-affiliations` transform encodes all policy `accountAttributes` conditions.

**Avoids:**
- Pitfall 6 (transform delete/recreate ordering) — build the dependency check into the generation logic here so the deploy pipeline can enforce ordering correctly in Phase 5
- ISC's ISC entitlement UUID staleness — do not cache entitlement UUIDs from Phase 2 lookups; resolve immediately before each deploy in Phase 5

**Research flag:** The exact structure of the 4 transform types and the identity profile `identityAttributeConfig` PATCH payload format is well-documented in SailPoint's transform CLI docs. MEDIUM confidence (inferred from official docs + community). Validate transform payloads against a live ISC sandbox tenant early in this phase.

---

### Phase 5: Deploy Pipeline + Diff Viewer + Rollback

**Rationale:** This is the most architecturally complex phase and the one where pitfall risk is highest. The deploy pipeline must be built with the saga orchestrator pattern, pre-deploy snapshot, and rollback as first-class concerns — not retrofitted after a production failure. The diff viewer and drift detection depend on the pipeline's "fetch live ISC state" logic, making them natural companions in this phase.

**Delivers:** Saga-style deploy orchestrator with pre-deploy snapshot capture and LIFO rollback, pre-deploy diff viewer (create/update/delete/no-change per resource), drift detection warning (fields changed outside tool since last deploy), deploy progress modal with per-step indicators, rate limit handling with `Retry-After` + exponential backoff + jitter, "Apply Changes" (ISC identity refresh) with affected identity count preview.

**Uses:** `deploy/pipeline.ts` saga orchestrator, `deploy/diff.ts` ISC state fetcher/comparator, `diff` library for JSON comparison, Angular Material `MatDialog` for diff viewer and progress modal

**Avoids:**
- Pitfall 5 (non-atomic deploy) — pre-deploy snapshot is the first operation before any write; rollback is implemented in the same PR as execute
- Pitfall 6 (transform rename/delete ordering) — deploy step order enforces the 4-step sequence from research
- ISC identity profile 409 Conflict — add retry-with-backoff specifically for this response code on the identity profile PATCH step
- ISC roles pagination — pagination loop confirmed and tested against 51+ objects before shipping diff viewer

**Research flag:** Needs deeper research during planning. The saga orchestrator pattern for this specific ISC resource dependency order (transforms → identity profile → entitlements → APs → roles → segments → provisioning policies) has no reference implementation publicly. Rollback compensation for each step (especially identity profile PATCH revert and segment deletion when role creation has partially succeeded) requires careful design. Recommend `/gsd:research-phase` for this phase.

---

### Phase 6: Audit Log + Git Push Verification + Security Hardening

**Rationale:** Audit log can be built at any point (the pipeline writes to it from Phase 5), but a dedicated phase to complete the audit viewer UI, verify all security properties end-to-end, and close the "Looks Done But Isn't" checklist ensures the product ships in a production-safe state.

**Delivers:** In-app filterable audit log viewer, pre-commit hook blocking PAT secret patterns in git commits, `will-quit` flush for batched git push, `safeStorage` backend check on Linux with clear user error, credential scrubbing for any log/export paths, end-to-end security verification (nodeIntegration off, CSP correct, no raw ipcRenderer in renderer DevTools).

**Avoids:**
- PAT secret accidentally committed to git repo
- Batched push killed mid-operation on app close corrupting git index
- `safeStorage` silently writing plaintext on Linux headless environments
- Audit log growing unbounded — cap to last N entries with rotation, store diffs not full API payloads

**Research flag:** Standard patterns. Security hardening checklist is well-documented in Electron security official docs. No additional research needed.

---

### Phase Ordering Rationale

- **Phase 1 before everything:** IPC bridge + local store are the load-bearing infrastructure. Nothing works without them. Security baseline must be established before feature code introduces surface area.
- **Phase 2 before Phase 3:** Policy editor requires live ISC data (identity profiles, entitlement search) to be useful. An editor that cannot resolve names to UUIDs is incomplete.
- **Phase 3 before Phase 4:** Resource generators require a stable, complete policy model. The policy editor defines that model.
- **Phase 4 before Phase 5:** The deploy pipeline calls the generators. Generators must exist and be tested before the orchestrator runs them.
- **Phase 5 as a single unit:** Diff viewer, drift detection, deploy pipeline, and rollback are logically inseparable. Shipping deploy without rollback is a production safety failure, not a phasing trade-off.
- **Phase 6 after Phase 5:** Audit log viewer depends on the pipeline writing audit entries. Security hardening closes out the product.

---

### Research Flags

**Phases needing deeper research during planning (`/gsd:research-phase`):**
- **Phase 5 (Deploy Pipeline):** The saga rollback compensation for ISC's specific resource types and the identity profile PATCH 409 Conflict retry behavior are not documented anywhere as a complete implementation reference. This is the highest-risk phase.
- **Phase 4 (Transform Generation):** The exact JSON structure for each transform type (`get-affiliations`, `set-lifecycle-state`, etc.) and the identity profile `identityAttributeConfig` PATCH payload should be validated against a live ISC sandbox tenant before implementation begins.

**Phases with standard, well-documented patterns (can skip research-phase):**
- **Phase 1 (Foundation):** The UDK repo already implements the IPC bridge pattern in `app/github/` and `app/authentication/`. Follow the existing code directly.
- **Phase 2 (ISC Connection):** ISC PAT auth and `sailpoint-api-client` usage are officially documented. `axios-retry` configuration for 429 is directly from SailPoint developer docs.
- **Phase 3 (Policy Editor):** Monaco + Angular integration is documented by `@jean-merelis/ngx-monaco-editor`. CDK drag-and-drop is officially documented. The CSP configuration requires early testing but not research.
- **Phase 6 (Audit + Security):** Electron security checklist is the official Electron security docs. No unknowns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All version picks verified against live npm registry and direct inspection of UDK repo `package.json`. Four new dependencies are the minimum required. |
| Features | MEDIUM | ISC-specific API behavior (transform structure, identity profile PATCH semantics) verified against official SailPoint docs and community; no direct competitor exists for comparison. Core feature set is well-defined; exact ISC API payload formats need sandbox validation. |
| Architecture | HIGH | Based on direct inspection of UDK `app/main.ts`, `app/preload.ts`, `app/authentication/config.ts`, `app/sailpoint-sdk/ipc-handlers.ts`, and official Electron docs. The IPC pattern, safeStorage pattern, and module structure are directly observable in the repo. |
| Pitfalls | MEDIUM-HIGH | Electron security pitfalls: HIGH (official docs + CVE research). ISC-specific pitfalls (transform ordering, identity profile 409, pagination): MEDIUM (official docs + SailPoint community, not directly tested). |

**Overall confidence:** HIGH for architecture and stack decisions. MEDIUM for ISC-specific API behavior details that require sandbox validation during Phase 4 and Phase 5.

### Gaps to Address

- **Transform payload JSON structure:** The exact format for `get-affiliations`, `get-primary-affiliation`, `set-lifecycle-state`, and `{source}-ou` transforms needs to be validated against a live ISC sandbox tenant in Phase 4 planning. Research confirmed the pattern exists; exact field names and nesting need empirical verification.
- **Identity profile PATCH payload format:** The `identityAttributeConfig` structure for wiring transform references is documented but community reports suggest edge cases (409 during identity tasks, partial update behavior). Validate during Phase 4/5 planning.
- **ISC Segment `visibilityCriteria` constraints:** Research found that segment criteria supports only `AND` + `EQUALS` at one level deep; any OR logic or nesting fails silently or returns 400. Validate the exact constraint boundaries before building the segment generator.
- **`safeStorage` on Linux:** `isEncryptionAvailable()` can return false on headless/CI Linux. The exact `getSelectedStorageBackend()` behavior across Ubuntu/RHEL/Fedora variants needs verification if the tool will be used in enterprise Linux environments.
- **`@jean-merelis/ngx-monaco-editor` AMD require conflict:** Known conflict between Monaco's AMD loader and Electron's `require`. The library claims to handle this automatically. Verify early in Phase 3 — if the fix breaks in Electron 36, manual `window.require` save/restore may be needed.

---

## Sources

### Primary (HIGH confidence)
- UDK repo direct inspection (`app/main.ts`, `app/preload.ts`, `app/authentication/config.ts`, `app/sailpoint-sdk/ipc-handlers.ts`) — confirmed IPC pattern, safeStorage usage, module structure
- [Electron Security Documentation](https://www.electronjs.org/docs/latest/tutorial/security) — nodeIntegration, contextIsolation, CSP
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage) — OS keychain integration, Linux fallback behavior
- [Electron IPC + contextBridge docs](https://www.electronjs.org/docs/latest/tutorial/ipc) — typed preload pattern
- [SailPoint ISC Rate Limit Documentation](https://developer.sailpoint.com/docs/api/rate-limit/) — 429 + Retry-After behavior
- [SailPoint axios-retry recommendation](https://developer.sailpoint.com/docs/connectivity/saas-connectivity/in-depth/handling-rate-limits/) — axios-retry as recommended approach
- [Angular CDK Drag & Drop](https://material.angular.dev/cdk/drag-drop) — moveItemInArray, cdkDropList
- npm live registry (March 2026) — version verification for all new dependencies
- [Saga pattern reference](https://microservices.io/patterns/data/saga.html) — deploy orchestrator design

### Secondary (MEDIUM confidence)
- [Breaking electron-store encryption — Jesse Li](https://blog.jse.li/posts/electron-store-encryption/) — CBC-mode weakness analysis
- [Monaco Editor CSP issues #271 and #2488](https://github.com/microsoft/monaco-editor/issues/271) — unsafe-eval and inline style requirements confirmed in issue tracker
- [isomorphic-git official site + FAQ](https://isomorphic-git.org/) — Node.js fs usage for Electron main process
- [ISC Community Toolbox GitHub](https://github.com/sailpoint-oss/isc-community-toolbox) — competitor feature set (read-only + API courier only)
- [ISC Configuration Hub documentation](https://developer.sailpoint.com/docs/extensibility/configuration-management/configuration-hub/) — confirmed backup/restore scope only, not policy generation
- [SailPoint ISC Transform CLI docs](https://developer.sailpoint.com/docs/tools/cli/transforms/) — transform immutability constraints
- [Identity Profile 409 Conflict — SailPoint community](https://developer.sailpoint.com/discuss/t/the-system-cannot-update-identity-profile-while-identity-tasks-are-in-progress/76971) — confirmed 409 behavior during identity tasks
- [Spacelift drift detection](https://spacelift.io) + [Atlantis plan-in-PR](https://www.runatlantis.io/) — diff viewer and drift detection UX patterns
- [SailPoint v2026 API announcement](https://developer.sailpoint.com/discuss/t/introducing-sailpoint-api-v2026/199586) — confirmed v2026 released 2026-03-24; pin to v2025

### Tertiary (LOW confidence — needs validation)
- [Electron Penetration Testing — Doyensec](https://blog.doyensec.com/2019/04/03/subverting-electron-apps-via-insecure-preload.html) — secondary security research
- ISC Segment `visibilityCriteria` AND/EQUALS-only constraint — inferred from API behavior reports in SailPoint community; requires direct validation

---
*Research completed: 2026-03-25*
*Ready for roadmap: yes*
