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
- **ส่งออกรายงาน PDF** — เรนเดอร์ report เต็มรูปแบบ (KPI, podium SVG, ตารางรายแผนก, การ์ดให้กำลังใจ) แล้วสั่งพิมพ์/บันทึกเป็น PDF
- **ส่งออก Email Banner** — banner ขนาด 900px สำหรับแปะในอีเมล แยกได้เป็นส่วนบน (KPI+podium) และส่วนล่าง (ตาราง+กำลังใจ) เพื่อ screenshot คมชัด

## Tech stack

- Vanilla JavaScript (ไม่มี framework, ไม่มี build step) — จัดโครงสร้างเป็น 9-Module IIFE ตามมาตรฐาน Vibe Coding
  ของ Supasit.A (ดูรายละเอียดโมดูลใน `agents.md`)
- Tailwind CSS ผ่าน CDN (pin เวอร์ชัน 3.4.16)
- Chart.js ผ่าน CDN (pin เวอร์ชัน 4.4.7)
- Lucide Icons ผ่าน CDN (pin เวอร์ชัน 1.28.0), Google Fonts — Noto Sans Thai (ฟอนต์ไทย body) + Fraunces (หัวข้อหลัก)
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

`main` มีไฟล์: `README.md`, `index.html` (เดิมชื่อ `Kaizen_Tracker07_1.html`), `context.md`, `agents.md`

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

## งานค้าง / สิ่งที่ควรรู้ก่อนพัฒนาต่อ

- ฟิลด์ `annualTarget` รายบุคคลในข้อมูลพนักงานยังไม่ถูกใช้งานจริง (ผู้ใช้ยืนยันว่าทุกคนใช้เป้าหมายรวมเดียวกัน)
  หากในอนาคตต้องการเปลี่ยนเป็นเป้าหมายรายคน จะต้องแก้จุดคำนวณ % ความคืบหน้าในหลายฟังก์ชัน
- `CLOUD_SYNC_MANAGER`/`AUTH_PROVIDER` เป็น scaffold เปล่า — ถ้าจะเปิดใช้ Firebase จริงต้อง import Firebase SDK,
  ตั้งค่า Firestore/Auth project จริง, แล้วเติม logic ในจุดที่มี comment `TODO(future pass)` กำกับไว้
