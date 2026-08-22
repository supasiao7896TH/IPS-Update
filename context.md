# Context — IPS Auto Update

## โปรเจกต์คืออะไร

**Kaizen Activity Tracker v2.0** — เว็บแอปพลิเคชันไฟล์เดียวสำหรับติดตามการส่งกิจกรรม Kaizen
(กิจกรรมปรับปรุงงานอย่างต่อเนื่อง) ของพนักงานรายเดือน แบ่งตามแผนก (ข้อมูลตัวอย่าง: PTA, CTA)
เทียบผลงานสะสมรายปีของแต่ละคนกับเป้าหมายรวม **12 เรื่อง/คน/ปี** (ค่านี้กรอกจากหน้าเว็บ ใช้ค่าเดียวกันทุกคน
ไม่ได้อิงจากฟิลด์ `annualTarget` รายบุคคลที่มีอยู่ในข้อมูล)

## ฟีเจอร์หลัก

- **บันทึกกิจกรรม** — ฟอร์มเลือกพนักงาน/ปี/เดือน/จำนวนเรื่อง
- **Dashboard** — กราฟแท่งสรุปยอดรวมรายเดือน (Chart.js) และตารางรายงานพร้อมสถานะความคืบหน้า
- **ผู้มีผลงานสูงสุด (Top Performers)** — จัดอันดับจากยอดสะสมทั้งปี (YTD)
- **จัดการข้อมูล** — เพิ่ม/แก้ไข/ลบพนักงานและแผนก, import/export ข้อมูลเป็น JSON, export ทั้งแอปเป็นไฟล์ HTML เดี่ยว (พร้อมข้อมูลฝังในตัว)
- **นำเข้าข้อมูลจากภาพ (OCR)** — ใช้ Gemini Vision API อ่านตารางจากภาพ screenshot แล้วจับคู่ชื่อพนักงานอัตโนมัติ (รวม fuzzy matching)
- **สร้างสรุปอีเมล** — ทั้งแบบ plain text และ HTML พร้อม preview ในหน้าเว็บ
- **ส่งออกรายงาน PDF** — เรนเดอร์ report เต็มรูปแบบ (KPI, podium SVG อันดับ YTD, กราฟแท่งยอดรวมรายเดือน, ตารางรายแผนก, การ์ดให้กำลังใจ) แล้วสั่งพิมพ์/บันทึกเป็น PDF
- **ส่งออก Email Banner** — banner ขนาด 900px รวมส่วนบน (KPI+podium) และส่วนล่าง (ตาราง+กำลังใจ) เป็นภาพเดียว
  กดปุ่ม "คัดลอกรูปภาพ" ครั้งเดียวก็คัดลอกเข้า clipboard พร้อมวาง (Ctrl+V) ในอีเมลได้ทันที ไม่ต้อง screenshot เอง
  (ใช้ `html-to-image` capture ฝั่ง client — ถ้า clipboard API ใช้ไม่ได้จะ fallback ดาวน์โหลดไฟล์ PNG แทนอัตโนมัติ)

## Tech stack

- Vanilla JavaScript — Vite + ES Modules (ย้ายจาก Single HTML File เมื่อ 2569-08, ดู "ประวัติการพัฒนา" ข้อ 5) —
  จัดโครงสร้างเป็น 9 module เดิมตามมาตรฐาน Vibe Coding ของ Supasit.A แค่คนละไฟล์ใน `src/modules/` แทน 1 IIFE/ไฟล์เดียว
  (ดูรายละเอียดโมดูลและ build/test commands ใน `agents.md`)
- Tailwind CSS ผ่าน CDN (pin เวอร์ชัน 3.4.16)
- Chart.js ผ่าน CDN (pin เวอร์ชัน 4.4.7)
- Lucide Icons ผ่าน CDN (pin เวอร์ชัน 1.28.0), Google Fonts — Noto Sans Thai (ฟอนต์ไทย body) + Fraunces (หัวข้อหลัก)
- html-to-image ผ่าน CDN (pin เวอร์ชัน 1.11.13) — capture Email Banner เป็นรูปภาพฝั่ง client สำหรับคัดลอกเข้า clipboard
- เก็บข้อมูลใน **IndexedDB** ของเบราว์เซอร์ (`kaizen_tracker_db`) — ย้ายจาก localStorage อัตโนมัติครั้งเดียว
  (ไม่มี backend/database ภายนอก)
- Gemini API key เข้ารหัสด้วย Web Crypto AES-GCM 256-bit ก่อนเก็บ (ไม่ใช่ plaintext เหมือนเดิม)
- มี scaffold `CLOUD_SYNC_MANAGER`/`AUTH_PROVIDER` เตรียมไว้สำหรับ Firebase Firestore/Auth ในอนาคต — ปิดด้วย
  feature flag อยู่ ยังไม่เชื่อม Firebase SDK จริง
- UI ทั้งหมดเป็นภาษาไทย

## ประวัติการพัฒนา

1. **Initial commit** — มีแค่ `README.md`
2. **branch `claude/fix-podium-ranking-dLuHD`** (ยังไม่ merge) — ออกแบบ email banner ใหม่: แยกส่วนบน/ล่างสำหรับ screenshot คมชัด, ปรับปรุง podium ranking scene, ปรับ contrast/สีพื้นหลังให้เหมาะกับการแคปหน้าจอ, ใช้ `zoom:2` เพิ่มความคมชัด — โค้ดในไฟล์แตกต่างจาก `main` พอสมควร ยังไม่ได้ reconcile
3. **PR #1** (merge เข้า `main` เมื่อ 2026-07-05) — นำ `Kaizen_Tracker07_1.html` เข้า `main` เป็นครั้งแรก พร้อมแก้บั๊กจากการรีวิวโค้ด:
   - สีหัวตารางพังเป็น `undefined` เมื่อมีแผนกที่ 3 ขึ้นไป (palette มีแค่ 2 สี)
   - ยอดรวมรายเดือนไม่ตรงกับคอลัมน์รวม เมื่อ import ข้อมูลที่มี record ซ้ำเดือนเดียวกัน
   - ป้าย podium เขียนว่า "ผลงานเดือนนี้" แต่จัดอันดับจริงด้วยยอดสะสม YTD — แก้ข้อความให้ตรงกับเกณฑ์
   - ไฟล์ที่ export เป็น HTML เดี่ยวไม่มี `<!DOCTYPE html>` (เปิดเป็น quirks mode)
   - `paste` event listener ของ modal OCR ค้างอยู่เมื่อปิด modal ด้วย Escape
   - สั่งพิมพ์ PDF ก่อนฟอนต์ Sarabun โหลดเสร็จ (fixed delay 800ms)
   - Gemini API key ถูกส่งผ่าน URL query string แทนที่จะเป็น header
   - `importJson` ไม่ validate ชนิดข้อมูล ทำให้ string vs number เทียบกันผิดพลาดเงียบๆ
   - โค้ดคำนวณสถิติพนักงาน (`stats`) ถูกเขียนซ้ำ 4 ที่ — รวมเป็น helper เดียว (`buildStats`, `makePodiumSvg`)
   - Pin เวอร์ชัน CDN ทั้งหมด

## สถานะปัจจุบัน

`main` มีไฟล์หลัก: `README.md`, `index.html` (เดิมชื่อ `Kaizen_Tracker07_1.html`, ตอนนี้เหลือแค่ markup/CDN scripts),
`context.md`, `agents.md`, `package.json`/`vite.config.js`, `src/main.js` + `src/modules/*.js` (9 module เดิม),
`tests/*.test.js` (Vitest), `.github/workflows/ci.yml`, `tools/export-kaizen-from-notes.ps1`+`.cmd` (Lotus Notes
Bridge Phase A — ดู "งานค้าง" ด้านล่าง)

- **branch `claude/fix-podium-ranking-dLuHD` — reconciled แล้ว (2026-07-15)**: ตรวจ diff ทีละฟังก์ชัน
  (podium SVG chibi/crown/glow/medal, email banner top/bottom split, `zoom:2`, motivation segment,
  contrast/background สำหรับ screenshot) พบว่างานออกแบบทั้งหมดใน branch นี้ถูกนำเข้า `main` แล้วตั้งแต่ PR #1
  ในรูปแบบที่ปรับปรุงกว่าเดิม (ใช้ `buildStats`/`makePodiumSvg` แทนโค้ดซ้ำ, แก้ label podium ให้ตรงกับเกณฑ์ YTD)
  ไม่มีอะไรต้อง port เพิ่ม — branch นี้ถือว่าล้าสมัยและปลอดภัยที่จะลบทิ้ง

4. **Refactor 9-Module IIFE + IndexedDB + Web Crypto** (branch `claude/9-module-iife-refactor`) — ปรับสถาปัตยกรรม
   จาก object `App` เดิมเป็น 9 module (`APP_CONFIG`/`DEBUG_MODULE`/`STATE_STORE`/`STORAGE_ENGINE`/`GEMINI_AI_BRIDGE`/
   `CLOUD_SYNC_MANAGER`/`AUTH_PROVIDER`/`UI_RENDERER`/`APP_CORE`) ตามมาตรฐาน Vibe Coding ของ Supasit.A:
   - ย้าย storage จาก localStorage → IndexedDB (`kaizen_tracker_db`) พร้อม one-time migration ที่ไม่ลบข้อมูลเดิม
     จนกว่าจะ confirm เขียนสำเร็จ (`DEFAULT_DATA` ยืนยันแล้วว่าเป็นข้อมูลจริงของทีม ไม่ใช่ demo — เก็บไว้เป็น seed
     เหมือนเดิมสำหรับ first-run เท่านั้น)
   - เข้ารหัส Gemini API key ด้วย AES-GCM 256-bit แทนการเก็บ plaintext ใน localStorage
   - เพิ่ม reactive pub/sub (`STATE_STORE`) พร้อม optimistic UI + rollback สำหรับทุก CRUD flow
   - เพิ่ม `CLOUD_SYNC_MANAGER`/`AUTH_PROVIDER` เป็น scaffold พร้อมโครงสร้าง แต่ปิด feature flag ไว้ (ไม่เชื่อม
     Firebase SDK จริงในรอบนี้ — เตรียมไว้ให้ future pass ต่อง่าย)
   - สลับไอคอน Font Awesome → Lucide และฟอนต์ Sarabun → Noto Sans Thai + Fraunces สำหรับ live app (เอกสาร
     PDF/email/banner ที่ generate แยกยังคง Sarabun ตามเดิม เพราะเป็น standalone documents คนละบริบท)
   - โครงสร้าง JS ยังอยู่ใน `<script>` เดียวเหมือนเดิม (ไม่มีการแตกไฟล์/build step) เพื่อรักษา self-export feature

5. **ย้าย Single HTML File → Vite + ES Modules** (2569-08-22) — `index.html` ยาวเกิน 2,800 บรรทัดจนแก้ยาก
   ตาม Decision Table ของ `vibe-coding-multifile` skill พี่ A ยืนยันให้ย้ายทันที (ก่อนเริ่มต่อฟีเจอร์ Lotus Notes
   Bridge ที่วางแผนไว้คู่กัน — ดู `tools/export-kaizen-from-notes.ps1` สำหรับ Phase A ของงานนั้น ซึ่งยังไม่ได้ผูกเข้า
   `index.html` เพราะรอย้ายสถาปัตยกรรมนี้เสร็จก่อน):
   - แยก 9 module เดิมออกเป็นไฟล์ `src/modules/*.js` (`export const` แทน IIFE ในสคริปต์เดียว) + `src/main.js`
     (เดิมคือ `APP_CORE`) ตาม pattern เดียวกับ `vibe-coding-core` §2 — โค้ดภายในแต่ละ module **ไม่ได้แก้ logic เลย**
     ย้ายแบบ 1:1 ด้วย `sed` extraction เพื่อลดความเสี่ยง transcription error
   - เพิ่ม `vite-plugin-singlefile` ใน `vite.config.js` เพื่อรักษาฟีเจอร์ "ส่งออกเป็นไฟล์เดียว (.html)"
     (`handleExportHtmlClick`/regex `data-injector`) ให้ยังทำงานเหมือนเดิมทุกประการ — ทดสอบแล้วว่า `npm run build`
     inline JS กลับเข้า `dist/index.html` ไฟล์เดียวจริง (ไม่มี asset แยก) ก่อนตัดสินใจนี้ได้ประเมินความเสี่ยงเรื่อง
     asset แยกทำให้ export ไม่ standalone จริงไว้ล่วงหน้า แล้วเลือก mitigate ด้วย plugin นี้แทนการยอมรับ regression
   - เพิ่ม Vitest + เทส 3 ไฟล์ (`tests/*.test.js`) ครอบคลุมจุดเสี่ยงที่มีประวัติบั๊กจริง: `escHtml`,
     `matchEmployeeByName` (fuzzy matching, ใช้ร่วม Lotus Notes Bridge ในอนาคต), `serializeForExport`
     (regression test บั๊ก `</script>` escaping ที่เคยแก้จริงใน PR ก่อนหน้า)
   - เพิ่ม GitHub Actions CI (`.github/workflows/ci.yml`) — build-and-test เท่านั้น ยังไม่มี deploy job
     (ตัดสินใจจำกัด scope รอบนี้ ไม่ผูก hosting เพราะยังไม่มีใครขอ)
   - ยืนยันแล้วว่า circular import ระหว่าง `STATE_STORE`/`CLOUD_SYNC_MANAGER`/`UI_RENDERER` และ
     `STORAGE_ENGINE`/`GEMINI_AI_BRIDGE` (เหมือน closure เดิมตอนอยู่ไฟล์เดียว) ทำงานถูกต้องทั้งใน dev/build/test
     เพราะทุกจุด cross-reference อยู่ใน function body ไม่ใช่ top-level module evaluation

6. **Lotus Notes Bridge Phase B + แก้บั๊ก Phase A** (2569-08-22) — ผูก CSV import เข้าเว็บแอปแทนที่การ screenshot:
   - เพิ่ม `src/modules/notes-bridge.js` (`parseKaizenCsv`) — CSV parser แบบ quote-aware, header-driven (ไม่ใช้
     library ภายนอก), คืน `{rows, warnings}` ไม่ throw เมื่อเจอแถวพัง
   - เพิ่มปุ่ม "นำเข้าจาก Lotus Notes (CSV)" ใน `index.html` + handler `handleNotesCsvImportClick()` ใน `src/main.js`
     ที่ **reuse `showOcrReviewModal` เดิมตรงๆ ไม่ fork** (ตามหลักการเดิมที่วางไว้ตั้งแต่ Phase A) — ทดสอบผ่านเบราว์เซอร์จริง
     แล้วว่า upload CSV ตัวอย่าง → fuzzy match พนักงานถูกต้อง → บันทึกลง IndexedDB → ตาราง/กราฟ/podium อัปเดตถูกต้อง
   - ปุ่ม OCR (Gemini) เดิมและฟีเจอร์ export standalone HTML ยืนยันแล้วว่ายังทำงานปกติ ไม่ถูกกระทบ
   - **แก้บั๊ก Phase A ระหว่างทดสอบจริงที่เครื่องทำงาน (3 รอบ)**:
     1. `The ID file is locked by another process` — Lotus Notes client (desktop app) เปิดค้างอยู่ ยึด lock ไฟล์ ID
        (วิธีแก้: ปิด Notes client ให้สนิทก่อนรัน script ทุกครั้ง — ไม่ใช่บั๊กของ script)
     2. `Invalid replica id` — Notes แสดง Replica ID แบบมี `:` คั่น แต่ `OpenDatabaseByReplicaID()` ต้องการสตริง 16
        hex ติดกันไม่มี `:` — แก้ให้ลองทั้ง 2 รูปแบบอัตโนมัติ
     3. `does not contain a method named 'GetFirstEntry'` — COM automation ไม่รองรับ `NotesView.GetFirstEntry()`/
        `GetNextEntry()` ตรงๆ (มีแค่ใน LotusScript เต็มรูปแบบ) — แก้ให้เรียกผ่าน `NotesView.AllEntries` (collection)
        แทน ซึ่งเป็นวิธีเก่ากว่าที่ COM รองรับ
   - **View `Improvement\By Section` ไม่ใช่ตารางสรุปแบบที่คาดไว้ตอนแรก** — เป็นรายการ Kaizen 1 แถวต่อ 1 เรื่องที่ส่งเข้ามา
     ไม่มีคอลัมน์ไหนเก็บ "จำนวนรวมต่อคน" ไว้ตรงๆ ต้อง filter (Department/Year/Month) + นับจำนวนแถวเอง (tally) แทน —
     คอลัมน์จริงที่ยืนยันแล้ว: `[0]`=รหัสแผนก, `[1]`=ปี, `[2]`=เดือน, `[4]`=ชื่อพนักงานเต็ม (ดู `tools/export-kaizen-from-notes.ps1`
     สำหรับ mapping เต็ม) — Business rule ที่พี่ A ยืนยัน: นับทุกสถานะ (ไม่กรอง col `[6]`), กรองเฉพาะแผนกตัวเอง `PE1`
   - **Phase A ยืนยันเสร็จสมบูรณ์แล้ว (2569-08-22)**: `-DryRun -Year 2026 -Month 7` สแกน 48,256 entries เจอ 63 แถว
     ตรงเงื่อนไข (PE1/2026/7) จาก 27 คน พี่ A เทียบกับหน้าจอ Lotus Notes จริงแล้วว่าตรง (เช่น Thanan Srephophan=6,
     Supasit Aoothai=5, Sittichai Klaidaeng=4) — ชื่อพนักงานที่ได้ตรงกับ roster ในแอปเป๊ะ

## งานค้าง / สิ่งที่ควรรู้ก่อนพัฒนาต่อ

- **Lotus Notes Bridge**: Phase A + Phase B **เสร็จสมบูรณ์ทั้งคู่แล้ว** (2569-08-22) — Phase A ยืนยัน tally ถูกต้องกับ
  หน้าจอ Notes จริงแล้ว, Phase B ทดสอบผ่านเบราว์เซอร์จริงแล้วด้วย CSV สังเคราะห์ (synthetic) — **ยังไม่เคยทดสอบ
  end-to-end ด้วยไฟล์ CSV จริงที่ script export ออกมา** (รันแบบเต็ม ไม่มี `-DryRun`) แล้วนำเข้าเว็บแอปจริง — ขั้นต่อไป
  คือรัน `.\export-kaizen-from-notes.cmd -Year 2026 -Month 7` (ไม่มี `-DryRun`, ปิด Notes client ก่อนรันเสมอ) ได้ไฟล์ที่
  `Documents\KaizenExport\kaizen_export.csv` แล้วนำเข้าผ่านปุ่ม "นำเข้าจาก Lotus Notes (CSV)" ในแอปจริง

- ฟิลด์ `annualTarget` รายบุคคลในข้อมูลพนักงานยังไม่ถูกใช้งานจริง (ผู้ใช้ยืนยันว่าทุกคนใช้เป้าหมายรวมเดียวกัน)
  หากในอนาคตต้องการเปลี่ยนเป็นเป้าหมายรายคน จะต้องแก้จุดคำนวณ % ความคืบหน้าในหลายฟังก์ชัน
- `CLOUD_SYNC_MANAGER`/`AUTH_PROVIDER` เป็น scaffold เปล่า — ถ้าจะเปิดใช้ Firebase จริงต้อง import Firebase SDK,
  ตั้งค่า Firestore/Auth project จริง, แล้วเติม logic ในจุดที่มี comment `TODO(future pass)` กำกับไว้
