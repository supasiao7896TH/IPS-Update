import { APP_CONFIG } from './app-config.js';
import { DEBUG_MODULE } from './debug-module.js';
import { STATE_STORE } from './state-store.js';

        // ─── AUTH_PROVIDER — scaffold only, no Firebase SDK wired this pass ──
export const AUTH_PROVIDER = (() => {
            'use strict';
            let _currentUser = null;

            async function signInAnonymously() {
                if (!APP_CONFIG.features.authEnabled) {
                    DEBUG_MODULE.log('info', 'AUTH_PROVIDER.signInAnonymously', 'skipped — feature flag off');
                    return null;
                }
                // TODO(future pass): import firebase-auth.js, setPersistence(auth, inMemoryPersistence)
                //   BEFORE signInAnonymously(auth) — required because LINE/FB/IG WebViews block IndexedDB
                //   and default persistence would fail there.
                throw new Error('AUTH_PROVIDER not wired to Firebase yet');
            }
            function getCurrentUser() { return _currentUser; }
            function onAuthStateChanged(fn) { return STATE_STORE.on('authUser', fn); }
            return { signInAnonymously, getCurrentUser, onAuthStateChanged, isEnabled: () => APP_CONFIG.features.authEnabled };
        })();
