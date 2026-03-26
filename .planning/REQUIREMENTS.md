# Requirements: Policy Engine

**Defined:** 2026-03-25
**Core Value:** Eliminate 1–2 months of manual ISC configuration per tenant by generating all affiliation-based identity governance resources from a single policy definition UI.

## v1 Requirements

### Connection & Configuration

- [x] **CONN-01**: Admin can configure source metadata (name, description, owner, governance group)
- [x] **CONN-02**: Admin can configure ISC connection (tenant API URL, PAT client ID, PAT secret)
- [ ] **CONN-03**: Admin can configure identity profile reference (dropdown populated from ISC)
- [x] **CONN-04**: Admin can configure git settings (committer name/email, remote URL, auth token, push interval)
- [ ] **CONN-05**: Test Connection validates PAT, returns tenant info, and bootstraps default transforms + identity attributes if missing
- [ ] **CONN-06**: Operator identity resolved from ISC via `identity_id` in token response → `GET /v2025/identities/{id}`

### Policy Management

- [ ] **POLY-01**: Admin can create, edit, copy, and delete policies
- [ ] **POLY-02**: Policies display in priority order and are reorderable via drag-and-drop
- [ ] **POLY-03**: "Configure Policies?" master toggle — when OFF, no tenant changes are made
- [ ] **POLY-04**: "Policies in Scope" chip list — only in-scope policies are enforced; others are saved but inactive
- [ ] **POLY-05**: Each policy has: name, owner (searched from ISC by name/alias → UUID resolved), definition, entitlements, OU mapping

### Policy Definition Editor

- [ ] **EDIT-01**: Policy definition JSON editable via Monaco editor with schema validation
- [ ] **EDIT-02**: `accountAttributes` supports AND/OR tree of source attribute conditions (`equals` operation) determining affiliation membership
- [ ] **EDIT-03**: Lifecycle conditions (`active`, `inactive`, `delete`) each reference an existing ISC transform by name that returns `"true"` or `"false"` (`lifecycleType: "complex"` only)
- [ ] **EDIT-04**: `accountSelection: "newest"` default for HR source (newest account by creation date wins)
- [ ] **EDIT-05**: Null `endDate` handled as far-future date (`12/31/2099`) via `firstValid` fallback

### Entitlements & OU Mapping

- [ ] **ENT-01**: Admin can configure birthright entitlements per source (searched from ISC by DN/name → UUID resolved)
- [ ] **ENT-02**: Admin can configure requestable entitlements per source
- [ ] **ENT-03**: Admin can configure approver for requestable role (searched from ISC by name → UUID resolved)
- [ ] **OU-01**: Admin can configure active OU path per target source per policy
- [ ] **OU-02**: Admin can configure inactive OU path per target source per policy

### Transform Generation

- [ ] **TGEN-01**: `get-affiliations` transform generated from all policy `accountAttributes` conditions → returns pipe-delimited string (e.g., `"staff|faculty"`)
- [ ] **TGEN-02**: `get-primary-affiliation` transform generated using `firstValid` pattern → returns highest-priority matching policy name
- [ ] **TGEN-03**: `set-{policyName}-lifecycle-state` transform generated per policy → wraps user-provided `transformRef` values with VTL, returns `active`/`inactive`/`delete`/`prehire`
- [ ] **TGEN-04**: `{sourceName}-ou` transform generated per source per policy from OU mapping → returns active or inactive OU path based on lifecycle state

### Identity Attribute Wiring

- [ ] **IDAP-01**: Identity profile PATCHed to wire transforms via `reference` type to: `affiliations`, `primaryAffiliation`, `cloudLifecycleState`, `{policyName}LifecycleState` (per policy), `{sourceName}-ou` (per source)
- [ ] **IDAP-02**: `identityAttributeConfig.enabled: true` ensured on identity profile update

### Role & Access Profile Generation

- [ ] **ROLE-01**: `{policyName}-br` role created/updated: `requestable: false`, dynamic membership criteria, access profiles per source, owner per policy config
- [ ] **ROLE-02**: `{policyName}-rq` role created/updated: `requestable: true`, approver configured, access profiles per source, owner per policy config
- [ ] **ROLE-03**: Segment created per requestable role with `visibilityCriteria` = `{policyName}LifecycleState EQUALS "active"`
- [ ] **ROLE-04**: Access profiles created per policy × per source (birthright: `requestable: false`; requestable: `requestable: true`)
- [ ] **ROLE-05**: Entitlement UUIDs resolved via `GET /v2025/entitlements?filters=source.id eq "..."` before creating access profiles

### Provisioning Policies

- [ ] **PROV-01**: Source provisioning policy (CREATE profile) updated per target source with `distinguishedName` field using `identityAttribute` transform referencing the `{sourceName}-ou` identity attribute

### Deployment Pipeline

- [ ] **DEPL-01**: Deploy executes resources in dependency order: transforms → identity profile → resolve entitlement IDs → access profiles → roles → segments → segment-to-role assignment → provisioning policies
- [ ] **DEPL-02**: Pre-deploy diff viewer: fetches live ISC state, shows create/update/delete/no-change per resource
- [ ] **DEPL-03**: Drift detection: warns if ISC resources were modified outside the tool since last deploy
- [ ] **DEPL-04**: Rollback: if any deploy step fails, reverses completed steps in reverse dependency order using pre-deploy snapshot (Saga pattern)
- [ ] **DEPL-05**: Deploy progress modal: step-by-step indicators (in-progress, success, failed)
- [ ] **DEPL-06**: "Apply Changes" button triggers ISC identity refresh with confirmation popup showing estimated affected identity count
- [ ] **DEPL-07**: Rate limit handling: HTTP 429 → exponential backoff with max 3 retries

### Audit & Git

- [ ] **AUDIT-01**: Every policy save auto-commits to local git repo with committer = configured service account; message includes operator name from ISC identity resolution
- [ ] **AUDIT-02**: Batched git push every N minutes (configurable, default 5 min) — only pushes if unpushed commits exist
- [ ] **AUDIT-03**: Local audit log captures who deployed, what changed, ISC API responses, before/after diffs, rollback events, timestamps
- [ ] **AUDIT-04**: Audit log viewable in-app, filterable by policy/action/date

## v2 Requirements

### Lifecycle Types

- **LIFE-01**: `lifecycleType: "simple"` support — date-range based lifecycle without transform references
- **LIFE-02**: `lifecycleType: "medium"` support — intermediate lifecycle complexity

### Policy Promotion

- **PROM-01**: Dev → Prod policy promotion (export/import between tenants)

### Entitlement Browser

- **ENT-B-01**: Visual entitlement browser — pick entitlements from ISC UI rather than typing DN/name

### Impact Simulation

- **SIM-01**: Policy impact simulation — "how many identities match this policy?"

## Out of Scope

| Feature | Reason |
|---------|--------|
| `lifecycleType: "simple"` and `"medium"` | Users know their transforms; eliminates date DSL complexity from v1 |
| Entitlement browser (pick from ISC UI) | Adds UI complexity; search-by-name covers the v1 need |
| Dev → Prod policy promotion (export/import) | Multi-tenant orchestration deferred to future milestone |
| Policy impact simulation | Future milestone — no aggregation API dependency in v1 |
| Aggregation schedules, certification campaigns, access request workflows | ISC native UI handles these |
| Multi-operator conflict resolution | Single-operator tool per instance in v1 |
| OAuth browser auth | PAT only for v1; browser OAuth deferred |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONN-01 | Phase 1 | Complete |
| CONN-02 | Phase 1 | Complete |
| CONN-03 | Phase 2 | Pending |
| CONN-04 | Phase 1 | Complete |
| CONN-05 | Phase 2 | Pending |
| CONN-06 | Phase 2 | Pending |
| POLY-01 | Phase 3 | Pending |
| POLY-02 | Phase 3 | Pending |
| POLY-03 | Phase 3 | Pending |
| POLY-04 | Phase 3 | Pending |
| POLY-05 | Phase 3 | Pending |
| EDIT-01 | Phase 3 | Pending |
| EDIT-02 | Phase 3 | Pending |
| EDIT-03 | Phase 3 | Pending |
| EDIT-04 | Phase 3 | Pending |
| EDIT-05 | Phase 3 | Pending |
| ENT-01 | Phase 3 | Pending |
| ENT-02 | Phase 3 | Pending |
| ENT-03 | Phase 3 | Pending |
| OU-01 | Phase 3 | Pending |
| OU-02 | Phase 3 | Pending |
| TGEN-01 | Phase 4 | Pending |
| TGEN-02 | Phase 4 | Pending |
| TGEN-03 | Phase 4 | Pending |
| TGEN-04 | Phase 4 | Pending |
| IDAP-01 | Phase 4 | Pending |
| IDAP-02 | Phase 4 | Pending |
| ROLE-01 | Phase 4 | Pending |
| ROLE-02 | Phase 4 | Pending |
| ROLE-03 | Phase 4 | Pending |
| ROLE-04 | Phase 4 | Pending |
| ROLE-05 | Phase 4 | Pending |
| PROV-01 | Phase 4 | Pending |
| DEPL-01 | Phase 5 | Pending |
| DEPL-02 | Phase 5 | Pending |
| DEPL-03 | Phase 5 | Pending |
| DEPL-04 | Phase 5 | Pending |
| DEPL-05 | Phase 5 | Pending |
| DEPL-06 | Phase 5 | Pending |
| DEPL-07 | Phase 2 | Pending |
| AUDIT-01 | Phase 6 | Pending |
| AUDIT-02 | Phase 6 | Pending |
| AUDIT-03 | Phase 6 | Pending |
| AUDIT-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 44 total
- Mapped to phases: 44
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 — traceability updated to match ROADMAP.md phase assignments; corrected count from 43 to 44 (DEPL-07 was present but not counted)*
