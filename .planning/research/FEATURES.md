# Feature Research

**Domain:** Identity Governance Administration (IGA) desktop configuration tool — Angular + Electron, local-first, explicit deploy to SailPoint ISC tenant
**Researched:** 2026-03-25
**Confidence:** MEDIUM — ISC-specific feature behavior verified against official SailPoint documentation; IGA admin tool UX patterns drawn from comparable tools (Spacelift, Atlantis, ISC Community Toolbox, CoreView); desktop app patterns from Electron ecosystem. No direct competitor for this exact niche (affiliation-based ISC policy generation tool) exists publicly.

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are the baseline features that make the tool trustworthy to an identity admin. Missing any of these and the admin will not adopt the tool — they'll keep doing it manually.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| ISC connection configuration (tenant URL, PAT client ID + secret) | Every ISC integration tool requires PAT auth; admins cannot work without knowing it's connected | LOW | Credentials must stay local, never leave the machine. AES-256 at rest via electron-store. |
| Connection test with live validation | Admins expect immediate confirmation that credentials work before committing to setup | LOW | Must return tenant info on success (name, org ID). Bootstrap default transforms/attributes if missing. |
| Policy CRUD (create, edit, copy, delete) | Config management tools always expose the core entity lifecycle | LOW | Copy enables rapid policy variations without starting from scratch. |
| Priority ordering with drag-and-drop reorder | Affiliation policies are evaluated in priority order; visual reordering is the standard pattern for ordered lists | MEDIUM | Order determines which affiliation wins for multi-affiliation identities. |
| JSON policy definition editor with schema validation | Power users editing structured config expect validation feedback inline, not at deploy time | MEDIUM | Monaco editor with ISC-specific JSON schema. Errors surface before deploy, not after. |
| Pre-deploy diff viewer (create / update / delete / no-change per resource) | Terraform plan, Atlantis plan-in-PR, and Spacelift diff views have made this the expectation for any IaC-adjacent tool | HIGH | Fetches live ISC state, compares against local desired state, categorizes each resource. This is the primary trust-building feature. |
| Explicit Deploy button (local-first, opt-in publish) | Admins cannot afford accidental tenant changes. Tools like this MUST separate editing from publishing. | MEDIUM | Deploy is always an intentional action with a confirmation step. |
| Deploy progress modal with per-step indicators (in-progress / success / failed) | Long multi-step operations without feedback are unusable. Users abandon tools that appear frozen. | MEDIUM | Steps: transforms → identity profile → entitlement resolution → access profiles → roles → segments → provisioning policies. |
| Rate limit handling with retry | ISC API returns HTTP 429 under load; tools that don't handle this silently fail in production tenants | LOW | Exponential backoff, max 3 retries, visible retry indicator in deploy modal. |
| Local audit log (who deployed, what changed, before/after diffs, timestamps) | Compliance-conscious admins require a trail. ISC itself logs events for 1 year but does not capture pre-deploy local state. | MEDIUM | Stored in electron-store. Viewable in-app, filterable by policy/action/date. |
| Git-backed commit history with operator attribution | Git is the de facto audit mechanism for any configuration-as-code workflow. Admins expect to see who changed what and when. | MEDIUM | Every save auto-commits. Committer = service account. Operator name in commit message body. |
| Rollback on partial deploy failure | Partial deploys leave ISC in a broken intermediate state. Rollback is the difference between "safe to use" and "terrifying to use." | HIGH | Pre-deploy snapshot captures live state. Reverse-order rollback on any step failure. |
| Identity search (typeahead by name/alias → UUID resolution) | ISC objects reference each other by UUID, not name. Admins think in names. Every ISC admin tool must bridge this gap. | MEDIUM | Used for policy owner, entitlement approver. Must search ISC `/v2025/search` endpoint in real-time. |
| Entitlement search (by DN/name, scoped to source → UUID resolution) | Same UUID problem as identity search, but for entitlements. Admins know entitlement names, not UUIDs. | MEDIUM | Scoped to a specific source. Used when configuring birthright and requestable entitlements per policy. |
| Identity profile dropdown (populated from ISC, not free-text) | Admins must select a valid existing identity profile to wire transforms into. Free-text entry guarantees typo errors. | LOW | Populated from `GET /v2025/identity-profiles`. |
| "Configure Policies" master toggle | Operational safety mechanism. Admins need a single switch that disables all tenant changes without deleting their configuration. | LOW | When OFF, deploys are blocked at the gate before any API calls are made. |
| "Policies in Scope" selection | Not all defined policies may be live. Admins need to activate a subset without deleting inactive ones. | LOW | Chip list. Out-of-scope policies are preserved locally but excluded from transform generation and deploy. |
| Drift detection warning | ISC resources modified outside the tool since last deploy will silently break the tool's model of the world. Admins need to know. | HIGH | Compares live ISC state to last-deploy snapshot. Warns before allowing a new deploy. Spacelift and CoreView both implement this. |

---

### Differentiators (Competitive Advantage)

These features make the Policy Engine meaningfully better than manual ISC configuration. They are not present in any existing ISC community tool (the ISC Community Toolbox is read-only plus a raw API courier; Configuration Hub handles backup/restore but not policy-driven generation).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Auto-generation of all downstream ISC objects from a single policy definition | This is the core value: 1–2 months of manual work reduced to minutes. No other community tool generates transforms, roles, access profiles, segments, and provisioning policies from a single policy form. | HIGH | Requires dependency-ordered generation: transforms first (since identity profile references them), then identity profile, then APs, roles, segments, provisioning policies. |
| Dependency-ordered deploy pipeline with automatic rollback | Most admin tools are fire-and-hope. Ordered deploy with rollback makes this production-safe. Terraform and Spacelift provide this for infrastructure; this tool provides it for ISC identity objects. | HIGH | The deploy sequence must respect ISC's own constraints (transforms must exist before identity profile can reference them). |
| Bootstrap on first connection (default transforms + identity attributes) | Reduces setup friction to near zero. Admins don't need to pre-create boilerplate transforms before using the tool. | MEDIUM | Creates `affiliations` and `primaryAffiliation` identity attributes if absent. Creates `get-affiliations` and `get-primary-affiliation` transforms if absent. |
| "Apply Changes" with affected identity count preview | Admins want to know the blast radius before triggering an ISC identity refresh. No existing ISC UI shows this before triggering refresh. | MEDIUM | Queries ISC for count of identities affected by updated policies before confirmation. |
| Git push with configurable service account committer | Separates tool identity from personal credentials in the git audit trail. Enables a clean organizational audit pattern where the repo shows policy changes attributed to a named service, not individuals' personal git configs. | LOW | Configurable push interval (default 5 min), batched, skips if nothing new to push. |
| Per-policy owner resolution (search ISC by name → UUID) | Ownership of ISC roles and access profiles is team-scoped, not global. Per-policy configurable ownership is more flexible than any native ISC bulk configuration approach. | LOW | Owner is searched from ISC at config time. UUID stored in policy. |
| Pilot/scope ring-fence via "Policies in Scope" | Admins can add new policies to the tool without them going live until explicitly scoped in. Safe incremental rollout without separate dev/prod tenants. | LOW | In-scope vs saved-but-inactive is a first-class concept. |
| Monaco-based policy definition with ISC transform schema | VS Code-grade editing experience for a JSON structure that ISC admins previously edited in a plain text field or raw API body. Autocomplete + validation catches errors before deploy. | MEDIUM | Requires authoring a JSON schema for the policy definition format; worth the investment as it prevents the most common admin error (typos in attribute names). |

---

### Anti-Features (Commonly Requested, Often Problematic)

These are features that will be requested but should be explicitly deferred or declined in v1. Building them now adds scope without validating the core value.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Simple / Medium lifecycle type support | Admins want to define lifecycle purely by date conditions (start date, end date) without writing transforms | Requires a date DSL or transform builder UI that is a project of its own. Blows v1 scope. Users who need this can write their own transforms and reference them with the existing `complex` type. | Defer to v1.x milestone. `lifecycleType: "complex"` with user-provided transform references covers all production cases. |
| Entitlement browser (visual picker from ISC UI) | Admins don't want to look up entitlement DNs separately | Building a full entitlement browser (paginated, searchable, filterable by source) is a medium-size feature with its own UX. The existing entitlement search-by-name handles 95% of use cases. | Defer to v1.x. Existing DN/name search + UUID resolution is sufficient for v1. |
| Dev-to-Prod policy promotion (export/import between tenants) | Admins have dev and prod tenants and want to promote configs | Requires multi-tenant credential management, conflict resolution UI, and promotion workflow. Fundamentally different scope from single-tenant configuration. | Defer to v2. The git remote already provides a mechanism for manual policy migration between instances of the tool. |
| Policy impact simulation ("how many identities match this policy?") | Admins want to know before deploying whether a new policy will capture the right population | Requires running the policy's `accountAttributes` conditions against ISC identity data, which is a search query builder over live data — a meaningful feature in its own right. The "Apply Changes" identity count preview is the v1 approximation. | Defer to v2. "Apply Changes" preview covers the blast-radius concern. Full simulation is a separate feature. |
| Multi-operator conflict resolution | Teams want multiple people to edit policies concurrently | Electron store is single-process; concurrent writes from multiple instances would corrupt state. Conflict-free concurrency requires a backend service or CRDT approach that fundamentally changes the architecture. | Single-operator-per-instance design. Teams coordinate via git branch workflows at the repository level. |
| Aggregation schedules and certification campaigns | Admins want a single pane of glass for all ISC admin work | Out of scope for a focused policy configuration tool. Adding these is scope explosion and positions the tool against the ISC native UI rather than complementing it. | Use ISC native admin UI for these. The Policy Engine is deliberately narrow. |
| OAuth browser auth (instead of PAT) | Admins prefer SSO login | PAT is sufficient for v1 and simpler to implement correctly. Browser OAuth flow in Electron has subtle security considerations (redirect URI handling, token storage). | PAT in v1. Browser OAuth deferred to future milestone once core tool is validated. |
| Real-time sync / automatic background deploy | Admins want changes to be reflected in ISC immediately on save | Destroys the safety model. The entire value of local-first + explicit deploy is the review-before-push pattern. Auto-sync removes the diff review step and eliminates rollback viability. | Never. The explicit deploy model is a core design principle, not a limitation. |
| Full ISC admin portal (sources, connectors, certification, etc.) | Admins want to replace the ISC UI | The ISC Community Toolbox tried read-only plus a raw API tab; building a full portal is years of work. The Policy Engine's value is depth in one workflow, not breadth across all ISC administration. | Never for v1. Scope the tool to the affiliation policy workflow exclusively. |

---

## Feature Dependencies

```
ISC Connection Configuration
    └──enables──> Connection Test
                      └──enables──> Bootstrap (default transforms + attributes)
                                        └──enables──> Identity Profile Dropdown Population
                                                          └──enables──> Deploy Pipeline

Policy CRUD
    └──requires──> ISC Connection Configuration (for identity search, entitlement search)
    └──enables──> Policy Definition Editor (Monaco)
    └──enables──> Priority Ordering (drag-and-drop)
    └──enables──> Policies in Scope selection
    └──enables──> Entitlements Configuration (per policy)
    └──enables──> OU Mapping (per policy)

Policy Definition Editor
    └──feeds──> Transform Generation (get-affiliations, get-primary-affiliation, set-lifecycle-state, OU transform)

Transform Generation
    └──depends on──> All Policies + Priority Order + OU Mapping
    └──feeds──> Identity Profile Wiring (transform references)

Identity Profile Wiring
    └──depends on──> Transform Generation (transforms must exist before profile can reference them)
    └──feeds──> Role/AP Generation (lifecycle state attributes used in membership criteria)

Role + Access Profile Generation
    └──depends on──> Identity Profile Wiring + Entitlement UUID Resolution
    └──feeds──> Segment Generation

Segment Generation
    └──depends on──> Role Generation (segment references role)

Provisioning Policy Update
    └──depends on──> Identity Profile Wiring (identityAttribute transform must exist)

Pre-deploy Diff Viewer
    └──depends on──> Local Policy State + ISC Connection
    └──requires──> Transform Generation (to know desired state before comparing)

Deploy Pipeline (ordered)
    └──requires──> Pre-deploy Diff Viewer (diff runs first, deploy is a confirmed next step)
    └──depends on──> Transform Generation → Identity Profile Wiring → Entitlement Resolution → AP Generation → Role Generation → Segment Generation → Provisioning Policy

Rollback
    └──depends on──> Deploy Pipeline (pre-deploy snapshot taken before each deploy)
    └──enhances──> Deploy Pipeline (automatically triggered on step failure)

Drift Detection
    └──depends on──> ISC Connection + Last Deploy Snapshot
    └──enhances──> Pre-deploy Diff Viewer (surfaces out-of-band changes)

Audit Log
    └──enhances──> Deploy Pipeline (captures who, what, when, before/after)

Git Auto-commit
    └──depends on──> Git Settings Configuration
    └──enhances──> Policy CRUD (every save triggers commit)
    └──enhances──> Audit Log (commits are the persistent record)

"Apply Changes" (Identity Refresh)
    └──depends on──> Deploy Pipeline (only offered post-deploy)
    └──enhances──> Deploy Pipeline (surfaces blast radius before confirming)
```

### Dependency Notes

- **Transform Generation requires all policies + priority order:** The `get-affiliations` transform encodes all policy `accountAttributes` conditions; you cannot generate it from a subset of policies.
- **Identity Profile Wiring requires transforms to exist in ISC:** ISC validates `reference` type identity attributes against live transforms at the time of PATCH. Deploy order is not negotiable.
- **Entitlement UUID Resolution must run before Access Profile creation:** ISC accepts entitlements in APs by UUID only; DNs must be resolved against live ISC every deploy (UUIDs can change between deploys).
- **Rollback conflicts with Auto-sync anti-feature:** The rollback mechanism depends on a defined pre-deploy snapshot. Auto-sync eliminates this snapshot concept, making rollback impossible. These are fundamentally incompatible.
- **Deploy Pipeline requires a working ISC connection AND a valid identity profile selection:** Without a profile to wire transforms into, the pipeline has no anchor point in ISC.

---

## MVP Definition

### Launch With (v1)

The minimum product that eliminates the 1–2 month manual configuration workflow and validates the core value.

- [x] ISC connection configuration + connection test + bootstrap — without a working connection, nothing else matters
- [x] Policy CRUD with priority ordering (drag-and-drop) — the core data entry workflow
- [x] Policy definition editor (Monaco + JSON schema) — power-user editing with inline validation
- [x] Entitlements configuration per policy (birthright + requestable) with ISC search-by-name
- [x] OU mapping per policy per target source
- [x] "Configure Policies" master toggle + "Policies in Scope" selection
- [x] Transform generation (all 4 transform types) — `get-affiliations`, `get-primary-affiliation`, `set-lifecycle-state`, `{source}-ou`
- [x] Identity profile attribute wiring (PATCH identity profile with transform references)
- [x] Access profile + role + segment generation per policy
- [x] Provisioning policy update per source per policy
- [x] Pre-deploy diff viewer (create/update/delete/no-change per resource)
- [x] Drift detection warning pre-deploy
- [x] Deploy pipeline with dependency-ordered execution
- [x] Deploy progress modal (per-step in-progress/success/failed indicators)
- [x] Rate limit handling (429 + exponential backoff)
- [x] Rollback on partial failure
- [x] "Apply Changes" (identity refresh) with affected identity count preview
- [x] Local audit log (in-app, filterable)
- [x] Git auto-commit on policy save with operator attribution
- [x] Batched git push (configurable interval, skip if nothing new)
- [x] Git settings configuration (service account, remote URL, auth token, push interval)

### Add After Validation (v1.x)

Add once the core affiliation policy workflow is validated in production tenants.

- [ ] Simple/Medium lifecycle type support — add once `complex` is proven and admin demand confirmed
- [ ] Entitlement browser (visual picker from ISC) — add when admins report friction with DN/name search
- [ ] Inline transform editor (for lifecycle transforms referenced by policy definition) — add when admins express friction editing transforms separately in ISC
- [ ] Multi-policy import via JSON bulk upload — add when admins with 10+ policies report data entry friction

### Future Consideration (v2+)

Defer until product-market fit is established.

- [ ] Dev-to-Prod policy promotion (export/import between tenants) — requires multi-tenant architecture rethink
- [ ] Policy impact simulation (population matching) — requires ISC identity search query builder
- [ ] OAuth browser auth — replace PAT with browser-based OAuth flow for organizations that disable PAT
- [ ] Policy versioning / named snapshots — allows restoring to a known-good policy set without git expertise

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| ISC connection + test + bootstrap | HIGH | LOW | P1 |
| Policy CRUD + priority ordering | HIGH | LOW | P1 |
| Monaco editor + schema validation | HIGH | MEDIUM | P1 |
| Transform generation (all 4 types) | HIGH | HIGH | P1 |
| Identity profile attribute wiring | HIGH | MEDIUM | P1 |
| Role + AP + segment generation | HIGH | HIGH | P1 |
| Provisioning policy update | HIGH | LOW | P1 |
| Pre-deploy diff viewer | HIGH | HIGH | P1 |
| Drift detection warning | HIGH | MEDIUM | P1 |
| Deploy pipeline (ordered, with progress modal) | HIGH | HIGH | P1 |
| Rollback on failure | HIGH | HIGH | P1 |
| Rate limit handling | HIGH | LOW | P1 |
| Audit log (local, in-app) | HIGH | MEDIUM | P1 |
| Git auto-commit + batched push | HIGH | MEDIUM | P1 |
| "Apply Changes" with identity count | MEDIUM | MEDIUM | P1 |
| Identity + entitlement search (typeahead) | HIGH | MEDIUM | P1 |
| Simple/Medium lifecycle types | MEDIUM | HIGH | P2 |
| Entitlement browser (visual picker) | MEDIUM | MEDIUM | P2 |
| Inline transform editor | MEDIUM | HIGH | P2 |
| Dev-to-Prod promotion | LOW | HIGH | P3 |
| Policy impact simulation | MEDIUM | HIGH | P3 |
| OAuth browser auth | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v1 launch
- P2: Should have, add in v1.x after validation
- P3: Nice to have, v2+ consideration

---

## Competitor Feature Analysis

| Feature | ISC Community Toolbox | ISC Configuration Hub | SailPoint Native UI | Policy Engine (this tool) |
|---------|----------------------|----------------------|--------------------|-----------------------------|
| Policy-driven generation of transforms | No (read-only + API courier) | No (backup/restore only) | No (manual per-resource) | Yes — core value |
| Role + AP + segment auto-generation | No | No | No (manual) | Yes |
| Pre-deploy diff viewer | No | No | No | Yes |
| Drift detection | No | No | No | Yes |
| Ordered deploy with rollback | No | No | No | Yes |
| Local-first with explicit publish | No (reads from live tenant) | No (live tenant ops) | No (changes are live immediately) | Yes |
| Git-backed audit trail | No | No | No | Yes |
| Priority-ordered policy management | No | No | No | Yes |
| JSON schema-validated policy editor | No | No | No | Yes |
| Connection test + bootstrap | No | No | N/A (native) | Yes |
| Identity search (typeahead) | No (shows raw JSON) | No | Limited in UI | Yes |
| Entitlement search by name/DN | No | No | Limited in UI | Yes |
| Deploy progress modal | No | Partial (spinner) | No | Yes |
| Rate limit / 429 handling | Unknown | Unknown | Handled platform-side | Yes |

---

## Sources

- [ISC Community Toolbox — SailPoint Developer Community Discussion](https://developer.sailpoint.com/discuss/t/isc-community-toolbox/26588) — confirmed feature set (read-only + Courier tab), desktop Electron+Svelte app
- [ISC Community Toolbox — GitHub Repository](https://github.com/sailpoint-oss/isc-community-toolbox) — confirmed technology and scope
- [ISC Configuration Hub — SailPoint Developer Docs](https://developer.sailpoint.com/docs/extensibility/configuration-management/configuration-hub/) — confirmed backup/restore/migrate scope, not policy generation
- [SailPoint Audit Reports Documentation](https://documentation.sailpoint.com/saas/help/common/audit-reports.html) — confirmed ISC audit data is 1 year + current month, viewable in Search
- [Atlantis — Terraform PR Automation](https://www.runatlantis.io/) — confirmed plan-in-PR diff pattern, plan+apply workflow, audit via PR history
- [Spacelift — IaC Orchestration Platform](https://spacelift.io) — confirmed drift detection, approval workflows, progress UI, auto-remediation
- [CoreView — Microsoft 365 Configuration Drift](https://www.coreview.com/blog/microsoft-365-configuration-drift-tools-in-2026-what-enterprises-need) — confirmed "desired state → detect drift → rewind/restore" pattern for config admin tools
- [Harness Audit Trail](https://developer.harness.io/docs/platform/governance/audit-trail/) — confirmed audit trail UI patterns (action, actor, timestamp, resource)
- [PatternFly Progress Stepper](https://www.patternfly.org/components/progress-stepper/design-guidelines/) — confirmed progress stepper design patterns for background async operations
- [LogRocket — UI Patterns for Async Workflows](https://blog.logrocket.com/ui-patterns-for-async-workflows-background-jobs-and-data-pipelines) — confirmed step indicator patterns for deploy modals
- [AWS Prescriptive Guidance — IAM Role Provisioning with IaC](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/automatically-validate-and-deploy-iam-policies-and-roles-in-an-aws-account-by-using-codepipeline-iam-access-analyzer-and-aws-cloudformation-macros.html) — confirmed ordered deploy + validation pattern for IAM resources
- [Gartner Peer Insights — IGA](https://www.gartner.com/reviews/market/identity-governance-administration) — confirmed IGA table stakes (access reviews, role management, audit, compliance)

---
*Feature research for: Identity Governance Administration — Policy Engine for SailPoint ISC*
*Researched: 2026-03-25*
