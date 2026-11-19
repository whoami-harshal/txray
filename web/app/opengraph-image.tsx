import { ImageResponse } from "next/og";
import { OG, OG_SIZE } from "@/lib/og/theme";
import { SITE } from "@/lib/site";

export const alt = "TxRay: TX-ray your Solana txs";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          color: OG.text,
          fontFamily: "sans-serif",
          background: `radial-gradient(60% 80% at 15% 0%, rgba(56,217,245,0.22), transparent 70%), radial-gradient(50% 70% at 90% 10%, rgba(155,123,255,0.22), transparent 70%), ${OG.bg}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${OG.brand}, ${OG.brand2})`,
              display: "flex",
            }}
          />
          <div style={{ fontSize: 44, fontWeight: 700 }}>{SITE.name}</div>
        </div>
        <div style={{ display: "flex", fontSize: 96, fontWeight: 700, lineHeight: 1.05, marginTop: 40, maxWidth: 1040 }}>
          <span
            style={{
              backgroundImage: `linear-gradient(90deg, ${OG.brand}, ${OG.brand2})`,
              backgroundClip: "text",
              color: "transparent",
              marginRight: 26,
            }}
          >
            TX-ray
          </span>
          <span>your Solana txs.</span>
        </div>
        <div style={{ display: "flex", fontSize: 32, color: OG.muted, marginTop: 28, maxWidth: 980 }}>
          Failure rate, why transactions fail, compute waste and a health score for any program. Free, no signup.
        </div>
        <div style={{ display: "flex", height: 4, width: 360, marginTop: 48, background: `linear-gradient(90deg, ${OG.brand}, ${OG.brand2})`, borderRadius: 4 }} />
      </div>
    ),
    size,
  );
}
