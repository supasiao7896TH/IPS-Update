# Agents.md — คำแนะนำสำหรับ AI agent

คำแนะนำนี้สำหรับ AI agent (Claude Code หรือเครื่องมืออื่น) ที่จะพัฒนาต่อบน repo นี้
ดูภาพรวมโปรเจกต์และประวัติที่ `context.md`

## โครงสร้าง repo

- ไม่มี build step, ไม่มี test suite, ไม่มี `package.json`, ไม่มี CI
- โค้ดทั้งหมดอยู่ในไฟล์เดียว: **`index.html`** (single-file web app)
- เปิดไฟล์นี้ตรงในเบราว์เซอร์เพื่อรัน ไม่ต้องติดตั้งอะไรเพิ่ม

## โครงสร้างโค้ดใน `index.html` — 9-Module IIFE (Vibe Coding standard)

โค้ด JS ทั้งหมดยังอยู่ใน `<script>` เดียว (จำเป็น — ดูข้อ "ห้ามแตกไฟล์" ด้านล่าง) แต่แบ่งเป็น 9 IIFE module แทน object `App` เดิม:

```
APP_CONFIG          — ค่าคงที่ (storage keys, ชื่อเดือน, DEFAULT_DATA, DB_NAME/VERSION, Gemini model, feature flags)
DEBUG_MODULE        — structured logging: log(level, scope, err) / getLog()
STATE_STORE         — reactive pub/sub (get/set/on/off) + optimisticUpdate(key, next, persistFn) พร้อม rollback
STORAGE_ENGINE       — IndexedDB (Promise-based) CRUD + migrateFromLocalStorage() ครั้งเดียว + export/import JSON
GEMINI_AI_BRIDGE     — OCR (Gemini Vision), fuzzy name matching, เข้ารหัส/ถอดรหัส API key ด้วย AES-GCM
CLOUD_SYNC_MANAGER   — scaffold เท่านั้น (feature flag ปิด, ไม่มี Firebase SDK จริง)
AUTH_PROVIDER        — scaffold เท่านั้น (feature flag ปิด, ไม่มี Firebase SDK จริง)
UI_RENDERER          — render ตาราง/กราฟ/modal/notification + 5 generator ฟังก์ชัน (email/PDF/banner/podium/buildStats)
APP_CORE             — init(), event handlers ทั้งหมด, CRUD orchestration ผ่าน STATE_STORE.optimisticUpdate
```

`buildDomCache()` เป็น plain function (ไม่ใช่ module) ที่สร้าง DOM cache ครั้งเดียวใน `APP_CORE.init()` แล้วส่งเข้า `UI_RENDERER.setDom()`

**ห้ามแตกเป็นหลาย `<script>` tag**: `handleExportHtmlClick()` (ใน `APP_CORE`) พึ่งพา regex ที่หา
`<script id="data-injector">...</script>` เพียงตำแหน่งเดียวใน `document.documentElement.outerHTML` เพื่อ self-export —
ทุก module ต้องอยู่ใน `<script>` tag เดียวกันเสมอ

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
   - `UI_RENDERER.makePodiumSvg(stats)` — สร้าง podium SVG (ใช้ใน PDF report และ email banner)
   ถ้าต้องการฟีเจอร์ใหม่ที่ใช้สถิติพนักงานหรือ podium ให้เรียกใช้ helper เหล่านี้แทนการคำนวณเอง
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

ไม่มี automated test — ต้องทดสอบด้วยมือทุกครั้ง:

1. เปิดไฟล์ผ่าน local HTTP server (เช่น `python -m http.server`) แล้วเปิด `http://localhost:PORT/index.html` —
   Chrome extension บางตัวเปิด `file://` ตรงไม่ได้ ต้องใช้ server เสมอเวลาเทสต์ผ่าน browser automation
2. เช็ค browser console ว่าไม่มี error (โดยเฉพาะหลังแก้ JS ในไฟล์) — ปกติจะเห็นแค่ log ระดับ `info` จาก
   `CLOUD_SYNC_MANAGER.pushChange`/`AUTH_PROVIDER.signInAnonymously` ("skipped — feature flag off")
3. เช็ค DevTools → Application → IndexedDB → `kaizen_tracker_db` ว่ามีครบ 5 stores และ row count ตรงกับข้อมูลเดิม
4. ทดสอบ flow หลักที่เกี่ยวข้องกับจุดที่แก้ เช่น: บันทึกกิจกรรม → ตารางอัพเดท (และ submit ซ้ำเดือน/ปี/คนเดิม
   ต้อง update in place ไม่ duplicate row), import JSON ที่มี record ซ้ำ → ยอดรวมต้องตรงกับผลรวมรายเดือน,
   export PDF/email banner → เปิด preview ใน iframe แล้วตรวจ podium/สี/เลข
5. ถ้าแก้ syntax ของ `<script>` block ให้ตรวจ syntax ก่อนด้วย `node --check` (ดึงเนื้อหาใน `<script>` ออกมาก่อน)
   เพราะไฟล์เป็น HTML ทั้งไฟล์ ไม่ใช่ `.js` โดยตรง
6. ถ้าแก้ `handleExportHtmlClick`/`serializeForExport` (self-export feature) ต้องทดสอบเปิดไฟล์ export
   จริงว่ามีข้อมูลฝังอยู่ และ regex data-injector ยังจับ tag แรก (ของจริง) ได้ถูกต้อง

## Git

- Branch หลัก: `main`
- แนวทางที่ใช้อยู่: สร้าง branch ชื่อ `claude/<หัวข้องาน>`, commit, แล้วเปิด PR เข้า `main`
  (เว้นแต่เป็นงานเอกสารความเสี่ยงต่ำที่ผู้ใช้ขอให้ push ตรงเข้า `main`)
