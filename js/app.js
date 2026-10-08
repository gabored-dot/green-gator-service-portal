/* =====================================================================
   LAYER 5 · SHELL + RENDER
   ===================================================================== */
async function render() {
  const app = $('#app');
  if (S.route === 'landing') { app.innerHTML = V.landing(); afterRender(); return; }
  const title = NAV[S.role].find(n => n[0] === S.route)?.[1] || ({ appointment:'Appointment details' }[S.route] || 'Booking');
  const body = await V[S.route === 'history' ? 'history' : S.route]();
  app.innerHTML = `<div class="shell"><aside class="side ${S.drawer ? 'open' : ''}"><div class="brand"><span class="logo">GG</span>Green Gator</div>
    ${NAV[S.role].map(([k, l]) => `<button class="nav ${S.route === k ? 'on' : ''}" data-a="nav" data-v="${k}">${l}</button>`).join('')}
    <div class="sp"></div><button class="nav" data-a="out">Switch role</button></aside><div class="scrim ${S.drawer ? 'open' : ''}" data-a="drawer"></div>
    <div><header class="top"><button class="btn burger" data-a="drawer" aria-label="Menu">☰</button><b class="sp">${title}</b>
      ${S.role === 'customer' ? '<button class="btn red" data-a="nav" data-v="emergency">Emergency</button>' : ''}<button class="btn ghost" data-a="theme" aria-label="Toggle theme">◐</button><span class="pill gray">${S.role}${S.auth.mode === 'demo' ? ' · demo' : ''}</span></header>
    <main class="main">${body}</main></div></div>`; afterRender();
}

/* =====================================================================
   LAYER 6 · ACTIONS (event delegation; one handler per data-a)
   ===================================================================== */
const openDlg = html => { const d = $('#dlg'); d.innerHTML = html; d.showModal(); };
const closeDlg = () => $('#dlg').close();
const dlgFields = ph => `<textarea id="dnote" rows="2" placeholder="${ph}" style="margin-top:10px"></textarea>`;
const dlgBtns = (keep, ok, label, v = '', cls = 'pri') => `<div class="row" style="margin-top:16px"><button class="btn" data-a="dlg-close">${keep}</button><button class="btn ${cls} sp" data-a="${ok}" data-v="${v}">${label}</button></div>`;
const authErr = m => document.querySelectorAll('.autherr').forEach(el => { el.textContent = m; });
let applying = false;
/** Session → profile (role from the database) → existing dashboards */
async function applySession(session) {
  if (!session || applying) return; applying = true;
  try { const profile = await API.getCurrentProfile();
    if (!profile) { await API.signOut(); resetSession(); return authErr('Signed in, but no account profile was found. Please contact the office.'); }
    loginReal(session.user, profile);
  } finally { applying = false; }
}
async function initAuth() {            // runs after first render, never blocks the UI
  if (!(await API.testSupabaseConnection())) return;
  API.onAuthStateChange((event, session) => setTimeout(() => {   // setTimeout avoids calling Supabase inside the callback
    if (event === 'SIGNED_OUT') { if (S.auth.mode === 'real') resetSession(); }
    else if (event === 'SIGNED_IN' && S.auth.mode !== 'demo' && S.auth.user?.id !== session?.user?.id) applySession(session);
    else if (event === 'TOKEN_REFRESHED') console.log('Session refreshed');
  }, 0));
  const s = await API.getSession(); if (s) applySession(s);
}
const ACT = {
  login: v => login(v), nav: v => { if (v === 'book') S.b = {}, S.step = 1; if (v === 'emergency') S.emg = {}; go(v); },
  out: async () => { if (S.auth.mode === 'real') await API.signOut(); resetSession(); },
  signin: async v => { const k = v === 'c' ? 'c' : 's', email = $('#' + k + '-email').value.trim(), pass = $('#' + k + '-pass').value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return authErr('Please enter a valid email address.');
    if (!pass) return authErr('Please enter your password.');
    authErr(''); const r = await API.signIn(email, pass); if (!r.ok) return authErr(r.error); await applySession(r.session); },
  signup: () => openDlg(`<h3>Create customer account</h3><p class="mut sm" style="margin:8px 0 14px">Accounts created here are always customer accounts.</p>
    <div class="grid" style="gap:10px"><input type="text" id="su-name" placeholder="Full name" autocomplete="name"><input type="email" id="su-email" placeholder="Email" autocomplete="email"><input type="tel" id="su-phone" placeholder="Phone" autocomplete="tel"><input type="password" id="su-pass" placeholder="Password (8+ characters)" autocomplete="new-password"></div><p class="autherr" style="margin-top:10px"></p>${dlgBtns('Cancel', 'signup-ok', 'Create account')}`),
  'signup-ok': async () => { const n = $('#su-name').value.trim(), e = $('#su-email').value.trim(), ph = $('#su-phone').value.trim(), pw = $('#su-pass').value;
    if (!n) return authErr('Please enter your name.'); if (!/^\S+@\S+\.\S+$/.test(e)) return authErr('Please enter a valid email address.'); if (pw.length < 8) return authErr('Password must be at least 8 characters.');
    authErr(''); const r = await API.signUp(e, pw, { full_name:n, phone:ph }); if (!r.ok) return authErr(r.error); closeDlg();
    if (r.needsConfirm) toast('Check your email to confirm your account, then sign in.'); else await applySession(r.session); }, drawer: () => { S.drawer = !S.drawer; render(); },
  svc: v => { S.b.service = v; render(); }, step: v => { S.step = +v; render(); },
  date: async v => { S.b.date = v; S.b.hour = null; S.slots = await API.getSlots(v, S.b.tech || 'auto'); render(); },
  tech: async v => { S.b.tech = v; S.b.hour = null; if (S.b.date) S.slots = await API.getSlots(S.b.date, v); render(); },
  slot: v => { S.b.hour = +v; S.b.free = S.slots.find(x => x.hour === +v).free; render(); },
  confirm: async () => { const a = await API.createAppointment(S.b); S.b.done = a; S.step = 4; render(); },
  resched: v => { S.b = { replaceId:v }; S.step = 1; go('book'); },
  details: v => go('appointment', { sel:v }),
  'dlg-close': closeDlg,
  cancel: v => openDlg(`<h3>Cancel this appointment?</h3><p class="mut sm" style="margin:8px 0 14px">${v} will be released. You can rebook anytime.</p>
    <select id="dsel"><option value="">Choose a reason</option>${opts(CONFIG.cancelReasons)}</select>${dlgFields('Anything else? (optional)')}${dlgBtns('Keep it', 'cancel-ok', 'Cancel appointment', v, 'red')}`),
  'cancel-ok': async v => { const r = $('#dsel').value; if (!r) return toast('Choose a reason to continue'); await API.cancelAppointment(v, r, $('#dnote').value.trim()); closeDlg(); toast('Appointment cancelled'); render(); },
  callback: () => openDlg(`<h3>Request a callback</h3><p class="mut sm" style="margin:8px 0 14px">We’ll call ${DB.users.customer.phone}.</p>
    <select id="dsel">${opts(CONFIG.callbackWindows)}</select>${dlgFields('What should we know? (optional)')}${dlgBtns('Close', 'callback-ok', 'Request callback')}`),
  'callback-ok': async () => { await API.createCallback({ customerId:DB.users.customer.id, phone:DB.users.customer.phone, window:$('#dsel').value, note:$('#dnote').value.trim() }); closeDlg(); toast('Callback requested. We’ll be in touch soon.'); },
  jobx: v => openDlg(`<h3>Can’t complete this job?</h3><p class="mut sm" style="margin:8px 0 14px">The office will be notified to follow up with the customer.</p>
    <select id="dsel"><option value="">Choose a reason</option>${opts(CONFIG.jobExceptions)}</select>${dlgFields('Details for the office (optional)')}${dlgBtns('Back', 'jobx-ok', 'Report to office', v, 'red')}`),
  'jobx-ok': async v => { const r = $('#dsel').value; if (!r) return toast('Choose a reason to continue'); await API.reportJobException(v, r, $('#dnote').value.trim()); closeDlg(); toast('Reported. Office notified.'); render(); },
  etype: v => { S.emg.type = v; render(); }, eloc: () => { S.emg.loc = 'Using current location (mock)'; render(); },
  esend: async () => { S.emg.sent = await API.createEmergency({ type:S.emg.type }); render(); },
  job: async v => { const j = await API.advanceJob(v); toast('Status updated: ' + j.status); render(); },
  win: v => { CONFIG.bookingWindowDays = Math.min(14, Math.max(1, CONFIG.bookingWindowDays + +v)); render(); },
  toast: v => toast(v),
  theme: () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
};
document.addEventListener('click', e => { const t = e.target.closest('[data-a]'); if (!t || t.type === 'file') return; e.preventDefault(); ACT[t.dataset.a]?.(t.dataset.v); });
document.addEventListener('change', e => { const t = e.target; if (t.type !== 'file' || !t.files[0]) return; const url = URL.createObjectURL(t.files[0]);
  if (t.dataset.a === 'ephoto') { S.emg.photo = url; } else { S.photos[t.dataset.v] = url; } render(); });
/* ===== 7. POLISH HOOKS ===== */
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('gg-theme', t); } catch (e) {} }
try { const t = localStorage.getItem('gg-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
function countUp(el) { // animates the first number in the text, keeps prefix/suffix and decimals
  const m = el.textContent.match(/^(\D*)([\d,.]+)(.*)$/); if (!m || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const end = parseFloat(m[2].replace(/,/g, '')), dec = (m[2].split('.')[1] || '').length, t0 = performance.now();
  const fmt = v => v.toLocaleString('en-US', { minimumFractionDigits:dec, maximumFractionDigits:dec });
  (function tick(t) { const p = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - p, 3); el.textContent = m[1] + fmt(end * e) + m[3]; if (p < 1) requestAnimationFrame(tick); })(t0);
}
let lastView = '';
function afterRender() { // animate only when the view changes, not on every click
  const k = S.route + (S.route === 'book' ? S.step : ''), fresh = k !== lastView; lastView = k;
  if (fresh) { $('.main')?.classList.add('anim'); document.querySelectorAll('.kpi b, [data-count]').forEach(countUp); }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.drawer) { S.drawer = false; render(); } });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && /^[cs]-pass$/.test(e.target.id)) ACT.signin(e.target.id[0]); });
render();
initAuth();
