# Architecture Research

**Domain:** Angular + Electron desktop identity governance tool (Policy Engine)
**Researched:** 2026-03-25
**Confidence:** HIGH — based on official Electron docs, direct inspection of the existing UDK codebase (app/main.ts, app/preload.ts, app/authentication/*, app/sailpoint-sdk/*), and verified WebSearch findings.

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        RENDERER PROCESS (Angular)                    │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   Feature    │  │   Feature    │  │   Feature    │               │
│  │  Components  │  │  Components  │  │  Components  │               │
│  │ (policy-     │  │ (deploy-     │  │ (audit-log,  │               │
│  │  editor,     │  │  pipeline,   │  │  settings,   │               │
│  │  monaco)     │  │  diff-view)  │  │  connection) │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                │                │                          │
│  ┌──────┴────────────────┴────────────────┴───────┐                 │
│  │               Angular Service Layer             │                 │
│  │  PolicyService  DeployService  AuditService     │                 │
│  │  IscApiService  StoreService   GitService        │                 │
│  └────────────────────────┬────────────────────────┘                 │
│                           │ window.electronAPI.*                     │
├───────────────────────────┼──────────────────────────────────────────┤
│                    PRELOAD SCRIPT (context bridge)                   │
│                                                                      │
│     contextBridge.exposeInMainWorld('electronAPI', {                 │
│       policyStore.*,  deploy.*,  git.*,  isc.*,  audit.*            │
│     })                                                               │
│     ipcRenderer.invoke(channel, ...args) → Promise<T>               │
├───────────────────────────┼──────────────────────────────────────────┤
│                        MAIN PROCESS (Node.js)                        │
│                                                                      │
│  ┌──────────────────┐  ┌────────────────────────────────────────┐   │
│  │  IPC Dispatcher  │  │         Domain Modules                  │   │
│  │  ipcMain.handle  │  │                                        │   │
│  │  per channel     │  │  policy-store/  (electron-store, AES) │   │
│  └────────┬─────────┘  │  isc-client/   (HTTP, PAT auth, rate) │   │
│           │             │  deploy/       (saga orchestrator)    │   │
│           └────────────►│  git/          (isomorphic-git)       │   │
│                         │  audit/        (electron-store)       │   │
│                         │  authentication/ (existing UDK layer) │   │
│                         └────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Persistent Storage Layer                   │   │
│  │  ~/.sailpoint/policy-engine/policies.enc  (AES-256)          │   │
│  │  ~/.sailpoint/policy-engine/audit.json    (electron-store)   │   │
│  │  ~/policy-engine-repo/                    (git working dir)  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                               │
                               │ HTTPS (ISC v2025 REST API)
                               ▼
                    ┌──────────────────────┐
                    │  ISC Tenant API       │
                    │  (external, per env)  │
                    └──────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Process | Typical Implementation |
|-----------|----------------|---------|------------------------|
| Feature Components | UI rendering, user interaction, Monaco editor host | Renderer | Angular standalone components, reactive forms |
| Angular Service Layer | Business logic, state management, cross-component coordination | Renderer | `@Injectable` services with BehaviorSubject streams |
| Preload Script | Typed API bridge — exposes only required channels to renderer | Bridge | `contextBridge.exposeInMainWorld('electronAPI', {...})` |
| IPC Dispatcher | Route renderer requests to domain handlers | Main | `ipcMain.handle(channel, handler)` per channel |
| policy-store module | Read/write policies with AES-256 encryption via electron-store | Main | `electron-store` with `encryptionKey` option |
| isc-client module | All HTTP calls to ISC API: PAT auth, token refresh, rate limit backoff | Main | Node.js `https` or `axios` + exponential backoff |
| deploy module | Saga-style orchestration: sequential resource creation with rollback | Main | Async generator or step-machine with compensation log |
| git module | Auto-commit on save, batched push on timer | Main | `isomorphic-git` with `node:fs` filesystem adapter |
| audit module | Append-only local audit log with timestamps | Main | `electron-store` separate store instance |
| authentication module | PAT client_credentials OAuth flow, token cache, auto-refresh | Main | Existing UDK `app/authentication/` pattern (reuse) |

---

## Recommended Project Structure

The Policy Engine lives as a component/feature inside the existing UDK monorepo. Follow the existing UDK convention: Angular source in `src/`, Electron main-process code in `app/`.

```
app/
├── policy-engine/               # Main-process domain modules for Policy Engine
│   ├── ipc-handlers.ts          # Registers all ipcMain.handle channels; call from main.ts
│   ├── preload-api.ts           # Partial preload object spread into electronAPI
│   ├── policy-store/
│   │   ├── store.ts             # electron-store instance, AES-256 key from safeStorage
│   │   ├── schema.ts            # Zod/TypeScript schema for stored policy shape
│   │   └── ipc-handlers.ts      # IPC: read-policies, write-policy, delete-policy
│   ├── isc-client/
│   │   ├── client.ts            # PAT auth, token cache, HTTP wrapper with retry
│   │   ├── resources/           # Per-resource CRUD: transforms, roles, access-profiles …
│   │   │   ├── transforms.ts
│   │   │   ├── roles.ts
│   │   │   ├── access-profiles.ts
│   │   │   ├── identity-profiles.ts
│   │   │   ├── segments.ts
│   │   │   └── provisioning-policies.ts
│   │   └── ipc-handlers.ts      # IPC: test-connection, resolve-identity, list-entitlements …
│   ├── deploy/
│   │   ├── pipeline.ts          # Orchestrator: executes steps in order, tracks compensation
│   │   ├── steps.ts             # Step definitions: each step is {execute, compensate}
│   │   ├── diff.ts              # Pre-deploy diff: fetch live ISC state, compare to local
│   │   └── ipc-handlers.ts      # IPC: deploy-dry-run, deploy-execute, deploy-rollback
│   ├── git/
│   │   ├── repo.ts              # isomorphic-git init, commit, push logic
│   │   ├── scheduler.ts         # Interval-based push scheduler (configurable interval)
│   │   └── ipc-handlers.ts      # IPC: git-commit, git-push, git-status
│   └── audit/
│       ├── log.ts               # Append to audit store, query with filters
│       └── ipc-handlers.ts      # IPC: audit-append, audit-query

src/app/
├── policy-engine/               # Angular feature module for Policy Engine
│   ├── policy-engine.module.ts  # Lazy-loaded module (add to app.routes.ts)
│   ├── policy-engine.routes.ts  # Child routes: /settings, /policies, /deploy, /audit
│   ├── services/
│   │   ├── policy.service.ts    # Local state: BehaviorSubject<Policy[]>, CRUD via IPC
│   │   ├── deploy.service.ts    # Deploy flow state machine, progress events
│   │   ├── isc-api.service.ts   # Renderer-side facade over electronAPI.isc.*
│   │   ├── git.service.ts       # Triggers git IPC calls; surfaces last-commit metadata
│   │   └── audit.service.ts     # Queries audit log; surfaces Observable<AuditEntry[]>
│   ├── components/
│   │   ├── settings/            # Connection config, PAT entry, git settings
│   │   ├── policy-list/         # Priority-ordered drag-and-drop policy list
│   │   ├── policy-editor/       # Monaco JSON editor + schema validation + form panels
│   │   ├── deploy/
│   │   │   ├── diff-view/       # Pre-deploy diff table
│   │   │   └── progress-modal/  # Step-by-step deploy progress
│   │   └── audit-log/           # Filterable audit log viewer
│   └── models/
│       ├── policy.model.ts      # Shared TypeScript types (Policy, Entitlement, OuMapping …)
│       └── isc.model.ts         # ISC resource shapes (Transform, Role, AccessProfile …)
```

### Structure Rationale

- **app/policy-engine/:** All Node.js-privileged code stays in the main process. Follows existing UDK convention (`app/sailpoint-sdk/`, `app/authentication/`). Each domain module exports `setupXxxHandlers()` called from `app/main.ts`.
- **src/app/policy-engine/:** Angular feature module, lazy-loaded to keep initial bundle small. Services are thin facades that call `window.electronAPI.*` — no direct Node.js access.
- **models/ shared at feature level:** Policy and ISC shapes need to be referenced by both Angular services (renderer) and a copy referenced by main-process validators. Keep TypeScript interfaces in `src/app/policy-engine/models/` and import into main-process schema validation separately (or use a `shared/` folder at the monorepo root if this grows).

---

## Architectural Patterns

### Pattern 1: Typed IPC Channel Facade

**What:** Every IPC channel is defined as a typed function in the preload partial object (`preload-api.ts`) and matched 1:1 with an `ipcMain.handle` registration. Angular services call `window.electronAPI.policyEngine.xxx()` not raw strings.

**When to use:** All cross-process calls. Never call `ipcRenderer.send` with a raw string from Angular components.

**Trade-offs:** More boilerplate upfront, eliminates entire class of runtime string-mismatch bugs and makes refactoring safe.

**Example:**
```typescript
// app/policy-engine/preload-api.ts
export const policyEnginePreloader = {
  readPolicies: (): Promise<Policy[]> =>
    ipcRenderer.invoke('pe:read-policies'),
  writePolicy: (policy: Policy): Promise<void> =>
    ipcRenderer.invoke('pe:write-policy', policy),
  deployDryRun: (): Promise<DeployDiff> =>
    ipcRenderer.invoke('pe:deploy-dry-run'),
  deployExecute: (): Promise<DeployResult> =>
    ipcRenderer.invoke('pe:deploy-execute'),
};

// app/preload.ts (merged into existing electronAPI spread)
contextBridge.exposeInMainWorld('electronAPI', {
  ...existingHandlers,
  policyEngine: policyEnginePreloader,
});

// src/app/policy-engine/services/policy.service.ts
@Injectable({ providedIn: 'root' })
export class PolicyService {
  private api = (window as any).electronAPI.policyEngine;
  policies$ = new BehaviorSubject<Policy[]>([]);

  async load(): Promise<void> {
    const policies = await this.api.readPolicies();
    this.policies$.next(policies);
  }
}
```

---

### Pattern 2: Saga-Style Deploy Orchestrator (Main Process)

**What:** The deploy pipeline is an ordered list of `DeployStep` objects. Each step has an `execute()` and a `compensate()` function. The orchestrator runs steps in sequence, accumulates a compensation stack, and on failure reverses completed steps in LIFO order.

**When to use:** The deploy pipeline only — anywhere you must guarantee rollback-on-failure across multiple external API calls.

**Trade-offs:** More complex than a simple sequential `await` chain, but the only correct approach when partial completion leaves ISC in a broken state.

**Example:**
```typescript
// app/policy-engine/deploy/pipeline.ts
interface DeployStep {
  name: string;
  execute: () => Promise<unknown>;
  compensate: () => Promise<void>;
}

export async function runDeployPipeline(
  steps: DeployStep[],
  onProgress: (step: string, status: 'running' | 'done' | 'failed') => void
): Promise<void> {
  const completed: DeployStep[] = [];
  for (const step of steps) {
    onProgress(step.name, 'running');
    try {
      await step.execute();
      completed.push(step);
      onProgress(step.name, 'done');
    } catch (err) {
      onProgress(step.name, 'failed');
      // Compensate in reverse order
      for (const done of [...completed].reverse()) {
        await done.compensate().catch(console.error);
      }
      throw err;
    }
  }
}
```

Deploy step order (dependency-driven):
1. Transforms (no dependencies)
2. Identity profile attribute wiring (depends on transforms existing)
3. Entitlement UUID resolution (ISC lookup, not a write — no compensation needed)
4. Access profiles (depends on entitlement UUIDs)
5. Roles (depends on access profiles)
6. Segments (depends on roles)
7. Segment-to-role assignment (depends on segments + roles)
8. Provisioning policies (depends on OU transforms existing)

---

### Pattern 3: Local-First Store with Explicit Save Gate

**What:** All policy edits mutate an in-memory `BehaviorSubject<Policy[]>` in `PolicyService` AND immediately persist to encrypted electron-store via IPC. The ISC tenant is only touched when the operator triggers Deploy. The store is the source of truth; ISC is the downstream target.

**When to use:** All policy state reads and writes. Never read from ISC to populate the editor.

**Trade-offs:** Requires drift detection on deploy (compare local snapshot to live ISC state), but eliminates accidental tenant mutations.

**Example:**
```typescript
// src/app/policy-engine/services/policy.service.ts
async savePolicy(policy: Policy): Promise<void> {
  // 1. Persist to encrypted local store via IPC
  await this.api.writePolicy(policy);
  // 2. Update in-memory state (triggers UI refresh)
  const current = this.policies$.getValue();
  const updated = current.map(p => p.id === policy.id ? policy : p);
  this.policies$.next(updated);
  // 3. Git commit (fire-and-forget via IPC; batched push handled by scheduler)
  this.api.gitCommit({ message: `Save policy: ${policy.name}` });
}
```

---

### Pattern 4: PAT Token Cache in Main Process (Never Renderer)

**What:** The PAT `client_id` + `client_secret` are stored encrypted via `safeStorage` (OS keychain wrapper) in the main process. The access token is held in-memory in the main process only. The renderer never sees credentials — it only calls `pe:test-connection` and `pe:isc-*` IPC channels.

**When to use:** All credential handling. This is a hard security boundary.

**Trade-offs:** Slightly more IPC hops, but credentials cannot leak through renderer memory dumps, DevTools, or Angular serialization.

This follows the pattern already established in `app/authentication/config.ts` which uses `safeStorage` from Electron for credential encryption.

---

### Pattern 5: Monaco Editor JSON Schema Validation (Renderer)

**What:** Monaco is loaded via `ngx-monaco-editor-v2` in Angular. JSON schema for the policy definition is registered via `monaco.languages.json.jsonDefaults.setDiagnosticsOptions()` in the `onMonacoLoad` callback. The schema is embedded in the Angular bundle (not fetched from a URL) to work offline.

**When to use:** The policy-editor component only.

**Trade-offs:** Monaco has a known AMD loader conflict with Electron's `require`. Must save `window.require` before loading Monaco and restore it after — this is handled automatically by `ngx-monaco-editor-v2` when configured with `baseUrl` pointing to `assets/monaco`.

**Example:**
```typescript
// src/app/policy-engine/components/policy-editor/policy-editor.component.ts
monacoOptions = {
  language: 'json',
  automaticLayout: true,
  theme: 'vs-dark',
};

onMonacoLoad(): void {
  const monaco = (window as any).monaco;
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    schemas: [{
      uri: 'policy://schema/policy-definition',
      fileMatch: ['*'],
      schema: POLICY_DEFINITION_SCHEMA,  // embedded constant
    }],
  });
}
```

---

## Data Flow

### Policy Edit Flow (Local)

```
User edits policy in Monaco editor
  ↓
PolicyEditorComponent (debounced onChange)
  ↓
PolicyService.savePolicy(policy)
  ↓ window.electronAPI.policyEngine.writePolicy(policy) [IPC invoke]
  ↓
ipcMain.handle('pe:write-policy')
  ↓
policy-store/store.ts → electron-store.set(policy.id, encryptedPolicy)
  ↓ (fire-and-forget IPC)
git/repo.ts → isomorphic-git.commit({ message, author: serviceAccount })
  ↓
BehaviorSubject<Policy[]> updated → PolicyListComponent re-renders
```

### Deploy Flow

```
Operator clicks Deploy
  ↓
DeployService.startDeploy()
  ↓ window.electronAPI.policyEngine.deployDryRun() [IPC invoke]
  ↓
deploy/diff.ts → fetch live ISC resources → compare to local snapshot
  ↓ returns DeployDiff (create/update/delete/no-change per resource)
  ↓
DiffViewComponent renders → operator confirms
  ↓ window.electronAPI.policyEngine.deployExecute() [IPC invoke]
  ↓
deploy/pipeline.ts → runDeployPipeline(steps, onProgress)
  each step:  isc-client/resources/*.ts → HTTPS → ISC v2025 API
  progress events: ipcMain → webContents.send('pe:deploy-progress', event)
                 → ProgressModalComponent via ipcRenderer.on listener
  on failure: compensate() in reverse order
  ↓
audit/log.ts → append deploy record (who, what, diff, outcome, timestamp)
  ↓
git/repo.ts → commit deploy record
```

### Git Push Flow (Background)

```
git/scheduler.ts (interval timer, default 5 min)
  ↓ check: any unpushed commits? (isomorphic-git.log vs remote)
  ↓ if yes: isomorphic-git.push({ remote, auth: { username, password: token } })
  ↓ update last-push timestamp in audit store
```

### State Management

```
electron-store (main process) — source of truth for policies + audit
    ↑ write on every save
    ↓ read on app start / IPC request
BehaviorSubject<Policy[]> (Angular service) — in-memory reactive state
    ↓ subscribe
PolicyListComponent, PolicyEditorComponent
    ↑ mutate via PolicyService methods only (never direct store access)
```

---

## Scaling Considerations

This is a single-operator desktop tool. Scaling is not a concern in the traditional sense. The table below covers operational scale only.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 policies | Current architecture — no changes needed |
| 50-100 policies | electron-store handles fine; consider pagination in PolicyListComponent |
| ISC rate limits (429) | Already required: exponential backoff with 3 retries in isc-client/client.ts |
| Large git history | isomorphic-git is fine for thousands of commits; shallow clone on remote init |

---

## Anti-Patterns

### Anti-Pattern 1: Calling ISC HTTP APIs from the Renderer Process

**What people do:** Import `axios` or `fetch` in an Angular service and call ISC directly, skipping IPC.

**Why it's wrong:** The renderer process cannot safely hold PAT credentials. Even with context isolation, renderer memory can be inspected via DevTools. HTTP calls from the renderer also bypass the main process retry/rate-limit layer.

**Do this instead:** All HTTP calls go through `isc-client/client.ts` in the main process, invoked via typed IPC channels.

---

### Anti-Pattern 2: Storing PAT Secret in electron-store Without OS Keychain

**What people do:** Pass `encryptionKey: 'hardcoded-string'` to electron-store for the credentials store.

**Why it's wrong:** The key is a plaintext string in the app bundle. Anyone with filesystem access can find it. electron-store documentation explicitly warns this is "not intended for security purposes."

**Do this instead:** Use `safeStorage.encryptString(secret)` before writing to any file store, and `safeStorage.decryptString(buffer)` on read. This delegates encryption to the OS keychain (Keychain on macOS, Secret Service on Linux, Credential Vault on Windows). The existing UDK `app/authentication/config.ts` already uses this pattern.

---

### Anti-Pattern 3: Blocking the Renderer with Synchronous IPC

**What people do:** Use `ipcRenderer.sendSync` for "simplicity."

**Why it's wrong:** Freezes the Angular renderer thread for the entire duration of the main-process call. A slow ISC API call (or a git push) will freeze the UI.

**Do this instead:** `ipcRenderer.invoke` (async/await) for all calls. For long-running operations (deploy, git push), use `ipcMain → webContents.send` to stream progress events back to the renderer.

---

### Anti-Pattern 4: Monolithic IPC Handler File

**What people do:** Register all `ipcMain.handle` calls inline in `main.ts` (as the existing UDK does for its auth handlers).

**Why it's wrong:** Policy Engine adds 20+ IPC channels. Inline in `main.ts` makes the file unmaintainable and impossible to unit-test domain logic in isolation.

**Do this instead:** Follow the modular pattern already established for `setupSailPointSDKHandlers()`, `setupDiscourseHandlers()`, etc. Create `app/policy-engine/ipc-handlers.ts` exporting `setupPolicyEngineHandlers()` and call it from `main.ts`.

---

### Anti-Pattern 5: Letting the Deploy Step Handle Its Own Rollback Inline

**What people do:** Try/catch inside each individual deploy step with ad-hoc cleanup.

**Why it's wrong:** Partial deploy failures (step 3 fails after steps 1 and 2 succeed) require reversing steps 1 and 2 — this can't be done from inside step 3's catch block.

**Do this instead:** Centralized Saga orchestrator in `deploy/pipeline.ts` accumulates a compensation stack and runs it on any failure (Pattern 2 above).

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| ISC v2025 REST API | HTTPS from main process, PAT client_credentials OAuth | Token cached in memory, auto-refresh 60s before expiry, never persisted |
| Remote git (GitHub/GitLab) | isomorphic-git push from main process using service account token | Token stored via safeStorage; only push, never pull (local is authoritative) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Angular renderer ↔ Main process | `ipcRenderer.invoke` / `ipcMain.handle` via contextBridge | One channel per operation; typed via preload partial |
| Main process ↔ Renderer (push) | `webContents.send` → `ipcRenderer.on` | Only for deploy progress events and git push status |
| PolicyService ↔ DeployService | Angular shared service injection | DeployService reads `policies$.getValue()` snapshot at deploy time |
| deploy/pipeline.ts ↔ isc-client/* | Direct function call (same process) | No IPC needed within main process |
| git/scheduler.ts ↔ git/repo.ts | Direct function call (same process) | Scheduler owns interval; repo owns git operations |
| audit/log.ts ↔ deploy/pipeline.ts | Direct function call (same process) | Pipeline calls `audit.append(...)` at each step completion |

---

## Build Order Implications

The dependency structure determines what must exist before what can be built:

1. **IPC bridge scaffolding** (preload API, typed channels, `setupPolicyEngineHandlers()` stub) — must exist first; everything else depends on the bridge working.
2. **electron-store policy persistence** — enables local save/load, unblocks all UI work.
3. **PAT auth + ISC client** — enables `test-connection` and all ISC lookups; unblocks policy definition work that requires ISC data (identity profile, entitlements).
4. **Monaco editor + policy editor UI** — can be built in parallel with ISC client once store works.
5. **Transform + resource generators** — depend on policy model being stable.
6. **Deploy pipeline orchestrator** — depends on all resource generators existing.
7. **Pre-deploy diff + progress UI** — depends on deploy orchestrator.
8. **isomorphic-git commit/push** — depends on policy store (needs something to commit); can be built alongside Monaco work.
9. **Audit log** — can be built in any phase; appended to by deploy and git layers.

---

## Sources

- Electron IPC official docs: https://www.electronjs.org/docs/latest/tutorial/ipc (HIGH confidence)
- Electron contextBridge official docs: https://www.electronjs.org/docs/latest/api/context-bridge (HIGH confidence)
- Electron safeStorage official docs: https://www.electronjs.org/docs/latest/api/safe-storage (HIGH confidence)
- electron-store GitHub (sindresorhus): https://github.com/sindresorhus/electron-store (HIGH confidence — encryption warning directly from README)
- isomorphic-git official site: https://isomorphic-git.org/ (MEDIUM confidence — verified as pure-JS, no native deps, works in Electron)
- ngx-monaco-editor-v2 npm: https://www.npmjs.com/package/ngx-monaco-editor-v2 (MEDIUM confidence)
- UDK codebase direct inspection: `app/main.ts`, `app/preload.ts`, `app/authentication/config.ts`, `app/sailpoint-sdk/ipc-handlers.ts`, `src/app/services/connection.service.ts` (HIGH confidence)
- Saga pattern: https://microservices.io/patterns/data/saga.html (HIGH confidence — canonical reference)

---
*Architecture research for: Angular + Electron desktop identity governance tool (Policy Engine)*
*Researched: 2026-03-25*
