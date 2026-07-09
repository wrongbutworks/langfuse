// Business rules for the legacy blob export source deprecation gate.
// This is a client-safe file that can be imported from @langfuse/shared.

import { AnalyticsIntegrationExportSource } from "@prisma/client";

// Cloud projects created on or after this instant cannot use legacy export sources.
// Both date-based cutoffs in this file are Cloud-only by design, permanently (the
// `!isCloud` short-circuits below). Cloud's cutoff dates are arbitrary from a
// self-hosted operator's perspective; on self-hosted, legacy-source availability
// follows DATA CAPABILITY — whether the deployment still writes the v3
// traces/observations tables — not calendar dates. That capability is expressed by
// the write mode: see `isLegacyBlobExportWriteModeAllowed` below, which forces
// EVENTS under `events_only` (v3 tables no longer written) regardless of Cloud/
// self-hosted. Enabling the enriched export via the V4 preview opt-in does NOT
// activate these date cutoffs (LFE-10148, LFE-10065).
// NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF overrides the default for local dev testing.
const _override = process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF
  ? new Date(process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORT_CUTOFF)
  : null;
export const LEGACY_BLOB_EXPORT_CUTOFF =
  _override && !isNaN(_override.getTime())
    ? _override
    : new Date("2026-05-20T00:00:00.000Z");

// Cloud blob storage integrations created on or after this instant cannot use legacy
// export sources. Symmetric with `LEGACY_BLOB_EXPORT_CUTOFF` (project-level) but applied
// to `BlobStorageIntegration.createdAt` instead of `Project.createdAt`. Cloud-only —
// see the note above.
// NEXT_PUBLIC_LANGFUSE_BLOB_EXPORTER_CUTOFF overrides the default for local dev testing.
const _exporterOverride = process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORTER_CUTOFF
  ? new Date(process.env.NEXT_PUBLIC_LANGFUSE_BLOB_EXPORTER_CUTOFF)
  : null;
export const LEGACY_BLOB_EXPORTER_CUTOFF =
  _exporterOverride && !isNaN(_exporterOverride.getTime())
    ? _exporterOverride
    : new Date("2026-06-22T00:00:00.000Z");

// Internal enum values that are considered "legacy". satisfies ensures each
// element remains a valid AnalyticsIntegrationExportSource — catches renames or
// removals at compile time. Adding a new enum variant does NOT automatically
// produce an error here; the list must be reviewed manually.
export const LEGACY_BLOB_EXPORT_SOURCES = [
  AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
  AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
] as const satisfies ReadonlyArray<AnalyticsIntegrationExportSource>;

/**
 * Returns true when a project may use legacy blob export sources.
 * False means the project is post-cutoff Cloud and must use OBSERVATIONS_V2 (internal: EVENTS) only.
 *
 * Shared by the server guard (throws when false + legacy source) and the UI
 * (hides legacy dropdown options when false) so the predicate lives once.
 */
export function isLegacyBlobExportAllowed(
  projectCreatedAt: Date,
  isCloud: boolean,
): boolean {
  if (!isCloud) return true;
  return projectCreatedAt < LEGACY_BLOB_EXPORT_CUTOFF;
}

// Internal enum values whose export includes the enriched observations
// (events) path. satisfies ensures each element remains a valid
// AnalyticsIntegrationExportSource. Adding a new enum variant does NOT
// automatically produce an error here; the list must be reviewed manually.
export const ENRICHED_BLOB_EXPORT_SOURCES = [
  AnalyticsIntegrationExportSource.EVENTS,
  AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
] as const satisfies ReadonlyArray<AnalyticsIntegrationExportSource>;

export function isEnrichedBlobExportSource(
  source: AnalyticsIntegrationExportSource | null | undefined,
): boolean {
  return (
    source != null &&
    (
      ENRICHED_BLOB_EXPORT_SOURCES as readonly AnalyticsIntegrationExportSource[]
    ).includes(source)
  );
}

/** Whether the source reads the v3 traces/observations tables. */
export function isLegacyBlobExportSource(
  source: AnalyticsIntegrationExportSource | null | undefined,
): boolean {
  return (
    source != null &&
    (
      LEGACY_BLOB_EXPORT_SOURCES as readonly AnalyticsIntegrationExportSource[]
    ).includes(source)
  );
}

/**
 * Whether a blob storage integration row counts as legacy — i.e. may still use
 * legacy export sources. Applied to `BlobStorageIntegration.createdAt`.
 *
 * - `!isCloud` → `true`: self-hosted is exempt (cutoff does not apply).
 * - `null` createdAt → `false`: no existing row means a brand-new integration,
 *   which follows new-customer rules.
 * - otherwise legacy iff the row was created strictly before the cutoff.
 */
export function isLegacyBlobExporter(
  integrationCreatedAt: Date | null,
  isCloud: boolean,
): boolean {
  if (!isCloud) return true;
  if (integrationCreatedAt == null) return false;
  return integrationCreatedAt < LEGACY_BLOB_EXPORTER_CUTOFF;
}

/**
 * Whether this deployment has the enriched events export path.
 * True for Cloud, or for self-hosted instances that have opted into the V4 preview
 * via LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN (server-side only — pass the flag
 * from a server-computed context rather than reading it client-side).
 */
export function isEnrichedBlobExportAvailable(
  isCloud: boolean,
  isV4PreviewEnabled?: boolean,
): boolean {
  return isCloud || isV4PreviewEnabled === true;
}

/**
 * V4 write mode of the deployment. Mirrors the `LANGFUSE_MIGRATION_V4_WRITE_MODE`
 * enum owned by the env schemas; kept as a literal union here so this client-safe
 * file has no dependency on server env parsing.
 */
export type BlobExportWriteMode = "legacy" | "dual" | "events_only";

/**
 * Whether the deployment may still use legacy blob export sources
 * (`TRACES_OBSERVATIONS`, `TRACES_OBSERVATIONS_EVENTS`) based on data capability.
 *
 * Legacy sources read the v3 traces/observations tables. Those tables are written
 * while the deployment runs in `legacy` or `dual` write mode, but under
 * `events_only` they are no longer populated — so a legacy source would silently
 * export stale/empty data. Returns false in that case to force EVENTS.
 *
 * Deployment-agnostic and driven by write mode only: the data capability is what
 * matters, so Cloud and self-hosted follow the same rule. (Cloud does not run
 * `events_only` for this purpose today, so Cloud behavior is unaffected; if it
 * ever does, forcing EVENTS is the correct, self-consistent outcome.) The
 * date-based cutoffs above remain a separate, Cloud-only gate. Shared by the UI,
 * the server upsert asserts, and the worker guard so the predicate lives once
 * (LFE-10148).
 */
export function isLegacyBlobExportWriteModeAllowed(
  writeMode: BlobExportWriteMode,
): boolean {
  return writeMode !== "events_only";
}
