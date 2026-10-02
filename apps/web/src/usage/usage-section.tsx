/**
 * The usage section of the settings sheet: what the calls to Gemini cost and
 * used over a range of days, as four numbers, a chart and a table.
 */
import type { Language, UsageReport } from '@m8/shared';
import {
  costByDay,
  formatLiveTime,
  formatMoney,
  formatTokens,
  totalUsage,
  type UsageRange,
  type UsageRow,
  type UsageTotals,
  usageRows,
} from './days.ts';
import { USAGE_STRINGS, type UsageStrings } from './strings.ts';
import { UsageChart } from './usage-chart.tsx';
import { type Usage, useUsage } from './use-usage.ts';

/** The ranges, in the order of their buttons. */
const RANGES: readonly UsageRange[] = ['today', 'week', 'month'];

/**
 * The three range buttons in one row.
 *
 * @param props - The usage, for the range and the way to change it, and the words.
 * @returns The row.
 */
function RangePicker({ usage, strings }: { usage: Usage; strings: UsageStrings }) {
  return (
    <fieldset className="m8-usage-ranges" aria-label={strings.range}>
      {RANGES.map((range) => (
        <button
          key={range}
          type="button"
          className="m8-setting-button"
          aria-pressed={usage.range === range}
          onClick={() => {
            usage.setRange(range);
          }}
        >
          {strings[range]}
        </button>
      ))}
    </fieldset>
  );
}

/** What one tile needs. */
interface TileProps {
  /** What the number is. */
  label: string;
  /** The number. */
  value: string;
  /** The line under it. */
  detail: string;
}

/**
 * One number with its name above and a detail under it.
 *
 * @param props - The name, the number and the detail.
 * @returns The tile.
 */
function Tile({ label, value, detail }: TileProps) {
  return (
    <div className="m8-usage-tile">
      <span className="m8-usage-tile-label">{label}</span>
      <span className="m8-usage-tile-value">{value}</span>
      <span className="m8-usage-tile-detail">{detail}</span>
    </div>
  );
}

/**
 * The four tiles in a 2 by 2 grid.
 *
 * @param props - The totals and the words.
 * @returns The grid.
 */
function Tiles({ totals, strings }: { totals: UsageTotals; strings: UsageStrings }) {
  return (
    <div className="m8-usage-tiles">
      <Tile
        label={strings.cost}
        value={formatMoney(totals.costMicros)}
        detail={strings.saved.replace('{amount}', formatMoney(totals.savedMicros))}
      />
      <Tile
        label={strings.tokens}
        value={formatTokens(totals.tokensIn + totals.tokensOut)}
        detail={strings.tokensInOut
          .replace('{in}', formatTokens(totals.tokensIn))
          .replace('{out}', formatTokens(totals.tokensOut))}
      />
      <Tile
        label={strings.cached}
        value={`${Math.round(totals.cachedShare * 100)}%`}
        detail={strings.cachedTokens.replace('{count}', formatTokens(totals.cachedTokens))}
      />
      <Tile
        label={strings.liveTime}
        value={formatLiveTime(totals.liveMs)}
        detail={strings.sessions.replace('{count}', String(totals.sessions))}
      />
    </div>
  );
}

/**
 * One row of the table.
 *
 * @param props - The row and the words.
 * @returns The table row.
 */
function ModelRow({ row, strings }: { row: UsageRow; strings: UsageStrings }) {
  return (
    <tr>
      <td>
        {strings.purposes[row.purpose]}
        <span className="m8-usage-model">{row.model}</span>
      </td>
      <td className="m8-usage-number">
        {row.calls}
        {row.turns > 0 ? (
          <span className="m8-usage-turns">
            {strings.turns.replace('{count}', String(row.turns))}
          </span>
        ) : null}
      </td>
      <td className="m8-usage-number">{formatTokens(row.tokensIn)}</td>
      <td className="m8-usage-number">{formatTokens(row.tokensOut)}</td>
      <td className="m8-usage-number">{formatMoney(row.costMicros)}</td>
    </tr>
  );
}

/**
 * What each model spent on each purpose, the chart's numbers as a table.
 *
 * @param props - The rows and the words.
 * @returns The table, or nothing when there are no rows.
 */
function ModelTable({ rows, strings }: { rows: readonly UsageRow[]; strings: UsageStrings }) {
  if (rows.length === 0) return null;
  return (
    <div className="m8-usage-table">
      <table>
        <thead>
          <tr>
            <th scope="col">{strings.purpose}</th>
            <th scope="col">{strings.calls}</th>
            <th scope="col">{strings.tokensIn}</th>
            <th scope="col">{strings.tokensOut}</th>
            <th scope="col">{strings.costColumn}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ModelRow key={`${row.model} ${row.purpose}`} row={row} strings={strings} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The day the prices were checked, in the person's language.
 *
 * @param checkedOn - The day, `YYYY-MM-DD`.
 * @param language - The language.
 * @returns The date as words, or the day as given when it does not parse.
 */
function formatCheckedOn(checkedOn: string, language: Language): string {
  const [year, month, day] = checkedOn.split('-').map(Number);
  if (!year || !month || !day) return checkedOn;
  return new Date(year, month - 1, day).toLocaleDateString(language, { dateStyle: 'long' });
}

/** What the report part of the section needs. */
interface ReportViewProps {
  /** The report. */
  report: UsageReport;
  /** The language. */
  language: Language;
  /** The words. */
  strings: UsageStrings;
}

/**
 * The tiles, the chart, the table and where the prices come from.
 *
 * @param props - The report, the language and the words.
 * @returns The report as the section shows it.
 */
function ReportView({ report, language, strings }: ReportViewProps) {
  const totals = totalUsage(report.buckets);
  return (
    <>
      <Tiles totals={totals} strings={strings} />
      <UsageChart days={costByDay(report)} language={language} strings={strings} />
      <ModelTable rows={usageRows(report.buckets)} strings={strings} />
      <p className="m8-setting-hint">
        {strings.prices.replace('{date}', formatCheckedOn(report.pricesCheckedOn, language))}
        {totals.unpriced > 0
          ? ` ${strings.unpriced.replace('{count}', String(totals.unpriced))}`
          : null}
      </p>
    </>
  );
}

/**
 * The usage section.
 *
 * @remarks
 * The sheet is mounted only while it is open, so the report is read each time
 * it opens, and again when another range is picked.
 *
 * @param props - The language the sheet is in.
 * @returns The section.
 */
export function UsageSection({ language }: { language: Language }) {
  const usage = useUsage();
  const strings = USAGE_STRINGS[language];
  return (
    <section className="m8-usage">
      <RangePicker usage={usage} strings={strings} />
      {usage.fault ? (
        <p className="m8-setting-hint" role="alert">
          {usage.fault}
        </p>
      ) : null}
      {!usage.fault && !usage.report ? <p className="m8-setting-hint">{strings.loading}</p> : null}
      {usage.report ? (
        <ReportView report={usage.report} language={language} strings={strings} />
      ) : null}
    </section>
  );
}
