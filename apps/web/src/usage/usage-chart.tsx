/**
 * The cost per day as stacked bars, conversation at the bottom and memory on
 * top. Plain SVG with a viewBox, so it takes the sheet's width.
 */
import type { Language } from '@m8/shared';
import { useState } from 'react';
import { axisTicks, formatAxisMoney, formatMoney, labelEvery, type UsageDay } from './days.ts';
import type { UsageStrings } from './strings.ts';

/** The width of the drawing, in viewBox units. About one unit per pixel in the sheet. */
const WIDTH = 400;
/** The height of the drawing. */
const HEIGHT = 150;
/** Room on the left for the dollar labels. */
const LEFT = 46;
/** Room on the right, so the last bar does not touch the edge. */
const RIGHT = 2;
/** Room above the highest gridline, for its label. */
const TOP = 8;
/** Room under the baseline for the day labels. */
const BOTTOM = 20;
/** The gap between two bars, and between the two segments of a bar. */
const GAP = 2;
/** The widest a bar gets, so a single day is a bar and not a block. */
const MAX_BAR = 36;
/** The radius of the top corners of a stack. */
const RADIUS = 4;

/** The baseline, in viewBox units from the top. */
const BASELINE = HEIGHT - BOTTOM;
/** The height of the plot. */
const PLOT_HEIGHT = BASELINE - TOP;

/** Where the chart puts things, worked out once for all the days. */
interface Layout {
  /** The width of one day's slot. */
  slot: number;
  /** The width of a bar. */
  bar: number;
  /** The amount at the top of the axis, in micro-dollars. */
  top: number;
  /** The gridlines, in micro-dollars, 0 first. */
  ticks: number[];
  /** Label every this many days, counted back from the last. */
  every: number;
}

/**
 * Work out the slots, the bars and the axis.
 *
 * @param days - The days, oldest first. At least one.
 * @returns The layout.
 */
function layoutFor(days: readonly UsageDay[]): Layout {
  const slot = (WIDTH - LEFT - RIGHT) / days.length;
  const ticks = axisTicks(Math.max(...days.map((day) => day.conversation + day.memory)));
  return {
    slot,
    bar: Math.min(MAX_BAR, slot - GAP),
    top: ticks.at(-1) ?? 1,
    ticks,
    every: labelEvery(days.length),
  };
}

/**
 * The height of an amount on the plot.
 *
 * @param micros - The amount.
 * @param top - The amount at the top of the axis.
 * @returns The height in viewBox units. A cost above zero is at least one unit, so it shows.
 */
function heightOf(micros: number, top: number): number {
  if (micros <= 0) return 0;
  return Math.max(1, (micros / top) * PLOT_HEIGHT);
}

/**
 * A rectangle with its two top corners rounded, standing on its bottom edge.
 *
 * @param x - The left edge.
 * @param y - The top edge.
 * @param width - The width.
 * @param height - The height.
 * @returns The SVG path.
 */
function roundedTop(x: number, y: number, width: number, height: number): string {
  const radius = Math.min(RADIUS, height, width / 2);
  const bottom = y + height;
  const right = x + width;
  return [
    `M${x},${bottom}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${right - radius}`,
    `Q${right},${y} ${right},${y + radius}`,
    `V${bottom}Z`,
  ].join(' ');
}

/** What one day's bar needs. */
interface BarProps {
  /** The day. */
  day: UsageDay;
  /** The left edge of the bar. */
  x: number;
  /** The layout. */
  layout: Layout;
}

/**
 * One day: conversation at the bottom, memory on top, a gap between them, and
 * the top of the stack rounded.
 *
 * @param props - The day, where its bar starts and the layout.
 * @returns The segments, or nothing for a day with nothing spent.
 */
function Bar({ day, x, layout }: BarProps) {
  const low = heightOf(day.conversation, layout.top);
  const high = heightOf(day.memory, layout.top);
  const gap = low > 0 && high > 0 ? GAP : 0;
  const lowTop = BASELINE - low;
  const highHeight = Math.max(high > 0 ? 1 : 0, high - gap);
  const highTop = lowTop - gap - highHeight;
  return (
    <g>
      {low > 0 && high > 0 ? (
        <rect className="m8-usage-conversation" x={x} y={lowTop} width={layout.bar} height={low} />
      ) : null}
      {low > 0 && high === 0 ? (
        <path className="m8-usage-conversation" d={roundedTop(x, lowTop, layout.bar, low)} />
      ) : null}
      {high > 0 ? (
        <path className="m8-usage-memory" d={roundedTop(x, highTop, layout.bar, highHeight)} />
      ) : null}
    </g>
  );
}

/**
 * The gridlines and their dollar labels.
 *
 * @param props - The layout.
 * @returns The axis.
 */
function Axis({ layout }: { layout: Layout }) {
  return (
    <g>
      {layout.ticks.map((tick) => {
        const y = BASELINE - (tick / layout.top) * PLOT_HEIGHT;
        return (
          <g key={tick}>
            <line className="m8-usage-grid" x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} />
            <text className="m8-usage-label" x={LEFT - 6} y={y} textAnchor="end" dy="0.32em">
              {formatAxisMoney(tick)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/**
 * The text a day shows on hover and reads out on focus.
 *
 * @param day - The day.
 * @param language - The language of the words and the date.
 * @param strings - The words.
 * @returns The date, then both series and the total.
 */
function describeDay(day: UsageDay, language: Language, strings: UsageStrings): string[] {
  const date = new Date(day.start).toLocaleDateString(language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return [
    date,
    `${strings.conversation}: ${formatMoney(day.conversation)}`,
    `${strings.memory}: ${formatMoney(day.memory)}`,
    `${strings.total}: ${formatMoney(day.conversation + day.memory)}`,
  ];
}

/**
 * The label under a day: its day of month, or the whole date when the chart
 * has one day. Days in between are left unlabelled so labels never collide.
 *
 * @param days - Every day.
 * @param index - Which day.
 * @param layout - The layout.
 * @param language - The language of the date.
 * @returns The label, or null for an unlabelled day.
 */
function dayLabel(
  days: readonly UsageDay[],
  index: number,
  layout: Layout,
  language: Language,
): string | null {
  const date = new Date(days[index]?.start ?? 0);
  if (days.length === 1)
    return date.toLocaleDateString(language, { month: 'short', day: 'numeric' });
  if ((days.length - 1 - index) % layout.every !== 0) return null;
  return String(date.getDate());
}

/** What one day's column needs. */
interface DayColumnProps {
  /** Every day, oldest first. */
  days: readonly UsageDay[];
  /** Which day this column is. */
  index: number;
  /** The layout. */
  layout: Layout;
  /** The language of the dates. */
  language: Language;
}

/**
 * One day as it is drawn: its bar and its label.
 *
 * @param props - The days, which one, the layout and the language.
 * @returns The column.
 */
function DayColumn({ days, index, layout, language }: DayColumnProps) {
  const day = days[index];
  if (!day) return null;
  const left = LEFT + index * layout.slot;
  const label = dayLabel(days, index, layout, language);
  return (
    <g>
      <Bar day={day} x={left + (layout.slot - layout.bar) / 2} layout={layout} />
      {label === null ? null : (
        <text
          className="m8-usage-label"
          x={left + layout.slot / 2}
          y={HEIGHT - 6}
          textAnchor="middle"
        >
          {label}
        </text>
      )}
    </g>
  );
}

/** What one day's hit target needs. */
interface HitTargetProps extends DayColumnProps {
  /** The words. */
  strings: UsageStrings;
  /**
   * Show or hide the tooltip.
   * @param index - The day to show, or null to hide.
   */
  onActive: (index: number | null) => void;
}

/**
 * A button as tall as the plot and as wide as the day's slot, laid over the
 * drawing. It shows the tooltip on hover, on keyboard focus and on a tap, and
 * carries the same text for a screen reader.
 *
 * @param props - The days, which one, the layout, the words and the tooltip switch.
 * @returns The button.
 */
function HitTarget({ days, index, layout, language, strings, onActive }: HitTargetProps) {
  const day = days[index];
  if (!day) return null;
  const percent = (part: number, whole: number) => `${(part / whole) * 100}%`;
  return (
    <button
      type="button"
      className="m8-usage-hit"
      style={{
        left: percent(LEFT + index * layout.slot, WIDTH),
        width: percent(layout.slot, WIDTH),
        top: percent(TOP, HEIGHT),
        height: percent(PLOT_HEIGHT, HEIGHT),
      }}
      aria-label={describeDay(day, language, strings).join(', ')}
      onClick={() => onActive(index)}
      onMouseEnter={() => onActive(index)}
      onMouseLeave={() => onActive(null)}
      onFocus={() => onActive(index)}
      onBlur={() => onActive(null)}
    />
  );
}

/** What the tooltip needs. */
interface TooltipProps {
  /** Every day, oldest first. */
  days: readonly UsageDay[];
  /** The day the tooltip is for. */
  index: number;
  /** The layout. */
  layout: Layout;
  /** The language of the words and the date. */
  language: Language;
  /** The words. */
  strings: UsageStrings;
}

/**
 * The small box over a day with its date, both series and the total.
 *
 * @param props - The days, which one, the layout and the words.
 * @returns The box. It is moved left by as much of its own width as the day
 * is across the chart, so it stays inside both edges at any width.
 */
function Tooltip({ days, index, layout, language, strings }: TooltipProps) {
  const day = days[index];
  if (!day) return null;
  const center = ((LEFT + (index + 0.5) * layout.slot) / WIDTH) * 100;
  const [date, ...lines] = describeDay(day, language, strings);
  return (
    <div
      className="m8-usage-tooltip"
      style={{ left: `${center}%`, transform: `translateX(-${center}%)` }}
    >
      <strong>{date}</strong>
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  );
}

/** What the chart needs. */
interface UsageChartProps {
  /** The cost of each day, oldest first. */
  days: readonly UsageDay[];
  /** The language of the words and the dates. */
  language: Language;
  /** The words. */
  strings: UsageStrings;
}

/**
 * The cost per day, with its legend.
 *
 * @param props - The days, the language and the words.
 * @returns The chart, or a line saying nothing was spent.
 */
export function UsageChart({ days, language, strings }: UsageChartProps) {
  const [active, setActive] = useState<number | null>(null);
  if (!days.some((day) => day.conversation + day.memory > 0)) {
    return <p className="m8-setting-hint">{strings.nothingSpent}</p>;
  }
  const layout = layoutFor(days);
  const shared = { days, layout, language, strings };
  return (
    <figure className="m8-usage-chart" aria-label={strings.chart}>
      <figcaption className="m8-usage-legend">
        <span className="m8-usage-key m8-usage-key-conversation">{strings.conversation}</span>
        <span className="m8-usage-key m8-usage-key-memory">{strings.memory}</span>
      </figcaption>
      <div className="m8-usage-plot">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
          <Axis layout={layout} />
          {days.map((day, index) => (
            <DayColumn key={day.start} index={index} {...shared} />
          ))}
        </svg>
        {days.map((day, index) => (
          <HitTarget key={day.start} index={index} onActive={setActive} {...shared} />
        ))}
        {active === null ? null : <Tooltip index={active} {...shared} />}
      </div>
    </figure>
  );
}
