declare module 'csv-parse/sync' {
  function parse(input: Buffer | string, options?: Record<string, unknown>): unknown[];
  export { parse };
}
