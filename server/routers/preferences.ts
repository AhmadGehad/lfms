import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getSetting, getUserSettings, upsertUserSetting } from "../db";

/**
 * Per-user UI preferences (design version, theme, density, saved views…).
 *
 * Presentation-only — shares the auth/session of every other procedure and adds
 * no business logic. Both the Old and New designs read the same prefs so the
 * Old/New switch and theme are a single source of truth across devices
 * (localStorage is only a first-paint cache on the client). See
 * ux-audit/11_TECHNICAL_MIGRATION_CONSTRAINTS.md §B.
 */

// Whitelist of keys a user may set on themselves. Keep narrow; new keys are cheap
// to add (no migration — key/value store) but must be intentional.
const ALLOWED_KEYS = [
  "ui.designVersion", // "old" | "new"
  "ui.theme", // "light" | "dark" | "system"
  "ui.density", // "comfortable" | "compact"
  "ui.savedViews", // JSON blob of saved table views
  "ui.dashboardLayout", // JSON blob of dashboard layout
] as const;

const settingKey = z.enum(ALLOWED_KEYS);

// Global defaults (org-wide) that the client's resolver layers under the user's
// own choice. Mirrors the resolution order in §A of the migration doc.
const GLOBAL_DEFAULT_KEYS = [
  "ui.designVersion",
  "ui.themeDefault",
  "ui.designVersion.enabledRoles",
  "ui.designVersion.rolloutPercent",
] as const;

export const preferencesRouter = router({
  /** This user's saved prefs plus the org-wide defaults the client resolves against. */
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserSettings(ctx.user.id);
    const globals: Record<string, string | null> = {};
    await Promise.all(
      GLOBAL_DEFAULT_KEYS.map(async key => {
        globals[key] = await getSetting(key);
      })
    );
    return { user, globals, role: ctx.user.role };
  }),

  /** Upsert one preference for the current user. */
  set: protectedProcedure
    .input(z.object({ key: settingKey, value: z.string().max(20000) }))
    .mutation(async ({ ctx, input }) => {
      await upsertUserSetting(ctx.user.id, input.key, input.value);
      return { success: true } as const;
    }),
});
