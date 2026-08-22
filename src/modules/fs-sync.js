import { STORAGE_ENGINE } from './storage-engine.js';
import { DEBUG_MODULE } from './debug-module.js';
import { parseKaizenCsv, getPeriodFromRows } from './notes-bridge.js';

function logSkip(reason) { DEBUG_MODULE.log('info', 'FS_SYNC', `skipped: ${reason}`); }

const HANDLE_KEY = 'notesCsvHandle';
const LAST_SYNCED_KEY = 'notesCsvLastSyncedAt';

export function isSupported() {
    return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

// One-time, user-gesture-triggered setup: let the user pick the CSV file once,
// then remember the handle (IndexedDB can store FileSystemFileHandle directly
// in Chromium) so later syncs don't need the file re-selected from scratch.
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
    return !!(rec && rec.value);
}

async function performSync(handle, saveExtractedActivities) {
    const file = await handle.getFile();
    const lastSyncedRec = await STORAGE_ENGINE.get('settings', LAST_SYNCED_KEY);
    const lastSyncedAt = lastSyncedRec ? lastSyncedRec.value : 0;
    if (file.lastModified <= lastSyncedAt) { logSkip(`file not newer (file.lastModified=${file.lastModified}, lastSyncedAt=${lastSyncedAt})`); return null; }

    const text = await file.text();
    const { rows } = parseKaizenCsv(text);
    if (!rows.length) { logSkip('CSV parsed to zero rows'); return null; }

    const period = getPeriodFromRows(rows);
    if (!period) { logSkip('could not derive {year, month} from the CSV\'s Date column'); return null; }

    const extracted = rows.map(r => ({ name: r.name, count: r.count }));
    const result = await saveExtractedActivities(extracted, period.year, period.month);

    await STORAGE_ENGINE.put('settings', { key: LAST_SYNCED_KEY, value: file.lastModified });

    return { ...result, year: period.year, month: period.month, fileName: file.name };
}

// Called automatically on every app load, with NO user gesture available.
// requestPermission() throws SecurityError without a gesture (confirmed on-site:
// browsers do not persist a "granted" File System Access permission across a
// page reload for a plain, non-installed page) -- so this only ever checks
// queryPermission(), never requests it. If that alone already says "granted"
// (best case, browser/session dependent), it syncs silently with no click at
// all. Otherwise it just logs why and does nothing -- resumeSync() (below) is
// the real fallback, wired to the "ตั้งค่า Auto-Sync" button's click.
export async function trySilentSync(saveExtractedActivities) {
    if (!isSupported()) { logSkip('File System Access API not supported in this browser'); return null; }

    const handleRec = await STORAGE_ENGINE.get('settings', HANDLE_KEY);
    if (!handleRec || !handleRec.value) { logSkip('no stored file handle -- run "ตั้งค่า Auto-Sync" first'); return null; }
    const handle = handleRec.value;

    try {
        const perm = await handle.queryPermission({ mode: 'read' });
        if (perm !== 'granted') {
            logSkip(`permission not currently granted (queryPermission="${perm}") -- click "ตั้งค่า Auto-Sync" to resume`);
            return null;
        }
        return await performSync(handle, saveExtractedActivities);
    } catch (err) {
        DEBUG_MODULE.log('error', 'FS_SYNC', err);
        return null;
    }
}

// Called from a real click (has a user gesture) on the same "ตั้งค่า Auto-Sync"
// button once a handle already exists -- re-confirms permission on the
// already-picked file (no need to re-browse for it) and syncs immediately.
export async function resumeSync(saveExtractedActivities) {
    const handleRec = await STORAGE_ENGINE.get('settings', HANDLE_KEY);
    if (!handleRec || !handleRec.value) {
        throw new Error('ยังไม่เคยตั้งค่า Auto-Sync — กรุณาเลือกไฟล์ก่อน');
    }
    const handle = handleRec.value;
    const perm = await handle.requestPermission({ mode: 'read' });
    if (perm !== 'granted') {
        throw new Error('ไม่ได้รับอนุญาตให้เข้าถึงไฟล์');
    }
    return await performSync(handle, saveExtractedActivities);
}
