/* =====================================================================
   LAYER 3 · STORE + ROUTER
   ===================================================================== */
const S = { role:null, route:'landing', drawer:false, b:{}, step:1, slots:[], emg:{}, photos:{}, sel:null, jobSel:null, notif:{ items:[], unread:0 }, jobFilter:{ q:'', status:'', date:'', when:'all' }, cal:{ view:'month', date:null, tech:'', status:'' }, admFilter:{ q:'', status:'', tech:'', date:'' }, calEvents:[], apptCache:[], jobCache:[], jobDoc:{ photos:[], signature:null, error:false, canEdit:false }, requests:{ emergencies:[], callbacks:[] }, reqSel:null, auth:{ mode:'demo', user:null, profile:null } };
const NAV = {
  customer:  [['dashboard','Dashboard'],['appointments','My appointments'],['book','Book service'],['history','Service history'],['emergency','Emergency help'],['requests','My requests']],
  technician:[['techdash','Dashboard'],['jobs','My jobs'],['photos','Job photos']],
  admin:     [['admin','Operations'],['allappts','Appointments'],['calendar','Calendar'],['rules','Booking rules'],['audit','Audit log'],['status','Feature status']],
  executive: [['exec','Overview'],['allappts','Appointments'],['calendar','Calendar'],['audit','Audit log'],['status','Feature status']]
};
const home = r => NAV[r][0][0];
/* Role-based route guard (UI only; the database/RLS is the real protection) */
const EXTRA = { customer:['appointment','request','notifications'], technician:['job','notifications'], admin:['notifications'], executive:['notifications'] };
const routeOk = r => r === 'landing' || !!(S.role && (NAV[S.role].some(n => n[0] === r) || EXTRA[S.role].includes(r)));
const go = (route, extra = {}) => { if (!routeOk(route)) route = S.role ? home(S.role) : 'landing'; Object.assign(S, { route, drawer:false }, extra); render(); window.scrollTo(0,0); };
const login = role => { S.auth = { mode:'demo', user:null, profile:null }; S.role = role; S.b = {}; S.step = 1; go(home(role)); };
const toast = m => { const t = Object.assign(document.createElement('div'), { className:'toast', textContent:m }); document.body.append(t); setTimeout(() => t.remove(), 3200); };

/* ===== helpers ===== */
const $ = s => document.querySelector(s);
const fmtH = h => `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}`;
const fmtD = (s, o = { weekday:'short', month:'short', day:'numeric' }) => new Date(s + 'T00:00').toLocaleDateString('en-US', o);
const svc = id => CONFIG.services.find(s => s.id === id)?.name || id;
const pill = s => `<span class="pill ${{Confirmed:'',Completed:'gray','Assigned':'gray','En Route':'amb','In Progress':'amb','Needs Follow-up':'red',Cancelled:'red','Requested':'gray','Acknowledged':'amb','Contacted':'amb','Resolved':'gray','Rescheduled':'amb','No show':'red'}[s] ?? ''}">${s}</span>`;
const tel = p => 'tel:' + String(p).replace(/\D/g, '');
const opts = list => list.map(o => `<option>${o}</option>`).join('');
/* Real (Supabase) session: the role is taken from the database profile */
const loginReal = (user, profile, customer = null) => { S.auth = { mode:'real', user, profile, customer }; S.role = profile.role; S.b = {}; S.step = 1; go(home(profile.role)); };
const resetSession = () => { S.auth = { mode:'demo', user:null, profile:null }; S.role = null; S.b = {}; S.step = 1; go('landing'); };
/** The customer shown in the UI: the real one in live mode, the mock one in demo mode */
const me = () => S.auth.mode === 'real' ? (S.auth.customer || { id:null, name:'Customer', phone:'', addr:'No address on file', plan:'' }) : DB.users.customer;

/* ===== Business-timezone helpers (Utah). Booking days and times must not depend on the visitor's own timezone ===== */
const pad2 = n => String(n).padStart(2, '0');
const tzOffsetMin = (ms, tz) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone:tz, hourCycle:'h23', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value])); return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms) / 6e4; };
/** 'YYYY-MM-DD' + hour in the business timezone -> ISO timestamp with the correct UTC offset (daylight saving aware) */
const zonedISO = (day, hour) => { const [y, m, d] = day.split('-').map(Number), guess = Date.UTC(y, m - 1, d, hour); let off = tzOffsetMin(guess, CONFIG.timezone); off = tzOffsetMin(guess - off * 6e4, CONFIG.timezone); const a = Math.abs(off);
  return `${day}T${pad2(hour)}:00:00${off < 0 ? '-' : '+'}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`; };
/** Calendar date (YYYY-MM-DD) in the business timezone, n days from today */
const bizDay = n => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:CONFIG.timezone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date()).map(x => [x.type, x.value])); return new Date(Date.UTC(+p.year, +p.month - 1, +p.day + n)).toISOString().slice(0, 10); };

/* ===== Phase 3E helpers ===== */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));   // escape anything typed by users before it goes into HTML
const knownAddr = () => me().addr === 'No address on file' ? '' : me().addr;
const fmtStamp = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-US', { timeZone:CONFIG.timezone, month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }); };

/* ===== Phase 3F: technician helpers (status flow lives in CONFIG) ===== */
const DONE = ['Completed','Resolved'], CLOSED = [...DONE, 'Cancelled', 'Rescheduled', 'No Show'];   // CLOSED = nothing left for a technician to do
const flowOf = j => j.emergency ? CONFIG.emergencyFlow : CONFIG.jobStatusFlow;
const actionOf = j => (j.emergency ? CONFIG.emergencyActions : CONFIG.jobActions)[j.status] || null;
const nextStatus = j => { const f = flowOf(j), i = f.indexOf(j.status); if (DONE.includes(j.status)) return null; return i > -1 ? (f[i + 1] || null) : (actionOf(j) ? f[1] : null); };       // statuses before the flow (Confirmed, or an emergency not yet assigned) start at step 2
const today = () => S.auth.mode === 'real' ? bizDay(0) : iso(addDays(0));
const techName = () => S.auth.mode === 'real' ? (S.auth.profile?.full_name || 'there') : DB.users.technician.name;

/* ===== Phase 3G: what must be done before a job can be finished (rules live in CONFIG.completion) ===== */
const completionCheck = (j, photos, sig, notes) => { notes = notes || j.log || []; const r = CONFIG.completion[j.emergency ? 'emergency' : 'job'], items = [];
  if (r.notes && !(j.emergency && j.notesCol === null)) items.push({ label:'Completion notes', met:notes.length > 0, hint:'Add a note about the work performed.' });
  if (r.photos) items.push({ label:`Photos (${photos.length} of ${r.photos})`, met:photos.length >= r.photos, hint:`Upload at least ${r.photos} photo(s).` });
  if (r.signature) items.push({ label:'Customer signature', met:!!sig, hint:'Capture the customer’s signature.' });
  return { items, ok:items.every(i => i.met) }; };
const needMsg = chk => 'Please finish: ' + chk.items.filter(i => !i.met).map(i => i.label.replace(/ \(.*\)$/, '')).join(', ') + '.';
const fmtT = tm => { const m = String(tm || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return ''; const h = +m[1]; return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`; };   // '13:30:00' -> '1:30 PM'

/* ===== Date helpers for the calendar (calendar days are plain 'YYYY-MM-DD' strings in the business timezone) ===== */
const dAdd = (day, n) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const dow = day => new Date(day + 'T12:00:00Z').getUTCDay();
const weekStart = day => dAdd(day, -dow(day));
const addMonths = (day, n) => { const [y, m] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10); };
const fmtMin = m => `${Math.floor(m / 60) % 12 || 12}:${pad2(m % 60)} ${m >= 720 ? 'PM' : 'AM'}`;
const fmtLong = day => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric', timeZone:'UTC' });
const svcDesc = name => { const n = String(name || '').toLowerCase(); return (CONFIG.services.find(s => s.name.toLowerCase() === n || n.includes(s.id)) || {}).desc || ''; };
const canEditAppts = () => S.role === 'admin' || (S.role === 'executive' && CONFIG.executiveCanEdit);
