/* =====================================================================
   LAYER 5 · SHELL + RENDER
   ===================================================================== */
let renderSeq = 0;                       // only the newest render may draw (a slow earlier one must not overwrite a newer screen)
async function render() {
  const app = $('#app'), tok = ++renderSeq;
  if (S.route === 'landing') { app.innerHTML = V.landing(); afterRender(); return; }
  const title = NAV[S.role].find(n => n[0] === S.route)?.[1] || ({ notifications:'Notifications', allappts:'Appointments', appointment:'Appointment details', request:'Request details', job:'Job details' }[S.route] || 'Booking');
  if (S.auth.mode === 'real' && !$('.main')) app.innerHTML = '<p class="mut" style="padding:60px 20px;text-align:center">Loading your portal…</p>';
  const vk = S.route + (S.route === 'book' ? S.step : ''); if (S.auth.mode === 'real' && $('.main') && vk !== lastView) $('.main').innerHTML = '<div class="card"><p class="mut">Loading…</p></div>';
  let body; try { body = await V[S.route === 'history' ? 'history' : S.route](); }
  catch (e) { console.error('View failed:', S.route, e.message); body = '<div class="card"><h2>We couldn’t load your information</h2><p class="mut" style="margin:6px 0 14px">Please try again.</p><button class="btn pri" data-a="retry">Try again</button></div>'; }
  if (tok !== renderSeq) return;
  app.innerHTML = `<div class="shell"><aside class="side ${S.drawer ? 'open' : ''}"><div class="brand"><span class="logo">GG</span>Green Gator</div>
    ${NAV[S.role].map(([k, l]) => `<button class="nav ${S.route === k ? 'on' : ''}" data-a="nav" data-v="${k}">${l}</button>`).join('')}
    <div class="sp"></div><button class="nav" data-a="out">Switch role</button></aside><div class="scrim ${S.drawer ? 'open' : ''}" data-a="drawer"></div>
    <div><header class="top"><button class="btn burger" data-a="drawer" aria-label="Menu">☰</button><b class="sp">${title}</b>
      ${S.role === 'customer' ? '<button class="btn red" data-a="nav" data-v="emergency">Emergency</button>' : ''}<button class="btn ghost" data-a="nav" data-v="notifications" aria-label="Notifications" style="position:relative">🔔<span id="notif-badge" class="badge" hidden></span></button><button class="btn ghost" data-a="theme" aria-label="Toggle theme">◐</button><span class="pill gray">${S.role}${S.auth.mode === 'demo' ? ' · demo' : ''}</span></header>
    <main class="main">${S.auth.mode === 'demo' ? '<div class="demo-note">Demo mode: sample data only (fictional people). Nothing here is saved to the live system.</div>' : ''}${body}</main></div></div>`; afterRender();
}

/* =====================================================================
   LAYER 6 · ACTIONS (event delegation; one handler per data-a)
   ===================================================================== */
const openDlg = html => { const d = $('#dlg'); d.innerHTML = html; if (!d.open) d.showModal(); };
const closeDlg = () => { const d = $('#dlg'); d.style.maxWidth = ''; d.close(); };
const dlgFields = ph => `<textarea id="dnote" rows="2" placeholder="${ph}" style="margin-top:10px"></textarea>`;
const dlgBtns = (keep, ok, label, v = '', cls = 'pri') => `<div class="row" style="margin-top:16px"><button class="btn" data-a="dlg-close">${keep}</button><button class="btn ${cls} sp" data-a="${ok}" data-v="${v}">${label}</button></div>`;
const secErr = (k, m) => document.querySelectorAll('[data-err="' + k + '"]').forEach(el => { el.textContent = m; });   // per-section messages
const authErr = m => document.querySelectorAll('.autherr').forEach(el => { el.textContent = m; });
let applying = false, recovering = false, booking = false;
/** Session → profile (role from the database) → existing dashboards */
async function applySession(session) {
  if (!session || applying) return; applying = true;
  try { console.log('[auth] session present after sign-in:', !!(await API.getSession()));
    const profile = await API.getCurrentProfile();
    if (!profile) { await API.diagnoseAuth(); await API.signOut(); resetSession(); return authErr('Your account was created, but your customer profile could not be loaded. Please contact support.'); }
    console.log('Profile loaded, role:', profile.role);
    loginReal(session.user, profile, profile.role === 'customer' ? await API.getCurrentCustomer() : null);
  } finally { applying = false; }
}
async function initAuth() {            // runs after first render, never blocks the UI
  API.testSupabaseConnection();            // console log only; never blocks session restore
  if (AUTH_URL.error) showLinkError(AUTH_URL.error);
  if (AUTH_URL.recovery) { recovering = true; showRecovery(); }
  API.onAuthStateChange((event, session) => setTimeout(() => {   // setTimeout avoids calling Supabase inside the callback
    if (event === 'PASSWORD_RECOVERY') { recovering = true; showRecovery(); }
    else if (event === 'SIGNED_OUT') { if (S.auth.mode === 'real') resetSession(); }
    else if (event === 'SIGNED_IN' && !recovering && !(S.auth.mode === 'demo' && S.role) && S.auth.user?.id !== session?.user?.id) applySession(session);
    else if (event === 'TOKEN_REFRESHED') console.log('Session refreshed');
  }, 0));
  const s = await API.getSession(); if (s && !recovering) applySession(s);
}
function showLinkError(msg) {
  const nice = /expired|invalid|denied/i.test(msg) ? 'This link has expired or was already used. Please request a new one.' : msg;
  openDlg(`<h3>Link problem</h3><p class="mut sm" style="margin:8px 0 14px">${nice.replace(/</g, '&lt;')}</p><div class="row"><button class="btn pri sp" data-a="dlg-close">Got it</button></div>`);
}
function showRecovery() {
  openDlg(`<h3>Set a new password</h3><p class="mut sm" style="margin:8px 0 14px">Choose a new password for your account.</p>
    <div class="grid" style="gap:10px"><input type="password" id="rp-new" placeholder="New password (8+ characters)" autocomplete="new-password"><input type="password" id="rp-confirm" placeholder="Confirm password" autocomplete="new-password"></div>
    <p class="autherr" style="margin-top:10px"></p><div class="row" style="margin-top:16px"><button class="btn pri sp" data-a="recover-ok">Update password</button></div>`);
}
/* ---- Phase 3G: photo upload + signature pad (all data goes through API.*) ---- */
async function uploadJobPhotos(input) {
  const files = [...input.files]; input.value = ''; if (booking || !files.length) return; booking = true; secErr('photos', '');
  const st = document.querySelector('[data-status="photos"]'); let failed = '';
  for (let i = 0; i < files.length; i++) { if (st) st.textContent = `Uploading ${i + 1} of ${files.length}…`;
    try { await API.uploadJobMedia(S.jobSel, files[i], { category:$('#jm-cat')?.value, caption:$('#jm-cap')?.value }); } catch (e) { failed = e.userMessage || 'We couldn’t upload this photo. Please try again.'; break; } }
  booking = false; await render(); if (failed) secErr('photos', failed);
}
let sig = { c:null, ctx:null, points:0, drawing:false };
const clearPad = () => { const { c, ctx } = sig, r = c.getBoundingClientRect(); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height); sig.points = 0; };
function openSignature(id) {
  openDlg(`<h3>Customer signature</h3><p class="mut sm" style="margin:8px 0 12px">Please sign below to confirm the service has been completed.</p>
    <div class="sm" style="background:var(--bg);border-radius:12px;padding:10px 12px;margin-bottom:12px"><b>${esc(S.jobCache[0]?.service || 'Service')}</b>${(S.jobDoc.notes || []).slice(-3).map(n => `<br><span class="mut">${esc(n.text)}</span>`).join('')}</div>
    <input type="text" id="sig-name" maxlength="100" placeholder="Name of person signing (optional)" aria-label="Name of person signing" style="margin-bottom:10px">
    <label class="sm" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:10px"><input type="checkbox" id="sig-ok" style="width:22px;height:22px;flex:none"><span>The customer has reviewed the service summary above.</span></label>
    <canvas id="sig-pad" aria-label="Signature area" style="width:100%;height:180px;border:1.5px dashed var(--line);border-radius:12px;background:#fff;touch-action:none;display:block"></canvas>
    <p class="secerr" data-err="sig" style="margin-top:8px"></p><div class="row" style="margin-top:14px"><button class="btn" data-a="sig-clear">Clear</button><button class="btn" data-a="dlg-close">Cancel</button><button class="btn pri sp" data-a="sig-save" data-v="${esc(id)}">Save signature</button></div>`);
  $('#dlg').style.maxWidth = '520px';
  const c = $('#sig-pad'), r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; c.width = Math.max(1, r.width * dpr); c.height = Math.max(1, r.height * dpr);
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#13201a'; sig = { c, ctx, points:0, drawing:false }; clearPad();
  const pt = e => { const b = c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };           // pointer events cover mouse, touch and stylus
  c.addEventListener('pointerdown', e => { c.setPointerCapture?.(e.pointerId); sig.drawing = true; const [x, y] = pt(e); ctx.beginPath(); ctx.moveTo(x, y); });
  c.addEventListener('pointermove', e => { if (!sig.drawing) return; const [x, y] = pt(e); ctx.lineTo(x, y); ctx.stroke(); sig.points++; });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => c.addEventListener(t, () => { sig.drawing = false; }));
}
/* ---- Phase 3I: notifications (list is loaded on login/navigation, not polled) ---- */
function setBadge() { const b = $('#notif-badge'); if (!b) return; const n = S.notif.unread; b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n); b.parentElement.setAttribute('aria-label', n ? `Notifications, ${n} unread` : 'Notifications'); }
async function refreshNotifBadge() { try { const l = await API.getNotifications(50); S.notif = { items:l, unread:l.filter(n => !n.read).length }; setBadge(); } catch (e) { console.warn('[notif] badge refresh failed:', e.message); } }
function openRelated(n) {                                  // go to the record a notification is about
  const t = (n.relatedType + ' ' + n.type).toLowerCase(), id = n.relatedId, live_ = S.auth.mode === 'real'; if (!id) return false;
  if (S.role === 'customer') {
    if (/emergency/.test(t)) { S.reqSel = ['emergency', id]; go('request'); return true; }
    if (/callback/.test(t)) { S.reqSel = ['callback', id]; go('request'); return true; }
    if (/appointment|booking|reminder|status|completion|cancel|resched|confirm/.test(t)) { S.sel = id; go('appointment'); return true; }
  }
  if (S.role === 'technician') {
    if (/emergency/.test(t)) { S.jobSel = live_ ? 'em:' + id : id; go('job'); return true; }
    if (/appointment|job|assign|reminder|resched|cancel/.test(t)) { S.jobSel = live_ ? 'job:' + id : id; go('job'); return true; }
  }
  return false;
}
const openWide = html => { openDlg(html); $('#dlg').style.maxWidth = '560px'; };
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
    authErr(''); const r = await API.signUp(e, pw, { full_name:n, phone:ph }); if (!r.ok) return authErr(r.error); if (!r.needsConfirm) { closeDlg(); return applySession(r.session); }
    $('#dlg').innerHTML = '<h3>Check your email</h3><p class="mut sm" style="margin:8px 0 14px">Account created. We sent a link to <b id="su-sent"></b>. Please check your email and confirm your account before signing in.</p><div class="row"><button class="btn pri sp" data-a="dlg-close">Got it</button></div>';
    $('#su-sent').textContent = e; if ($('#c-email')) $('#c-email').value = e; }, drawer: () => { S.drawer = !S.drawer; render(); },
  svc: v => { S.b.service = v; render(); }, step: v => { S.step = +v; render(); },
  date: async v => { S.b.date = v; S.b.hour = null; S.slots = await API.getSlots(v, S.b.tech || 'auto'); render(); },
  tech: async v => { S.b.tech = v; S.b.hour = null; if (S.b.date) S.slots = await API.getSlots(S.b.date, v); render(); },
  slot: v => { S.b.hour = +v; S.b.free = S.slots.find(x => x.hour === +v).free; render(); },
  confirm: async () => {                   // booking and rescheduling share this button; one request at a time
    if (booking) return; booking = true; const btn = $('[data-a="confirm"]'), label = btn?.textContent; if (btn) { btn.disabled = true; btn.textContent = S.b.replaceId ? 'Updating appointment…' : 'Creating appointment…'; }
    S.b.notes = ($('#notes')?.value || '').trim();
    try { const a = S.b.replaceId && S.auth.mode === 'real' ? await API.rescheduleAppointment(S.b.replaceId, S.b) : await API.createAppointment(S.b); S.b.done = a; S.step = 4; render(); }
    catch (e) { if (btn) { btn.disabled = false; btn.textContent = label; } authErr(e.userMessage || 'We couldn’t create your appointment. Please try again.'); }
    finally { booking = false; }
  },
  resched: async v => { S.b = { replaceId:v }; S.step = 1;
    if (S.auth.mode === 'real') { try { const a = await API.checkChangeable(v); S.b = { replaceId:v, replaceRef:a.ref, service:a.service }; S.step = 2; }   // live: same appointment, new time only
      catch (e) { return toast(e.userMessage || 'We couldn’t update your appointment. Please try again.'); } }
    go('book'); },
  forgot: () => openDlg(`<h3>Reset your password</h3><p class="mut sm" style="margin:8px 0 14px">Enter your email and we’ll send a reset link.</p>
    <input type="email" id="fp-email" placeholder="Email" autocomplete="email" value="${($('#c-email')?.value || $('#s-email')?.value || '').replace(/[<>"&]/g, '')}"><p class="autherr" style="margin-top:10px"></p>${dlgBtns('Cancel', 'forgot-ok', 'Send reset link')}`),
  'forgot-ok': async () => { const e = $('#fp-email').value.trim(); if (!/^\S+@\S+\.\S+$/.test(e)) return authErr('Please enter a valid email address.');
    authErr(''); const r = await API.resetPassword(e); if (!r.ok) return authErr(r.error);
    $('#dlg').innerHTML = '<h3>Check your email</h3><p class="mut sm" style="margin:8px 0 14px">If an account exists for <b id="fp-sent"></b>, we sent a password reset link. Open it in this browser.</p><div class="row"><button class="btn pri sp" data-a="dlg-close">Got it</button></div>'; $('#fp-sent').textContent = e; },
  'recover-ok': async () => { const n = $('#rp-new').value, c = $('#rp-confirm').value;
    if (n.length < 8) return authErr('Password must be at least 8 characters.'); if (n !== c) return authErr('The two passwords do not match.');
    authErr(''); const r = await API.updatePassword(n); if (!r.ok) return authErr(r.error);
    recovering = false; await API.signOut(); resetSession();   // end the recovery session so the user signs in with the new password
    $('#dlg').innerHTML = '<h3>Password updated successfully</h3><p class="mut sm" style="margin:8px 0 14px">You can now sign in with your new password.</p><div class="row"><button class="btn pri sp" data-a="dlg-close">Go to sign in</button></div>'; },
  details: v => go('appointment', { sel:v }),
  'dlg-close': closeDlg,
  retry: () => render(),
  notifread: async v => { if (booking) return; booking = true; try { await API.markNotificationRead(v); render(); } catch (e) { toast(e.userMessage || 'We couldn’t update your notifications. Please try again.'); } finally { booking = false; } },
  notifreadall: async () => { if (booking) return; booking = true; try { await API.markAllNotificationsRead(); render(); } catch (e) { toast(e.userMessage || 'We couldn’t update your notifications. Please try again.'); } finally { booking = false; } },
  notifopen: async v => { const n = S.notif.items.find(x => x.id === v); if (!n) return; try { if (!n.read) await API.markNotificationRead(v); } catch (e) { console.warn('[notif] could not mark read:', e.message); }
    n.read = true; S.notif.unread = S.notif.items.filter(x => !x.read).length; if (!openRelated(n)) render(); },
  goreq: () => { closeDlg(); go('requests'); },
  reqdetails: v => { S.reqSel = v.split('|'); go('request'); },
  reqcancel: v => openDlg(`<h3>Cancel this request?</h3><p class="mut sm" style="margin:8px 0 14px">Our team will no longer follow up on it.</p><p class="autherr"></p>${dlgBtns('Keep request', 'reqcancel-ok', 'Cancel request', v, 'red')}`),
  'reqcancel-ok': async v => { if (booking) return; booking = true; const [k, id] = v.split('|'), btn = $('[data-a="reqcancel-ok"]'); if (btn) { btn.disabled = true; btn.textContent = 'Cancelling…'; }
    try { await (k === 'emergency' ? API.cancelEmergency(id) : API.cancelCallback(id)); closeDlg(); toast('Request cancelled.'); render(); }
    catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Cancel request'; } authErr(e.userMessage || 'We couldn’t update your request. Please try again.'); }
    finally { booking = false; } },
  cancel: v => openDlg(`<h3>Cancel appointment?</h3><p class="mut sm" style="margin:8px 0 14px">Are you sure you want to cancel this appointment? You can rebook anytime.</p>
    <select id="dsel"><option value="">Choose a reason</option>${opts(CONFIG.cancelReasons)}</select>${dlgFields('Anything else we should know? (optional)')}<p class="autherr" style="margin-top:10px"></p>${dlgBtns('Keep appointment', 'cancel-ok', 'Cancel appointment', v, 'red')}`),
  'cancel-ok': async v => { if (booking) return; const r = $('#dsel').value; if (!r) return authErr('Please choose a reason.');
    booking = true; const btn = $('[data-a="cancel-ok"]'); if (btn) { btn.disabled = true; btn.textContent = 'Cancelling…'; }
    try { await API.cancelAppointment(v, r, $('#dnote').value.trim()); closeDlg(); toast('Appointment cancelled successfully.'); render(); }
    catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Cancel appointment'; } authErr(e.userMessage || 'We couldn’t update your appointment. Please try again.'); }
    finally { booking = false; } },
  callback: () => openDlg(`<h3>Request a callback</h3><p class="mut sm" style="margin:8px 0 14px">This is not an appointment. Our office will call you back.</p>
    <div class="grid" style="gap:10px"><select id="cb-reason" aria-label="Reason">${opts(CONFIG.callbackReasons)}</select><select id="cb-window" aria-label="When should we call?">${opts(CONFIG.callbackWindows)}</select>
    <input type="tel" id="cb-phone" aria-label="Phone number" placeholder="Phone number" autocomplete="tel" value="${esc(me().phone)}"></div>${dlgFields('What should we know? (optional)')}<p class="autherr" style="margin-top:10px"></p>${dlgBtns('Close', 'callback-ok', 'Request callback')}`),
  'callback-ok': async () => { if (booking) return; booking = true; const btn = $('[data-a="callback-ok"]'); if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try { const r = await API.createCallback({ reason:$('#cb-reason').value, window:$('#cb-window').value, phone:$('#cb-phone').value, note:$('#dnote').value.trim() });
      $('#dlg').innerHTML = '<h3>Callback requested</h3><p class="mut sm" style="margin:8px 0 14px">Reference <b id="cb-ref"></b>. We’ll call <b id="cb-sent"></b> soon. This is not an appointment.</p><div class="row"><button class="btn" data-a="dlg-close">Close</button><button class="btn pri sp" data-a="goreq">View my requests</button></div>';
      $('#cb-ref').textContent = r.ref || r.id; $('#cb-sent').textContent = r.phone || $('#cb-phone')?.value || 'you'; if (S.route === 'requests') render(); }
    catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Request callback'; } authErr(e.userMessage || 'We couldn’t send your request. Please try again.'); }
    finally { booking = false; } },
  jobx: v => openDlg(`<h3>Can’t complete this job?</h3><p class="mut sm" style="margin:8px 0 14px">${S.auth.mode === 'real' ? 'This is saved to the job notes for the office.' : 'The office will be notified to follow up with the customer.'}</p>
    <select id="dsel"><option value="">Choose a reason</option>${opts(CONFIG.jobExceptions)}</select>${dlgFields('Details for the office (optional)')}<p class="autherr" style="margin-top:10px"></p>${dlgBtns('Back', 'jobx-ok', 'Report to office', v, 'red')}`),
  'jobx-ok': async v => { if (booking) return; const r = $('#dsel').value; if (!r) return authErr('Please choose a reason.'); booking = true; const btn = $('[data-a="jobx-ok"]'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try { await API.reportJobException(v, r, $('#dnote').value.trim()); closeDlg(); toast(S.auth.mode === 'real' ? 'Saved to the job notes.' : 'Reported. Office notified.'); render(); }
    catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Report to office'; } authErr(e.userMessage || 'We couldn’t update this job. Please try again.'); }
    finally { booking = false; } },
  etype: v => { S.emg.type = v; render(); }, eloc: () => { S.emg.loc = 'Using current location (mock)'; render(); },
  esend: async () => { if (booking) return; booking = true; const btn = $('[data-a="esend"]'), label = btn?.textContent; if (btn) { btn.disabled = true; btn.textContent = 'Sending request…'; }
    try { S.emg.sent = await API.createEmergency({ type:S.emg.type, description:(S.emg.desc || '').trim(), phone:(S.emg.phone ?? me().phone ?? '').trim(), address:(S.emg.addr ?? knownAddr()).trim() }); render(); }
    catch (e) { if (btn) { btn.disabled = false; btn.textContent = label; } authErr(e.userMessage || 'We couldn’t send your request. Please try again.'); }   // form data is kept
    finally { booking = false; } },
  jobopen: v => { S.jobSel = v; go('job'); },
  jobsign: v => openSignature(v),
  'sig-clear': () => { if (sig.c) { clearPad(); secErr('sig', ''); } },
  'sig-save': async v => { if (booking) return; if (!$('#sig-ok')?.checked) return secErr('sig', 'Please confirm the customer has reviewed the service summary.'); if (!sig.c || sig.points < 12) return secErr('sig', 'Please sign in the box before saving.');
    booking = true; const btn = $('[data-a="sig-save"]'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try { const blob = await new Promise(r => sig.c.toBlob(r, 'image/png')); if (!blob) throw new Error('empty'); await API.saveJobSignature(v, blob, $('#sig-name')?.value); closeDlg(); toast('Signature saved.'); render(); }
    catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Save signature'; } secErr('sig', e.userMessage || 'We couldn’t save the signature. Please try again.'); }   // the drawing is kept for a retry
    finally { booking = false; } },
  jobview: v => { const d = S.jobDoc, pth = d.photos.find(m => String(m.id) === v) || (d.signature && String(d.signature.id) === v ? d.signature : null); if (!pth) return;
    openDlg(`<h3>Job photo</h3><img src="${esc(pth.url)}" alt="Job photo" style="width:100%;border-radius:12px;margin-top:10px"><p class="mut sm" style="margin-top:8px">${esc([pth.type, fmtStamp(pth.at), pth.by].filter(Boolean).join(' · '))}</p>${pth.caption ? `<p style="margin-top:6px">${esc(pth.caption)}</p>` : ''}<p class="secerr" data-err="del"></p>
      <div class="row" style="margin-top:14px"><button class="btn sp" data-a="dlg-close">Close</button>${d.canEdit ? `<button class="btn red" data-a="jobmediadel" data-v="${esc(pth.id)}">Remove</button>` : ''}</div>`); },
  jobmediadel: async v => { const b = $('[data-a="jobmediadel"]'); if (b && b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again to remove'; return; }
    if (booking) return; booking = true; if (b) { b.disabled = true; b.textContent = 'Removing…'; }
    try { await API.deleteJobMedia(S.jobSel, v); closeDlg(); toast('Photo removed.'); render(); }
    catch (e) { if (b) { b.disabled = false; b.dataset.sure = ''; b.textContent = 'Remove'; } secErr('del', e.userMessage || 'We couldn’t remove this photo. Please try again.'); }
    finally { booking = false; } },
  jobdone: v => openDlg(`<h3>Complete this job?</h3><p class="mut sm" style="margin:8px 0 14px">This submits the job as complete. Notes, photos and the signature can’t be changed afterwards.</p><p class="secerr" data-err="completeDlg"></p>${dlgBtns('Not yet', 'jobdone-ok', 'Complete job', v)}`),
  'jobdone-ok': async v => { if (booking) return; booking = true; const btn = $('[data-a="jobdone-ok"]'); if (btn) { btn.disabled = true; btn.textContent = 'Completing…'; }
    try { await API.completeJob(v); closeDlg(); toast('Job completed.'); render(); }
    catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Complete job'; } secErr('completeDlg', e.userMessage || 'We couldn’t complete this job. Please try again.'); }
    finally { booking = false; } },
  job: v => { const x = S.jobCache.find(y => y.id === v), n = x && nextStatus(x);          // confirm before changing a job's status
    openDlg(`<h3>${esc(x ? actionOf(x) : 'Update status')}?</h3><p class="mut sm" style="margin:8px 0 14px">${n ? 'The status will change to <b>' + esc(n) + '</b>. The customer’s appointment will show it too.' : 'Update this job’s status.'}</p><p class="autherr"></p>${dlgBtns('Not yet', 'job-ok', 'Yes, continue', v)}`); },
  'job-ok': async v => { if (booking) return; booking = true; const btn = $('[data-a="job-ok"]'); if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
    try { const j = await API.advanceJob(v); closeDlg(); toast('Status updated: ' + j.status); render(); }
    catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Yes, continue'; } authErr(e.userMessage || 'We couldn’t update this job. Please try again.'); }
    finally { booking = false; } },
  jfclear: () => { S.jobFilter = { q:'', status:'', date:'', when:'all' }; render(); },
  jfwhen: v => { S.jobFilter.when = v; render(); },
  afclear: () => { S.admFilter = { q:'', status:'', tech:'', date:'' }; render(); },
  calprev: () => { const c = S.cal; c.date = c.view === 'month' ? addMonths(c.date, -1) : dAdd(c.date, c.view === 'week' ? -7 : -1); render(); },
  calnext: () => { const c = S.cal; c.date = c.view === 'month' ? addMonths(c.date, 1) : dAdd(c.date, c.view === 'week' ? 7 : 1); render(); },
  caltoday: () => { S.cal.date = today(); render(); },
  calview: v => { S.cal.view = v; render(); },
  calday: v => { S.cal.date = v; S.cal.view = 'day'; if (S.route !== 'calendar') return go('calendar'); render(); },
  apptview: v => { const e = [...S.calEvents, ...S.apptCache].find(x => x.id === v); if (e) openWide(apptDetailHtml(e)); },
  apptedit: async v => { const e = [...S.calEvents, ...S.apptCache].find(x => x.id === v); if (!e) return; try { openWide(apptEditHtml(e, await API.getStaffTechnicians())); } catch (er) { toast(er.userMessage || 'We couldn’t load the technician list. Please try again.'); } },
  apptsave: async v => { if (booking) return; const date = $('#ae-date').value, tm = toMin($('#ae-time').value); if (!date || tm === null) return secErr('ae', 'Please choose a date and a start time.');
    booking = true; const btn = $('[data-a="apptsave"]'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try { await API.updateAppointmentAdmin(v, { date, startMin:tm, techId:$('#ae-tech').value || null }); closeDlg(); toast(S.auth.mode === 'real' ? 'Appointment updated.' : 'Updated (demo data only, not saved).'); render(); }
    catch (er) { if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; } secErr('ae', er.userMessage || 'We couldn’t update this appointment. Please try again.'); }     // nothing changes on screen until the backend confirms
    finally { booking = false; } },
  apptcancel: v => { const e = [...S.calEvents, ...S.apptCache].find(x => x.id === v); if (e) openWide(apptCancelHtml(e)); },
  apptcancelok: async v => { if (booking) return; const r = $('#ac-reason').value; if (!r) return secErr('ac', 'Please choose a reason.'); booking = true; const btn = $('[data-a="apptcancelok"]'); if (btn) { btn.disabled = true; btn.textContent = 'Cancelling…'; }
    try { await API.cancelAppointmentAdmin(v, r, $('#ac-note').value.trim()); closeDlg(); toast('Appointment cancelled.'); render(); }
    catch (er) { if (btn) { btn.disabled = false; btn.textContent = 'Cancel appointment'; } secErr('ac', er.userMessage || 'We couldn’t cancel this appointment. Please try again.'); }
    finally { booking = false; } },
  jobnote: async v => { const text = ($('#jn-text')?.value || '').trim(); if (!text) return authErr('Please write a note first.'); if (booking) return; booking = true;
    const btn = $('[data-a="jobnote"]'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try { await API.addJobNote(v, text); toast('Note saved.'); render(); }
    catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Save note'; } authErr(e.userMessage || 'We couldn’t save your note. Please try again.'); }   // note text is kept
    finally { booking = false; } },
  win: v => { CONFIG.bookingWindowDays = Math.min(14, Math.max(1, CONFIG.bookingWindowDays + +v)); render(); },
  toast: v => toast(v),
  theme: () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
};
document.addEventListener('click', e => { const t = e.target.closest('[data-a]'); if (!t || t.type === 'file') return; e.preventDefault(); ACT[t.dataset.a]?.(t.dataset.v); });
document.addEventListener('change', e => { const t = e.target; if (t.type !== 'file' || !t.files[0]) return; if (t.dataset.a === 'jobphoto') return uploadJobPhotos(t); const url = URL.createObjectURL(t.files[0]);
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
  setBadge(); if (fresh && S.role && S.route !== 'notifications') refreshNotifBadge();
  if (fresh) { $('.main')?.classList.add('anim'); document.querySelectorAll('.kpi b, [data-count]').forEach(countUp); }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.drawer) { S.drawer = false; render(); } });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && /^[cs]-pass$/.test(e.target.id)) ACT.signin(e.target.id[0]); });
document.addEventListener('input', e => { const d = e.target.dataset || {}; if (d.emg) S.emg[d.emg] = e.target.value;
  if (d.cal) { S.cal[d.cal] = e.target.value; render(); }
  if (d.af) { S.admFilter[d.af] = e.target.value; const box = $('#appt-list'); if (box) box.innerHTML = apptRows(); }
  if (d.jf) { S.jobFilter[d.jf] = e.target.value; const box = $('#jobs-list'); if (box) box.innerHTML = jobsListHtml(); } });   // filter the cached list in place   // keeps emergency form text across re-renders
$('#dlg').addEventListener('cancel', e => { if (recovering) e.preventDefault(); });   // recovery dialog can't be dismissed with Esc
render();
initAuth();
