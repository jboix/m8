/** The two model pickers, shared by the setup step and the settings sheet. */
import type { GeminiAccount, GeminiChoiceChange, GeminiModel, GeminiModels } from '@m8/shared';
import type { GeminiStrings } from './strings.ts';

/** What one picker needs. */
interface PickerProps {
  /** What it says. */
  label: string;
  /** Under it. */
  hint: string;
  /** The model chosen, or null when there is none. */
  value: string | null;
  /** What can be chosen, newest first, or null while they are listed. */
  options: GeminiModel[] | null;
  /** True greys it out. */
  disabled: boolean;
  /** Chooses another. */
  onChange: (id: string) => void;
}

/**
 * One model picker.
 *
 * @param props - The label, the choice, the options and the way to change.
 * @returns The row and its hint. The chosen model is always an option, so the
 * picker shows it while the list is still on its way.
 */
function Picker({ label, hint, value, options, disabled, onChange }: PickerProps) {
  const shown = options ?? [];
  const missing = value !== null && !shown.some((model) => model.id === value);
  return (
    <>
      <label className="m8-setting">
        <span>{label}</span>
        <select
          value={value ?? ''}
          disabled={disabled || options === null}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        >
          {missing ? <option value={value}>{value}</option> : null}
          {shown.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </label>
      <p className="m8-setting-hint">{hint}</p>
    </>
  );
}

/** What the pair needs. */
export interface ModelPickersProps {
  /** The account, for the models chosen. */
  account: GeminiAccount;
  /** What the key can use, or null while they are listed. */
  models: GeminiModels | null;
  /** True while a change is with the server. */
  busy: boolean;
  /** The words. */
  strings: GeminiStrings;
  /** Changes a model. */
  onChoose: (change: GeminiChoiceChange) => void;
}

/**
 * The live model and the memory model.
 *
 * @param props - The account, the models, and the way to change them.
 * @returns The two pickers.
 */
export function ModelPickers({ account, models, busy, strings, onChoose }: ModelPickersProps) {
  return (
    <>
      <Picker
        label={strings.liveModel}
        hint={strings.liveModelHint}
        value={account.live}
        options={models?.live ?? null}
        disabled={busy}
        onChange={(live) => {
          onChoose({ live });
        }}
      />
      <Picker
        label={strings.memoryModel}
        hint={strings.memoryModelHint}
        value={account.memory}
        options={models?.text ?? null}
        disabled={busy}
        onChange={(memory) => {
          onChoose({ memory });
        }}
      />
    </>
  );
}
