import { describe, it, expect } from 'vitest';
import { parseKaizenCsv, parsePeriodFromDate, getPeriodFromRows } from '../src/modules/notes-bridge.js';

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

describe('parsePeriodFromDate', () => {
  it('parses the MM/YYYY format written by export-kaizen-from-notes.ps1', () => {
    expect(parsePeriodFromDate('07/2026')).toEqual({ year: 2026, month: 7 });
    expect(parsePeriodFromDate('12/2025')).toEqual({ year: 2025, month: 12 });
  });

  it('returns null for an unrecognized or empty date string', () => {
    expect(parsePeriodFromDate('')).toBeNull();
    expect(parsePeriodFromDate('not a date')).toBeNull();
    expect(parsePeriodFromDate('13/2026')).toBeNull();
  });
});

describe('getPeriodFromRows', () => {
  it('derives {year, month} from the first row with a parseable date', () => {
    const rows = [
      { name: 'A', department: 'PE1', count: 1, date: '07/2026' },
      { name: 'B', department: 'PE1', count: 2, date: '07/2026' },
    ];
    expect(getPeriodFromRows(rows)).toEqual({ year: 2026, month: 7 });
  });

  it('returns null when no row has a usable date', () => {
    expect(getPeriodFromRows([{ name: 'A', department: '', count: 1, date: '' }])).toBeNull();
    expect(getPeriodFromRows([])).toBeNull();
  });
});
