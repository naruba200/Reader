import type {
  ReadingSettings,
  TypefaceId,
} from "./readingSettings";
import {
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  MARGIN_X_MIN,
  MARGIN_X_MAX,
  TYPEFACE_LABELS,
} from "./readingSettings";

export interface ReadingSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  settings: ReadingSettings;
  onChange: (partial: Partial<ReadingSettings>) => void;
  brightness: number;
  onBrightnessChange: (v: number) => void;
  wakeLock: boolean;
  onWakeLockChange: (on: boolean) => void;
}

const TYPEFACES: TypefaceId[] = ["default", "serif", "sans", "mincho"];

function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
        <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-blue-600"
        aria-label={label}
      />
    </div>
  );
}

/** Bottom-sheet reading comfort settings: type, brightness, wake lock. */
export function ReadingSettingsPanel({
  open,
  onClose,
  settings,
  onChange,
  brightness,
  onBrightnessChange,
  wakeLock,
  onWakeLockChange,
}: ReadingSettingsPanelProps) {
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
        aria-label="Reading settings"
        className="sheet-enter relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-safe dark:bg-gray-800"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Reading settings
        </h2>

        <SliderRow
          label="Font size"
          value={settings.fontSize}
          display={`${Math.round(settings.fontSize)}px`}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          step={1}
          onChange={(v) => onChange({ fontSize: v })}
        />

        <div className="py-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Typeface</span>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {TYPEFACES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ typeface: t })}
                className={`rounded-lg border px-2 py-2 text-xs font-medium ${
                  settings.typeface === t
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                    : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                }`}
              >
                {TYPEFACE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <SliderRow
          label="Line height"
          value={settings.lineHeight}
          display={settings.lineHeight.toFixed(2)}
          min={LINE_HEIGHT_MIN}
          max={LINE_HEIGHT_MAX}
          step={0.05}
          onChange={(v) => onChange({ lineHeight: v })}
        />

        <SliderRow
          label="Margins"
          value={settings.marginX}
          display={settings.marginX === 0 ? "None" : `${Math.round(settings.marginX)}px`}
          min={MARGIN_X_MIN}
          max={MARGIN_X_MAX}
          step={4}
          onChange={(v) => onChange({ marginX: v })}
        />

        <SliderRow
          label="Brightness"
          value={Math.round(brightness * 100)}
          display={`${Math.round(brightness * 100)}%`}
          min={35}
          max={100}
          step={1}
          onChange={(v) => onBrightnessChange(v / 100)}
        />

        <button
          type="button"
          onClick={() => onWakeLockChange(!wakeLock)}
          className="flex w-full items-center justify-between py-3 text-left"
        >
          <span>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Keep screen awake
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Prevents the screen from sleeping while reading
            </span>
          </span>
          <span
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              wakeLock ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                wakeLock ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-medium text-white active:scale-[0.99]"
        >
          Done
        </button>
      </div>
    </div>
  );
}
