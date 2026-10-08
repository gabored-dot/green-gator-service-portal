/* =====================================================================
   LAYER 2 · API — the ONLY place views get data. Every method is async
   and returns plain objects; swap bodies for supabase.from(...) later.
   ===================================================================== */
const wait = v => new Promise(r => setTimeout(() => r(structuredClone(v)), 140));
const hash = s => { let h = 0; for (const c of String(s)) h = (h*31 + c.charCodeAt(0)) >>> 0; return h; };
const ROLES = ['customer','technician','admin','executive'];
const NOAUTH = { ok:false, error:'Unable to connect to the authentication service.' };
/** Friendly message for customers; raw error stays in the console for debugging */
const authMsg = err => { const m = (err?.message || '').toLowerCase(); console.error('Supabase auth error:', err);
  if (m.includes('invalid login')) return 'Invalid email or password.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Email is already registered.';
  if (m.includes('not confirmed')) return 'Please confirm your email before signing in.';
  if (m.includes('email') && (m.includes('invalid') || m.includes('valid'))) return 'Please enter a valid email address.';
  if (m.includes('password')) return 'Password is too weak. Use at least 8 characters.';
  if (m.includes('fetch') || m.includes('network') || err?.status === 0) return 'Unable to connect to the authentication service.';
  return 'Something went wrong. Please try again.'; };
const API = {
  getConfig: () => wait(CONFIG),

  /* ---------- Auth + profile (Supabase). Everything else is still mock data (Phase 3B+) ---------- */
  async testSupabaseConnection() {
    if (!sb) return false;
    const { error } = await sb.from('services').select('id').limit(1);   // RLS may return 0 rows; only a real failure is an error
    if (error) { console.error('Supabase connection failed:', error.message); return false; }
    console.log('Supabase connected'); return true;
  },
  async getSession() { if (!sb) return null; const { data, error } = await sb.auth.getSession(); if (error) { console.error('getSession failed:', error.message); return null; } return data.session; },
  async getCurrentUser() { return (await API.getSession())?.user || null; },
  async signIn(email, password) {
    if (!sb) return NOAUTH;
    try { const { data, error } = await sb.auth.signInWithPassword({ email, password }); return error ? { ok:false, error:authMsg(error) } : { ok:true, session:data.session }; }
    catch (e) { return { ok:false, error:authMsg(e) }; }
  },
  /** Public signup is always a customer: no role is sent, the database trigger assigns it. */
  async signUp(email, password, profileData = {}) {
    if (!sb) return NOAUTH;
    try { const { data, error } = await sb.auth.signUp({ email, password, options:{ data:{ full_name:profileData.full_name, phone:profileData.phone } } });
      if (error) return { ok:false, error:authMsg(error) };
      if (data.user && data.user.identities && data.user.identities.length === 0) return { ok:false, error:'Email is already registered.' };
      return { ok:true, session:data.session, needsConfirm:!data.session }; }
    catch (e) { return { ok:false, error:authMsg(e) }; }
  },
  async signOut() { if (!sb) return; const { error } = await sb.auth.signOut(); if (error) console.error('signOut failed:', error.message); },
  onAuthStateChange(cb) { return sb ? sb.auth.onAuthStateChange((event, session) => cb(event, session)) : null; },
  /** Role comes from the profiles table, never from local state. Returns null if signed out or no valid profile. */
  async getCurrentProfile() {
    const user = await API.getCurrentUser(); if (!user) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) { console.error('Profile load failed:', error.message); return null; }
    if (!data || !ROLES.includes(data.role)) { console.warn('No valid profile/role for user', user.id); return null; }
    return data;
  },
  getNextAppointment: () => wait(DB.appointments.filter(a => a.status !== 'Completed' && a.status !== 'Cancelled').sort((a,b)=>a.date.localeCompare(b.date))[0] || null),
  getHistory: () => wait(DB.appointments.filter(a => a.status === 'Completed')),
  getAppointments: () => wait(DB.appointments.filter(a => a.status === 'Confirmed').sort((a,b) => a.date.localeCompare(b.date))),
  getAppointment: id => wait(DB.appointments.find(a => a.id === id) || null),
  getJobs: tech => wait(DB.jobs.filter(j => !tech || j.tech === tech)),
  /** pref: 'auto' | tech name. Returns slot states: open | fallback | full */
  getSlots(date, pref) {
    const day = new Date(date + 'T00:00').getDay(), h = CONFIG.hours[day];
    if (!h) return wait([]);
    const out = [];
    for (let hr = h[0]; hr < h[1]; hr++) {
      const free = CONFIG.techs.filter(t => hash(date + hr + t) % 100 >= 40);
      let state = 'full';
      if (free.length) state = (pref === 'auto' || free.includes(pref)) ? 'open' : 'fallback';
      out.push({ hour:hr, state, free });
    }
    return wait(out);
  },
  createAppointment(b) {
    const free = b.free || [];
    const tech = b.tech !== 'auto' && free.includes(b.tech) ? b.tech : (free[0] || 'Mike');
    const appt = { id:'GG-' + (2042 + DB.appointments.length), customerId:'u1', service:b.service, date:b.date, hour:b.hour, tech, status:'Confirmed' };
    if (b.replaceId) DB.appointments = DB.appointments.filter(a => a.id !== b.replaceId);
    DB.appointments.push(appt); return wait(appt);
  },
  cancelAppointment(id, reason, note) { const a = DB.appointments.find(x => x.id === id); if (a) Object.assign(a, { status:'Cancelled', cancelReason: reason + (note ? ' — ' + note : ''), cancelledAt:new Date().toISOString() }); return wait(true); },
  createCallback(c) { const r = { id:'CB-' + (500 + DB.callbacks.length), status:'Open', createdAt:new Date().toISOString(), ...c }; DB.callbacks.push(r); return wait(r); },
  createEmergency(e) { const r = { id:'EM-' + (300 + DB.emergencies.length), eta:'45–90 min', ...e }; DB.emergencies.push(r); return wait(r); },
  /** Moves a job one step along CONFIG.jobStatusFlow (Assigned → En Route → In Progress → Completed) */
  advanceJob(id) { const j = DB.jobs.find(x => x.id === id), f = CONFIG.jobStatusFlow, i = f.indexOf(j?.status); if (j && i > -1 && i < f.length - 1) j.status = f[i + 1]; return wait(j); },
  reportJobException(id, reason, note) { const j = DB.jobs.find(x => x.id === id); if (j) Object.assign(j, { status:'Needs Follow-up', exception: reason + (note ? ' — ' + note : '') }); return wait(j); }
};
