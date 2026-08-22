import { APP_CONFIG } from './app-config.js';
import { DEBUG_MODULE } from './debug-module.js';
import { CLOUD_SYNC_MANAGER } from './cloud-sync-manager.js';
import { GEMINI_AI_BRIDGE } from './gemini-ai-bridge.js';
import { UI_RENDERER } from './ui-renderer.js';
import { HAS_STORAGE } from './utils.js';

        // ─── STORAGE_ENGINE — IndexedDB (Promise-based) + one-time migration ─
export const STORAGE_ENGINE = (() => {
            'use strict';
            let _db = null;

            function _hasIndexedDB() { return 'indexedDB' in window; }

            function _openDb() {
                return new Promise((resolve, reject) => {
                    if (!_hasIndexedDB()) { reject(new Error('IndexedDB unavailable')); return; }
                    const req = indexedDB.open(APP_CONFIG.DB_NAME, APP_CONFIG.DB_VERSION);
                    req.onupgradeneeded = (e) => {
                        const db = e.target.result;
                        if (e.oldVersion < 1) {
                            db.createObjectStore('sections', { keyPath: 'id' });
                            const emp = db.createObjectStore('employees', { keyPath: 'id' });
                            emp.createIndex('by_sectionId', 'sectionId');
                            const act = db.createObjectStore('activities', { keyPath: 'id', autoIncrement: true });
                            act.createIndex('by_emp_year_month', ['employeeId', 'year', 'month'], { unique: true });
                            act.createIndex('by_employeeId', 'employeeId');
                            act.createIndex('by_year', 'year');
                            db.createObjectStore('settings', { keyPath: 'key' });
                            db.createObjectStore('cryptoKeys', { keyPath: 'name' });
                        }
                    };
                    req.onsuccess = (e) => resolve(e.target.result);
                    req.onerror = () => reject(req.error);
                });
            }

            async function _getDb() {
                if (!_db) _db = await _openDb();
                return _db;
            }

            async function _tx(storeNames, mode) {
                const db = await _getDb();
                return db.transaction(storeNames, mode);
            }

            async function getAll(storeName) {
                const tx = await _tx(storeName, 'readonly');
                return new Promise((resolve, reject) => {
                    const req = tx.objectStore(storeName).getAll();
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            }

            async function get(storeName, key) {
                const tx = await _tx(storeName, 'readonly');
                return new Promise((resolve, reject) => {
                    const req = tx.objectStore(storeName).get(key);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            }

            async function put(storeName, value) {
                const tx = await _tx(storeName, 'readwrite');
                return new Promise((resolve, reject) => {
                    const req = tx.objectStore(storeName).put(value);
                    req.onsuccess = () => { CLOUD_SYNC_MANAGER.pushChange(storeName, value); resolve(req.result); };
                    req.onerror = () => reject(req.error);
                });
            }

            // Clear-then-bulk-put a whole store inside one transaction (used for import / full-collection save)
            async function replaceAll(storeName, rows) {
                const db = await _getDb();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    store.clear();
                    rows.forEach(r => store.put(r));
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
            }

            async function _seedIfEmpty() {
                const existingSections = await getAll('sections');
                if (existingSections.length > 0) return;
                const d = APP_CONFIG.DEFAULT_DATA;
                await replaceAll('sections', JSON.parse(JSON.stringify(d.sections)));
                await replaceAll('employees', JSON.parse(JSON.stringify(d.employees)));
                await replaceAll('activities', JSON.parse(JSON.stringify(d.activities)).map((a, i) => ({ id: i + 1, ...a })));
            }

            async function migrateFromLocalStorage() {
                try {
                    const db = await _getDb();
                    const already = await get('settings', 'migration_localStorage_v1');
                    if (already && already.value) return;

                    if (!HAS_STORAGE) {
                        await _seedIfEmpty();
                        await put('settings', { key: 'migration_localStorage_v1', value: true });
                        return;
                    }

                    const sRaw = localStorage.getItem(APP_CONFIG.storageKeys.sections);
                    const eRaw = localStorage.getItem(APP_CONFIG.storageKeys.employees);
                    const aRaw = localStorage.getItem(APP_CONFIG.storageKeys.activities);

                    if (sRaw && eRaw && aRaw) {
                        const sections   = JSON.parse(sRaw);
                        const employees  = JSON.parse(eRaw);
                        const activities = JSON.parse(aRaw).map((a, i) => ({ id: i + 1, ...a }));

                        await new Promise((resolve, reject) => {
                            const tx = db.transaction(['sections', 'employees', 'activities', 'settings'], 'readwrite');
                            sections.forEach(s => tx.objectStore('sections').put(s));
                            employees.forEach(e => tx.objectStore('employees').put(e));
                            activities.forEach(a => tx.objectStore('activities').put(a));
                            const gt = localStorage.getItem('kaizen_global_target');
                            if (gt) tx.objectStore('settings').put({ key: 'globalTarget', value: parseInt(gt, 10) || 12 });
                            const author = localStorage.getItem('kaizen_report_author');
                            if (author) tx.objectStore('settings').put({ key: 'reportAuthor', value: author });
                            tx.oncomplete = resolve;
                            tx.onerror = () => reject(tx.error);
                        });

                        const rawKey = localStorage.getItem('kaizen_gemini_key');
                        if (rawKey) { await GEMINI_AI_BRIDGE.encryptAndStoreApiKey(rawKey); }

                        localStorage.removeItem(APP_CONFIG.storageKeys.sections);
                        localStorage.removeItem(APP_CONFIG.storageKeys.employees);
                        localStorage.removeItem(APP_CONFIG.storageKeys.activities);
                        localStorage.removeItem('kaizen_global_target');
                        localStorage.removeItem('kaizen_gemini_key');
                        localStorage.removeItem('kaizen_report_author');
                    } else {
                        await _seedIfEmpty();
                    }

                    await put('settings', { key: 'migration_localStorage_v1', value: true });
                } catch (err) {
                    DEBUG_MODULE.log('error', 'STORAGE_ENGINE.migrateFromLocalStorage', err);
                    UI_RENDERER.showNotification('การย้ายข้อมูลไม่สำเร็จ — ข้อมูลเดิมยังปลอดภัยอยู่ (ไม่ถูกลบ)', 'error');
                }
            }

            async function loadAll() {
                const [sections, employees, activities, gtRec] = await Promise.all([
                    getAll('sections'), getAll('employees'), getAll('activities'), get('settings', 'globalTarget'),
                ]);
                return { sections, employees, activities, globalTarget: gtRec ? gtRec.value : 12 };
            }

            async function saveSections(sections)   { await replaceAll('sections', sections); }
            async function saveEmployees(employees) { await replaceAll('employees', employees); }
            async function saveActivities(activities) { await replaceAll('activities', activities); }
            async function saveGlobalTarget(value)  { await put('settings', { key: 'globalTarget', value }); }
            async function saveReportAuthor(value)  { await put('settings', { key: 'reportAuthor', value }); }

            function _stripActivityIds(activities) {
                return activities.map(a => { const { id, ...rest } = a; return rest; });
            }

            function exportJson(sections, employees, activities) {
                const str  = JSON.stringify({ sections, employees, activities: _stripActivityIds(activities) }, null, 2);
                const blob = new Blob([str], { type: 'application/json' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href = url; a.download = `kaizen_data_${new Date().toISOString().slice(0,10)}.json`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            }

            function serializeForExport(sections, employees, activities) {
                return JSON.stringify({ sections, employees, activities: _stripActivityIds(activities) })
                    .replace(/<\/script>/gi, '<\\/script>');
            }

            function parseImportFile(file) {
                return new Promise((resolve, reject) => {
                    const r = new FileReader();
                    r.onload = (e) => {
                        try {
                            const d = JSON.parse(e.target.result);
                            if (!Array.isArray(d.sections) || !Array.isArray(d.employees) || !Array.isArray(d.activities)) {
                                reject(new Error('invalid-shape')); return;
                            }
                            const toInt = (v, dflt) => { dflt = dflt || 0; const n = parseInt(v, 10); return Number.isNaN(n) ? dflt : n; };
                            const sections   = d.sections.map(s => ({ ...s, id: toInt(s.id) }));
                            const employees  = d.employees.map(emp => ({ ...emp, id: toInt(emp.id),
                                sectionId: emp.sectionId == null ? null : toInt(emp.sectionId), annualTarget: toInt(emp.annualTarget) }));
                            const activities = d.activities.map((a, i) => ({ id: i + 1, ...a, employeeId: toInt(a.employeeId),
                                year: toInt(a.year), month: toInt(a.month), count: toInt(a.count) }));
                            resolve({ sections, employees, activities });
                        } catch (err) { reject(err); }
                    };
                    r.onerror = () => reject(new Error('read-error'));
                    r.readAsText(file);
                });
            }

            return {
                migrateFromLocalStorage, loadAll,
                saveSections, saveEmployees, saveActivities, saveGlobalTarget, saveReportAuthor,
                exportJson, serializeForExport, parseImportFile, get, put,
            };
        })();
