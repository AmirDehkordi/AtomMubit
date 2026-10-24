import type { Correction, MubitStatus } from "@/api/types"

/**
 * New kept examples Mubit needs before it trains the next version:
 * the threshold (default 25), and at least minNewFraction of the live version's examples.
 */
export function examplesForNextVersion(m: Pick<MubitStatus, "threshold" | "liveExamples" | "minNewFraction">) {
  return Math.max(m.threshold, Math.ceil(m.minNewFraction * m.liveExamples))
}

/** The status with this session's fixes counted in as kept examples for the task. */
export function withSessionFixes(m: MubitStatus, corrections: Pick<Correction, "field">[]): MubitStatus {
  const n = corrections.length
  return {
    ...m,
    kept: m.kept + n,
    newSinceVersion: m.newSinceVersion + n,
    routing: m.routing.map((r) => (r.task === m.task ? { ...r, kept: r.kept + n } : r)),
  }
}
