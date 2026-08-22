/* global Chart, lucide */
import { APP_CONFIG } from './app-config.js';
import { STATE_STORE } from './state-store.js';
import { DEBUG_MODULE } from './debug-module.js';
import { escHtml } from './utils.js';

        // ─── UI_RENDERER — DOM rendering, modals, notifications, report/email/PDF/banner generators
export const UI_RENDERER = (() => {
            'use strict';
            let _dom = null;
            let _chartInstance = null;

            function setDom(domCache) { _dom = domCache; }

            function renderAll() {
                renderReportTable();
                renderDashboardChart();
            }

            function populateAllDropdowns() {
                const { employeeSelect, yearSelect, monthSelect, filterYearChart, filterSection } = _dom;
                const currentYear  = STATE_STORE.get('currentYear');
                const currentMonth = STATE_STORE.get('currentMonth');
                const filterYear   = STATE_STORE.get('filterYear');
                const employees    = STATE_STORE.get('employees');
                const sections     = STATE_STORE.get('sections');

                employeeSelect.innerHTML = '';
                const blank = document.createElement('option');
                blank.value = ''; blank.textContent = '-- เลือกพนักงาน --';
                employeeSelect.appendChild(blank);
                [...employees]
                    .sort((a,b) => a.firstName.localeCompare(b.firstName,'th'))
                    .forEach(emp => {
                        const o = document.createElement('option');
                        o.value = emp.id; o.textContent = `${emp.firstName} ${emp.lastName}`;
                        employeeSelect.appendChild(o);
                    });

                let yo = '';
                for (let i = currentYear+5; i >= currentYear-5; i--) yo += `<option value="${i}">${i}</option>`;
                yearSelect.innerHTML = filterYearChart.innerHTML = yo;
                yearSelect.value = currentYear; filterYearChart.value = filterYear;

                monthSelect.innerHTML = APP_CONFIG.fullMonthNames
                    .map((n,i) => `<option value="${i+1}">${escHtml(n)}</option>`).join('');
                monthSelect.value = currentMonth;

                filterSection.innerHTML = '<option value="all">ทุกแผนก</option>';
                sections.forEach(s => {
                    const o = document.createElement('option');
                    o.value = s.id; o.textContent = s.name;
                    filterSection.appendChild(o);
                });
                filterSection.value = STATE_STORE.get('filterSection');
                _dom.globalTargetInput.value = STATE_STORE.get('globalTarget');
            }

            function renderReportTable() {
                const { reportTable } = _dom;
                const filterYear    = STATE_STORE.get('filterYear');
                const filterSection = STATE_STORE.get('filterSection');
                const sections      = STATE_STORE.get('sections');
                const employees     = STATE_STORE.get('employees');
                const activities    = STATE_STORE.get('activities');
                const monthNames    = APP_CONFIG.monthNames;

                _dom.mainHeader.textContent = `Kaizen Activity Tracker - ปี ${filterYear}`;

                const filtered = employees.filter(emp =>
                    filterSection === 'all' || emp.sectionId === parseInt(filterSection, 10)
                );
                const scores = filtered.map(emp => {
                    const acts = activities.filter(a => a.employeeId === emp.id && a.year === filterYear);
                    return { emp, totalSum: acts.reduce((s,a) => s+a.count, 0) };
                }).sort((a,b) => b.totalSum - a.totalSum);

                renderTopPerformers(scores);

                const thead = reportTable.querySelector('thead');
                const tbody = reportTable.querySelector('tbody');
                const tfoot = reportTable.querySelector('tfoot');

                thead.innerHTML = `<tr>
                    <th scope="col" class="px-4 py-3">ชื่อ-สกุล</th>
                    <th scope="col" class="px-2 py-3 text-center">แผนก</th>
                    <th scope="col" class="px-2 py-3 text-center bg-blue-100">รวม</th>
                    <th scope="col" class="px-2 py-3 text-center">ความคืบหน้า</th>
                    ${monthNames.map(m=>`<th scope="col" class="px-2 py-3 text-center w-8">${escHtml(m)}</th>`).join('')}
                    <th scope="col" class="px-4 py-3 text-center no-print">จัดการ</th>
                </tr>`;

                if (scores.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="17" class="text-center py-10 text-gray-500">ไม่พบข้อมูลพนักงาน</td></tr>`;
                    tfoot.innerHTML = '';
                    if (window.lucide) lucide.createIcons();
                    return;
                }

                let grand = 0;
                const mTotals = Array(12).fill(0);
                const top = scores[0].totalSum;
                const gTgt = STATE_STORE.get('globalTarget') || 12;

                tbody.innerHTML = scores.map(({emp, totalSum}) => {
                    const sec  = sections.find(s => s.id === emp.sectionId);
                    const acts = activities.filter(a => a.employeeId === emp.id && a.year === filterYear);
                    const mc   = Array(12).fill(0);
                    acts.forEach(a => { if(a.month>=1&&a.month<=12) mc[a.month-1]+=a.count; });
                    mc.forEach((c,i) => mTotals[i]+=c);
                    grand += totalSum;
                    const pct = gTgt>0 ? (totalSum/gTgt)*100 : 0;
                    const ok  = totalSum >= gTgt;
                    const isTp = totalSum>0 && totalSum===top;
                    return `<tr class="border-b hover:bg-gray-50 ${isTp?'bg-yellow-50':''}" data-employee-id="${emp.id}">
                        <th scope="row" class="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">${escHtml(emp.firstName)} ${escHtml(emp.lastName)}</th>
                        <td class="px-2 py-3 text-center">${sec?escHtml(sec.name):'-'}</td>
                        <td class="px-2 py-3 text-center font-bold text-blue-600 bg-blue-50">${totalSum}</td>
                        <td class="px-2 py-3 text-center">
                            <span class="px-2 py-1 text-xs font-semibold rounded-full ${ok?'bg-green-100 text-green-800':'bg-gray-100 text-gray-800'}">
                                ${ok?'<i data-lucide="circle-check" class="text-green-500 inline-block align-text-bottom" style="width:14px;height:14px;" aria-hidden="true"></i>':''} ${pct.toFixed(0)}%
                            </span>
                        </td>
                        ${mc.map(c=>`<td class="px-2 py-3 text-center ${c===0?'text-gray-400':'font-medium'}">${c}</td>`).join('')}
                        <td class="px-4 py-3 text-center no-print">
                            <button class="text-blue-600 hover:text-blue-800 inline-edit-btn" aria-label="แก้ไข ${escHtml(emp.firstName)}"><i data-lucide="pencil" aria-hidden="true"></i></button>
                            <button class="text-red-600 hover:text-red-800 ml-2 inline-delete-btn" aria-label="ลบ ${escHtml(emp.firstName)}"><i data-lucide="trash-2" aria-hidden="true"></i></button>
                        </td>
                    </tr>`;
                }).join('');

                tfoot.innerHTML = `<tr>
                    <td class="px-4 py-3 font-bold" colspan="2">รวมทั้งสิ้น</td>
                    <td class="px-2 py-3 text-center text-blue-700 bg-blue-100">${grand}</td>
                    <td class="px-2 py-3"></td>
                    ${mTotals.map(t=>`<td class="px-2 py-3 text-center">${t}</td>`).join('')}
                    <td class="px-4 py-3 no-print"></td>
                </tr>`;

                if (window.lucide) lucide.createIcons();
            }

            function renderTopPerformers(scores) {
                const { topPerformersSection } = _dom;
                topPerformersSection.innerHTML = '';
                if (!scores.length) return;
                const uniq = [...new Set(scores.map(e=>e.totalSum))].sort((a,b)=>b-a).filter(s=>s>0).slice(0,3);
                if (!uniq.length) return;
                const medals = [{icon:'trophy',color:'text-yellow-400'},{icon:'medal',color:'text-gray-400'},{icon:'award',color:'text-yellow-600'}];
                topPerformersSection.innerHTML = `
                    <h3 class="text-lg font-bold text-gray-700 mb-4 flex items-center"><i data-lucide="crown" class="mr-3 text-yellow-500" aria-hidden="true"></i>ผู้มีผลงานสูงสุด</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        ${uniq.map((score,idx) => {
                            const winners = scores.filter(e=>e.totalSum===score);
                            const m = medals[idx];
                            return `<div class="bg-gradient-to-br from-gray-50 to-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                <div class="flex items-center justify-between">
                                    <p class="font-bold text-gray-600">อันดับที่ ${idx+1}</p>
                                    <i data-lucide="${m.icon}" class="${m.color}" style="width:1.5rem;height:1.5rem;" aria-hidden="true"></i>
                                </div>
                                <p class="text-2xl font-bold text-gray-800 my-2">${score} <span class="text-sm font-normal">เรื่อง</span></p>
                                <div class="text-sm text-gray-600 space-y-1">
                                    ${winners.map(w=>`<div><i data-lucide="user-check" class="text-green-500 mr-2 inline-block" style="width:1rem;height:1rem;" aria-hidden="true"></i>${escHtml(w.emp.firstName)}</div>`).join('')}
                                </div>
                            </div>`;
                        }).join('')}
                    </div>`;
                if (window.lucide) lucide.createIcons();
            }

            function renderDashboardChart() {
                if (typeof Chart === 'undefined') { DEBUG_MODULE.log('info', 'RENDER', 'Chart.js unavailable — dashboard chart skipped'); return; }
                const { chartCanvas } = _dom;
                const filterYear = STATE_STORE.get('filterYear');
                const activities = STATE_STORE.get('activities');
                const mt = Array(12).fill(0);
                activities.filter(a=>a.year===filterYear).forEach(a=>{ if(a.month>=1&&a.month<=12) mt[a.month-1]+=a.count; });
                const chartData = {
                    labels: APP_CONFIG.monthNames,
                    datasets: [{ label:`ยอดรวม Kaizen ปี ${filterYear}`, data:mt,
                        backgroundColor:'rgba(59,130,246,0.5)', borderColor:'rgba(59,130,246,1)',
                        borderWidth:2, borderRadius:5, hoverBackgroundColor:'rgba(59,130,246,0.8)' }]
                };
                if (_chartInstance) { _chartInstance.data=chartData; _chartInstance.update(); }
                else {
                    _chartInstance = new Chart(chartCanvas.getContext('2d'), {
                        type:'bar', data:chartData,
                        options:{ responsive:true, maintainAspectRatio:false,
                            plugins:{legend:{display:false}},
                            scales:{ y:{beginAtZero:true,grid:{color:'#e5e7eb'}}, x:{grid:{display:false}} } }
                    });
                }
            }

            function showNotification(message, type) {
                type = type || 'info';
                const icons  = {success:'circle-check',error:'circle-x',info:'info'};
                const colors = {success:'bg-green-500',error:'bg-red-500',info:'bg-blue-500'};
                const n = document.createElement('div');
                n.className = `flex items-center p-4 rounded-lg shadow-lg text-white ${colors[type]} transform translate-x-full opacity-0 transition-all duration-500`;
                n.setAttribute('role','status');
                n.innerHTML = `<i data-lucide="${icons[type]}" class="mr-3" style="width:1.25rem;height:1.25rem;" aria-hidden="true"></i><span>${escHtml(message)}</span>`;
                _dom.notificationContainer.appendChild(n);
                if (window.lucide) lucide.createIcons();
                setTimeout(()=>n.classList.remove('translate-x-full','opacity-0'),10);
                setTimeout(()=>{ n.classList.add('translate-x-full','opacity-0'); n.addEventListener('transitionend',()=>n.remove(),{once:true}); },4000);
            }

            function showModal(opts, trigger) {
                const { title, body, actions } = opts;
                const maxWidth = opts.maxWidth || 'max-w-md';
                trigger = trigger || null;
                const id = `modal-${Date.now()}`;
                const tid = `${id}-title`;
                const _tmp = document.createElement('div');
                _tmp.innerHTML = `
                    <div id="${id}" class="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50 p-4 transition-opacity duration-300 opacity-0"
                         role="dialog" aria-modal="true" aria-labelledby="${tid}">
                        <div class="bg-white rounded-2xl shadow-xl w-full ${maxWidth} transform scale-95 transition-transform duration-300">
                            <div class="flex justify-between items-center p-5 border-b border-gray-200">
                                <h3 id="${tid}" class="text-xl font-bold text-gray-800">${title}</h3>
                                <button class="text-gray-400 hover:text-gray-600 modal-close-btn text-2xl leading-none" aria-label="ปิด">&times;</button>
                            </div>
                            <div class="p-6">${body}</div>
                            <div class="flex justify-end gap-3 p-5 bg-gray-50 rounded-b-2xl">
                                ${actions.map(a=>`<button class="${a.classes} font-bold py-2 px-5 rounded-lg transition-transform transform hover:scale-105" data-action="${escHtml(a.id)}">${a.icon?`<i data-lucide="${escHtml(a.icon)}" class="mr-1.5 inline-block" style="width:1rem;height:1rem;vertical-align:-2px;" aria-hidden="true"></i>`:''}${escHtml(a.text)}</button>`).join('')}
                            </div>
                        </div>
                    </div>`;
                _dom.modalContainer.appendChild(_tmp.firstElementChild);
                const el = document.getElementById(id);
                if (window.lucide) lucide.createIcons();
                setTimeout(()=>{ el.classList.remove('opacity-0'); el.querySelector('.transform').classList.remove('scale-95'); },10);
                setTimeout(()=>{ const f=el.querySelector('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'); if(f) f.focus(); },50);
                const trap = (e) => {
                    if (e.key==='Escape') { closeModal(trigger); return; }
                    if (e.key!=='Tab') return;
                    const fs = Array.from(el.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
                    if (!fs.length) { e.preventDefault(); return; }
                    if (e.shiftKey) { if(document.activeElement===fs[0]){e.preventDefault();fs[fs.length-1].focus();} }
                    else            { if(document.activeElement===fs[fs.length-1]){e.preventDefault();fs[0].focus();} }
                };
                el.addEventListener('keydown', trap);
                el._trap = trap; el._trigger = trigger;
                return el;
            }

            function closeModal(trigger) {
                const el = _dom.modalContainer.lastElementChild;
                if (!el) return;
                const t = trigger || el._trigger || null;
                if (el._trap) el.removeEventListener('keydown', el._trap);
                if (el._onClose) { el._onClose(); el._onClose = null; }
                el.classList.add('opacity-0');
                el.querySelector('.transform').classList.add('scale-95');
                el.addEventListener('transitionend', ()=>{ el.remove(); if(t&&t.focus) t.focus(); }, {once:true});
            }

            // ── Shared per-employee stats (email / report / banner) ────────
            function buildStats(year, month) {
                const sections   = STATE_STORE.get('sections');
                const employees  = STATE_STORE.get('employees');
                const activities = STATE_STORE.get('activities');
                return employees.map(emp => {
                    const acts = activities.filter(a => a.employeeId===emp.id && a.year===year);
                    const mCnt = acts.filter(a => a.month===month).reduce((s,a)=>s+a.count,0);
                    const ytd  = acts.reduce((s,a)=>s+a.count,0);
                    return { emp, mCnt, ytd, sec: sections.find(s => s.id===emp.sectionId) };
                });
            }

            // ── Email Summary Generator ────────────────────────────────────
            function generateEmailSummary(year, month) {
                const sections  = STATE_STORE.get('sections');
                const employees = STATE_STORE.get('employees');
                const mName = APP_CONFIG.fullMonthNames[month - 1];
                const line  = s => s + '\n';
                const sep   = () => '─'.repeat(40) + '\n';

                const stats = buildStats(year, month);

                const gTgt       = STATE_STORE.get('globalTarget') || 12;
                const totalMonth = stats.reduce((s,e)=>s+e.mCnt,0);
                const submitted  = stats.filter(e=>e.mCnt>0).length;
                const onTarget   = stats.filter(e=>e.ytd>=gTgt).length;

                let body = '';
                body += line(`เรื่อง: สรุปผลกิจกรรม Kaizen เดือน${mName} ปี ${year}`);
                body += line('');
                body += line('เรียน ทุกท่าน');
                body += line('');
                body += line(`ขอสรุปผลกิจกรรม Kaizen ประจำเดือน${mName} ปี ${year} ดังนี้`);
                body += line('');
                body += sep();
                body += line('ภาพรวมประจำเดือน');
                body += sep();
                body += line(`ยอดรวมทั้งหมด         : ${totalMonth} เรื่อง`);
                body += line(`พนักงานที่ส่งกิจกรรม  : ${submitted} / ${employees.length} คน`);
                body += line(`พนักงานถึงเป้า (รายปี): ${onTarget} / ${employees.length} คน`);
                body += line('');

                sections.forEach(sec => {
                    const secStats = stats.filter(e => e.emp.sectionId===sec.id);
                    const secTotal = secStats.reduce((s,e)=>s+e.mCnt,0);
                    body += sep();
                    body += line(`แผนก ${sec.name}  —  เดือนนี้รวม ${secTotal} เรื่อง`);
                    body += sep();
                    body += line(`${'ชื่อ'.padEnd(30)} ${'เดือนนี้'.padStart(6)}  ${'รวมปีนี้'.padStart(6)}  ${'เป้าหมาย'.padStart(6)}  %`);
                    body += line('·'.repeat(60));
                    [...secStats].sort((a,b)=>b.mCnt-a.mCnt).forEach(e => {
                        const name = `${e.emp.firstName} ${e.emp.lastName}`.slice(0,28).padEnd(30);
                        const pct  = gTgt>0 ? Math.round((e.ytd/gTgt)*100) : 0;
                        const bar  = e.ytd>=gTgt ? '✓' : `${pct}%`;
                        body += line(`${name} ${String(e.mCnt).padStart(6)}  ${String(e.ytd).padStart(6)}  ${String(gTgt).padStart(6)}  ${bar}`);
                    });
                    body += line('');
                });

                const topMonth = [...stats].sort((a,b)=>b.mCnt-a.mCnt).filter(e=>e.mCnt>0);
                if (topMonth.length) {
                    body += sep();
                    body += line(`ผู้มีผลงานสูงสุด เดือน${mName}`);
                    body += sep();
                    const medals = ['🥇','🥈','🥉'];
                    let rank=0, prev=-1;
                    topMonth.forEach(e => {
                        if (e.mCnt!==prev) { rank++; prev=e.mCnt; }
                        if (rank<=3) body += line(`${medals[rank-1]} ${e.emp.firstName} ${e.emp.lastName}: ${e.mCnt} เรื่อง`);
                    });
                    body += line('');
                }

                body += line('─'.repeat(40));
                body += line('จัดทำโดย: ระบบ Kaizen Activity Tracker');
                return body;
            }

            // ── HTML Email Generator ───────────────────────────────────────
            function generateEmailHtml(year, month) {
                const sections  = STATE_STORE.get('sections');
                const employees = STATE_STORE.get('employees');
                const mName = APP_CONFIG.fullMonthNames[month - 1];
                const esc   = s => escHtml(String(s ?? ''));

                const stats = buildStats(year, month);

                const gTgt       = STATE_STORE.get('globalTarget') || 12;
                const totalMonth = stats.reduce((s,e)=>s+e.mCnt,0);
                const submitted  = stats.filter(e=>e.mCnt>0).length;
                const onTarget   = stats.filter(e=>e.ytd>=gTgt).length;

                const topMonth = [...stats].sort((a,b)=>b.mCnt-a.mCnt).filter(e=>e.mCnt>0);
                const medals   = ['🥇','🥈','🥉'];
                let topRows='', rank=0, prev=-1;
                topMonth.forEach(e => {
                    if (e.mCnt!==prev){rank++;prev=e.mCnt;}
                    if (rank<=3) topRows+=`<tr style="border-bottom:1px solid #fef3c7;">
                        <td style="padding:12px 16px;font-size:22px;width:40px;">${medals[rank-1]}</td>
                        <td style="padding:12px 8px;font-size:15px;font-weight:600;color:#1f2937;">${esc(e.emp.firstName)} ${esc(e.emp.lastName)}</td>
                        <td style="padding:12px 16px;text-align:right;font-size:16px;font-weight:bold;color:#2563eb;">${e.mCnt} <span style="font-weight:400;font-size:13px;color:#6b7280;">เรื่อง</span></td>
                    </tr>`;
                });

                let sectionsHtml = '';
                sections.forEach(sec => {
                    const secStats = stats.filter(e=>e.emp.sectionId===sec.id);
                    const secTotal = secStats.reduce((s,e)=>s+e.mCnt,0);
                    const rows = [...secStats].sort((a,b)=>b.ytd-a.ytd||b.mCnt-a.mCnt).map((e, idx) => {
                        const pct   = gTgt>0 ? Math.min(100,Math.round((e.ytd/gTgt)*100)) : 0;
                        const ok    = e.ytd>=gTgt;
                        const clr   = ok?'#22c55e':pct>=50?'#f59e0b':'#3b82f6';
                        const fillW = Math.round(pct*0.6);
                        const rowBg = e.mCnt===0?'#f9fafb':ok?'#f0fdf4':'#ffffff';
                        return `<tr style="background:${rowBg};border-bottom:1px solid #f3f4f6;">
                            <td style="padding:9px 12px;font-size:13px;color:${e.mCnt===0?'#9ca3af':'#111827'};font-weight:${e.mCnt>0?600:400};">${esc(e.emp.firstName)} ${esc(e.emp.lastName)}</td>
                            <td style="padding:9px 8px;text-align:center;font-size:15px;font-weight:bold;color:#2563eb;">${e.mCnt}</td>
                            <td style="padding:9px 8px;text-align:center;font-size:13px;color:#374151;">${e.ytd}</td>
                            <td style="padding:9px 8px;text-align:center;font-size:13px;color:#6b7280;">${gTgt}</td>
                            <td style="padding:9px 12px;white-space:nowrap;">
                                <table cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;border-radius:4px;overflow:hidden;background:#e5e7eb;width:60px;">
                                    <tr><td style="width:${fillW}px;background:${clr};height:8px;"></td><td style="width:${60-fillW}px;height:8px;"></td></tr>
                                </table>
                                <span style="font-size:12px;color:${ok?'#16a34a':'#4b5563'};margin-left:6px;">${ok?'✓ ถึงเป้า':pct+'%'}</span>
                            </td>
                        </tr>`;
                    }).join('');
                    sectionsHtml += `
                    <tr><td height="16" style="line-height:16px;">&nbsp;</td></tr>
                    <tr>
                      <td style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr><td style="background:#7c3aed;padding:12px 16px;">
                            <span style="color:white;font-size:15px;font-weight:bold;">🏭 แผนก ${esc(sec.name)}</span>
                            <span style="color:rgba(255,255,255,0.8);font-size:13px;float:right;">รวมเดือนนี้: ${secTotal} เรื่อง</span>
                          </td></tr>
                          <tr><td>
                            <table width="100%" cellpadding="0" cellspacing="0">
                              <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb;">
                                <th style="padding:9px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;">ชื่อ-สกุล</th>
                                <th style="padding:9px 8px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;">เดือนนี้</th>
                                <th style="padding:9px 8px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;">รวมปี</th>
                                <th style="padding:9px 8px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;">เป้าหมาย</th>
                                <th style="padding:9px 12px;font-size:11px;color:#6b7280;font-weight:600;">ความคืบหน้า</th>
                              </tr>
                              ${rows}
                            </table>
                          </td></tr>
                        </table>
                      </td>
                    </tr>`;
                });

                return `<!DOCTYPE html><html lang="th">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>สรุป Kaizen ${esc(mName)} ${year}<\/title><\/head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;">
  <tr><td align="center" style="padding:24px 16px;">
    <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

      <tr><td style="background:#1d4ed8;background:linear-gradient(135deg,#1e3a8a,#2563eb);border-radius:14px;padding:28px 32px;text-align:center;">
        <p style="margin:0;font-size:32px;line-height:1;">📊</p>
        <h1 style="margin:10px 0 6px;color:#ffffff;font-size:22px;font-weight:bold;">สรุปผลกิจกรรม Kaizen</h1>
        <p style="margin:0;color:rgba(255,255,255,0.85);font-size:15px;">เดือน${esc(mName)} ปี ${year}</p>
      </td></tr>

      <tr><td height="16" style="line-height:16px;">&nbsp;</td></tr>

      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background:#fff;border-radius:12px;padding:20px 12px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
            <p style="margin:0;font-size:34px;font-weight:bold;color:#2563eb;line-height:1;">${totalMonth}</p>
            <p style="margin:6px 0 0;font-size:12px;color:#6b7280;">ยอดรวมทั้งหมด</p>
            <p style="margin:2px 0 0;font-size:11px;color:#9ca3af;">เรื่อง</p>
          </td>
          <td width="10" style="background:#f0f2f5;"></td>
          <td style="background:#fff;border-radius:12px;padding:20px 12px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
            <p style="margin:0;font-size:34px;font-weight:bold;color:#7c3aed;line-height:1;">${submitted}</p>
            <p style="margin:6px 0 0;font-size:12px;color:#6b7280;">พนักงานที่ส่งกิจกรรม</p>
            <p style="margin:2px 0 0;font-size:11px;color:#9ca3af;">จาก ${employees.length} คน</p>
          </td>
          <td width="10" style="background:#f0f2f5;"></td>
          <td style="background:#fff;border-radius:12px;padding:20px 12px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
            <p style="margin:0;font-size:34px;font-weight:bold;color:#16a34a;line-height:1;">${onTarget}</p>
            <p style="margin:6px 0 0;font-size:12px;color:#6b7280;">พนักงานถึงเป้า</p>
            <p style="margin:2px 0 0;font-size:11px;color:#9ca3af;">จาก ${employees.length} คน</p>
          </td>
        </tr></table>
      </td></tr>

      ${topRows ? `
      <tr><td height="16" style="line-height:16px;">&nbsp;</td></tr>
      <tr><td style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="background:#d97706;background:linear-gradient(135deg,#d97706,#f59e0b);padding:12px 16px;">
            <span style="color:#fff;font-size:15px;font-weight:bold;">👑 ผู้มีผลงานสูงสุด เดือน${esc(mName)}</span>
          </td></tr>
          <tr><td><table width="100%" cellpadding="0" cellspacing="0">${topRows}</table></td></tr>
        </table>
      </td></tr>` : ''}

      ${sectionsHtml}

      <tr><td height="20" style="line-height:20px;">&nbsp;</td></tr>
      <tr><td style="text-align:center;padding:12px;font-size:12px;color:#9ca3af;">
        จัดทำโดย ระบบ Kaizen Activity Tracker &bull; ${esc(mName)} ${year}
      </td></tr>

    </table>
  </td></tr>
</table>
<\/body><\/html>`;
            }


            // ── Podium SVG — YTD ranking, shared by report & banner ────────
            function makePodiumSvg(stats) {
                const sections = STATE_STORE.get('sections');
                const esc = s => escHtml(String(s ?? ''));
                const topYtd    = [...stats].sort((a,b)=>b.ytd-a.ytd).filter(e=>e.ytd>0);
                if (topYtd.length === 0) return '';
                const topScores = [...new Set(topYtd.map(e=>e.ytd))].slice(0,3);
                const podiumData = topScores.map((score, idx) => {
                    const winners = stats.filter(e=>e.ytd===score);
                    return { rank: idx+1, score, ytd: score, winners };
                });
                const W=720, H=328, FL=318;
                const gName = d => !d ? '' : d.winners.length===1
                    ? `${esc(d.winners[0].emp.firstName)} ${esc(d.winners[0].emp.lastName)}`
                    : d.winners.map(w=>esc(w.emp.firstName)).join(', ');
                const gSec = d => !d ? '' : d.winners.length===1
                    ? esc(sections.find(s=>s.id===d.winners[0].emp.sectionId)?.name||'')
                    : 'หลายแผนก';
                // pods: [left=2nd, center=1st, right=3rd]
                const pods = [
                    { cx:175, pT:248, pW:148, pH:70,  rank:2, d:podiumData[1]||null },
                    { cx:360, pT:196, pW:162, pH:122, rank:1, d:podiumData[0]||null },
                    { cx:545, pT:265, pW:148, pH:53,  rank:3, d:podiumData[2]||null }
                ];
                const pC={
                    1:{f:'#fcd34d',d:'#f59e0b',t:'#fefce8',lbl:'🏆 อันดับ 1'},
                    2:{f:'#cbd5e1',d:'#94a3b8',t:'#f8fafc',lbl:'🥈 อันดับ 2'},
                    3:{f:'#fdba74',d:'#ea580c',t:'#fff7ed',lbl:'🥉 อันดับ 3'}
                };

                // Chibi character — bigger head, big eyes, spiky hair
                const per = (cx, sY, rank) => {
                    const hY = sY - 88;
                    const skin = '#FFD5A8';
                    const hair = '#3b2415';

                    let aura = '';
                    if (rank === 1) {
                        aura =
                            `<circle cx="${cx}" cy="${sY-44}" r="58" fill="rgba(251,191,36,0.08)" stroke="rgba(251,191,36,0.3)" stroke-width="2"/>` +
                            `<circle cx="${cx}" cy="${sY-44}" r="46" fill="rgba(251,191,36,0.05)" stroke="rgba(253,224,71,0.18)" stroke-width="1.5"/>`;
                    }

                    // Open hand, palm + 4 fanned fingers + thumb — no held props, just a raised bare hand.
                    // dirX = -1 for the left hand, 1 for the right hand (always attached consistently
                    // per side across all three ranks), used to fan the fingers and to point the thumb
                    // inward toward the body rather than outward.
                    const hand = (hx, hy, dirX) => {
                        dirX = dirX || 1;
                        const palm = `<ellipse cx="${hx}" cy="${hy}" rx="7.5" ry="8.5" fill="${skin}" stroke="#e8a070" stroke-width="1.2"/>`;

                        const fingerBaseX = i => hx + dirX*2.5 + (i-1.5)*4.6;
                        const fingerBaseY = i => hy - 6 - Math.abs(i-1.5)*0.8;
                        const fingerAngle = i => dirX*12 + (i-1.5)*15;
                        const fingerLen   = i => 10.5 - Math.abs(i-1.5)*1.3;
                        let fingers = '';
                        for (let i=0; i<4; i++) {
                            const len = fingerLen(i);
                            fingers += `<g transform="translate(${fingerBaseX(i)},${fingerBaseY(i)}) rotate(${fingerAngle(i)})">` +
                                `<rect x="-1.7" y="${-len}" width="3.4" height="${len}" rx="1.7" fill="${skin}" stroke="#e8a070" stroke-width="0.8"/>` +
                                `</g>`;
                        }

                        const thumbAngle = -dirX*112;
                        const thumbX = hx - dirX*3.5, thumbY = hy + 1.5;
                        const thumb = `<g transform="translate(${thumbX},${thumbY}) rotate(${thumbAngle})">` +
                            `<rect x="-2" y="-7.5" width="4" height="7.5" rx="2" fill="${skin}" stroke="#e8a070" stroke-width="0.8"/>` +
                            `</g>`;

                        return palm + fingers + thumb;
                    };

                    let arms = '';
                    if(rank===1){
                        arms = `<line x1="${cx-18}" y1="${sY-63}" x2="${cx-44}" y2="${sY-104}" stroke="${skin}" stroke-width="12" stroke-linecap="round"/>` +
                               `<line x1="${cx+18}" y1="${sY-63}" x2="${cx+50}" y2="${sY-108}" stroke="${skin}" stroke-width="12" stroke-linecap="round"/>` +
                               hand(cx-44, sY-104, -1) + hand(cx+50, sY-108, 1);
                    } else if(rank===2){
                        arms = `<line x1="${cx-18}" y1="${sY-63}" x2="${cx-46}" y2="${sY-104}" stroke="${skin}" stroke-width="12" stroke-linecap="round"/>` +
                               `<line x1="${cx+18}" y1="${sY-63}" x2="${cx+44}" y2="${sY-50}" stroke="${skin}" stroke-width="12" stroke-linecap="round"/>` +
                               hand(cx-46, sY-104, -1) + hand(cx+44, sY-50, 1);
                    } else {
                        arms = `<line x1="${cx-18}" y1="${sY-63}" x2="${cx-45}" y2="${sY-98}" stroke="${skin}" stroke-width="12" stroke-linecap="round"/>` +
                               `<line x1="${cx+18}" y1="${sY-63}" x2="${cx+45}" y2="${sY-98}" stroke="${skin}" stroke-width="12" stroke-linecap="round"/>` +
                               hand(cx-45, sY-98, -1) + hand(cx+45, sY-98, 1);
                    }

                    const body =
                        // main torso
                        `<rect x="${cx-19}" y="${sY-70}" width="38" height="44" rx="12" fill="#7dd3fc"/>` +
                        // collar/yoke with a V-notch, like a real zip-front jumpsuit
                        `<path d="M ${cx-19},${sY-58} L ${cx-19},${sY-66} Q ${cx-19},${sY-70} ${cx-15},${sY-70} L ${cx+15},${sY-70} Q ${cx+19},${sY-70} ${cx+19},${sY-66} L ${cx+19},${sY-58} Q ${cx},${sY-52} ${cx-19},${sY-58} Z" fill="#38bdf8"/>` +
                        `<path d="M ${cx-6},${sY-70} L ${cx},${sY-61} L ${cx+6},${sY-70}" fill="none" stroke="#0369a1" stroke-width="1.3"/>` +
                        // center zip
                        `<rect x="${cx-2.5}" y="${sY-61}" width="5" height="35" fill="#0ea5e9" opacity="0.5"/>` +
                        // reflective safety stripes (chest + waist)
                        `<rect x="${cx-19}" y="${sY-46}" width="38" height="4.5" fill="#f1f5f9" opacity="0.9"/>` +
                        `<rect x="${cx-19}" y="${sY-30}" width="38" height="3.5" fill="#f1f5f9" opacity="0.8"/>` +
                        // chest pocket with flap + button
                        `<rect x="${cx-16}" y="${sY-57}" width="11" height="9" rx="1.5" fill="#38bdf8" stroke="#0369a1" stroke-width="1"/>` +
                        `<line x1="${cx-16}" y1="${sY-54}" x2="${cx-5}" y2="${sY-54}" stroke="#0369a1" stroke-width="1"/>` +
                        `<circle cx="${cx-10.5}" cy="${sY-55.5}" r="0.9" fill="#0369a1"/>` +
                        `<circle cx="${cx}" cy="${sY-50}" r="6" fill="rgba(255,255,255,0.22)"/>` +
                        // legs with a small reflective ankle band
                        `<rect x="${cx-13}" y="${sY-28}" width="11" height="28" rx="5" fill="#0369a1"/>` +
                        `<rect x="${cx+2}" y="${sY-28}" width="11" height="28" rx="5" fill="#0369a1"/>` +
                        `<rect x="${cx-13}" y="${sY-11}" width="11" height="3" fill="#f1f5f9" opacity="0.85"/>` +
                        `<rect x="${cx+2}" y="${sY-11}" width="11" height="3" fill="#f1f5f9" opacity="0.85"/>` +
                        // safety shoes: dark shell + sole + steel-toe cap highlight
                        `<ellipse cx="${cx-8}" cy="${sY}" rx="12" ry="6" fill="#1e293b"/>` +
                        `<ellipse cx="${cx+8}" cy="${sY}" rx="12" ry="6" fill="#1e293b"/>` +
                        `<ellipse cx="${cx-11}" cy="${sY-2.5}" rx="5.5" ry="3.5" fill="#475569"/>` +
                        `<ellipse cx="${cx+11}" cy="${sY-2.5}" rx="5.5" ry="3.5" fill="#475569"/>` +
                        `<rect x="${cx-19}" y="${sY+2.5}" width="20" height="3.5" rx="1.5" fill="#0f172a"/>` +
                        `<rect x="${cx-1}" y="${sY+2.5}" width="20" height="3.5" rx="1.5" fill="#0f172a"/>`;

                    let medal = '';
                    if (rank === 2) {
                        medal =
                            `<rect x="${cx-3}" y="${sY-70}" width="6" height="20" rx="2" fill="#93c5fd" opacity="0.9"/>` +
                            `<circle cx="${cx}" cy="${sY-50}" r="12" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2"/>` +
                            `<circle cx="${cx}" cy="${sY-50}" r="9" fill="#e8ecf0"/>` +
                            `<text x="${cx}" y="${sY-46}" text-anchor="middle" fill="#374151" font-size="10" font-weight="900" font-family="Arial,sans-serif">2</text>`;
                    } else if (rank === 3) {
                        medal =
                            `<rect x="${cx-3}" y="${sY-70}" width="6" height="20" rx="2" fill="#fb923c" opacity="0.9"/>` +
                            `<circle cx="${cx}" cy="${sY-50}" r="12" fill="#d97706" stroke="#b45309" stroke-width="2"/>` +
                            `<circle cx="${cx}" cy="${sY-50}" r="9" fill="#fde68a"/>` +
                            `<text x="${cx}" y="${sY-46}" text-anchor="middle" fill="#7c2d12" font-size="10" font-weight="900" font-family="Arial,sans-serif">3</text>`;
                    }

                    const head = `<circle cx="${cx}" cy="${hY}" r="28" fill="${skin}" stroke="#e8a070" stroke-width="1.5"/>`;

                    // Hard hat — same style/color for every rank (real PPE, not a costume)
                    const hatBrimY = hY - 24;
                    const hardHat =
                        `<path d="M ${cx-26},${hatBrimY} Q ${cx-28},${hatBrimY-22} ${cx},${hatBrimY-26} Q ${cx+28},${hatBrimY-22} ${cx+26},${hatBrimY} Z" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>` +
                        `<rect x="${cx-31}" y="${hatBrimY-3}" width="62" height="7" rx="3.5" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1"/>` +
                        `<rect x="${cx-2.5}" y="${hatBrimY-24}" width="5" height="20" rx="2" fill="#e2e8f0"/>`;

                    // Gold star badge on the champion's hard hat (replaces the old crown — a crown doesn't sit on a hard hat)
                    let hatBadge = '';
                    if (rank === 1) {
                        hatBadge =
                            `<circle cx="${cx}" cy="${hatBrimY-14}" r="6" fill="#fbbf24" stroke="#d97706" stroke-width="1.3"/>` +
                            `<text x="${cx}" y="${hatBrimY-11.5}" text-anchor="middle" font-size="8" fill="#92400e">★</text>`;
                    }

                    let face = '';
                    if(rank===1){
                        face =
                            `<ellipse cx="${cx-11}" cy="${hY-5}" rx="9" ry="10" fill="white"/>` +
                            `<ellipse cx="${cx+11}" cy="${hY-5}" rx="9" ry="10" fill="white"/>` +
                            `<circle cx="${cx-11}" cy="${hY-8}" r="6" fill="#1c0800"/>` +
                            `<circle cx="${cx+11}" cy="${hY-8}" r="6" fill="#1c0800"/>` +
                            `<circle cx="${cx-7}" cy="${hY-12}" r="2.5" fill="white"/>` +
                            `<circle cx="${cx+15}" cy="${hY-12}" r="2.5" fill="white"/>` +
                            `<path d="M ${cx-20},${hY-5} Q ${cx-11},${hY+4} ${cx-2},${hY-5}" fill="${skin}"/>` +
                            `<path d="M ${cx+2},${hY-5} Q ${cx+11},${hY+4} ${cx+20},${hY-5}" fill="${skin}"/>` +
                            `<path d="M ${cx-20},${hY-5} Q ${cx-11},${hY+5} ${cx-2},${hY-5}" fill="none" stroke="#1c0800" stroke-width="2.5" stroke-linecap="round"/>` +
                            `<path d="M ${cx+2},${hY-5} Q ${cx+11},${hY+5} ${cx+20},${hY-5}" fill="none" stroke="#1c0800" stroke-width="2.5" stroke-linecap="round"/>` +
                            `<path d="M ${cx-20},${hY-18} Q ${cx-11},${hY-27} ${cx-2},${hY-18}" fill="none" stroke="${hair}" stroke-width="2.5" stroke-linecap="round"/>` +
                            `<path d="M ${cx+2},${hY-18} Q ${cx+11},${hY-27} ${cx+20},${hY-18}" fill="none" stroke="${hair}" stroke-width="2.5" stroke-linecap="round"/>` +
                            `<path d="M ${cx-13},${hY+10} Q ${cx},${hY+24} ${cx+13},${hY+10}" fill="#d97060" stroke="#b85030" stroke-width="1" stroke-linecap="round"/>` +
                            `<path d="M ${cx-13},${hY+10} Q ${cx},${hY+19} ${cx+13},${hY+10}" fill="#ffb090" stroke="none"/>` +
                            `<circle cx="${cx-21}" cy="${hY+9}" r="9" fill="#FF9DB3" opacity="0.52"/>` +
                            `<circle cx="${cx+21}" cy="${hY+9}" r="9" fill="#FF9DB3" opacity="0.52"/>`;
                    } else {
                        face =
                            `<ellipse cx="${cx-11}" cy="${hY-4}" rx="9" ry="10.5" fill="white"/>` +
                            `<ellipse cx="${cx+11}" cy="${hY-4}" rx="9" ry="10.5" fill="white"/>` +
                            `<circle cx="${cx-11}" cy="${hY-3}" r="6.5" fill="#1c0800"/>` +
                            `<circle cx="${cx+11}" cy="${hY-3}" r="6.5" fill="#1c0800"/>` +
                            `<circle cx="${cx-7}" cy="${hY-7}" r="2.8" fill="white"/>` +
                            `<circle cx="${cx+15}" cy="${hY-7}" r="2.8" fill="white"/>` +
                            `<circle cx="${cx-11}" cy="${hY+1}" r="1.2" fill="rgba(255,255,255,0.5)"/>` +
                            `<circle cx="${cx+11}" cy="${hY+1}" r="1.2" fill="rgba(255,255,255,0.5)"/>` +
                            `<path d="M ${cx-19},${hY-18} Q ${cx-11},${hY-25} ${cx-3},${hY-18}" fill="none" stroke="${hair}" stroke-width="2.5" stroke-linecap="round"/>` +
                            `<path d="M ${cx+3},${hY-18} Q ${cx+11},${hY-25} ${cx+19},${hY-18}" fill="none" stroke="${hair}" stroke-width="2.5" stroke-linecap="round"/>` +
                            `<path d="M ${cx-2},${hY+5} Q ${cx},${hY+8} ${cx+2},${hY+5}" fill="none" stroke="#c07840" stroke-width="1.5" stroke-linecap="round"/>` +
                            `<path d="M ${cx-11},${hY+13} Q ${cx},${hY+21} ${cx+11},${hY+13}" fill="none" stroke="#b06030" stroke-width="2.5" stroke-linecap="round"/>` +
                            `<circle cx="${cx-19}" cy="${hY+11}" r="7" fill="#FF9DB3" opacity="0.5"/>` +
                            `<circle cx="${cx+19}" cy="${hY+11}" r="7" fill="#FF9DB3" opacity="0.5"/>`;
                    }

                    let stars = '';
                    if (rank === 1) {
                        stars =
                            `<text x="${cx-46}" y="${hY-22}" text-anchor="middle" font-size="8" fill="#fbbf24">✦</text>` +
                            `<text x="${cx+50}" y="${hY-28}" text-anchor="middle" font-size="9" fill="#fcd34d">✦</text>`;
                    }

                    // Safety goggles worn over the eyes (not pushed up) — drawn after the face so the
                    // tinted lenses sit on top of the eyes, with a bridge and short temple arms
                    const gY = rank === 1 ? hY-5 : hY-4;
                    const goggles =
                        `<ellipse cx="${cx-11}" cy="${gY}" rx="12" ry="12.5" fill="rgba(125,211,252,0.4)" stroke="#334155" stroke-width="2"/>` +
                        `<ellipse cx="${cx+11}" cy="${gY}" rx="12" ry="12.5" fill="rgba(125,211,252,0.4)" stroke="#334155" stroke-width="2"/>` +
                        `<rect x="${cx-4}" y="${gY-3}" width="8" height="6" rx="2" fill="#334155"/>` +
                        `<line x1="${cx-23}" y1="${gY}" x2="${cx-28}" y2="${gY-3}" stroke="#334155" stroke-width="2" stroke-linecap="round"/>` +
                        `<line x1="${cx+23}" y1="${gY}" x2="${cx+28}" y2="${gY-3}" stroke="#334155" stroke-width="2" stroke-linecap="round"/>`;

                    return aura + arms + body + medal + head + face + goggles + hardHat + hatBadge + stars;
                };

                const pod = ({cx,pT,pW,pH,rank,d}) => {
                    const c=pC[rank], x=cx-pW/2, sw=8;
                    const lblY = FL - 13;
                    let scoreHtml = '';
                    if (d) {
                        if (pH >= 100) {
                            // center the score block within the available space between the podium
                            // top and the shared rank-label baseline (lblY), instead of hugging the
                            // top edge — otherwise a tall 1st-place block leaves a big dead gap above the label
                            const midY = (pT + lblY) / 2;
                            scoreHtml =
                                `<text x="${cx}" y="${midY-11}" text-anchor="middle" fill="white" font-size="24" font-weight="900" font-family="Arial,sans-serif">${d.ytd}</text>` +
                                `<text x="${cx}" y="${midY+3}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="9.5" font-family="Arial,sans-serif">เรื่อง YTD</text>` +
                                `<line x1="${x+20}" y1="${midY+10}" x2="${x+pW-20}" y2="${midY+10}" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>`;
                        } else {
                            // sY is anchored to pT (podium top), not lblY — the character's feet are
                            // drawn at cy=pT with ry=6, dipping into the box, so the score number must
                            // stay clear of pT+~20 or the character (composited on top) steps on it.
                            // Same "เรื่อง YTD" unit label as the 1st-place block, always shown; on the
                            // shortest pod (tight === true) there's little room between the feet and the
                            // rank label below, so the sub-label uses a smaller font/gap to still fit.
                            const sY   = Math.max(pT + 22, lblY - 32);
                            const tight = (lblY - sY) < 26;
                            const sFs   = pH >= 65 ? 21 : 18;
                            const subFs = tight ? 7.5 : 8.5;
                            const gap   = tight ? 9 : 12;
                            const subY  = sY + gap;
                            scoreHtml =
                                `<text x="${cx}" y="${sY}" text-anchor="middle" fill="white" font-size="${sFs}" font-weight="900" font-family="Arial,sans-serif">${d.ytd}</text>` +
                                `<text x="${cx}" y="${subY}" text-anchor="middle" fill="rgba(255,255,255,0.82)" font-size="${subFs}" font-family="Arial,sans-serif">เรื่อง YTD</text>`;
                        }
                    }
                    const lblHtml = `<text x="${cx}" y="${lblY}" text-anchor="middle" fill="rgba(255,255,255,0.95)" font-size="9.5" font-weight="700" letter-spacing="0.5" font-family="Arial,sans-serif">${c.lbl}</text>`;
                    return `<polygon points="${x+pW},${pT} ${x+pW+sw},${pT+sw} ${x+pW+sw},${FL+sw} ${x+pW},${FL}" fill="${c.d}" opacity="0.6"/>` +
                           `<polygon points="${x},${FL} ${x+pW},${FL} ${x+pW+sw},${FL+sw} ${x+sw},${FL+sw}" fill="${c.d}" opacity="0.45"/>` +
                           `<rect x="${x}" y="${pT}" width="${pW}" height="${pH}" rx="8" fill="${c.f}"/>` +
                           `<rect x="${x}" y="${pT}" width="${pW}" height="16" rx="8" fill="rgba(255,255,255,0.25)"/>` +
                           scoreHtml + lblHtml;
                };

                const npl = ({cx,pT,rank,d}) => {
                    if(!d) return '';
                    const ny = pT - (rank === 1 ? 165 : 185);
                    const isChamp = rank === 1;
                    return `<rect x="${cx-71}" y="${ny+3}" width="144" height="30" rx="8" fill="${isChamp ? 'rgba(253,224,71,0.25)' : 'rgba(180,160,220,0.18)'}"/>` +
                           `<rect x="${cx-72}" y="${ny}" width="144" height="30" rx="${isChamp ? 10 : 8}" fill="rgba(255,255,255,0.96)" stroke="${isChamp ? '#f59e0b' : 'none'}" stroke-width="${isChamp ? 1.5 : 0}"/>` +
                           `<text x="${cx}" y="${ny+13}" text-anchor="middle" fill="#374151" font-size="10" font-weight="700" font-family="Sarabun,Arial,sans-serif">${gName(d)}</text>` +
                           `<text x="${cx}" y="${ny+25}" text-anchor="middle" fill="${isChamp ? '#d97706' : '#7c3aed'}" font-size="8.5" font-family="Sarabun,Arial,sans-serif">${gSec(d)}</text>`;
                };

                const confC=['#fde68a','#93c5fd','#86efac'];
                const cDots=[[300,20,3],[420,16,3],[340,55,3]];
                const confSvg=cDots.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="${p[2]}" fill="${confC[i%confC.length]}" opacity="0.6"/>`).join('');

                const sparkleSvg='';

                const banner=podiumData[0]
                    ?`<rect x="252" y="9" width="216" height="24" rx="12" fill="rgba(253,211,36,0.25)" stroke="#d97706" stroke-width="1.5"/>` +
                      `<text x="360" y="25" text-anchor="middle" fill="#92400e" font-size="10" font-weight="700" letter-spacing="0.5" font-family="Arial,sans-serif">ผู้นำอันดับ 1 ประจำปี</text>`:'';

                const ord=[pods[0],pods[2],pods[1]];
                return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;border-radius:12px;">` +
                    `<defs>` +
                    `<linearGradient id="rpBg" x1="0" y1="0" x2="0" y2="1">` +
                    `<stop offset="0%" stop-color="#fdf4ff"/>` +
                    `<stop offset="50%" stop-color="#ede9fe"/>` +
                    `<stop offset="100%" stop-color="#dbeafe"/>` +
                    `</linearGradient>` +
                    `<radialGradient id="rpGl" cx="50%" cy="100%" r="65%">` +
                    `<stop offset="0%" stop-color="#c4b5fd" stop-opacity="0.3"/>` +
                    `<stop offset="100%" stop-color="transparent"/>` +
                    `</radialGradient>` +
                    `</defs>` +
                    `<rect width="${W}" height="${H}" fill="url(#rpBg)" rx="12"/>` +
                    `<rect width="${W}" height="${H}" fill="url(#rpGl)" rx="12"/>` +
                    sparkleSvg + confSvg + banner +
                    `<line x1="20" y1="${FL}" x2="${W-20}" y2="${FL}" stroke="rgba(167,139,250,0.25)" stroke-width="1.5"/>` +
                    ord.map(p=>pod(p)).join('') +
                    ord.map(p=>p.d?per(p.cx,p.pT,p.rank):'').join('') +
                    pods.map(p=>npl(p)).join('') +
                    `</svg>`;
            }

            // ── Monthly trend bar chart — shared by report & banner ─────────
            function makeMonthlyBarChartSvg(activities, year, month) {
                const yearActs = activities.filter(a => a.year === year);
                if (yearActs.length === 0) return '';
                const totals = Array(12).fill(0);
                yearActs.forEach(a => { if (a.month >= 1 && a.month <= 12) totals[a.month - 1] += a.count; });

                const W = 720, H = 160;
                const padL = 34, padR = 16, padT = 18, padB = 24;
                const chartW = W - padL - padR, chartH = H - padT - padB;
                const maxVal = Math.max(1, ...totals);
                const barGap = 8;
                const barW = (chartW - barGap * 11) / 12;

                const gridLines = [0, 0.5, 1].map(f => {
                    const y = padT + chartH * (1 - f);
                    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
                }).join('');

                const bars = totals.map((v, i) => {
                    const x = padL + i * (barW + barGap);
                    const h = maxVal > 0 ? Math.round((v / maxVal) * chartH) : 0;
                    const y = padT + chartH - h;
                    const isCurrent = (i + 1) === month;
                    const fill = isCurrent ? '#2563eb' : 'rgba(59,130,246,0.45)';
                    const valueLbl = v > 0 ? `<text x="${x + barW/2}" y="${y - 5}" text-anchor="middle" font-size="9" font-weight="700" fill="#475569" font-family="Arial,sans-serif">${v}</text>` : '';
                    return `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h,1)}" rx="3" fill="${fill}"/>${valueLbl}` +
                        `<text x="${x + barW/2}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#64748b" font-family="Arial,sans-serif">${escHtml(APP_CONFIG.monthNames[i])}</text>`;
                }).join('');

                return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">` +
                    `<rect width="${W}" height="${H}" fill="#ffffff" rx="8"/>` +
                    gridLines + bars +
                    `</svg>`;
            }

            // ── PDF Report Generator ───────────────────────────────────────
            function generateReportHtml(year, month, title, author) {
                title  = title  || 'รายงานสรุปกิจกรรม Kaizen';
                author = author || 'ระบบ Kaizen Activity Tracker';
                const sections   = STATE_STORE.get('sections');
                const employees  = STATE_STORE.get('employees');
                const activities = STATE_STORE.get('activities');
                const mName = APP_CONFIG.fullMonthNames[month - 1];
                const esc   = s => escHtml(String(s ?? ''));
                const today = new Date().toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' });

                const stats = buildStats(year, month);

                const totalMonth        = stats.reduce((s,e)=>s+e.mCnt, 0);
                const submitted         = stats.filter(e=>e.mCnt>0).length;
                const gTgt              = STATE_STORE.get('globalTarget') || 12;
                const onTarget          = stats.filter(e=>e.ytd>=gTgt).length;
                const totalAnnualYtd    = stats.reduce((s,e)=>s+e.ytd, 0);
                const totalAnnualTarget = employees.length * gTgt;
                const annualPct         = totalAnnualTarget>0 ? Math.round(totalAnnualYtd/totalAnnualTarget*100) : 0;
                const subPct            = employees.length>0 ? Math.round(submitted/employees.length*100) : 0;
                const tgtPct            = employees.length>0 ? Math.round(onTarget/employees.length*100) : 0;
                const monthlyChartSvg   = makeMonthlyBarChartSvg(activities, year, month);

                const podiumSvg = makePodiumSvg(stats);

                const bar = (ytd, target) => {
                    const pct   = target>0 ? Math.min(100,Math.round(ytd/target*100)) : 0;
                    const ok    = ytd>=target;
                    const color = ok?'#16a34a':pct>=50?'#f59e0b':'#3b82f6';
                    const label = ok ? `<span style="color:#16a34a;font-weight:700;">✓</span>` : `<span style="color:#64748b;">${pct}%</span>`;
                    return `<div style="display:flex;align-items:center;gap:4px;">
                        <div style="flex:1;background:#e2e8f0;border-radius:3px;height:7px;overflow:hidden;min-width:36px;">
                            <div style="width:${pct}%;background:${color};height:100%;border-radius:3px;"></div>
                        </div>
                        <span style="font-size:9px;min-width:22px;text-align:right;">${label}</span>
                    </div>`;
                };

                const secColors = [
                    'linear-gradient(135deg,#1e40af,#3b82f6)',
                    'linear-gradient(135deg,#6d28d9,#a855f7)'
                ];
                const sectionHtmls = sections.map((sec, idx) => {
                    const secColor = secColors[idx % secColors.length];
                    const secStats = stats.filter(e=>e.emp.sectionId===sec.id);
                    const secTotal = secStats.reduce((s,e)=>s+e.mCnt, 0);
                    const rows = [...secStats].sort((a,b)=>b.ytd-a.ytd||b.mCnt-a.mCnt).map((e, rowIdx) => {
                        const ok        = e.ytd>=gTgt;
                        const rowBg     = e.mCnt===0?'background:#fafafa;':ok?'background:#f0fdf4;':'';
                        const nClr      = e.mCnt===0?'color:#94a3b8;':'color:#111827;';
                        const remaining = Math.max(0, gTgt - e.ytd);
                        const remHtml   = remaining === 0
                            ? `<span style="color:#16a34a;font-weight:800;font-size:12px;">✓</span>`
                            : `<span style="color:${remaining<=3?'#d97706':'#ef4444'};font-weight:700;font-size:11px;">${remaining}</span>`;
                        return `<tr style="${rowBg}border-bottom:1px solid #f1f5f9;">
                            <td style="padding:2px 3px;text-align:center;font-size:9px;color:#94a3b8;font-weight:500;">${rowIdx+1}</td>
                            <td style="padding:2px 6px;font-size:11px;${nClr}font-weight:${e.mCnt>0?600:400};">${esc(e.emp.firstName)} ${esc(e.emp.lastName)}</td>
                            <td style="padding:2px 3px;text-align:center;font-size:${e.mCnt>0?'14':'11'}px;font-weight:${e.mCnt>0?700:400};color:${e.mCnt>0?'#2563eb':'#cbd5e1'};">${e.mCnt}</td>
                            <td style="padding:2px 3px;text-align:center;font-size:11px;color:#374151;">${e.ytd}</td>
                            <td style="padding:2px 3px;text-align:center;font-size:11px;color:#64748b;">${gTgt}</td>
                            <td style="padding:2px 6px;">${bar(e.ytd,gTgt)}</td>
                            <td style="padding:2px 3px;text-align:center;">${remHtml}</td>
                        </tr>`;
                    }).join('');
                    return `<div style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
                        <div style="background:${secColor};padding:6px 10px;display:flex;justify-content:space-between;align-items:center;">
                            <span style="color:white;font-size:13px;font-weight:700;">🏭 แผนก ${esc(sec.name)}</span>
                            <span style="background:rgba(255,255,255,0.22);color:white;font-size:11px;font-weight:600;padding:2px 10px;border-radius:20px;">${secTotal} เรื่อง</span>
                        </div>
                        <table style="width:100%;border-collapse:collapse;">
                            <thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                                <th style="padding:3px 3px;text-align:center;font-size:9px;color:#94a3b8;font-weight:600;min-width:16px;">#</th>
                                <th style="padding:3px 6px;text-align:left;font-size:9px;color:#64748b;font-weight:600;letter-spacing:.4px;text-transform:uppercase;">ชื่อ-สกุล</th>
                                <th style="padding:3px 3px;text-align:center;font-size:9px;color:#64748b;font-weight:600;">เดือนนี้</th>
                                <th style="padding:3px 3px;text-align:center;font-size:9px;color:#64748b;font-weight:600;">YTD</th>
                                <th style="padding:3px 3px;text-align:center;font-size:9px;color:#64748b;font-weight:600;">เป้า</th>
                                <th style="padding:3px 6px;font-size:9px;color:#64748b;font-weight:600;">ความคืบหน้า</th>
                                <th style="padding:3px 3px;text-align:center;font-size:9px;color:#64748b;font-weight:600;">ขาดอีก</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>`;
                }).join('');

                const seg0 = stats.filter(e => e.ytd === 0);
                const seg1 = stats.filter(e => e.ytd > 0 && (e.ytd / gTgt) < 0.5);
                const seg2 = stats.filter(e => (e.ytd / gTgt) >= 0.5 && e.ytd < gTgt);
                const seg3 = stats.filter(e => e.ytd >= gTgt);
                const segCard = (emoji, title2, msg, bColor, bg, members) => {
                    if (!members.length) return '';
                    const names = members.map(e => esc(e.emp.firstName)).join(', ');
                    return `<div style="border-radius:10px;border:1.5px solid ${bColor};background:${bg};padding:10px 12px;flex:1;min-width:130px;">
                        <div style="font-size:16px;margin-bottom:3px;">${emoji}</div>
                        <div style="font-size:10px;font-weight:700;color:${bColor};margin-bottom:2px;">${title2} <span style="font-weight:500;color:#64748b;font-size:9px;">${members.length} คน</span></div>
                        <div style="font-size:9.5px;color:#374151;margin-bottom:5px;line-height:1.6;">${names}</div>
                        <div style="font-size:9px;color:#64748b;font-style:italic;border-top:1px solid ${bColor}44;padding-top:4px;">${msg}</div>
                    </div>`;
                };
                const motivationHtml = (seg0.length + seg1.length + seg2.length + seg3.length) > 0 ? `
                <div style="margin-top:8px;display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                    <span style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.6px;white-space:nowrap;">💡 กำลังใจสู่เป้าหมาย</span>
                    <div style="flex:1;height:1px;background:#e2e8f0;"></div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:nowrap;">
                    ${segCard('🔴','ยังไม่เริ่มต้น',       'ก้าวแรกคือก้าวที่สำคัญที่สุด — เริ่มวันนี้ได้เลย!',        '#ef4444','#fef2f2', seg0)}
                    ${segCard('🟡','กำลังเริ่มต้น',         'ทุกเรื่องที่ส่งคือก้าวสู่เป้าหมาย — ไม่หยุดนะ! 👊',        '#d97706','#fffbeb', seg1)}
                    ${segCard('🟠','เกินครึ่งทางแล้ว!',     'อีกนิดเดียวก็ถึงแล้ว — Push ต่อเลย! 💪',                  '#ea580c','#fff7ed', seg2)}
                    ${segCard('✅','บรรลุเป้าหมาย!',         'ขอบคุณที่เป็นแรงบันดาลใจให้ทีม — ยอดเยี่ยม! 🏆',          '#16a34a','#f0fdf4', seg3)}
                </div>` : '';

                return `<!DOCTYPE html><html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>รายงาน Kaizen ${esc(mName)} ${year}<\/title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Sarabun',Arial,sans-serif;background:#f1f5f9;color:#1e293b;}
  .page{width:210mm;min-height:297mm;margin:0 auto;background:white;padding:7mm 10mm;box-shadow:0 4px 32px rgba(0,0,0,0.14);}
  @media print{
    body{background:white;}
    .page{margin:0;padding:5mm 8mm;box-shadow:none;width:100%;}
    @page{size:A4 portrait;margin:0;}
  }
</style>
<\/head>
<body>
<div class="page">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 55%,#2563eb 100%);border-radius:12px;padding:10px 18px;color:white;display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
    <div>
      <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;opacity:.65;margin-bottom:3px;">Kaizen Activity Report</div>
      <div style="font-size:19px;font-weight:800;line-height:1.2;">${esc(title)}</div>
      <div style="font-size:12px;opacity:.85;margin-top:3px;">ประจำเดือน${esc(mName)} ปี ${year}</div>
    </div>
    <div style="text-align:right;font-size:9px;opacity:.7;line-height:1.6;">
      <div>จัดทำโดย: ${esc(author)}</div>
      <div>วันที่จัดทำ: ${today}</div>
    </div>
  </div>

  <!-- KPI CARDS -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:7px;">
    <div style="background:white;border-radius:10px;padding:7px 6px;text-align:center;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="font-size:26px;font-weight:800;color:#2563eb;line-height:1;">${totalMonth}</div>
      <div style="font-size:9px;color:#64748b;margin-top:3px;font-weight:600;">ยอดรวมประจำเดือน</div>
      <div style="font-size:9px;color:#94a3b8;margin-top:2px;">เรื่อง</div>
    </div>
    <div style="background:white;border-radius:10px;padding:7px 6px;text-align:center;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="font-size:26px;font-weight:800;color:#7c3aed;line-height:1;">${submitted}<span style="font-size:14px;font-weight:600;color:#94a3b8;">/${employees.length}</span></div>
      <div style="font-size:9px;color:#64748b;margin-top:3px;font-weight:600;">ส่งกิจกรรม</div>
      <div style="font-size:9px;color:#94a3b8;margin-top:2px;">${subPct}% ของทั้งหมด</div>
    </div>
    <div style="background:white;border-radius:10px;padding:7px 6px;text-align:center;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="font-size:26px;font-weight:800;color:${onTarget>0?'#16a34a':'#d97706'};line-height:1;">${onTarget}<span style="font-size:14px;font-weight:600;color:#94a3b8;">/${employees.length}</span></div>
      <div style="font-size:9px;color:#64748b;margin-top:3px;font-weight:600;">ถึงเป้าหมายรายปี</div>
      <div style="font-size:9px;color:#94a3b8;margin-top:2px;">${tgtPct}% ของทั้งหมด</div>
    </div>
    <div style="background:white;border-radius:10px;padding:7px 6px;text-align:center;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="font-size:26px;font-weight:800;color:#0891b2;line-height:1;">${annualPct}%</div>
      <div style="font-size:9px;color:#64748b;margin-top:3px;font-weight:600;">ความคืบหน้ารายปี</div>
      <div style="font-size:9px;color:#94a3b8;margin-top:2px;">${totalAnnualYtd}/${totalAnnualTarget} เรื่อง</div>
    </div>
  </div>

  <!-- TOP PERFORMERS -->
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
    <span style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.6px;white-space:nowrap;">👑 ผู้มีผลงานสูงสุด — สะสมปี ${year} (YTD)</span>
    <div style="flex:1;height:1px;background:#e2e8f0;"></div>
  </div>
  <div style="margin-bottom:6px;">
    ${podiumSvg || '<div style="text-align:center;color:#94a3b8;padding:24px;font-size:12px;">ยังไม่มีข้อมูลสะสมในปีนี้</div>'}
  </div>

  <!-- MONTHLY TREND -->
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
    <span style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.6px;white-space:nowrap;">📈 แนวโน้มยอดรวมรายเดือน ปี ${year}</span>
    <div style="flex:1;height:1px;background:#e2e8f0;"></div>
  </div>
  <div style="margin-bottom:6px;border:1px solid #e2e8f0;border-radius:10px;padding:6px 8px;">
    ${monthlyChartSvg || '<div style="text-align:center;color:#94a3b8;padding:16px;font-size:12px;">ยังไม่มีข้อมูลในปีนี้</div>'}
  </div>

  <!-- SECTION TABLES -->
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
    <span style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.6px;white-space:nowrap;">📋 รายละเอียดรายบุคคล</span>
    <div style="flex:1;height:1px;background:#e2e8f0;"></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
    ${sectionHtmls}
  </div>

  <!-- MOTIVATION SEGMENT -->
  ${motivationHtml}

  <!-- FOOTER -->
  <div style="margin-top:6px;padding-top:4px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:9px;color:#94a3b8;">จัดทำโดย: ${esc(author)} — Confidential</span>
    <span style="font-size:9px;color:#94a3b8;">เดือน${esc(mName)} ${year} &nbsp;|&nbsp; พิมพ์เมื่อ ${today}</span>
  </div>

</div>
<\/body><\/html>`;
            }

            // ── Email Banner (900px horizontal) ────────────────────────────
            function generateEmailBannerContent(year, month, title, author) {
                title  = title  || 'รายงานสรุปกิจกรรม Kaizen';
                author = author || 'ระบบ Kaizen Activity Tracker';
                const sections   = STATE_STORE.get('sections');
                const employees  = STATE_STORE.get('employees');
                const activities = STATE_STORE.get('activities');
                const mName = APP_CONFIG.fullMonthNames[month - 1];
                const esc   = s => escHtml(String(s ?? ''));
                const today = new Date().toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' });
                const gTgt  = STATE_STORE.get('globalTarget') || 12;

                const stats = buildStats(year, month);

                const totalMonth        = stats.reduce((s,e)=>s+e.mCnt,0);
                const submitted         = stats.filter(e=>e.mCnt>0).length;
                const onTarget          = stats.filter(e=>e.ytd>=gTgt).length;
                const totalAnnualYtd    = stats.reduce((s,e)=>s+e.ytd,0);
                const totalAnnualTarget = employees.length * gTgt;
                const annualPct         = totalAnnualTarget>0 ? Math.round(totalAnnualYtd/totalAnnualTarget*100) : 0;
                const subPct            = employees.length>0 ? Math.round(submitted/employees.length*100) : 0;

                const podiumSvg       = makePodiumSvg(stats);
                const monthlyChartSvg = makeMonthlyBarChartSvg(activities, year, month);

                const seg0 = stats.filter(e => e.ytd === 0);
                const seg1 = stats.filter(e => e.ytd > 0 && (e.ytd / gTgt) < 0.5);
                const seg2 = stats.filter(e => (e.ytd / gTgt) >= 0.5 && e.ytd < gTgt);
                const seg3 = stats.filter(e => e.ytd >= gTgt);

                const secColors = ['linear-gradient(135deg,#1e40af,#3b82f6)','linear-gradient(135deg,#6d28d9,#a855f7)'];
                const sectionTablesHtml = sections.map((sec, si) => {
                    const secColor = secColors[si % secColors.length];
                    const secStats = stats.filter(e=>e.emp.sectionId===sec.id);
                    const secTotal = secStats.reduce((s,e)=>s+e.mCnt,0);
                    const rows = [...secStats].sort((a,b)=>b.ytd-a.ytd||b.mCnt-a.mCnt).map((e,ri) => {
                        const ok  = e.ytd >= gTgt;
                        const rem = Math.max(0, gTgt - e.ytd);
                        const bg  = e.mCnt===0 ? '#fafafa' : ok ? '#f0fdf4' : 'white';
                        const nc  = e.mCnt===0 ? '#64748b' : '#111827';
                        const rh  = rem===0
                            ? `<span style="color:#16a34a;font-weight:800;font-size:13px;">✓</span>`
                            : `<span style="color:${rem<=3?'#d97706':'#ef4444'};font-weight:700;font-size:12px;">${rem}</span>`;
                        return `<tr style="border-bottom:1px solid #e2e8f0;background:${bg};">
                            <td style="padding:3px 4px;font-size:10px;color:#64748b;font-weight:600;text-align:center;width:16px;">${ri+1}</td>
                            <td style="padding:3px 5px;font-size:12px;color:${nc};font-weight:${e.mCnt>0?600:400};">${esc(e.emp.firstName)} ${esc(e.emp.lastName)}</td>
                            <td style="padding:3px 4px;font-size:${e.mCnt>0?13:11}px;font-weight:${e.mCnt>0?700:400};color:${e.mCnt>0?'#2563eb':'#94a3b8'};text-align:center;">${e.mCnt}</td>
                            <td style="padding:3px 4px;font-size:12px;font-weight:700;color:#1e293b;text-align:center;">${e.ytd}</td>
                            <td style="padding:3px 4px;text-align:center;">${rh}</td>
                        </tr>`;
                    }).join('');
                    return `<div style="border-radius:10px;overflow:hidden;border:1.5px solid #e2e8f0;box-shadow:0 2px 6px rgba(0,0,0,0.07);">
                        <div style="background:${secColor};padding:6px 12px;display:flex;justify-content:space-between;align-items:center;">
                            <span style="color:white;font-size:13px;font-weight:700;">🏭 แผนก ${esc(sec.name)}</span>
                            <span style="background:rgba(255,255,255,0.28);color:white;font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;">${secTotal} เรื่อง</span>
                        </div>
                        <table style="width:100%;border-collapse:collapse;">
                            <thead><tr style="background:#f1f5f9;border-bottom:1.5px solid #cbd5e1;">
                                <th style="padding:4px 4px;font-size:10px;color:#475569;font-weight:700;text-align:center;">#</th>
                                <th style="padding:4px 5px;font-size:10px;color:#475569;font-weight:700;text-align:left;">ชื่อ-สกุล</th>
                                <th style="padding:4px 4px;font-size:10px;color:#475569;font-weight:700;text-align:center;">เดือนนี้</th>
                                <th style="padding:4px 4px;font-size:10px;color:#475569;font-weight:700;text-align:center;">YTD</th>
                                <th style="padding:4px 4px;font-size:10px;color:#475569;font-weight:700;text-align:center;">ขาดอีก</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>`;
                }).join('');

                const segCard = (emoji, title2, members, msg, bColor, bg) => {
                    if (!members.length) return '';
                    const names = members.map(e => esc(e.emp.firstName)).join(', ');
                    return `<div style="border-radius:10px;border:2px solid ${bColor};background:${bg};padding:10px 12px;">
                        <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;">
                            <span style="font-size:20px;line-height:1;">${emoji}</span>
                            <div>
                                <div style="font-size:12px;font-weight:800;color:${bColor};line-height:1.2;">${title2}</div>
                                <div style="font-size:10px;color:#475569;font-weight:600;">${members.length} คน</div>
                            </div>
                        </div>
                        <div style="font-size:10.5px;color:#1e293b;font-weight:500;line-height:1.7;margin-bottom:6px;">${names}</div>
                        <div style="font-size:10px;color:#475569;border-top:1.5px solid ${bColor}66;padding-top:5px;">${msg}</div>
                    </div>`;
                };

                const sectionLabel = (txt) =>
                    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
                        <span style="font-size:11px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:.6px;white-space:nowrap;">${txt}</span>
                        <div style="flex:1;height:1.5px;background:#cbd5e1;"></div>
                    </div>`;

                const topSection = `
  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 55%,#2563eb 100%);padding:13px 22px;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;opacity:.65;color:white;margin-bottom:2px;">Kaizen Activity Report</div>
      <div style="font-size:21px;font-weight:800;color:white;line-height:1.2;">${esc(title)}</div>
      <div style="font-size:12px;opacity:.85;color:white;margin-top:3px;">ประจำเดือน${esc(mName)} ปี ${year}</div>
    </div>
    <div style="text-align:right;font-size:9.5px;opacity:.75;color:white;line-height:1.8;"><div>จัดทำโดย: ${esc(author)}</div><div>วันที่จัดทำ: ${today}</div></div>
  </div>

  <!-- KPI ROW -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px 16px 6px;">
    <div style="background:#eff6ff;border-radius:10px;padding:9px 10px;text-align:center;border:1.5px solid #bfdbfe;">
      <div style="font-size:30px;font-weight:800;color:#2563eb;line-height:1;">${totalMonth}</div>
      <div style="font-size:11px;color:#374151;font-weight:700;margin-top:3px;">ยอดรวมประจำเดือน</div>
      <div style="font-size:10px;color:#64748b;margin-top:2px;">เรื่อง</div>
    </div>
    <div style="background:#f5f3ff;border-radius:10px;padding:9px 10px;text-align:center;border:1.5px solid #ddd6fe;">
      <div style="font-size:30px;font-weight:800;color:#7c3aed;line-height:1;">${submitted}<span style="font-size:14px;color:#64748b;">/${employees.length}</span></div>
      <div style="font-size:11px;color:#374151;font-weight:700;margin-top:3px;">ส่งกิจกรรม</div>
      <div style="font-size:10px;color:#64748b;margin-top:2px;">${subPct}% ของทั้งหมด</div>
    </div>
    <div style="background:${onTarget>0?'#f0fdf4':'#fffbeb'};border-radius:10px;padding:9px 10px;text-align:center;border:1.5px solid ${onTarget>0?'#bbf7d0':'#fde68a'};">
      <div style="font-size:30px;font-weight:800;color:${onTarget>0?'#16a34a':'#d97706'};line-height:1;">${onTarget}<span style="font-size:14px;color:#64748b;">/${employees.length}</span></div>
      <div style="font-size:11px;color:#374151;font-weight:700;margin-top:3px;">ถึงเป้าหมายรายปี</div>
      <div style="font-size:10px;color:#64748b;margin-top:2px;">${Math.round(onTarget/employees.length*100)}% ของทั้งหมด</div>
    </div>
    <div style="background:#ecfeff;border-radius:10px;padding:9px 10px;text-align:center;border:1.5px solid #a5f3fc;">
      <div style="font-size:30px;font-weight:800;color:#0891b2;line-height:1;">${annualPct}%</div>
      <div style="font-size:11px;color:#374151;font-weight:700;margin-top:3px;">ความคืบหน้ารายปี</div>
      <div style="font-size:10px;color:#64748b;margin-top:2px;">${totalAnnualYtd}/${totalAnnualTarget} เรื่อง</div>
    </div>
  </div>

  <!-- PODIUM — FULL WIDTH -->
  <div style="padding:8px 16px 14px;">
    ${sectionLabel('👑 ผู้มีผลงานสูงสุด — สะสมปี ' + year + ' (YTD)')}
    <div style="border-radius:12px;overflow:hidden;border:1px solid #e9d5ff;background:linear-gradient(160deg,#fdf4ff,#ede9fe,#dbeafe);">
      ${podiumSvg || '<div style="height:220px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;">ยังไม่มีข้อมูลสะสมในปีนี้</div>'}
    </div>
  </div>

  <!-- MONTHLY TREND -->
  <div style="padding:0 16px 14px;">
    ${sectionLabel('📈 แนวโน้มยอดรวมรายเดือน ปี ' + year)}
    <div style="border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;background:#ffffff;padding:8px 10px;">
      ${monthlyChartSvg || '<div style="height:120px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;">ยังไม่มีข้อมูลในปีนี้</div>'}
    </div>
  </div>`;

                const bottomSection = `
  <!-- TABLES — FULL WIDTH, 2 COLUMNS -->
  <div style="padding:8px 16px 4px;">
    ${sectionLabel('📋 รายละเอียดรายบุคคล')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      ${sectionTablesHtml}
    </div>
  </div>

  <!-- MOTIVATION WITH NAMES — 4 COLUMNS -->
  <div style="padding:8px 16px 10px;">
    ${sectionLabel('💡 กำลังใจสู่เป้าหมาย')}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
      ${segCard('🔴','ยังไม่เริ่มต้น',    seg0,'ก้าวแรกคือก้าวที่สำคัญที่สุด — เริ่มวันนี้ได้เลย!',  '#ef4444','#fef2f2')}
      ${segCard('🟡','กำลังเริ่มต้น',     seg1,'ทุกเรื่องที่ส่งคือก้าวสู่เป้าหมาย — ไม่หยุดนะ! 👊',  '#d97706','#fffbeb')}
      ${segCard('🟠','เกินครึ่งทางแล้ว!', seg2,'อีกนิดเดียวก็ถึงแล้ว — Push ต่อเลย! 💪',             '#ea580c','#fff7ed')}
      ${segCard('✅','บรรลุเป้าหมาย!',    seg3,'ขอบคุณที่เป็นแรงบันดาลใจให้ทีม — ยอดเยี่ยม! 🏆',    '#16a34a','#f0fdf4')}
    </div>
  </div>

  <!-- FOOTER -->
  <div style="padding:7px 16px 10px;border-top:1.5px solid #cbd5e1;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:10px;color:#64748b;font-weight:500;">จัดทำโดย: ${esc(author)} — Confidential</span>
    <span style="font-size:10px;color:#64748b;font-weight:500;">เดือน${esc(mName)} ${year} &nbsp;|&nbsp; ${today}</span>
  </div>`;

                return `<div style="width:900px;background:white;overflow:hidden;font-family:'Sarabun',Arial,sans-serif;color:#1e293b;">
${topSection}${bottomSection}
</div>`;
            }

            function generateEmailBannerHtml(year, month, title, author) {
                const mName = APP_CONFIG.fullMonthNames[month - 1];
                const content = generateEmailBannerContent(year, month, title, author);
                return `<!DOCTYPE html><html lang="th">
<head>
<meta charset="UTF-8">
<title>Email Banner - Kaizen ${escHtml(mName)} ${year}<\/title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0;}body{background:white;display:flex;justify-content:center;padding:0;font-family:'Sarabun',Arial,sans-serif;color:#1e293b;}</style>
<\/head>
<body>
${content}
<\/body><\/html>`;
            }

            return {
                setDom, renderAll, populateAllDropdowns, renderReportTable, renderTopPerformers,
                renderDashboardChart, showNotification, showModal, closeModal, buildStats,
                generateEmailSummary, generateEmailHtml, makePodiumSvg, makeMonthlyBarChartSvg, generateReportHtml,
                generateEmailBannerHtml, generateEmailBannerContent,
            };
        })();
