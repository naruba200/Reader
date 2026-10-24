import { useEffect } from "react";

export interface ActionSheetAction {
  label: string;
  destructive?: boolean;
  onSelect: () => void;
}

interface ActionSheetProps {
  open: boolean;
  title: string;
  message?: string;
  actions: ActionSheetAction[];
  onClose: () => void;
}

/** Mobile bottom-sheet replacement for window.confirm(). */
export function ActionSheet({ open, title, message, actions, onClose }: ActionSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="theme-card sheet-enter relative w-full max-w-md rounded-t-2xl p-4 pb-safe"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
        <h2 className="text-base font-semibold">{title}</h2>
        {message && (
          <p className="mt-1 text-sm theme-card-muted">{message}</p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                a.onSelect();
                onClose();
              }}
              className={`w-full rounded-xl px-4 py-3 text-base font-medium active:scale-[0.99] ${
                a.destructive
                  ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300"
                  : "theme-chip"
              }`}
            >
              {a.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl px-4 py-3 text-base font-medium theme-card-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
