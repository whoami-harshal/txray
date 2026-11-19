"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";

/**
 * Dark is the server-rendered default. If the visitor picked light before, switch before the first
 * paint so there's no flash. Inserted once into the initial HTML via useServerInsertedHTML, which
 * the Next docs recommend for document-level scripts like themes (no "script tag" warning on the client).
 */
const THEME_SCRIPT = `(function(){try{if(localStorage.getItem("theme")==="light"){var d=document.documentElement;d.classList.remove("dark");d.style.colorScheme="light"}}catch(e){}})()`;

export function ThemeScript() {
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
  });
  return null;
}
