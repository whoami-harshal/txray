"use client";

import { useIsClient } from "@/hooks/use-is-client";

/** Shows a timestamp in the viewer's timezone (UTC on the server, local after hydration). */
export function LocalTime({ iso }: { iso: string }) {
  const isClient = useIsClient();
  const text = isClient
    ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : iso.slice(5, 16).replace("T", " ") + " UTC";
  return <time dateTime={iso}>{text}</time>;
}
