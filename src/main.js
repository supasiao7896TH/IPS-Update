/* global lucide, htmlToImage */
import { APP_CONFIG } from './modules/app-config.js';
import { DEBUG_MODULE } from './modules/debug-module.js';
import { STATE_STORE } from './modules/state-store.js';
import { STORAGE_ENGINE } from './modules/storage-engine.js';
import { GEMINI_AI_BRIDGE } from './modules/gemini-ai-bridge.js';
import { AUTH_PROVIDER } from './modules/auth-provider.js';
import { UI_RENDERER } from './modules/ui-renderer.js';
import { buildDomCache } from './modules/dom-cache.js';
import { escHtml } from './modules/utils.js';
import * as NOTES_BRIDGE from './modules/notes-bridge.js';

        // ─── APP_CORE — init, event binding/handlers, CRUD orchestration ────
        const APP_CORE = (() => {
            'use strict';
            let _domCache = null;
            let _bannerCaptureEl = null;

            function _consumeInjectedData() {
                const inj = document.getElementById('data-injector');
                if (inj && inj.textContent.trim()) {
                    try {
                        const d = JSON.parse(inj.textContent);
                        inj.textContent = '';
                        return {
                            sections: d.sections || [],
                            employees: d.employees || [],
                            activities: (d.activities || []).map((a, i) => ({ id: i + 1, ...a })),
                        };
                    } catch (e) { DEBUG_MODULE.log('error', 'VALIDATION', e); }
                }
                return null;
            }

            async function init() {
                window.addEventListener('error', (e) => DEBUG_MODULE.log('error', 'UNKNOWN', e.error || e.message));
                window.addEventListener('unhandledrejection', (e) => DEBUG_MODULE.log('error', 'UNKNOWN', e.reason));

                _domCache = buildDomCache();
                UI_RENDERER.setDom(_domCache);

                const injected = _consumeInjectedData();
                await STORAGE_ENGINE.migrateFromLocalStorage();

                if (injected) {
                    STATE_STORE.set('sections', injected.sections, {silent:true});
                    STATE_STORE.set('employees', injected.employees, {silent:true});
                    STATE_STORE.set('activities', injected.activities, {silent:true});
                    try {
                        await STORAGE_ENGINE.saveSections(injected.sections);
                        await STORAGE_ENGINE.saveEmployees(injected.employees);
                        await STORAGE_ENGINE.saveActivities(injected.activities);
                    } catch (err) { DEBUG_MODULE.log('error', 'STORAGE', err); }
                } else {
                    const loaded = await STORAGE_ENGINE.loadAll();
                    STATE_STORE.set('sections', loaded.sections, {silent:true});
                    STATE_STORE.set('employees', loaded.employees, {silent:true});
                    STATE_STORE.set('activities', loaded.activities, {silent:true});
                    STATE_STORE.set('globalTarget', loaded.globalTarget, {silent:true});
                }

                const activities = STATE_STORE.get('activities');
                const dataYears = activities.map(a => a.year);
                if (dataYears.length && !dataYears.includes(STATE_STORE.get('filterYear'))) {
                    STATE_STORE.set('filterYear', Math.max(...dataYears), {silent:true});
                }

                ['sections','employees','activities','filterYear','filterSection','globalTarget']
                    .forEach(k => STATE_STORE.on(k, () => UI_RENDERER.renderAll()));
                ['sections','employees']
                    .forEach(k => STATE_STORE.on(k, () => UI_RENDERER.populateAllDropdowns()));

                UI_RENDERER.populateAllDropdowns();
                UI_RENDERER.renderAll();
                bindAll();

                AUTH_PROVIDER.signInAnonymously().catch(err => DEBUG_MODULE.log('info', 'AUTH_PROVIDER', err.message));
            }

            // ─── CRUD wrappers using STATE_STORE.optimisticUpdate ───
            function _saveActivities(next) { return STATE_STORE.optimisticUpdate('activities', next, STORAGE_ENGINE.saveActivities); }
            function _saveEmployees(next)  { return STATE_STORE.optimisticUpdate('employees', next, STORAGE_ENGINE.saveEmployees); }
            function _saveSections(next)   { return STATE_STORE.optimisticUpdate('sections', next, STORAGE_ENGINE.saveSections); }

            function bindAll() {
                const dom = _domCache;
                dom.kaizenForm.addEventListener('submit', handleKaizenFormSubmit);
                dom.filterYearChart.addEventListener('change', handleFilterChange);
                dom.filterSection.addEventListener('change', handleFilterChange);
                dom.globalTargetInput.addEventListener('change', async e => {
                    const v = parseInt(e.target.value, 10);
                    if (v >= 1) {
                        STATE_STORE.set('globalTarget', v);
                        try { await STORAGE_ENGINE.saveGlobalTarget(v); } catch (err) { DEBUG_MODULE.log('error','STORAGE',err); }
                    }
                });
                dom.addEmployeeBtn.addEventListener('click', () => handleAddEmployeeClick());
                dom.manageSectionsBtn.addEventListener('click', () => handleManageSectionsClick());
                dom.printBtn.addEventListener('click', () => window.print());
                dom.exportJsonBtn.addEventListener('click', () => handleExportJsonClick());
                dom.exportHtmlBtn.addEventListener('click', () => handleExportHtmlClick());
                dom.importBtn.addEventListener('click', () => dom.importFileInput.click());
                dom.importFileInput.addEventListener('change', handleImportFileSelect);
                dom.reportTable.addEventListener('click', handleTableActions);
                dom.ocrImportBtn.addEventListener('click', () => handleOcrImportClick());
                dom.notesCsvImportBtn.addEventListener('click', () => handleNotesCsvImportClick());
                dom.generateEmailBtn.addEventListener('click', () => handleGenerateEmailClick());
                dom.exportReportBtn.addEventListener('click', () => handleExportReportClick());
                dom.exportEmailBannerBtn.addEventListener('click', () => handleExportEmailBannerClick());
            }

            function handleKaizenFormSubmit(e) {
                e.preventDefault();
                const dom = _domCache;
                const eid   = parseInt(dom.employeeSelect.value, 10);
                const year  = parseInt(dom.yearSelect.value, 10);
                const month = parseInt(dom.monthSelect.value, 10);
                const count = parseInt(dom.submissionCount.value, 10);
                if (isNaN(eid)||isNaN(year)||isNaN(month)||dom.submissionCount.value===''||count<0) {
                    UI_RENDERER.showNotification('กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง','error'); return;
                }
                const activities = [...STATE_STORE.get('activities')];
                const idx = activities.findIndex(a=>a.employeeId===eid&&a.year===year&&a.month===month);
                if (idx >= 0) { activities[idx] = { ...activities[idx], count }; }
                else { activities.push({ employeeId:eid, year, month, count }); }
                _saveActivities(activities).then(() => {
                    UI_RENDERER.showNotification('บันทึกข้อมูลสำเร็จ!','success');
                }).catch(()=>{});
                dom.submissionCount.value=''; dom.employeeSelect.value='';
                dom.yearSelect.value=STATE_STORE.get('currentYear'); dom.monthSelect.value=STATE_STORE.get('currentMonth');
            }

            function handleFilterChange(e) {
                if (e.target.id==='filter-year-chart') STATE_STORE.set('filterYear', parseInt(e.target.value,10));
                if (e.target.id==='filter-section')    STATE_STORE.set('filterSection', e.target.value);
            }

            function handleImportFileSelect(e) {
                const file = e.target.files[0]; if (!file) return;
                const trigger = _domCache.importBtn;
                const modal = UI_RENDERER.showModal({
                    title: '<i data-lucide="triangle-alert" class="text-yellow-500 mr-2 inline-block" aria-hidden="true"></i> ยืนยันการนำเข้าข้อมูล',
                    body:  '<p>การนำเข้าข้อมูลจะเขียนทับข้อมูลปัจจุบันทั้งหมด คุณแน่ใจหรือไม่?</p>',
                    actions:[{id:'cancel',text:'ยกเลิก',classes:'bg-gray-200 text-gray-800 hover:bg-gray-300'},{id:'confirm',text:'ยืนยัน',classes:'bg-yellow-500 text-white hover:bg-yellow-600'}]
                }, trigger);
                modal.addEventListener('click', async evt => {
                    const a = evt.target.dataset.action;
                    if (a==='confirm') {
                        try {
                            const { sections, employees, activities } = await STORAGE_ENGINE.parseImportFile(file);
                            await Promise.all([
                                STATE_STORE.optimisticUpdate('sections', sections, STORAGE_ENGINE.saveSections),
                                STATE_STORE.optimisticUpdate('employees', employees, STORAGE_ENGINE.saveEmployees),
                                STATE_STORE.optimisticUpdate('activities', activities, STORAGE_ENGINE.saveActivities),
                            ]);
                            UI_RENDERER.showNotification('นำเข้าข้อมูลสำเร็จ!','success');
                        } catch (err) {
                            DEBUG_MODULE.log('error', 'VALIDATION', err);
                            UI_RENDERER.showNotification('ไฟล์ข้อมูลไม่ถูกต้องหรืออ่านไม่สำเร็จ','error');
                        }
                        UI_RENDERER.closeModal(trigger);
                    }
                    else if (a==='cancel'||evt.target.classList.contains('modal-close-btn')) UI_RENDERER.closeModal(trigger);
                    e.target.value='';
                });
            }

            function handleTableActions(e) {
                const eb = e.target.closest('.inline-edit-btn');
                const db = e.target.closest('.inline-delete-btn');
                if (eb) handleEditEmployeeClick(parseInt(eb.closest('tr').dataset.employeeId,10), eb);
                if (db) handleDeleteEmployeeClick(parseInt(db.closest('tr').dataset.employeeId,10), db);
            }

            function handleAddEmployeeClick() {
                const trigger = _domCache.addEmployeeBtn;
                const sections = STATE_STORE.get('sections');
                const opts = sections.map(s=>`<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
                const modal = UI_RENDERER.showModal({
                    title: '<i data-lucide="user-plus" class="mr-2 inline-block" aria-hidden="true"></i> เพิ่มพนักงานใหม่',
                    body: `<form class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div><label for="add-fn" class="block text-sm font-medium text-gray-700 mb-1">ชื่อจริง</label><input type="text" id="add-fn" class="w-full p-2 border rounded-md" required></div>
                            <div><label for="add-ln" class="block text-sm font-medium text-gray-700 mb-1">นามสกุล</label><input type="text" id="add-ln" class="w-full p-2 border rounded-md" required></div>
                        </div>
                        <div><label for="add-sec" class="block text-sm font-medium text-gray-700 mb-1">แผนก</label><select id="add-sec" class="w-full p-2 border rounded-md"><option value="">-- ไม่มี --</option>${opts}</select></div>
                        <div><label for="add-tgt" class="block text-sm font-medium text-gray-700 mb-1">เป้าหมายต่อปี</label><input type="number" id="add-tgt" value="14" min="0" class="w-full p-2 border rounded-md" required></div>
                    </form>`,
                    actions:[{id:'cancel',text:'ยกเลิก',classes:'bg-gray-200 text-gray-800 hover:bg-gray-300'},{id:'save',text:'บันทึก',classes:'bg-blue-600 text-white hover:bg-blue-700'}]
                }, trigger);
                modal.addEventListener('click', e => {
                    const a = e.target.dataset.action;
                    if (a==='save') {
                        const fn=modal.querySelector('#add-fn').value.trim(), ln=modal.querySelector('#add-ln').value.trim();
                        const sec=parseInt(modal.querySelector('#add-sec').value,10)||null, tgt=parseInt(modal.querySelector('#add-tgt').value,10);
                        if (!fn||!ln||isNaN(tgt)||tgt<0) { UI_RENDERER.showNotification('ข้อมูลไม่ถูกต้อง','error'); return; }
                        const employees = [...STATE_STORE.get('employees')];
                        const nid = employees.length>0 ? Math.max(...employees.map(e=>e.id))+1 : 1;
                        employees.push({id:nid,firstName:fn,lastName:ln,sectionId:sec,annualTarget:tgt});
                        _saveEmployees(employees).then(()=>{
                            UI_RENDERER.showNotification('เพิ่มพนักงานสำเร็จ','success');
                        }).catch(()=>{});
                        UI_RENDERER.closeModal(trigger);
                    } else if (a==='cancel'||e.target.classList.contains('modal-close-btn')) UI_RENDERER.closeModal(trigger);
                });
            }

            function handleEditEmployeeClick(eid, trigger) {
                const employees = STATE_STORE.get('employees');
                const emp = employees.find(e=>e.id===eid); if (!emp) return;
                const sections = STATE_STORE.get('sections');
                const opts = sections.map(s=>`<option value="${s.id}" ${s.id===emp.sectionId?'selected':''}>${escHtml(s.name)}</option>`).join('');
                const modal = UI_RENDERER.showModal({
                    title: '<i data-lucide="user-edit" class="mr-2 inline-block" aria-hidden="true"></i> แก้ไขข้อมูลพนักงาน',
                    body: `<form class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div><label for="edit-fn" class="block text-sm font-medium text-gray-700 mb-1">ชื่อจริง</label><input type="text" id="edit-fn" value="${escHtml(emp.firstName)}" class="w-full p-2 border rounded-md" required></div>
                            <div><label for="edit-ln" class="block text-sm font-medium text-gray-700 mb-1">นามสกุล</label><input type="text" id="edit-ln" value="${escHtml(emp.lastName)}" class="w-full p-2 border rounded-md" required></div>
                        </div>
                        <div><label for="edit-sec" class="block text-sm font-medium text-gray-700 mb-1">แผนก</label><select id="edit-sec" class="w-full p-2 border rounded-md"><option value="">-- ไม่มี --</option>${opts}</select></div>
                        <div><label for="edit-tgt" class="block text-sm font-medium text-gray-700 mb-1">เป้าหมายต่อปี</label><input type="number" id="edit-tgt" value="${emp.annualTarget}" min="0" class="w-full p-2 border rounded-md" required></div>
                    </form>`,
                    actions:[{id:'cancel',text:'ยกเลิก',classes:'bg-gray-200 text-gray-800 hover:bg-gray-300'},{id:'save',text:'บันทึกการเปลี่ยนแปลง',classes:'bg-blue-600 text-white hover:bg-blue-700'}]
                }, trigger);
                modal.addEventListener('click', e => {
                    const a = e.target.dataset.action;
                    if (a==='save') {
                        const fn=modal.querySelector('#edit-fn').value.trim(), ln=modal.querySelector('#edit-ln').value.trim();
                        const sec=parseInt(modal.querySelector('#edit-sec').value,10)||null, tgt=parseInt(modal.querySelector('#edit-tgt').value,10);
                        if (!fn||!ln||isNaN(tgt)||tgt<0) { UI_RENDERER.showNotification('ข้อมูลไม่ถูกต้อง','error'); return; }
                        const nextEmployees = employees.map(x => x.id===eid ? {...x, firstName:fn, lastName:ln, sectionId:sec, annualTarget:tgt} : x);
                        _saveEmployees(nextEmployees).then(()=>{
                            UI_RENDERER.showNotification('แก้ไขข้อมูลสำเร็จ','success');
                        }).catch(()=>{});
                        UI_RENDERER.closeModal(trigger);
                    } else if (a==='cancel'||e.target.classList.contains('modal-close-btn')) UI_RENDERER.closeModal(trigger);
                });
            }

            function handleDeleteEmployeeClick(eid, trigger) {
                const employees = STATE_STORE.get('employees');
                const emp = employees.find(e=>e.id===eid); if (!emp) return;
                const modal = UI_RENDERER.showModal({
                    title: '<i data-lucide="trash-2" class="text-red-500 mr-2 inline-block" aria-hidden="true"></i> ยืนยันการลบ',
                    body:  `<p>คุณแน่ใจหรือไม่ว่าต้องการลบพนักงาน <b>${escHtml(emp.firstName)} ${escHtml(emp.lastName)}</b>? ข้อมูลกิจกรรมทั้งหมดจะถูกลบและไม่สามารถย้อนกลับได้</p>`,
                    actions:[{id:'cancel',text:'ยกเลิก',classes:'bg-gray-200 text-gray-800 hover:bg-gray-300'},{id:'delete',text:'ยืนยันการลบ',classes:'bg-red-600 text-white hover:bg-red-700'}]
                }, trigger);
                modal.addEventListener('click', async e => {
                    const a = e.target.dataset.action;
                    if (a==='delete') {
                        const nextEmployees  = employees.filter(x=>x.id!==eid);
                        const nextActivities = STATE_STORE.get('activities').filter(x=>x.employeeId!==eid);
                        try {
                            await Promise.all([
                                STATE_STORE.optimisticUpdate('employees', nextEmployees, STORAGE_ENGINE.saveEmployees),
                                STATE_STORE.optimisticUpdate('activities', nextActivities, STORAGE_ENGINE.saveActivities),
                            ]);
                            UI_RENDERER.showNotification('ลบพนักงานเรียบร้อยแล้ว','success');
                        } catch(err) { /* rollback + error notification already handled inside optimisticUpdate */ }
                        UI_RENDERER.closeModal(trigger);
                    } else if (a==='cancel'||e.target.classList.contains('modal-close-btn')) UI_RENDERER.closeModal(trigger);
                });
            }

            function handleManageSectionsClick() {
                const trigger = _domCache.manageSectionsBtn;
                const buildList = () => {
                    const sections = STATE_STORE.get('sections');
                    return sections.length===0
                    ? '<p class="text-gray-500 text-sm text-center py-4">ยังไม่มีแผนก</p>'
                    : `<div class="space-y-2 max-h-60 overflow-y-auto pr-2">${sections.map(s=>`
                        <div class="flex items-center justify-between p-2 bg-gray-100 rounded-md">
                            <span>${escHtml(s.name)}</span>
                            <div class="space-x-2">
                                <button class="text-blue-500 hover:text-blue-700 edit-section-btn" data-id="${s.id}" aria-label="แก้ไขแผนก ${escHtml(s.name)}"><i data-lucide="pen" aria-hidden="true"></i></button>
                                <button class="text-red-500 hover:text-red-700 delete-section-btn" data-id="${s.id}" aria-label="ลบแผนก ${escHtml(s.name)}"><i data-lucide="trash-2" aria-hidden="true"></i></button>
                            </div>
                        </div>`).join('')}</div>`;
                };
                const buildBody = () => `${buildList()}
                    <div class="mt-4 pt-4 border-t">
                        <label for="new-sec-name" class="block text-sm font-medium text-gray-700 mb-1">เพิ่มแผนกใหม่</label>
                        <div class="flex gap-2">
                            <input type="text" id="new-sec-name" class="w-full p-2 border rounded-md" placeholder="ชื่อแผนก">
                            <button id="add-sec-btn" class="bg-green-500 text-white px-4 rounded-md hover:bg-green-600" aria-label="เพิ่มแผนก"><i data-lucide="plus" aria-hidden="true"></i></button>
                        </div>
                    </div>`;
                const modal = UI_RENDERER.showModal({
                    title:'<i data-lucide="building-2" class="mr-2 inline-block" aria-hidden="true"></i> จัดการแผนก',
                    body:buildBody(),
                    actions:[{id:'close',text:'ปิด',classes:'bg-gray-500 text-white hover:bg-gray-600'}]
                }, trigger);
                const refresh = () => { modal.querySelector('.p-6').innerHTML=buildBody(); if (window.lucide) lucide.createIcons(); };
                const openRename = (sid) => {
                    const s = STATE_STORE.get('sections').find(x=>x.id===sid); if (!s) return;
                    const m2 = UI_RENDERER.showModal({
                        title:'<i data-lucide="pen" class="mr-2 inline-block" aria-hidden="true"></i> แก้ไขชื่อแผนก',
                        body:`<div><label for="ren-inp" class="block text-sm font-medium text-gray-700 mb-1">ชื่อแผนกใหม่</label><input type="text" id="ren-inp" value="${escHtml(s.name)}" class="w-full p-2 border rounded-md"></div>`,
                        actions:[{id:'cancel',text:'ยกเลิก',classes:'bg-gray-200 text-gray-800 hover:bg-gray-300'},{id:'save',text:'บันทึก',classes:'bg-blue-600 text-white hover:bg-blue-700'}]
                    });
                    m2.addEventListener('click', async e => {
                        if (e.target.dataset.action==='save') {
                            const n=m2.querySelector('#ren-inp').value.trim();
                            if(n){
                                const nextSections = STATE_STORE.get('sections').map(x => x.id===sid ? {...x, name:n} : x);
                                try { await STATE_STORE.optimisticUpdate('sections', nextSections, STORAGE_ENGINE.saveSections); } catch(err) {}
                                UI_RENDERER.closeModal(); refresh();
                            }
                        }
                        else if (e.target.dataset.action==='cancel'||e.target.classList.contains('modal-close-btn')) UI_RENDERER.closeModal();
                    });
                };
                const openDel = (sid) => {
                    const s = STATE_STORE.get('sections').find(x=>x.id===sid); if (!s) return;
                    const m2 = UI_RENDERER.showModal({
                        title:'<i data-lucide="trash-2" class="text-red-500 mr-2 inline-block" aria-hidden="true"></i> ยืนยันการลบแผนก',
                        body:`<p>คุณแน่ใจหรือไม่ว่าต้องการลบแผนก <b>${escHtml(s.name)}</b>? พนักงานในแผนกนี้จะถูกตั้งค่าเป็น "ไม่มีแผนก"</p>`,
                        actions:[{id:'cancel',text:'ยกเลิก',classes:'bg-gray-200 text-gray-800 hover:bg-gray-300'},{id:'delete',text:'ยืนยันการลบ',classes:'bg-red-600 text-white hover:bg-red-700'}]
                    });
                    m2.addEventListener('click', async e => {
                        if (e.target.dataset.action==='delete') {
                            const nextSections  = STATE_STORE.get('sections').filter(x=>x.id!==sid);
                            const nextEmployees = STATE_STORE.get('employees').map(emp => emp.sectionId===sid ? {...emp, sectionId:null} : emp);
                            try {
                                await Promise.all([
                                    STATE_STORE.optimisticUpdate('sections', nextSections, STORAGE_ENGINE.saveSections),
                                    STATE_STORE.optimisticUpdate('employees', nextEmployees, STORAGE_ENGINE.saveEmployees),
                                ]);
                            } catch(err) {}
                            UI_RENDERER.closeModal(); refresh();
                        } else if (e.target.dataset.action==='cancel'||e.target.classList.contains('modal-close-btn')) UI_RENDERER.closeModal();
                    });
                };
                modal.addEventListener('click', e => {
                    const a = e.target.dataset.action;
                    if (a==='close'||e.target.classList.contains('modal-close-btn')) {
                        UI_RENDERER.closeModal(trigger); return;
                    }
                    if (e.target.closest('#add-sec-btn')) {
                        const inp=modal.querySelector('#new-sec-name'), n=inp.value.trim();
                        if (n) {
                            const sections = STATE_STORE.get('sections');
                            const nid=sections.length>0?Math.max(...sections.map(s=>s.id))+1:1;
                            const nextSections = [...sections, {id:nid,name:n}];
                            STATE_STORE.optimisticUpdate('sections', nextSections, STORAGE_ENGINE.saveSections).then(refresh).catch(()=>{});
                            inp.value='';
                        }
                        return;
                    }
                    const eb=e.target.closest('.edit-section-btn'); if(eb){openRename(parseInt(eb.dataset.id,10));return;}
                    const db=e.target.closest('.delete-section-btn'); if(db) openDel(parseInt(db.dataset.id,10));
                });
            }

            // ── OCR Import via Gemini Vision ───────────────────────────────
            function handleOcrImportClick() {
                const trigger  = _domCache.ocrImportBtn;
                const currentYear = STATE_STORE.get('currentYear');
                const currentMonth = STATE_STORE.get('currentMonth');

                let yo=''; for(let i=currentYear+5;i>=currentYear-5;i--) yo+=`<option value="${i}">${i}</option>`;
                const mo = APP_CONFIG.fullMonthNames.map((n,i)=>`<option value="${i+1}">${escHtml(n)}</option>`).join('');

                const modal = UI_RENDERER.showModal({
                    title: '<i data-lucide="camera" class="mr-2 inline-block" aria-hidden="true"></i> อ่านข้อมูลจากภาพ (Gemini AI)',
                    body: `
                    <div class="space-y-4">
                        <div>
                            <label for="ocr-key" class="block text-sm font-medium text-gray-700 mb-1">Google Gemini API Key</label>
                            <div class="flex gap-2">
                                <input type="password" id="ocr-key" value="" class="w-full p-2 border rounded-md font-mono text-sm" placeholder="AIza...">
                                <button id="ocr-save-key" class="text-xs bg-gray-100 border px-3 rounded hover:bg-gray-200 whitespace-nowrap">บันทึก</button>
                            </div>
                            <p class="text-xs text-gray-400 mt-1">คีย์จะถูกเข้ารหัส (AES-GCM) แล้วเก็บไว้ในเบราว์เซอร์เครื่องนี้ — หลีกเลี่ยงการบันทึกบนเครื่องสาธารณะ</p>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div><label for="ocr-year" class="block text-sm font-medium text-gray-700 mb-1">ปี</label><select id="ocr-year" class="w-full p-2 border rounded-md">${yo}</select></div>
                            <div><label for="ocr-month" class="block text-sm font-medium text-gray-700 mb-1">เดือน</label><select id="ocr-month" class="w-full p-2 border rounded-md">${mo}</select></div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">แนบภาพ Screenshot</label>
                            <div id="ocr-drop" class="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition">
                                <i data-lucide="cloud-upload" class="text-4xl text-gray-300 mb-2 inline-block" style="width:2.5rem;height:2.5rem;" aria-hidden="true"></i>
                                <p class="text-gray-500 text-sm font-medium">คลิกหรือลากภาพมาวาง</p>
                                <p class="text-gray-400 text-xs mt-1">หรือกด <kbd class="bg-gray-100 px-1 rounded">Ctrl+V</kbd> วางจาก Clipboard</p>
                            </div>
                            <input type="file" id="ocr-file" accept="image/*" class="hidden">
                            <div id="ocr-prev" class="mt-2 hidden text-center">
                                <img id="ocr-prev-img" class="max-h-28 rounded border mx-auto" alt="preview">
                                <p class="text-xs text-green-600 mt-1"><i data-lucide="circle-check" class="inline-block" style="width:0.9rem;height:0.9rem;" aria-hidden="true"></i> ภาพพร้อมวิเคราะห์</p>
                            </div>
                        </div>
                    </div>`,
                    actions: [
                        {id:'cancel',  text:'ยกเลิก',      classes:'bg-gray-200 text-gray-800 hover:bg-gray-300'},
                        {id:'analyze', text:'วิเคราะห์ภาพ', classes:'bg-teal-600 text-white hover:bg-teal-700'}
                    ]
                }, trigger);

                modal.querySelector('#ocr-year').value  = currentYear;
                modal.querySelector('#ocr-month').value = currentMonth;

                GEMINI_AI_BRIDGE.decryptApiKey().then(k => {
                    if (k) modal.querySelector('#ocr-key').value = k;
                }).catch(err => DEBUG_MODULE.log('error','AI',err));

                let imgB64=null, imgMime=null;
                const fileToB64 = f => new Promise((res,rej)=>{
                    const r=new FileReader();
                    r.onload=e=>{ const [,b64]=e.target.result.split(','); res({b64,mime:f.type||'image/png'}); };
                    r.onerror=rej; r.readAsDataURL(f);
                });
                const setPreview = (b64,mime) => {
                    imgB64=b64; imgMime=mime;
                    const prev=modal.querySelector('#ocr-prev'), img=modal.querySelector('#ocr-prev-img');
                    img.src=`data:${mime};base64,${b64}`; prev.classList.remove('hidden');
                    modal.querySelector('#ocr-drop').classList.add('hidden');
                };

                const drop = modal.querySelector('#ocr-drop');
                const fi   = modal.querySelector('#ocr-file');
                drop.addEventListener('click', ()=>fi.click());
                drop.addEventListener('dragover', e=>{e.preventDefault(); drop.classList.add('border-teal-400','bg-teal-50');});
                drop.addEventListener('dragleave', ()=>drop.classList.remove('border-teal-400','bg-teal-50'));
                drop.addEventListener('drop', async e=>{ e.preventDefault(); const f=e.dataTransfer.files[0]; if(f&&f.type.startsWith('image/')){const{b64,mime}=await fileToB64(f); setPreview(b64,mime);} });
                fi.addEventListener('change', async e=>{ const f=e.target.files[0]; if(f){const{b64,mime}=await fileToB64(f); setPreview(b64,mime);} });

                const onPaste = async e => {
                    if (!document.getElementById(modal.id)?.contains(document.activeElement) && document.activeElement!==document.body) return;
                    for (const item of (e.clipboardData?.items||[])) {
                        if (item.type.startsWith('image/')) { const{b64,mime}=await fileToB64(item.getAsFile()); setPreview(b64,mime); break; }
                    }
                };
                document.addEventListener('paste', onPaste);
                modal._onClose = () => document.removeEventListener('paste', onPaste);

                modal.querySelector('#ocr-save-key').addEventListener('click', async ()=>{
                    const k=modal.querySelector('#ocr-key').value.trim();
                    if(k){
                        try { await GEMINI_AI_BRIDGE.encryptAndStoreApiKey(k); UI_RENDERER.showNotification('บันทึก API Key แล้ว (เข้ารหัสไว้)','success'); }
                        catch(err) { DEBUG_MODULE.log('error','STORAGE',err); UI_RENDERER.showNotification('บันทึก API Key ไม่สำเร็จ','error'); }
                    }
                });

                modal.addEventListener('click', async e => {
                    const a = e.target.dataset.action;
                    if (a==='cancel'||e.target.classList.contains('modal-close-btn')) {
                        UI_RENDERER.closeModal(trigger); return;
                    }
                    if (a==='analyze') {
                        const key   = modal.querySelector('#ocr-key').value.trim();
                        const year  = parseInt(modal.querySelector('#ocr-year').value,10);
                        const month = parseInt(modal.querySelector('#ocr-month').value,10);
                        if (!key)   { UI_RENDERER.showNotification('กรุณาใส่ Gemini API Key','error'); return; }
                        if (!imgB64){ UI_RENDERER.showNotification('กรุณาแนบภาพก่อน','error'); return; }
                        const btn = e.target;
                        btn.disabled=true; btn.innerHTML='<i data-lucide="loader-2" class="mr-2 inline-block animate-spin" aria-hidden="true"></i>กำลังวิเคราะห์...';
                        if (window.lucide) lucide.createIcons();
                        btn.classList.add('opacity-75','cursor-not-allowed');
                        try {
                            const extracted = await GEMINI_AI_BRIDGE.analyzeImageWithGemini(key, imgB64, imgMime);
                            UI_RENDERER.closeModal(trigger);
                            showOcrReviewModal(extracted, year, month, trigger);
                        } catch(err) {
                            UI_RENDERER.showNotification(`วิเคราะห์ไม่สำเร็จ: ${err.message}`,'error');
                            btn.disabled=false; btn.innerHTML='วิเคราะห์ภาพ';
                            btn.classList.remove('opacity-75','cursor-not-allowed');
                        }
                    }
                });
            }

            function showOcrReviewModal(extracted, year, month, originalTrigger) {
                const mName = APP_CONFIG.fullMonthNames[month-1];
                const rows  = extracted.map(item => ({
                    src:      item.name,
                    count:    typeof item.count==='number' ? item.count : parseInt(item.count,10)||0,
                    employee: GEMINI_AI_BRIDGE.matchEmployeeByName(item.name)
                }));
                const matched   = rows.filter(r=>r.employee).length;
                const unmatched = rows.filter(r=>!r.employee).length;

                const rowsHtml = rows.map((r,i)=>`
                    <tr class="${r.employee?'':'bg-yellow-50'}">
                        <td class="px-3 py-2 text-sm text-gray-500">${escHtml(r.src)}</td>
                        <td class="px-3 py-2 text-sm font-medium ${r.employee?'text-green-700':'text-yellow-600'}">
                            ${r.employee ? `${escHtml(r.employee.firstName)} ${escHtml(r.employee.lastName)}`
                                         : '<span class="text-xs italic">ไม่พบ — ข้ามไป</span>'}
                        </td>
                        <td class="px-3 py-2 text-center">
                            <input type="number" min="0" class="ocr-cnt w-16 p-1 border rounded text-center text-sm"
                                   data-idx="${i}" value="${r.count}" ${r.employee?'':'disabled'}>
                        </td>
                    </tr>`).join('');

                const modal = UI_RENDERER.showModal({
                    title: `<i data-lucide="clipboard-check" class="mr-2 inline-block" aria-hidden="true"></i> ตรวจสอบผลลัพธ์ — ${escHtml(mName)} ${year}`,
                    body: `
                    <div class="flex flex-wrap gap-2 mb-3">
                        <span class="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">✓ จับคู่ได้ ${matched} คน</span>
                        ${unmatched>0?`<span class="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">⚠ ไม่พบ ${unmatched} คน (ข้ามไป)</span>`:''}
                    </div>
                    <div class="overflow-y-auto max-h-72 border rounded-lg">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-100 sticky top-0">
                                <tr>
                                    <th class="px-3 py-2 text-left text-xs font-semibold text-gray-600">ชื่อจากภาพ</th>
                                    <th class="px-3 py-2 text-left text-xs font-semibold text-gray-600">จับคู่กับ</th>
                                    <th class="px-3 py-2 text-center text-xs font-semibold text-gray-600">Count</th>
                                </tr>
                            </thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">* แก้ไขตัวเลขได้ก่อนกดบันทึก</p>`,
                    actions:[
                        {id:'cancel', text:'ยกเลิก',      classes:'bg-gray-200 text-gray-800 hover:bg-gray-300'},
                        {id:'save',   text:'บันทึกทั้งหมด', classes:'bg-teal-600 text-white hover:bg-teal-700'}
                    ]
                }, originalTrigger);

                modal.addEventListener('click', async e => {
                    const a = e.target.dataset.action;
                    if (a==='cancel'||e.target.classList.contains('modal-close-btn')) {
                        UI_RENDERER.closeModal(originalTrigger); return;
                    }
                    if (a==='save') {
                        const activities = [...STATE_STORE.get('activities')];
                        let saved=0;
                        modal.querySelectorAll('.ocr-cnt:not([disabled])').forEach(inp => {
                            const row = rows[parseInt(inp.dataset.idx,10)];
                            if (!row?.employee) return;
                            const cnt = parseInt(inp.value,10);
                            if (isNaN(cnt)||cnt<0) return;
                            const eid = row.employee.id;
                            const idx = activities.findIndex(x=>x.employeeId===eid&&x.year===year&&x.month===month);
                            if (idx>=0) activities[idx] = {...activities[idx], count:cnt};
                            else activities.push({employeeId:eid,year,month,count:cnt});
                            saved++;
                        });
                        try {
                            await STATE_STORE.optimisticUpdate('activities', activities, STORAGE_ENGINE.saveActivities);
                            UI_RENDERER.showNotification(`บันทึกข้อมูล ${saved} คนสำเร็จ!`,'success');
                        } catch(err) {}
                        UI_RENDERER.closeModal(originalTrigger);
                    }
                });
            }

            // ── Lotus Notes CSV Import (Phase B of the PowerShell/COM bridge) ─
            function handleNotesCsvImportClick() {
                const trigger  = _domCache.notesCsvImportBtn;
                const currentYear = STATE_STORE.get('currentYear');
                const currentMonth = STATE_STORE.get('currentMonth');

                let yo=''; for(let i=currentYear+5;i>=currentYear-5;i--) yo+=`<option value="${i}">${i}</option>`;
                const mo = APP_CONFIG.fullMonthNames.map((n,i)=>`<option value="${i+1}">${escHtml(n)}</option>`).join('');

                const modal = UI_RENDERER.showModal({
                    title: '<i data-lucide="file-spreadsheet" class="mr-2 inline-block" aria-hidden="true"></i> นำเข้าจาก Lotus Notes (CSV)',
                    body: `
                    <div class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div><label for="notes-csv-year" class="block text-sm font-medium text-gray-700 mb-1">ปี</label><select id="notes-csv-year" class="w-full p-2 border rounded-md">${yo}</select></div>
                            <div><label for="notes-csv-month" class="block text-sm font-medium text-gray-700 mb-1">เดือน</label><select id="notes-csv-month" class="w-full p-2 border rounded-md">${mo}</select></div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">แนบไฟล์ CSV</label>
                            <div id="notes-csv-drop" class="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-cyan-400 hover:bg-cyan-50 transition">
                                <i data-lucide="cloud-upload" class="text-4xl text-gray-300 mb-2 inline-block" style="width:2.5rem;height:2.5rem;" aria-hidden="true"></i>
                                <p class="text-gray-500 text-sm font-medium">คลิกหรือลากไฟล์ CSV มาวาง</p>
                                <p class="text-gray-400 text-xs mt-1">ไฟล์ที่ export จาก export-kaizen-from-notes.ps1</p>
                            </div>
                            <input type="file" id="notes-csv-file" accept=".csv,text/csv" class="hidden">
                            <div id="notes-csv-prev" class="mt-2 hidden text-center">
                                <p class="text-xs text-green-600 mt-1"><i data-lucide="circle-check" class="inline-block" style="width:0.9rem;height:0.9rem;" aria-hidden="true"></i> <span id="notes-csv-prev-name"></span> พร้อมนำเข้า</p>
                            </div>
                        </div>
                    </div>`,
                    actions: [
                        {id:'cancel', text:'ยกเลิก',    classes:'bg-gray-200 text-gray-800 hover:bg-gray-300'},
                        {id:'import', text:'นำเข้า CSV', classes:'bg-cyan-600 text-white hover:bg-cyan-700'}
                    ]
                }, trigger);

                modal.querySelector('#notes-csv-year').value  = currentYear;
                modal.querySelector('#notes-csv-month').value = currentMonth;

                let csvText = null;
                const readFile = f => new Promise((res,rej)=>{
                    const r=new FileReader();
                    r.onload=e=>res(e.target.result);
                    r.onerror=rej; r.readAsText(f, 'utf-8');
                });
                const setPreview = (text, name) => {
                    csvText = text;
                    const prev=modal.querySelector('#notes-csv-prev');
                    modal.querySelector('#notes-csv-prev-name').textContent = name;
                    prev.classList.remove('hidden');
                    modal.querySelector('#notes-csv-drop').classList.add('hidden');
                };

                const drop = modal.querySelector('#notes-csv-drop');
                const fi   = modal.querySelector('#notes-csv-file');
                drop.addEventListener('click', ()=>fi.click());
                drop.addEventListener('dragover', e=>{e.preventDefault(); drop.classList.add('border-cyan-400','bg-cyan-50');});
                drop.addEventListener('dragleave', ()=>drop.classList.remove('border-cyan-400','bg-cyan-50'));
                drop.addEventListener('drop', async e=>{ e.preventDefault(); const f=e.dataTransfer.files[0]; if(f){ setPreview(await readFile(f), f.name); } });
                fi.addEventListener('change', async e=>{ const f=e.target.files[0]; if(f){ setPreview(await readFile(f), f.name); } });

                modal.addEventListener('click', async e => {
                    const a = e.target.dataset.action;
                    if (a==='cancel'||e.target.classList.contains('modal-close-btn')) {
                        UI_RENDERER.closeModal(trigger); return;
                    }
                    if (a==='import') {
                        const year  = parseInt(modal.querySelector('#notes-csv-year').value,10);
                        const month = parseInt(modal.querySelector('#notes-csv-month').value,10);
                        if (!csvText) { UI_RENDERER.showNotification('กรุณาแนบไฟล์ CSV ก่อน','error'); return; }
                        const { rows, warnings } = NOTES_BRIDGE.parseKaizenCsv(csvText);
                        if (warnings.length) {
                            UI_RENDERER.showNotification(`ข้าม ${warnings.length} แถวที่อ่านไม่ได้ (${warnings[0]})`, 'info');
                        }
                        if (!rows.length) { UI_RENDERER.showNotification('ไม่พบข้อมูลที่นำเข้าได้ในไฟล์นี้','error'); return; }
                        const extracted = rows.map(r => ({ name: r.name, count: r.count }));
                        UI_RENDERER.closeModal(trigger);
                        showOcrReviewModal(extracted, year, month, trigger);
                    }
                });
            }

            // ── Export JSON / Export standalone HTML ───────────────────────
            function handleExportJsonClick() {
                STORAGE_ENGINE.exportJson(STATE_STORE.get('sections'), STATE_STORE.get('employees'), STATE_STORE.get('activities'));
                UI_RENDERER.showNotification('ส่งออกข้อมูล JSON สำเร็จ','success');
            }

            function handleExportHtmlClick() {
                const safe = STORAGE_ENGINE.serializeForExport(STATE_STORE.get('sections'), STATE_STORE.get('employees'), STATE_STORE.get('activities'));
                const cur = document.documentElement.outerHTML;
                const pat = /<script id="data-injector"[^>]*>[\s\S]*?<\/script>/;
                if (!pat.test(cur)) { UI_RENDERER.showNotification('ไม่พบตำแหน่งฝังข้อมูล','error'); return; }
                const blob = new Blob(['<!DOCTYPE html>\n' + cur.replace(pat, `<script id="data-injector" type="application/json">${safe}<\/script>`)], {type:'text/html'});
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href=url; a.download=`Kaizen_Tracker_Report_${new Date().toISOString().slice(0,10)}.html`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                UI_RENDERER.showNotification('ไฟล์ HTML พร้อมข้อมูลถูกสร้างแล้ว!','success');
            }

            // ── Email Summary ──────────────────────────────────────────────
            function handleGenerateEmailClick() {
                const trigger = _domCache.generateEmailBtn;
                const currentYear  = STATE_STORE.get('currentYear');
                const currentMonth = STATE_STORE.get('currentMonth');
                const filterYear   = STATE_STORE.get('filterYear');
                let yo=''; for(let i=currentYear+5;i>=currentYear-5;i--) yo+=`<option value="${i}" ${i===filterYear?'selected':''}>${i}</option>`;
                const mo = APP_CONFIG.fullMonthNames.map((n,i)=>`<option value="${i+1}" ${i+1===currentMonth?'selected':''}>${escHtml(n)}</option>`).join('');

                const modal = UI_RENDERER.showModal({
                    title: '<i data-lucide="mail" class="mr-2 inline-block" aria-hidden="true"></i> สร้างสรุปอีเมล',
                    maxWidth: 'max-w-2xl',
                    body: `
                    <div class="space-y-3">
                        <div class="grid grid-cols-2 gap-4">
                            <div><label for="em-year" class="block text-sm font-medium text-gray-700 mb-1">ปี</label><select id="em-year" class="w-full p-2 border rounded-md">${yo}</select></div>
                            <div><label for="em-month" class="block text-sm font-medium text-gray-700 mb-1">เดือน</label><select id="em-month" class="w-full p-2 border rounded-md">${mo}</select></div>
                        </div>
                        <div class="flex border-b border-gray-200">
                            <button id="tab-preview" class="px-4 py-2 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 -mb-px flex items-center gap-1"><i data-lucide="eye" style="width:1rem;height:1rem;"></i> ตัวอย่าง HTML</button>
                            <button id="tab-text"    class="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent -mb-px flex items-center gap-1"><i data-lucide="align-left" style="width:1rem;height:1rem;"></i> Plain Text</button>
                        </div>
                        <div id="panel-preview" class="border rounded-lg overflow-hidden bg-gray-50" style="height:380px;">
                            <iframe id="em-preview" class="w-full h-full border-0" title="ตัวอย่างอีเมล" sandbox="allow-same-origin"></iframe>
                        </div>
                        <div id="panel-text" class="hidden">
                            <textarea id="em-body" class="w-full p-3 border rounded-lg font-mono text-xs bg-gray-50 resize-none focus:ring-2 focus:ring-orange-400" style="height:380px;"></textarea>
                        </div>
                    </div>`,
                    actions:[
                        {id:'cancel',     text:'ปิด',              classes:'bg-gray-200 text-gray-800 hover:bg-gray-300'},
                        {id:'copy-text',  text:'คัดลอก Plain Text', classes:'bg-gray-500 text-white hover:bg-gray-600'},
                        {id:'copy-html',  text:'คัดลอก HTML',       classes:'bg-orange-500 text-white hover:bg-orange-600'}
                    ]
                }, trigger);

                let cachedHtml='', cachedText='';

                const refreshContent = () => {
                    const y = parseInt(modal.querySelector('#em-year').value,10);
                    const m = parseInt(modal.querySelector('#em-month').value,10);
                    cachedHtml = UI_RENDERER.generateEmailHtml(y,m);
                    cachedText = UI_RENDERER.generateEmailSummary(y,m);
                    const iframe = modal.querySelector('#em-preview');
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    doc.open(); doc.write(cachedHtml); doc.close();
                    const ta = modal.querySelector('#em-body');
                    if (ta) ta.value = cachedText;
                };

                const tabPrev  = modal.querySelector('#tab-preview');
                const tabTxt   = modal.querySelector('#tab-text');
                const panPrev  = modal.querySelector('#panel-preview');
                const panTxt   = modal.querySelector('#panel-text');
                const CLS_ON   = 'px-4 py-2 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 -mb-px flex items-center gap-1';
                const CLS_OFF  = 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent -mb-px flex items-center gap-1';
                tabPrev.addEventListener('click', () => {
                    tabPrev.className=CLS_ON; tabTxt.className=CLS_OFF;
                    panPrev.classList.remove('hidden'); panTxt.classList.add('hidden');
                });
                tabTxt.addEventListener('click', () => {
                    tabTxt.className=CLS_ON; tabPrev.className=CLS_OFF;
                    panTxt.classList.remove('hidden'); panPrev.classList.add('hidden');
                });

                modal.querySelector('#em-year').addEventListener('change',  refreshContent);
                modal.querySelector('#em-month').addEventListener('change', refreshContent);
                refreshContent();
                if (window.lucide) lucide.createIcons();

                modal.addEventListener('click', async e => {
                    const a = e.target.dataset.action;
                    if (a==='cancel'||e.target.classList.contains('modal-close-btn')) { UI_RENDERER.closeModal(trigger); return; }
                    const copyText = async (text, msg) => {
                        try { await navigator.clipboard.writeText(text); }
                        catch { const t=document.createElement('textarea'); t.value=text; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
                        UI_RENDERER.showNotification(msg,'success');
                    };
                    if (a==='copy-html') copyText(cachedHtml, 'คัดลอก HTML แล้ว! วางใน Outlook หรือ Gmail ได้เลย');
                    if (a==='copy-text') copyText(cachedText, 'คัดลอก Plain Text แล้ว!');
                });
            }

            // ── PDF Report ─────────────────────────────────────────────────
            function handleExportReportClick() {
                const trigger = _domCache.exportReportBtn;
                const currentYear  = STATE_STORE.get('currentYear');
                const currentMonth = STATE_STORE.get('currentMonth');
                const filterYear   = STATE_STORE.get('filterYear');

                let yo=''; for(let i=currentYear+5;i>=currentYear-5;i--) yo+=`<option value="${i}" ${i===filterYear?'selected':''}>${i}</option>`;
                const mo = APP_CONFIG.fullMonthNames.map((n,i)=>`<option value="${i+1}" ${i+1===currentMonth?'selected':''}>${escHtml(n)}</option>`).join('');

                const modal = UI_RENDERER.showModal({
                    title: '<i data-lucide="file-text" class="mr-2 text-rose-500 inline-block" aria-hidden="true"></i> ส่งออกรายงาน PDF',
                    maxWidth: 'max-w-4xl',
                    body: `
                    <div class="space-y-3">
                        <div class="grid grid-cols-2 gap-4">
                            <div><label for="rpt-year" class="block text-sm font-medium text-gray-700 mb-1">ปี</label>
                                <select id="rpt-year" class="w-full p-2 border rounded-md">${yo}</select></div>
                            <div><label for="rpt-month" class="block text-sm font-medium text-gray-700 mb-1">เดือน</label>
                                <select id="rpt-month" class="w-full p-2 border rounded-md">${mo}</select></div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div><label for="rpt-title" class="block text-sm font-medium text-gray-700 mb-1">ชื่อรายงาน</label>
                                <input id="rpt-title" type="text" class="w-full p-2 border rounded-md text-sm" value="รายงานสรุปกิจกรรม Kaizen 2026 PE#1"></div>
                            <div><label for="rpt-author" class="block text-sm font-medium text-gray-700 mb-1">จัดทำโดย</label>
                                <input id="rpt-author" type="text" class="w-full p-2 border rounded-md text-sm" value="Supasit A."></div>
                        </div>
                        <div class="border rounded-xl overflow-hidden shadow-inner bg-gray-100" style="height:460px;">
                            <iframe id="rpt-frame" class="w-full h-full border-0" title="ตัวอย่างรายงาน" sandbox="allow-same-origin"></iframe>
                        </div>
                        <p class="text-xs text-center text-gray-400"><i data-lucide="info" style="width:0.9rem;height:0.9rem;" class="inline-block mr-1"></i>กด "พิมพ์ / บันทึก PDF" → เลือก Destination: <b>Save as PDF</b> → กด Save</p>
                    </div>`,
                    actions: [
                        { id:'cancel', text:'ปิด',                  classes:'bg-gray-200 text-gray-800 hover:bg-gray-300' },
                        { id:'print',  text:'🖨️  พิมพ์ / บันทึก PDF', classes:'bg-rose-600 text-white hover:bg-rose-700' }
                    ]
                }, trigger);

                let cachedHtml = '';
                const refreshReport = () => {
                    const y      = parseInt(modal.querySelector('#rpt-year').value,   10);
                    const m      = parseInt(modal.querySelector('#rpt-month').value,  10);
                    const title  = modal.querySelector('#rpt-title').value.trim()  || 'รายงานสรุปกิจกรรม Kaizen';
                    const author = modal.querySelector('#rpt-author').value.trim() || 'ระบบ Kaizen Activity Tracker';
                    cachedHtml = UI_RENDERER.generateReportHtml(y, m, title, author);
                    const frame = modal.querySelector('#rpt-frame');
                    const doc   = frame.contentDocument || frame.contentWindow.document;
                    doc.open(); doc.write(cachedHtml); doc.close();
                };

                modal.querySelector('#rpt-year').addEventListener('change',   refreshReport);
                modal.querySelector('#rpt-month').addEventListener('change',  refreshReport);
                modal.querySelector('#rpt-title').addEventListener('input',   refreshReport);
                modal.querySelector('#rpt-author').addEventListener('input',  refreshReport);
                refreshReport();
                if (window.lucide) lucide.createIcons();

                STORAGE_ENGINE.get('settings','reportAuthor').then(rec => {
                    if (rec && rec.value) { modal.querySelector('#rpt-author').value = rec.value; refreshReport(); }
                }).catch(err => DEBUG_MODULE.log('error','STORAGE',err));

                modal.addEventListener('click', e => {
                    const a = e.target.dataset.action;
                    if (a==='cancel'||e.target.classList.contains('modal-close-btn')) {
                        UI_RENDERER.closeModal(trigger); return;
                    }
                    if (a==='print') {
                        const authorVal = modal.querySelector('#rpt-author').value.trim();
                        if (authorVal) STORAGE_ENGINE.saveReportAuthor(authorVal).catch(err=>DEBUG_MODULE.log('error','STORAGE',err));
                        const w = window.open('', '_blank');
                        if (!w) {
                            UI_RENDERER.showNotification('กรุณาอนุญาต Pop-up สำหรับหน้านี้แล้วลองใหม่', 'error');
                            return;
                        }
                        w.document.write(cachedHtml);
                        w.document.close();
                        const doPrint = () => { w.focus(); w.print(); };
                        if (w.document.fonts && w.document.fonts.ready) {
                            Promise.race([
                                w.document.fonts.ready,
                                new Promise(res => setTimeout(res, 3000))
                            ]).then(() => setTimeout(doPrint, 100));
                        } else {
                            setTimeout(doPrint, 800);
                        }
                    }
                });
            }

            // ── Email Banner Export ─────────────────────────────────────────
            function handleExportEmailBannerClick() {
                const trigger = _domCache.exportEmailBannerBtn;
                const currentYear  = STATE_STORE.get('currentYear');
                const currentMonth = STATE_STORE.get('currentMonth');
                const filterYear   = STATE_STORE.get('filterYear');

                let yo=''; for(let i=currentYear+5;i>=currentYear-5;i--) yo+=`<option value="${i}" ${i===filterYear?'selected':''}>${i}</option>`;
                const mo = APP_CONFIG.fullMonthNames.map((n,i)=>`<option value="${i+1}" ${i+1===currentMonth?'selected':''}>${escHtml(n)}</option>`).join('');

                const modal = UI_RENDERER.showModal({
                    title: '<i data-lucide="images" class="mr-2 text-emerald-500 inline-block" aria-hidden="true"></i> ส่งออก Email Banner (900px แนวนอน)',
                    maxWidth: 'max-w-4xl',
                    body: `
                    <div class="space-y-3">
                        <div class="grid grid-cols-2 gap-4">
                            <div><label for="eb-year" class="block text-sm font-medium text-gray-700 mb-1">ปี</label>
                                <select id="eb-year" class="w-full p-2 border rounded-md">${yo}</select></div>
                            <div><label for="eb-month" class="block text-sm font-medium text-gray-700 mb-1">เดือน</label>
                                <select id="eb-month" class="w-full p-2 border rounded-md">${mo}</select></div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div><label for="eb-title" class="block text-sm font-medium text-gray-700 mb-1">ชื่อรายงาน</label>
                                <input id="eb-title" type="text" class="w-full p-2 border rounded-md text-sm" value="รายงานสรุปกิจกรรม Kaizen 2026 PE#1"></div>
                            <div><label for="eb-author" class="block text-sm font-medium text-gray-700 mb-1">จัดทำโดย</label>
                                <input id="eb-author" type="text" class="w-full p-2 border rounded-md text-sm" value="Supasit A."></div>
                        </div>
                        <div class="border rounded-xl overflow-hidden shadow-inner bg-gray-200" style="height:460px;">
                            <iframe id="eb-frame" class="w-full h-full border-0" title="ตัวอย่าง Email Banner" sandbox="allow-same-origin" style="transform-origin:top left;"></iframe>
                        </div>
                        <p class="text-xs text-center text-gray-500 font-medium">📋 กด "คัดลอกรูปภาพ" แล้ววาง (Ctrl+V) ลงในอีเมลได้ทันที ไม่ต้อง Screenshot เอง</p>
                    </div>`,
                    actions: [
                        { id:'cancel',     text:'ปิด',              classes:'bg-gray-200 text-gray-800 hover:bg-gray-300' },
                        { id:'copy-image', text:'คัดลอกรูปภาพ', icon:'copy', classes:'bg-emerald-600 text-white hover:bg-emerald-700' }
                    ]
                }, trigger);

                let cachedHtml = '';
                const refreshBanner = () => {
                    const y      = parseInt(modal.querySelector('#eb-year').value,   10);
                    const m      = parseInt(modal.querySelector('#eb-month').value,  10);
                    const title  = modal.querySelector('#eb-title').value.trim()  || 'รายงานสรุปกิจกรรม Kaizen';
                    const author = modal.querySelector('#eb-author').value.trim() || 'ระบบ Kaizen Activity Tracker';
                    cachedHtml = UI_RENDERER.generateEmailBannerHtml(y, m, title, author);
                    const frame = modal.querySelector('#eb-frame');
                    const doc   = frame.contentDocument || frame.contentWindow.document;
                    doc.open(); doc.write(cachedHtml); doc.close();
                };

                modal.querySelector('#eb-year').addEventListener('change',   refreshBanner);
                modal.querySelector('#eb-month').addEventListener('change',  refreshBanner);
                modal.querySelector('#eb-title').addEventListener('input',   refreshBanner);
                modal.querySelector('#eb-author').addEventListener('input',  refreshBanner);
                refreshBanner();
                if (window.lucide) lucide.createIcons();

                STORAGE_ENGINE.get('settings','reportAuthor').then(rec => {
                    if (rec && rec.value) { modal.querySelector('#eb-author').value = rec.value; refreshBanner(); }
                }).catch(err => DEBUG_MODULE.log('error','STORAGE',err));

                modal.addEventListener('click', e => {
                    const a = e.target.dataset.action;
                    if (a==='cancel'||e.target.classList.contains('modal-close-btn')) {
                        UI_RENDERER.closeModal(trigger); return;
                    }
                    if (a==='copy-image') {
                        const authorVal = modal.querySelector('#eb-author').value.trim();
                        if (authorVal) STORAGE_ENGINE.saveReportAuthor(authorVal).catch(err=>DEBUG_MODULE.log('error','STORAGE',err));
                        const y      = parseInt(modal.querySelector('#eb-year').value,  10);
                        const m      = parseInt(modal.querySelector('#eb-month').value, 10);
                        const title  = modal.querySelector('#eb-title').value.trim()  || 'รายงานสรุปกิจกรรม Kaizen';
                        const author = authorVal || 'ระบบ Kaizen Activity Tracker';
                        const btn = e.target.closest('button[data-action="copy-image"]');
                        if (btn) { btn.disabled = true; btn.classList.add('opacity-60','cursor-not-allowed'); }
                        handleCopyBannerImage(y, m, title, author).finally(() => {
                            if (btn) { btn.disabled = false; btn.classList.remove('opacity-60','cursor-not-allowed'); }
                        });
                    }
                });
            }

            // ── Email Banner: capture → clipboard → download fallback ──────
            function _getBannerCaptureEl() {
                if (!_bannerCaptureEl) {
                    _bannerCaptureEl = document.createElement('div');
                    _bannerCaptureEl.id = 'eb-capture-root';
                    _bannerCaptureEl.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;pointer-events:none;';
                    document.body.appendChild(_bannerCaptureEl);
                }
                return _bannerCaptureEl;
            }

            async function _waitForBannerFonts() {
                if (document.fonts && document.fonts.ready) {
                    await Promise.race([ document.fonts.ready, new Promise(res => setTimeout(res, 3000)) ]);
                    await new Promise(res => setTimeout(res, 100));
                } else {
                    await new Promise(res => setTimeout(res, 800));
                }
            }

            async function _captureBannerBlob(year, month, title, author) {
                const root = _getBannerCaptureEl();
                root.innerHTML = UI_RENDERER.generateEmailBannerContent(year, month, title, author);
                const node = root.firstElementChild;
                await _waitForBannerFonts();
                return await htmlToImage.toBlob(node, {
                    pixelRatio: 2,
                    backgroundColor: '#ffffff',
                    cacheBust: true,
                });
            }

            async function handleCopyBannerImage(year, month, title, author) {
                let blob;
                try {
                    blob = await _captureBannerBlob(year, month, title, author);
                    if (!blob) throw new Error('toBlob returned null');
                } catch (err) {
                    DEBUG_MODULE.log('error', 'EMAIL_BANNER_CAPTURE', err);
                    UI_RENDERER.showNotification('สร้างรูปภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'error');
                    return;
                }

                const filename = `Kaizen_Email_Banner_${year}_${String(month).padStart(2,'0')}.png`;
                try {
                    if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
                        throw new Error('Clipboard image write API not supported in this browser/context');
                    }
                    await navigator.clipboard.write([ new ClipboardItem({ 'image/png': blob }) ]);
                    UI_RENDERER.showNotification('คัดลอกรูปภาพแล้ว! ไปที่อีเมลแล้วกด Ctrl+V เพื่อวางได้เลย', 'success');
                } catch (err) {
                    DEBUG_MODULE.log('error', 'EMAIL_BANNER_CLIPBOARD', err);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = filename;
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    UI_RENDERER.showNotification('ไม่สามารถคัดลอกรูปภาพอัตโนมัติได้ ระบบดาวน์โหลดไฟล์ PNG ให้แทน กรุณาแนบไฟล์ในอีเมลด้วยตนเอง', 'info');
                }
            }

            return { init };
        })();

        document.addEventListener('DOMContentLoaded', () => {
            APP_CORE.init();
        });
