# Agents.md — คำแนะนำสำหรับ AI agent

คำแนะนำนี้สำหรับ AI agent (Claude Code หรือเครื่องมืออื่น) ที่จะพัฒนาต่อบน repo นี้
ดูภาพรวมโปรเจกต์และประวัติที่ `context.md`

## โครงสร้าง repo (multi-file, ตั้งแต่ 2569-08)

> **History note**: โปรเจกต์นี้ย้ายจาก Single HTML File (9-module IIFE ในสคริปต์เดียว) มาเป็น Vite + ES Modules
> เมื่อ `index.html` ยาวเกิน ~2,800 บรรทัดจนแก้ยาก ตาม `vibe-coding-multifile` skill — ดู "History" ใน `context.md`
> สำหรับรายละเอียดเต็ม โครงสร้าง 9 module เดิมยังอยู่ครบ แค่ย้ายจาก 1 IIFE/ไฟล์เดียว ไปเป็น 1 `export const`/ไฟล์ของตัวเอง

- Build tool: **Vite** (`npm run dev`/`npm run build`/`npm run preview`)
- Unit test: **Vitest** (`npm test`) — เทสเฉพาะจุดเสี่ยง ไม่ต้อง 100% coverage
- CI: GitHub Actions (`.github/workflows/ci.yml`) รัน `npm ci && npm run build && npm test` ทุก push/PR เข้า `main`
  — ยังไม่มี deploy job (เพิ่มทีหลังผ่าน `cloudflare-workers-deploy` skill ถ้าต้องการ hosting)
- `index.html` เหลือแค่ markup/CSS/CDN `<script src>` tags — ไม่มี logic JS อยู่ใน `index.html` แล้ว
- Third-party libs (Tailwind CDN, Chart.js, Lucide, html-to-image) **ยังโหลดผ่าน CDN `<script>` ใน `index.html` เหมือนเดิม**
  ไม่ได้ย้ายเป็น npm import — โมดูลที่ใช้ประกาศ `/* global Chart, lucide */` หรือ `/* global lucide, htmlToImage */` กำกับไว้

## โครงสร้าง `src/` — 9 module เดิม, คนละไฟล์

```
src/
├── main.js                      — เดิมคือ APP_CORE: init(), event handlers ทั้งหมด, CRUD orchestration
└── modules/
    ├── utils.js                  — escHtml, storageAvailable, HAS_STORAGE (bare helpers เดิม ก่อน APP_CONFIG)
    ├── app-config.js             — APP_CONFIG (รวม DEFAULT_DATA)
    ├── debug-module.js           — DEBUG_MODULE
    ├── state-store.js            — STATE_STORE
    ├── dom-cache.js               — buildDomCache() (bare function เดิม ไม่ใช่ module)
    ├── storage-engine.js         — STORAGE_ENGINE
    ├── gemini-ai-bridge.js       — GEMINI_AI_BRIDGE
    ├── auth-provider.js          — AUTH_PROVIDER (scaffold)
    ├── cloud-sync-manager.js     — CLOUD_SYNC_MANAGER (scaffold)
    └── ui-renderer.js            — UI_RENDERER
```

แต่ละไฟล์ export ตัวแปรเดียวชื่อเดียวกับ module เดิม (`export const APP_CONFIG = ...`) แล้ว import กันข้ามไฟล์ตามที่ใช้จริง
**หมายเหตุ circular import**: STATE_STORE ↔ CLOUD_SYNC_MANAGER ↔ UI_RENDERER และ STORAGE_ENGINE ↔ GEMINI_AI_BRIDGE
import กันเป็นวงจร (เหมือน closure เดิมตอนอยู่ไฟล์เดียว) — ใช้ได้ปกติเพราะทุกจุดที่ cross-reference อยู่ **ใน function
body เท่านั้น** ไม่มีการเรียกใช้ตอน module top-level evaluation — ห้ามเปลี่ยนให้เรียก cross-module function ที่ระดับ
top-level ของไฟล์ (นอกฟังก์ชัน) เพราะจะทำให้ circular import พังตอน build

**`handleExportHtmlClick()` (ใน `main.js`) กับฟีเจอร์ "ส่งออกเป็นไฟล์เดียว (.html)"**: ยังทำงานเหมือนเดิมทุกประการ
เพราะ `vite.config.js` ใช้ plugin **`vite-plugin-singlefile`** — `npm run build` จะ inline JS ทั้งหมดกลับเข้า
`dist/index.html` ไฟล์เดียว (ไม่มี asset แยก) ทำให้ `document.documentElement.outerHTML` ยังจับ `<script>` ที่มีโค้ด
ทั้งหมดฝังอยู่ได้เหมือนตอนเป็น single-file — **ห้ามลบ `vite-plugin-singlefile` ออกจาก `vite.config.js`** ไม่งั้นไฟล์ที่
export จะอ้าง asset แยกที่หาไม่เจอเมื่อเปิดเครื่องอื่น (ทดสอบแล้วที่ commit ย้าย multi-file: `npm run build` แล้วกด
export บน `dist/index.html` ยืนยันว่า inline สำเร็จ ไม่มี asset แยก)

## Data model

```js
sections   = { id, name }
employees  = { id, firstName, lastName, sectionId, annualTarget }
activities = { id, employeeId, year, month, count }   // id เป็น synthetic autoIncrement key ของ IndexedDB เท่านั้น — ไม่ export ออกไป
```

**เก็บข้อมูลใน IndexedDB** (`kaizen_tracker_db`, v1) — object stores: `sections`, `employees`, `activities`
(unique index `by_emp_year_month`), `settings` (globalTarget/reportAuthor/geminiApiKeyEnc), `cryptoKeys` (AES-GCM wrap key)
`STORAGE_ENGINE.migrateFromLocalStorage()` ย้ายข้อมูลเก่าจาก localStorage อัตโนมัติครั้งเดียวตอน first load
(ลบ localStorage เดิมเฉพาะหลัง IndexedDB เขียนสำเร็จแล้วเท่านั้น — ไม่มีทาง data loss)

**สำคัญ**: เป้าหมายที่ใช้คำนวณจริงคือ `STATE_STORE.get('globalTarget')` (ค่าเดียว กรอกจากหน้าเว็บ ปกติ 12) —
ฟิลด์ `annualTarget` ต่อพนักงานมีอยู่ในข้อมูลแต่ **ไม่ถูกใช้คำนวณ** อย่าเผลอไปอ้างอิงฟิลด์นี้
เว้นแต่ผู้ใช้ขอให้เปลี่ยน logic

**Gemini API key เข้ารหัสแล้ว**: เก็บเป็น AES-GCM ciphertext ใน IndexedDB (`settings.geminiApiKeyEnc`) ไม่ใช่ plaintext —
แต่ยังไม่ปลอดภัยจาก XSS ในทาง theoretical เพราะ non-extractable key ยังถูกเรียกใช้ decrypt ได้จากสคริปต์ origin เดียวกัน
(รายละเอียด threat model อยู่ใน plan การ refactor — ดู git log ของ commit นี้)

## Conventions ที่ต้องรักษา

1. **XSS**: ข้อมูลที่มาจากผู้ใช้ (ชื่อพนักงาน, ชื่อแผนก, ข้อความ input ฯลฯ) ต้องผ่าน `escHtml()` เสมอ
   ก่อนแทรกลงใน template literal ที่จะกลายเป็น HTML — `escHtml` เป็น top-level function ใช้ร่วมกันทุก module
2. **Helper ที่ใช้ร่วมกัน ห้ามเขียนซ้ำ** (อยู่ใน `UI_RENDERER`):
   - `UI_RENDERER.buildStats(year, month)` — คำนวณสถิติต่อพนักงาน (ใช้ใน email summary, email HTML, PDF report, email banner)
   - `UI_RENDERER.makePodiumSvg(stats)` — สร้าง podium SVG อันดับ YTD (ใช้ใน PDF report และ email banner) — ปรับให้ดู
     เป็นทางการแล้ว (ไม่มี SMIL animation, confetti น้อยลง, label ภาษาไทย) เพราะ output จริงเป็นภาพนิ่งเสมอ (พิมพ์/capture)
     ตัวการ์ตูนแต่งกายแบบพนักงานฝ่ายผลิตจริง (หมวกเซฟตี้ขาว, ชุดหมีฟ้าอ่อน, แว่นเซฟตี้, ถุงมือ — สีเดียวกันทุกอันดับ)
     การแบ่งอันดับสื่อผ่าน podium/medal/ท่าทาง/ป้ายชื่อ ไม่ใช่สีชุด — ถ้าจะปรับตัวการ์ตูนเพิ่ม ให้คงชุด PPE นี้ไว้เป็นค่าเริ่มต้น
   - `UI_RENDERER.makeMonthlyBarChartSvg(activities, year, month)` — กราฟแท่ง SVG ยอดรวมรายเดือน (ใช้คู่กับ podium
     ใน PDF report และ email banner) สร้างเองล้วนๆ ไม่พึ่ง Chart.js เพื่อความน่าเชื่อถือตอน print/capture
   ถ้าต้องการฟีเจอร์ใหม่ที่ใช้สถิติพนักงาน/podium/กราฟรายเดือน ให้เรียกใช้ helper เหล่านี้แทนการคำนวณเอง
3. **Modal system**: ใช้ `UI_RENDERER.showModal({title, body, actions}, trigger)` และ
   `UI_RENDERER.closeModal(trigger)` — มี focus trap และ ARIA attributes ในตัวอยู่แล้ว
   ถ้า modal ผูก event listener ระดับ `document` (เช่น paste event) ต้อง cleanup ผ่าน `el._onClose`
   callback เพื่อไม่ให้ listener ค้างเมื่อปิด modal ด้วยปุ่ม Escape
4. **State เป็น reactive pub/sub**: อ่าน/เขียน state ผ่าน `STATE_STORE.get(key)` / `STATE_STORE.set(key, value)` เท่านั้น
   ห้ามเก็บ state ไว้ในตัวแปรลอยนอก STATE_STORE — การ re-render (`renderAll`/`populateAllDropdowns`) ผูกอยู่กับ
   `STATE_STORE.on(key, fn)` แบบ coarse-grained (6 keys: sections/employees/activities/filterYear/filterSection/globalTarget)
   ไม่ต้องเรียก render function เองหลัง mutate state
5. **CRUD ต้องผ่าน `STATE_STORE.optimisticUpdate(key, next, persistFn)`**: set state ทันที (optimistic) → persist ไป
   IndexedDB → rollback state + แจ้ง error toast อัตโนมัติถ้า persist ล้มเหลว — ห้าม mutate array ใน state แบบ in-place
   ต้อง clone ก่อนเสมอ (`[...arr]`) ไม่งั้น rollback จะ no-op เพราะ `prev` อ้างอิง object เดียวกับที่ถูก mutate ไปแล้ว
6. **CDN dependencies pin เวอร์ชันแล้ว**: Tailwind `3.4.16`, Chart.js `4.4.7`, Lucide `1.28.0`, html-to-image `1.11.13`
   — อย่าเปลี่ยนกลับไปใช้ URL แบบไม่ระบุเวอร์ชัน (`@latest` หรือไม่มี version เลย)
7. **ไอคอน**: ใช้ Lucide (`data-lucide="icon-name"`) ไม่ใช่ Font Awesome แล้ว — ทุกฟังก์ชันที่ inject `data-lucide`
   markup ผ่าน innerHTML ต้องเรียก `lucide.createIcons()` ต่อท้ายเสมอ (Lucide inject SVG เฉพาะ element ที่มีอยู่ตอนเรียก
   ไม่ใช่ CSS class font แบบ Font Awesome) — ยกเว้น 5 generator ฟังก์ชันใน `UI_RENDERER`
   (generateEmailSummary/generateEmailHtml/makePodiumSvg/generateReportHtml/generateEmailBannerContent) ที่ไม่ใช้ไอคอนเลย
   เพราะ output เปิดแยกนอก live DOM (standalone/print/screenshot) — lucide.createIcons() ไม่ทำงานที่นั่น
   — `UI_RENDERER.showModal`'s ปุ่ม action รองรับ icon ได้แล้วผ่าน `{ id, text, icon, classes }` (`icon` เป็น optional
   Lucide icon name, ไม่ใส่ก็ได้เหมือนเดิม)
8. **Email Banner ใช้ `html-to-image` (pin `1.11.13`) capture รูปภาพฝั่ง client**: `APP_CORE.handleCopyBannerImage`
   render `UI_RENDERER.generateEmailBannerContent(...)` ลง hidden div ใน document หลัก (ไม่ใช่ iframe — font/style
   resolution ข้าม iframe ไม่เสถียร) แล้ว `htmlToImage.toBlob()` → copy เข้า clipboard ด้วย
   `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])` — ถ้า clipboard API ใช้ไม่ได้ (เช่น
   secure-context ไม่ผ่าน) จะ fallback เป็นดาวน์โหลดไฟล์ PNG แทนเสมอ ไม่ปล่อยให้ fail แบบเงียบ ๆ
9. **ฟอนต์**: Noto Sans Thai (body ทั้งแอป) + Fraunces (เฉพาะ `#main-header-title`) — Sarabun ยังอยู่ใน head หลัก
   (สำหรับ Email Banner capture div) และในเอกสาร PDF/email/banner ที่ generate แยก อย่าเปลี่ยนอันนั้น
10. **Firebase scaffold ปิดอยู่**: `APP_CONFIG.features.cloudSyncEnabled`/`authEnabled` เป็น `false` ทั้งคู่ — ห้าม
    เปิดหรือเพิ่ม Firebase SDK จนกว่าผู้ใช้จะขอชัดเจน (เตรียม interface ไว้แล้วใน `CLOUD_SYNC_MANAGER`/`AUTH_PROVIDER`)
11. **UI ภาษาไทยทั้งหมด** — ข้อความใหม่ที่เพิ่มต้องเป็นภาษาไทย ให้โทนเดียวกับข้อความที่มีอยู่
12. **Chart.js เป็น optional**: `renderDashboardChart()` เช็ค `typeof Chart === 'undefined'` แล้ว skip
    กราฟถ้าโหลด CDN ไม่สำเร็จ เพื่อไม่ให้ทั้งแอปพังจาก dependency เดียว — รักษา pattern นี้ไว้ถ้าเพิ่ม CDN ใหม่

## วิธีทดสอบการเปลี่ยนแปลง

1. `npm install` (ครั้งแรก/หลัง pull ที่ package.json เปลี่ยน), แล้ว `npm run dev` เปิด `http://localhost:5173/`
   — มี hot reload ระหว่างแก้ `src/**/*.js`
2. `npm test` รัน Vitest suite (`tests/*.test.js`) — เทสตอนนี้ครอบคลุม `escHtml`, `GEMINI_AI_BRIDGE.matchEmployeeByName`
   (fuzzy matching, ใช้ร่วมทั้ง OCR และ Lotus Notes CSV bridge ในอนาคต), `STORAGE_ENGINE.serializeForExport`
   (regression test ป้องกันบั๊ก `</script>` escaping ที่เคยเกิดจริง) — เพิ่มเทสใหม่เฉพาะจุดที่ซับซ้อน/เคยพังจริงเท่านั้น
   ไม่ต้องไล่ทำ 100% coverage
3. เช็ค browser console ว่าไม่มี error (โดยเฉพาะหลังแก้ JS ในไฟล์) — ปกติจะเห็นแค่ log ระดับ `info` จาก
   `CLOUD_SYNC_MANAGER.pushChange`/`AUTH_PROVIDER.signInAnonymously` ("skipped — feature flag off")
4. เช็ค DevTools → Application → IndexedDB → `kaizen_tracker_db` ว่ามีครบ 5 stores และ row count ตรงกับข้อมูลเดิม
5. ทดสอบ flow หลักที่เกี่ยวข้องกับจุดที่แก้ เช่น: บันทึกกิจกรรม → ตารางอัพเดท (และ submit ซ้ำเดือน/ปี/คนเดิม
   ต้อง update in place ไม่ duplicate row), import JSON ที่มี record ซ้ำ → ยอดรวมต้องตรงกับผลรวมรายเดือน,
   export PDF/email banner → เปิด preview ใน iframe แล้วตรวจ podium/สี/เลข
6. ถ้าแก้ `handleExportHtmlClick`/`serializeForExport` (self-export feature) ต้อง `npm run build && npm run preview`
   แล้วทดสอบเปิดไฟล์ export จริงจาก preview (ไม่ใช่จาก `npm run dev`) ว่ามีข้อมูลฝังอยู่จริง, `<script type="module">`
   ไม่มี `src=` (inline หมดแล้วโดย `vite-plugin-singlefile`), และ regex data-injector ยังจับ tag แรก (ของจริง) ได้ถูกต้อง
   — เทสจาก dev server เฉยๆ ไม่พอ เพราะ dev mode ยังโหลด module แยกไฟล์ ไม่ได้ inline เหมือน production build

## Git

- Branch หลัก: `main`
- แนวทางที่ใช้อยู่: สร้าง branch ชื่อ `claude/<หัวข้องาน>`, commit, แล้วเปิด PR เข้า `main`
  (เว้นแต่เป็นงานเอกสารความเสี่ยงต่ำที่ผู้ใช้ขอให้ push ตรงเข้า `main`)
