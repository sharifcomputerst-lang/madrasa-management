/* ================= helpers.js : utilities, storage bridge, grading ================= */

/* ---------- Bengali digits ---------- */
var BN_DIGITS = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
function toBn(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[0-9]/g, function (d) { return BN_DIGITS[+d]; });
}
function toEn(v) {
  if (v === null || v === undefined) return '';
  var out = '';
  var s = String(v);
  for (var i = 0; i < s.length; i++) {
    var idx = BN_DIGITS.indexOf(s[i]);
    out += (idx >= 0) ? String(idx) : s[i];
  }
  return out;
}

/* ---------- id / date ---------- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function currentMonth() { return todayStr().slice(0, 7); }
var Bn_MONTHS = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
function monthNameBn(ym) {
  return Bn_MONTHS[+ym.slice(5, 7) - 1] + ' ' + toBn(ym.slice(0, 4));
}
function fmtDate(iso) {
  if (!iso) return '';
  var p = String(iso).split('-');
  if (p.length < 3) return iso;
  return toBn(+p[2]) + ' ' + Bn_MONTHS[+p[1] - 1] + ' ' + toBn(p[0]);
}

/* ---------- grading ---------- */
function gradeOf(mark, full) {
  if (mark === null || mark === undefined || mark === '') return { g: 'অনু', p: null };
  var ratio = full > 0 ? (mark / full) : 0;
  if (ratio >= 0.8) return { g: 'A+', p: '৫.০০' };
  if (ratio >= 0.7) return { g: 'A',  p: '৪.০০' };
  if (ratio >= 0.6) return { g: 'A-', p: '৩.৫০' };
  if (ratio >= 0.5) return { g: 'B',  p: '৩.০০' };
  if (ratio >= 0.4) return { g: 'C',  p: '২.০০' };
  if (ratio >= 0.33) return { g: 'D', p: '১.০০' };
  return { g: 'F', p: '০.০০' };
}
function isPassedMark(mark, full) {
  if (mark === null || mark === undefined || mark === '') return false;
  return full > 0 && mark / full >= 0.33;
}
/** examStudentMarks: {subjectId: number}, subjects: [{id,full}] */
function examResult(examStudentMarks, subjects) {
  var total = 0, pts = 0, cnt = 0, abs = 0, fail = false, passed = 0, fullTotal = 0;
  (subjects || []).forEach(function (sub) {
    var v = examStudentMarks ? examStudentMarks[sub.id] : undefined;
    fullTotal += sub.full;
    if (v === undefined || v === null || v === '') { abs++; return; }
    total += +v;
    cnt++;
    var gr = gradeOf(v, sub.full);
    if (gr.g === 'F') fail = true; else { pts += parseFloat(toEn(gr.p)); passed++; }
  });
  var gpa = (fail || cnt === 0) ? 0 : (pts / cnt);
  var gradeTxt = (cnt === 0) ? '—' : (fail ? 'অকৃতকার্য' : gradeOf((pts / cnt) / 5 * 100, 100).g);
  return { total: total, gpa: gpa, gpaStr: (cnt === 0 ? '০.০০' : toBn(gpa.toFixed(2))),
           grade: gradeTxt, failed: fail, passCount: passed, subjCount: cnt,
           absentCount: abs, fullTotal: fullTotal };
}

/* ---------- money ---------- */
function money(n) { return toBn(Number(n || 0).toLocaleString('en-US')); }

/* ---------- storage (Android bridge or localStorage) ---------- */
var HAS_BRIDGE = (typeof AndroidBridge !== 'undefined');
var _saveTimer = null;

function loadRawDb() {
  if (HAS_BRIDGE) {
    try { return AndroidBridge.loadDb() || ''; } catch (e) { return ''; }
  }
  try { return localStorage.getItem('madrasa_db') || ''; } catch (e) { return ''; }
}
function persistDb() {
  var json = JSON.stringify(DB);
  var el = document.getElementById('saveIndicator');
  el.textContent = '…'; el.style.opacity = '.4';
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function () {
    try {
      if (HAS_BRIDGE) AndroidBridge.saveDb(json);
      else localStorage.setItem('madrasa_db', json);
    } catch (e) { showToast('সংরক্ষণ ব্যর্থ: ' + e); }
    el.textContent = '✓'; el.style.opacity = '1';
  }, 350);
}

/* ---------- default db ---------- */
function defaultDb() {
  return {
    v: 1,
    settings: { madrasaName: 'আমার মাদরাসা', address: '', phone: '' },
    classes: [],
    subjects: {},
    students: [],
    teachers: [],
    examDefs: [],
    marks: {},
    attendance: {},
    tAttendance: {},
    payments: [],
    salaries: []
  };
}

/* lookups */
function classById(id) { return DB.classes.find(function (c) { return c.id === id; }); }
function className(id) { var c = classById(id); return c ? c.name : '—'; }
function studentById(id) { return DB.students.find(function (s) { return s.id === id; }); }
function teacherById(id) { return DB.teachers.find(function (t) { return t.id === id; }); }
function subjectsOf(classId) { return DB.subjects[classId] || []; }
function nextAdmNo() {
  var y = new Date().getFullYear();
  var pre = y + '-';
  var max = 0;
  DB.students.forEach(function (s) {
    if (s.admNo && s.admNo.indexOf(pre) === 0) {
      var n = parseInt(toEn(s.admNo.slice(pre.length)), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  return pre + String(max + 1).padStart(3, '0');
}
function nextRoll(classId) {
  var rolls = DB.students
    .filter(function (s) { return s.classId === classId && s.status === 'active'; })
    .map(function (s) { return parseInt(toEn(s.roll), 10) || 0; });
  var max = rolls.length ? Math.max.apply(null, rolls) : 0;
  return String(max + 1);
}

/* ---------- toast ---------- */
var _toastTimer = null;
function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
}

/* ---------- modal ---------- */
function openModal(title, bodyHtml) {
  var root = document.getElementById('modalRoot');
  root.innerHTML = '<div class="modal-bg" id="modalBg"><div class="modal"><h3>' + esc(title) + '</h3>' +
    bodyHtml + '</div></div>';
  document.getElementById('modalBg').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });
}
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }

/* ---------- misc ---------- */
function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function confirmBox(msg, onYes) {
  openModal('নিশ্চিত করুন',
    '<p>' + esc(msg) + '</p>' +
    '<div class="btn-row"><button class="btn red" id="cYes">হ্যাঁ, নিশ্চিত</button>' +
    '<button class="btn gray" onclick="closeModal()">বাতিল</button></div>');
  document.getElementById('cYes').onclick = function () { closeModal(); onYes(); };
}
function selOpts(list, val, noneLabel) {
  var h = noneLabel !== undefined ? '<option value="">' + esc(noneLabel) + '</option>' : '';
  (list || []).forEach(function (o) {
    h += '<option value="' + o.id + '"' + (o.id === val ? ' selected' : '') + '>' + esc(o.name) + '</option>';
  });
  return h;
}
function monthOpts(selected, yearsBack) {
  var out = '';
  var now = new Date();
  var start = new Date(now.getFullYear() - (yearsBack || 1), now.getMonth(), 1);
  var cur = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cur >= start) {
    var ym = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0');
    out += '<option value="' + ym + '"' + (ym === selected ? ' selected' : '') + '>' + monthNameBn(ym) + '</option>';
    cur.setMonth(cur.getMonth() - 1);
  }
  return out;
}
function yearOpts(selected) {
  var out = '';
  var y = new Date().getFullYear();
  for (var i = y - 1; i <= y + 1; i++) {
    out += '<option value="' + i + '"' + (String(i) === String(selected) ? ' selected' : '') + '>' + toBn(i) + '</option>';
  }
  return out;
}
function paidInMonth(studentId, ym, type) {
  var sum = 0;
  DB.payments.forEach(function (p) {
    if (p.studentId === studentId && p.month === ym && (!type || p.type === type)) sum += +p.amount;
  });
  return sum;
}
function salaryPaid(teacherId, ym) {
  var sum = 0;
  DB.salaries.forEach(function (s) {
    if (s.teacherId === teacherId && s.month === ym) sum += +s.amount;
  });
  return sum;
}
