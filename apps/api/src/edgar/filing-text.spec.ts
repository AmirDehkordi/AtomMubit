import { describe, expect, it } from 'vitest';
import { htmlToPassages, rankPassages } from './filing-text';

describe('htmlToPassages', () => {
  it('turns paragraphs and table rows into lines and drops the XBRL header', () => {
    const html = `<html><body><ix:header><ix:hidden>secret facts that are hidden</ix:hidden></ix:header>
      <p>Revenue for the second quarter was $96.2&#160;billion, up 18% from the prior quarter, driven by Data Center.</p>
      <table><tr><td>Revenue</td><td>$</td><td>96,221</td><td>81,615</td><td>46,743 thousand</td></tr></table></body></html>`;
    const lines = htmlToPassages(html);
    expect(lines[0]).toBe('Revenue for the second quarter was $96.2 billion, up 18% from the prior quarter, driven by Data Center.');
    expect(lines[1]).toBe('Revenue | $ | 96,221 | 81,615 | 46,743 thousand');
    expect(lines.join(' ')).not.toContain('secret');
  });
});

describe('rankPassages', () => {
  const passages = [
    'We are a global technology company headquartered in Santa Clara, California.',
    'Data Center revenue increased 112% from a year ago, driven by demand for Blackwell systems from cloud providers.',
    'Revenue was $96.2 billion for the quarter.',
    'For the third quarter, revenue is expected to be $108.0 billion, plus or minus 2%.',
  ];
  it('prefers explanations for why-questions', () => {
    expect(rankPassages(passages, 'What drove data center revenue growth?', 2)[0]!.index).toBe(1);
  });
  it('prefers outlook language for guidance questions', () => {
    expect(rankPassages(passages, 'What revenue guidance did they give for next quarter?', 2)[0]!.index).toBe(3);
  });
});
