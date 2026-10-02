/**
 * The live event timeline, laid out like a console: a toolbar with a clear
 * button, a text filter and a switch per type, then one row per event. The
 * first tool for answering "why did it do that", and the reason the bus is
 * worth having.
 */
import { SENSE_EVENT_TYPES, type SenseEventType } from '@m8/shared';
import { useState } from 'react';
import type { Bus } from '../bus/bus.ts';
import { summarise } from './event-summary.ts';
import { type LoggedEvent, useEventLog } from './use-event-log.ts';

/** What the timeline watches. */
interface EventTimelineProps {
  /** The bus to show. */
  bus: Bus;
}

/** What the toolbar shows and changes. */
interface TimelineToolbarProps {
  /** The text a row has to contain, or empty for every row. */
  filter: string;
  /** Changes the filter. */
  onFilter: (filter: string) => void;
  /** Hides every row logged so far. */
  onClear: () => void;
  /** How many rows pass the filters. */
  shown: number;
  /** How many rows there are since the last clear. */
  total: number;
}

/**
 * Whether an event passes the text filter.
 *
 * @param event - The event.
 * @param needle - The filter, already lower case. Empty passes everything.
 * @returns Whether its type or its summary contains the filter.
 */
function matches({ event }: LoggedEvent, needle: string): boolean {
  if (needle === '') return true;
  return `${event.type} ${summarise(event)}`.toLowerCase().includes(needle);
}

/**
 * The console's toolbar: clear, filter, and the count.
 *
 * @param props - The filter, the way to clear, and the counts.
 * @returns The toolbar row.
 */
function TimelineToolbar({ filter, onFilter, onClear, shown, total }: TimelineToolbarProps) {
  return (
    <div className="m8-toolbar" role="toolbar" aria-label="Event log">
      <button type="button" className="m8-icon-button m8-clear" onClick={onClear}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" />
          <path d="M4.1 11.9l7.8-7.8" />
        </svg>
        <span className="m8-hidden-label">Clear the log</span>
      </button>
      <input
        className="m8-filter"
        type="search"
        placeholder="Filter"
        aria-label="Filter the events"
        value={filter}
        onChange={(event) => {
          onFilter(event.target.value);
        }}
      />
      <span className="m8-count">{shown === total ? `${total}` : `${shown} / ${total}`}</span>
    </div>
  );
}

/** What the type switches show and change. */
interface TypeSwitchesProps {
  /** The types whose rows are hidden. */
  muted: Set<SenseEventType>;
  /** Shows or hides one type. */
  onFlip: (type: SenseEventType) => void;
}

/** What the list of rows needs. */
interface TimelineRowsProps {
  /** The rows to show, newest first. */
  rows: LoggedEvent[];
  /** The newest timestamp on the bus, which every age is measured from. */
  newest: number;
}

/**
 * One switch per event type, like the type filters of the network panel.
 *
 * @param props - The muted types and the way to flip one.
 * @returns The row of switches.
 */
function TypeSwitches({ muted, onFlip }: TypeSwitchesProps) {
  return (
    <div className="m8-toolbar m8-type-filters">
      {SENSE_EVENT_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          className={muted.has(type) ? 'm8-chip-off' : 'm8-pin-on'}
          aria-pressed={!muted.has(type)}
          onClick={() => {
            onFlip(type);
          }}
        >
          {type.replace('vision.', 'v.').replace('sound.', 's.')}
        </button>
      ))}
    </div>
  );
}

/**
 * The rows, newest first.
 *
 * @param props - The rows to show, and the newest timestamp to measure their age from.
 * @returns The list.
 */
function TimelineRows({ rows, newest }: TimelineRowsProps) {
  return (
    <ol className="m8-timeline">
      {rows.map(({ seq, event }) => (
        <li key={seq}>
          <span className="m8-age">{`-${((newest - event.ts) / 1000).toFixed(1)}s`}</span>
          <span className="m8-kind">{event.type}</span>
          <span className="m8-detail">{summarise(event)}</span>
        </li>
      ))}
      {rows.length === 0 ? <li className="m8-empty">nothing on the bus</li> : null}
    </ol>
  );
}

/**
 * The timeline.
 *
 * @param props - The bus to show.
 * @returns The toolbar, the type switches and the list.
 */
export function EventTimeline({ bus }: EventTimelineProps) {
  const events = useEventLog(bus);
  const [muted, setMuted] = useState<Set<SenseEventType>>(new Set());
  const [filter, setFilter] = useState('');
  const [clearedAt, setClearedAt] = useState(0);
  const kept = events.filter((logged) => logged.seq > clearedAt);
  const needle = filter.trim().toLowerCase();
  const shown = kept.filter((logged) => !muted.has(logged.event.type) && matches(logged, needle));

  /**
   * Turn one type on or off.
   * @param type - Which type.
   */
  const flip = (type: SenseEventType) => {
    setMuted((current) => {
      const next = new Set(current);
      if (!next.delete(type)) next.add(type);
      return next;
    });
  };

  return (
    <div className="m8-console">
      <TimelineToolbar
        {...{ filter, shown: shown.length, total: kept.length }}
        onFilter={setFilter}
        onClear={() => setClearedAt(events[0]?.seq ?? clearedAt)}
      />
      <TypeSwitches muted={muted} onFlip={flip} />
      <TimelineRows rows={shown} newest={events[0]?.event.ts ?? 0} />
    </div>
  );
}
