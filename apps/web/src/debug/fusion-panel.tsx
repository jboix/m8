/**
 * What the character is noticing: the charge, the threshold it has to cross,
 * how it is feeling, and what it decided to do about it.
 *
 * Section 12 asks for the voltage graph with the threshold line and fire
 * markers, because the alternative when it speaks unprompted is guessing why.
 */

import type { Mood } from '@m8/shared';
import type { Bus } from '../bus/bus.ts';
import type { FusionState } from '../fusion/fusion.ts';

import { SensePokes } from './sense-pokes.tsx';

/** What each outcome is called in the log. */
const LABEL: Record<FusionState['fires'][number]['outcome'], string> = {
  said: 'said',
  dropped: 'dropped',
};

/** How many samples of charge the graph keeps. */
const HISTORY = 90;

/** The running trace, kept outside React because it updates ten times a second. */
const trace: number[] = [];

/** What the panel shows and drives. */
interface FusionPanelProps {
  /** What fusion is noticing. */
  fusion: FusionState;
  /** Whether it is allowed to notice anything. */
  noticing: boolean;
  /** Turns that off, which leaves the character purely reactive. */
  onNoticing: (wanted: boolean) => void;
  /** The bus, so a sense event can be faked without performing one. */
  bus: Bus;
}

/**
 * One mood dial.
 *
 * @param props - Which one and how strong.
 * @returns The row.
 */
function Dial({ name, value }: { name: keyof Mood; value: number }) {
  return (
    <div className="m8-dial">
      <span className="m8-name">{name}</span>
      <div className="m8-meter">
        <div style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="m8-value">{value.toFixed(2)}</span>
    </div>
  );
}

/**
 * The charge over time, with the threshold it has to cross.
 *
 * @param props - The current charge and threshold.
 * @returns The graph.
 */
function Voltage({ voltage, threshold }: Pick<FusionState, 'voltage' | 'threshold'>) {
  trace.push(voltage);
  if (trace.length > HISTORY) trace.shift();
  const top = Math.max(threshold * 1.6, ...trace, 0.5);
  const points = trace
    .map((value, index) => `${(index / (HISTORY - 1)) * 100},${100 - (value / top) * 100}`)
    .join(' ');
  const line = 100 - (threshold / top) * 100;

  return (
    <svg className="m8-voltage" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <line className="m8-threshold" x1="0" x2="100" y1={line} y2={line} />
      <polyline className="m8-charge" points={points} />
    </svg>
  );
}

/**
 * The fusion panel.
 *
 * @param props - What it is noticing, and the switch that stops it.
 * @returns The panel section.
 */
export function FusionPanel({ fusion, noticing, onNoticing, bus }: FusionPanelProps) {
  return (
    <>
      <div className="m8-chips">
        <button
          type="button"
          className={noticing ? 'm8-pin-on' : ''}
          onClick={() => {
            onNoticing(!noticing);
          }}
        >
          {noticing ? 'noticing' : 'not noticing'}
        </button>
        <span className="m8-detail">
          {fusion.voltage.toFixed(2)} of {fusion.threshold.toFixed(2)}
        </span>
        <span className="m8-kind">quiet {fusion.quiet.toFixed(0)}s</span>
      </div>

      <SensePokes bus={bus} />

      <Voltage voltage={fusion.voltage} threshold={fusion.threshold} />

      <div className="m8-dials">
        {(Object.keys(fusion.mood) as (keyof Mood)[]).map((name) => (
          <Dial key={name} name={name} value={fusion.mood[name]} />
        ))}
      </div>

      {fusion.fires.length === 0 ? null : (
        <ol className="m8-timeline">
          {fusion.fires.map((fire) => (
            <li key={`${fire.at}-${fire.text}`}>
              <span className="m8-age">{LABEL[fire.outcome]}</span>
              <span className={fire.outcome === 'dropped' ? 'm8-detail' : 'm8-kind'}>
                {fire.text}
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
