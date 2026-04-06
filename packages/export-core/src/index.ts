export type ExportSource = "local-answer-api" | "youtube-comment-api";

export type ExportExtension = "json" | "jsonl" | "csv";

export interface ExportEnvelope<TMeta extends Record<string, unknown>, TRecord> {
  exportedAt: string;
  source: ExportSource;
  exportKind: string;
  eventId: string;
  meta: TMeta;
  records: TRecord[];
}

export function createExportEnvelope<TMeta extends Record<string, unknown>, TRecord>(input: {
  exportedAt: string;
  source: ExportSource;
  exportKind: string;
  eventId: string;
  meta: TMeta;
  records: TRecord[];
}): ExportEnvelope<TMeta, TRecord> {
  return {
    exportedAt: input.exportedAt,
    source: input.source,
    exportKind: input.exportKind,
    eventId: input.eventId,
    meta: input.meta,
    records: input.records
  };
}

export function createExportFilename(input: {
  eventId: string;
  exportKind: string;
  exportedAt: string;
  extension?: ExportExtension;
}) {
  const extension = input.extension ?? "json";
  const normalizedTimestamp = input.exportedAt.replace(/[:.]/g, "-");
  return `${input.eventId}-${input.exportKind}-${normalizedTimestamp}.${extension}`;
}
