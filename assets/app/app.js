/* ================= app.js : মাদরাসা ম্যানেজমেন্ট ================= */

/* ---------- tiny polyfills for old WebViews ---------- */
if (!String.prototype.padStart) {
  String.prototype.padStart = function (n, c) {
    var s = String(this); c = c || ' ';
    while (s.length < n) s = c + s;
    return s;
  };
}
if (!Array.prototype.find) {
  Array.prototype.find = function (fn, thisArg) {
    for (var i = 0; i < this.length; i++) if (fn.call(thisArg, this[i], i, this)) return this[i];
    return undefined;
  };
}

var DB = null;
var PAGES = {};

/* ================= init ================= */
function init() {
  var raw = loadRawDb();
  if (raw) {
    try { DB = JSON.parse(raw); } catch (e) { DB = null; }
  }
  if (!DB || !DB.settings) {
    DB = defaultDb();
    persistDb();
  }
  var def = defaultDb();
  Object.keys(def).forEach(function (k) { if (DB[k] === undefined) DB[k] = def[k]; });

  document.getElementById('topMadrasaName').textContent = DB.settings.madrasaName || 'মাদরাসা ম্যানেজমেন্ট';
  document.getElementById('drawerMadrasaName').textContent = DB.settings.madrasaName || 'মাদরাসা';

  document.getElementById('menuBtn').onclick = openDrawer;
  document.getElementById('overlay').onclick = closeDrawer;

  var links = document.querySelectorAll('.drawer a[data-page]');
  for (var i = 0; i < links.length; i++) {
    links[i].addEventListener('click', function () {
      go(this.getAttribute('data-page'));
    });
  }

  go('dashboard');
}

function openDrawer() {
  document.getElementById('drawer').classList.add('open');
  document.getElementById('overlay').classList.add('show');
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

function go(page, arg) {
  closeDrawer();
  var links = document.querySelectorAll('.drawer a[data-page]');
  for (var i = 0; i < links.length; i++) {
    links[i].classList.toggle('active', links[i].getAttribute('data-page') === page);
  }
  PAGES[page](document.getElementById('page'), arg);
  window.scrollTo(0, 0);
}

/* ---------- print helper ---------- */
function printHtml(docName, html) {
  if (HAS_BRIDGE) AndroidBridge.printHtml(docName, html);
  else {
    var win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
    else showToast('প্রিন্ট সাপোর্ট নেই');
  }
}
function shareTextFile(fileName, content) {
  if (HAS_BRIDGE) AndroidBridge.shareFile(fileName, content, 'application/json');
  else {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    a.download = fileName; a.click();
  }
}
function docHeader() {
  var st = DB.settings;
  return '<div style="text-align:center;border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:10px;">' +
    '<h2 style="margin:0;font-size:20px;">' + esc(st.madrasaName || '') + '</h2>' +
    (st.address ? '<div style="font-size:12px;">' + esc(st.address) + (st.phone ? ' • ফোন: ' + esc(st.phone) : '') + '</div>' : '') +
    '</div>';
}
function docFooter() {
  return '<table style="margin-top:24px;width:100%;"><tr>' +
    '<td style="border:none;text-align:left;">তারিখ: ' + fmtDate(todayStr()) + '</td>' +
    '<td style="border:none;text-align:right;">মুহতামিমের স্বাক্ষর</td></tr></table>';
}

/* ================= ড্যাশবোর্ড ================= */
PAGES.dashboard = function (el) {
  var ym = currentMonth();
  var activeStudents = DB.students.filter(function (s) { return s.status !== 'inactive'; });
  var collected = 0, dues = 0;
  activeStudents.forEach(function (s) {
    collected += paidInMonth(s.id, ym);
    dues += Math.max(0, (+s.monthlyFee || 0) - paidInMonth(s.id, ym));
  });
  var recent = DB.students.slice()
    .sort(function (a, b) { return (b.admissionDate || '').localeCompare(a.admissionDate || ''); })
    .slice(0, 5);

  el.innerHTML =
    '<div class="grid4">' +
      stat('👥', toBn(activeStudents.length), 'চলতি শিক্ষার্থী') +
      stat('🧑‍🏫', toBn(DB.teachers.filter(function (t) { return t.status !== 'inactive'; }).length), 'শিক্ষক') +
      stat('💰', money(collected) + ' ৳', monthNameBn(ym) + ' আদায়') +
      stat('⚠️', money(dues) + ' ৳', 'মাসিক বকেয়া') +
    '</div>' +
    '<div class="card"><h2>এখন কী করতে চান?</h2><div class="btn-row">' +
      '<button class="btn" onclick="go(\'admission\')">📝 নতুন ভর্তি</button>' +
      '<button class="btn gold" onclick="go(\'attendance\')">✅ হাজিরা নিন</button>' +
      '<button class="btn" onclick="go(\'fees\')">💰 বেতন আদায়</button>' +
      '<button class="btn gray" onclick="go(\'results\')">🎓 রেজাল্ট</button>' +
    '</div></div>' +
    '<div class="card"><h2>সাম্প্রতিক ভর্তি</h2>' + (recent.length ?
      '<div class="table-wrap"><table class="t"><tr><th>ভর্তি নং</th><th class="name">নাম</th><th>শ্রেণি</th><th>তারিখ</th></tr>' +
      recent.map(function (s) {
        return '<tr><td>' + esc(s.admNo) + '</td><td class="name">' + esc(s.name) + '</td><td>' + esc(className(s.classId)) + '</td><td>' + fmtDate(s.admissionDate) + '</td></tr>';
      }).join('') + '</table></div>'
      : '<div class="empty">এখনো কোনো শিক্ষার্থী ভর্তি হয়নি।<br>বাম দিকের মেনু থেকে <b>নতুন ভর্তি</b> নিন।</div>') +
    '</div>';

  function stat(ic, v, l) {
    return '<div class="stat-card"><div>' + ic + '</div><div class="v">' + v + '</div><div class="l">' + esc(l) + '</div></div>';
  }
};

/* ================= নতুন ভর্তি ================= */
PAGES.admission = function (el) {
  if (!DB.classes.length) {
    el.innerHTML = '<div class="card"><div class="empty">ভর্তির আগে অন্তত একটি শ্রেণি যোগ করুন।</div>' +
      '<button class="btn" onclick="go(\'settings\')">সেটিংসে শ্রেণি যোগ করুন</button></div>';
    return;
  }
  el.innerHTML =
    '<div class="card"><h2>📝 নতুন শিক্ষার্থী ভর্তি</h2>' +
    '<div class="grid2">' + f('নাম *', 'stName', 'text', '') + f('ভর্তি নং (স্বয়ংক্রিয়)', 'stAdm', 'text', '') + '</div>' +
    '<div class="grid2">' + f('পিতার নাম', 'stFather', 'text', '') + f('মাতার নাম', 'stMother', 'text', '') + '</div>' +
    '<div class="grid2">' + f('জন্ম তারিখ', 'stDob', 'date', '') +
      '<div><label class="f">লিঙ্গ</label><select id="stGender"><option>ছাত্র</option><option>ছাত্রী</option></select></div></div>' +
    '<div class="grid2">' +
      '<div><label class="f">শ্রেণি *</label><select id="stClass">' + selOpts(DB.classes) + '</select></div>' +
      f('রোল (স্বয়ংক্রিয়)', 'stRoll', 'text', '') + '</div>' +
    '<div class="grid2">' + f('ভর্তির তারিখ', 'stAdmDate', 'date', todayStr()) + f('মাসিক বেতন (৳)', 'stFee', 'number', '0') + '</div>' +
    '<div class="grid2">' + f('অভিভাবকের ফোন', 'stPhone', 'tel', '') + f('ঠিকানা', 'stAddr', 'text', '') + '</div>' +
    '<button class="btn" id="btnAdmit">✔ ভর্তি সম্পন্ন করুন</button></div>';

  var clsSel = document.getElementById('stClass');
  function syncRoll() { document.getElementById('stRoll').value = nextRoll(clsSel.value); }
  clsSel.onchange = syncRoll;
  syncRoll();

  document.getElementById('btnAdmit').onclick = function () {
    var name = document.getElementById('stName').value.trim();
    if (!name) { showToast('শিক্ষার্থীর নাম লিখুন'); return; }
    var adm = document.getElementById('stAdm').value.trim() || nextAdmNo();
    DB.students.push({
      id: uid(), admNo: adm, name: name,
      father: gv('stFather'), mother: gv('stMother'),
      dob: gv('stDob'), gender: gv('stGender'),
      classId: clsSel.value, roll: gv('stRoll'),
      admissionDate: gv('stAdmDate') || todayStr(),
      monthlyFee: +toEn(gv('stFee')) || 0,
      phone: gv('stPhone'), address: gv('stAddr'),
      status: 'active'
    });
    persistDb();
    showToast('✔ ভর্তি সম্পন্ন: ' + name + ' (ভর্তি নং ' + adm + ')');
    go('students', { classId: clsSel.value });
  };

  function f(label, id, type, val) {
    return '<div><label class="f">' + esc(label) + '</label>' +
      '<input id="' + id + '" type="' + type + '" value="' + esc(val) + '"></div>';
  }
  function gv(id) { return document.getElementById(id).value; }
};

/* ================= শিক্ষার্থী তালিকা ================= */
var STU_FILTER = { classId: '', q: '', status: 'active' };

PAGES.students = function (el, arg) {
  if (arg) Object.assign(STU_FILTER, arg);
  render();

  function render() {
    var list = DB.students.filter(function (s) {
      if (STU_FILTER.classId && s.classId !== STU_FILTER.classId) return false;
      if (STU_FILTER.status === 'active' && s.status === 'inactive') return false;
      if (STU_FILTER.status === 'inactive' && s.status !== 'inactive') return false;
      if (STU_FILTER.q) {
        var q = STU_FILTER.q.toLowerCase();
        if ((s.name || '').toLowerCase().indexOf(q) < 0 && (s.admNo || '').toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    }).sort(function (a, b) {
      return className(a.classId).localeCompare(className(b.classId), 'bn') ||
             ((parseInt(toEn(a.roll), 10) || 0) - (parseInt(toEn(b.roll), 10) || 0));
    });

    el.innerHTML =
      '<div class="card"><h2>👥 শিক্ষার্থী তালিকা (' + toBn(list.length) + ')</h2>' +
      '<div class="search-row">' +
        '<div><label class="f">শ্রেণি</label><select id="fClass">' + selOpts(DB.classes, STU_FILTER.classId, 'সব শ্রেণি') + '</select></div>' +
        '<div><label class="f">অবস্থা</label><select id="fStatus">' +
          '<option value="active"' + (STU_FILTER.status === 'active' ? ' selected' : '') + '>চলতি</option>' +
          '<option value="inactive"' + (STU_FILTER.status === 'inactive' ? ' selected' : '') + '>বাদ/চলে গেছে</option>' +
        '</select></div>' +
        '<div><label class="f">খুঁজুন</label><input id="fq" type="search" placeholder="নাম বা ভর্তি নং" value="' + esc(STU_FILTER.q) + '"></div>' +
      '</div>' +
      '<div class="btn-row"><button class="btn small gold" id="btnPrintList">🖨️ তালিকা পিডিএফ</button>' +
      '<button class="btn small" onclick="go(\'admission\')">＋ নতুন ভর্তি</button></div>' +
      listTable(list) + '</div>' + promotionCard();

    document.getElementById('fClass').onchange = function () { STU_FILTER.classId = this.value; render(); };
    document.getElementById('fStatus').onchange = function () { STU_FILTER.status = this.value; render(); };
    document.getElementById('fq').oninput = function () { STU_FILTER.q = this.value; render(); };
    document.getElementById('btnPrintList').onclick = function () { printStudentList(list); };
    bindPromote();
  }

  function listTable(list) {
    if (!list.length) return '<div class="empty">কোনো শিক্ষার্থী পাওয়া যায়নি</div>';
    return '<div class="table-wrap"><table class="t"><tr><th>রোল</th><th>ভর্তি নং</th><th class="name">নাম</th><th>পিতা</th><th>শ্রেণি</th><th>ফোন</th><th>বেতন</th><th>অ্যাকশন</th></tr>' +
      list.map(function (s) {
        return '<tr>' +
          '<td>' + toBn(s.roll) + '</td><td>' + esc(s.admNo) + '</td>' +
          '<td class="name"><b>' + esc(s.name) + '</b>' + (s.status === 'inactive' ? ' <span class="badge a">অবসর</span>' : '') + '</td>' +
          '<td>' + esc(s.father || '') + '</td><td>' + esc(className(s.classId)) + '</td>' +
          '<td>' + esc(s.phone || '') + '</td><td>' + money(s.monthlyFee) + '</td>' +
          '<td><button class="btn small gray" onclick="editStudent(\'' + s.id + '\')">এডিট</button> ' +
          '<button class="btn small red" onclick="delStudent(\'' + s.id + '\')">মুছুন</button></td></tr>';
      }).join('') + '</table></div>';
  }

  function promotionCard() {
    return '<div class="card"><h3>🔄 শ্রেণি উত্তরণ (নতুন শ্রেণিতে প্রবেশ)</h3>' +
      '<div class="search-row">' +
      '<div><label class="f">যে শ্রেণি থেকে</label><select id="fromCls">' + selOpts(DB.classes, '') + '</select></div>' +
      '<div><label class="f">যে শ্রেণিতে</label><select id="toCls">' + selOpts(DB.classes, '') + '</select></div>' +
      '<div style="flex:0"><button class="btn small" id="btnPromote">উত্তরণ করুন</button></div>' +
      '</div></div>';
  }

  function bindPromote() {
    var b = document.getElementById('btnPromote');
    if (!b) return;
    b.onclick = function () {
      var from = document.getElementById('fromCls').value, to = document.getElementById('toCls').value;
      if (!from || !to || from === to) { showToast('ভিন্ন দুটি শ্রেণি নির্বাচন করুন'); return; }
      var n = DB.students.filter(function (s) { return s.classId === from && s.status === 'active'; }).length;
      if (!n) { showToast('ওই শ্রেণিতে কেউ নেই'); return; }
      confirmBox(toBn(n) + ' জন শিক্ষার্থীকে "' + className(to) + '" শ্রেণিতে উত্তরণ করা হবে?', function () {
        DB.students.forEach(function (s) { if (s.classId === from && s.status === 'active') s.classId = to; });
        persistDb(); showToast('✔ উত্তরণ সম্পন্ন হয়েছে'); render();
      });
    };
  }
};

window.editStudent = function (id) {
  var s = studentById(id); if (!s) return;
  openModal('এডিট: ' + s.name,
    '<div class="grid2">' +
    fe('নাম', 'eName', s.name) + fe('ভর্তি নং', 'eAdm', s.admNo, true) +
    fe('পিতা', 'eFather', s.father) + fe('মাতা', 'eMother', s.mother) +
    fed('জন্ম তারিখ', 'eDob', s.dob) +
    '<div><label class="f">লিঙ্গ</label><select id="eGender">' +
      ['ছাত্র', 'ছাত্রী'].map(function (g) { return '<option' + (s.gender === g ? ' selected' : '') + '>' + g + '</option>'; }).join('') + '</select></div>' +
    '<div><label class="f">শ্রেণি</label><select id="eClass">' + selOpts(DB.classes, s.classId) + '</select></div>' +
    fe('রোল', 'eRoll', s.roll) +
    fed('ভর্তির তারিখ', 'eAdmDate', s.admissionDate) +
    fe('মাসিক বেতন', 'eFee', s.monthlyFee, false, 'number') +
    fe('ফোন', 'ePhone', s.phone) +
    fe('ঠিকানা', 'eAddr', s.address) +
    '<div><label class="f">অবস্থা</label><select id="eStatus">' +
      '<option value="active"' + (s.status !== 'inactive' ? ' selected' : '') + '>চলতি</option>' +
      '<option value="inactive"' + (s.status === 'inactive' ? ' selected' : '') + '>বাদ/চলে গেছে</option>' +
    '</select></div></div>' +
    '<div class="btn-row"><button class="btn" id="eSave">সংরক্ষণ করুন</button>' +
    '<button class="btn gray" onclick="closeModal()">বাতিল</button></div>');
  document.getElementById('eSave').onclick = function () {
    s.name = document.getElementById('eName').value.trim() || s.name;
    s.father = document.getElementById('eFather').value;
    s.mother = document.getElementById('eMother').value;
    s.dob = document.getElementById('eDob').value;
    s.gender = document.getElementById('eGender').value;
    s.classId = document.getElementById('eClass').value;
    s.roll = document.getElementById('eRoll').value;
    s.admissionDate = document.getElementById('eAdmDate').value;
    s.monthlyFee = +toEn(document.getElementById('eFee').value) || 0;
    s.phone = document.getElementById('ePhone').value;
    s.address = document.getElementById('eAddr').value;
    s.status = document.getElementById('eStatus').value;
    persistDb(); closeModal(); showToast('✔ সংরক্ষিত হয়েছে'); go('students');
  };
};

window.delStudent = function (id) {
  var s = studentById(id); if (!s) return;
  confirmBox(esc(s.name) + ' কে তালিকা থেকে সম্পূর্ণ মুছে ফেলা হবে?', function () {
    DB.students = DB.students.filter(function (x) { return x.id !== id; });
    if (DB.marks) Object.keys(DB.marks).forEach(function (ex) { if (DB.marks[ex][id]) delete DB.marks[ex][id]; });
    persistDb(); showToast('মুছে ফেলা হয়েছে'); go('students');
  });
};

function fe(label, id, val, readonly, type) {
  return '<div><label class="f">' + esc(label) + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' +
    esc(val === undefined || val === null ? '' : val) + '"' + (readonly ? ' readonly style="background:#f0f3f1"' : '') + '></div>';
}
function fed(label, id, val) {
  return '<div><label class="f">' + esc(label) + '</label><input id="' + id + '" type="date" value="' + esc(val || '') + '"></div>';
}

function printStudentList(list) {
  if (!list.length) { showToast('তালিকা খালি'); return; }
  var byClass = {};
  list.forEach(function (s) { (byClass[s.classId] = byClass[s.classId] || []).push(s); });
  var html = '<h3 style="text-align:center;margin:4px 0 10px;">শিক্ষার্থী তালিকা</h3>';
  Object.keys(byClass).forEach(function (cid) {
    html += '<h4 style="margin:12px 0 4px;">শ্রেণি: ' + esc(className(cid)) + '</h4>' +
      '<table><tr><th>রোল</th><th>ভর্তি নং</th><th>নাম</th><th>পিতার নাম</th><th>ফোন</th><th>মাসিক বেতন</th></tr>' +
      byClass[cid].sort(function (a, b) { return (+toEn(a.roll) || 0) - (+toEn(b.roll) || 0); }).map(function (s) {
        return '<tr><td>' + toBn(s.roll) + '</td><td>' + esc(s.admNo) + '</td><td style="text-align:left">' + esc(s.name) +
          '</td><td>' + esc(s.father || '') + '</td><td>' + esc(s.phone || '') + '</td><td>' + money(s.monthlyFee) + '</td></tr>';
      }).join('') + '</table>';
  });
  printHtml('শিক্ষার্থী_তালিকা', docHeader() + html + docFooter());
}

/* ================= শিক্ষক ================= */
PAGES.teachers = function (el) {
  var list = DB.teachers.slice().sort(function (a, b) { return (a.joinDate || '').localeCompare(b.joinDate || ''); });
  el.innerHTML = '<div class="card"><h2>🧑‍🏫 শিক্ষক তালিকা (' + toBn(list.length) + ')</h2>' +
    '<button class="btn" onclick="openTeacherForm()">＋ নতুন শিক্ষক</button><br><br>' +
    (list.length ? '<div class="table-wrap"><table class="t"><tr><th class="name">নাম</th><th>পদবি</th><th>ফোন</th><th>মাসিক বেতন</th><th>যোগদান</th><th>অ্যাকশন</th></tr>' +
      list.map(function (t) {
        return '<tr><td class="name"><b>' + esc(t.name) + '</b>' + (t.status === 'inactive' ? ' <span class="badge a">অবসর</span>' : '') + '</td>' +
          '<td>' + esc(t.designation || '') + '</td><td>' + esc(t.phone || '') + '</td><td>' + money(t.salary) + '</td><td>' + fmtDate(t.joinDate) + '</td>' +
          '<td><button class="btn small gray" onclick="editTeacher(\'' + t.id + '\')">এডিট</button> ' +
          '<button class="btn small red" onclick="delTeacher(\'' + t.id + '\')">মুছুন</button></td></tr>';
      }).join('') + '</table></div>' : '<div class="empty">কোনো শিক্ষক যোগ করা হয়নি</div>') +
    '</div>';
};

window.openTeacherForm = function (t) {
  t = t || {};
  openModal(t.id ? 'শিক্ষক এডিট' : 'নতুন শিক্ষক',
    '<label class="f">নাম *</label><input id="tName" value="' + esc(t.name || '') + '">' +
    '<label class="f">পদবি</label><select id="tDesig">' +
      ['মুহতামিম', 'নায়েবে মুহতামিম', 'সিনিয়র শিক্ষক', 'শিক্ষক', 'সহকারী শিক্ষক', 'কেরানি/একাউন্টস']
      .map(function (d) { return '<option' + (t.designation === d ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' +
    '<div class="grid2">' + fed('যোগদানের তারিখ', 'tJoin', t.joinDate || todayStr()) +
    fe('মাসিক বেতন (৳)', 'tSalary', t.salary || 0, false, 'number') + '</div>' +
    fe('ফোন', 'tPhone', t.phone || '') + fe('ঠিকানা', 'tAddr', t.address || '') +
    '<div class="btn-row"><button class="btn" id="tSave">সংরক্ষণ করুন</button>' +
    '<button class="btn gray" onclick="closeModal()">বাতিল</button></div>');
  document.getElementById('tSave').onclick = function () {
    var name = document.getElementById('tName').value.trim();
    if (!name) { showToast('নাম লিখুন'); return; }
    var rec = {
      id: t.id || uid(), name: name,
      designation: document.getElementById('tDesig').value,
      joinDate: document.getElementById('tJoin').value,
      salary: +toEn(document.getElementById('tSalary').value) || 0,
      phone: document.getElementById('tPhone').value,
      address: document.getElementById('tAddr').value,
      status: t.status || 'active'
    };
    if (t.id) DB.teachers = DB.teachers.map(function (x) { return x.id === t.id ? rec : x; });
    else DB.teachers.push(rec);
    persistDb(); closeModal(); showToast('✔ সংরক্ষিত হয়েছে'); go('teachers');
  };
};
window.editTeacher = function (id) { openTeacherForm(teacherById(id)); };
window.delTeacher = function (id) {
  var t = teacherById(id); if (!t) return;
  confirmBox(esc(t.name) + ' কে মুছে ফেলা হবে?', function () {
    DB.teachers = DB.teachers.filter(function (x) { return x.id !== id; });
    persistDb(); showToast('মুছে ফেলা হয়েছে'); go('teachers');
  });
};

/* ================= হাজিরা কমন ================= */
function attButtons(key, map) {
  var cur = map ? map[key] : undefined;
  return '<div class="btn-row" data-k="' + key + '">' +
    '<button class="att-btn' + (cur === 'P' ? ' sel-p' : '') + '" data-v="P">উ</button>' +
    '<button class="att-btn' + (cur === 'A' ? ' sel-a' : '') + '" data-v="A">অ</button>' +
    '<button class="att-btn' + (cur === 'L' ? ' sel-l' : '') + '" data-v="L">ছু</button></div>';
}
function bindAttButtons(rootEl, onClick) {
  var rows = rootEl.querySelectorAll('.btn-row[data-k]');
  for (var i = 0; i < rows.length; i++) {
    (function (row) {
      var btns = row.querySelectorAll('.att-btn');
      for (var j = 0; j < btns.length; j++) {
        (function (b) {
          b.onclick = function () {
            for (var k = 0; k < btns.length; k++) btns[k].className = 'att-btn';
            b.className = 'att-btn sel-' + b.getAttribute('data-v').toLowerCase();
            onClick(row.getAttribute('data-k'), b.getAttribute('data-v'));
          };
        })(btns[j]);
      }
    })(rows[i]);
  }
}

/* ================= শিক্ষার্থী হাজিরা ================= */
var ATT = { date: '' }; ATT.date = todayStr();

PAGES.attendance = function (el) {
  render();
  function render() {
    if (!DB.classes.length) { el.innerHTML = '<div class="card"><div class="empty">প্রথমে শ্রেণি ও শিক্ষার্থী যোগ করুন</div></div>'; return; }
    var cid = ATT.classId || DB.classes[0].id;
    ATT.classId = cid;
    var date = ATT.date;
    var rec = Object.assign({}, DB.attendance[date] || {});
    var students = DB.students.filter(function (s) { return s.classId === cid && s.status !== 'inactive'; })
      .sort(function (a, b) { return (+toEn(a.roll) || 0) - (+toEn(b.roll) || 0); });

    el.innerHTML = '<div class="card"><h2>✅ শিক্ষার্থী হাজিরা</h2>' +
      '<div class="search-row">' +
      '<div><label class="f">তারিখ</label><input type="date" id="attDate" value="' + date + '"></div>' +
      '<div><label class="f">শ্রেণি</label><select id="attCls">' + selOpts(DB.classes, cid) + '</select></div>' +
      '<div style="flex:0"><button class="btn small" id="allP">সবাই উপস্থিত</button></div>' +
      '</div>' +
      (students.length ?
        '<div id="attRows">' + students.map(function (s) {
          return '<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);padding:8px 0;gap:8px;">' +
            '<div><b>' + esc(s.name) + '</b><br><small class="muted">রোল ' + toBn(s.roll) + ' • ' + esc(s.admNo) + '</small></div>' +
            attButtons(s.id, rec) + '</div>';
        }).join('') + '</div>' +
        '<button class="btn" id="saveAtt">💾 হাজিরা সংরক্ষণ করুন</button>'
        : '<div class="empty">এই শ্রেণিতে কোনো চলতি শিক্ষার্থী নেই</div>') +
      '</div>';

    var draft = {};
    var base = DB.attendance[date] || {};
    document.getElementById('attDate').onchange = function () { ATT.date = this.value; render(); };
    document.getElementById('attCls').onchange = function () { ATT.classId = this.value; render(); };
    document.getElementById('allP').onclick = function () { render(); };

    bindAttButtons(document, function (k, v) { draft[k] = v; });

    document.getElementById('saveAtt').onclick = function () {
      var day = Object.assign({}, base);
      students.forEach(function (s) {
        var v = draft[s.id] !== undefined ? draft[s.id] : base[s.id];
        if (v === undefined) v = 'P';
        day[s.id] = v;
      });
      DB.attendance[date] = day;
      persistDb();
      showToast('✔ ' + fmtDate(date) + ' এর হাজিরা সংরক্ষিত (' + students.length + ' জন)');
    };
  }
};

/* ================= শিক্ষক হাজিরা ================= */
var TATT = { date: '' }; TATT.date = todayStr();

PAGES.tattendance = function (el) {
  render();
  function render() {
    var date = TATT.date;
    var rec = Object.assign({}, DB.tAttendance[date] || {});
    var teachers = DB.teachers.filter(function (t) { return t.status !== 'inactive'; });
    el.innerHTML = '<div class="card"><h2>✅ শিক্ষক হাজিরা</h2>' +
      '<div class="search-row"><div><label class="f">তারিখ</label><input type="date" id="tattDate" value="' + date + '"></div>' +
      '<div style="flex:0"><button class="btn small" id="tAllP">সবাই উপস্থিত</button></div></div>' +
      (teachers.length ?
        teachers.map(function (t) {
          return '<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);padding:8px 0;gap:8px;">' +
            '<div><b>' + esc(t.name) + '</b><br><small class="muted">' + esc(t.designation || '') + '</small></div>' +
            attButtons(t.id, rec) + '</div>';
        }).join('') + '<button class="btn" id="saveTAtt">💾 হাজিরা সংরক্ষণ করুন</button>'
        : '<div class="empty">প্রথমে শিক্ষক যোগ করুন</div>') +
      '</div>';

    var draft = {};
    var base = DB.tAttendance[date] || {};
    document.getElementById('tattDate').onchange = function () { TATT.date = this.value; render(); };
    document.getElementById('tAllP').onclick = function () { render(); };
    bindAttButtons(document, function (k, v) { draft[k] = v; });
    document.getElementById('saveTAtt').onclick = function () {
      var day = Object.assign({}, base);
      teachers.forEach(function (t) {
        var v = draft[t.id] !== undefined ? draft[t.id] : base[t.id];
        day[t.id] = (v === undefined) ? 'P' : v;
      });
      DB.tAttendance[date] = day;
      persistDb(); showToast('✔ হাজিরা সংরক্ষিত হয়েছে');
    };
  }
};

/* ================= পরীক্ষা ব্যবস্থাপনা ================= */
PAGES.exams = function (el) {
  render();
  function render() {
    el.innerHTML =
      '<div class="card"><h2>🗂️ পরীক্ষা তালিকা</h2>' +
      '<button class="btn" id="addExam">＋ নতুন পরীক্ষা</button><br><br>' +
      (DB.examDefs.length ? '<div class="table-wrap"><table class="t"><tr><th>নাম</th><th>সাল</th><th>অ্যাকশন</th></tr>' +
        DB.examDefs.map(function (e) {
          return '<tr><td>' + esc(e.name) + '</td><td>' + toBn(e.year) + '</td>' +
            '<td><button class="btn small red" onclick="delExam(\'' + e.id + '\')">মুছুন</button></td></tr>';
        }).join('') + '</table></div>' : '<div class="empty">কোনো পরীক্ষা যোগ করা হয়নি</div>') +
      '</div>' + subjectsCard();

    document.getElementById('addExam').onclick = function () {
      openModal('নতুন পরীক্ষা',
        '<label class="f">পরীক্ষার নাম *</label><input id="exName" placeholder="যেমন: প্রথম সাময়িক">' +
        '<label class="f">সাল</label><select id="exYear">' + yearOpts(new Date().getFullYear()) + '</select>' +
        '<div class="btn-row"><button class="btn" id="exSave">যোগ করুন</button><button class="btn gray" onclick="closeModal()">বাতিল</button></div>');
      document.getElementById('exSave').onclick = function () {
        var name = document.getElementById('exName').value.trim();
        if (!name) { showToast('নাম লিখুন'); return; }
        DB.examDefs.push({ id: uid(), name: name, year: document.getElementById('exYear').value });
        persistDb(); closeModal(); showToast('✔ পরীক্ষা যোগ হয়েছে'); render();
      };
    };
  }

  function subjectsCard() {
    if (!DB.classes.length) return '';
    var cid = window._subjCls || DB.classes[0].id;
    window._subjCls = cid;
    return '<div class="card"><h3>📚 শ্রেণিভিত্তিক বিষয় (পূর্ণমান)</h3>' +
      '<div class="search-row"><div><label class="f">শ্রেণি</label><select id="subjCls">' + selOpts(DB.classes, cid) + '</select></div></div>' +
      '<div id="subjList">' + subjTable(cid) + '</div></div>';
  }
  function subjTable(cid) {
    var subs = subjectsOf(cid);
    var h = subs.length ? '<div class="table-wrap"><table class="t"><tr><th class="name">বিষয়</th><th>পূর্ণমান</th><th>মুছুন</th></tr>' +
      subs.map(function (s) {
        return '<tr><td class="name">' + esc(s.name) + '</td><td>' + toBn(s.full) + '</td>' +
          '<td><button class="btn small red" onclick="delSubject(\'' + cid + '\',\'' + s.id + '\')">✕</button></td></tr>';
      }).join('') + '</table></div>' : '<div class="empty">কোনো বিষয় নেই</div>';
    h += '<div class="search-row" style="margin-top:8px;">' +
      '<div><input id="nsName" placeholder="নতুন বিষয়ের নাম"></div>' +
      '<div style="max-width:110px;"><input id="nsFull" type="number" value="100"></div>' +
      '<div style="flex:0"><button class="btn small" onclick="addSubject(\'' + cid + '\')">যোগ করুন</button></div></div>';
    return h;
  }
  window.addSubject = function (cid) {
    var name = document.getElementById('nsName').value.trim();
    var full = +toEn(document.getElementById('nsFull').value) || 100;
    if (!name) { showToast('বিষয়ের নাম লিখুন'); return; }
    if (!DB.subjects[cid]) DB.subjects[cid] = [];
    DB.subjects[cid].push({ id: uid(), name: name, full: full });
    persistDb(); showToast('✔ বিষয় যোগ হয়েছে'); render();
  };
  window.delSubject = function (cid, sid) {
    DB.subjects[cid] = (DB.subjects[cid] || []).filter(function (s) { return s.id !== sid; });
    persistDb(); render();
  };
  var clsEl = document.getElementById('subjCls');
  if (clsEl) clsEl.onchange = function () { window._subjCls = this.value; render(); };
};

window.delExam = function (id) {
  confirmBox('পরীক্ষাটি ও এর সব নম্বর মুছে যাবে?', function () {
    DB.examDefs = DB.examDefs.filter(function (e) { return e.id !== id; });
    delete DB.marks[id];
    persistDb(); showToast('মুছে ফেলা হয়েছে'); go('exams');
  });
};

/* ================= নম্বর প্রবেশ ================= */
PAGES.marks = function (el) {
  render();
  function render() {
    if (!DB.examDefs.length || !DB.classes.length) {
      el.innerHTML = '<div class="card"><div class="empty">প্রথমে <b>পরীক্ষা ব্যবস্থাপনা</b> থেকে পরীক্ষা ও বিষয় যোগ করুন</div></div>';
      return;
    }
    var Q = window._marksSel = window._marksSel || { examId: DB.examDefs[0].id, classId: DB.classes[0].id };
    var subs = subjectsOf(Q.classId);
    var students = DB.students.filter(function (s) { return s.classId === Q.classId && s.status !== 'inactive'; })
      .sort(function (a, b) { return (+toEn(a.roll) || 0) - (+toEn(b.roll) || 0); });

    var rows = students.map(function (s) {
      var sm = (DB.marks[Q.examId] || {})[s.id] || {};
      return '<tr><td class="name"><b>' + esc(s.name) + '</b><br><small class="muted">রোল ' + toBn(s.roll) + '</small></td>' +
        subs.map(function (sub) {
          var v = sm[sub.id];
          return '<td><input type="number" min="0" max="' + sub.full + '" data-st="' + s.id + '" data-sub="' + sub.id +
            '" value="' + (v === undefined ? '' : v) + '" style="width:56px;text-align:center;"></td>';
        }).join('') + '</tr>';
    }).join('');

    el.innerHTML = '<div class="card"><h2>✍️ নম্বর প্রবেশ</h2>' +
      '<div class="search-row">' +
      '<div><label class="f">পরীক্ষা</label><select id="mkExam">' +
        DB.examDefs.map(function (e) { return '<option value="' + e.id + '"' + (e.id === Q.examId ? ' selected' : '') + '>' + esc(e.name) + ' (' + toBn(e.year) + ')</option>'; }).join('') + '</select></div>' +
      '<div><label class="f">শ্রেণি</label><select id="mkClass">' + selOpts(DB.classes, Q.classId) + '</select></div></div>' +
      (subs.length && students.length ?
        '<div class="table-wrap"><table class="t"><tr><th class="name">শিক্ষার্থী</th>' +
        subs.map(function (sub) { return '<th>' + esc(sub.name) + '<br><small>(' + toBn(sub.full) + ')</small></th>'; }).join('') + '</tr>' +
        rows + '</table></div>' +
        '<button class="btn" id="saveMarks">💾 নম্বর সংরক্ষণ করুন</button>'
        : '<div class="empty">এই শ্রেণিতে বিষয় বা শিক্ষার্থী নেই।<br>পরীক্ষা ব্যবস্থাপনা → শ্রেণিভিত্তিক বিষয় থেকে বিষয় যোগ করুন।</div>') +
      '</div>';

    document.getElementById('mkExam').onchange = function () { Q.examId = this.value; render(); };
    document.getElementById('mkClass').onchange = function () { Q.classId = this.value; render(); };
    var sb = document.getElementById('saveMarks');
    if (sb) sb.onclick = function () {
      if (!DB.marks[Q.examId]) DB.marks[Q.examId] = {};
      var inps = document.querySelectorAll('input[data-st]');
      var bad = 0;
      for (var i = 0; i < inps.length; i++) {
        (function (inp) {
          var st = inp.getAttribute('data-st'), sub = inp.getAttribute('data-sub');
          if (!DB.marks[Q.examId][st]) DB.marks[Q.examId][st] = {};
          var raw = toEn(inp.value).trim();
          var subDef = null;
          for (var j = 0; j < subs.length; j++) if (subs[j].id === sub) { subDef = subs[j]; break; }
          if (raw === '') { delete DB.marks[Q.examId][st][sub]; return; }
          var n = +raw; if (isNaN(n) || n < 0) n = 0;
          if (subDef && n > subDef.full) { n = subDef.full; bad++; }
          DB.marks[Q.examId][st][sub] = n;
        })(inps[i]);
      }
      persistDb();
      showToast('✔ নম্বর সংরক্ষিত হয়েছে' + (bad ? ' (' + toBn(bad) + ' টি পূর্ণমানের চেয়ে বেশি ছিল, সমন্বয় করা হয়েছে)' : ''));
    };
  }
};

/* ================= রেজাল্ট ও মার্কশিট ================= */
PAGES.results = function (el) {
  var tab = window._resTab || 'combined';
  el.innerHTML = '<div class="tabs">' +
    '<button data-t="combined"' + (tab === 'combined' ? ' class="active"' : '') + '>সমন্বিত রেজাল্ট</button>' +
    '<button data-t="marksheet"' + (tab === 'marksheet' ? ' class="active"' : '') + '>একক মার্কশিট</button>' +
    '</div><div id="resBody"></div>';
  var btns = el.querySelectorAll('.tabs button');
  for (var i = 0; i < btns.length; i++) {
    btns[i].onclick = function () { window._resTab = this.getAttribute('data-t'); go('results'); };
  }
  if (tab === 'combined') renderCombined(document.getElementById('resBody'));
  else renderMarksheet(document.getElementById('resBody'));
};

function renderCombined(el) {
  if (!DB.examDefs.length || !DB.classes.length) { el.innerHTML = '<div class="card"><div class="empty">পরীক্ষা বা শ্রেণি নেই</div></div>'; return; }
  var Q = window._combSel = window._combSel || { examId: DB.examDefs[0].id, classId: DB.classes[0].id };
  var exam = DB.examDefs.filter(function (e) { return e.id === Q.examId; })[0];
  var subs = subjectsOf(Q.classId);
  var students = DB.students.filter(function (s) { return s.classId === Q.classId; })
    .sort(function (a, b) { return (+toEn(a.roll) || 0) - (+toEn(b.roll) || 0); });

  var results = students.map(function (s) {
    var r = examResult((DB.marks[Q.examId] || {})[s.id], subs);
    return { s: s, r: r };
  }).filter(function (x) { return x.r.subjCount > 0; });

  var ranked = results.slice().sort(function (a, b) {
    return b.r.gpa - a.r.gpa || b.r.total - a.r.total;
  });
  var rankMap = {};
  ranked.forEach(function (x, i) { rankMap[x.s.id] = i + 1; });

  function tableHtml(compact) {
    return '<tr><th>মেধা</th><th>রোল</th><th class="name">নাম</th>' +
      subs.map(function (sub) { return '<th>' + esc(sub.name) + '</th>'; }).join('') +
      '<th>মোট</th><th>GPA</th><th>গ্রেড</th></tr>' +
      results.map(function (x) {
        var sm = (DB.marks[Q.examId] || {})[x.s.id] || {};
        return '<tr><td><b>' + toBn(rankMap[x.s.id]) + '</b></td>' +
          '<td>' + toBn(x.s.roll) + '</td><td class="name" style="text-align:left">' + esc(x.s.name) + '</td>' +
          subs.map(function (sub) {
            var v = sm[sub.id];
            if (v === undefined) return '<td class="muted">অনু</td>';
            var g = gradeOf(v, sub.full);
            return '<td>' + toBn(v) + (compact ? '' : '<br><small class="muted">' + g.g + '</small>') + '</td>';
          }).join('') +
          '<td><b>' + toBn(x.r.total) + '/' + toBn(x.r.fullTotal) + '</b></td>' +
          '<td><b>' + x.r.gpaStr + '</b></td><td><b>' + esc(x.r.grade) + '</b></td></tr>';
      }).join('');
  }

  el.innerHTML = '<div class="card"><h2>🎓 সমন্বিত রেজাল্ট — ' + esc(exam ? exam.name : '') + '</h2>' +
    '<div class="search-row">' +
    '<div><label class="f">পরীক্ষা</label><select id="rsExam">' +
      DB.examDefs.map(function (e) { return '<option value="' + e.id + '"' + (e.id === Q.examId ? ' selected' : '') + '>' + esc(e.name) + ' (' + toBn(e.year) + ')</option>'; }).join('') + '</select></div>' +
    '<div><label class="f">শ্রেণি</label><select id="rsClass">' + selOpts(DB.classes, Q.classId) + '</select></div>' +
    '</div>' +
    (results.length ?
      '<div class="btn-row" style="margin-top:8px;"><button class="btn small gold" id="btnPrintResult">🖨️ রেজাল্ট পিডিএফ</button></div>' +
      '<div class="table-wrap" style="margin-top:8px;"><table class="t">' + tableHtml(false) + '</table></div>'
      : '<div class="empty">এই পরীক্ষায় এখনো নম্বর দেওয়া হয়নি</div>') +
    '</div>';

  document.getElementById('rsExam').onchange = function () { Q.examId = this.value; renderCombined(el); };
  document.getElementById('rsClass').onchange = function () { Q.classId = this.value; renderCombined(el); };
  var pb = document.getElementById('btnPrintResult');
  if (pb) pb.onclick = function () {
    printHtml('রেজাল্ট_' + (exam ? exam.name : 'result'),
      docHeader() +
      '<h3 style="text-align:center;">' + esc((exam ? exam.name : '') + ' — ' + className(Q.classId)) + '</h3>' +
      '<table>' + tableHtml(true) + '</table>' + docFooter());
  };
}

function marksheetHtml(Q) {
  var exam = DB.examDefs.filter(function (e) { return e.id === Q.examId; })[0];
  var s = studentById(Q.studentId);
  if (!exam || !s) return '<p style="text-align:center;color:#888;">তথ্য নির্বাচন করুন</p>';
  var subs = subjectsOf(s.classId);
  var smRepo = DB.marks[Q.examId] || {};
  var r = examResult(smRepo[s.id], subs);

  var peers = DB.students.filter(function (x) { return x.classId === s.classId; })
    .map(function (x) { return examResult(smRepo[x.id], subs); })
    .filter(function (x) { return x.subjCount > 0; })
    .sort(function (a, b) { return b.gpa - a.gpa || b.total - a.total; });
  var rank = -1;
  for (var i = 0; i < peers.length; i++) {
    if (peers[i].subjCount === r.subjCount && peers[i].total === r.total && peers[i].gpa === r.gpa) { rank = i + 1; break; }
  }

  return '<div style="text-align:center;border:2px solid #222;padding:10px;">' +
      '<h2 style="margin:0;">' + esc(DB.settings.madrasaName || '') + '</h2>' +
      (DB.settings.address ? '<div>' + esc(DB.settings.address) + '</div>' : '') +
      '<h3 style="margin:8px 0 0;border-top:1px solid #999;border-bottom:1px solid #999;padding:6px 0;">মার্কশিট — ' + esc(exam.name) + ' (সাল ' + toBn(exam.year) + ')</h3>' +
    '</div>' +
    '<table style="margin-top:8px;"><tr>' +
      '<td style="text-align:left;border:none;"><b>নাম:</b> ' + esc(s.name) + '</td>' +
      '<td style="text-align:right;border:none;"><b>ভর্তি নং:</b> ' + esc(s.admNo) + '</td></tr>' +
      '<tr><td style="text-align:left;border:none;"><b>পিতা:</b> ' + esc(s.father || '') + '</td>' +
      '<td style="text-align:right;border:none;"><b>শ্রেণি:</b> ' + esc(className(s.classId)) + ' (রোল ' + toBn(s.roll) + ')</td></tr>' +
    '</table>' +
    '<br><table>' +
      '<tr><th>ক্রম</th><th>বিষয়</th><th>পূর্ণমান</th><th>প্রাপ্ত নম্বর</th><th>গ্রেড</th><th>পয়েন্ট</th></tr>' +
      subs.map(function (sub, i) {
        var v = smRepo[s.id] ? smRepo[s.id][sub.id] : undefined;
        var g = gradeOf(v, sub.full);
        return '<tr><td>' + toBn(i + 1) + '</td><td style="text-align:left">' + esc(sub.name) + '</td>' +
          '<td>' + toBn(sub.full) + '</td><td>' + (v === undefined ? 'অনু' : toBn(v)) + '</td>' +
          '<td>' + g.g + '</td><td>' + (g.p || '—') + '</td></tr>';
      }).join('') +
      '<tr><th colspan="2" style="text-align:right;">মোট</th><th>' + toBn(r.fullTotal) + '</th><th>' + toBn(r.total) + '</th><th colspan="2">' + esc(r.grade) + '</th></tr>' +
    '</table>' +
    '<table style="margin-top:10px;">' +
      '<tr><th>জিপিএ</th><th>গ্রেড</th><th>মেধাস্থান</th><th>ফলাফল</th></tr>' +
      '<tr><td><b style="font-size:15px;">' + r.gpaStr + '</b></td><td><b>' + esc(r.grade) + '</b></td>' +
      '<td>' + (rank > 0 ? toBn(rank) + ' (' + toBn(peers.length) + ' জনের মধ্যে)' : '—') + '</td>' +
      '<td>' + (r.failed ? 'অকৃতকার্য' : 'উত্তীর্ণ') + '</td></tr>' +
    '</table>' +
    '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:34px;">' +
      '<span>অভিভাবকের স্বাক্ষর</span><span>মুহতামিমের স্বাক্ষর</span></div>';
}

function renderMarksheet(el) {
  if (!DB.examDefs.length || !DB.classes.length) { el.innerHTML = '<div class="card"><div class="empty">পরীক্ষা বা শ্রেণি নেই</div></div>'; return; }
  var Q = window._msSel = window._msSel || { examId: DB.examDefs[0].id, classId: DB.classes[0].id, studentId: '' };
  var clsStudents = DB.students.filter(function (s) { return s.classId === Q.classId; });

  el.innerHTML = '<div class="card"><h2>🎓 একক মার্কশিট</h2>' +
    '<div class="search-row">' +
    '<div><label class="f">পরীক্ষা</label><select id="msExam">' +
      DB.examDefs.map(function (e) { return '<option value="' + e.id + '"' + (e.id === Q.examId ? ' selected' : '') + '>' + esc(e.name) + ' (' + toBn(e.year) + ')</option>'; }).join('') + '</select></div>' +
    '<div><label class="f">শ্রেণি</label><select id="msClass">' + selOpts(DB.classes, Q.classId) + '</select></div>' +
    '<div><label class="f">শিক্ষার্থী</label><select id="msStudent">' +
      '<option value="">— নির্বাচন করুন —</option>' +
      clsStudents.map(function (s) { return '<option value="' + s.id + '"' + (s.id === Q.studentId ? ' selected' : '') + '>' + toBn(s.roll) + '. ' + esc(s.name) + '</option>'; }).join('') +
      '</select></div></div>' +
    '<div class="btn-row" style="margin-top:10px;"><button class="btn small gold" id="btnPdf">🖨️ পিডিএফ সেভ করুন</button>' +
    '<button class="btn small gray" id="btnAllPdf">📚 পুরো শ্রেণির মার্কশিট</button></div>' +
    '<div id="msPreview" style="margin-top:12px;overflow:auto;">' +
      (Q.studentId ? marksheetHtml(Q) : '<div class="empty">শিক্ষার্থী নির্বাচন করুন</div>') +
    '</div></div>';

  document.getElementById('msExam').onchange = function () { Q.examId = this.value; renderMarksheet(el); };
  document.getElementById('msClass').onchange = function () { Q.classId = this.value; Q.studentId = ''; renderMarksheet(el); };
  document.getElementById('msStudent').onchange = function () { Q.studentId = this.value; renderMarksheet(el); };
  document.getElementById('btnPdf').onclick = function () {
    if (!Q.studentId) { showToast('শিক্ষার্থী নির্বাচন করুন'); return; }
    var s = studentById(Q.studentId);
    printHtml('মার্কশিট_' + s.name, marksheetHtml(Q));
  };
  document.getElementById('btnAllPdf').onclick = function () {
    if (!clsStudents.length) { showToast('শ্রেণিতে শিক্ষার্থী নেই'); return; }
    var html = '';
    clsStudents.forEach(function (s) {
      html += '<div style="page-break-after:always;">' + marksheetHtml({ examId: Q.examId, classId: Q.classId, studentId: s.id }) + '</div>';
    });
    printHtml('মার্কশিট_পূর্ণ_শ্রেণি', html);
  };
}

/* ---------------- মাসিক বেতন আদায় ---------------- */
function feeRowHtml(s, ym) {
  var paid = paidInMonth(s.id, ym, 'মাসিক বেতন');
  var fee = Number(s.monthlyFee) || 0;
  var due = fee - paid;
  var st = due <= 0 ? '<span class="badge a">পরিশোধিত</span>' : '<span class="badge l">বকেয়া ' + money(due) + '</span>';
  return '<tr><td>' + toBn(s.roll || '-') + '</td><td>' + esc(s.name) + '</td><td>' + money(fee) + '</td><td>' + money(paid) + '</td><td>' + st + '</td>' +
    '<td><button class="btn small" onclick="openPay(\'' + s.id + '\',\'' + ym + '\')">আদায়</button></td></tr>';
}
window.openPay = function (sid, ym) {
  var s = studentById(sid), fee = Number(s.monthlyFee) || 0;
  var paid = paidInMonth(sid, ym, 'মাসিক বেতন');
  var rem = Math.max(0, fee - paid);
  openModal('বেতন আদায় — ' + esc(s.name) + ' (' + monthNameBn(ym) + ')',
    '<div class="form"><label>আদায়ের পরিমাণ</label><input id="pyAmt" type="number" value="' + rem + '">' +
    '<label>তারিখ</label><input id="pyDate" type="date" value="' + todayStr() + '">' +
    '<label>ধরন</label><select id="pyType"><option>মাসিক বেতন</option><option>অগ্রিম</option><option>বকেয়া পরিশোধ</option><option>অন্যান্য</option></select>' +
    '<label>নোট</label><input id="pyNote" placeholder="(ঐচ্ছিক)"></div>' +
    '<div class="mt"><button class="btn" onclick="savePay(\'' + sid + '\',\'' + ym + '\')">জমা দিন</button></div>');
};
window.savePay = function (sid, ym) {
  var amt = Number(fev2('pyAmt'));
  if (!amt || amt <= 0) { showToast('সঠিক পরিমাণ লিখুন'); return; }
  DB.payments.push({ id: uid(), studentId: sid, month: ym, amount: amt, date: fev2('pyDate') || todayStr(), type: fev2('pyType'), note: fev2('pyNote') });
  persistDb(); closeModal(); showToast('আদায় সম্পন্ন হয়েছে'); render();
};
window.delPay = function (pid) {
  confirmBox('এই আদায় মুছে ফেলবেন?', function () {
    DB.payments = DB.payments.filter(function (p) { return p.id !== pid; });
    persistDb(); render();
  });
};
function paymentsTable(list) {
  if (!list.length) return '<p class="muted">কোনো আদায় নেই।</p>';
  var h = '<table class="t"><tr><th>তারিখ</th><th>শিক্ষার্থী</th><th>মাস</th><th>পরিমাণ</th><th>ধরন</th><th></th></tr>';
  list.slice().reverse().slice(0, 40).forEach(function (p) {
    var s = studentById(p.studentId);
    h += '<tr><td>' + fmtDate(p.date) + '</td><td>' + (s ? esc(s.name) : '-') + '</td><td>' + monthNameBn(p.month) + '</td><td>' + money(p.amount) + '</td><td>' + esc(p.type || '') + '</td>' +
      '<td><button class="btn small red" onclick="delPay(\'' + p.id + '\')">মুছুন</button></td></tr>';
  });
  return h + '</table>';
}
PAGES.fees = function (el) {
  var ym = window._feeMonth || currentMonth();
  var html = '<h2>মাসিক বেতন আদায়</h2>' +
    '<div class="card"><div class="grid2">' +
    '<div><label>মাস</label><select id="feeMonth">' + monthOpts(ym, 2) + '</select></div>' +
    '<div><label>শ্রেণি</label><select id="feeCls">' + selOpts(DB.classes, window._feeCls, 'সব শ্রেণি') + '</select></div>' +
    '</div>' + (window._feeCls ? '<a class="btn small gold" style="margin-top:8px" href="javascript:printFeeSheet()">প্রিন্ট শিট</a>' : '') + '</div><div id="feeBody"></div>';
  el.innerHTML = html;
  fe('feeMonth').onchange = function () { window._feeMonth = this.value; render(); };
  fe('feeCls').onchange = function () { window._feeCls = this.value; render(); };
  var cls = DB.classes.filter(function (c) { return !window._feeCls || c.id === window._feeCls; });
  var body = '';
  var shown = clsStudentsOf(cls);
  shown.forEach(function (pair) {
    var list = pair.list.filter(function (s) { return s.status === 'active'; });
    if (!list.length) return;
    var c = classById(pair.id);
    body += '<h3>' + esc(c.name) + '</h3><table class="t"><tr><th>রোল</th><th>নাম</th><th>মাসিক বেতন</th><th>আদায়</th><th>অবস্থা</th><th></th></tr>' +
      list.map(function (s) { return feeRowHtml(s, ym); }).join('') + '</table>';
  });
  if (!body) body = '<p class="muted">কোনো সক্রিয় শিক্ষার্থী নেই।</p>';
  fe2('feeBody', body);
  var recent = DB.payments.filter(function (p) {
    if (p.month !== ym) return false;
    if (window._feeCls) { var s = studentById(p.studentId); return s && s.classId === window._feeCls; }
    return true;
  });
  fe2('feeBody', body + '<h3>এ মাসের আদায়</h3>' + paymentsTable(recent));
};
function clsStudentsOf(cls) {
  return cls.map(function (c) { return { id: c.id, list: DB.students.filter(function (s) { return s.classId === c.id; }) }; });
}
window.printFeeSheet = function () {
  var ym = window._feeMonth || currentMonth();
  var c = classById(window._feeCls);
  var rows = DB.students.filter(function (s) { return s.classId === window._feeCls && s.status === 'active'; }).map(function (s) {
    var paid = paidInMonth(s.id, ym, 'মাসিক বেতন');
    var fee = Number(s.monthlyFee) || 0;
    return '<tr><td>' + toBn(s.roll || '-') + '</td><td>' + esc(s.name) + '</td><td>' + money(fee) + '</td><td>' + money(paid) + '</td><td>' + money(fee - paid) + '</td></tr>';
  }).join('');
  printHtml('বেতন_আদায়_শিট', docHeader() +
    '<h3 style="text-align:center">' + esc(c.name) + ' — ' + monthNameBn(ym) + '</h3>' +
    '<table><tr><th>রোল</th><th>নাম</th><th>মাসিক বেতন</th><th>আদায়</th><th>বকেয়া</th></tr>' + rows + '</table>' + docFooter());
};

/* ---------------- বকেয়া বেতন ---------------- */
PAGES.dues = function (el) {
  var ym = window._dueMonth || currentMonth();
  var year = ym.split('-')[0];
  var html = '<h2>বকেয়া বেতন হিসাব</h2>' +
    '<div class="card"><div class="grid2">' +
    '<div><label>মাস পর্যন্ত হিসাব</label><select id="dueMonth">' + monthOpts(ym, 2) + '</select></div>' +
    '<div><label>শ্রেণি</label><select id="dueCls">' + selOpts(DB.classes, window._dueCls, 'সব শ্রেণি') + '</select></div></div>' +
    '<div class="mt"><button class="btn small gold" onclick="printDues()">প্রিন্ট বকেয়া তালিকা</button></div></div>' +
    '<div id="dueBody"></div>';
  el.innerHTML = html;
  fe('dueMonth').onchange = function () { window._dueMonth = this.value; render(); };
  fe('dueCls').onchange = function () { window._dueCls = this.value; render(); };
  var mEnd = Number(ym.split('-')[1]);
  var rows = [];
  DB.students.forEach(function (s) {
    if (s.status !== 'active') return;
    if (window._dueCls && s.classId !== window._dueCls) return;
    var fee = Number(s.monthlyFee) || 0;
    if (!fee) return;
    var admM = Number((s.admissionDate || todayStr()).split('-')[1]);
    var fromM = Math.max(1, Math.min(12, admM));
    var billed = 0;
    for (var m = fromM; m <= mEnd; m++) billed += fee;
    var paid = DB.payments.filter(function (p) {
      return p.studentId === s.id && p.type === 'মাসিক বেতন' && (p.month || '').split('-')[0] === year;
    }).reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0);
    var due = billed - paid;
    if (due > 0) rows.push({ s: s, billed: billed, paid: paid, due: due });
  });
  rows.sort(function (a, b) { return b.due - a.due; });
  var total = rows.reduce(function (a, r) { return a + r.due; }, 0);
  var body = '<p>মোট বকেয়া: <b>' + money(total) + '</b> টাকা (' + toBn(rows.length) + ' জন)</p>';
  if (rows.length) {
    body += '<table class="t"><tr><th>নাম</th><th>শ্রেণি</th><th>চাহিদা</th><th>আদায়</th><th>বকেয়া</th></tr>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(r.s.name) + '</td><td>' + esc(className(r.s.classId)) + '</td><td>' + money(r.billed) + '</td><td>' + money(r.paid) + '</td><td class="badge l">' + money(r.due) + '</td></tr>';
      }).join('') + '</table>';
  } else body += '<p class="muted">বকেয়া নেই।</p>';
  fe2('dueBody', body);
};
window.printDues = function () {
  var ym = window._dueMonth || currentMonth();
  var year = ym.split('-')[0], mEnd = Number(ym.split('-')[1]);
  var rows = [];
  DB.students.forEach(function (s) {
    if (s.status !== 'active' || Number(s.monthlyFee) <= 0) return;
    if (window._dueCls && s.classId !== window._dueCls) return;
    var fee = Number(s.monthlyFee) || 0;
    var fromM = Math.max(1, Math.min(12, Number((s.admissionDate || todayStr()).split('-')[1])));
    var billed = 0; for (var m = fromM; m <= mEnd; m++) billed += fee;
    var paid = DB.payments.filter(function (p) { return p.studentId === s.id && p.type === 'মাসিক বেতন' && (p.month || '').split('-')[0] === year; })
      .reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0);
    if (billed - paid > 0) rows.push({ s: s, billed: billed, paid: paid, due: billed - paid });
  });
  rows.sort(function (a, b) { return b.due - a.due; });
  var body = '<table><tr><th>নাম</th><th>শ্রেণি</th><th>রোল</th><th>চাহিদা</th><th>আদায়</th><th>বকেয়া</th></tr>' +
    rows.map(function (r) {
      return '<tr><td>' + esc(r.s.name) + '</td><td>' + esc(className(r.s.classId)) + '</td><td>' + toBn(r.s.roll || '-') + '</td><td>' + money(r.billed) + '</td><td>' + money(r.paid) + '</td><td>' + money(r.due) + '</td></tr>';
    }).join('') + '</table>';
  printHtml('বকেয়া_বেতন_' + ym, docHeader() + '<h3 style="text-align:center">বকেয়া বেতন তালিকা — ' + monthNameBn(ym) + ' পর্যন্ত</h3>' + body + docFooter());
};

/* ---------------- শিক্ষক বেতন প্রদান ---------------- */
window.openSalary = function (tid, ym) {
  var t = teacherById(tid), sal = Number(t.salary) || 0;
  var paid = 0;
  DB.salaries.forEach(function (x) { if (x.teacherId === tid && x.month === ym) paid += Number(x.amount) || 0; });
  var rem = Math.max(0, sal - paid);
  openModal('বেতন প্রদান — ' + esc(t.name) + ' (' + monthNameBn(ym) + ')',
    '<div class="form"><label>পরিমাণ</label><input id="slAmt" type="number" value="' + rem + '">' +
    '<label>তারিখ</label><input id="slDate" type="date" value="' + todayStr() + '">' +
    '<label>নোট</label><input id="slNote" placeholder="(ঐচ্ছিক)"></div>' +
    '<div class="mt"><button class="btn" onclick="saveSalary(\'' + tid + '\',\'' + ym + '\')">জমা দিন</button></div>');
};
window.saveSalary = function (tid, ym) {
  var amt = Number(fev2('slAmt'));
  if (!amt || amt <= 0) { showToast('সঠিক পরিমাণ লিখুন'); return; }
  DB.salaries.push({ id: uid(), teacherId: tid, month: ym, amount: amt, date: fev2('slDate') || todayStr(), note: fev2('slNote') });
  persistDb(); closeModal(); showToast('বেতন প্রদান হয়েছে'); render();
};
window.delSalary = function (sid) {
  confirmBox('এই প্রদান মুছে ফেলবেন?', function () {
    DB.salaries = DB.salaries.filter(function (x) { return x.id !== sid; });
    persistDb(); render();
  });
};
PAGES.tsalary = function (el) {
  var ym = window._salMonth || currentMonth();
  var html = '<h2>শিক্ষক বেতন প্রদান</h2>' +
    '<div class="card"><label>মাস</label><select id="salMonth">' + monthOpts(ym, 2) + '</select>' +
    '<div class="mt"><button class="btn small gold" onclick="printSalarySheet()">প্রিন্ট বেতন শিট</button></div></div><div id="salBody"></div>';
  el.innerHTML = html;
  fe('salMonth').onchange = function () { window._salMonth = this.value; render(); };
  var body = '<table class="t"><tr><th>নাম</th><th>পদবি</th><th>বেতন</th><th>প্রদান</th><th>অবশিষ্ট</th><th></th></tr>';
  DB.teachers.filter(function (t) { return t.status === 'active'; }).forEach(function (t) {
    var sal = Number(t.salary) || 0, paid = 0;
    DB.salaries.forEach(function (x) { if (x.teacherId === t.id && x.month === ym) paid += Number(x.amount) || 0; });
    var rem = sal - paid;
    body += '<tr><td>' + esc(t.name) + '</td><td>' + esc(t.designation || '') + '</td><td>' + money(sal) + '</td><td>' + money(paid) + '</td><td>' +
      (rem <= 0 ? '<span class="badge a">সম্পন্ন</span>' : money(rem)) + '</td>' +
      '<td><button class="btn small" onclick="openSalary(\'' + t.id + '\',\'' + ym + '\')">প্রদান</button></td></tr>';
  });
  body += '</table>';
  var recent = DB.salaries.filter(function (x) { return x.month === ym; });
  var rt = '';
  if (recent.length) {
    rt = '<h3>এ মাসের প্রদান</h3><table class="t"><tr><th>তারিখ</th><th>শিক্ষক</th><th>পরিমাণ</th><th></th></tr>';
    recent.slice().reverse().forEach(function (x) {
      var t = teacherById(x.teacherId);
      rt += '<tr><td>' + fmtDate(x.date) + '</td><td>' + (t ? esc(t.name) : '-') + '</td><td>' + money(x.amount) + '</td>' +
        '<td><button class="btn small red" onclick="delSalary(\'' + x.id + '\')">মুছুন</button></td></tr>';
    });
    rt += '</table>';
  }
  fe2('salBody', body + rt);
};
window.printSalarySheet = function () {
  var ym = window._salMonth || currentMonth();
  var rows = DB.teachers.filter(function (t) { return t.status === 'active'; }).map(function (t) {
    var sal = Number(t.salary) || 0, paid = 0;
    DB.salaries.forEach(function (x) { if (x.teacherId === t.id && x.month === ym) paid += Number(x.amount) || 0; });
    return '<tr><td>' + esc(t.name) + '</td><td>' + esc(t.designation || '') + '</td><td>' + money(sal) + '</td><td>' + money(paid) + '</td><td>' + money(sal - paid) + '</td></tr>';
  }).join('');
  printHtml('শিক্ষক_বেতন_' + ym, docHeader() + '<h3 style="text-align:center">শিক্ষক বেতন শিট — ' + monthNameBn(ym) + '</h3>' +
    '<table><tr><th>নাম</th><th>পদবি</th><th>বেতন</th><th>প্রদান</th><th>অবশিষ্ট</th></tr>' + rows + '</table>' + docFooter());
};

/* ---------------- মাসিক পাঠদানের রিপোর্ট ---------------- */
function attSummaryForMonth(map, ym, ids) {
  var days = Object.keys(map).filter(function (d) { return d.split('-').slice(0, 2).join('-') === ym; });
  var res = {};
  ids.forEach(function (id) { res[id] = { P: 0, A: 0, L: 0 }; });
  days.forEach(function (d) {
    var dd = map[d];
    ids.forEach(function (id) {
      if (!res[id]) return;
      var v = dd[id];
      if (v === 'P') res[id].P++; else if (v === 'A') res[id].A++; else if (v === 'L') res[id].L++;
    });
  });
  return { days: days.length, res: res };
}
PAGES.reports = function (el) {
  var ym = window._repMonth || currentMonth();
  el.innerHTML = '<h2>মাসিক পাঠদানের রিপোর্ট</h2>' +
    '<div class="card"><label>মাস</label><select id="repMonth">' + monthOpts(ym, 2) + '</select>' +
    '<div class="mt"><button class="btn small gold" onclick="printReport()">প্রিন্ট মাসিক রিপোর্ট</button></div></div><div id="repBody"></div>';
  fe('repMonth').onchange = function () { window._repMonth = this.value; render(); };
  var body = '<h3>শিক্ষার্থী হাজিরা</h3>';
  var any = false;
  DB.classes.forEach(function (c) {
    var list = DB.students.filter(function (s) { return s.classId === c.id && s.status === 'active'; });
    if (!list.length) return;
    var sum = attSummaryForMonth(DB.attendance, ym, list.map(function (s) { return s.id; }));
    any = true;
    body += '<h4>' + esc(c.name) + ' (মোট হাজিরা দিন: ' + toBn(sum.days) + ')</h4>' +
      '<table class="t"><tr><th>নাম</th><th>উপস্থিত</th><th>অনুপস্থিত</th><th>ছুটি</th><th>%</th></tr>';
    list.forEach(function (s) {
      var r = sum.res[s.id];
      var tot = r.P + r.A + r.L;
      var pc = tot ? Math.round(r.P / tot * 100) : 0;
      body += '<tr><td>' + esc(s.name) + '</td><td>' + toBn(r.P) + '</td><td>' + toBn(r.A) + '</td><td>' + toBn(r.L) + '</td><td>' + toBn(pc) + '%</td></tr>';
    });
    body += '</table>';
  });
  if (!any) body += '<p class="muted">কোনো হাজিরা তথ্য নেই।</p>';
  body += '<h3>শিক্ষক হাজিরা</h3>';
  var tl = DB.teachers.filter(function (t) { return t.status === 'active'; });
  if (tl.length) {
    var ts = attSummaryForMonth(DB.tAttendance, ym, tl.map(function (t) { return t.id; }));
    if (ts.days) {
      body += '<p>মোট হাজিরা দিন: ' + toBn(ts.days) + '</p><table class="t"><tr><th>নাম</th><th>উপস্থিত</th><th>অনুপস্থিত</th><th>ছুটি</th></tr>';
      tl.forEach(function (t) {
        var r = ts.res[t.id] || { P: 0, A: 0, L: 0 };
        body += '<tr><td>' + esc(t.name) + '</td><td>' + toBn(r.P) + '</td><td>' + toBn(r.A) + '</td><td>' + toBn(r.L) + '</td></tr>';
      });
      body += '</table>';
    } else body += '<p class="muted">শিক্ষক হাজিরা তথ্য নেই।</p>';
  }
  fe2('repBody', body);
};
window.printReport = function () {
  var ym = window._repMonth || currentMonth();
  var body = '';
  DB.classes.forEach(function (c) {
    var list = DB.students.filter(function (s) { return s.classId === c.id && s.status === 'active'; });
    if (!list.length) return;
    var sum = attSummaryForMonth(DB.attendance, ym, list.map(function (s) { return s.id; }));
    body += '<h4>' + esc(c.name) + '</h4><table><tr><th>নাম</th><th>উপস্থিত</th><th>অনুপস্থিত</th><th>ছুটি</th><th>%</th></tr>';
    list.forEach(function (s) {
      var r = sum.res[s.id], tot = r.P + r.A + r.L, pc = tot ? Math.round(r.P / tot * 100) : 0;
      body += '<tr><td>' + esc(s.name) + '</td><td>' + toBn(r.P) + '</td><td>' + toBn(r.A) + '</td><td>' + toBn(r.L) + '</td><td>' + toBn(pc) + '%</td></tr>';
    });
    body += '</table>';
  });
  printHtml('মাসিক_রিপোর্ট_' + ym, docHeader() + '<h3 style="text-align:center">মাসিক পাঠদান ও হাজিরা রিপোর্ট — ' + monthNameBn(ym) + '</h3>' + body + docFooter());
};

/* ---------------- সেটিংস / ব্যাকআপ ---------------- */
window.delClass = function (cid) {
  var has = DB.students.some(function (s) { return s.classId === cid && s.status === 'active'; });
  if (has) { showToast('এই শ্রেণিতে শিক্ষার্থী আছে, মুছা যাবে না'); return; }
  confirmBox('শ্রেণিটি মুছে ফেলবেন?', function () {
    DB.classes = DB.classes.filter(function (c) { return c.id !== cid; });
    persistDb(); render();
  });
};
function settingsHtml() {
  var clsRows = DB.classes.map(function (c, i) {
    var n = DB.students.filter(function (s) { return s.classId === c.id && s.status === 'active'; }).length;
    return '<tr><td>' + toBn(i + 1) + '</td><td>' + esc(c.name) + '</td><td>' + toBn(n) + '</td>' +
      '<td><button class="btn small red" onclick="delClass(\'' + c.id + '\')">মুছুন</button></td></tr>';
  }).join('');
  var snaps = [];
  try { snaps = JSON.parse(AndroidBridge.listSnapshots() || '[]'); } catch (e) {}
  var snapHtml = snaps.length ? '<table class="t"><tr><th>স্ন্যাপশট</th><th></th></tr>' + snaps.map(function (n) {
    return '<tr><td>' + esc(n) + '</td><td><button class="btn small" onclick="restoreSnap(\'' + n + '\')">পুনরুদ্ধার</button> ' +
      '<button class="btn small red" onclick="deleteSnap(\'' + n + '\')">মুছুন</button></td></tr>';
  }).join('') + '</table>' : '<p class="muted">কোনো স্ন্যাপশট নেই।</p>';
  return '<h2>সেটিংস</h2>' +
    '<div class="card"><h3>মাদরাসার তথ্য</h3>' +
    '<label>মাদরাসার নাম</label><input id="stName" value="' + esc(DB.settings.madrasaName) + '">' +
    '<label>ঠিকানা</label><input id="stAddr" value="' + esc(DB.settings.address) + '">' +
    '<label>ফোন</label><input id="stPhone" value="' + esc(DB.settings.phone) + '">' +
    '<div class="mt"><button class="btn" onclick="saveSettings()">সংরক্ষণ</button></div></div>' +
    '<div class="card"><h3>শ্রেণি ব্যবস্থাপনা</h3><table class="t"><tr><th>ক্রম</th><th>শ্রেণি</th><th>শিক্ষার্থী</th><th></th></tr>' + clsRows + '</table>' +
    '<div class="grid2 mt"><input id="ncName" placeholder="নতুন শ্রেণির নাম"><button class="btn" onclick="addClass()">যোগ করুন</button></div></div>' +
    '<div class="card"><h3>ব্যাকআপ ও পুনরুদ্ধার</h3>' +
    '<div class="grid2">' +
    '<button class="btn" onclick="makeSnapshot()">স্ন্যাপশট নিন</button>' +
    '<button class="btn" onclick="exportBackup()">ব্যাকআপ শেয়ার/সংরক্ষণ</button>' +
    '</div>' +
    '<div class="mt"><label>ব্যাকআপ ফাইল থেকে পুনরুদ্ধার</label><input type="file" id="restoreFile" accept=".json"></div>' +
    '<h3 class="mt">স্ন্যাপশট তালিকা</h3>' + snapHtml + '</div>' +
    '<div class="card"><h3>রিসেট</h3><button class="btn red" onclick="factoryReset()">সব ডেটা মুছে ফ্যাক্টরি রিসেট</button></div>';
}
PAGES.settings = function (el) { el.innerHTML = settingsHtml(); bindRestore(); };
function bindRestore() {
  var f = fe('restoreFile');
  if (f) f.onchange = function () {
    var file = this.files[0];
    if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var obj = JSON.parse(r.result);
        if (!obj || typeof obj !== 'object' || !obj.students) throw new Error('bad');
        confirmBox('ব্যাকআপ থেকে পুনরুদ্ধার করলে বর্তমান ডেটা প্রতিস্থাপিত হবে। অনুমোদন করবেন?', function () {
          DB = obj; migrateDb(); persistDb(); showToast('পুনরুদ্ধার সম্পন্ন'); render();
        });
      } catch (e) { showToast('ফাইলটি সঠিক ব্যাকআপ নয়'); }
    };
    r.readAsText(file);
  };
}
window.saveSettings = function () {
  DB.settings.madrasaName = fev2('stName');
  DB.settings.address = fev2('stAddr');
  DB.settings.phone = fev2('stPhone');
  persistDb(); document.getElementById('topMadrasaName').textContent = DB.settings.madrasaName || 'মাদরাসা ম্যানেজমেন্ট';
  showToast('সংরক্ষিত হয়েছে');
};
window.addClass = function () {
  var n = fev2('ncName').trim();
  if (!n) { showToast('শ্রেণির নাম লিখুন'); return; }
  DB.classes.push({ id: uid(), name: n });
  persistDb(); showToast('শ্রেণি যোগ হয়েছে'); render();
};
window.makeSnapshot = function () {
  if (window.AndroidBridge) { AndroidBridge.createSnapshot(JSON.stringify(DB)); showToast('স্ন্যাপশট তৈরি হয়েছে'); render(); }
  else showToast('শুধু অ্যাপে কাজ করে');
};
function restoreSnapByName(n) {
  var raw = AndroidBridge.getSnapshot(n);
  try {
    var obj = JSON.parse(raw);
    DB = obj; migrateDb(); persistDb(); showToast('পুনরুদ্ধার সম্পন্ন'); render();
  } catch (e) { showToast('পুনরুদ্ধার ব্যর্থ'); }
}
window.restoreSnap = function (n) {
  confirmBox('এই স্ন্যাপশট থেকে পুনরুদ্ধার করবেন?', function () { restoreSnapByName(n); });
};
window.deleteSnap = function (n) {
  confirmBox('স্ন্যাপশট মুছে ফেলবেন?', function () {
    try { AndroidBridge.deleteSnapshot(n); } catch (e) {}
    render();
  });
};
window.exportBackup = function () {
  var name = 'madrasa-backup-' + todayStr() + '.json';
  if (window.AndroidBridge) AndroidBridge.shareFile(name, JSON.stringify(DB), 'application/json');
  else {
    var a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(DB));
    a.download = name; a.click();
  }
};
window.factoryReset = function () {
  confirmBox('সতর্কতা! সব ডেটা স্থায়ীভাবে মুছে যাবে। অনুমোদন করবেন?', function () {
    DB = defaultDb(); persistDb(); showToast('রিসেট সম্পন্ন'); go('settings');
  });
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
