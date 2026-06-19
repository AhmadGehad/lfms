# Graph Report - lfms  (2026-06-19)

## Corpus Check
- 434 files · ~272,356 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1675 nodes · 4198 edges · 87 communities (78 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 79 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `57289409`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Dashboard & UI Components|Dashboard & UI Components]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Server DB Operations|Server DB Operations]]
- [[_COMMUNITY_Layout & Navigation|Layout & Navigation]]
- [[_COMMUNITY_Dev Dependencies & Build|Dev Dependencies & Build]]
- [[_COMMUNITY_Error Handling & SDK|Error Handling & SDK]]
- [[_COMMUNITY_tRPC Core & Context|tRPC Core & Context]]
- [[_COMMUNITY_Drizzle Schema Models|Drizzle Schema Models]]
- [[_COMMUNITY_Server Context & Cookies|Server Context & Cookies]]
- [[_COMMUNITY_Action Buttons & Auth|Action Buttons & Auth]]
- [[_COMMUNITY_API Test Scripts|API Test Scripts]]
- [[_COMMUNITY_LLM Integration|LLM Integration]]
- [[_COMMUNITY_Map & Composition Hooks|Map & Composition Hooks]]
- [[_COMMUNITY_Audit & Validators|Audit & Validators]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 280 edges
2. `getDb()` - 138 edges
3. `t` - 78 edges
4. `usePermissions()` - 57 edges
5. `LFMS Project TODO` - 36 edges
6. `Button()` - 35 edges
7. `trpc` - 25 edges
8. `log()` - 23 edges
9. `buildWorkbook()` - 23 edges
10. `Card()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `DashboardLayout()` --calls--> `t`  [INFERRED]
  client/src/components/DashboardLayout.tsx → server/_core/trpc.ts
- `FarmMapPreview()` --calls--> `t`  [INFERRED]
  client/src/components/FarmMapPreview.tsx → server/_core/trpc.ts
- `AnimalLocationPreview()` --calls--> `t`  [INFERRED]
  client/src/pages/AnimalProfile.tsx → server/_core/trpc.ts
- `LineageTree()` --calls--> `t`  [INFERRED]
  client/src/pages/AnimalProfile.tsx → server/_core/trpc.ts
- `FeedHistoryTab()` --calls--> `t`  [INFERRED]
  client/src/pages/AnimalProfile.tsx → server/_core/trpc.ts

## Import Cycles
- None detected.

## Communities (87 total, 9 thin omitted)

### Community 0 - "Dashboard & UI Components"
Cohesion: 0.06
Nodes (139): AnimalIdNumberField(), AnimalIdNumberFieldProps, DashboardLayoutContent(), EditAnimalDialog(), EditAnimalDialogProps, ManusDialogProps, t, useCurrency() (+131 more)

### Community 1 - "Package Dependencies"
Cohesion: 0.03
Nodes (72): dependencies, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, axios, class-variance-authority, clsx, cmdk, cookie (+64 more)

### Community 2 - "Server DB Operations"
Cohesion: 0.06
Nodes (83): mapPointSchema, mapShapeSchema, OWNER_VIEW_PERMISSIONS, REFERENCE_VIEW_PERMISSIONS, addFeedItemPrice(), addVaccinationRecord(), addVaccine(), calculateBoosterDueDate() (+75 more)

### Community 3 - "Layout & Navigation"
Cohesion: 0.06
Nodes (46): DashboardLayout(), DashboardLayoutSkeleton(), LanguageSwitcher(), useIsMobile(), Avatar(), AvatarFallback(), AvatarImage(), Sheet() (+38 more)

### Community 4 - "Dev Dependencies & Build"
Cohesion: 0.08
Nodes (24): devDependencies, add, autoprefixer, @builder.io/vite-plugin-jsx-loc, drizzle-kit, esbuild, pnpm, postcss (+16 more)

### Community 5 - "Error Handling & SDK"
Cohesion: 0.13
Nodes (13): AuthenticatedUser, isNonEmptyString(), OAuthService, SessionPayload, AuthorizeRequest, AuthorizeResponse, CanAccessRequest, CanAccessResponse (+5 more)

### Community 6 - "tRPC Core & Context"
Cohesion: 0.12
Nodes (12): Menubar(), MenubarCheckboxItem(), MenubarContent(), MenubarItem(), MenubarLabel(), MenubarMenu(), MenubarRadioItem(), MenubarSeparator() (+4 more)

### Community 7 - "Drizzle Schema Models"
Cohesion: 0.08
Nodes (30): Animal, animalCategories, AnimalCategory, AnimalStatus, animalStatuses, AuditLog, BirthType, birthTypes (+22 more)

### Community 8 - "Server Context & Cookies"
Cohesion: 0.14
Nodes (21): rolePermissions, configurableRoleSchema, permissionEntrySchema, permissionsRouter, testRouter, clearInvalidRolePermission(), getRolePermissionOverrides(), getRolePermissionState() (+13 more)

### Community 9 - "Action Buttons & Auth"
Cohesion: 0.12
Nodes (17): ActionButton(), ActionButtonProps, ButtonProps, ActionButtonGroup(), ActionButtonGroupProps, useAuth(), UseAuthOptions, useIsViewer() (+9 more)

### Community 10 - "API Test Scripts"
Cohesion: 0.35
Nodes (25): fail(), log(), main(), pass(), results, testAnimalsList(), testAuditLog(), testAuthMe() (+17 more)

### Community 11 - "LLM Integration"
Cohesion: 0.09
Nodes (24): assertApiKey(), ensureArray(), FileContent, ImageContent, invokeLLM(), InvokeParams, InvokeResult, JsonSchema (+16 more)

### Community 12 - "Map & Composition Hooks"
Cohesion: 0.10
Nodes (12): ErrorBoundary, Props, State, Checkbox(), Progress(), Slider(), Switch(), ToggleGroup() (+4 more)

### Community 13 - "Audit & Validators"
Cohesion: 0.14
Nodes (24): composeAnimalIdOrThrow(), sequenceValueFromAnimalIdNumber(), isDuplicateEntryError(), allPermissionsProcedure(), validateAnimalReferences(), checkAndStageAnimal(), createAnimal(), createLambingRecord() (+16 more)

### Community 14 - "Community 14"
Cohesion: 0.05
Nodes (41): ════════════════════════════════════════════════════════════════════════════, 10. Identity separation: user_identities + password_credentials (no auto-linking), 11. Per-company MFA enforcement with step-up auth + TOTP replay prevention, 12. Company deletion state machine (no auto-hard-delete from webhooks), 13. Quarantine-based file upload pipeline with explicit link tables (no polymorphic), 14. Append-only audit log with insert-only DB credentials + per-company hash chain, 15. CSRF: SameSite=Lax + signed token + custom header + Origin validation, 16. Generated columns for soft-delete-safe unique constraints (all soft-deletable tables) (+33 more)

### Community 15 - "Community 15"
Cohesion: 0.43
Nodes (6): notifications, createNotification(), getUpcomingBoosterVaccinations(), getUpcomingVaccinations(), checkLowStockAndNotify(), checkVaccinationsAndNotify()

### Community 16 - "Community 16"
Cohesion: 0.17
Nodes (12): applyCanonicalData(), ApplyCanonicalDataOptions, canonicalDataToObject(), normalizeBirthIntegrity(), numericId(), rowsMatch(), feedItem, tableKeyByTable (+4 more)

### Community 17 - "Community 17"
Cohesion: 0.21
Nodes (17): buildWorkbook(), headerRow(), titleRow(), readAllCanonicalTables(), getActiveHeadCountByCategory(), getAllCategories(), getAllExpenseCategories(), getAllFeedItems() (+9 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, baseUrl, esModuleInterop, incremental, jsx, lib, module (+11 more)

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (12): asDate(), asString(), importModeSchema, ImportStats, requireDate(), requireEnum(), requireYesNo(), SECURITY_TABLES (+4 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (15): AIChatBox(), AIChatBoxProps, Message, useComposition(), InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton() (+7 more)

### Community 21 - "Community 21"
Cohesion: 0.16
Nodes (19): FarmMapGroup, FarmMapPreview(), ZoneShape(), clampUnit(), hexToRgba(), isValidShape(), MapPoint, MapShape (+11 more)

### Community 22 - "Community 22"
Cohesion: 0.05
Nodes (51): Accordion(), AccordionContent(), AccordionItem(), AccordionTrigger(), AspectRatio(), Breadcrumb(), BreadcrumbEllipsis(), BreadcrumbItem() (+43 more)

### Community 23 - "Community 23"
Cohesion: 0.06
Nodes (52): getClientIp(), systemRouter, adminProcedure, anyPermissionProcedure(), ownerProcedure, permissionProcedure(), privilegedProcedure, protectedProcedure (+44 more)

### Community 24 - "Community 24"
Cohesion: 0.12
Nodes (16): DirectionsResult, DistanceMatrixResult, ElevationResult, GeocodingResult, getMapsConfig(), LatLng, makeRequest(), MapsConfig (+8 more)

### Community 25 - "Community 25"
Cohesion: 0.23
Nodes (14): divMinor(), feedLineMinor(), mulMoney(), sumMinor(), toMajor(), toMinor(), buildPricesByItem(), computeFeedCostForPeriod() (+6 more)

### Community 26 - "Community 26"
Cohesion: 0.36
Nodes (9): findAvailablePort(), isPortAvailable(), startServer(), registerOAuthRoutes(), registerStorageProxy(), serveStatic(), setupVite(), startLowStockScheduler() (+1 more)

### Community 27 - "Community 27"
Cohesion: 0.12
Nodes (15): aliases, components, hooks, lib, ui, utils, rsc, $schema (+7 more)

### Community 28 - "Community 28"
Cohesion: 0.04
Nodes (69): cn(), AlertDialogOverlay(), ButtonGroup(), ButtonGroupSeparator(), ButtonGroupText(), buttonGroupVariants, Calendar(), CalendarDayButton() (+61 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (11): DropdownMenu(), DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut() (+3 more)

### Community 30 - "Community 30"
Cohesion: 0.25
Nodes (13): compactText(), describeElement(), elText(), formatArg(), formatArgs(), getInputValueSafe(), installUiEventListeners(), isSensitiveField() (+5 more)

### Community 31 - "Community 31"
Cohesion: 0.04
Nodes (48): 10.1 Adding a New Feature, 10. Development Workflow, 11. Environment Variables, 1. Architecture Overview, 2. Directory Structure, 3.1 Configuration Tables, 3.2 Operational Tables, 3.3 System Tables (+40 more)

### Community 32 - "Community 32"
Cohesion: 0.19
Nodes (13): Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps, CarouselItem(), CarouselNext(), CarouselOptions (+5 more)

### Community 33 - "Community 33"
Cohesion: 0.28
Nodes (12): buildEndpoint(), callForge(), createHeartbeatJob(), deleteHeartbeatJob(), HeartbeatJob, HeartbeatJobInfo, HeartbeatJobUpdate, listHeartbeatJobs() (+4 more)

### Community 34 - "Community 34"
Cohesion: 0.05
Nodes (43): 10.1 Cost Components, 10.2 Revenue and Net P&L, 10.3 Active vs. Closed Animals, 10.4 Feed Price Lookup, 10. Animal P&L Calculation, 11.1 Revenue, 11.2 Cost Breakdown, 11.3 Summary (+35 more)

### Community 35 - "Community 35"
Cohesion: 0.23
Nodes (10): FormControl(), FormDescription(), FormFieldContext, FormFieldContextValue, FormItem(), FormItemContext, FormItemContextValue, FormLabel() (+2 more)

### Community 36 - "Community 36"
Cohesion: 0.22
Nodes (8): ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent(), THEMES, useChart()

### Community 37 - "Community 37"
Cohesion: 0.06
Nodes (36): Bug Fixes (Phase 16), Bug Fixes (Phase 17), Bug Fixes (Phase 18), Feature: Configuration Edit/Update (Phase 19), Feature: Edit Sale Price (Phase 20), LFMS Project TODO, Phase 10: Excel Import & Export + Rename + i18n, Phase 12: Soft-Delete with Restore (+28 more)

### Community 38 - "Community 38"
Cohesion: 0.14
Nodes (16): AnimalStatusHistory, expenseSubCategories, FeedItemPriceHistory, owners, systemSettings, vaccinationRecords, vaccines, CanonicalTableSpec (+8 more)

### Community 39 - "Community 39"
Cohesion: 0.20
Nodes (8): Theme, ThemeContext, ThemeContextType, ThemeProvider(), ThemeProviderProps, useTheme(), ComponentsShowcase(), Toaster()

### Community 40 - "Community 40"
Cohesion: 0.27
Nodes (5): DataApiCallOptions, ENV, generateImage(), GenerateImageOptions, GenerateImageResponse

### Community 41 - "Community 41"
Cohesion: 0.28
Nodes (7): ensureLogDir(), LOG_DIR, LogSource, plugins, TRIM_TARGET_BYTES, trimLogFile(), writeToLogFile()

### Community 42 - "Community 42"
Cohesion: 0.28
Nodes (8): getFileExtension(), getLanguageName(), transcribeAudio(), TranscribeOptions, TranscriptionError, TranscriptionResponse, WhisperResponse, WhisperSegment

### Community 43 - "Community 43"
Cohesion: 0.39
Nodes (8): createSessionToken(), fail(), main(), pass(), RESULTS, section(), trpc(), warn()

### Community 44 - "Community 44"
Cohesion: 0.39
Nodes (8): createSessionToken(), fail(), main(), pass(), RESULTS, section(), trpc(), warn()

### Community 45 - "Community 45"
Cohesion: 0.18
Nodes (10): createContext(), TrpcContext, User, AuthenticatedUser, CookieCall, AuthenticatedUser, mockTransactionDb(), AppRouter (+2 more)

### Community 46 - "Community 46"
Cohesion: 0.17
Nodes (11): 1. Pick the right cron type, 2. Facts (apply to BOTH flavors), 3. End-user-driven Heartbeat (tRPC create + `/api/scheduled/*` callback), 4. Variants — when the trigger isn't an end-user, 4a. Project-level Heartbeat (no end-user), 4b. AGENT cron — when the trigger needs agentic capabilities, 4c. Owner UI on manus.im (NOT something you build), 5. References (+3 more)

### Community 47 - "Community 47"
Cohesion: 0.18
Nodes (10): license, name, tailwindcss>nanoid, packageManager, wouter@3.7.1, pnpm, overrides, patchedDependencies (+2 more)

### Community 48 - "Community 48"
Cohesion: 0.11
Nodes (19): ────────────────────────────────────────────────────────────────────────────, Phase 38: Tenancy Data Model (Foundation), Phase 39: Per-Tenant Unique Constraints + Composite FKs (DB-Enforced Isolation), Phase 40: Opaque Server-Side Sessions + Route-Based Tenant Resolution, Phase 41: TenantContext Repository Layer (Compile-Time Enforced, No Mass Assignment), Phase 42: API Authorization Hardening + CI Enforcement, Phase 43: Identity Separation + Auth Architecture, Phase 44: MFA Architecture (Per-User Enrollment, Per-Company Enforcement) (+11 more)

### Community 49 - "Community 49"
Cohesion: 0.48
Nodes (6): buildEndpointUrl(), isNonEmptyString(), NotificationPayload, notifyOwner(), trimValue(), validatePayload()

### Community 50 - "Community 50"
Cohesion: 0.57
Nodes (6): appendHashSuffix(), getForgeConfig(), normalizeKey(), storageGet(), storageGetSignedUrl(), storagePut()

### Community 51 - "Community 51"
Cohesion: 0.22
Nodes (9): scripts, build, check, db:push, dev, format, start, test (+1 more)

### Community 53 - "Community 53"
Cohesion: 0.33
Nodes (5): parseSnapshot(), isCanonicalWorkbook(), rawCellValue(), readCanonicalWorkbook(), validateCanonicalDataObject()

### Community 54 - "Community 54"
Cohesion: 0.24
Nodes (4): ForbiddenError(), buildCronUser(), SDKServer, GetUserInfoWithJwtResponse

### Community 55 - "Community 55"
Cohesion: 0.21
Nodes (8): MapView(), MapViewProps, Window, TimerResponse, UseCompositionOptions, UseCompositionReturn, noop, usePersistFn()

### Community 56 - "Community 56"
Cohesion: 0.50
Nodes (3): directExpTotal, feedItemIds, purchaseCost

### Community 57 - "Community 57"
Cohesion: 0.50
Nodes (3): acqMs, daysOnFarm, exitMs

### Community 58 - "Community 58"
Cohesion: 0.28
Nodes (4): getSessionCookieOptions(), isSecureRequest(), LOCAL_HOSTS, sdk

### Community 66 - "Community 66"
Cohesion: 0.18
Nodes (10): 10. Multi-Farm Management, 18. Tenant Propagation Across Async Systems, 1. Current State Assessment, 2. Tenancy Model, Decision: Shared Database, Shared Schema with `companyId`, Farm access model (explicit, never inferred), LFMS Multi-Tenant SaaS Architecture & Security Design, Missing architecture components (complete list) (+2 more)

### Community 67 - "Community 67"
Cohesion: 0.50
Nodes (3): Development Rules, Required Tools, Workflow

### Community 70 - "Community 70"
Cohesion: 0.18
Nodes (11): 16. Migration Strategy, CI controls (beyond text scan), Compile-time enforcement, Phase 1: Schema preparation (zero downtime), Phase 2: Dual-write deployment, Phase 3: Backfill, Phase 4: Constraint enforcement, Phase 5: Code migration (+3 more)

### Community 71 - "Community 71"
Cohesion: 0.20
Nodes (10): 4. Database Architecture, Audit log changes, Composite foreign keys (database-enforced tenant integrity), Existing table modifications, Index strategy, New tables, Opaque public identifiers, Per-tenant unique constraints with soft-delete safety (+2 more)

### Community 72 - "Community 72"
Cohesion: 0.20
Nodes (10): 5. Session & Tenant Resolution, Architecture: Opaque server-side sessions + route-based tenant context, Auth version system (authoritative invalidation), Company switching (UX preference only), Cookie settings, Farm switching, Route-based tenant context (authoritative), Session lifecycle (+2 more)

### Community 73 - "Community 73"
Cohesion: 0.22
Nodes (8): Pagination(), PaginationContent(), PaginationEllipsis(), PaginationItem(), PaginationLink(), PaginationLinkProps, PaginationNext(), PaginationPrevious()

### Community 74 - "Community 74"
Cohesion: 0.25
Nodes (8): 13. File Storage & Encryption, Download flow, Encryption, Explicit link tables (no polymorphic relationships), S3 hardening, Storage architecture, Upload pipeline (quarantine-based), Upload validation

### Community 75 - "Community 75"
Cohesion: 0.25
Nodes (8): 14. Subscriptions, Billing & Usage Limits, Atomic quota enforcement (in resource transaction), Billing webhook processing (resilient), Company deletion state machine, Plans, Separated status fields, Suspension flow (via entitlement service), Usage metering

### Community 76 - "Community 76"
Cohesion: 0.25
Nodes (8): 6. Authentication Architecture, Brute-force protection, Email/Password flows, Identity separation, Lockout policy (progressive, not attacker-triggerable), MFA architecture, OAuth security, Password policy (NIST SP 800-63B aligned)

### Community 77 - "Community 77"
Cohesion: 0.25
Nodes (8): 7. Authorization & RBAC, Authorization response codes, `companyProcedure` (new base middleware), Permission precedence (deny-by-default, deterministic), Permission schema (with explicit deny), Role hierarchy management rules, `TenantContext` type (compile-time enforcement), Three-layer authorization

### Community 78 - "Community 78"
Cohesion: 0.29
Nodes (7): 12. Audit & Compliance, Append-only enforcement (not just convention), Backup deletion limitations, Cross-tenant denial logging, GDPR / data protection, Platform administration, Sensitive actions to audit

### Community 79 - "Community 79"
Cohesion: 0.29
Nodes (7): 3. Config Sharing Model, Company-wide (no `farmId`), Derived farm (inherit from parent entity, no independent `farmId` column), Explicit scope type (company-level vs farm-level), Farm-restricted user visibility rule, Farm-scoped (`farmId` NOT NULL), ID sequences — per-company

### Community 80 - "Community 80"
Cohesion: 0.33
Nodes (6): 8. Tenant Isolation Enforcement, CI enforcement (beyond text scan), Defense-in-depth: 5 layers, Farm scope enforcement (critical — no data leakage), Information leak prevention, Repository pattern (explicit command types, no mass assignment)

### Community 81 - "Community 81"
Cohesion: 0.40
Nodes (5): 11. Membership & Invitations, Invitation flow (transactional + outbox), Last-owner protection, Role management, Security rules

### Community 82 - "Community 82"
Cohesion: 0.40
Nodes (5): 15. Scalability, Backups & Disaster Recovery, Backups, Disaster recovery, Monitoring, Scalability

### Community 83 - "Community 83"
Cohesion: 0.40
Nodes (5): 9. Company Registration & Onboarding, Onboarding wizard, Registration flow (transactional + outbox), Seed routine, Slug generation

### Community 84 - "Community 84"
Cohesion: 0.50
Nodes (4): Alert(), AlertDescription(), AlertTitle(), alertVariants

### Community 85 - "Community 85"
Cohesion: 0.50
Nodes (4): 17. Threat Model & Security Checklist, CSRF protection (complete, not just SameSite), Security checklist (must pass before production), Threat model

## Knowledge Gaps
- **586 isolated node(s):** `UseAuthOptions`, `AIChatBoxProps`, `ActionButtonGroupProps`, `AnimalIdNumberFieldProps`, `EditAnimalDialogProps` (+581 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 28` to `Dashboard & UI Components`, `Community 32`, `Layout & Navigation`, `Community 36`, `Community 35`, `tRPC Core & Context`, `Community 73`, `Map & Composition Hooks`, `Community 20`, `Community 21`, `Community 22`, `Community 55`, `Community 84`, `Community 29`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Why does `t` connect `Dashboard & UI Components` to `Layout & Navigation`, `Community 21`, `Community 23`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `ENV` connect `Community 40` to `Community 33`, `Server DB Operations`, `Error Handling & SDK`, `Community 42`, `LLM Integration`, `Community 45`, `Community 49`, `Community 50`, `Community 23`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Are the 77 inferred relationships involving `t` (e.g. with `DashboardLayout()` and `DashboardLayoutContent()`) actually correct?**
  _`t` has 77 INFERRED edges - model-reasoned connections that need verification._
- **What connects `UseAuthOptions`, `AIChatBoxProps`, `ActionButtonGroupProps` to the rest of the system?**
  _589 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard & UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.05546465968586387 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.027777777777777776 - nodes in this community are weakly interconnected._