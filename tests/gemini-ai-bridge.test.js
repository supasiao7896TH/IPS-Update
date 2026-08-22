import { describe, it, expect, beforeEach } from 'vitest';
import { GEMINI_AI_BRIDGE } from '../src/modules/gemini-ai-bridge.js';
import { STATE_STORE } from '../src/modules/state-store.js';

const employees = [
  { id: 1, firstName: 'Sanit', lastName: 'Khumkhana', sectionId: 1, annualTarget: 14 },
  { id: 2, firstName: 'Sasiprapa', lastName: 'Rattananukul', sectionId: 1, annualTarget: 14 },
  { id: 5, firstName: 'Chalermpol', lastName: 'Foowangmor', sectionId: 1, annualTarget: 27 },
];

beforeEach(() => {
  STATE_STORE.set('employees', employees, { silent: true });
});

describe('GEMINI_AI_BRIDGE.matchEmployeeByName', () => {
  it('matches an exact full-name string', () => {
    expect(GEMINI_AI_BRIDGE.matchEmployeeByName('Sanit Khumkhana')?.id).toBe(1);
  });

  it('matches case-insensitively and ignores extra whitespace', () => {
    expect(GEMINI_AI_BRIDGE.matchEmployeeByName('  sanit   khumkhana ')?.id).toBe(1);
  });

  it('matches on first name alone when unambiguous', () => {
    expect(GEMINI_AI_BRIDGE.matchEmployeeByName('Chalermpol')?.id).toBe(5);
  });

  it('tolerates a small OCR-style typo via fuzzy (Levenshtein) matching', () => {
    expect(GEMINI_AI_BRIDGE.matchEmployeeByName('Sasiprapa Rattananuku')?.id).toBe(2);
  });

  it('returns null for a name too different from anyone on the list', () => {
    expect(GEMINI_AI_BRIDGE.matchEmployeeByName('Zzyxxwvu Qqrrsstt')).toBeNull();
  });
});
