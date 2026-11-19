"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { HourPoint } from "@/lib/dashboard";
import { CHART_COLORS } from "@/lib/format";
import { useIsClient } from "@/hooks/use-is-client";

// Charts format times in the viewer's timezone, so they render only on the client.

const rateConfig = { rate: { label: "Landing rate", color: CHART_COLORS.good } } satisfies ChartConfig;

export function LandingRateChart({ data, range }: { data: HourPoint[]; range: "24h" | "7d" }) {
  const mounted = useIsClient();
  if (!mounted) return <div className="h-64" />;

  const tick = (iso: string) => {
    const d = new Date(iso);
    return range === "24h"
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { weekday: "short", day: "numeric" });
  };

  return (
    <ChartContainer config={rateConfig} className="aspect-auto h-64 w-full">
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="hour"
          tickLine={false}
          axisLine={false}
          minTickGap={range === "24h" ? 32 : 48}
          tickFormatter={tick}
          interval={range === "7d" ? 5 : "preserveStartEnd"}
        />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => `${v}%`} />
        <ReferenceLine y={95} stroke={CHART_COLORS.good} strokeDasharray="4 4" strokeOpacity={0.5} />
        <ReferenceLine y={85} stroke={CHART_COLORS.warn} strokeDasharray="4 4" strokeOpacity={0.5} />
        <ChartTooltip
          cursor={false}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as HourPoint | undefined;
            if (!active || !p) return null;
            const d = new Date(p.hour);
            return (
              <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
                <div className="mb-1 font-medium">
                  {d.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
                <div>Landing rate: {p.rate === null ? "no data" : `${p.rate.toFixed(1)}%`}</div>
                <div className="text-muted-foreground">
                  {p.success} landed · {p.failed} failed · {p.expired} expired
                </div>
              </div>
            );
          }}
        />
        <Line
          dataKey="rate"
          type="monotone"
          stroke="var(--color-rate)"
          strokeWidth={2}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

const failuresConfig = { count: { label: "Transactions", color: CHART_COLORS.bad } } satisfies ChartConfig;

export function FailuresChart({ data }: { data: { name: string; count: number; expired: boolean }[] }) {
  const mounted = useIsClient();
  if (!mounted) return <div style={{ height: Math.max(120, data.length * 40) }} />;
  return (
    <ChartContainer config={failuresConfig} className="aspect-auto w-full" style={{ height: Math.max(120, data.length * 40) }}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={150} />
        <ChartTooltip
          cursor={false}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as { name: string; count: number } | undefined;
            if (!active || !p) return null;
            return (
              <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
                {p.name}: <span className="font-medium">{p.count.toLocaleString()}</span>
              </div>
            );
          }}
        />
        <Bar dataKey="count" radius={4} isAnimationActive={false} label={{ position: "right", fontSize: 12 }}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.expired ? CHART_COLORS.warn : CHART_COLORS.bad} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
