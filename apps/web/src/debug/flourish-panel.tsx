/**
 * The flourishes in the debug panel. Switching them all off leaves the plain
 * face, which still has to read. Each one is fired by its emotion's chip, in the row
 * above, which sets the emotion at full strength.
 */
import { useState } from 'react';
import { FLOURISH_KINDS, type FlourishKind } from '../eyes/flourishes.ts';
import type { EyesController } from '../eyes/index.ts';

/** What the panel needs. */
interface FlourishPanelProps {
  /** The rig, for its switches and to fire an emotion. */
  controller: EyesController;
}

/**
 * One switch per flourish.
 *
 * @param props - The rig.
 * @returns A row of switches.
 */
export function FlourishPanel({ controller }: FlourishPanelProps) {
  const [switches, setSwitches] = useState(() => controller.inspector.flourishes());

  /**
   * Flip one flourish, on the rig and in the panel.
   * @param kind - Which one.
   */
  function flip(kind: FlourishKind): void {
    const next = { ...switches, [kind]: !switches[kind] };
    controller.inspector.setFlourishes(next);
    setSwitches(next);
  }

  return (
    <div className="m8-chips">
      {FLOURISH_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className={switches[kind] ? 'm8-pin-on' : 'm8-chip-off'}
          aria-pressed={switches[kind]}
          onClick={() => {
            flip(kind);
          }}
        >
          {kind}
        </button>
      ))}
    </div>
  );
}
