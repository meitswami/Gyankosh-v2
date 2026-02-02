import type { CellReference, ParsedExcel } from "@/lib/excelParser";

const truncate = (value: unknown, max = 80) => {
  const str = String(value ?? "");
  return str.length > max ? `${str.slice(0, max)}…` : str;
};

/**
 * Builds a compact text context for the AI so we don't upload the entire workbook on every query.
 * This improves speed dramatically for larger sheets.
 */
export function buildExcelAiContext(params: {
  excel: ParsedExcel;
  query: string;
  searchResults: CellReference[];
  maxChars?: number;
}) {
  const { excel, query, searchResults, maxChars = 28_000 } = params;

  const lines: string[] = [];
  lines.push(`Excel file: "${excel.fileName}"`);
  lines.push(`Sheets: ${excel.sheets.length}`);
  lines.push(`User question: ${query}`);

  // Direct matches (most useful for precise Q&A)
  if (searchResults.length) {
    lines.push("\nDirect matches (top results):");
    for (const r of searchResults.slice(0, 12)) {
      lines.push(`- ${r.sheet}!${r.cell} = ${truncate(r.value, 120)}`);
    }
  }

  // Sheet summaries + small samples
  for (const sheet of excel.sheets) {
    lines.push(`\n=== Sheet "${sheet.name}" (rows=${sheet.rowCount}, cols=${sheet.colCount}) ===`);
    if (sheet.headers?.length) {
      lines.push(`Headers: ${sheet.headers.slice(0, 20).map(h => truncate(h, 40)).join(" | ")}${sheet.headers.length > 20 ? " | …" : ""}`);
    }

    // Sample first rows (helps "what is this data" / summary)
    const sampleRowCount = Math.min(8, sheet.data.length);
    if (sampleRowCount > 0) {
      lines.push("Sample rows:");
      for (let i = 0; i < sampleRowCount; i++) {
        const row = sheet.data[i] ?? [];
        const rowText = row.slice(0, 18).map(v => truncate(v, 40)).join(" | ");
        lines.push(`Row ${i + 1}: ${rowText}${row.length > 18 ? " | …" : ""}`);
      }
    }

    // Include the matched rows for this sheet (very helpful for accuracy)
    const matchedRows = new Set(
      searchResults
        .filter(r => r.sheet === sheet.name)
        .slice(0, 10)
        .map(r => r.row),
    );

    if (matchedRows.size) {
      lines.push("Matched rows (expanded):");
      for (const rowNum of Array.from(matchedRows).slice(0, 6)) {
        const idx = rowNum - 1;
        const row = sheet.data[idx] ?? [];
        const rowText = row.slice(0, 18).map(v => truncate(v, 60)).join(" | ");
        lines.push(`Row ${rowNum}: ${rowText}${row.length > 18 ? " | …" : ""}`);
      }
    }

    // Soft cap while building
    if (lines.join("\n").length > maxChars) break;
  }

  const full = lines.join("\n");
  return full.length > maxChars ? full.slice(0, maxChars) : full;
}

/**
 * We cannot provide an exact time (depends on network + AI service),
 * but we can provide a much more realistic ETA based on payload size.
 */
export function estimateExcelAnalysisSeconds(params: {
  contextChars: number;
  sheetCount: number;
}) {
  const { contextChars, sheetCount } = params;

  // Heuristic tuned for typical AI latency + streaming.
  const sizeFactor = Math.ceil(contextChars / 6000); // ~1 per 6k chars
  const sheetFactor = Math.ceil(sheetCount * 0.6);
  const estimate = 6 + sizeFactor + sheetFactor;

  // Clamp to avoid unrealistic numbers.
  return Math.max(8, Math.min(60, estimate));
}
