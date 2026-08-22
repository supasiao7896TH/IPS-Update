function parseCsvLine(line) {
    const fields = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; }
                else { inQuotes = false; }
            } else {
                cur += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            fields.push(cur); cur = '';
        } else {
            cur += ch;
        }
    }
    fields.push(cur);
    return fields;
}

export function parseKaizenCsv(text) {
    const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    const lines = clean.split(/\r\n|\n/).filter(l => l.trim() !== '');
    const warnings = [];
    if (lines.length === 0) return { rows: [], warnings: ['ไฟล์ CSV ว่างเปล่า'] };

    const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
    const idx = {
        name: header.indexOf('employeename'),
        department: header.indexOf('department'),
        count: header.indexOf('count'),
        date: header.indexOf('date'),
    };
    if (idx.name === -1 || idx.count === -1) {
        return { rows: [], warnings: ['ไม่พบคอลัมน์ EmployeeName หรือ Count ใน header ของไฟล์ CSV'] };
    }

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const fields = parseCsvLine(lines[i]);
        const name = (fields[idx.name] || '').trim();
        const countRaw = (fields[idx.count] || '').trim();
        const count = parseInt(countRaw, 10);
        if (!name) { warnings.push(`แถวที่ ${i + 1}: ไม่มีชื่อพนักงาน — ข้าม`); continue; }
        if (isNaN(count) || count < 0) { warnings.push(`แถวที่ ${i + 1}: จำนวน "${countRaw}" ไม่ใช่ตัวเลขที่ถูกต้อง — ข้าม`); continue; }
        rows.push({
            name,
            department: idx.department >= 0 ? (fields[idx.department] || '').trim() : '',
            count,
            date: idx.date >= 0 ? (fields[idx.date] || '').trim() : '',
        });
    }
    return { rows, warnings };
}

// The PowerShell export writes Date as "MM/YYYY" (one CSV = one target month).
// Used by the silent auto-sync path, which has no year/month <select> to read from.
export function parsePeriodFromDate(dateStr) {
    const m = /^(\d{1,2})\/(\d{4})$/.exec((dateStr || '').trim());
    if (!m) return null;
    const month = parseInt(m[1], 10);
    const year = parseInt(m[2], 10);
    if (month < 1 || month > 12) return null;
    return { year, month };
}

export function getPeriodFromRows(rows) {
    for (const r of rows) {
        const period = parsePeriodFromDate(r.date);
        if (period) return period;
    }
    return null;
}
