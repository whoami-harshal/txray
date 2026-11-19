"use client";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm">
      <h2 className="font-medium text-red-800">Couldn&apos;t load the dashboard</h2>
      <p className="mt-1 text-red-700">
        {process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong while loading your data. Try again in a moment."}
      </p>
      {process.env.NODE_ENV === "development" && /dashboard_(stats|labels)/.test(error.message) && (
        <p className="mt-2 text-red-700">
          Run <code>web/supabase/migrations/003_dashboard.sql</code> in the Supabase SQL editor.
        </p>
      )}
      <button onClick={reset} className="mt-4 rounded-md bg-red-700 px-3 py-1.5 text-white hover:bg-red-800">
        Try again
      </button>
    </div>
  );
}
