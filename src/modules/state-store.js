import { DEBUG_MODULE } from './debug-module.js';
import { CLOUD_SYNC_MANAGER } from './cloud-sync-manager.js';
import { UI_RENDERER } from './ui-renderer.js';

        // ─── STATE_STORE — reactive pub/sub + optimistic update/rollback ────
export const STATE_STORE = (() => {
            'use strict';
            const _state = {
                sections: [], employees: [], activities: [],
                currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
                filterYear: new Date().getFullYear(), filterSection: 'all',
                globalTarget: 12,
                geminiKeyConfigured: false,
                cloudSyncStatus: 'offline',
            };
            const _subs = new Map();

            function get(key) { return key === undefined ? _state : _state[key]; }

            function set(key, value, opts) {
                opts = opts || {};
                const prev = _state[key];
                _state[key] = value;
                if (!opts.silent) _emit(key, value, prev);
            }

            function _emit(key, value, prev) {
                const s = _subs.get(key);
                if (!s) return;
                s.forEach(fn => {
                    try { fn(value, prev); } catch (err) { DEBUG_MODULE.log('error', `STATE_STORE.subscriber:${key}`, err); }
                });
            }

            function on(key, fn) {
                if (!_subs.has(key)) _subs.set(key, new Set());
                _subs.get(key).add(fn);
                return () => off(key, fn);
            }
            function off(key, fn) {
                const s = _subs.get(key);
                if (s) s.delete(fn);
            }

            async function optimisticUpdate(key, nextValue, persistFn) {
                const prev = get(key);
                set(key, nextValue);
                try {
                    await persistFn(nextValue);
                    CLOUD_SYNC_MANAGER.pushChange(key, nextValue);
                } catch (err) {
                    set(key, prev);
                    UI_RENDERER.showNotification('บันทึกไม่สำเร็จ กู้คืนข้อมูลเดิมแล้ว', 'error');
                    DEBUG_MODULE.log('error', `optimisticUpdate:${key}`, err);
                    throw err;
                }
            }

            return { get, set, on, off, optimisticUpdate };
        })();
