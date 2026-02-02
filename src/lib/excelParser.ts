import * as XLSX from 'xlsx';

export interface CellReference {
  sheet: string;
  sheetIndex: number;
  cell: string;
  value: string | number | boolean | null;
  row: number;
  col: number;
}

export interface ExcelSheet {
  name: string;
  index: number;
  data: (string | number | boolean | null)[][];
  headers: string[];
  rowCount: number;
  colCount: number;
}

export interface ParsedExcel {
  fileName: string;
  sheets: ExcelSheet[];
  totalCells: number;
  searchableContent: string;
}

/**
 * Parse an Excel file and extract all data with cell references
 */
export async function parseExcelFile(file: File): Promise<ParsedExcel> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  
  const sheets: ExcelSheet[] = [];
  let totalCells = 0;
  let searchableContent = '';

  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, { 
      header: 1,
      defval: null 
    });
    
    const headers = jsonData[0]?.map(h => String(h || '')) || [];
    const rowCount = jsonData.length;
    const colCount = Math.max(...jsonData.map(row => row?.length || 0), 0);
    
    totalCells += rowCount * colCount;

    // Build searchable content with cell references
    searchableContent += `\n=== Sheet ${sheetIndex + 1}: "${sheetName}" ===\n`;
    
    jsonData.forEach((row, rowIdx) => {
      if (row && row.length > 0) {
        row.forEach((cell, colIdx) => {
          if (cell !== null && cell !== undefined && cell !== '') {
            const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
            searchableContent += `[${sheetName}!${cellRef}] ${cell}\n`;
          }
        });
      }
    });

    sheets.push({
      name: sheetName,
      index: sheetIndex + 1,
      data: jsonData as (string | number | boolean | null)[][],
      headers,
      rowCount,
      colCount,
    });
  });

  return {
    fileName: file.name,
    sheets,
    totalCells,
    searchableContent,
  };
}

/**
 * Search for a value across all sheets and return cell references
 */
export function searchInExcel(
  parsedExcel: ParsedExcel, 
  query: string
): CellReference[] {
  const results: CellReference[] = [];
  const lowerQuery = query.toLowerCase();

  parsedExcel.sheets.forEach((sheet) => {
    sheet.data.forEach((row, rowIdx) => {
      if (row) {
        row.forEach((cell, colIdx) => {
          if (cell !== null && cell !== undefined) {
            const cellStr = String(cell).toLowerCase();
            if (cellStr.includes(lowerQuery)) {
              const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
              results.push({
                sheet: sheet.name,
                sheetIndex: sheet.index,
                cell: cellRef,
                value: cell,
                row: rowIdx + 1,
                col: colIdx + 1,
              });
            }
          }
        });
      }
    });
  });

  return results;
}

/**
 * Get column data for visualization
 */
export function getColumnData(
  parsedExcel: ParsedExcel,
  sheetName: string,
  columnIndex: number
): { header: string; values: (string | number)[] } {
  const sheet = parsedExcel.sheets.find(s => s.name === sheetName);
  if (!sheet) return { header: '', values: [] };

  const header = sheet.headers[columnIndex] || `Column ${columnIndex + 1}`;
  const values: (string | number)[] = [];

  sheet.data.forEach((row, idx) => {
    if (idx > 0 && row && row[columnIndex] !== null && row[columnIndex] !== undefined) {
      const val = row[columnIndex];
      if (typeof val === 'number' || typeof val === 'string') {
        values.push(val);
      }
    }
  });

  return { header, values };
}

/**
 * Get summary statistics for numeric columns
 */
export function getSheetStats(sheet: ExcelSheet): {
  numericColumns: { name: string; index: number; min: number; max: number; avg: number; sum: number }[];
} {
  const numericColumns: { name: string; index: number; min: number; max: number; avg: number; sum: number }[] = [];

  sheet.headers.forEach((header, colIdx) => {
    const numericValues: number[] = [];
    
    sheet.data.forEach((row, rowIdx) => {
      if (rowIdx > 0 && row && typeof row[colIdx] === 'number') {
        numericValues.push(row[colIdx] as number);
      }
    });

    if (numericValues.length > 0) {
      const sum = numericValues.reduce((a, b) => a + b, 0);
      numericColumns.push({
        name: header || `Column ${colIdx + 1}`,
        index: colIdx,
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
        avg: sum / numericValues.length,
        sum,
      });
    }
  });

  return { numericColumns };
}

/**
 * Convert Excel data to format suitable for charts
 */
export function prepareChartData(
  sheet: ExcelSheet,
  labelColumn: number,
  valueColumns: number[]
): { name: string; [key: string]: string | number }[] {
  const chartData: { name: string; [key: string]: string | number }[] = [];

  sheet.data.forEach((row, idx) => {
    if (idx > 0 && row) {
      const dataPoint: { name: string; [key: string]: string | number } = {
        name: String(row[labelColumn] || `Row ${idx + 1}`),
      };

      valueColumns.forEach((colIdx) => {
        const header = sheet.headers[colIdx] || `Value ${colIdx + 1}`;
        const value = row[colIdx];
        if (typeof value === 'number') {
          dataPoint[header] = value;
        } else if (value !== null && value !== undefined) {
          const num = parseFloat(String(value));
          if (!isNaN(num)) {
            dataPoint[header] = num;
          }
        }
      });

      chartData.push(dataPoint);
    }
  });

  return chartData;
}
