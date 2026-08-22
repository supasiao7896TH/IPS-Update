import { describe, it, expect } from 'vitest';
import { escHtml } from '../src/modules/utils.js';

describe('escHtml', () => {
  it('escapes all five XSS-relevant characters', () => {
    expect(escHtml(`<script>alert('x')&"y"</script>`))
      .toBe('&lt;script&gt;alert(&#39;x&#39;)&amp;&quot;y&quot;&lt;/script&gt;');
  });

  it('treats null/undefined as empty string instead of the literal word', () => {
    expect(escHtml(null)).toBe('');
    expect(escHtml(undefined)).toBe('');
  });

  it('coerces non-string input to a string first', () => {
    expect(escHtml(42)).toBe('42');
  });
});
