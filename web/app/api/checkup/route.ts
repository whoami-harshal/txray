import { z } from "zod";
import { analyzeCheckup } from "@/lib/checkup/analyze";
import { fetchCheckupData } from "@/lib/checkup/fetch";
import { clientIp, findCached, hashIp, saveCheckup, takeRateLimit } from "@/lib/checkup/store";
import { createRpc } from "@/lib/solana/rpc";
import { isValidAddress } from "@/lib/solana/signature";

export const maxDuration = 60;

const bodySchema = z.object({
  address: z
    .string()
    .trim()
    .refine(isValidAddress, "That doesn't look like a Solana address (base58, 32 bytes)."),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send JSON: { address }" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid address" }, { status: 400 });
  }
  const { address } = parsed.data;

  const rpcUrl = process.env.HELIUS_RPC_URL;
  if (!rpcUrl) return Response.json({ error: "Checkup is not configured (HELIUS_RPC_URL)." }, { status: 500 });

  try {
    // Same address within the hour: reuse the report (free, doesn't count against the limit).
    const cached = await findCached(address);
    if (cached) return Response.json({ slug: cached.slug, cached: true });

    const limit = await takeRateLimit(hashIp(clientIp(request)));
    if (!limit.ok) {
      const minutes = Math.ceil(limit.retryAfterSec / 60);
      return Response.json(
        { error: `You've used your 3 free checkups this hour. Try again in ${minutes} min.` },
        { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
      );
    }

    const rpc = createRpc({ url: rpcUrl, rps: Number(process.env.RPC_MAX_RPS) || 8 });
    const data = await fetchCheckupData(rpc, address, { budgetMs: 40_000 });
    if (data.statuses.length === 0) {
      return Response.json({ error: "No transactions found for this address." }, { status: 404 });
    }

    const report = analyzeCheckup({ ...data, address, now: new Date() });
    const slug = await saveCheckup(report);
    console.log("[checkup]", address, data.source, `${data.statuses.length} txs`, `${rpc.requests} rpc calls`);
    return Response.json({ slug, cached: false });
  } catch (err) {
    console.error("[checkup]", err);
    return Response.json({ error: "Couldn't run the checkup right now. Try again in a minute." }, { status: 502 });
  }
}
