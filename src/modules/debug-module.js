        // ─── DEBUG_MODULE ───────────────────────────────────────────────────
export const DEBUG_MODULE = (() => {
            'use strict';
            const _log = [];
            function log(level, scope, errOrMsg) {
                const entry = {
                    ts: new Date().toISOString(), level, scope,
                    message: (errOrMsg && errOrMsg.message) ? errOrMsg.message : String(errOrMsg),
                    stack: errOrMsg && errOrMsg.stack,
                };
                _log.push(entry);
                (level === 'error' ? console.error : console.log)(`[${scope}]`, errOrMsg);
                return entry;
            }
            function getLog() { return _log.slice(); }
            return { log, getLog };
        })();
