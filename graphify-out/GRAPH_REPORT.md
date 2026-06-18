# Graph Report - .  (2026-06-18)

## Corpus Check
- 413 files · ~241,307 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1261 nodes · 3495 edges · 66 communities (61 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 73 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

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
- [[_COMMUNITY_Schema History & Users|Schema History & Users]]
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

## God Nodes (most connected - your core abstractions)
1. `cn()` - 278 edges
2. `getDb()` - 120 edges
3. `t` - 72 edges
4. `usePermissions()` - 43 edges
5. `Button()` - 31 edges
6. `trpc` - 23 edges
7. `log()` - 23 edges
8. `buildWorkbook()` - 23 edges
9. `Card()` - 21 edges
10. `CardContent()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `DashboardLayout()` --calls--> `t`  [INFERRED]
  client/src/components/DashboardLayout.tsx → server/_core/trpc.ts
- `PnLCard()` --calls--> `t`  [INFERRED]
  client/src/pages/AnimalProfile.tsx → server/_core/trpc.ts
- `AnimalLocationPreview()` --calls--> `t`  [INFERRED]
  client/src/pages/AnimalProfile.tsx → server/_core/trpc.ts
- `LineageTree()` --calls--> `t`  [INFERRED]
  client/src/pages/AnimalProfile.tsx → server/_core/trpc.ts
- `FeedHistoryTab()` --calls--> `t`  [INFERRED]
  client/src/pages/AnimalProfile.tsx → server/_core/trpc.ts

## Import Cycles
- None detected.

## Communities (66 total, 5 thin omitted)

### Community 0 - "Dashboard & UI Components"
Cohesion: 0.06
Nodes (128): DashboardLayoutContent(), ManusDialogProps, t, useCurrency(), ROLE_RANK, usePermissions(), generateAnimalPnLPdf(), trpc (+120 more)

### Community 1 - "Package Dependencies"
Cohesion: 0.03
Nodes (72): dependencies, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, axios, class-variance-authority, clsx, cmdk, cookie (+64 more)

### Community 2 - "Server DB Operations"
Cohesion: 0.07
Nodes (68): mapPointSchema, mapShapeSchema, addFeedItemPrice(), addVaccine(), computeRationConsumptionBetween(), createBirthType(), createCategory(), createExpenseCategory() (+60 more)

### Community 3 - "Layout & Navigation"
Cohesion: 0.06
Nodes (46): DashboardLayout(), DashboardLayoutSkeleton(), LanguageSwitcher(), useIsMobile(), Avatar(), AvatarFallback(), AvatarImage(), Sheet() (+38 more)

### Community 4 - "Dev Dependencies & Build"
Cohesion: 0.05
Nodes (43): devDependencies, add, autoprefixer, @builder.io/vite-plugin-jsx-loc, drizzle-kit, esbuild, pnpm, postcss (+35 more)

### Community 5 - "Error Handling & SDK"
Cohesion: 0.08
Nodes (19): ForbiddenError(), HttpError, AuthenticatedUser, buildCronUser(), isNonEmptyString(), OAuthService, SDKServer, SessionPayload (+11 more)

### Community 6 - "tRPC Core & Context"
Cohesion: 0.08
Nodes (29): TrpcContext, systemRouter, adminProcedure, AppRole, blockViewerMutationMiddleware, privilegedProcedure, publicProcedure, requireUser (+21 more)

### Community 7 - "Drizzle Schema Models"
Cohesion: 0.08
Nodes (32): Animal, animalCategories, AnimalCategory, AnimalStatus, animalStatuses, AuditLog, BirthType, birthTypes (+24 more)

### Community 8 - "Server Context & Cookies"
Cohesion: 0.11
Nodes (21): createContext(), getSessionCookieOptions(), isSecureRequest(), LOCAL_HOSTS, findAvailablePort(), isPortAvailable(), startServer(), registerOAuthRoutes() (+13 more)

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
Cohesion: 0.12
Nodes (18): MapView(), MapViewProps, Window, TimerResponse, useComposition(), UseCompositionOptions, UseCompositionReturn, noop (+10 more)

### Community 13 - "Audit & Validators"
Cohesion: 0.23
Nodes (17): getClientIp(), protectedProcedure, staffProcedure, isoDate, moneyString, optionalMoneyString, optionalWeightString, pastOrTodayDate (+9 more)

### Community 14 - "Schema History & Users"
Cohesion: 0.14
Nodes (20): AnimalStatusHistory, expenseSubCategories, FeedItemPriceHistory, owners, systemSettings, users, vaccinationRecords, vaccines (+12 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (17): supervisorProcedure, animals, notifications, vaccinationRouter, addVaccinationRecord(), calculateNextDueDate(), checkAndStageAnimal(), createNotification() (+9 more)

### Community 16 - "Community 16"
Cohesion: 0.15
Nodes (14): backupRouter, CompleteSnapshot, importModeSchema, parseSnapshot(), applyCanonicalData(), canonicalDataToObject(), ImportMode, rowsMatch() (+6 more)

### Community 17 - "Community 17"
Cohesion: 0.20
Nodes (18): buildWorkbook(), headerRow(), titleRow(), readAllCanonicalTables(), getActiveHeadCountByCategory(), getAllCategories(), getAllExpenseCategories(), getAllFeedItems() (+10 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, baseUrl, esModuleInterop, incremental, jsx, lib, module (+11 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (17): ButtonGroup(), ButtonGroupSeparator(), ButtonGroupText(), buttonGroupVariants, Item(), ItemActions(), ItemContent(), ItemDescription() (+9 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (11): AIChatBox(), AIChatBoxProps, Message, Calendar(), CalendarDayButton(), Progress(), ScrollArea(), ScrollBar() (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.16
Nodes (17): FarmMapGroup, FarmMapPreview(), ZoneShape(), clampUnit(), isValidShape(), MapPoint, MapShape, PolygonShape (+9 more)

### Community 22 - "Community 22"
Cohesion: 0.18
Nodes (13): Accordion(), AccordionContent(), AccordionItem(), AccordionTrigger(), AspectRatio(), CardDescription(), CardFooter(), HoverCard() (+5 more)

### Community 23 - "Community 23"
Cohesion: 0.13
Nodes (14): asDate(), asString(), importModeSchema, ImportStats, requireDate(), requireEnum(), requireYesNo(), createExpense() (+6 more)

### Community 24 - "Community 24"
Cohesion: 0.12
Nodes (16): DirectionsResult, DistanceMatrixResult, ElevationResult, GeocodingResult, getMapsConfig(), LatLng, makeRequest(), MapsConfig (+8 more)

### Community 25 - "Community 25"
Cohesion: 0.24
Nodes (13): divMinor(), feedLineMinor(), mulMoney(), sumMinor(), toMajor(), toMinor(), buildPricesByItem(), computeFeedCostForPeriod() (+5 more)

### Community 26 - "Community 26"
Cohesion: 0.12
Nodes (12): Menubar(), MenubarCheckboxItem(), MenubarContent(), MenubarItem(), MenubarLabel(), MenubarMenu(), MenubarRadioItem(), MenubarSeparator() (+4 more)

### Community 27 - "Community 27"
Cohesion: 0.12
Nodes (15): aliases, components, hooks, lib, ui, utils, rsc, $schema (+7 more)

### Community 28 - "Community 28"
Cohesion: 0.12
Nodes (11): ContextMenu(), ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut() (+3 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (11): DropdownMenu(), DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut() (+3 more)

### Community 30 - "Community 30"
Cohesion: 0.25
Nodes (13): compactText(), describeElement(), elText(), formatArg(), formatArgs(), getInputValueSafe(), installUiEventListeners(), isSensitiveField() (+5 more)

### Community 31 - "Community 31"
Cohesion: 0.18
Nodes (12): cn(), AlertDialogOverlay(), CardAction(), Checkbox(), DialogOverlay(), Kbd(), KbdGroup(), SelectLabel() (+4 more)

### Community 32 - "Community 32"
Cohesion: 0.19
Nodes (13): Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps, CarouselItem(), CarouselNext(), CarouselOptions (+5 more)

### Community 33 - "Community 33"
Cohesion: 0.28
Nodes (12): buildEndpoint(), callForge(), createHeartbeatJob(), deleteHeartbeatJob(), HeartbeatJob, HeartbeatJobInfo, HeartbeatJobUpdate, listHeartbeatJobs() (+4 more)

### Community 34 - "Community 34"
Cohesion: 0.18
Nodes (11): Field(), FieldContent(), FieldDescription(), FieldError(), FieldGroup(), FieldLabel(), FieldLegend(), FieldSeparator() (+3 more)

### Community 35 - "Community 35"
Cohesion: 0.23
Nodes (10): FormControl(), FormDescription(), FormFieldContext, FormFieldContextValue, FormItem(), FormItemContext, FormItemContextValue, FormLabel() (+2 more)

### Community 36 - "Community 36"
Cohesion: 0.22
Nodes (8): ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent(), THEMES, useChart()

### Community 37 - "Community 37"
Cohesion: 0.18
Nodes (10): Command(), CommandDialog(), CommandEmpty(), CommandGroup(), CommandInput(), CommandItem(), CommandList(), CommandSeparator() (+2 more)

### Community 38 - "Community 38"
Cohesion: 0.18
Nodes (9): Drawer(), DrawerClose(), DrawerContent(), DrawerDescription(), DrawerFooter(), DrawerHeader(), DrawerOverlay(), DrawerTitle() (+1 more)

### Community 39 - "Community 39"
Cohesion: 0.20
Nodes (8): Theme, ThemeContext, ThemeContextType, ThemeProvider(), ThemeProviderProps, useTheme(), ComponentsShowcase(), Toaster()

### Community 40 - "Community 40"
Cohesion: 0.27
Nodes (5): DataApiCallOptions, ENV, generateImage(), GenerateImageOptions, GenerateImageResponse

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (9): NavigationMenu(), NavigationMenuContent(), NavigationMenuIndicator(), NavigationMenuItem(), NavigationMenuLink(), NavigationMenuList(), NavigationMenuTrigger(), navigationMenuTriggerStyle (+1 more)

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
Cohesion: 0.22
Nodes (8): Pagination(), PaginationContent(), PaginationEllipsis(), PaginationItem(), PaginationLink(), PaginationLinkProps, PaginationNext(), PaginationPrevious()

### Community 46 - "Community 46"
Cohesion: 0.25
Nodes (7): Breadcrumb(), BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList(), BreadcrumbPage(), BreadcrumbSeparator()

### Community 47 - "Community 47"
Cohesion: 0.29
Nodes (7): Empty(), EmptyContent(), EmptyDescription(), EmptyHeader(), EmptyMedia(), emptyMediaVariants, EmptyTitle()

### Community 48 - "Community 48"
Cohesion: 0.29
Nodes (3): ErrorBoundary, Props, State

### Community 49 - "Community 49"
Cohesion: 0.48
Nodes (6): buildEndpointUrl(), isNonEmptyString(), NotificationPayload, notifyOwner(), trimValue(), validatePayload()

### Community 50 - "Community 50"
Cohesion: 0.57
Nodes (6): appendHashSuffix(), getForgeConfig(), normalizeKey(), storageGet(), storageGetSignedUrl(), storagePut()

### Community 51 - "Community 51"
Cohesion: 0.43
Nodes (5): ToggleGroup(), ToggleGroupContext, ToggleGroupItem(), Toggle(), toggleVariants

### Community 53 - "Community 53"
Cohesion: 0.50
Nodes (4): Alert(), AlertDescription(), AlertTitle(), alertVariants

### Community 54 - "Community 54"
Cohesion: 0.40
Nodes (3): InputOTP(), InputOTPGroup(), InputOTPSlot()

### Community 55 - "Community 55"
Cohesion: 0.40
Nodes (3): Popover(), PopoverContent(), PopoverTrigger()

### Community 56 - "Community 56"
Cohesion: 0.50
Nodes (3): directExpTotal, feedItemIds, purchaseCost

### Community 57 - "Community 57"
Cohesion: 0.50
Nodes (3): acqMs, daysOnFarm, exitMs

### Community 58 - "Community 58"
Cohesion: 0.50
Nodes (3): Collapsible(), CollapsibleContent(), CollapsibleTrigger()

### Community 59 - "Community 59"
Cohesion: 0.50
Nodes (3): ResizableHandle(), ResizablePanel(), ResizablePanelGroup()

## Knowledge Gaps
- **297 isolated node(s):** `UseAuthOptions`, `AIChatBoxProps`, `ActionButtonGroupProps`, `Props`, `State` (+292 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 31` to `Dashboard & UI Components`, `Layout & Navigation`, `Map & Composition Hooks`, `Community 19`, `Community 20`, `Community 21`, `Community 22`, `Community 26`, `Community 28`, `Community 29`, `Community 32`, `Community 34`, `Community 35`, `Community 36`, `Community 37`, `Community 38`, `Community 41`, `Community 45`, `Community 46`, `Community 47`, `Community 48`, `Community 51`, `Community 53`, `Community 54`, `Community 55`, `Community 59`?**
  _High betweenness centrality (0.173) - this node is a cross-community bridge._
- **Why does `t` connect `Dashboard & UI Components` to `Action Buttons & Auth`, `Layout & Navigation`, `Community 21`, `tRPC Core & Context`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `ENV` connect `Community 40` to `Community 33`, `Server DB Operations`, `Error Handling & SDK`, `Community 42`, `LLM Integration`, `Community 49`, `Community 50`, `Community 24`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Are the 71 inferred relationships involving `t` (e.g. with `DashboardLayout()` and `DashboardLayoutContent()`) actually correct?**
  _`t` has 71 INFERRED edges - model-reasoned connections that need verification._
- **What connects `UseAuthOptions`, `AIChatBoxProps`, `ActionButtonGroupProps` to the rest of the system?**
  _300 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard & UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.05974025974025974 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.027777777777777776 - nodes in this community are weakly interconnected._