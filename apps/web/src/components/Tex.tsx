import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export function texHtml(src: string, display: boolean): string {
  try {
    return katex.renderToString(src, { displayMode: display, throwOnError: false, strict: "ignore", trust: false, output: "html" });
  } catch {
    return src.replace(/[<>&]/g, "");
  }
}

export function Tex({ src, display = true }: { src: string; display?: boolean }) {
  const html = useMemo(() => texHtml(src, display), [src, display]);
  return <div className={display ? "math-tex" : "math-tex-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
}
