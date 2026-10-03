/** A markdown file imported with `with { type: 'text' }`: its contents as a string. */
declare module '*.md' {
  /** The file's text. */
  const text: string;
  export default text;
}
