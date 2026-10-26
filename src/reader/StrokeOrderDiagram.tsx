import { useEffect, useState } from "react";
import { getStrokeOrderSvg } from "../core/kanji/strokeOrder";

/**
 * KanjiVG stroke-order diagram for one kanji.
 *
 * Animated mode draws the strokes one by one (each path gets
 * pathLength=1 + a dashoffset animation with a per-stroke delay, so no
 * path measuring is needed). Static mode renders the finished diagram.
 * The SVG sits on a white card so the black strokes stay legible on any
 * app theme. Offline with no cached copy shows a "needs connection"
 * state with a retry button instead of a broken image.
 */
export function StrokeOrderDiagram({
  char,
  animated = false,
  showFooter = false,
  silent = false,
  className = "",
}: {
  char: string;
  animated?: boolean;
  showFooter?: boolean;
  /** When true, loading/error states render nothing (for lists). */
  silent?: boolean;
  className?: string;
}) {
  type State =
    | { kind: "loading" }
    | { kind: "ok"; html: string; strokes: number }
    | { kind: "needs-connection" }
    | { kind: "not-found" };
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void getStrokeOrderSvg(char).then((r) => {
      if (cancelled) return;
      if (r.status === "ok") {
        setState({ kind: "ok", html: prepareSvg(r.svg, animated), strokes: countStrokes(r.svg) });
      } else {
        setState({ kind: r.status });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [char, animated, attempt]);

  if (state.kind === "loading") {
    if (silent) return null;
    return (
      <div className={`flex items-center justify-center rounded-xl bg-white p-2 text-xs text-gray-400 ${className}`}>
        Loading…
      </div>
    );
  }
  if (state.kind === "needs-connection") {
    if (silent) return null;
    return (
      <div className={`rounded-xl bg-white p-2 text-center ${className}`}>
        <p className="text-xs text-gray-500">Stroke order needs an internet connection</p>
        <button
          type="button"
          onClick={() => setAttempt((a) => a + 1)}
          className="mt-1 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600"
        >
          Retry
        </button>
      </div>
    );
  }
  if (state.kind === "not-found") {
    if (silent) return null;
    return (
      <div className={`rounded-xl bg-white p-2 text-center text-xs text-gray-500 ${className}`}>
        No stroke-order diagram for this character
      </div>
    );
  }
  return (
    <div className={className}>
      <div
        className="rounded-xl bg-white p-1"
        // KanjiVG is a trusted public dataset; scripts are stripped in
        // prepareSvg before rendering.
        dangerouslySetInnerHTML={{ __html: state.html }}
      />
      {showFooter && (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs theme-card-muted">{state.strokes} strokes</span>
          {animated && (
            <button
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400"
            >
              Replay
            </button>
          )}
          <span className="ml-auto text-[10px] text-gray-400">
            Stroke order: KanjiVG (CC BY-SA 3.0)
          </span>
        </div>
      )}
    </div>
  );
}

function countStrokes(svg: string): number {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  return doc.querySelectorAll("path").length;
}

/**
 * Prepare a KanjiVG SVG for inline rendering: strip scripts, size it to
 * its container, and (animated mode) give every stroke path a draw
 * animation staggered by stroke order (document order = stroke order).
 */
export function prepareSvg(svg: string, animated: boolean): string {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  doc.querySelectorAll("script").forEach((el) => el.remove());
  const paths = doc.querySelectorAll("path");
  paths.forEach((p, i) => {
    if (!animated) return;
    p.setAttribute("pathLength", "1");
    p.setAttribute("class", "kanjivg-path");
    (p as SVGPathElement).style.animationDelay = `${(i * 0.45).toFixed(2)}s`;
  });
  const root = doc.querySelector("svg");
  if (root) {
    root.removeAttribute("width");
    root.removeAttribute("height");
    root.setAttribute("class", "h-full w-full");
  }
  return new XMLSerializer().serializeToString(doc);
}
