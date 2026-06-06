// pdf-parse-new ships no type declarations for its subpath entries (only the
// package-root index.d.ts). We import "pdf-parse-new/lib/pdf-parse.js" directly
// to avoid the broken top-level require.resolve() in index.js (see
// text-extractor.ts), so re-declare that subpath here, reusing the root types.
declare module "pdf-parse-new/lib/pdf-parse.js" {
  import type { Options, Result } from "pdf-parse-new"

  const pdfParse: (dataBuffer: Buffer, options?: Options) => Promise<Result>
  export default pdfParse
}
