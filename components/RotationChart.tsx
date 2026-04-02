"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";

const lineColors = ["#2563eb", "#7c3aed", "#f59e0b", "#dc2626"];

export function RotationChart({
  result,
  caseInput,
}: {
  result: DeviceAnalysisResult;
  caseInput: CaseInput;
}) {
  const roundFenestrations = caseInput.fenestrations.filter(
    (fenestration) => fenestration.ftype !== "SCALLOP",
  );

  if (!roundFenestrations.length) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Rotation analysis</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-[color:var(--muted-foreground)]">
          Only scallops are present, so every rotation is valid and no strut
          conflict scan is required.
        </CardContent>
      </Card>
    );
  }

  const threshold = Math.max(
    ...roundFenestrations.map(
      (fenestration) =>
        Math.max(fenestration.widthMm, fenestration.heightMm) / 2 +
        result.device.wireRadius,
    ),
  );
  const chartData = result.rotation.scanData
    .filter((_, index, data) => index % 4 === 0 || index === data.length - 1)
    .map((point) => {
      const row: Record<string, number | boolean> = {
        rotationDeg: point.deltaDeg,
        allClear: point.allClear,
      };
      roundFenestrations.forEach((fenestration, index) => {
        row[fenestration.vessel] = point.distPerFen[index];
      });
      return row;
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rotation analysis</CardTitle>
      </CardHeader>
      <CardContent className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(16, 33, 31, 0.08)" strokeDasharray="3 3" />
            <XAxis
              dataKey="rotationDeg"
              tickFormatter={(value) => `${Number(value).toFixed(0)}°`}
              stroke="#45605b"
            />
            <YAxis
              width={42}
              tickFormatter={(value) => `${Number(value).toFixed(0)}`}
              stroke="#45605b"
            />
            <Tooltip
              formatter={(value) => {
                const numericValue =
                  typeof value === "number" ? value : Number(value);
                return Number.isFinite(numericValue)
                  ? `${numericValue.toFixed(2)} mm`
                  : String(value ?? "");
              }}
              labelFormatter={(value) => `Rotation ${Number(value).toFixed(1)}°`}
            />
            <Legend />
            {result.rotation.validWindows.map((window, index) => (
              <ReferenceArea
                key={`${window.startDeg}-${window.endDeg}-${index}`}
                x1={window.startDeg}
                x2={window.endDeg}
                fill="rgba(15, 118, 110, 0.12)"
              />
            ))}
            <ReferenceLine
              y={threshold}
              label="Safe threshold"
              stroke="#dc2626"
              strokeDasharray="5 5"
            />
            {roundFenestrations.map((fenestration, index) => (
              <Line
                key={fenestration.vessel}
                dataKey={fenestration.vessel}
                type="monotone"
                dot={false}
                strokeWidth={2}
                stroke={lineColors[index % lineColors.length]}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
