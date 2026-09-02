// 0019 R5. Types for 0008's contrast probe, so `contrast.test.ts` can import it
// from a `strict` project instead of receiving `any`.
//
// Sits beside the `.mjs` rather than in a `declare module` block, because the
// import is a RELATIVE specifier and `declare module '../../x'` does not match
// one — TypeScript resolves a sibling `.d.mts` by path, which does.
/** WCAG relative-luminance contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number
