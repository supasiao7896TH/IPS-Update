import { describe, it, expect } from 'vitest';
import { STORAGE_ENGINE } from '../src/modules/storage-engine.js';

describe('STORAGE_ENGINE.serializeForExport', () => {
  it('escapes a literal </script> sequence so embedded data cannot break out of the injector tag', () => {
    const sections = [];
    const employees = [{ id: 1, firstName: '</script><script>alert(1)</script>', lastName: 'X', sectionId: null, annualTarget: 12 }];
    const activities = [{ id: 1, employeeId: 1, year: 2026, month: 1, count: 1 }];

    const out = STORAGE_ENGINE.serializeForExport(sections, employees, activities);

    expect(out).not.toMatch(/<\/script>/i);
    expect(out).toContain('<\\/script>');
    // round-trips back to the same data once un-escaped, so the export stays lossless
    expect(JSON.parse(out.replace(/<\\\/script>/gi, '</script>')).employees[0].firstName)
      .toBe('</script><script>alert(1)</script>');
  });

  it('strips the auto-increment id from activities before export (re-assigned on import)', () => {
    const out = STORAGE_ENGINE.serializeForExport([], [], [{ id: 99, employeeId: 1, year: 2026, month: 1, count: 3 }]);
    expect(JSON.parse(out).activities[0]).not.toHaveProperty('id');
  });
});
