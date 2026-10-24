// The boundary between the desk and the extraction module (built separately).
// See docs/extraction-contract.md.

/** What `ExtractionService.extractFiling` resolves with once a filing is fully read. */
export interface ExtractionSummary {
  accession: string;
  sectionsTotal: number;
  sectionsDone: number;
  blocks: number;
  /** Blocks whose checks all passed first time. */
  verified: number;
  /** Blocks that passed after a re-run with an added rule. */
  fixed: number;
  /** Blocks that still fail and need a person. */
  review: number;
}

/** The service the extraction module provides to the rest of the API. */
export interface ExtractionApi {
  /** Reads one filing (already found by find_filings). Idempotent: a finished filing returns its summary. */
  extractFiling(accession: string, projectId: string): Promise<ExtractionSummary>;
}
