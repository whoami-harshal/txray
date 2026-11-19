"use client";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-xl border border-bad/25 bg-bad/10 p-6 text-sm">
      <h2 className="font-medium text-bad">Couldn&apos;t load the dashboard</h2>
      <p className="mt-1 text-bad">
        {process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong while loading your data. Try again in a moment."}
      </p>
      {process.env.NODE_ENV === "development" && /dashboard_(stats|labels)/.test(error.message) && (
        <p className="mt-2 text-bad">
          Run <code>web/supabase/migrations/003_dashboard.sql</code> in the Supabase SQL editor.
        </p>
      )}
      <button onClick={reset} className="mt-4 rounded-md bg-bad px-3 py-1.5 text-background hover:bg-bad/90">
        Try again
      </button>
    </div>
  );
}
