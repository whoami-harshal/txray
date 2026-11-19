import { ImageResponse } from "next/og";
import { getCheckup } from "@/lib/checkup/store";
import { CATEGORY_LABEL } from "@/lib/tips";
import { programName, shortAddress } from "@/lib/programs";
import { OG, OG_SIZE, toneColor } from "@/lib/og/theme";
import { SITE } from "@/lib/site";

export const alt = "TxRay transaction health report";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await getCheckup(slug).catch(() => null);
  const r = row?.report;

  const name = r ? (programName(r.address) ?? (r.kind === "wallet" ? "Wallet" : "Program")) : "Health report";
  const addr = r ? shortAddress(r.address, 6) : "";
  const score = r?.score ?? 0;
  const color = toneColor(score);
  const top = r?.categories[0];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: `radial-gradient(60% 80% at 15% 0%, rgba(56,217,245,0.18), transparent 70%), radial-gradient(50% 70% at 90% 10%, rgba(155,123,255,0.18), transparent 70%), ${OG.bg}`,
          color: OG.text,
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: `linear-gradient(135deg, ${OG.brand}, ${OG.brand2})`,
                display: "flex",
              }}
            />
            <div style={{ display: "flex",  fontSize: 34, fontWeight: 700 }}>{SITE.name}</div>
            <div style={{ display: "flex",  fontSize: 24, color: OG.muted, marginLeft: 8 }}>transaction health report</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex",  fontSize: 76, fontWeight: 700, lineHeight: 1.05, maxWidth: 680 }}>{name}</div>
            {addr && <div style={{ display: "flex",  fontSize: 26, color: OG.muted, marginTop: 10 }}>{addr}</div>}
          </div>

          {r ? (
            <div style={{ display: "flex", gap: 48 }}>
              <Metric label="failed on-chain" value={`${r.failureRate}%`} />
              <Metric label="transactions" value={String(r.total)} />
              {top && <Metric label="top failure" value={CATEGORY_LABEL[top.category]} small />}
            </div>
          ) : (
            <div style={{ display: "flex",  fontSize: 28, color: OG.muted }}>Free Solana transaction checkup</div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 360 }}>
          <div
            style={{
              width: 300,
              height: 300,
              borderRadius: 999,
              border: `22px solid ${r ? color : OG.border}`,
              boxShadow: r ? `0 0 60px ${color}55` : "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ display: "flex",  fontSize: 120, fontWeight: 700, color: r ? color : OG.muted, lineHeight: 1 }}>{r ? score : "?"}</div>
            <div style={{ display: "flex",  fontSize: 24, color: OG.muted, marginTop: 6 }}>/ 100</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

function Metric({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex",  fontSize: small ? 34 : 48, fontWeight: 700 }}>{value}</div>
      <div style={{ display: "flex",  fontSize: 22, color: OG.muted, marginTop: 4 }}>{label}</div>
    </div>
  );
}
