/**
 * What the usage section says, in each language. Numbers and money are written
 * the same way in every language; only the words change. The server's own error
 * messages are passed on in English.
 */
import type { Language, UsagePurpose } from '@m8/shared';

/** The words in one language. */
export interface UsageStrings {
  /** The name of the settings tab the section is in. */
  heading: string;
  /** The name of the group of range buttons, for a screen reader. */
  range: string;
  /** The button for today. */
  today: string;
  /** The button for the last seven days. */
  week: string;
  /** The button for the last thirty days. */
  month: string;
  /** The tile with the cost. */
  cost: string;
  /** Under the cost: what the cache saved. `{amount}` is the money. */
  saved: string;
  /** The tile with the tokens. */
  tokens: string;
  /** Under the tokens: `{in}` and `{out}` are the counts. */
  tokensInOut: string;
  /** The tile with the share of input served from the cache. */
  cached: string;
  /** Under it: `{count}` is the number of cached tokens. */
  cachedTokens: string;
  /** The tile with how long the live sessions were open. */
  liveTime: string;
  /** Under it: `{count}` is the number of sessions. */
  sessions: string;
  /** The name of the conversation series in the chart. */
  conversation: string;
  /** The name of the memory series in the chart. */
  memory: string;
  /** The last line of a day's tooltip. */
  total: string;
  /** What the chart shows, for a screen reader. */
  chart: string;
  /** Instead of the chart when nothing was spent. */
  nothingSpent: string;
  /** The names of the purposes in the table. */
  purposes: Record<UsagePurpose, string>;
  /** The table's purpose column. */
  purpose: string;
  /** The table's calls column. */
  calls: string;
  /** Under the calls: `{count}` is the number of live turns. */
  turns: string;
  /** The table's input tokens column. */
  tokensIn: string;
  /** The table's output tokens column. */
  tokensOut: string;
  /** The table's cost column. */
  costColumn: string;
  /** Where the prices come from. `{date}` is the day they were checked. */
  prices: string;
  /** When some calls have no price. `{count}` is how many. */
  unpriced: string;
  /** Shown while the report is read. */
  loading: string;
}

/** The words, per language. */
export const USAGE_STRINGS: Record<Language, UsageStrings> = {
  en: {
    heading: 'Usage',
    range: 'Range',
    today: 'Today',
    week: '7 days',
    month: '30 days',
    cost: 'Estimated cost',
    saved: 'Caching saved {amount}',
    tokens: 'Tokens',
    tokensInOut: '{in} in, {out} out',
    cached: 'Cached',
    cachedTokens: '{count} tokens',
    liveTime: 'Live time',
    sessions: 'Sessions: {count}',
    conversation: 'Conversation',
    memory: 'Memory',
    total: 'Total',
    chart: 'Cost per day',
    nothingSpent: 'Nothing was spent in this range.',
    purposes: {
      conversation: 'Conversation',
      summary: 'Summary',
      'self-model': 'Self-model',
      situation: 'Running note',
      ping: 'Ping',
    },
    purpose: 'For',
    calls: 'Calls',
    turns: '{count} turns',
    tokensIn: 'In',
    tokensOut: 'Out',
    costColumn: 'Cost',
    prices: 'Estimated from Google’s list prices, checked on {date}.',
    unpriced: '{count} calls used a model with no price, so the cost leaves them out.',
    loading: 'Reading the usage…',
  },
  fr: {
    heading: 'Utilisation',
    range: 'Période',
    today: 'Aujourd’hui',
    week: '7 jours',
    month: '30 jours',
    cost: 'Coût estimé',
    saved: 'Le cache a économisé {amount}',
    tokens: 'Jetons',
    tokensInOut: '{in} en entrée, {out} en sortie',
    cached: 'En cache',
    cachedTokens: '{count} jetons',
    liveTime: 'Temps en direct',
    sessions: 'Sessions : {count}',
    conversation: 'Conversation',
    memory: 'Mémoire',
    total: 'Total',
    chart: 'Coût par jour',
    nothingSpent: 'Rien n’a été dépensé sur cette période.',
    purposes: {
      conversation: 'Conversation',
      summary: 'Résumé',
      'self-model': 'Image de soi',
      situation: 'Note en cours',
      ping: 'Ping',
    },
    purpose: 'Pour',
    calls: 'Appels',
    turns: '{count} tours',
    tokensIn: 'Entrée',
    tokensOut: 'Sortie',
    costColumn: 'Coût',
    prices: 'Estimé d’après les prix publics de Google, vérifiés le {date}.',
    unpriced: '{count} appels ont utilisé un modèle sans prix, donc le coût ne les compte pas.',
    loading: 'Je lis l’utilisation…',
  },
  es: {
    heading: 'Uso',
    range: 'Periodo',
    today: 'Hoy',
    week: '7 días',
    month: '30 días',
    cost: 'Coste estimado',
    saved: 'La caché ahorró {amount}',
    tokens: 'Tokens',
    tokensInOut: '{in} de entrada, {out} de salida',
    cached: 'En caché',
    cachedTokens: '{count} tokens',
    liveTime: 'Tiempo en directo',
    sessions: 'Sesiones: {count}',
    conversation: 'Conversación',
    memory: 'Memoria',
    total: 'Total',
    chart: 'Coste por día',
    nothingSpent: 'No se gastó nada en este periodo.',
    purposes: {
      conversation: 'Conversación',
      summary: 'Resumen',
      'self-model': 'Imagen de sí',
      situation: 'Nota en curso',
      ping: 'Ping',
    },
    purpose: 'Para',
    calls: 'Llamadas',
    turns: '{count} turnos',
    tokensIn: 'Entrada',
    tokensOut: 'Salida',
    costColumn: 'Coste',
    prices: 'Estimado con los precios públicos de Google, comprobados el {date}.',
    unpriced: '{count} llamadas usaron un modelo sin precio, así que el coste no las cuenta.',
    loading: 'Leyendo el uso…',
  },
  ja: {
    heading: 'つかったぶん',
    range: 'きかん',
    today: 'きょう',
    week: '7にち',
    month: '30にち',
    cost: 'おおよその ひよう',
    saved: 'キャッシュで {amount} へったよ',
    tokens: 'トークン',
    tokensInOut: 'いれた {in}、だした {out}',
    cached: 'キャッシュ',
    cachedTokens: '{count} トークン',
    liveTime: 'はなした じかん',
    sessions: 'ひらいた かいわ: {count}',
    conversation: 'かいわ',
    memory: 'きおく',
    total: 'ぜんぶで',
    chart: '1にちの ひよう',
    nothingSpent: 'この きかんは なにも つかっていないよ。',
    purposes: {
      conversation: 'かいわ',
      summary: 'まとめ',
      'self-model': 'じぶんの こと',
      situation: 'いまの メモ',
      ping: 'ping',
    },
    purpose: 'なにに',
    calls: 'よびだし',
    turns: '{count} ターン',
    tokensIn: 'いれた',
    tokensOut: 'だした',
    costColumn: 'ひよう',
    prices: 'Google の ねだんひょうで みつもったよ。ねだんは {date} に たしかめたもの。',
    unpriced:
      '{count}かいの よびだしは ねだんの ない モデルを つかったので、ひように はいっていないよ。',
    loading: 'よみこんでいるよ…',
  },
};
