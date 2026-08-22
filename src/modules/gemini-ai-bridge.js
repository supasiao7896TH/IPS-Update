import { APP_CONFIG } from './app-config.js';
import { DEBUG_MODULE } from './debug-module.js';
import { STATE_STORE } from './state-store.js';
import { STORAGE_ENGINE } from './storage-engine.js';

        // ─── GEMINI_AI_BRIDGE — Vision OCR + fuzzy matching + AES-GCM key vault
export const GEMINI_AI_BRIDGE = (() => {
            'use strict';

            async function _getOrCreateWrapKey() {
                const rec = await STORAGE_ENGINE.get('cryptoKeys', 'geminiKeyWrap');
                if (rec && rec.key) return rec.key;
                const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
                await STORAGE_ENGINE.put('cryptoKeys', { name: 'geminiKeyWrap', key });
                return key;
            }

            async function encryptAndStoreApiKey(plaintext) {
                const key = await _getOrCreateWrapKey();
                const iv  = crypto.getRandomValues(new Uint8Array(12));
                const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
                await STORAGE_ENGINE.put('settings', {
                    key: 'geminiApiKeyEnc',
                    value: { iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(buf)) },
                });
                STATE_STORE.set('geminiKeyConfigured', true);
            }

            async function decryptApiKey() {
                const rec = await STORAGE_ENGINE.get('settings', 'geminiApiKeyEnc');
                if (!rec) return null;
                const key  = await _getOrCreateWrapKey();
                const iv   = new Uint8Array(rec.value.iv);
                const data = new Uint8Array(rec.value.ciphertext);
                const buf  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
                return new TextDecoder().decode(buf);
            }

            async function analyzeImageWithGemini(apiKey, base64Image, mimeType) {
                const prompt = `Analyze this screenshot of a report/database table.
Extract ALL employee names and their Count values.
The Count column is typically the rightmost numeric column.
Each employee appears as a grouped row with their full name and a number.

Return ONLY a valid JSON array (no markdown, no explanation):
[{"name": "Full Name", "count": 5}]`;

                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${APP_CONFIG.GEMINI_MODEL}:generateContent`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                        body: JSON.stringify({
                            contents: [{ parts: [
                                { text: prompt },
                                { inline_data: { mime_type: mimeType, data: base64Image } }
                            ]}],
                            generationConfig: { temperature: 0 }
                        })
                    }
                );
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    const e = new Error((err.error && err.error.message) || `HTTP ${res.status}`);
                    DEBUG_MODULE.log('error', 'GEMINI_AI_BRIDGE.analyzeImageWithGemini', e);
                    throw e;
                }
                const result = await res.json();
                const text   = (result.candidates && result.candidates[0] && result.candidates[0].content
                    && result.candidates[0].content.parts && result.candidates[0].content.parts[0]
                    && result.candidates[0].content.parts[0].text) || '';
                const clean  = text.replace(/```json|```/gi, '').trim();
                const m      = clean.match(/\[[\s\S]*\]/);
                if (!m) {
                    const e = new Error('ไม่สามารถอ่านตารางจากภาพได้ — ลองใช้ภาพที่ชัดขึ้น');
                    DEBUG_MODULE.log('error', 'GEMINI_AI_BRIDGE.analyzeImageWithGemini', e);
                    throw e;
                }
                return JSON.parse(m[0]);
            }

            function matchEmployeeByName(name) {
                const employees = STATE_STORE.get('employees');
                const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
                const tgt  = norm(name);

                let found = employees.find(e => norm(`${e.firstName} ${e.lastName}`) === tgt);
                if (found) return found;
                const first = tgt.split(' ')[0];
                found = employees.find(e => norm(e.firstName) === first);
                if (found) return found;
                found = employees.find(e => {
                    const full = norm(`${e.firstName} ${e.lastName}`);
                    return full.includes(tgt) || tgt.includes(norm(e.firstName));
                });
                if (found) return found;

                const lev = (a, b) => {
                    if (a.length === 0) return b.length;
                    if (b.length === 0) return a.length;
                    const matrix = [];
                    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
                    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
                    for (let i = 1; i <= b.length; i++) {
                        for (let j = 1; j <= a.length; j++) {
                            if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
                            else matrix[i][j] = Math.min(matrix[i-1][j-1]+1, Math.min(matrix[i][j-1]+1, matrix[i-1][j]+1));
                        }
                    }
                    return matrix[b.length][a.length];
                };

                let bestMatch = null, bestScore = Infinity;
                employees.forEach(e => {
                    const sysFirst = norm(e.firstName), sysLast = norm(e.lastName);
                    const sysFull  = `${sysFirst} ${sysLast}`;
                    const dFull = lev(tgt, sysFull);
                    const tgtParts = tgt.split(' ');
                    const tgtFirst = tgtParts[0] || '';
                    const tgtLast  = tgtParts.slice(1).join(' ') || '';
                    const dFirst = lev(tgtFirst, sysFirst);
                    const dLast  = lev(tgtLast, sysLast);
                    const score = Math.min(dFull, dFirst + dLast);
                    const firstMatchBonus = (dFirst <= 2 && sysLast.charAt(0) === tgtLast.charAt(0)) ? -2 : 0;
                    const finalScore = score + firstMatchBonus;
                    if (finalScore < bestScore) { bestScore = finalScore; bestMatch = e; }
                });

                const maxDist = Math.max(5, Math.floor(tgt.length * 0.4));
                if (bestMatch && bestScore <= maxDist) return bestMatch;
                return null;
            }

            return { encryptAndStoreApiKey, decryptApiKey, analyzeImageWithGemini, matchEmployeeByName };
        })();
