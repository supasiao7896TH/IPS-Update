import { STORAGE_ENGINE } from './storage-engine.js';
import { parseKaizenCsv, getPeriodFromRows } from './notes-bridge.js';

const HANDLE_KEY = 'notesCsvHandle';
const LAST_SYNCED_KEY = 'notesCsvLastSyncedAt';

export function isSupported() {
    return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

// One-time, user-gesture-triggered setup: let the user pick the CSV file once,
// then remember the handle (IndexedDB can store FileSystemFileHandle directly
// in Chromium) so every later page load can re-read it with no further clicks.
export async function setupAutoSync() {
    if (!isSupported()) {
        throw new Error('เบราว์เซอร์นี้ไม่รองรับ Auto-Sync (ต้องใช้ Chrome หรือ Edge)');
    }
    const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
    });
    await STORAGE_ENGINE.put('settings', { key: HANDLE_KEY, value: handle });
    await STORAGE_ENGINE.put('settings', { key: LAST_SYNCED_KEY, value: 0 });
    return handle;
}

export async function hasStoredHandle() {
    const rec = await STORAGE_ENGINE.get('settings', HANDLE_KEY);
    return !!rec;
}

// Called on every app load. Silent by design: any failure (no handle yet,
// permission not granted without a user gesture, file missing, nothing new
// to import) just resolves to null with no error surfaced -- the existing
// manual "นำเข้าจาก Lotus Notes (CSV)" button is always available as a fallback.
export async function trySilentSync(saveExtractedActivities) {
    if (!isSupported()) return null;

    const handleRec = await STORAGE_ENGINE.get('settings', HANDLE_KEY);
    if (!handleRec || !handleRec.value) return null;
    const handle = handleRec.value;

    try {
        let perm = await handle.queryPermission({ mode: 'read' });
        if (perm !== 'granted') {
            // Not a user gesture here (called from app init) -- most browsers will just
            // resolve this to 'denied' rather than prompting, but it's a safe no-op either way.
            perm = await handle.requestPermission({ mode: 'read' });
        }
        if (perm !== 'granted') return null;

        const file = await handle.getFile();
        const lastSyncedRec = await STORAGE_ENGINE.get('settings', LAST_SYNCED_KEY);
        const lastSyncedAt = lastSyncedRec ? lastSyncedRec.value : 0;
        if (file.lastModified <= lastSyncedAt) return null;

        const text = await file.text();
        const { rows } = parseKaizenCsv(text);
        if (!rows.length) return null;

        const period = getPeriodFromRows(rows);
        if (!period) return null;

        const extracted = rows.map(r => ({ name: r.name, count: r.count }));
        const result = await saveExtractedActivities(extracted, period.year, period.month);

        await STORAGE_ENGINE.put('settings', { key: LAST_SYNCED_KEY, value: file.lastModified });

        return { ...result, year: period.year, month: period.month, fileName: file.name };
    } catch (err) {
        return null;
    }
}
