import {
  type BlobExportWriteMode,
  InvalidRequestError,
  isLegacyBlobExportAllowed,
  isLegacyBlobExportWriteModeAllowed,
  LEGACY_BLOB_EXPORT_SOURCES,
} from "@langfuse/shared";
import { type AnalyticsIntegrationExportSource } from "@langfuse/shared/src/db";

export function assertLegacyBlobExportSourceAllowed({
  project,
  nextInternalExportSource,
  isCloud,
  writeMode,
}: {
  project: { createdAt: Date };
  nextInternalExportSource: AnalyticsIntegrationExportSource;
  isCloud: boolean;
  writeMode: BlobExportWriteMode;
}): void {
  if (
    !(LEGACY_BLOB_EXPORT_SOURCES as ReadonlyArray<string>).includes(
      nextInternalExportSource,
    )
  )
    return; // OBSERVATIONS_V2 (internal: EVENTS) is always allowed.

  // Data-capability gate (deployment-agnostic): under events_only the v3
  // traces/observations tables are no longer written, so a legacy source would
  // export stale/empty data. Operator-facing message — self-hosted operators own
  // this env var (LFE-10148).
  if (!isLegacyBlobExportWriteModeAllowed(writeMode)) {
    throw new InvalidRequestError(
      "Legacy export sources are not available while LANGFUSE_MIGRATION_V4_WRITE_MODE=events_only, because the legacy traces/observations tables are no longer written. Use 'OBSERVATIONS_V2' instead.",
    );
  }

  if (isLegacyBlobExportAllowed(project.createdAt, isCloud)) return;

  throw new InvalidRequestError(
    "Legacy export sources are not available for Cloud projects created on or after 2026-05-20. Use 'OBSERVATIONS_V2' instead.",
  );
}
