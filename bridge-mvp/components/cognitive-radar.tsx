"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  type BaseTickContentProps,
} from "recharts";
import { useTelemetry } from "@/lib/telemetry-context";

const STROKE = "#d2f25a";

function axisLines(label: string) {
  const parenthetical = label.match(/^(.*?)\s*(\([^)]+\))$/);
  if (!parenthetical) return label.split(/\s+/);

  const head = parenthetical[1].trim();
  const tail = parenthetical[2];
  return head ? [...head.split(/\s+/), tail] : [tail];
}

function AxisTick({
  x = 0,
  y = 0,
  payload,
  textAnchor = "middle",
}: BaseTickContentProps) {
  const lines = axisLines(String(payload?.value ?? ""));

  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      fill="#d2f25a"
      fontSize={11}
      fontFamily="var(--font-mono), ui-monospace, monospace"
    >
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? 0 : 13}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function CognitiveRadar() {
  const { radar, campaignAxes } = useTelemetry();
  const data = campaignAxes.map((axis) => ({
    axis,
    value: radar[axis] ?? 0,
  }));

  return (
    <div className="h-full min-h-0 w-full rounded-3xl border border-white/[0.06] bg-card">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart
          data={data}
          cx="50%"
          cy="50%"
          outerRadius="68%"
          margin={{ top: 36, right: 96, bottom: 36, left: 96 }}
        >
          <PolarGrid stroke="rgba(255, 255, 255, 0.12)" />
          <PolarAngleAxis dataKey="axis" tick={AxisTick} />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{
              fill: "#64748b",
              fontSize: 11,
              fontFamily: "var(--font-mono), ui-monospace, monospace",
            }}
            stroke="rgba(255, 255, 255, 0.16)"
          />
          <Radar
            name="MindPrint"
            dataKey="value"
            stroke={STROKE}
            fill={STROKE}
            fillOpacity={0.28}
            strokeWidth={1.5}
            dot={{ r: 2.5, fill: STROKE, stroke: "#18181b" }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
