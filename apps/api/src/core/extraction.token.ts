/**
 * Nest injection token for the extraction module's `ExtractionApi`
 * (packages/shared/src/extraction.ts). The desk's stub provides it until the
 * real ExtractionModule does: `{ provide: EXTRACTION_API, useExisting: ExtractionService }`.
 */
export const EXTRACTION_API = Symbol('EXTRACTION_API');
