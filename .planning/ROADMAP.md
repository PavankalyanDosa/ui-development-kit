# Roadmap: Policy Engine

## Overview

The Policy Engine is built in six phases that mirror ISC's own resource dependency chain. Phase 1 lays the security baseline and local persistence before any ISC traffic is attempted. Phase 2 validates the ISC connection and bootstraps the tenant. Phase 3 completes the policy authoring experience entirely in local store. Phase 4 computes all generated ISC resources from the policy model. Phase 5 deploys those resources through a saga orchestrator with pre-deploy diff and rollback. Phase 6 hardens audit, git flush, and security properties to ship a production-safe tool.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Electron shell, IPC bridge, encrypted local store, and settings UI scaffold
- [ ] **Phase 2: ISC Connection + Bootstrap** - PAT auth, connection test, tenant bootstrap, identity/entitlement search, rate limiting
- [ ] **Phase 3: Policy Management + Definition Editor** - Full policy authoring: CRUD, drag-and-drop priority, Monaco editor, entitlements, OU mapping, git auto-commit
- [ ] **Phase 4: Transform Generation + Resource Generators** - All ISC resource generation: 4 transform types, identity attribute wiring, roles, access profiles, segments, provisioning policies
- [ ] **Phase 5: Deploy Pipeline + Diff Viewer + Rollback** - Saga orchestrator, pre-deploy diff, drift detection, rollback, progress modal, identity refresh
- [ ] **Phase 6: Audit Log + Git Verification + Security Hardening** - In-app audit viewer, git push flush, credential scrubbing, end-to-end security verification

## Phase Details

### Phase 1: Foundation
**Goal**: The Electron shell runs with a security-correct IPC bridge, all settings persist to encrypted local store, and the policy engine Angular module scaffolds are loadable — establishing the complete foundation before any ISC or feature code is written.
**Depends on**: Nothing (first phase)
**Requirements**: CONN-01, CONN-02, CONN-04
**Success Criteria** (what must be TRUE):
  1. Admin can open the app and navigate to a settings screen where source metadata fields (name, description, owner, governance group) are editable and persisted to local store after save
  2. Admin can enter ISC tenant API URL, PAT client ID, and PAT secret — the secret is stored encrypted via `safeStorage` and is never readable in plaintext from disk or DevTools
  3. Admin can configure git settings (committer name/email, remote URL, auth token, push interval) and values survive app restart
  4. App launches with `nodeIntegration: false`, `contextIsolation: true`, and no raw `ipcRenderer` exposure in the renderer — verified via DevTools console
  5. Policy engine Angular module lazy-loads without errors and all IPC channel names follow the namespaced `pe:` contract
**Plans**: TBD

### Phase 2: ISC Connection + Bootstrap
**Goal**: Admin can test their ISC connection, get tenant confirmation, and have the tool automatically bootstrap any missing default transforms and identity attributes — giving every subsequent phase a verified live ISC environment to work against.
**Depends on**: Phase 1
**Requirements**: CONN-03, CONN-05, CONN-06, DEPL-07
**Success Criteria** (what must be TRUE):
  1. Admin clicks "Test Connection" and sees tenant name/org returned from ISC, or a clear error message if credentials are wrong
  2. After a successful connection test on a fresh tenant, `get-affiliations` and `get-primary-affiliation` transforms plus `affiliations` and `primaryAffiliation` identity attributes are created in ISC if they did not already exist
  3. Identity profile dropdown is populated from live ISC and admin can select one for configuration
  4. Operator display name is resolved from ISC using the `identity_id` in the PAT token response and shown in the UI
  5. An ISC API call that receives HTTP 429 automatically retries with exponential backoff (max 3 retries) and succeeds without user intervention when the rate limit clears
**Plans**: TBD

### Phase 3: Policy Management + Definition Editor
**Goal**: Admin can author a complete policy — including definition JSON, entitlements per source, OU paths, and scope settings — with all changes saved exclusively to local store and automatically committed to a local git repo on save.
**Depends on**: Phase 2
**Requirements**: POLY-01, POLY-02, POLY-03, POLY-04, POLY-05, EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05, ENT-01, ENT-02, ENT-03, OU-01, OU-02
**Success Criteria** (what must be TRUE):
  1. Admin can create, edit, copy, and delete policies; policies list displays in priority order and can be reordered by dragging rows up or down
  2. The "Configure Policies?" master toggle can be turned off, and the "Policies in Scope" chip list lets admin include or exclude individual policies — excluded policies are saved but not enforced
  3. Each policy's definition JSON opens in a Monaco editor with ISC schema validation: syntax errors and schema violations appear as inline red squiggles before the admin saves
  4. Admin can search for entitlements by DN or name (typeahead from ISC), assign birthright and requestable entitlements per source per policy, and set an approver for the requestable role
  5. Admin can set active and inactive OU paths per target source per policy, and all policy data persists to local store instantly on save without touching ISC
  6. Every policy save triggers a git commit to the local repo with the service account as committer and the operator's display name in the commit message body
**Plans**: TBD

### Phase 4: Transform Generation + Resource Generators
**Goal**: Given a complete, saved policy set, the tool can compute all ISC resource payloads — 4 transform types, identity profile attribute wiring, access profiles, roles, segments, and provisioning policies — as in-memory objects ready for the deploy pipeline to push.
**Depends on**: Phase 3
**Requirements**: TGEN-01, TGEN-02, TGEN-03, TGEN-04, IDAP-01, IDAP-02, ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05, PROV-01
**Success Criteria** (what must be TRUE):
  1. Generator produces a `get-affiliations` transform that encodes all policy `accountAttributes` conditions and returns a pipe-delimited affiliation string (e.g., `"staff|faculty"`) — verified by inspecting the generated JSON payload
  2. Generator produces a `get-primary-affiliation` transform using the `firstValid` pattern that returns the highest-priority matching policy name — verified by inspecting generated JSON
  3. Generator produces per-policy `set-{policyName}-lifecycle-state` transforms and per-source `{sourceName}-ou` transforms — all with correct VTL wrapping and OU path references
  4. Generator produces identity profile PATCH payload that wires all four identity attribute types (`affiliations`, `primaryAffiliation`, `cloudLifecycleState`, `{policyName}LifecycleState` per policy, `{sourceName}-ou` per source) via `reference` type with `identityAttributeConfig.enabled: true`
  5. Generator produces birthright and requestable roles, access profiles per policy per source, segments with `visibilityCriteria`, and provisioning policy CREATE profiles — all with correct `requestable` flags and owner UUIDs
**Plans**: TBD

### Phase 5: Deploy Pipeline + Diff Viewer + Rollback
**Goal**: Admin can review an exact diff of what will change in ISC, execute a dependency-ordered deploy with per-step progress feedback, and have the tool automatically roll back all completed steps if any step fails — with identity refresh as the final optional action.
**Depends on**: Phase 4
**Requirements**: DEPL-01, DEPL-02, DEPL-03, DEPL-04, DEPL-05, DEPL-06
**Success Criteria** (what must be TRUE):
  1. Before deploying, admin sees a diff viewer modal that lists every ISC resource as create/update/delete/no-change, and is warned if any resource was modified outside the tool since the last deploy
  2. Deploy executes steps in the correct dependency order (transforms → identity profile → entitlement UUID resolution → access profiles → roles → segments → segment-role assignment → provisioning policies) and each step shows in-progress/success/failed status in a progress modal
  3. If any deploy step fails, all previously completed steps are reversed in reverse dependency order using the pre-deploy snapshot — the tool reports which step failed and confirms rollback completion
  4. Admin can click "Apply Changes" to trigger ISC identity refresh; a confirmation popup shows the estimated number of affected identities before proceeding
  5. An ISC identity profile PATCH that returns 409 Conflict (tasks in progress) is automatically retried with backoff and succeeds once tasks clear, without requiring user action
**Plans**: TBD

### Phase 6: Audit Log + Git Verification + Security Hardening
**Goal**: Admin can view, filter, and audit every deploy operation in-app; git push is never silently lost on app close; and the tool passes a full Electron security checklist with no credentials leaking to git, logs, or exports.
**Depends on**: Phase 5
**Requirements**: AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04
**Success Criteria** (what must be TRUE):
  1. Admin can open an in-app audit log, filter entries by policy, action type, and date range, and see who deployed what, what changed (before/after diff), and whether a rollback occurred
  2. Every deploy operation is captured in the local audit log with operator name, timestamp, ISC API responses, and before/after diffs — entries survive app restart
  3. When the app closes with unpushed git commits, the batched git push is flushed synchronously before quit — no commits are silently lost
  4. PAT secret and git auth token are never present in git commits, audit log entries, or any exported data — verified by inspecting a sample commit and audit entry
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 1/3 | In Progress|  |
| 2. ISC Connection + Bootstrap | 0/TBD | Not started | - |
| 3. Policy Management + Definition Editor | 0/TBD | Not started | - |
| 4. Transform Generation + Resource Generators | 0/TBD | Not started | - |
| 5. Deploy Pipeline + Diff Viewer + Rollback | 0/TBD | Not started | - |
| 6. Audit Log + Git Verification + Security Hardening | 0/TBD | Not started | - |
