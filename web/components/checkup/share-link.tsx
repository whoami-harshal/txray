"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { copyText } from "@/lib/copy";

export function ShareLink() {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const [url, setUrl] = useState("");

  if (state === "manual") {
    return (
      <label className="grid gap-1 text-xs text-muted-foreground">
        Copy this link
        <input
          readOnly
          autoFocus
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 w-72 max-w-full rounded-lg border bg-background px-2 font-mono text-xs text-foreground"
        />
      </label>
    );
  }

  return (
    <button
      type="button"
      onClick={async () => {
        const href = window.location.href;
        if (await copyText(href)) {
          setState("copied");
          setTimeout(() => setState("idle"), 1500);
        } else {
          setUrl(href);
          setState("manual");
        }
      }}
      className="inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm hover:bg-muted"
    >
      {state === "copied" ? <Check className="size-4 text-emerald-600" /> : <Link2 className="size-4" />}
      {state === "copied" ? "Link copied" : "Copy share link"}
    </button>
  );
}
