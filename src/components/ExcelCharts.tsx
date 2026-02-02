import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ParsedExcel, ExcelSheet } from '@/lib/excelParser';
import { prepareChartData } from '@/lib/excelParser';

interface ExcelChartsProps {
  excel: ParsedExcel;
  sheetName: string;
  valueColumns: number[];
  labelColumn?: number;
  title?: string;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-1, 220 70% 50%))',
  'hsl(var(--chart-2, 160 60% 45%))',
  'hsl(var(--chart-3, 30 80% 55%))',
  'hsl(var(--chart-4, 280 65% 60%))',
  'hsl(var(--chart-5, 340 75% 55%))',
];

export function ExcelCharts({ 
  excel, 
  sheetName, 
  valueColumns, 
  labelColumn = 0,
  title 
}: ExcelChartsProps) {
  const sheet = excel.sheets.find(s => s.name === sheetName);
  
  const chartData = useMemo(() => {
    if (!sheet) return [];
    return prepareChartData(sheet, labelColumn, valueColumns);
  }, [sheet, labelColumn, valueColumns]);

  const valueKeys = useMemo(() => {
    if (!sheet) return [];
    return valueColumns.map(idx => sheet.headers[idx] || `Value ${idx + 1}`);
  }, [sheet, valueColumns]);

  if (!sheet || chartData.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground">
          No data available for visualization
        </CardContent>
      </Card>
    );
  }

  // Prepare pie data for single value column
  const pieData = valueColumns.length === 1 
    ? chartData.slice(0, 10).map((item, idx) => ({
        name: item.name,
        value: typeof item[valueKeys[0]] === 'number' ? item[valueKeys[0]] : 0,
        fill: COLORS[idx % COLORS.length],
      }))
    : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {title || `Chart: ${sheetName}`}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="bar" className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-8">
            <TabsTrigger value="bar" className="text-xs">Bar</TabsTrigger>
            <TabsTrigger value="line" className="text-xs">Line</TabsTrigger>
            <TabsTrigger value="area" className="text-xs">Area</TabsTrigger>
            {valueColumns.length === 1 && (
              <TabsTrigger value="pie" className="text-xs">Pie</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="bar" className="mt-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.slice(0, 20)}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                {valueKeys.map((key, idx) => (
                  <Bar 
                    key={key} 
                    dataKey={key} 
                    fill={COLORS[idx % COLORS.length]}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="line" className="mt-4">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData.slice(0, 50)}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                {valueKeys.map((key, idx) => (
                  <Line 
                    key={key} 
                    type="monotone"
                    dataKey={key} 
                    stroke={COLORS[idx % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="area" className="mt-4">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData.slice(0, 50)}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                {valueKeys.map((key, idx) => (
                  <Area 
                    key={key} 
                    type="monotone"
                    dataKey={key} 
                    fill={COLORS[idx % COLORS.length]}
                    fillOpacity={0.3}
                    stroke={COLORS[idx % COLORS.length]}
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>

          {valueColumns.length === 1 && (
            <TabsContent value="pie" className="mt-4">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
