import { conjugate } from "../core/language/conjugation";

/** Basic conjugation table for a Japanese word. Renders nothing when the
    word is not conjugable (see `conjugate` for the coverage rules). */
export function ConjugationTable({ word, pos }: { word: string; pos?: string }) {
  const forms = conjugate(word, pos);
  if (!forms) return null;
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Conjugation
      </h3>
      <div className="theme-card rounded-2xl border px-3 py-2 shadow-sm">
        {forms.map((f) => (
          <div key={f.label} className="flex items-baseline justify-between gap-3 py-1">
            <span className="text-xs theme-card-muted">{f.label}</span>
            <span className="text-sm font-medium">{f.form}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
