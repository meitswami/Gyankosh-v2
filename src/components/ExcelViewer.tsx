import { useState, useMemo } from 'react';
import { FileSpreadsheet, ChevronLeft, ChevronRight, Search, BarChart2, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { highlightText } from '@/lib/highlightText';
import type { ParsedExcel, ExcelSheet } from '@/lib/excelParser';
import { searchInExcel, getSheetStats } from '@/lib/excelParser';

interface ExcelViewerProps {
  excel: ParsedExcel;
  searchQuery?: string;
  onRequestVisualization?: (sheetName: string, columnIndices: number[]) => void;
}

export function ExcelViewer({ excel, searchQuery, onRequestVisualization }: ExcelViewerProps) {
  const [activeSheet, setActiveSheet] = useState(excel.sheets[0]?.name || '');
  const [localSearch, setLocalSearch] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<number[]>([]);

  const currentSheet = excel.sheets.find(s => s.name === activeSheet) || excel.sheets[0];
  const effectiveQuery = searchQuery || localSearch;

  const searchResults = useMemo(() => {
    if (!effectiveQuery.trim()) return [];
    return searchInExcel(excel, effectiveQuery);
  }, [excel, effectiveQuery]);

  const sheetStats = useMemo(() => {
    if (!currentSheet) return null;
    return getSheetStats(currentSheet);
  }, [currentSheet]);

  const toggleColumnSelection = (colIdx: number) => {
    setSelectedColumns(prev => 
      prev.includes(colIdx) 
        ? prev.filter(c => c !== colIdx)
        : [...prev, colIdx]
    );
  };

  const handleVisualize = () => {
    if (onRequestVisualization && selectedColumns.length > 0) {
      onRequestVisualization(activeSheet, selectedColumns);
    }
  };

  if (!currentSheet) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <FileSpreadsheet className="w-8 h-8 mr-2" />
        No data to display
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-green-600" />
          <span className="font-medium">{excel.fileName}</span>
          <Badge variant="secondary">{excel.sheets.length} sheets</Badge>
          <Badge variant="outline">{excel.totalCells.toLocaleString()} cells</Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search in Excel..."
              className="pl-8 w-48 h-8 text-sm"
            />
          </div>
          
          {selectedColumns.length > 0 && onRequestVisualization && (
            <Button size="sm" variant="outline" onClick={handleVisualize} className="gap-1">
              <BarChart2 className="w-4 h-4" />
              Visualize ({selectedColumns.length})
            </Button>
          )}
        </div>
      </div>

      {/* Search Results */}
      {effectiveQuery && searchResults.length > 0 && (
        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
          <p className="text-sm font-medium mb-2">
            Found {searchResults.length} matches for "{effectiveQuery}"
          </p>
          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
            {searchResults.slice(0, 20).map((result, idx) => (
              <Badge 
                key={idx} 
                variant="secondary" 
                className="cursor-pointer hover:bg-primary/20"
                onClick={() => setActiveSheet(result.sheet)}
              >
                📍 {result.sheet}!{result.cell}: {String(result.value).slice(0, 30)}
              </Badge>
            ))}
            {searchResults.length > 20 && (
              <Badge variant="outline">+{searchResults.length - 20} more</Badge>
            )}
          </div>
        </div>
      )}

      {/* Sheet Tabs */}
      <Tabs value={activeSheet} onValueChange={setActiveSheet}>
        <TabsList className="h-8">
          {excel.sheets.map((sheet) => (
            <TabsTrigger key={sheet.name} value={sheet.name} className="text-xs px-3 h-7">
              Sheet {sheet.index}: {sheet.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {excel.sheets.map((sheet) => (
          <TabsContent key={sheet.name} value={sheet.name} className="mt-3">
            {/* Stats */}
            {sheetStats && sheetStats.numericColumns.length > 0 && sheet.name === activeSheet && (
              <div className="mb-3 p-2 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Numeric columns (click to select for visualization):</p>
                <div className="flex flex-wrap gap-1">
                  {sheetStats.numericColumns.map((col) => (
                    <Badge 
                      key={col.index}
                      variant={selectedColumns.includes(col.index) ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => toggleColumnSelection(col.index)}
                    >
                      {col.name} (Σ {col.sum.toLocaleString()})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Data Table */}
            <ScrollArea className="h-64 border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-xs">#</TableHead>
                    {sheet.headers.map((header, idx) => (
                      <TableHead 
                        key={idx} 
                        className={`text-xs min-w-[100px] cursor-pointer hover:bg-muted/50 ${
                          selectedColumns.includes(idx) ? 'bg-primary/10' : ''
                        }`}
                        onClick={() => toggleColumnSelection(idx)}
                      >
                        {header || `Col ${idx + 1}`}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheet.data.slice(1, 51).map((row, rowIdx) => (
                    <TableRow key={rowIdx}>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {rowIdx + 2}
                      </TableCell>
                      {row?.map((cell, colIdx) => {
                        const cellValue = cell !== null && cell !== undefined ? String(cell) : '';
                        const isMatch = effectiveQuery && cellValue.toLowerCase().includes(effectiveQuery.toLowerCase());
                        
                        return (
                          <TableCell 
                            key={colIdx} 
                            className={`text-xs ${isMatch ? 'bg-yellow-100 dark:bg-yellow-900/30' : ''} ${
                              selectedColumns.includes(colIdx) ? 'bg-primary/5' : ''
                            }`}
                          >
                            {effectiveQuery ? highlightText(cellValue, effectiveQuery) : cellValue}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            
            {sheet.rowCount > 51 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Showing first 50 rows of {sheet.rowCount.toLocaleString()} total
              </p>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
