# Policy Engine

## What This Is

A desktop tool (Angular + Electron) built on the SailPoint UI Development Kit (UDK) that provides a centralized interface for managing affiliation-based identity policies. Admins define policies (Staff, Faculty, Student, etc.) in priority order — the tool auto-generates and deploys all downstream ISC configurations: transforms, roles, access profiles, provisioning policies, and identity profile attribute mappings.

The tool is local-first: all edits persist to local store instantly. Changes only reach the ISC tenant when the operator explicitly clicks Deploy.

## Core Value

Eliminate 1–2 months of manual ISC configuration per tenant by generating all affiliation-based identity governance resources from a single policy definition UI.

## Requirements

### Validated

(None yet — ship to validate)

### Active

#### Base Configuration & Connection
- [ ] Admin can configure source metadata (name, description, owner, governance group)
- [ ] Admin can configure ISC connection (tenant API URL, PAT client ID, PAT secret)
- [ ] Admin can configure identity profile reference (dropdown populated from ISC)
- [ ] Admin can configure git settings (service account committer name/email, remote URL, auth token, push interval)
- [ ] Test Connection validates PAT, returns tenant info, and bootstraps default transforms + identity attributes if they don't exist
- [ ] Operator identity resolved from ISC via `identity_id` in token response → `GET /v2025/identities/{id}`

#### Policy Management
- [ ] Admin can create, edit, copy, delete policies
- [ ] Policies display in priority order (reorderable via drag-and-drop)
- [ ] "Configure Policies?" master toggle — when OFF, no tenant changes are made
- [ ] "Policies in Scope" chip list — only in-scope policies are enforced; others are saved but inactive
- [ ] Each policy has: name, owner (searched from ISC by name/alias → UUID resolved), definition, entitlements, OU mapping

#### Policy Definition (per policy)
- [ ] Policy definition JSON editable via Monaco editor with schema validation
- [ ] `accountAttributes`: AND/OR tree of source attribute conditions (`equals` operation) — determines affiliation membership
- [ ] Lifecycle conditions (`active`, `inactive`, `delete`): `lifecycleType: "complex"` only in v1 — each state references an existing ISC transform by name that returns `"true"` or `"false"`
- [ ] `accountSelection: "newest"` default for HR source (newest account by creation date wins when multiple accounts exist)
- [ ] Null `endDate` handled as far-future date (`12/31/2099`) via `firstValid` fallback

#### Entitlements (per policy)
- [ ] Admin can configure birthright entitlements per source (entitlements searched from ISC by DN/name → UUID resolved)
- [ ] Admin can configure requestable entitlements per source
- [ ] Admin can configure approver for requestable role (searched from ISC by name → UUID resolved)

#### OU Mapping (per policy)
- [ ] Admin can configure active OU path per target source
- [ ] Admin can configure inactive OU path per target source

#### Transform Generation
- [ ] `get-affiliations` transform generated from all policy `accountAttributes` conditions → returns pipe-delimited string (e.g., `"staff|faculty"`)
- [ ] `get-primary-affiliation` transform generated using `firstValid` pattern → returns highest-priority matching policy name
- [ ] `set-{policyName}-lifecycle-state` transform generated per policy → wraps user-provided `transformRef` values with VTL, returns `active`/`inactive`/`delete`/`prehire`
- [ ] `{sourceName}-ou` transform generated per source per policy from OU mapping → returns active or inactive OU path based on lifecycle state

#### Identity Attribute Wiring
- [ ] Identity profile PATCH to wire transforms via `reference` type to: `affiliations`, `primaryAffiliation`, `cloudLifecycleState`, `{policyName}LifecycleState` (per policy), `{sourceName}-ou` (per source)
- [ ] `identityAttributeConfig.enabled: true` ensured on update

#### Role & Access Profile Generation
- [ ] `{policyName}-br` role created/updated: `requestable: false`, dynamic membership criteria (`affiliations CONTAINS "{policy}" AND {policyName}LifecycleState EQUALS "active"`), access profiles per source, owner per policy config
- [ ] `{policyName}-rq` role created/updated: `requestable: true`, approver configured, access profiles per source, owner per policy config
- [ ] Segment created per requestable role: `visibilityCriteria` = `{policyName}LifecycleState EQUALS "active"`
- [ ] Access profiles created per policy × per source (birthright APs: `requestable: false`; requestable APs: `requestable: true`)
- [ ] Entitlement UUIDs resolved via `GET /v2025/entitlements?filters=source.id eq "..."` before creating access profiles

#### Provisioning Policies
- [ ] Source provisioning policy (CREATE profile) updated per target source with `distinguishedName` field using `identityAttribute` transform referencing the `{sourceName}-ou` identity attribute

#### Deployment Pipeline
- [ ] Deploy executes resources in dependency order: transforms → identity profile → resolve entitlement IDs → access profiles → roles → segments → segment-to-role assignment → provisioning policies
- [ ] Pre-deploy diff viewer: fetches live ISC state, shows create/update/delete/no-change per resource
- [ ] Drift detection: warns if ISC resources were modified outside the tool since last deploy
- [ ] Rollback: if any deploy step fails, reverses completed steps in reverse dependency order using pre-deploy snapshot
- [ ] Deploy progress modal: step-by-step indicators (in-progress, success, failed)
- [ ] "Apply Changes" button: triggers ISC identity refresh with confirmation popup (shows estimated affected identity count)
- [ ] Rate limit handling: HTTP 429 → exponential backoff with max 3 retries

#### Audit & Git
- [ ] Every policy save auto-commits to local git repo with: committer = configured service account, message includes operator name (from ISC identity resolution)
- [ ] Batched git push every N minutes (configurable, default 5 min) — only pushes if unpushed commits exist
- [ ] Local audit log (Electron store): captures who deployed, what changed, ISC API responses, before/after diffs, rollback events, timestamps
- [ ] Audit log viewable in-app, filterable by policy/action/date

### Out of Scope

- `lifecycleType: "simple"` and `"medium"` — deferred to future milestone
- Entitlement browser (pick entitlements from ISC UI) — future milestone
- Dev → Prod policy promotion (export/import) — future milestone
- Policy impact simulation ("how many identities match?") — future milestone
- Aggregation schedules, certification campaigns, access request workflows — ISC native UI
- Multi-operator conflict resolution — single-operator tool per instance

## Context

- **Platform**: Angular 17+ + Electron 28+ via SailPoint UDK framework
- **Auth**: PAT (client_id + client_secret) → OAuth2 `client_credentials` flow → JWT bearer token, cached in memory, auto-refreshed 60s before expiry, never persisted to disk
- **ISC API**: v2025 only (`https://{tenant}.api.identitynow.com/v2025/`)
- **OAuth endpoint**: `https://{tenant}.api.identitynow.com/oauth/token` (not under `/v2025/`)
- **Local persistence**: electron-store with AES-256 encryption for PAT secret
- **Monaco editor**: JSON policy definition editing with schema validation

## Constraints

- **Tech stack**: Angular + Electron + UDK — no deviations; this is the first custom component in this repo
- **Auth method**: PAT only for v1; OAuth browser auth considered for future
- **ISC API**: Transform `name` and `type` are immutable after creation — must delete + recreate to rename (blocked if referenced by identity profile: remove mapping first)
- **ISC API**: Identity profile `identityAttributeConfig` only supports `accountAttribute`, `reference`, `rule` transform types — all complex transforms must be standalone named transforms referenced via `reference` type
- **ISC API**: Entitlements in access profiles referenced by UUID only — entitlement DN resolution step required before every deploy
- **ISC API**: Segment `visibilityCriteria` supports only `AND` + `EQUALS`, max 1 level deep
- **ISC API**: Roles list endpoint caps at 50 results per page — pagination loop required
- **ISC API**: Access profile `requestable: false` requires "Request Center" feature on tenant — graceful error handling required
- **ISC API**: Provisioning policy OU field must use `identityAttribute` transform type (not `accountAttribute`)
- **Security**: PAT credentials never leave local machine, never included in exports or git commits

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| `lifecycleType: "complex"` only for v1 | Users know their transforms; eliminates date DSL complexity from v1 scope | — Pending |
| Local-first with explicit Deploy | Prevents accidental tenant changes; allows review before pushing | — Pending |
| Pipe-delimited `affiliations` attribute | Simpler than multi-valued ISC attribute; role `CONTAINS` check works correctly | — Pending |
| All 4 identity attributes: `affiliations`, `primaryAffiliation`, `cloudLifecycleState`, `{policy}LifecycleState` | Covers all downstream use cases (roles, lifecycle rules, OU mapping) | — Pending |
| Per-policy owner configurable, resolved by ISC identity search | Avoids hardcoding; supports team ownership model | — Pending |
| Git committer = service account; operator in commit message | Audit trail without exposing personal credentials as git author | — Pending |
| Batched git push (5 min default, skip if nothing new) | Reduces network overhead while maintaining reasonably current remote backup | — Pending |
| Newest account wins for multi-account HR source | Most recent HR record is authoritative for lifecycle calculations | — Pending |
| Null endDate → 12/31/2099 fallback | Permanent employees stay active indefinitely without crashing dateCompare | — Pending |

---
*Last updated: 2026-03-25 after initialization*
