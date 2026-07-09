import { AnalyticsIntegrationExportSource } from "@langfuse/shared";

import {
  getExportSourceFormValue,
  getExportSourceOptions,
  isExportSourceSelectable,
  shouldHideExportSourceSelector,
} from "./exportSource";

const cloudPreCutoff = {
  eventsExportAvailable: true,
  forceEventsExport: false,
};
const cloudPostCutoff = {
  eventsExportAvailable: true,
  forceEventsExport: true,
};
const selfHostedWithPreview = {
  eventsExportAvailable: true,
  forceEventsExport: false,
};
const selfHostedRolledBack = {
  eventsExportAvailable: false,
  forceEventsExport: false,
};
// Self-hosted events_only: v3 tables are no longer written, so legacy sources
// are forced to EVENTS by write-mode capability (LFE-10148). Enriched stays
// available (events_only requires the V4 preview opt-in).
const selfHostedEventsOnly = {
  eventsExportAvailable: true,
  forceEventsExport: true,
};
// Self-hosted legacy/dual with the enriched preview enabled: everything stays
// selectable — legacy is not forced because the v3 tables are still written.
const selfHostedLegacyOrDual = {
  eventsExportAvailable: true,
  forceEventsExport: false,
};

describe("getExportSourceFormValue", () => {
  it("keeps a persisted enriched value when enriched export is unavailable (LFE-10296)", () => {
    // Regression: the form used to substitute TRACES_OBSERVATIONS here, so any
    // save silently overwrote the persisted enriched configuration.
    expect(
      getExportSourceFormValue(
        AnalyticsIntegrationExportSource.EVENTS,
        selfHostedRolledBack,
      ),
    ).toBe(AnalyticsIntegrationExportSource.EVENTS);
    expect(
      getExportSourceFormValue(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
        selfHostedRolledBack,
      ),
    ).toBe(AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS);
  });

  it("keeps any persisted value regardless of deployment state", () => {
    for (const persisted of Object.values(AnalyticsIntegrationExportSource)) {
      for (const availability of [
        cloudPreCutoff,
        cloudPostCutoff,
        selfHostedWithPreview,
        selfHostedRolledBack,
      ]) {
        expect(getExportSourceFormValue(persisted, availability)).toBe(
          persisted,
        );
      }
    }
  });

  it("defaults new configurations to EVENTS when enriched export is available", () => {
    expect(getExportSourceFormValue(undefined, cloudPreCutoff)).toBe(
      AnalyticsIntegrationExportSource.EVENTS,
    );
    expect(getExportSourceFormValue(undefined, cloudPostCutoff)).toBe(
      AnalyticsIntegrationExportSource.EVENTS,
    );
    expect(getExportSourceFormValue(null, selfHostedWithPreview)).toBe(
      AnalyticsIntegrationExportSource.EVENTS,
    );
  });

  it("defaults new configurations to TRACES_OBSERVATIONS when enriched export is unavailable", () => {
    expect(getExportSourceFormValue(undefined, selfHostedRolledBack)).toBe(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    );
  });

  it("defaults new configurations to EVENTS on self-hosted events_only (LFE-10148)", () => {
    expect(getExportSourceFormValue(undefined, selfHostedEventsOnly)).toBe(
      AnalyticsIntegrationExportSource.EVENTS,
    );
    expect(getExportSourceFormValue(null, selfHostedEventsOnly)).toBe(
      AnalyticsIntegrationExportSource.EVENTS,
    );
  });

  it("keeps a persisted legacy value on self-hosted events_only (blocked save, not rewritten)", () => {
    expect(
      getExportSourceFormValue(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
        selfHostedEventsOnly,
      ),
    ).toBe(AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS);
  });
});

describe("isExportSourceSelectable", () => {
  it("rejects enriched sources when enriched export is unavailable", () => {
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.EVENTS,
        selfHostedRolledBack,
      ),
    ).toBe(false);
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
        selfHostedRolledBack,
      ),
    ).toBe(false);
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
        selfHostedRolledBack,
      ),
    ).toBe(true);
  });

  it("rejects legacy sources on post-cutoff Cloud projects", () => {
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
        cloudPostCutoff,
      ),
    ).toBe(false);
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
        cloudPostCutoff,
      ),
    ).toBe(false);
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.EVENTS,
        cloudPostCutoff,
      ),
    ).toBe(true);
  });

  it("accepts all sources when enriched export is available and legacy is allowed", () => {
    for (const source of Object.values(AnalyticsIntegrationExportSource)) {
      expect(isExportSourceSelectable(source, cloudPreCutoff)).toBe(true);
      expect(isExportSourceSelectable(source, selfHostedWithPreview)).toBe(
        true,
      );
      // Self-hosted legacy/dual: legacy stays selectable (v3 tables still written).
      expect(isExportSourceSelectable(source, selfHostedLegacyOrDual)).toBe(
        true,
      );
    }
  });

  it("rejects legacy sources on self-hosted events_only, keeps EVENTS (LFE-10148)", () => {
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
        selfHostedEventsOnly,
      ),
    ).toBe(false);
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
        selfHostedEventsOnly,
      ),
    ).toBe(false);
    expect(
      isExportSourceSelectable(
        AnalyticsIntegrationExportSource.EVENTS,
        selfHostedEventsOnly,
      ),
    ).toBe(true);
  });
});

describe("getExportSourceOptions", () => {
  it("offers all sources when everything is available", () => {
    const options = getExportSourceOptions(undefined, cloudPreCutoff);
    expect(options.map((o) => o.value)).toEqual([
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
      AnalyticsIntegrationExportSource.EVENTS,
    ]);
    expect(options.every((o) => !o.unavailable)).toBe(true);
  });

  it("offers only the legacy source on a rolled-back self-hosted deployment", () => {
    const options = getExportSourceOptions(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      selfHostedRolledBack,
    );
    expect(options.map((o) => o.value)).toEqual([
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    ]);
    expect(options[0].unavailable).toBe(false);
  });

  it("offers only EVENTS for post-cutoff Cloud projects", () => {
    const options = getExportSourceOptions(undefined, cloudPostCutoff);
    expect(options.map((o) => o.value)).toEqual([
      AnalyticsIntegrationExportSource.EVENTS,
    ]);
  });

  it("marks a persisted legacy source unavailable on self-hosted events_only (LFE-10148)", () => {
    const options = getExportSourceOptions(
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      selfHostedEventsOnly,
    );
    // Persisted legacy source surfaces as a visible unavailable option, never
    // silently rewritten; EVENTS stays selectable.
    expect(
      options.find(
        (o) => o.value === AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      )?.unavailable,
    ).toBe(true);
    expect(
      options.find((o) => o.value === AnalyticsIntegrationExportSource.EVENTS)
        ?.unavailable,
    ).toBe(false);
  });

  it("includes a stale persisted enriched source, marked unavailable (LFE-10296)", () => {
    const options = getExportSourceOptions(
      AnalyticsIntegrationExportSource.EVENTS,
      selfHostedRolledBack,
    );
    expect(options.map((o) => o.value)).toEqual([
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      AnalyticsIntegrationExportSource.EVENTS,
    ]);
    expect(
      options.find((o) => o.value === AnalyticsIntegrationExportSource.EVENTS)
        ?.unavailable,
    ).toBe(true);
    expect(
      options.find(
        (o) => o.value === AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
      )?.unavailable,
    ).toBe(false);
  });
});

describe("shouldHideExportSourceSelector", () => {
  it("hides the selector when there is exactly one selectable source", () => {
    // Post-cutoff Cloud project: EVENTS only.
    expect(
      shouldHideExportSourceSelector(
        getExportSourceOptions(undefined, cloudPostCutoff),
      ),
    ).toBe(true);
    // Rolled-back self-hosted with a persisted legacy source: legacy only.
    expect(
      shouldHideExportSourceSelector(
        getExportSourceOptions(
          AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
          selfHostedRolledBack,
        ),
      ),
    ).toBe(true);
  });

  it("keeps the selector when there is a real choice", () => {
    expect(
      shouldHideExportSourceSelector(
        getExportSourceOptions(undefined, cloudPreCutoff),
      ),
    ).toBe(false);
    // Stale persisted enriched source alongside the legacy fallback.
    expect(
      shouldHideExportSourceSelector(
        getExportSourceOptions(
          AnalyticsIntegrationExportSource.EVENTS,
          selfHostedRolledBack,
        ),
      ),
    ).toBe(false);
  });

  it("keeps the selector when the sole option is the stale persisted source", () => {
    // The unavailable-source alert points at the selector; hiding it here
    // would strand the user with a blocked save and nothing to change.
    const options = getExportSourceOptions(
      AnalyticsIntegrationExportSource.EVENTS,
      { eventsExportAvailable: false, forceEventsExport: true },
    );
    expect(options).toHaveLength(1);
    expect(options[0].unavailable).toBe(true);
    expect(shouldHideExportSourceSelector(options)).toBe(false);
  });
});
