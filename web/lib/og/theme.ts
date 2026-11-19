/** Colors for generated share images (CSS variables aren't available inside ImageResponse). */
export const OG = {
  bg: "#0b0d14",
  card: "#121520",
  border: "#232838",
  text: "#f2f4f8",
  muted: "#9aa3b5",
  brand: "#38d9f5",
  brand2: "#9b7bff",
  good: "#34d399",
  warn: "#fbbf24",
  bad: "#f87171",
};

export function toneColor(score: number) {
  return score >= 80 ? OG.good : score >= 60 ? OG.warn : OG.bad;
}

export const OG_SIZE = { width: 1200, height: 630 };
