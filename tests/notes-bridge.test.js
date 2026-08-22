import { describe, it, expect } from 'vitest';
import { parseKaizenCsv } from '../src/modules/notes-bridge.js';

const CRLF = '\r\n';

describe('parseKaizenCsv', () => {
  it('parses a well-formed CSV (as produced by export-kaizen-from-notes.ps1)', () => {
    const csv = [
      'EmployeeName,Department,Count,Date',
      '"Sanit Khumkhana","PTA","3","01/08/2026"',
      '"Sasiprapa Rattananukul","PTA","5","02/08/2026"',
    ].join(CRLF);

    const { rows, warnings } = parseKaizenCsv(csv);

    expect(warnings).toEqual([]);
    expect(rows).toEqual([
      { name: 'Sanit Khumkhana', department: 'PTA', count: 3, date: '01/08/2026' },
      { name: 'Sasiprapa Rattananukul', department: 'PTA', count: 5, date: '02/08/2026' },
    ]);
  });

  it('strips a leading UTF-8 BOM before parsing', () => {
    const csv = '﻿' + 'EmployeeName,Department,Count,Date' + CRLF + '"A","B","1","2026"';
    const { rows } = parseKaizenCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('A');
  });

  it('skips rows with a non-numeric count and reports a warning instead of throwing', () => {
    const csv = [
      'EmployeeName,Department,Count,Date',
      '"Good Name","PTA","4","2026"',
      '"Bad Row","PTA","not-a-number","2026"',
    ].join(CRLF);

    const { rows, warnings } = parseKaizenCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Good Name');
    expect(warnings).toHaveLength(1);
  });

  it('returns an empty result with a warning when required columns are missing', () => {
    const csv = 'Foo,Bar' + CRLF + '"1","2"';
    const { rows, warnings } = parseKaizenCsv(csv);
    expect(rows).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
