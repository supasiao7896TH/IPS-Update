import { APP_CONFIG } from './app-config.js';
import { DEBUG_MODULE } from './debug-module.js';
import { STATE_STORE } from './state-store.js';

        // ─── CLOUD_SYNC_MANAGER — scaffold only, no Firestore SDK wired this pass
export const CLOUD_SYNC_MANAGER = (() => {
            'use strict';

            async function pushChange(collection, doc) {
                if (!APP_CONFIG.features.cloudSyncEnabled) {
                    DEBUG_MODULE.log('info', 'CLOUD_SYNC_MANAGER.pushChange', `no-op (${collection})`);
                    return { queued: false };
                }
                // TODO(future pass): Firestore v11 setDoc under artifacts/{appId}/public/data/{collection}/{docId}
                //   Last-Write-Wins conflict resolution, Dead Letter Queue on repeated failure, Circuit Breaker
                //   after N consecutive failures.
                return { queued: false };
            }
            function subscribeCollection(collection, onChange) {
                if (!APP_CONFIG.features.cloudSyncEnabled) return () => {};
                // TODO(future pass): onSnapshot(collectionRef, snapshot => { ...docChanges handling... })
                return () => {};
            }
            function getStatus() { return STATE_STORE.get('cloudSyncStatus'); }
            return { pushChange, subscribeCollection, getStatus, isEnabled: () => APP_CONFIG.features.cloudSyncEnabled };
        })();
