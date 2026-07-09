import {
  type BlobExportWriteMode,
  InvalidRequestError,
  isLegacyBlobExporter,
  LEGACY_BLOB_EXPORT_SOURCES,
  LEGACY_BLOB_EXPORTER_CUTOFF,
} from "@langfuse/shared";
import { type AnalyticsIntegrationExportSource } from "@langfuse/shared/src/db";
import { assertLegacyBlobExportSourceAllowed } from "@/src/features/blobstorage-integration/server/assertLegacyBlobExportSourceAllowed";

/**
 * Write-time gate for blob storage upserts, shared by the tRPC and REST paths.
 * Composes the project-level gate (`assertLegacyBlobExportSourceAllowed`) with
 * the integration-level cutoff: a row may only keep using a legacy export source
 * if its own `createdAt` predates `LEGACY_BLOB_EXPORTER_CUTOFF`.
 *
 * `existingIntegration` is `null` for a brand-new integration, which is treated
 * as non-legacy (new-customer rules) by `isLegacyBlobExporter`.
 *
 * Two independent gates apply here:
 * - The DATE-BASED cutoffs are Cloud-only, permanently — keyed on `isCloud`
 *   directly, so self-hosted stays exempt even with the V4 preview enabled.
 * - The WRITE-MODE (data-capability) gate is deployment-agnostic: it refuses
 *   legacy sources under `events_only` on both Cloud and self-hosted, because the
 *   v3 traces/observations tables are no longer written then. This is enforced
 *   inside `assertLegacyBlobExportSourceAllowed` via the `writeMode` arg
 *   (LFE-10148). See blob-export-gate.ts for the recorded policy.
 */
export function assertLegacyBlobExportSourceAllowedForUpsert({
  project,
  existingIntegration,
  nextInternalExportSource,
  isCloud,
  writeMode,
}: {
  project: { createdAt: Date };
  existingIntegration: { createdAt: Date } | null;
  nextInternalExportSource: AnalyticsIntegrationExportSource;
  isCloud: boolean;
  writeMode: BlobExportWriteMode;
}): void {
  // Project-level gate first (shared with REST). Throws on a post-cutoff Cloud
  // project + legacy source, or on any deployment running events_only.
  assertLegacyBlobExportSourceAllowed({
    project,
    nextInternalExportSource,
    isCloud,
    writeMode,
  });

  if (
    !(LEGACY_BLOB_EXPORT_SOURCES as ReadonlyArray<string>).includes(
      nextInternalExportSource,
    )
  )
    return; // OBSERVATIONS_V2 (internal: EVENTS) is always allowed.

  if (isLegacyBlobExporter(existingIntegration?.createdAt ?? null, isCloud))
    return;

  // Distinct message from the project-level gate so the two rejection paths can
  // be counted separately in logs. Customer-facing via the public REST PUT
  // (the UI prevents this state in the form flow). The date is read from the
  // constant so a cutoff override stays accurate.
  throw new InvalidRequestError(
    `Legacy export sources are not available for blob storage integrations created on or after ${LEGACY_BLOB_EXPORTER_CUTOFF.toISOString()} on Cloud. Use 'OBSERVATIONS_V2' instead.`,
  );
}
