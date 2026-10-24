#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';

const reportPath = `/tmp/atommubit-benchmark-test-${process.pid}.json`;
try {
  const result = spawnSync(process.execPath, ['benchmarks/run.mjs', '--report', reportPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.mode, 'offline_fake');
  assert.equal(report.complete, true);
  assert.equal(report.attempts.length, 10);
  assert.equal(report.repetitions, 5);
  assert.equal(report.paired.length, 5);
  assert.equal(report.summary.direct.attempts, 5);
  assert.equal(report.summary.mubit.attempts, 5);
  assert.ok(report.attempts.every((a) => a.latencyMs === null && a.estimatedCostUsd === null && a.billedCostUsd === null));
  assert.ok(report.attempts.every((a) => a.score.factAccuracy === 1 && a.score.evidenceAccuracy === 1));
  assert.ok(report.summary.direct.latencyP50Ms === null && report.summary.mubit.latencyP95Ms === null);
  process.stdout.write('benchmark offline harness: ok\n');
} finally { await rm(reportPath, { force: true }); }
