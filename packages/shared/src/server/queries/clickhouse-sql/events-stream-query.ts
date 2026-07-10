import type { FilterCondition } from "../../../types";
import type { TracingSearchType } from "../../../interfaces/search";
import {
  type OrderByState,
  normalizeOrderByForTable,
} from "../../../interfaces/orderBy";
import { eventsTableUiColumnDefinitions } from "../../tableMappings/mapEventsTable";
import type { EventsQueryBuilder, OrderByEntry } from "./event-query-builder";
import {
  buildEventsObservationRowSelection,
  buildEventsObservationRowSelectionForBlobExport,
  groupEventsObservationFilters,
} from "./events-observation-row-selection";
import { orderByToEntries } from "./orderby-factory";

export type EventsStreamQueryInput = {
  projectId: string;
  cutoffCreatedAt?: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  orderBy?: OrderByState;
  rowLimit: number;
};

export type EventsStreamQuery = {
  queryBuilder: EventsQueryBuilder;
  eventOnlyFilters: FilterCondition[];
};

export const getEventsOrderByEntries = (
  orderBy?: OrderByState,
): OrderByEntry[] => {
  const normalizedOrderBy = normalizeOrderByForTable({
    orderBy: orderBy ?? null,
    expectedTimeColumn: "startTime",
  });
  const mappedEntries = orderByToEntries(
    normalizedOrderBy,
    eventsTableUiColumnDefinitions,
  );
  const entries =
    mappedEntries.length > 0
      ? mappedEntries
      : [{ column: "e.start_time", direction: "DESC" as const }];

  return entries.some(
    (entry) => entry.column.replaceAll('"', "") === "e.span_id",
  )
    ? entries
    : [...entries, { column: "e.span_id", direction: entries[0].direction }];
};

/**
 * Builds the common event selection used by streaming consumers.
 *
 * The returned builder is intentionally unprojected so each consumer can
 * select its own row shape. Callers must add a field set or raw selection
 * before building the query.
 *
 * Score filters are applied by the shared row-selection planner. Comment
 * filters must be resolved to event IDs before reaching this builder.
 */
const buildEventsStreamQueryInternal = (
  {
    projectId,
    cutoffCreatedAt,
    filter,
    searchQuery,
    searchType,
    orderBy,
    rowLimit,
  }: EventsStreamQueryInput,
  buildRowSelection: typeof buildEventsObservationRowSelection,
): EventsStreamQuery => {
  const originalFilterGroups = groupEventsObservationFilters(filter);
  const filterConditions: FilterCondition[] = [...(filter ?? [])];
  if (cutoffCreatedAt) {
    filterConditions.push({
      column: "startTime",
      operator: "<",
      value: cutoffCreatedAt,
      type: "datetime",
    });
  }

  const { queryBuilder } = buildRowSelection({
    projectId,
    filter: filterConditions,
    searchQuery,
    searchType,
  });

  const orderByEntries = getEventsOrderByEntries(orderBy);
  queryBuilder
    .whereRaw("e.is_deleted = 0")
    .orderByColumns(orderByEntries)
    .limitBy("e.span_id", "e.project_id")
    .limit(rowLimit);

  return {
    queryBuilder,
    eventOnlyFilters: originalFilterGroups.events,
  };
};

export const buildEventsStreamQuery = (
  input: EventsStreamQueryInput,
): EventsStreamQuery =>
  buildEventsStreamQueryInternal(input, buildEventsObservationRowSelection);

/**
 * Builds the blob-export selection, including its observation-score projection
 * and the matching aggregation source.
 */
export const buildEventsBlobExportStreamQuery = (
  input: EventsStreamQueryInput,
): EventsStreamQuery => {
  const result = buildEventsStreamQueryInternal(
    input,
    buildEventsObservationRowSelectionForBlobExport,
  );

  result.queryBuilder
    .selectFieldSet("export")
    .selectIO(false) // Full I/O, no truncation
    .selectMetadataExpanded(); // Full metadata values from events_full

  return result;
};
