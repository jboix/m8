/** The labelled switch and slider the settings sheet's sections are built from. */

/** What one switch needs. */
interface SwitchRowProps {
  /** What it says. */
  label: string;
  /** Whether it is on. */
  on: boolean;
  /** True greys it out and holds it where it is. */
  disabled?: boolean;
  /** Flips it. */
  onChange: (on: boolean) => void;
}

/**
 * One labelled switch. It is a checkbox drawn as a sliding switch.
 *
 * @param props - The label, the state and the way to change it.
 * @returns The row.
 */
export function SwitchRow({ label, on, disabled = false, onChange }: SwitchRowProps) {
  return (
    <label className="m8-setting">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={on}
        checked={on}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
    </label>
  );
}

/** What one slider needs. */
interface SliderRowProps {
  /** What it says. */
  label: string;
  /** Where it is, 0 to 1. */
  value: number;
  /** True greys it out, when what it controls is switched off. */
  disabled?: boolean;
  /** Moves it. */
  onChange: (value: number) => void;
}

/**
 * One labelled slider from 0 to 1, with its value as a percentage beside the label.
 *
 * @param props - The label, the value and the way to change it.
 * @returns The row.
 */
export function SliderRow({ label, value, disabled = false, onChange }: SliderRowProps) {
  return (
    <label className="m8-setting m8-setting-slider">
      <span className="m8-setting-slider-label">
        <span>{label}</span>
        <output className="m8-setting-value">{Math.round(value * 100)}%</output>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
      />
    </label>
  );
}
