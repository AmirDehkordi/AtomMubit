const close = (a,b) => typeof a === 'number' && Math.abs(a-b) <= Math.max(1e-9, Math.abs(b)*1e-9);
export function scoreCase(example, result) {
  const fields = example.gold.map(gold => {
    const candidates = (result?.facts ?? []).filter(entry => entry.fact.key === gold.key);
    const numeric = candidates.filter(entry => entry.fact.value !== null || entry.fact.range !== null);
    if (gold.missing) {
      const explicit = candidates.some(entry => entry.sectionId !== null && entry.fact.value === null && entry.fact.range === null && entry.fact.missingReason);
      return {key:gold.key, modelCorrect:explicit && numeric.length===0, verifiedCorrect:explicit && numeric.length===0, expected:gold, actual:candidates.map(entry=>entry.fact), reason:explicit && numeric.length===0?null:'Missing value was invented, omitted, or only filled by application fallback'};
    }
    const matches = fact => close(fact.value,gold.value) && fact.currency===gold.currency && fact.unit===gold.unit && fact.scale===gold.scale && fact.basis===gold.basis && fact.period?.end===gold.periodEnd && fact.period?.months===gold.months;
    const modelCorrect = numeric.length>0 && numeric.every(entry=>matches(entry.fact));
    const verifiedCorrect = modelCorrect && numeric.every(entry=>entry.supported);
    return {key:gold.key,modelCorrect,verifiedCorrect,expected:gold,actual:candidates.map(entry=>entry.fact),reason:!modelCorrect?'Value, currency, unit, scale, basis, or period mismatch':!verifiedCorrect?'Correct fields failed source-evidence validation':null};
  });
  return {fields,modelCorrect:fields.every(f=>f.modelCorrect),verifiedCorrect:fields.every(f=>f.verifiedCorrect),unexpectedFields:[...new Set((result?.facts??[]).filter(f=>!example.fields.includes(f.fact.key)).map(f=>f.fact.key))]};
}
export function summarize(cases,calls,planned) {
  const fields=cases.flatMap(c=>c.score.fields), times=calls.filter(c=>c.ok).map(c=>c.latencyMs).sort((a,b)=>a-b);
  const percentile=p=>times.length?times[Math.max(0,Math.ceil(times.length*p)-1)]:null;
  const completeUsage=calls.length>0&&calls.every(c=>c.inputTokens!==null&&c.outputTokens!==null);
  return {plannedCases:planned,completedCases:cases.length,modelCalls:calls.length,successfulCalls:calls.filter(c=>c.ok).length,
    modelCorrectCases:cases.filter(c=>c.score.modelCorrect).length,verifiedCorrectCases:cases.filter(c=>c.score.verifiedCorrect).length,
    expectedFields:fields.length,modelCorrectFields:fields.filter(f=>f.modelCorrect).length,verifiedCorrectFields:fields.filter(f=>f.verifiedCorrect).length,
    p50CallLatencyMs:percentile(.5),p95CallLatencyMs:percentile(.95),usageComplete:completeUsage,
    reportedInputTokens:calls.reduce((n,c)=>n+(c.inputTokens??0),0),reportedOutputTokens:calls.reduce((n,c)=>n+(c.outputTokens??0),0),billedCostUsd:null};
}
