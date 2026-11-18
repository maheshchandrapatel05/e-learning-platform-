/* ================================================================
   script.js — WeLearN  (single source of truth for all pages)
   ================================================================ */

/* ──────────────────────────────────────────────────────────────
   STORAGE  (key = "classes" to match original upload.html)
   ────────────────────────────────────────────────────────────── */
function getClasses() {
  try { return JSON.parse(localStorage.getItem('classes')) || []; }
  catch (e) { return []; }
}
function saveClasses(arr) {
  localStorage.setItem('classes', JSON.stringify(arr));
}

/* ──────────────────────────────────────────────────────────────
   AUTH
   ────────────────────────────────────────────────────────────── */
function checkAuth() {
  if (localStorage.getItem('loggedIn') !== 'true') {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function protectUploadPage() {
  if (!checkAuth()) return;
  if (localStorage.getItem('role') !== 'teacher') {
    alert('Access Denied: Only teachers can upload content.');
    window.location.href = 'dashboard.html';
  }
}

function logout() {
  localStorage.removeItem('loggedIn');
  localStorage.removeItem('role');
  window.location.href = 'login.html';
}

/* ──────────────────────────────────────────────────────────────
   YOUTUBE UTIL
   ────────────────────────────────────────────────────────────── */
function parseYouTubeEmbed(url) {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{6,})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m && m[1]) return 'https://www.youtube.com/embed/' + m[1];
  }
  if (/^[a-zA-Z0-9_-]{6,}$/.test(url.trim())) return 'https://www.youtube.com/embed/' + url.trim();
  return null;
}

/* ──────────────────────────────────────────────────────────────
   DATE UTIL
   ────────────────────────────────────────────────────────────── */
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

/* Returns a string like "2024-W03" — used to group into weeks */
function isoWeekKey(iso) {
  const d = new Date(iso + 'T00:00:00');
  const thu = new Date(d);
  thu.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
  const jan4 = new Date(thu.getFullYear(), 0, 4);
  const wk = Math.round(((thu - jan4) / 86400000 + ((jan4.getDay() + 6) % 7) - 2) / 7) + 1;
  return thu.getFullYear() + '-W' + String(wk).padStart(2, '0');
}

/* ──────────────────────────────────────────────────────────────
   UPLOAD PAGE
   ────────────────────────────────────────────────────────────── */
function previewVideo() {
  const url   = document.getElementById('video').value.trim();
  const embed = parseYouTubeEmbed(url);
  const cont  = document.getElementById('previewContainer');
  const frame = document.getElementById('videoPreview');
  const icon  = document.getElementById('videoIcon');
  if (!cont) return;

  if (embed) {
    frame.src = embed;
    cont.classList.add('active');
    if (icon) { icon.textContent = '✅'; icon.className = 'input-icon valid'; }
  } else {
    frame.src = '';
    cont.classList.remove('active');
    if (icon) {
      icon.textContent = url.length ? '❌' : '';
      icon.className   = 'input-icon' + (url.length ? ' invalid' : '');
    }
  }
}

function uploadClass() {
  if (!checkAuth()) return;
  if (localStorage.getItem('role') !== 'teacher') {
    alert('Only teachers can upload classes.');
    return;
  }

  const get = id => (document.getElementById(id) || {}).value || '';
  const subject   = get('subject').trim();
  const topic     = get('topic').trim();
  const classDate = get('classDate');

  if (!subject || !topic || !classDate) {
    alert('Please fill Subject, Topic and Class Date (required).');
    return;
  }

  const video = get('video').trim();
  const entry = {
    id:          Date.now(),
    subject,
    topic,
    description: get('description').trim(),
    video,
    videoEmbed:  parseYouTubeEmbed(video),
    pdf:         get('pdf').trim(),
    summary:     get('summary').trim(),
    date:        classDate,          // keep as "date" for back-compat
    startTime:   get('startTime'),
    duration:    get('duration'),
    createdAt:   new Date().toISOString(),
  };

  const classes = getClasses();
  classes.unshift(entry);
  saveClasses(classes);
  alert('Class uploaded successfully!');
  window.location.href = 'dashboard.html';
}

/* ──────────────────────────────────────────────────────────────
   DASHBOARD STATE
   ────────────────────────────────────────────────────────────── */
let _activeSubject = null;
let _activeWeek    = null;
let _searchQuery   = '';

/* Build a nested index:  Map< subject → Map< weekNo → class[] > > */
function buildIndex(allClasses, query) {
  const q = query.trim().toLowerCase();
  const list = q
    ? allClasses.filter(c =>
        (c.subject     || '').toLowerCase().includes(q) ||
        (c.topic       || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        (c.summary     || '').toLowerCase().includes(q))
    : allClasses;

  /* group by subject */
  const bySubject = new Map();
  list.forEach(c => {
    const s = (c.subject || 'Uncategorised').trim();
    if (!bySubject.has(s)) bySubject.set(s, []);
    bySubject.get(s).push(c);
  });

  /* within each subject, sort by date and assign sequential week numbers */
  const index = new Map();
  bySubject.forEach((classes, subj) => {
    const sorted = [...classes].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const keyMap = new Map();   // isoWeekKey → weekNumber (1-based)
    let counter = 0;
    sorted.forEach(c => {
      const k = c.date ? isoWeekKey(c.date) : 'nodate';
      if (!keyMap.has(k)) keyMap.set(k, ++counter);
      c._week = keyMap.get(k);
    });
    /* group by weekNo */
    const byWeek = new Map();
    sorted.forEach(c => {
      if (!byWeek.has(c._week)) byWeek.set(c._week, []);
      byWeek.get(c._week).push(c);
    });
    index.set(subj, byWeek);
  });
  return index;
}

/* ──────────────────────────────────────────────────────────────
   RENDER — SUBJECT BAR
   ────────────────────────────────────────────────────────────── */
function renderSubjectBar(index) {
  const bar = document.getElementById('subjectBar');
  if (!bar) return;
  bar.innerHTML = '';

  if (index.size === 0) {
    bar.innerHTML = '<span class="bar-empty">No subjects yet — upload a class to get started.</span>';
    return;
  }

  index.forEach((_, subject) => {
    const btn = document.createElement('button');
    btn.className = 'subject-pill' + (subject === _activeSubject ? ' active' : '');
    btn.textContent = subject;
    btn.onclick = () => onSubjectClick(subject);
    bar.appendChild(btn);
  });
}

/* ──────────────────────────────────────────────────────────────
   RENDER — WEEK BAR
   ────────────────────────────────────────────────────────────── */
function renderWeekBar(index) {
  const wrap = document.getElementById('weekBarWrap');
  const bar  = document.getElementById('weekBar');
  if (!wrap || !bar) return;

  if (!_activeSubject || !index.has(_activeSubject)) {
    wrap.classList.remove('visible');
    return;
  }

  const weekMap = index.get(_activeSubject);
  bar.innerHTML = '<span class="week-label">Weeks</span>';

  weekMap.forEach((_, wk) => {
    const btn = document.createElement('button');
    btn.className = 'week-pill' + (wk === _activeWeek ? ' active' : '');
    btn.textContent = 'Week ' + wk;
    btn.onclick = () => onWeekClick(wk);
    bar.appendChild(btn);
  });

  wrap.classList.add('visible');
}

/* ──────────────────────────────────────────────────────────────
   RENDER — CONTENT AREA
   ────────────────────────────────────────────────────────────── */
function renderContent(index) {
  const area   = document.getElementById('content');
  const header = document.getElementById('contentHeader');
  if (!area) return;

  /* Nothing selected at all */
  if (!_activeSubject) {
    if (header) header.classList.remove('visible');
    if (index.size === 0) {
      area.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📚</div>
          <h3 class="empty-title">No classes yet</h3>
          <p class="empty-text">Teachers can upload classes from the Upload page.</p>
        </div>`;
    } else {
      area.innerHTML = `
        <div class="pick-state">
          <div class="pick-icon">☝️</div>
          <h3 class="pick-title">Select a subject above</h3>
          <p class="pick-text">Click a subject pill to browse its weekly content.</p>
        </div>`;
    }
    return;
  }

  const weekMap = index.get(_activeSubject);

  /* Subject selected but no week yet */
  if (!_activeWeek || !weekMap || !weekMap.has(_activeWeek)) {
    if (header) header.classList.remove('visible');
    area.innerHTML = `
      <div class="pick-state">
        <div class="pick-icon">📅</div>
        <h3 class="pick-title">Select a week</h3>
        <p class="pick-text">Choose a week from the bar above to see its classes.</p>
      </div>`;
    return;
  }

  /* Both subject + week selected → render cards */
  const classes = weekMap.get(_activeWeek);

  if (header) {
    document.getElementById('bcSubject').textContent = _activeSubject;
    document.getElementById('bcWeek').textContent    = 'Week ' + _activeWeek;
    document.getElementById('bcCount').textContent   = classes.length + ' class' + (classes.length !== 1 ? 'es' : '');
    header.classList.add('visible');
  }

  const grid = document.createElement('div');
  grid.className = 'cards-grid';
  classes.forEach(c => grid.appendChild(createClassCard(c)));
  area.innerHTML = '';
  area.appendChild(grid);
}

/* ──────────────────────────────────────────────────────────────
   RENDER — MASTER (calls all three)
   ────────────────────────────────────────────────────────────── */
function renderAll() {
  const index = buildIndex(getClasses(), _searchQuery);

  /* Reset stale selections */
  if (_activeSubject && !index.has(_activeSubject)) { _activeSubject = null; _activeWeek = null; }
  if (_activeSubject && _activeWeek && index.has(_activeSubject)) {
    if (!index.get(_activeSubject).has(_activeWeek)) _activeWeek = null;
  }

  renderSubjectBar(index);
  renderWeekBar(index);
  renderContent(index);
}

/* ──────────────────────────────────────────────────────────────
   INTERACTION HANDLERS
   ────────────────────────────────────────────────────────────── */
function onSubjectClick(subject) {
  if (_activeSubject === subject) { _activeSubject = null; _activeWeek = null; }
  else                            { _activeSubject = subject; _activeWeek = null; }
  renderAll();
}

function onWeekClick(wk) {
  _activeWeek = (_activeWeek === wk) ? null : wk;
  renderAll();
}

function onSearch(query) {
  _searchQuery   = query;
  _activeSubject = null;
  _activeWeek    = null;
  renderAll();
}

/* ──────────────────────────────────────────────────────────────
   INIT DASHBOARD
   ────────────────────────────────────────────────────────────── */
function initDashboard() {
  if (!checkAuth()) return;
  if (localStorage.getItem('role') === 'teacher') injectEditModal();
  renderAll();
}

/* Legacy alias */
function loadDay() { renderAll(); }

/* ──────────────────────────────────────────────────────────────
   CLASS CARD
   ────────────────────────────────────────────────────────────── */
function createClassCard(cls) {
  const isTeacher = localStorage.getItem('role') === 'teacher';
  const card = document.createElement('div');
  card.className = 'card';

  /* ── Header row ── */
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:0.5rem;';

  const title = document.createElement('h3');
  title.style.cssText = 'flex:1;font-family:"Space Grotesk",sans-serif;font-size:1.125rem;color:var(--text-primary);line-height:1.35;';
  title.textContent = cls.topic;
  hdr.appendChild(title);

  if (isTeacher) {
    const acts = document.createElement('div');
    acts.style.cssText = 'display:flex;gap:0.5rem;flex-shrink:0;';

    const mkBtn = (label, bg, hbg, col, cb) => {
      const b = document.createElement('button');
      b.innerHTML = label;
      b.style.cssText = `padding:0.35rem 0.85rem;background:${bg};color:${col};
        border:1.5px solid ${hbg};border-radius:8px;font-family:'DM Sans',sans-serif;
        font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.18s;white-space:nowrap;`;
      b.onmouseover = () => { b.style.background = hbg; b.style.transform = 'translateY(-1px)'; };
      b.onmouseout  = () => { b.style.background = bg;  b.style.transform = 'translateY(0)'; };
      b.onclick = cb;
      return b;
    };

    acts.appendChild(mkBtn('✏️ Edit',   '#e0e7ff', '#c7d2fe', '#4338ca', () => openEditModal(cls.id)));
    acts.appendChild(mkBtn('🗑️ Delete', '#fee2e2', '#fecaca', '#dc2626', () => deleteClass(cls.id)));
    hdr.appendChild(acts);
  }
  card.appendChild(hdr);

  /* ── Meta ── */
  const meta = document.createElement('div');
  meta.style.cssText = 'font-size:0.85rem;color:var(--text-muted);font-weight:500;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;';
  const metaParts = [];
  if (cls.date)      metaParts.push('📅 ' + formatDate(cls.date));
  if (cls.startTime) metaParts.push('🕐 ' + cls.startTime);
  if (cls.duration)  metaParts.push('⏱ ' + cls.duration + ' min');
  metaParts.forEach((p, i) => {
    const span = document.createElement('span');
    span.textContent = p;
    meta.appendChild(span);
    if (i < metaParts.length - 1) {
      const dot = document.createElement('span');
      dot.textContent = '·';
      dot.style.color = 'var(--border-medium)';
      meta.appendChild(dot);
    }
  });
  card.appendChild(meta);

  /* ── Subject tag ── */
  const tag = document.createElement('span');
  tag.textContent = cls.subject;
  tag.style.cssText = `display:inline-block;padding:0.2rem 0.75rem;background:var(--primary-light);
    color:var(--primary-dark);border-radius:999px;font-size:0.775rem;font-weight:600;
    margin-bottom:0.875rem;`;
  card.appendChild(tag);

  /* ── Description ── */
  if (cls.description) {
    const desc = document.createElement('p');
    desc.style.cssText = 'color:var(--text-secondary);margin-bottom:1rem;line-height:1.65;font-size:0.9375rem;';
    desc.textContent = cls.description;
    card.appendChild(desc);
  }

  /* ── Video ── */
  const embed = cls.videoEmbed || parseYouTubeEmbed(cls.video);
  if (embed) {
    const iframe = document.createElement('iframe');
    iframe.src = embed;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'width:100%;height:400px;border-radius:14px;border:1px solid var(--border-light);margin:1rem 0;box-shadow:var(--shadow-lg);';
    card.appendChild(iframe);
  } else if (cls.video) {
    const a = document.createElement('a');
    a.href = cls.video; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = '▶ Watch Video';
    a.style.cssText = 'display:inline-block;color:var(--primary);font-weight:600;margin-bottom:0.75rem;';
    card.appendChild(a);
  }

  /* ── PDF ── */
  if (cls.pdf) {
    const a = document.createElement('a');
    a.href = cls.pdf; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = '📄 Open Document / PDF';
    a.style.cssText = 'display:inline-block;color:var(--primary);font-weight:600;margin-bottom:0.75rem;margin-left:' + (embed || cls.video ? '1rem' : '0') + ';';
    card.appendChild(a);
  }

  /* ── Summary ── */
  if (cls.summary) {
    const det = document.createElement('details');
    det.style.cssText = 'margin-top:1rem;border:1px solid var(--border-light);border-radius:12px;overflow:hidden;';
    const sum = document.createElement('summary');
    sum.textContent = '📝 Key Takeaways';
    sum.style.cssText = 'padding:0.75rem 1rem;font-weight:600;font-size:0.875rem;cursor:pointer;background:var(--bg-secondary);color:var(--text-secondary);list-style:none;user-select:none;';
    const body = document.createElement('div');
    body.style.cssText = 'padding:1rem;font-size:0.9rem;color:var(--text-secondary);line-height:1.75;white-space:pre-wrap;';
    body.textContent = cls.summary;
    det.appendChild(sum); det.appendChild(body);
    card.appendChild(det);
  }

  return card;
}

/* ──────────────────────────────────────────────────────────────
   DELETE
   ────────────────────────────────────────────────────────────── */
function deleteClass(id) {
  if (!confirm('Delete this class? This cannot be undone.')) return;
  saveClasses(getClasses().filter(c => c.id !== id));
  renderAll();
}

/* ──────────────────────────────────────────────────────────────
   EDIT MODAL
   ────────────────────────────────────────────────────────────── */
function injectEditModal() {
  if (document.getElementById('editModal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'editModal';
  overlay.style.cssText = `display:none;position:fixed;inset:0;z-index:1000;
    background:rgba(15,23,42,0.6);backdrop-filter:blur(6px);
    justify-content:center;align-items:center;padding:1rem;`;

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:22px;padding:2.5rem;width:100%;max-width:700px;
      max-height:90vh;overflow-y:auto;box-shadow:0 30px 60px -12px rgba(0,0,0,0.45);">

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem;">
        <h2 style="font-family:'Space Grotesk',sans-serif;font-size:1.5rem;letter-spacing:-0.03em;color:#0f172a;">✏️ Edit Class</h2>
        <button onclick="closeEditModal()" style="background:none;border:none;font-size:1.75rem;cursor:pointer;color:#94a3b8;line-height:1;padding:0.25rem;">×</button>
      </div>

      <input type="hidden" id="editId">

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1.25rem;">
        ${editField('date','editClassDate','Class Date *','date')}
        ${editField('','editStartTime','Start Time','time')}
        ${editField('','editDuration','Duration (min)','number')}
      </div>

      ${editField('','editSubject','Subject Name *','text','e.g., Physics, Mathematics')}
      ${editField('','editTopic','Topic Title *','text',"e.g., Newton's Laws of Motion")}
      ${editTextarea('editDescription','Description','Brief description…',3)}
      ${editField('','editVideo','YouTube Video Link','text','Paste YouTube URL')}
      ${editField('','editPdf','PDF / Document Link','text','Google Drive or PDF URL')}
      ${editTextarea('editSummary','Key Takeaways','Summarize main points…',4)}

      <div style="display:flex;gap:1rem;margin-top:1.75rem;">
        <button onclick="closeEditModal()"
          style="flex:1;padding:0.9rem;background:#f3f4f6;color:#475569;border:1px solid #e2e8f0;
            border-radius:11px;font-family:'DM Sans',sans-serif;font-size:0.9375rem;font-weight:600;cursor:pointer;transition:all 0.2s;"
          onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f3f4f6'">Cancel</button>
        <button onclick="saveEdit()"
          style="flex:2;padding:0.9rem;background:linear-gradient(135deg,#6366f1,#4338ca);color:white;
            border:none;border-radius:11px;font-family:'DM Sans',sans-serif;font-size:0.9375rem;font-weight:600;
            cursor:pointer;box-shadow:0 8px 16px -4px rgba(99,102,241,0.4);transition:all 0.2s;"
          onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">💾 Save Changes</button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeEditModal(); });
  document.body.appendChild(overlay);
}

function editField(mb, id, label, type, placeholder) {
  return `
    <div style="${mb ? 'margin-bottom:1.25rem;' : ''}">
      <label style="display:block;font-size:0.875rem;font-weight:600;color:#475569;margin-bottom:0.4rem;">${label}</label>
      <input type="${type}" id="${id}" placeholder="${placeholder || ''}"
        style="width:100%;padding:0.75rem 1rem;border:2px solid #e2e8f0;border-radius:10px;
        font-family:'DM Sans',sans-serif;font-size:0.875rem;outline:none;color:#0f172a;
        transition:border-color 0.2s;"
        onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#e2e8f0'">
    </div>`;
}

function editTextarea(id, label, placeholder, rows) {
  return `
    <div style="margin-bottom:1.25rem;">
      <label style="display:block;font-size:0.875rem;font-weight:600;color:#475569;margin-bottom:0.4rem;">${label}</label>
      <textarea id="${id}" rows="${rows}" placeholder="${placeholder}"
        style="width:100%;padding:0.75rem 1rem;border:2px solid #e2e8f0;border-radius:10px;
        font-family:'DM Sans',sans-serif;font-size:0.875rem;outline:none;resize:vertical;line-height:1.6;color:#0f172a;
        transition:border-color 0.2s;"
        onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#e2e8f0'"></textarea>
    </div>`;
}

function openEditModal(id) {
  const cls = getClasses().find(c => c.id === id);
  if (!cls) return;
  const set = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val || ''; };
  set('editId', cls.id);
  set('editSubject', cls.subject);
  set('editTopic', cls.topic);
  set('editDescription', cls.description);
  set('editVideo', cls.video);
  set('editPdf', cls.pdf);
  set('editSummary', cls.summary);
  set('editClassDate', cls.date);
  set('editStartTime', cls.startTime);
  set('editDuration', cls.duration);
  document.getElementById('editModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeEditModal() {
  const m = document.getElementById('editModal');
  if (m) m.style.display = 'none';
  document.body.style.overflow = '';
}

function saveEdit() {
  const g   = id => (document.getElementById(id) || {}).value || '';
  const sub = g('editSubject').trim();
  const top = g('editTopic').trim();
  const dt  = g('editClassDate');
  if (!sub || !top || !dt) { alert('Please fill Subject, Topic and Class Date.'); return; }

  const id  = parseInt(g('editId'));
  const vid = g('editVideo').trim();
  const arr = getClasses();
  const idx = arr.findIndex(c => c.id === id);
  if (idx === -1) return;

  arr[idx] = { ...arr[idx],
    subject: sub, topic: top, date: dt,
    description: g('editDescription').trim(),
    video: vid, videoEmbed: parseYouTubeEmbed(vid),
    pdf:  g('editPdf').trim(),
    summary: g('editSummary').trim(),
    startTime: g('editStartTime'),
    duration:  g('editDuration'),
    updatedAt: new Date().toISOString(),
  };
  saveClasses(arr);
  closeEditModal();
  renderAll();
}

/* ──────────────────────────────────────────────────────────────
   GLOBAL EXPORTS
   ────────────────────────────────────────────────────────────── */
window.checkAuth        = checkAuth;
window.protectUploadPage= protectUploadPage;
window.logout           = logout;
window.previewVideo     = previewVideo;
window.uploadClass      = uploadClass;
window.initDashboard    = initDashboard;
window.loadDay          = loadDay;
window.onSearch         = onSearch;
window.onSubjectClick   = onSubjectClick;
window.onWeekClick      = onWeekClick;
window.deleteClass      = deleteClass;
window.openEditModal    = openEditModal;
window.closeEditModal   = closeEditModal;
window.saveEdit         = saveEdit;
