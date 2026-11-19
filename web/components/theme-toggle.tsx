"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

export function ThemeToggle() {
  // Server renders the dark default; the client reads the real class (set before paint).
  const dark = useSyncExternalStore(subscribe, isDark, () => true);

  return (
    <button
      type="button"
      onClick={() => {
        const next = !isDark();
        const root = document.documentElement;
        root.classList.toggle("dark", next);
        root.style.colorScheme = next ? "dark" : "light";
        try {
          localStorage.setItem("theme", next ? "dark" : "light");
        } catch {
          /* storage blocked: still switches for this visit */
        }
      }}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
