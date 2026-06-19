# Graph Report - lfms  (2026-06-19)

## Corpus Check
- 429 files · ~251,266 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1477 nodes · 3942 edges · 65 communities (58 shown, 7 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 78 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `532336d9`
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
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 280 edges
2. `getDb()` - 130 edges
3. `t` - 77 edges
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
- `DashboardLayoutContent()` --calls--> `t`  [INFERRED]
  client/src/components/DashboardLayout.tsx → server/_core/trpc.ts
- `FarmMapPreview()` --calls--> `t`  [INFERRED]
  client/src/components/FarmMapPreview.tsx → server/_core/trpc.ts
- `AnimalLocationPreview()` --calls--> `t`  [INFERRED]
  client/src/pages/AnimalProfile.tsx → server/_core/trpc.ts
- `LineageTree()` --calls--> `t`  [INFERRED]
  client/src/pages/AnimalProfile.tsx → server/_core/trpc.ts

## Import Cycles
- None detected.

## Communities (65 total, 7 thin omitted)

### Community 0 - "Dashboard & UI Components"
Cohesion: 0.06
Nodes (134): AnimalIdNumberField(), AnimalIdNumberFieldProps, EditAnimalDialog(), EditAnimalDialogProps, ManusDialogProps, t, useCurrency(), usePermissions() (+126 more)

### Community 1 - "Package Dependencies"
Cohesion: 0.03
Nodes (72): dependencies, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, axios, class-variance-authority, clsx, cmdk, cookie (+64 more)

### Community 2 - "Server DB Operations"
Cohesion: 0.08
Nodes (58): mapPointSchema, mapShapeSchema, OWNER_VIEW_PERMISSIONS, REFERENCE_VIEW_PERMISSIONS, addFeedItemPrice(), addVaccine(), buildPricesByItem(), checkAndStageAnimal() (+50 more)

### Community 3 - "Layout & Navigation"
Cohesion: 0.05
Nodes (50): DashboardLayout(), DashboardLayoutContent(), DashboardLayoutSkeleton(), LanguageSwitcher(), useTheme(), useIsMobile(), ComponentsShowcase(), Avatar() (+42 more)

### Community 4 - "Dev Dependencies & Build"
Cohesion: 0.08
Nodes (24): devDependencies, add, autoprefixer, @builder.io/vite-plugin-jsx-loc, drizzle-kit, esbuild, pnpm, postcss (+16 more)

### Community 5 - "Error Handling & SDK"
Cohesion: 0.06
Nodes (23): getSessionCookieOptions(), isSecureRequest(), LOCAL_HOSTS, ForbiddenError(), HttpError, AuthenticatedUser, buildCronUser(), isNonEmptyString() (+15 more)

### Community 6 - "tRPC Core & Context"
Cohesion: 0.12
Nodes (12): Menubar(), MenubarCheckboxItem(), MenubarContent(), MenubarItem(), MenubarLabel(), MenubarMenu(), MenubarRadioItem(), MenubarSeparator() (+4 more)

### Community 7 - "Drizzle Schema Models"
Cohesion: 0.08
Nodes (32): Animal, AnimalCategory, animals, AnimalStatus, animalStatuses, AuditLog, BirthType, birthTypes (+24 more)

### Community 8 - "Server Context & Cookies"
Cohesion: 0.09
Nodes (32): createContext(), TrpcContext, allPermissionsProcedure(), ownerProcedure, requireUser, ROLE_RANK, configurableRoleSchema, permissionEntrySchema (+24 more)

### Community 9 - "Action Buttons & Auth"
Cohesion: 0.12
Nodes (18): ActionButton(), ActionButtonProps, ButtonProps, ActionButtonGroup(), ActionButtonGroupProps, useAuth(), UseAuthOptions, useIsViewer() (+10 more)

### Community 10 - "API Test Scripts"
Cohesion: 0.35
Nodes (25): fail(), log(), main(), pass(), results, testAnimalsList(), testAuditLog(), testAuthMe() (+17 more)

### Community 11 - "LLM Integration"
Cohesion: 0.09
Nodes (24): assertApiKey(), ensureArray(), FileContent, ImageContent, invokeLLM(), InvokeParams, InvokeResult, JsonSchema (+16 more)

### Community 12 - "Map & Composition Hooks"
Cohesion: 0.08
Nodes (23): AIChatBox(), AIChatBoxProps, Message, MapView(), MapViewProps, Window, TimerResponse, useComposition() (+15 more)

### Community 13 - "Audit & Validators"
Cohesion: 0.07
Nodes (48): composeAnimalIdOrThrow(), sequenceValueFromAnimalIdNumber(), getClientIp(), isDuplicateEntryError(), protectedProcedure, staffProcedure, isoDate, moneyString (+40 more)

### Community 14 - "Community 14"
Cohesion: 0.50
Nodes (4): Alert(), AlertDescription(), AlertTitle(), alertVariants

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (17): anyPermissionProcedure(), supervisorProcedure, notifications, vaccinationRouter, addVaccinationRecord(), calculateBoosterDueDate(), calculateNextDueDate(), createNotification() (+9 more)

### Community 16 - "Community 16"
Cohesion: 0.19
Nodes (8): applyCanonicalData(), ApplyCanonicalDataOptions, canonicalDataToObject(), rowsMatch(), feedItem, tableKeyByTable, TransferStat, DbOrTx

### Community 17 - "Community 17"
Cohesion: 0.19
Nodes (19): buildWorkbook(), headerRow(), titleRow(), readAllCanonicalTables(), getActiveHeadCountByCategory(), getAllCategories(), getAllExpenseCategories(), getAllFeedItems() (+11 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, baseUrl, esModuleInterop, incremental, jsx, lib, module (+11 more)

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (13): asDate(), asString(), importModeSchema, importRouter, ImportStats, requireDate(), requireEnum(), requireYesNo() (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.28
Nodes (8): InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants, InputGroupInput(), InputGroupText(), InputGroupTextarea()

### Community 21 - "Community 21"
Cohesion: 0.15
Nodes (21): FarmMapGroup, FarmMapPreview(), ZoneShape(), clampUnit(), hexToRgba(), isValidShape(), MapPoint, MapShape (+13 more)

### Community 22 - "Community 22"
Cohesion: 0.04
Nodes (59): Accordion(), AccordionContent(), AccordionItem(), AccordionTrigger(), AspectRatio(), Breadcrumb(), BreadcrumbEllipsis(), BreadcrumbItem() (+51 more)

### Community 23 - "Community 23"
Cohesion: 0.11
Nodes (22): permissionProcedure(), privilegedProcedure, users, backupRouter, CompleteSnapshot, importModeSchema, configRouter, auditRouter (+14 more)

### Community 24 - "Community 24"
Cohesion: 0.12
Nodes (16): DirectionsResult, DistanceMatrixResult, ElevationResult, GeocodingResult, getMapsConfig(), LatLng, makeRequest(), MapsConfig (+8 more)

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (12): divMinor(), feedLineMinor(), mulMoney(), sumMinor(), toMajor(), toMinor(), getAllAnimalsPnL(), getAnimalPnL() (+4 more)

### Community 26 - "Community 26"
Cohesion: 0.36
Nodes (9): findAvailablePort(), isPortAvailable(), startServer(), registerOAuthRoutes(), registerStorageProxy(), serveStatic(), setupVite(), startLowStockScheduler() (+1 more)

### Community 27 - "Community 27"
Cohesion: 0.12
Nodes (15): aliases, components, hooks, lib, ui, utils, rsc, $schema (+7 more)

### Community 28 - "Community 28"
Cohesion: 0.05
Nodes (58): cn(), AlertDialogOverlay(), ButtonGroup(), ButtonGroupSeparator(), ButtonGroupText(), buttonGroupVariants, Calendar(), CalendarDayButton() (+50 more)

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
Cohesion: 0.05
Nodes (36): Bug Fixes (Phase 16), Bug Fixes (Phase 17), Bug Fixes (Phase 18), Feature: Configuration Edit/Update (Phase 19), Feature: Edit Sale Price (Phase 20), LFMS Project TODO, Phase 10: Excel Import & Export + Rename + i18n, Phase 12: Soft-Delete with Restore (+28 more)

### Community 38 - "Community 38"
Cohesion: 0.15
Nodes (16): animalCategories, AnimalStatusHistory, expenseSubCategories, FeedItemPriceHistory, owners, rolePermissions, systemSettings, vaccinationRecords (+8 more)

### Community 39 - "Community 39"
Cohesion: 0.33
Nodes (5): Theme, ThemeContext, ThemeContextType, ThemeProvider(), ThemeProviderProps

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
Cohesion: 0.12
Nodes (11): ContextMenu(), ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut() (+3 more)

### Community 46 - "Community 46"
Cohesion: 0.17
Nodes (11): 1. Pick the right cron type, 2. Facts (apply to BOTH flavors), 3. End-user-driven Heartbeat (tRPC create + `/api/scheduled/*` callback), 4. Variants — when the trigger isn't an end-user, 4a. Project-level Heartbeat (no end-user), 4b. AGENT cron — when the trigger needs agentic capabilities, 4c. Owner UI on manus.im (NOT something you build), 5. References (+3 more)

### Community 47 - "Community 47"
Cohesion: 0.18
Nodes (10): license, name, tailwindcss>nanoid, packageManager, wouter@3.7.1, pnpm, overrides, patchedDependencies (+2 more)

### Community 48 - "Community 48"
Cohesion: 0.29
Nodes (3): ErrorBoundary, Props, State

### Community 49 - "Community 49"
Cohesion: 0.31
Nodes (8): buildEndpointUrl(), isNonEmptyString(), NotificationPayload, notifyOwner(), trimValue(), validatePayload(), systemRouter, adminProcedure

### Community 50 - "Community 50"
Cohesion: 0.57
Nodes (6): appendHashSuffix(), getForgeConfig(), normalizeKey(), storageGet(), storageGetSignedUrl(), storagePut()

### Community 51 - "Community 51"
Cohesion: 0.22
Nodes (9): scripts, build, check, db:push, dev, format, start, test (+1 more)

### Community 53 - "Community 53"
Cohesion: 0.25
Nodes (7): parseSnapshot(), CANONICAL_TABLES, CanonicalWorkbookData, isCanonicalWorkbook(), rawCellValue(), readCanonicalWorkbook(), validateCanonicalDataObject()

### Community 56 - "Community 56"
Cohesion: 0.50
Nodes (3): directExpTotal, feedItemIds, purchaseCost

### Community 57 - "Community 57"
Cohesion: 0.50
Nodes (3): acqMs, daysOnFarm, exitMs

### Community 67 - "Community 67"
Cohesion: 0.50
Nodes (3): Development Rules, Required Tools, Workflow

## Knowledge Gaps
- **430 isolated node(s):** `UseAuthOptions`, `AIChatBoxProps`, `ActionButtonGroupProps`, `AnimalIdNumberFieldProps`, `EditAnimalDialogProps` (+425 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 28` to `Dashboard & UI Components`, `Community 32`, `Layout & Navigation`, `Community 36`, `Community 35`, `tRPC Core & Context`, `Map & Composition Hooks`, `Community 45`, `Community 14`, `Community 48`, `Community 20`, `Community 21`, `Community 22`, `Community 29`?**
  _High betweenness centrality (0.164) - this node is a cross-community bridge._
- **Why does `t` connect `Dashboard & UI Components` to `Server Context & Cookies`, `Action Buttons & Auth`, `Layout & Navigation`, `Community 21`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `ENV` connect `Community 40` to `Community 33`, `Server DB Operations`, `Error Handling & SDK`, `Server Context & Cookies`, `Community 42`, `LLM Integration`, `Community 49`, `Community 50`, `Community 23`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Are the 76 inferred relationships involving `t` (e.g. with `DashboardLayout()` and `DashboardLayoutContent()`) actually correct?**
  _`t` has 76 INFERRED edges - model-reasoned connections that need verification._
- **What connects `UseAuthOptions`, `AIChatBoxProps`, `ActionButtonGroupProps` to the rest of the system?**
  _433 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard & UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.05844618674269423 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.027777777777777776 - nodes in this community are weakly interconnected._