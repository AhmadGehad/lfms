# Graph Report - lfms  (2026-06-14)

## Corpus Check
- 173 files · ~121,938 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1312 nodes · 3273 edges · 59 communities (52 shown, 7 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 62 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b641a85d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 27|Community 27]]
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
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 85|Community 85]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 276 edges
2. `getDb()` - 99 edges
3. `t` - 61 edges
4. `LFMS Project TODO` - 32 edges
5. `Button()` - 29 edges
6. `log()` - 23 edges
7. `buildWorkbook()` - 23 edges
8. `trpc` - 21 edges
9. `pass()` - 21 edges
10. `fail()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `DashboardLayout()` --calls--> `t`  [INFERRED]
  client/src/components/DashboardLayout.tsx → server/_core/trpc.ts
- `DashboardLayoutContent()` --calls--> `t`  [INFERRED]
  client/src/components/DashboardLayout.tsx → server/_core/trpc.ts
- `AnimalPhoto()` --calls--> `t`  [INFERRED]
  client/src/pages/AnimalProfile.tsx → server/_core/trpc.ts
- `PnLCard()` --calls--> `t`  [INFERRED]
  client/src/pages/AnimalProfile.tsx → server/_core/trpc.ts
- `WeightChart()` --calls--> `t`  [INFERRED]
  client/src/pages/AnimalProfile.tsx → server/_core/trpc.ts

## Import Cycles
- None detected.

## Communities (59 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (114): ManusDialogProps, t, useCurrency(), generateAnimalPnLPdf(), trpc, AnimalPhoto(), AnimalProfile(), AnimalSalesTab() (+106 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (72): dependencies, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, axios, class-variance-authority, clsx, cmdk, cookie (+64 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (49): Accordion(), AccordionContent(), AccordionItem(), AccordionTrigger(), AspectRatio(), Breadcrumb(), BreadcrumbEllipsis(), BreadcrumbItem() (+41 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (46): notifications, addFeedItemPrice(), checkAndStageAnimal(), computeFeedCostForPeriod(), createBirthType(), createCategory(), createExpenseCategory(), createExpenseSubCategory() (+38 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (63): cn(), AlertDialogOverlay(), Calendar(), CalendarDayButton(), CardAction(), Command(), CommandDialog(), CommandEmpty() (+55 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (30): Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetTitle(), SheetTrigger() (+22 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (55): getClientIp(), TrpcContext, AppRole, privilegedProcedure, protectedProcedure, requireUser, ROLE_RANK, staffProcedure (+47 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (50): Animal, animalCategories, AnimalCategory, animals, AnimalStatus, animalStatuses, AnimalStatusHistory, AuditLog (+42 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (48): 10.1 Adding a New Feature, 10. Development Workflow, 11. Environment Variables, 1. Architecture Overview, 2. Directory Structure, 3.1 Configuration Tables, 3.2 Operational Tables, 3.3 System Tables (+40 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (43): 10.1 Cost Components, 10.2 Revenue and Net P&L, 10.3 Active vs. Closed Animals, 10.4 Feed Price Lookup, 10. Animal P&L Calculation, 11.1 Revenue, 11.2 Cost Breakdown, 11.3 Summary (+35 more)

### Community 10 - "Community 10"
Cohesion: 0.20
Nodes (10): useAuth(), UseAuthOptions, ROLE_RANK, Home(), RecycleBin(), App(), getLoginUrl(), queryClient (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (32): Bug Fixes (Phase 16), Bug Fixes (Phase 17), Bug Fixes (Phase 18), Feature: Configuration Edit/Update (Phase 19), Feature: Edit Sale Price (Phase 20), LFMS Project TODO, Phase 10: Excel Import & Export + Rename + i18n, Phase 12: Soft-Delete with Restore (+24 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (14): AIChatBox(), AIChatBoxProps, Message, Checkbox(), Progress(), ScrollArea(), ScrollBar(), Slider() (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.35
Nodes (25): fail(), log(), main(), pass(), results, testAnimalsList(), testAuditLog(), testAuthMe() (+17 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (24): assertApiKey(), ensureArray(), FileContent, ImageContent, invokeLLM(), InvokeParams, InvokeResult, JsonSchema (+16 more)

### Community 17 - "Community 17"
Cohesion: 0.08
Nodes (25): supervisorProcedure, backupRouter, CompleteSnapshot, importModeSchema, parseSnapshot(), applyCanonicalWorkbook(), asDate(), asString() (+17 more)

### Community 18 - "Community 18"
Cohesion: 0.08
Nodes (24): devDependencies, add, autoprefixer, @builder.io/vite-plugin-jsx-loc, drizzle-kit, esbuild, pnpm, postcss (+16 more)

### Community 19 - "Community 19"
Cohesion: 0.19
Nodes (19): buildWorkbook(), headerRow(), titleRow(), readAllCanonicalTables(), getActiveHeadCountByCategory(), getAllCategories(), getAllExpenseCategories(), getAllFeedItems() (+11 more)

### Community 20 - "Community 20"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, baseUrl, esModuleInterop, incremental, jsx, lib, module (+11 more)

### Community 21 - "Community 21"
Cohesion: 0.13
Nodes (17): ButtonGroup(), ButtonGroupSeparator(), ButtonGroupText(), buttonGroupVariants, Item(), ItemActions(), ItemContent(), ItemDescription() (+9 more)

### Community 22 - "Community 22"
Cohesion: 0.12
Nodes (16): DirectionsResult, DistanceMatrixResult, ElevationResult, GeocodingResult, getMapsConfig(), LatLng, makeRequest(), MapsConfig (+8 more)

### Community 23 - "Community 23"
Cohesion: 0.06
Nodes (32): DashboardLayout(), DashboardLayoutContent(), DashboardLayoutSkeleton(), LanguageSwitcher(), useTheme(), useIsMobile(), usePermissions(), ComponentsShowcase() (+24 more)

### Community 24 - "Community 24"
Cohesion: 0.12
Nodes (15): aliases, components, hooks, lib, ui, utils, rsc, $schema (+7 more)

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (11): ContextMenu(), ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut() (+3 more)

### Community 27 - "Community 27"
Cohesion: 0.25
Nodes (13): compactText(), describeElement(), elText(), formatArg(), formatArgs(), getInputValueSafe(), installUiEventListeners(), isSensitiveField() (+5 more)

### Community 29 - "Community 29"
Cohesion: 0.19
Nodes (13): Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps, CarouselItem(), CarouselNext(), CarouselOptions (+5 more)

### Community 31 - "Community 31"
Cohesion: 0.28
Nodes (12): buildEndpoint(), callForge(), createHeartbeatJob(), deleteHeartbeatJob(), HeartbeatJob, HeartbeatJobInfo, HeartbeatJobUpdate, listHeartbeatJobs() (+4 more)

### Community 32 - "Community 32"
Cohesion: 0.16
Nodes (12): AuthenticatedUser, buildCronUser(), isNonEmptyString(), SessionPayload, AuthorizeRequest, AuthorizeResponse, CanAccessRequest, CanAccessResponse (+4 more)

### Community 33 - "Community 33"
Cohesion: 0.12
Nodes (18): MapView(), MapViewProps, Window, TimerResponse, useComposition(), UseCompositionOptions, UseCompositionReturn, noop (+10 more)

### Community 34 - "Community 34"
Cohesion: 0.20
Nodes (6): createContext(), User, AuthenticatedUser, CookieCall, AuthenticatedUser, AppRouter

### Community 35 - "Community 35"
Cohesion: 0.44
Nodes (9): divMinor(), feedLineMinor(), mulMoney(), sumMinor(), toMajor(), toMinor(), getAllAnimalsPnL(), getDashboardKPIs() (+1 more)

### Community 36 - "Community 36"
Cohesion: 0.17
Nodes (11): 1. Pick the right cron type, 2. Facts (apply to BOTH flavors), 3. End-user-driven Heartbeat (tRPC create + `/api/scheduled/*` callback), 4. Variants — when the trigger isn't an end-user, 4a. Project-level Heartbeat (no end-user), 4b. AGENT cron — when the trigger needs agentic capabilities, 4c. Owner UI on manus.im (NOT something you build), 5. References (+3 more)

### Community 37 - "Community 37"
Cohesion: 0.23
Nodes (10): FormControl(), FormDescription(), FormFieldContext, FormFieldContextValue, FormItem(), FormItemContext, FormItemContextValue, FormLabel() (+2 more)

### Community 38 - "Community 38"
Cohesion: 0.18
Nodes (10): license, name, tailwindcss>nanoid, packageManager, wouter@3.7.1, pnpm, overrides, patchedDependencies (+2 more)

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (8): ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent(), THEMES, useChart()

### Community 40 - "Community 40"
Cohesion: 0.27
Nodes (5): DataApiCallOptions, ENV, generateImage(), GenerateImageOptions, GenerateImageResponse

### Community 41 - "Community 41"
Cohesion: 0.40
Nodes (8): findAvailablePort(), isPortAvailable(), startServer(), registerOAuthRoutes(), registerStorageProxy(), serveStatic(), setupVite(), startLowStockScheduler()

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (3): OAuthService, ExchangeTokenResponse, GetUserInfoResponse

### Community 45 - "Community 45"
Cohesion: 0.28
Nodes (8): getFileExtension(), getLanguageName(), transcribeAudio(), TranscribeOptions, TranscriptionError, TranscriptionResponse, WhisperResponse, WhisperSegment

### Community 46 - "Community 46"
Cohesion: 0.22
Nodes (9): scripts, build, check, db:push, dev, format, start, test (+1 more)

### Community 47 - "Community 47"
Cohesion: 0.39
Nodes (8): createSessionToken(), fail(), main(), pass(), RESULTS, section(), trpc(), warn()

### Community 48 - "Community 48"
Cohesion: 0.39
Nodes (8): createSessionToken(), fail(), main(), pass(), RESULTS, section(), trpc(), warn()

### Community 49 - "Community 49"
Cohesion: 0.28
Nodes (7): ensureLogDir(), LOG_DIR, LogSource, plugins, TRIM_TARGET_BYTES, trimLogFile(), writeToLogFile()

### Community 50 - "Community 50"
Cohesion: 0.32
Nodes (4): getSessionCookieOptions(), isSecureRequest(), LOCAL_HOSTS, sdk

### Community 51 - "Community 51"
Cohesion: 0.29
Nodes (3): ErrorBoundary, Props, State

### Community 53 - "Community 53"
Cohesion: 0.31
Nodes (8): buildEndpointUrl(), isNonEmptyString(), NotificationPayload, notifyOwner(), trimValue(), validatePayload(), systemRouter, adminProcedure

### Community 54 - "Community 54"
Cohesion: 0.57
Nodes (6): appendHashSuffix(), getForgeConfig(), normalizeKey(), storageGet(), storageGetSignedUrl(), storagePut()

### Community 58 - "Community 58"
Cohesion: 0.50
Nodes (4): Alert(), AlertDescription(), AlertTitle(), alertVariants

### Community 81 - "Community 81"
Cohesion: 0.33
Nodes (5): Theme, ThemeContext, ThemeContextType, ThemeProvider(), ThemeProviderProps

### Community 85 - "Community 85"
Cohesion: 0.50
Nodes (3): ar, en, TranslationKeys

## Knowledge Gaps
- **394 isolated node(s):** `UseAuthOptions`, `AIChatBoxProps`, `Props`, `State`, `ManusDialogProps` (+389 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 4` to `Community 0`, `Community 33`, `Community 2`, `Community 37`, `Community 5`, `Community 39`, `Community 12`, `Community 51`, `Community 21`, `Community 23`, `Community 25`, `Community 58`, `Community 29`?**
  _High betweenness centrality (0.153) - this node is a cross-community bridge._
- **Why does `t` connect `Community 0` to `Community 10`, `Community 6`, `Community 23`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `ENV` connect `Community 40` to `Community 32`, `Community 3`, `Community 45`, `Community 14`, `Community 53`, `Community 22`, `Community 54`, `Community 31`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 60 inferred relationships involving `t` (e.g. with `DashboardLayout()` and `DashboardLayoutContent()`) actually correct?**
  _`t` has 60 INFERRED edges - model-reasoned connections that need verification._
- **What connects `UseAuthOptions`, `AIChatBoxProps`, `Props` to the rest of the system?**
  _397 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05978823342090598 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.027777777777777776 - nodes in this community are weakly interconnected._