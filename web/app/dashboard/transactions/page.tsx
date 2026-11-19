import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CopyButton } from "@/components/dashboard/copy-button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { LocalTime } from "@/components/dashboard/local-time";
import { ERROR_CATEGORIES } from "@/lib/classify";
import {
  getLabels,
  getTransactions,
  PAGE_SIZE,
  parseTxFilters,
  STATUSES,
  type TxFilters,
} from "@/lib/dashboard";
import { int, ms, sol, shortSig } from "@/lib/format";
import { getViewerProjectIds } from "@/lib/scope";
import { CATEGORY_LABEL } from "@/lib/tips";

export const metadata: Metadata = { title: "Transactions" };

export default function TransactionsPage({ searchParams }: PageProps<"/dashboard/transactions">) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
      <Suspense fallback={<Skeleton className="h-[600px]" />}>
        <Transactions searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function hrefWith(f: TxFilters, patch: Partial<TxFilters>) {
  const next = { ...f, ...patch };
  const qs = new URLSearchParams();
  if (next.status) qs.set("status", next.status);
  if (next.category) qs.set("category", next.category);
  if (next.label) qs.set("label", next.label);
  if (next.page > 1) qs.set("page", String(next.page));
  const s = qs.toString();
  return `/dashboard/transactions${s ? `?${s}` : ""}`;
}

async function Transactions({
  searchParams,
}: {
  searchParams: PageProps<"/dashboard/transactions">["searchParams"];
}) {
  const filters = parseTxFilters(await searchParams);
  const projectIds = await getViewerProjectIds();
  if (projectIds.length === 0) {
    return <EmptyState title="No projects yet">Create a project to start tracking transactions.</EmptyState>;
  }

  const [{ rows, count }, labels] = await Promise.all([
    getTransactions(projectIds, filters),
    getLabels(projectIds),
  ]);
  const filtered = !!(filters.status || filters.category || filters.label);
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <FilterBar filters={filters} labels={labels} />

      {rows.length === 0 ? (
        <EmptyState title={filtered ? "No transactions match these filters" : "No transactions yet"}>
          {filtered ? (
            <Link className="underline" href="/dashboard/transactions">
              Clear filters
            </Link>
          ) : (
            "Transactions tracked by the SDK show up here."
          )}
        </EmptyState>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Signature</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Confirm</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-right">CU used / limit</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="tabular-nums">
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      <LocalTime iso={r.sent_at} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5 font-mono text-xs">
                        <span title={r.signature}>{shortSig(r.signature)}</span>
                        <CopyButton value={r.signature} label="Copy signature" />
                        <a
                          href={`https://solscan.io/tx/${r.signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="View on Solscan"
                          title="View on Solscan"
                          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>{r.label ?? <span className="text-muted-foreground">–</span>}</TableCell>
                    <TableCell className="text-muted-foreground">{r.path}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-right">{ms(r.confirm_ms)}</TableCell>
                    <TableCell className="text-right">{r.fee_lamports === null ? "–" : sol(r.fee_lamports, 6)}</TableCell>
                    <TableCell className="text-right">
                      {int(r.cu_consumed)} <span className="text-muted-foreground">/ {int(r.cu_limit)}</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.error_category ? CATEGORY_LABEL[r.error_category] : <span className="text-muted-foreground">–</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              ~{int(count)} transactions · page {filters.page} of {int(pages)}
            </span>
            <div className="flex gap-2">
              <PageLink href={hrefWith(filters, { page: filters.page - 1 })} disabled={filters.page <= 1}>
                ← Newer
              </PageLink>
              <PageLink href={hrefWith(filters, { page: filters.page + 1 })} disabled={filters.page >= pages}>
                Older →
              </PageLink>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="rounded-md border px-3 py-1 opacity-40">{children}</span>;
  return (
    <Link href={href} className="rounded-md border bg-background px-3 py-1 text-foreground hover:bg-muted">
      {children}
    </Link>
  );
}

const selectClass =
  "h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** Plain GET form: works without JavaScript, filters live in the URL. */
function FilterBar({ filters, labels }: { filters: TxFilters; labels: string[] }) {
  return (
    <form className="flex flex-wrap items-end gap-3" action="/dashboard/transactions">
      <label className="grid gap-1 text-xs text-muted-foreground">
        Status
        <select name="status" defaultValue={filters.status ?? ""} className={selectClass}>
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Reason
        <select name="category" defaultValue={filters.category ?? ""} className={selectClass}>
          <option value="">All</option>
          {ERROR_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Label
        <select name="label" defaultValue={filters.label ?? ""} className={selectClass}>
          <option value="">All</option>
          {labels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="h-8 rounded-md bg-foreground px-3 text-sm text-background hover:bg-foreground/90">
        Apply
      </button>
      {(filters.status || filters.category || filters.label) && (
        <Link href="/dashboard/transactions" className="h-8 px-2 text-sm leading-8 text-muted-foreground hover:text-foreground">
          Clear
        </Link>
      )}
    </form>
  );
}
