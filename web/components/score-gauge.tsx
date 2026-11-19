import { scoreTone } from "@/lib/programs";
import { cn } from "@/lib/utils";
import { TONE_TEXT } from "@/lib/format";

/** Circular 0–100 gauge, colored by health (≥80 good, ≥60 warn, else bad). Pure SVG, server-safe. */
export function ScoreGauge({ score, size = 160, label = "health score" }: { score: number; size?: number; label?: string }) {
  const tone = scoreTone(score);
  const stroke = Math.max(6, Math.round(size / 14));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // 3/4 ring, opening at the bottom
  const arc = c * 0.75;
  const filled = arc * (Math.max(0, Math.min(100, score)) / 100);
  const color = `var(--${tone})`;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[135deg] overflow-visible" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          className="text-muted"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${c}`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          style={{ filter: `drop-shadow(0 0 ${Math.round(size / 20)}px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn("font-semibold tabular-nums leading-none", TONE_TEXT[tone])}
          style={{ fontSize: size * 0.3 }}
        >
          {score}
        </span>
        {label && (
          <span className="mt-1 text-muted-foreground" style={{ fontSize: Math.max(10, size * 0.075) }}>
            {label}
          </span>
        )}
      </div>
      <span className="sr-only">
        {label}: {score} out of 100
      </span>
    </div>
  );
}
