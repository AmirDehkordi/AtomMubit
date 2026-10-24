// The boundary between the desk and the extraction module (built separately).
// See docs/extraction-contract.md.

/** One HTML document of a filing, exactly as the SEC serves it. */
export interface FilingDocument {
  /** "10-Q", "10-K", or an exhibit type such as "EX-99.1" (press release) or "EX-99.2". */
  type: string;
  url: string;
  /** Raw HTML (inline XBRL for 10-Q and 10-K). Not cleaned or trimmed. */
  html: string;
}

/** Everything the extraction module needs to read one filing. The desk fetches it all. */
export interface ExtractionJob {
  accession: string;
  projectId: string;
  company: { cik: number; ticker: string; name: string; /** MM-DD */ fiscalYearEnd: string };
  filing: {
    form: string;
    periodEnd: string;
    fiscalYear: number;
    /** Q1–Q3, or FY for a 10-K. */
    fiscalPeriod: string;
    /** "Q2 FY2027"; a 10-K is "Q4 FY2026"; an 8-K is the quarter its release reports on. */
    quarter: string;
    filedAt: string;
  };
  /** The main document first: the 10-Q/10-K itself, or Exhibit 99.1 for an 8-K. */
  documents: FilingDocument[];
}

/** What `ExtractionApi.extractFiling` resolves with once a filing is fully read. */
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

/** A person corrected a block and confirmed a rule: read these sections again with the active rules. */
export interface RereadRequest {
  projectId: string;
  /** Sections to re-read, possibly across several filings of the project. */
  sectionIds: string[];
  /** Why: the correction and the rule it added or pointed at. */
  correctionId: string;
  ruleCode: string;
}

/** The service the extraction module provides to the rest of the API. */
export interface ExtractionApi {
  /** Reads one filing. Idempotent: a finished filing returns its summary without new LLM calls. */
  extractFiling(job: ExtractionJob): Promise<ExtractionSummary>;
  /**
   * Re-runs section_extractor on already-read sections with the current active rules (always,
   * even if they were read before), replaces their blocks and checks, and streams `block` and
   * `extraction` events. Each re-run call is a corrected example Mubit can keep.
   */
  rereadSections(request: RereadRequest): Promise<void>;
}
