/* =====================================================================
   LAYER 2 · API — the ONLY place views get data. Every method is async
   and returns plain objects; swap bodies for supabase.from(...) later.
   ===================================================================== */
const wait = v => new Promise(r => setTimeout(() => r(structuredClone(v)), 140));
const hash = s => { let h = 0; for (const c of String(s)) h = (h*31 + c.charCodeAt(0)) >>> 0; return h; };
const ROLES = ['customer','technician','admin','executive'];
const NOAUTH = { ok:false, error:'Unable to connect to the authentication service. Please try again.' };
/** Where email links return to: the live GitHub Pages path in production, the current page when testing locally */
const redirectUrl = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? location.href.split(/[?#]/)[0] : CONFIG.supabase.siteUrl;
/** Friendly message for customers; raw error stays in the console for debugging */
const authMsg = err => { const m = (err?.message || '').toLowerCase(); console.error('Supabase auth error:', err?.status, err?.code, err?.message);
  if (m.includes('invalid login')) return 'Incorrect email or password.';
  if (m.includes('not confirmed')) return 'Please check your email and confirm your account before signing in.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Email is already registered.';
  if (m.includes('rate limit') || err?.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('session missing') || m.includes('expired')) return 'This link has expired. Please request a new one.';
  if (m.includes('email') && (m.includes('invalid') || m.includes('valid'))) return 'Please enter a valid email address.';
  if (m.includes('password')) return 'Password is too weak. Use at least 8 characters.';
  if (m.includes('fetch') || m.includes('network') || err?.status === 0) return NOAUTH.error;
  return 'Something went wrong. Please try again.'; };
/* ---------- Live (Supabase) customer data helpers: Phase 3B. Column guesses live ONLY here ---------- */
const live = () => !!sb && typeof S !== 'undefined' && S.auth.mode === 'real';
let _cust = null;                                            // cache: current customer
const STATUS = { requested:'Requested', confirmed:'Confirmed', assigned:'Assigned', en_route:'En Route', in_progress:'In Progress', completed:'Completed', cancelled:'Cancelled', rescheduled:'Rescheduled', no_show:'No show' };
const ACTIVE = ['Requested','Confirmed','Assigned','En Route','In Progress'], PAST = ['Completed','Cancelled','No show'];
const pick = (r, keys) => { for (const k of keys) if (r && r[k] != null && r[k] !== '') return r[k]; return null; };
/** Runs a query; logs the real error for developers and throws a generic one for the UI */
const q = async (query, what) => { const { data, error } = await query; if (error) { console.error(`[db] ${what} failed:`, error.code, error.message); throw new Error(what); } return data; };
const tryQ = async (query, what) => { try { return await q(query, what); } catch (e) { return []; } };   // optional extras: never break the page
const servicesMap = async () => Object.fromEntries((await tryQ(sb.from('services').select('*'), 'services')).map(s => [s.id, pick(s, ['name','title','service_name'])]));
const reportsMap = async () => Object.fromEntries((await tryQ(sb.from('service_reports').select('*'), 'service_reports')).filter(r => r.appointment_id).map(r => [r.appointment_id, {
  summary: pick(r, ['summary','work_performed','notes']) || '—', areas: pick(r, ['areas_treated','areas']) || '—', next: pick(r, ['next_visit','recommendations','follow_up']) || '—' }]));
/** Database row -> the object shape the views already expect */
const toAppt = (r, svcs, reps) => {
  const ts = pick(r, ['scheduled_start','scheduled_at','starts_at','scheduled_for','appointment_start','start_at']), day = pick(r, ['appointment_date','scheduled_date','service_date','date']), tm = pick(r, ['start_time','appointment_time','scheduled_time','time']);
  let w = null;
  if (ts && !isNaN(new Date(ts))) { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:CONFIG.timezone, hourCycle:'h23', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit' }).formatToParts(new Date(ts)).map(x => [x.type, x.value])); w = { day:`${p.year}-${p.month}-${p.day}`, hour:+p.hour }; }
  else if (day) w = { day:String(day).slice(0, 10), hour:parseInt(String(tm || '09:00').slice(0, 2), 10) };
  if (!w) console.warn('[db] appointment without a recognizable date. Columns:', Object.keys(r).join(', '));
  const status = STATUS[r.status] || r.status || 'Requested';
  return { id:r.id, ref:pick(r, ['reference','appointment_number','confirmation_number']) || 'GG-' + String(r.id).slice(0, 6).toUpperCase(),
    service: svcs[r.service_id] || pick(r, ['service_name','service_type']) || 'Service', date: w ? w.day : '', hour: w ? w.hour : 9,
    tech: pick(r, ['technician_name']) || (r.technician_id && status !== 'Requested' ? 'Assigned technician' : 'To be assigned'), status,
    cancelReason: pick(r, ['cancellation_reason','cancel_reason']), completion: reps[r.id] || null };
};
const myAppointments = async () => { const c = await API.getCurrentCustomer(); if (!c?.id) return [];
  const [rows, svcs, reps] = await Promise.all([q(sb.from('appointments').select('*').eq('customer_id', c.id), 'appointments'), servicesMap(), reportsMap()]);
  return rows.map(r => toAppt(r, svcs, reps)); };
const liveUpcoming = async () => (await myAppointments()).filter(x => ACTIVE.includes(x.status) && x.date >= bizDay(0)).sort((x, y) => (x.date + x.hour).localeCompare(y.date + y.hour));
const liveHistory = async () => (await myAppointments()).filter(x => PAST.includes(x.status)).sort((x, y) => y.date.localeCompare(x.date));
/* ---------- Phase 3C: real booking. Validation here is the backstop for the UI. ---------- */
class BookingError extends Error { constructor(m) { super(m); this.userMessage = m; } }
const bad = m => { throw new BookingError(m); };
let _inflight = null;                                      // one booking request at a time
const dayMs = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
function validateBooking(b) {
  if (!CONFIG.services.some(s => s.id === b.service)) bad('Please select a valid service.');
  validateSlot(b);
}
/** Shared by booking and rescheduling: window, business hours, Sunday, not in the past */
/** THE place where booking window + business hours + closed days + past-time rules are applied (customers and admins). Minutes since midnight. */
function validateWindow(date, startMin, endMin, opts = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) bad('That date is outside the available booking window.');
  const diff = Math.round((dayMs(date) - dayMs(bizDay(0))) / 864e5), maxDiff = opts.admin && CONFIG.adminMayExceedBookingWindow ? Infinity : CONFIG.bookingWindowDays;
  if (diff < 0 || diff > maxDiff) bad('That date is outside the available booking window.');
  const h = CONFIG.hours[new Date(date + 'T00:00').getDay()];                    // Sunday = null = closed
  if (!h || !Number.isInteger(startMin) || !Number.isInteger(endMin) || startMin < h[0] * 60 || endMin > h[1] * 60 || endMin <= startMin) bad('That time is outside our available service hours.');
  if (new Date(zonedISO(date, Math.floor(startMin / 60)).replace(/T(\d\d):00:00/, `T$1:${pad2(startMin % 60)}:00`)) <= new Date()) bad('That time has already passed. Please choose a later time.');
}
function validateSlot(b) { validateWindow(b.date, Number.isInteger(b.hour) ? b.hour * 60 : NaN, Number.isInteger(b.hour) ? b.hour * 60 + CONFIG.appointmentMinutes : NaN); }
/** UI service id (general, rodent...) -> real services.id. Matched by slug/code or name; nothing is invented. */
async function resolveServiceId(uiId) {
  const rows = await q(sb.from('services').select('*'), 'services'), ui = CONFIG.services.find(s => s.id === uiId), nm = s => String(pick(s, ['name','title','service_name']) || '').toLowerCase();
  const hit = rows.find(r => String(pick(r, ['slug','code','service_code','key']) || '').toLowerCase() === uiId) || rows.find(r => nm(r) === ui.name.toLowerCase()) || rows.find(r => nm(r).includes(uiId));
  if (!hit) { console.error('[booking] no services row matches', uiId, '. Names in the table:', rows.map(nm).join(' | ')); bad('Please select a valid service.'); }
  return hit.id;
}
/** Preferred technician display name -> technicians.id. Returns null (and never guesses) if it can't be resolved. */
async function resolveTechnician(name) {
  if (!name || name === 'auto') return null;
  const techs = await tryQ(sb.from('technicians').select('*'), 'technicians'), n = name.toLowerCase(), starts = v => String(v || '').toLowerCase().startsWith(n);
  const direct = techs.find(t => starts(pick(t, ['display_name','name','full_name','first_name']))); if (direct) return direct.id;
  const ids = techs.map(t => t.profile_id).filter(Boolean);
  if (ids.length) { const profs = await tryQ(sb.from('profiles').select('id, full_name').in('id', ids), 'technician profiles'), p = profs.find(x => starts(x.full_name)), t = p && techs.find(x => x.profile_id === p.id); if (t) return t.id; }
  console.warn('[booking] could not map preferred technician to a technicians row:', name); return null;
}
const SCHEDULE_VARIANTS = [ s => ({ appointment_date:s.day, start_time:s.startTime, end_time:s.endTime }), s => ({ scheduled_start:s.start, scheduled_end:s.end }), s => ({ scheduled_at:s.start }), s => ({ scheduled_date:s.day, scheduled_time:s.startTime }) ];
const SCHEDULE_KEYS = ['scheduled_start','scheduled_at','appointment_date','scheduled_date'];
const OPTIONAL = ['scheduled_end','end_time','customer_notes','notes','preferred_technician_id','technician_id'], ALT = { customer_notes:'notes', preferred_technician_id:'technician_id' };
/** Inserts, adapting only OPTIONAL columns the table doesn't have (PostgREST PGRST204). Required misses are reported, not hidden. */
async function tryInsert(payload) {
  const p = { ...payload };
  for (let i = 0; i < 8; i++) {
    const { data, error } = await sb.from('appointments').insert(p).select('*').single();
    if (!error) return { data, used:Object.keys(p) };
    const col = error.code === 'PGRST204' ? (error.message.match(/'([a-z_]+)' column/i) || [])[1] : null;
    if (col && col in p && OPTIONAL.includes(col)) { if (ALT[col] && !(ALT[col] in p)) p[ALT[col]] = p[col]; delete p[col]; continue; }
    return { error, missingColumn:col };
  }
  return { error:{ code:'retries', message:'too many column retries' } };
}
function createLiveAppointment(b) {
  if (_inflight) return _inflight;
  _inflight = (async () => { try {
    if (!(await API.getCurrentUser())) bad('Please sign in before booking a service.');
    validateBooking(b);
    const c = await API.getCurrentCustomer(); if (!c?.id) bad('We couldn’t find your customer record. Please contact support.');
    const serviceId = await resolveServiceId(b.service), techId = await resolveTechnician(b.tech);
    const s = { day:b.date, start:zonedISO(b.date, b.hour), end:zonedISO(b.date, b.hour + 1), startTime:pad2(b.hour) + ':00:00', endTime:pad2(b.hour + 1) + ':00:00' };
    const wanted = b.tech && b.tech !== 'auto' ? b.tech : null, note = [b.notes, wanted && !techId ? 'Preferred technician: ' + wanted : ''].filter(Boolean).join('\n');
    const base = { customer_id:c.id, service_id:serviceId, status:'requested' }; if (techId) base.preferred_technician_id = techId; if (note) base.customer_notes = note;
    for (const v of SCHEDULE_VARIANTS) {
      const r = await tryInsert({ ...base, ...v(s) });
      if (r.data) { console.log('[booking] appointment created. Columns sent:', r.used.join(', '));
        const row = r.data, out = toAppt(row, { [row.service_id]:CONFIG.services.find(x => x.id === b.service).name }, {}); out.pref = wanted; return out; }
      if (r.missingColumn && SCHEDULE_KEYS.includes(r.missingColumn)) continue;            // try the next known schedule layout
      const e = r.error;
      if (e.code === '42501') console.error('[booking] RLS blocked INSERT on appointments for this customer. Table: appointments, operation: INSERT. A customer INSERT policy with a customer_id ownership check is required.');
      else if (e.code === '23502') console.error('[booking] a required column is not collected by the UI:', e.message);
      else if (r.missingColumn) console.error('[booking] column not found on appointments:', r.missingColumn);
      else console.error('[booking] insert failed:', e.code, e.message);
      bad('We couldn’t create your appointment. Please try again.');
    }
    console.error('[booking] none of the known schedule column layouts exist on appointments'); bad('We couldn’t create your appointment. Please try again.');
  } catch (e) { if (e instanceof BookingError) throw e; console.error('[booking] failed:', e.message); throw new BookingError('We couldn’t create your appointment. Please try again.'); }
  finally { _inflight = null; } })();
  return _inflight;
}
/* ---------- Phase 3D: cancel / reschedule. Same rows, same validation, no deletes. ---------- */
const CHANGEABLE = ['Requested','Confirmed','Assigned'];
const once = fn => { if (_inflight) return _inflight;
  _inflight = (async () => { try { return await fn(); } catch (e) { if (e instanceof BookingError) throw e; console.error('[appt] failed:', e.message); throw new BookingError('We couldn’t update your appointment. Please try again.'); } finally { _inflight = null; } })();
  return _inflight; };
/** Loads one of THIS customer's appointments and checks it can still be changed (also enforced by RLS in the database) */
async function loadChangeable(id) {
  if (!(await API.getCurrentUser())) bad('Please sign in to manage your appointment.');
  const c = await API.getCurrentCustomer(); if (!c?.id) bad('We couldn’t find your customer record. Please contact support.');
  const { data:row, error } = await sb.from('appointments').select('*').eq('id', id).eq('customer_id', c.id).maybeSingle();
  if (error) { console.error('[appt] lookup failed:', error.code, error.message); bad('We couldn’t update your appointment. Please try again.'); }
  if (!row) bad('We couldn’t find this appointment. Please refresh and try again.');
  const a = toAppt(row, await servicesMap(), {});
  if (a.status === 'Cancelled') bad('This appointment has already been cancelled.');
  if (a.status === 'Completed') bad('Completed appointments cannot be cancelled or rescheduled.');
  if (!CHANGEABLE.includes(a.status) || (a.date && a.date < bizDay(0))) bad('This appointment can no longer be changed online. Please call us at ' + CONFIG.phone + '.');
  return { row, a, c };
}
const OPTIONAL_UPD = ['cancellation_reason','cancel_reason','cancelled_reason','cancelled_at','updated_at','scheduled_end','end_time'], ALT_UPD = { cancellation_reason:'cancel_reason', cancel_reason:'cancelled_reason' };
const slug = s => s.toLowerCase().replace(/[^a-z]+/g, '_');
/** UPDATE limited to this customer's row in its current status. 0 rows back = blocked by RLS or changed meanwhile. Only OPTIONAL columns are adapted. */
async function tryUpdate(id, customerId, fromStatus, payload, reason) {
  const p = { ...payload }; let slugged = false;
  for (let i = 0; i < 10; i++) {
    const { data, error } = await sb.from('appointments').update(p).eq('id', id).eq('customer_id', customerId).eq('status', fromStatus).select('*');
    if (!error) return data.length ? { data:data[0], used:Object.keys(p) } : { none:true };
    const col = error.code === 'PGRST204' ? (error.message.match(/'([a-z_]+)' column/i) || [])[1] : null;
    if (col && col in p && OPTIONAL_UPD.includes(col)) { if (ALT_UPD[col] && !(ALT_UPD[col] in p)) p[ALT_UPD[col]] = p[col]; delete p[col]; continue; }
    const rk = ['cancellation_reason','cancel_reason','cancelled_reason'].find(k => k in p);
    if (error.code === '22P02' && rk && reason && !slugged) { p[rk] = slug(reason); slugged = true; continue; }      // reason column is an enum: use its value form
    return { error, missingColumn:col };
  }
  return { error:{ code:'retries', message:'too many column retries' } };
}
const updateFailed = (r, what) => { const e = r.error || {};
  if (r.none) console.error(`[appt] ${what}: 0 rows updated. Either RLS blocked UPDATE on appointments for this customer, or the appointment changed meanwhile.`);
  else if (e.code === '42501') console.error(`[appt] ${what}: RLS blocked UPDATE. Table: appointments, operation: UPDATE (customer-own rows).`);
  else console.error(`[appt] ${what} failed:`, e.code, e.message, r.missingColumn || '');
  bad('We couldn’t update your appointment. Please try again.'); };
async function cancelLive(id, reason, note) {
  const { row, c } = await loadChangeable(id);
  if (!CONFIG.cancelReasons.includes(reason)) bad('Please choose a cancellation reason.');
  const r = await tryUpdate(id, c.id, row.status, { status:'cancelled', cancellation_reason: note ? reason + ' — ' + note : reason, cancelled_at:new Date().toISOString(), updated_at:new Date().toISOString() }, reason);
  if (!r.data) updateFailed(r, 'cancel');
  if (!r.used.some(k => k.includes('cancel') && k.includes('reason'))) console.warn('[appt] cancelled, but no cancellation-reason column exists on appointments, so the reason was not stored.');
  console.log('[appt] cancelled. Columns written:', r.used.join(', ')); return true;
}
async function rescheduleLive(id, b) {
  const { row, c } = await loadChangeable(id);
  try { validateSlot(b); } catch (e) { if (e instanceof BookingError) bad('That appointment time is not available. Please choose another time.'); throw e; }
  const s = { day:b.date, start:zonedISO(b.date, b.hour), end:zonedISO(b.date, b.hour + 1), startTime:pad2(b.hour) + ':00:00', endTime:pad2(b.hour + 1) + ':00:00' };
  for (const v of SCHEDULE_VARIANTS) {
    const r = await tryUpdate(id, c.id, row.status, { ...v(s), updated_at:new Date().toISOString() });
    if (r.data) { console.log('[appt] rescheduled. Columns written:', r.used.join(', ')); const out = toAppt(r.data, await servicesMap(), {}); out.pref = null; return out; }
    if (r.missingColumn && SCHEDULE_KEYS.includes(r.missingColumn)) continue;
    updateFailed(r, 'reschedule');
  }
  console.error('[appt] none of the known schedule column layouts exist on appointments'); bad('We couldn’t update your appointment. Please try again.');
}
/* ---------- Phase 3E: emergency + callback requests (live = Supabase, demo = mock) ---------- */
const REQ_TABLE = { emergency:'emergency_requests', callback:'callback_requests' };
const titleCase = s => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const digits = s => String(s || '').replace(/\D/g, '');
const toRequest = (kind, r) => ({ id:r.id, kind, ref:(kind === 'emergency' ? 'EM-' : 'CB-') + String(r.id).slice(0, 6).toUpperCase(),
  type: titleCase(pick(r, kind === 'emergency' ? ['emergency_type','request_type','type','category','service_type'] : ['reason','topic','subject'])),
  description: pick(r, ['description','details','notes','message']) || '', status: titleCase(r.status || 'requested'), createdAt: pick(r, ['created_at','requested_at','submitted_at']) || '',
  phone: pick(r, ['contact_phone','phone','callback_phone']) || '', address: pick(r, ['address','service_address','location']) || '',
  window: pick(r, ['preferred_time','preferred_window','callback_window','preferred_callback_time']) || '' });
/** Insert that adapts ONLY to column names that don't exist (chains = alternative names for one value). Required misses are reported. */
async function insertRow(table, payload, chains, requiredChains, onEnum) {
  const p = { ...payload }; let enumTried = false, statusDropped = false;
  for (let i = 0; i < 16; i++) {
    const { data, error } = await sb.from(table).insert(p).select('*').single();
    if (!error) return { data, used:Object.keys(p) };
    const col = error.code === 'PGRST204' ? (error.message.match(/'([a-z_]+)' column/i) || [])[1] : null, ch = col && chains.find(c => c.includes(col));
    if (ch && col in p) { const val = p[col], next = ch[ch.indexOf(col) + 1]; delete p[col]; if (next) { p[next] = val; continue; } if (requiredChains.includes(ch)) return { error, missingColumn:col }; continue; }
    if (['22007','22008'].includes(error.code)) { const w = chains.flat().find(k => k in p && /time|window/.test(k)); if (w) { delete p[w]; continue; } }   // time column is a timestamp: keep the preference in the notes instead
    if (error.code === '22P02') { if (onEnum && !enumTried) { enumTried = true; if (onEnum(p)) continue; } if ('status' in p && !statusDropped) { statusDropped = true; delete p.status; continue; } }
    return { error, missingColumn:col };
  }
  return { error:{ code:'retries', message:'too many column retries' } };
}
async function createRequestLive(kind, v) {
  if (!(await API.getCurrentUser())) bad('Please sign in to send a request.');
  if (digits(v.phone).length < 7) bad('Please enter a phone number we can reach you on.');
  let payload, chains, required, onEnum = null;
  if (kind === 'emergency') {
    if (!v.type) bad('Please choose what is happening.');
    if (!String(v.address || '').trim()) bad('Please enter the address where help is needed.');
    payload = { emergency_type:v.type, contact_phone:v.phone.trim(), address:v.address.trim(), status:'requested' }; if (v.description) payload.description = v.description;
    chains = [['emergency_type','request_type','type','category'], ['description','details','notes','message'], ['contact_phone','phone'], ['address','service_address','location']]; required = [chains[0]];
    onEnum = p => { const k = chains[0].find(x => x in p); if (!k) return false; p[k] = slug(v.type.split(':')[0]); return true; };
  } else {
    if (!CONFIG.callbackReasons.includes(v.reason)) bad('Please choose a reason for the callback.');
    if (!CONFIG.callbackWindows.includes(v.window)) bad('Please choose when we should call.');
    payload = { reason:v.reason, preferred_time:v.window, phone:v.phone.trim(), notes:[v.note, 'Preferred time: ' + v.window].filter(Boolean).join('\n'), status:'requested' };
    chains = [['reason','topic','subject'], ['preferred_time','preferred_window','callback_window','preferred_callback_time'], ['phone','contact_phone','callback_phone'], ['notes','message','description']]; required = [chains[0]];
  }
  const c = await API.getCurrentCustomer(); if (!c?.id) bad('We couldn’t find your customer record. Please contact support.');
  const r = await insertRow(REQ_TABLE[kind], { customer_id:c.id, ...payload }, chains, required, onEnum);
  if (r.data) { console.log(`[request] ${kind} saved. Columns sent:`, r.used.join(', ')); return toRequest(kind, r.data); }
  const e = r.error;
  if (e.code === '42501') console.error(`[request] RLS blocked INSERT on ${REQ_TABLE[kind]}. A customer INSERT policy with a customer_id ownership check is required.`);
  else if (e.code === '23502') console.error('[request] a required column is not collected by the form:', e.message);
  else console.error('[request] insert failed:', e.code, e.message, r.missingColumn || '');
  bad('We couldn’t send your request. Please try again.');
}
const liveRequests = async kind => { const c = await API.getCurrentCustomer(); if (!c?.id) return [];
  return (await q(sb.from(REQ_TABLE[kind]).select('*').eq('customer_id', c.id), kind + ' requests')).map(r => toRequest(kind, r)).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))); };
const liveRequest = async (kind, id) => { const c = await API.getCurrentCustomer(); if (!c?.id) return null;
  const row = await q(sb.from(REQ_TABLE[kind]).select('*').eq('id', id).eq('customer_id', c.id).maybeSingle(), kind + ' request'); return row ? toRequest(kind, row) : null; };
async function cancelRequestLive(kind, id) {
  if (!(await API.getCurrentUser())) bad('Please sign in to manage your request.');
  const c = await API.getCurrentCustomer(); if (!c?.id) bad('We couldn’t find your customer record. Please contact support.');
  const { data:row, error:e0 } = await sb.from(REQ_TABLE[kind]).select('*').eq('id', id).eq('customer_id', c.id).maybeSingle();
  if (e0) { console.error('[request] lookup failed:', e0.code, e0.message); bad('We couldn’t update your request. Please try again.'); }
  if (!row) bad('We couldn’t find this request. Please refresh and try again.');
  if (row.status === 'cancelled') bad('This request has already been cancelled.');
  if (row.status !== 'requested') bad('This request is already being handled. Please call us at ' + CONFIG.phone + '.');
  for (const p of [{ status:'cancelled', updated_at:new Date().toISOString() }, { status:'cancelled' }]) {
    const { data, error } = await sb.from(REQ_TABLE[kind]).update(p).eq('id', id).eq('customer_id', c.id).eq('status', row.status).select('*');
    if (error?.code === 'PGRST204') continue;
    if (error || !data.length) { console.error(`[request] cancel failed on ${REQ_TABLE[kind]}:`, error ? error.code + ' ' + error.message : '0 rows updated (RLS UPDATE policy, or the request changed meanwhile)'); bad('We couldn’t update your request. Please try again.'); }
    return true;
  }
  bad('We couldn’t update your request. Please try again.');
}
const mockFind = (list, id) => list.find(x => x.id === id) || null;
const mockCancel = (list, id) => { const r = mockFind(list, id); if (r) r.status = 'Cancelled'; return wait(true); };
/* ---------- Phase 3F: technician jobs. Every query is filtered by the signed-in technician; RLS is the real wall. ---------- */
let _tech = null;
const splitJobId = id => String(id).startsWith('em:') ? ['emergency', String(id).slice(3)] : ['job', String(id).replace(/^job:/, '')];
const parseLog = s => String(s || '').split('\n').filter(Boolean);
async function customersFor(rows) {
  const ids = [...new Set(rows.map(a => a.customer_id).filter(Boolean))]; if (!ids.length) return {};
  const custs = await tryQ(sb.from('customers').select('*').in('id', ids), 'job customers'), pids = custs.map(c => c.profile_id).filter(Boolean);
  const profs = pids.length ? await tryQ(sb.from('profiles').select('id, full_name, phone').in('id', pids), 'job customer profiles') : [], pBy = Object.fromEntries(profs.map(p => [p.id, p]));
  return Object.fromEntries(custs.map(c => { const p = pBy[c.profile_id] || {};
    return [c.id, { name:pick(p, ['full_name']) || pick(c, ['full_name','name']) || 'Customer', phone:pick(p, ['phone']) || pick(c, ['phone']) || '', addr:[pick(c, ['address','address_line1','street_address','street']), pick(c, ['city']), pick(c, ['state'])].filter(Boolean).join(', ') }]; }));
}
/** The signed-in technician's own jobs + assigned emergencies (optionally just one id). Returns the shape the views already use. */
async function liveJobs(onlyId) {
  const t = await API.getCurrentTechnician(); if (!t) bad('We couldn’t find your technician profile. Please contact the office.');
  const [kind, rawId] = onlyId ? splitJobId(onlyId) : [null, null], out = [];
  if (kind !== 'emergency') {
    const table = 'appointments', viaJobs = false, svcs = await servicesMap();          // verified schema: a job is an appointment with assigned_technician_id = technicians.id
    let qy = sb.from(table).select('*').eq('assigned_technician_id', t.id); if (rawId) qy = qy.eq('id', rawId);
    const rows = await q(qy, 'jobs'), aids = viaJobs ? rows.map(r => r.appointment_id).filter(Boolean) : [];
    const appts = viaJobs ? (aids.length ? await tryQ(sb.from('appointments').select('*').in('id', aids), 'job appointments') : []) : rows;
    const apBy = Object.fromEntries(appts.map(x => [x.id, x])), custBy = await customersFor(appts);
    for (const r of rows) { const ap = viaJobs ? (apBy[r.appointment_id] || {}) : r, ta = ap.id ? toAppt(ap, svcs, {}) : { service:'Service', date:'', hour:9 }, cu = custBy[ap.customer_id] || {};
      const nc = (viaJobs ? ['technician_notes','job_notes','notes'] : ['technician_notes']).find(k => k in r) || null;
      out.push({ id:'job:' + r.id, raw:r.id, table, emergency:false, customerId:ap.customer_id, apptId:viaJobs ? r.appointment_id : r.id, rawStatus:r.status, status:titleCase(r.status || ap.status), name:cu.name || 'Customer', phone:cu.phone || '',
        addr:pick(ap, ['service_address','address']) || cu.addr || 'No address on file', city:'', service:ta.service, date:ta.date, hour:ta.hour, time:ap.id ? (pick(ap, ['start_time']) ? [fmtT(ap.start_time), fmtT(ap.end_time)].filter(Boolean).join(' – ') : fmtH(ta.hour)) : '', adminNotes:pick(ap, ['admin_notes']) || '',
        notes:pick(ap, ['customer_notes']) || '', description:pick(r, ['description','summary']) || '', priority:titleCase(pick(r, ['priority'])), ref:ta.ref || 'JOB-' + String(r.id).slice(0, 6).toUpperCase(),
        createdAt:pick(r, ['created_at']) || '', notesCol:nc, rawNotes:nc ? (r[nc] || '') : '', log:nc ? parseLog(r[nc]) : [] }); }
  }
  if (kind !== 'job') for (const col of ['assigned_technician_id','technician_id']) {
    let qy = sb.from('emergency_requests').select('*').eq(col, t.id); if (rawId) qy = qy.eq('id', rawId);
    const { data, error } = await qy; if (error) { console.warn('[jobs] emergency_requests.' + col + ':', error.code); continue; }
    const custBy = await customersFor(data);
    for (const r of data) { const rq = toRequest('emergency', r), cu = custBy[r.customer_id] || {}, nc = ['technician_notes','internal_notes'].find(k => k in r) || null, done = DONE.includes(rq.status);
      out.push({ id:'em:' + r.id, raw:r.id, table:'emergency_requests', techCol:col, emergency:true, customerId:r.customer_id, rawStatus:r.status, status:rq.status, name:cu.name || 'Customer', phone:rq.phone || cu.phone || '', addr:rq.address || cu.addr || 'No address on file', city:'',
        service:'Emergency · ' + (rq.type || 'Urgent request'), date:done ? String(rq.createdAt).slice(0, 10) : bizDay(0), hour:-1, time:'ASAP', notes:rq.description, description:rq.description, priority:'Emergency', ref:rq.ref,
        createdAt:rq.createdAt, notesCol:nc, rawNotes:nc ? (r[nc] || '') : '', log:nc ? parseLog(r[nc]) : [] }); }
    break;
  }
  return out.sort((x, y) => (x.date + String(x.hour + 1).padStart(2, '0')).localeCompare(y.date + String(y.hour + 1).padStart(2, '0')));
}
/** UPDATE limited to this technician's row (optionally in its current status). 0 rows = blocked by RLS or changed meanwhile. */
async function updateOwned(table, id, ownerCol, ownerId, fromStatus, payload, optional) {
  const p = { ...payload };
  for (let i = 0; i < 8; i++) {
    let qy = sb.from(table).update(p).eq('id', id).eq(ownerCol, ownerId); if (fromStatus) qy = qy.eq('status', fromStatus);
    const { data, error } = await qy.select('*');
    if (!error) return data.length ? { data:data[0] } : { none:true };
    const col = error.code === 'PGRST204' ? (error.message.match(/'([a-z_]+)' column/i) || [])[1] : null;
    if (col && col in p && optional.includes(col)) { delete p[col]; continue; }
    return { error };
  }
  return { error:{ code:'retries' } };
}
const jobFail = (r, what) => { console.error(`[jobs] ${what} failed:`, r.none ? '0 rows updated (RLS UPDATE policy, or the job changed meanwhile)' : (r.error?.code + ' ' + r.error?.message)); bad('We couldn’t update this job. Please try again.'); };
async function advanceLive(id, final) {
  const [j] = await liveJobs(id); if (!j) bad('We couldn’t find this job. Please refresh and try again.');
  if (DONE.includes(j.status)) bad('This job is already finished.');
  const next = nextStatus(j); if (!next) bad('This job can’t move to the next step right now.');
  if (DONE.includes(next) && !final) bad('Please finish this job from its details page.');
  const t = await API.getCurrentTechnician(), now = new Date().toISOString(), patch = { status:slug(next), updated_at:now };
  if (next === 'In Progress') patch.started_at = now; if (DONE.includes(next)) patch[j.emergency ? 'resolved_at' : 'completed_at'] = now;
  const r = await updateOwned(j.table, j.raw, j.emergency ? j.techCol : 'assigned_technician_id', t.id, j.rawStatus, patch, ['updated_at','started_at','completed_at','resolved_at']);
  if (!r.data) jobFail(r, 'status update');
  if (!j.emergency && j.table === 'service_jobs' && j.apptId) {            // keep the customer's appointment status in step (best effort)
    const s = await sb.from('appointments').update({ status:slug(next) }).eq('id', j.apptId).select('id');
    if (s.error || !s.data?.length) console.warn('[jobs] job updated, but the appointment status could not be synced (RLS or schema).'); }
  console.log('[jobs] status ->', slug(next)); return { ...j, status:next };
}
/* ---------- Phase 3G: notes, photos, signature, completion.
   Verified job_media columns: id, job_id, technician_id, media_type, storage_path, file_name, mime_type, file_size, caption, created_at.
   job_notes / job_signatures columns are NOT verified: they are matched by common names and optional ones are dropped.
   Private bucket + signed URLs. Completion goes through a database function, never a direct status update. ---------- */
const PATHS = ['storage_path','signature_path','file_path','path'];
const NOTE_TEXT = ['content','note','body','note_text','text','message'];
const notFound = 'We couldn’t find this job. Please refresh and try again.';
const noJobRecord = 'This job has no job record yet. Please ask the office to start it.';
const checkImage = f => { if (!f) bad('Please choose a photo.');
  if (!CONFIG.media.types.includes(f.type)) bad('Please choose a JPEG or PNG photo.');
  if (f.size > CONFIG.media.maxMB * 1048576) bad(`That photo is too large. The limit is ${CONFIG.media.maxMB} MB.`); };
async function prepareImage(file) {                       // shrink big phone photos before upload (falls back to the original)
  try { if (file.size < 1.5e6) return file; const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .85)); return b && b.size < file.size ? b : file; } catch (e) { return file; } }
let _jobRec = {};
/** The id that job_media / job_notes / job_signatures use as job_id: the service_jobs row of this appointment when there is one, otherwise the appointment id. */
async function jobRecordId(j) {
  if (j.emergency) return j.raw; if (_jobRec[j.raw]) return _jobRec[j.raw];
  const { data, error } = await sb.from('service_jobs').select('id').eq('appointment_id', j.raw).maybeSingle();
  if (error) console.warn('[jobs] service_jobs lookup:', error.code);
  return (_jobRec[j.raw] = data?.id || j.raw);
}
const EM_FK = ['emergency_request_id','emergency_id','request_id'];
const JM = [['job_id'], ['technician_id'], ['media_type'], ['storage_path'], ['file_name'], ['mime_type'], ['file_size'], ['caption']];
async function mediaRows(j, extra) {
  const jid = await jobRecordId(j), table = j.emergency ? 'emergency_media' : 'job_media';
  for (const col of j.emergency ? EM_FK : ['job_id']) { let qy = sb.from(table).select('*').eq(col, jid); if (extra) qy = qy.eq('id', extra); const { data, error } = await qy; if (!error) return { rows:data, table, col, jid }; console.warn(`[media] ${table}.${col}:`, error.code); }
  throw new Error('media rows');
}
async function mediaLive(id) {
  try { const [j] = await liveJobs(id); if (!j) return { photos:[], signature:null, error:false };
    const { rows, jid } = await mediaRows(j), sigRows = j.emergency ? [] : await tryQ(sb.from('job_signatures').select('*').eq('job_id', jid), 'job signatures');
    const all = [...rows.map(r => ({ r, sig:false })), ...sigRows.map(r => ({ r, sig:true }))], paths = all.map(x => pick(x.r, PATHS)).filter(Boolean), t = await API.getCurrentTechnician();
    const signed = paths.length ? ((await sb.storage.from(CONFIG.media.bucket).createSignedUrls(paths, 3600)).data || []) : [], urlBy = Object.fromEntries(signed.filter(s => s.signedUrl).map(s => [s.path, s.signedUrl]));
    const items = all.map(({ r, sig }) => { const path = pick(r, PATHS) || ''; return { id:r.id, path, url:urlBy[path] || '', name:pick(r, ['file_name','filename','name']) || (sig ? 'Signature' : 'Photo'), at:pick(r, ['created_at','signed_at','uploaded_at']) || '',
        by:r.technician_id && r.technician_id === t?.id ? 'You' : 'Staff', caption:pick(r, ['caption']) || '', type:titleCase(pick(r, ['media_type'])), signer:sig ? (pick(r, ['signer_name','customer_name','signed_by']) || '') : '', signature:sig || path.includes('/signature-') }; })
      .filter(m => m.url).sort((x, y) => String(y.at).localeCompare(String(x.at)));
    return { photos:items.filter(m => !m.signature), signature:items.find(m => m.signature) || null, error:false };
  } catch (e) { console.error('[media] load failed:', e.message); return { photos:[], signature:null, error:true }; }
}
async function saveMediaRow(j, jid, t, path, file, blob, category, caption) {
  const user = await API.getCurrentUser(), cat = slug(category || 'other');
  const emChains = [EM_FK, PATHS, ['file_name','filename','name'], ['mime_type','content_type','file_type'], ['file_size','size_bytes','size'], ['uploaded_by','created_by']];
  const tries = j.emergency ? [null] : [cat, 'photo', 'image'];                 // media_type may be a category or a plain kind: try both
  let last;
  for (const mt of tries) {
    const cap = (mt === cat || !category ? caption : ['[' + category + ']', caption].filter(Boolean).join(' ')).slice(0, CONFIG.media.captionMax);
    const payload = j.emergency ? { [EM_FK[0]]:jid, storage_path:path, file_name:file.name || 'photo', mime_type:blob.type, file_size:blob.size, uploaded_by:user.id }
      : { job_id:jid, technician_id:t.id, media_type:mt, storage_path:path, file_name:file.name || 'photo', mime_type:blob.type, file_size:blob.size }; if (cap && !j.emergency) payload.caption = cap;
    last = await insertRow(j.emergency ? 'emergency_media' : 'job_media', payload, j.emergency ? emChains : JM, j.emergency ? [emChains[0], emChains[1]] : [JM[0], JM[3]]);
    if (last.data || last.error?.code !== '22P02') break;
  }
  if (last.data) return { ok:true };
  const e = last.error || {}; console.error('[media] saving metadata failed:', e.code, e.message, e.code === '42501' ? '(RLS INSERT policy on job_media?)' : e.code === '23503' ? '(job_id does not match a job record: no service_jobs row for this appointment?)' : e.code === '22P02' || e.code === '23502' ? '(media_type value rejected or missing: check its allowed values)' : '');
  return { ok:false, msg:e.code === '23503' ? noJobRecord : 'We couldn’t save this photo. Please try again.' };
}
async function saveSignatureRow(j, jid, t, path, name) {
  const chains = [['job_id'], ['technician_id'], ['storage_path','signature_path','file_path'], ['signer_name','customer_name','signed_by'], ['mime_type','content_type']], nm = String(name || '').trim().slice(0, 100);
  const ex = await tryQ(sb.from('job_signatures').select('*').eq('job_id', jid), 'job signatures');
  if (ex.length) {                                                                   // one signature per job: replace the existing record
    const pcol = ['storage_path','signature_path','file_path'].find(k => k in ex[0]), ncol = ['signer_name','customer_name','signed_by'].find(k => k in ex[0]); if (!pcol) { console.error('[media] job_signatures has no storage path column'); return { ok:false, msg:'We couldn’t save the signature. Please try again.' }; }
    const old = pick(ex[0], PATHS), patch = { [pcol]:path }; if (ncol && nm) patch[ncol] = nm;
    const { data, error } = await sb.from('job_signatures').update(patch).eq('id', ex[0].id).eq('job_id', jid).select('id');
    if (error || !data?.length) { console.error('[media] signature replace failed:', error ? error.code + ' ' + error.message : '0 rows (RLS UPDATE policy on job_signatures?)'); return { ok:false, msg:'We couldn’t save the signature. Please try again.' }; }
    if (old && old !== path) await sb.storage.from(CONFIG.media.bucket).remove([old]); return { ok:true };
  }
  const payload = { job_id:jid, technician_id:t.id, storage_path:path, mime_type:'image/png' }; if (nm) payload.signer_name = nm;
  const r = await insertRow('job_signatures', payload, chains, [chains[0], chains[2]]);
  if (r.data) return { ok:true };
  const e = r.error || {}; console.error('[media] saving signature failed:', e.code, e.message, e.code === '42501' ? '(RLS INSERT policy on job_signatures?)' : e.code === '23503' ? '(job_id does not match a job record)' : '');
  return { ok:false, msg:e.code === '23503' ? noJobRecord : 'We couldn’t save the signature. Please try again.' };
}
/** opts: { signature, name } for signatures, { category, caption } for photos */
async function uploadLive(id, file, opts = {}) {
  const [j] = await liveJobs(id); if (!j) bad(notFound);
  if (DONE.includes(j.status)) bad('This job is already complete, so files can no longer be added.');
  if (j.emergency && opts.signature) bad('Signatures aren’t available for emergency requests yet.');
  if (!opts.signature) checkImage(file);
  const t = await API.getCurrentTechnician(), jid = await jobRecordId(j), blob = opts.signature ? file : await prepareImage(file), ext = blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `${jid}/${opts.signature ? 'signature-' : ''}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`, bucket = sb.storage.from(CONFIG.media.bucket);   // first folder = job id: storage policies check it
  const up = await bucket.upload(path, blob, { contentType:blob.type, upsert:false });
  if (up.error) { console.error('[media] storage upload failed:', up.error.statusCode || '', up.error.message); bad(/not found/i.test(up.error.message) ? 'Photo upload isn’t set up yet. Please contact the office.' : /mime|type/i.test(up.error.message) ? 'That file type isn’t allowed.' : 'We couldn’t upload this file. Please try again.'); }
  const res = opts.signature ? await saveSignatureRow(j, jid, t, path, opts.name) : await saveMediaRow(j, jid, t, path, file, blob, opts.category, String(opts.caption || '').trim());
  if (!res.ok) { await bucket.remove([path]); bad(res.msg); }            // no orphan file, and no row exists, so a retry cannot create duplicates
  console.log(`[media] ${opts.signature ? 'signature' : 'photo'} saved`); return true;
}
async function deleteLive(id, mediaId) {
  const [j] = await liveJobs(id); if (!j) bad(notFound);
  if (DONE.includes(j.status)) bad('This job is complete, so photos can no longer be removed.');
  const { rows, table, col, jid } = await mediaRows(j, mediaId), row = rows[0]; if (!row) bad('We couldn’t find this photo.');
  const { data, error } = await sb.from(table).delete().eq('id', mediaId).eq(col, jid).select('id');
  if (error || !data?.length) { console.error('[media] delete failed:', error ? error.code + ' ' + error.message : '0 rows (RLS DELETE policy?)'); bad('We couldn’t remove this photo. Please try again.'); }
  const rm = await sb.storage.from(CONFIG.media.bucket).remove([pick(row, PATHS)]); if (rm.error) console.warn('[media] row removed, file cleanup failed:', rm.error.message); return true;
}
async function notesLive(id) {
  const [j] = await liveJobs(id); if (!j) return [];
  if (j.emergency) return (j.log || []).map((tx, i) => ({ id:i, text:tx, by:'', at:'' }));
  const jid = await jobRecordId(j), t = await API.getCurrentTechnician(), me_ = (await API.getCurrentUser())?.id, rows = await q(sb.from('job_notes').select('*').eq('job_id', jid), 'job notes');
  return rows.map(r => ({ id:r.id, text:pick(r, NOTE_TEXT) || '', at:pick(r, ['created_at']) || '', by:[me_, t?.id].includes(pick(r, ['author_id','created_by','profile_id','user_id','technician_id'])) ? 'You' : 'Staff' })).sort((x, y) => String(x.at).localeCompare(String(y.at)));
}
async function addNoteLive(id, text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim(); if (!clean) bad('Please write a note first.'); if (clean.length > CONFIG.noteMax) bad(`Please keep notes under ${CONFIG.noteMax} characters.`);
  const [j] = await liveJobs(id); if (!j) bad(notFound);
  if (DONE.includes(j.status)) bad('This job is complete, so notes can no longer be added.');
  const t = await API.getCurrentTechnician();
  if (j.emergency) {                                                                // emergencies keep notes on the request row
    if (!j.notesCol) { console.error('[jobs] no technician notes column on emergency_requests'); bad('Notes aren’t available for this job yet.'); }
    const line = `[${fmtStamp(new Date().toISOString())}] ${clean}`, r = await updateOwned(j.table, j.raw, j.techCol, t.id, null, { [j.notesCol]:j.rawNotes ? j.rawNotes + '\n' + line : line }, []);
    if (!r.data) jobFail(r, 'add note'); return true;
  }
  const user = await API.getCurrentUser(), jid = await jobRecordId(j), chains = [['job_id'], NOTE_TEXT, ['author_id','created_by','profile_id','user_id'], ['technician_id']];
  for (const author of [user.id, t.id]) {                                           // author column may point at profiles or at technicians
    const r = await insertRow('job_notes', { job_id:jid, content:clean, author_id:author, technician_id:t.id }, chains, [chains[0], chains[1]]);
    if (r.data) { console.log('[jobs] note saved'); return true; }
    const e = r.error || {}; if (e.code === '23503' && author === user.id) continue;
    console.error('[jobs] saving note failed:', e.code, e.message, e.code === '42501' ? '(RLS INSERT policy on job_notes?)' : e.code === '23503' ? '(job_id does not match a job record)' : ''); bad(e.code === '23503' ? noJobRecord : 'We couldn’t save your note. Please try again.');
  }
  bad('We couldn’t save your note. Please try again.');
}
async function completeLive(id) {
  const [j] = await liveJobs(id); if (!j) bad(notFound);
  if (DONE.includes(j.status)) bad('This job is already finished.');
  if (!DONE.includes(nextStatus(j))) bad('Start the job before completing it.');
  const m = await mediaLive(id); if (m.error) bad('We couldn’t check the photos right now. Please try again.');
  const chk = completionCheck(j, m.photos, m.signature, await notesLive(id)); if (!chk.ok) bad(needMsg(chk));
  if (j.emergency) return advanceLive(id, true);
  const { error } = await sb.rpc('complete_job_for_appointment', { p_appointment_id:j.raw });          // the database re-checks owner, status, notes and signature
  if (error) { const msg = [error.message, error.details, error.hint].join(' ');
    if (/notes_required/.test(msg)) bad('Please add a work note before completing.'); if (/signature_required/.test(msg)) bad('Please capture the customer’s signature before completing.');
    if (/invalid_status/.test(msg)) bad('Start the job before completing it.'); if (/not_authorized|job_not_found/.test(msg)) bad(notFound);
    if (['PGRST202','42883'].includes(error.code)) { console.error('[jobs] complete_job_for_appointment is not installed. Run phase-3g-migration.sql.'); bad('Job completion isn’t enabled yet. Please contact the office.'); }
    console.error('[jobs] completion failed:', error.code, error.message); bad('We couldn’t complete this job. Please try again.'); }
  console.log('[jobs] completed via complete_job_for_appointment'); return { ...j, status:'Completed' };
}
const blobToDataURL = b => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
/* ---------- Phase 3I: notifications + audit log. READ side only: rows are created by database triggers, never by the browser. ---------- */
const NOTIF_USER = ['user_id','recipient_id','profile_id'];
let _nCol = null;
const toNotif = r => ({ id:r.id, title:pick(r, ['title','subject']) || 'Notification', message:pick(r, ['message','body','content']) || '', type:String(pick(r, ['type','notification_type','category']) || ''),
  relatedType:String(pick(r, ['related_type','entity_type','reference_type']) || '').toLowerCase(), relatedId:pick(r, ['related_id','entity_id','reference_id','appointment_id']) || null, link:pick(r, ['link','url','action_url']) || '',
  readCol:'is_read' in r ? 'is_read' : 'read_at' in r ? 'read_at' : 'read' in r ? 'read' : null,
  read:'is_read' in r ? !!r.is_read : 'read_at' in r ? !!r.read_at : 'read' in r ? !!r.read : false, createdAt:pick(r, ['created_at']) || '' });
async function liveNotifs(limit) {
  const user = await API.getCurrentUser(); if (!user) return [];
  for (const col of _nCol ? [_nCol] : NOTIF_USER) {                                    // recipient column is detected; RLS also limits rows to the signed-in user
    const { data, error } = await sb.from('notifications').select('*').eq(col, user.id);
    if (error) { console.warn(`[notif] notifications.${col}:`, error.code, error.message); continue; }
    _nCol = col; return data.map(toNotif).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))).slice(0, limit);
  }
  throw new Error('notifications');
}
async function markReadLive(ids) {
  const user = await API.getCurrentUser(), items = (await liveNotifs(200)).filter(n => ids.includes(n.id) && !n.read); if (!items.length) return true;
  const rc = items[0].readCol, patch = rc === 'is_read' ? { is_read:true } : rc === 'read_at' ? { read_at:new Date().toISOString() } : rc === 'read' ? { read:true } : null;
  if (!patch) { console.error('[notif] no read-status column on notifications'); bad('We couldn’t update your notifications. Please try again.'); }
  const { data, error } = await sb.from('notifications').update(patch).in('id', items.map(n => n.id)).eq(_nCol, user.id).select('id');
  if (error || !data?.length) { console.error('[notif] mark read failed:', error ? error.code + ' ' + error.message : '0 rows (RLS UPDATE policy?)'); bad('We couldn’t update your notifications. Please try again.'); }
  return true;
}
const mockNotifs = () => DB.notifications.filter(n => n.role === S.role).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
const toAudit = r => { const sum = pick(r, ['summary','description','details']), nw = pick(r, ['new_values','new_data']), actor = pick(r, ['actor_id','user_id','performed_by']);
  return { id:r.id, action:titleCase(pick(r, ['action','event','action_type'])), entity:titleCase(pick(r, ['entity_type','table_name','record_type'])), entityId:String(pick(r, ['entity_id','record_id']) || '').slice(0, 8),
    actor:actor ? String(actor).slice(0, 8) : 'System', summary:typeof sum === 'string' ? sum : (nw ? JSON.stringify(nw).slice(0, 140) : ''), createdAt:pick(r, ['created_at']) || '' }; };
/* ---------- Staff scheduling (admin / executive). RLS decides what is visible and editable; this layer adds the business rules. ---------- */
const STAFF = ['admin','executive'], CLOSED_LABELS = ['Completed','Cancelled','No Show','Rescheduled'];
let _ctx = null;
const toMin = t => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const hhmm = min => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
async function requireStaff(edit) {
  const p = await API.getCurrentProfile(); if (!p || !STAFF.includes(p.role)) bad('You don’t have access to this page.');
  if (edit && !(p.role === 'admin' || (p.role === 'executive' && CONFIG.executiveCanEdit))) bad('Your role can view this but not change it.'); return p;
}
async function staffContext() {
  if (_ctx && Date.now() - _ctx.at < 60000) return _ctx;
  const [techs, svcs] = await Promise.all([tryQ(sb.from('technicians').select('*'), 'technicians'), servicesMap()]), pids = techs.map(x => x.profile_id).filter(Boolean);
  const profs = pids.length ? await tryQ(sb.from('profiles').select('id, full_name').in('id', pids), 'technician profiles') : [], pBy = Object.fromEntries(profs.map(p => [p.id, p.full_name]));
  const list = techs.map(x => ({ id:x.id, name:pBy[x.profile_id] || pick(x, ['display_name','name','full_name']) || 'Technician ' + String(x.id).slice(0, 4) }));
  return (_ctx = { at:Date.now(), techs:list, techBy:Object.fromEntries(list.map(x => [x.id, x.name])), svcs });
}
const toEvent = (r, ctx, custBy) => { const a = toAppt(r, ctx.svcs, {}), s = toMin(r.start_time) ?? a.hour * 60, e = toMin(r.end_time) ?? s + CONFIG.appointmentMinutes, cu = custBy[r.customer_id] || {}, tn = ctx.techBy[r.assigned_technician_id];
  return { id:r.id, ref:a.ref, date:a.date, startMin:s, endMin:e, status:titleCase(r.status), rawStatus:r.status, service:a.service, serviceDesc:svcDesc(a.service), customerId:r.customer_id,
    customer:{ name:cu.name || 'Customer', phone:cu.phone || '', addr:pick(r, ['service_address','address']) || cu.addr || '' }, techId:r.assigned_technician_id || null, tech:tn || (r.assigned_technician_id ? 'Technician' : 'Unassigned'),
    notes:pick(r, ['customer_notes']) || '', adminNotes:pick(r, ['admin_notes']) || '', demo:false }; };
const demoToEvent = d => ({ id:d.id, ref:d.ref, date:iso(addDays(d.off)), startMin:d.startMin, endMin:d.endMin, status:d.status, rawStatus:slug(d.status), service:d.service, serviceDesc:svcDesc(d.service), customerId:null,
  customer:{ name:d.name, phone:d.phone, addr:d.addr }, techId:d.tech ? 'demo-' + d.tech : null, tech:d.tech || 'Unassigned', notes:d.notes || '', adminNotes:'', demo:true });
const evSort = (x, y) => (x.date + String(x.startMin).padStart(4, '0')).localeCompare(y.date + String(y.startMin).padStart(4, '0'));
const findConflict = (events, techId, date, s, e, exceptId) => events.find(x => x.id !== exceptId && x.techId === techId && x.date === date && !CLOSED_LABELS.includes(x.status) && s < x.endMin && x.startMin < e);
const conflictMsg = c => `That technician already has an appointment from ${fmtMin(c.startMin)} to ${fmtMin(c.endMin)} that day.`;
async function staffAppointments(from, to) {
  await requireStaff(); const ctx = await staffContext(); let qy = sb.from('appointments').select('*'); if (from) qy = qy.gte('appointment_date', from); if (to) qy = qy.lte('appointment_date', to);
  const rows = await q(qy, 'appointments'), custBy = await customersFor(rows); return rows.map(r => toEvent(r, ctx, custBy)).sort(evSort);
}
async function updateRow(table, id, patch, optional) {                 // plain UPDATE by id; only OPTIONAL columns are adapted
  const p = { ...patch };
  for (let i = 0; i < 8; i++) { const { data, error } = await sb.from(table).update(p).eq('id', id).select('*'); if (!error) return data.length ? { data:data[0] } : { none:true };
    const col = error.code === 'PGRST204' ? (error.message.match(/'([a-z_]+)' column/i) || [])[1] : null; if (col && col in p && optional.includes(col)) { delete p[col]; continue; } return { error }; }
  return { error:{ code:'retries' } };
}
async function adminUpdateLive(id, ch) {
  await requireStaff(true); const ctx = await staffContext();
  const { data:row, error } = await sb.from('appointments').select('*').eq('id', id).maybeSingle();
  if (error) { console.error('[admin] lookup failed:', error.code, error.message); bad('We couldn’t update this appointment. Please try again.'); }
  if (!row) bad('We couldn’t find this appointment. Please refresh and try again.');
  const cur = toEvent(row, ctx, {}); if (CLOSED_LABELS.includes(cur.status)) bad('This appointment is closed and can’t be edited.');
  const date = ch.date ?? cur.date, s = ch.startMin ?? cur.startMin, e = s + (cur.endMin - cur.startMin), techId = ch.techId === undefined ? cur.techId : (ch.techId || null);
  validateWindow(date, s, e, { admin:true });
  if (techId) { const others = await q(sb.from('appointments').select('*').eq('assigned_technician_id', techId).eq('appointment_date', date), 'technician schedule'), c = findConflict(others.map(r => toEvent(r, ctx, {})), techId, date, s, e, id); if (c) bad(conflictMsg(c)); }
  const patch = { updated_at:new Date().toISOString() };
  if (date !== cur.date) patch.appointment_date = date; if (s !== cur.startMin) { patch.start_time = hhmm(s) + ':00'; patch.end_time = hhmm(e) + ':00'; }
  if (techId !== cur.techId) { patch.assigned_technician_id = techId; if (techId && ['requested','confirmed'].includes(String(row.status))) patch.status = 'assigned'; }
  if (Object.keys(patch).length === 1) bad('Nothing was changed.');
  const r = await updateRow('appointments', id, patch, ['updated_at']);
  if (!r.data) { const m = [r.error?.message, r.error?.details].join(' '); if (/technician_conflict/.test(m)) bad('That technician already has an appointment that overlaps this time.');
    console.error('[admin] update failed:', r.none ? '0 rows (RLS UPDATE policy for admins on appointments?)' : r.error?.code + ' ' + r.error?.message); bad('We couldn’t update this appointment. Please try again.'); }
  _ctx = null; return toEvent(r.data, await staffContext(), {});
}
async function adminCancelLive(id, reason, note) {
  await requireStaff(true);
  const { data:row, error } = await sb.from('appointments').select('*').eq('id', id).maybeSingle(); if (error || !row) bad('We couldn’t find this appointment. Please refresh and try again.');
  const st = titleCase(row.status); if (CLOSED_LABELS.includes(st)) bad('This appointment is already closed.');
  if (!CONFIG.cancelReasons.includes(reason)) bad('Please choose a cancellation reason.');
  const r = await tryUpdate(id, row.customer_id, row.status, { status:'cancelled', cancellation_reason:note ? reason + ' — ' + note : reason, cancelled_at:new Date().toISOString(), updated_at:new Date().toISOString() }, reason);
  if (!r.data) updateFailed(r, 'admin cancel'); _ctx = null; return true;
}
function demoEdit(id, ch) {
  const d = DB.demoAppointments.find(x => x.id === id); if (!d) bad('We couldn’t find this appointment.'); const ev = demoToEvent(d); if (CLOSED_LABELS.includes(ev.status)) bad('This appointment is closed and can’t be edited.');
  const date = ch.date ?? ev.date, s = ch.startMin ?? ev.startMin, e = s + (ev.endMin - ev.startMin), techId = ch.techId === undefined ? ev.techId : (ch.techId || null);
  validateWindow(date, s, e, { admin:true }); if (techId) { const c = findConflict(DB.demoAppointments.map(demoToEvent), techId, date, s, e, id); if (c) bad(conflictMsg(c)); }
  d.off = Math.round((dayMs(date) - dayMs(iso(addDays(0)))) / 864e5); d.startMin = s; d.endMin = e; if (techId !== ev.techId) { d.tech = techId ? techId.replace('demo-', '') : null; if (techId && ['Requested','Confirmed'].includes(d.status)) d.status = 'Assigned'; }
  return demoToEvent(d);
}
/** Real numbers only: a metric that can't be read is null ("Not available"), never 0. */
function computeStats(events, techs, em, cb) {
  const t = today(), wk = dAdd(t, 7), open = x => !CLOSED_LABELS.includes(x.status), byStatus = {}; events.forEach(x => { byStatus[x.status] = (byStatus[x.status] || 0) + 1; });
  const done = byStatus['Completed'] || 0, closedOut = done + (byStatus['Cancelled'] || 0) + (byStatus['No Show'] || 0);
  const live_ = (list, doneSet) => list === null ? null : list.filter(r => !doneSet.includes(String(r.status || '').toLowerCase().replace(/ /g, '_'))).length;
  return { total:events.length, today:events.filter(x => x.date === t && x.status !== 'Cancelled'), thisWeek:events.filter(x => x.date >= t && x.date <= wk && open(x)).length, unassigned:events.filter(x => !x.techId && open(x) && x.date >= t), byStatus, completed:done,
    cancelled:byStatus['Cancelled'] || 0, completionRate:closedOut ? Math.round(done / closedOut * 100) : null, openEmergencies:live_(em, ['resolved','cancelled','completed']), openCallbacks:live_(cb, ['completed','cancelled','contacted']),
    workload:techs.map(x => ({ name:x.name, today:events.filter(e => e.techId === x.id && e.date === t && open(e)).length, next7:events.filter(e => e.techId === x.id && e.date >= t && e.date <= wk && open(e)).length })) };
}
async function liveStats() {
  await requireStaff(); const ctx = await staffContext(), rows = await q(sb.from('appointments').select('*'), 'appointments'), custBy = await customersFor(rows);
  const safe = async qy => { const { data, error } = await qy; return error ? null : data; };
  return computeStats(rows.map(r => toEvent(r, ctx, custBy)), ctx.techs, await safe(sb.from('emergency_requests').select('*')), await safe(sb.from('callback_requests').select('*')));
}
const API = {
  getConfig: () => wait(CONFIG),

  /* ---------- Auth + profile (Supabase). Everything else is still mock data (Phase 3B+) ---------- */
  async testSupabaseConnection() {
    if (!sb) return false;
    try { const { error } = await sb.from('services').select('id').limit(1);   // RLS may return 0 rows; only a real failure is an error
      if (error) { console.error('Supabase connection failed:', error.message); return false; }
      console.log('Supabase connected'); return true; }
    catch (e) { console.error('Supabase connection failed:', e.message); return false; }
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
    try { const { data, error } = await sb.auth.signUp({ email, password, options:{ data:{ full_name:profileData.full_name, phone:profileData.phone }, emailRedirectTo:redirectUrl() } });
      if (error) return { ok:false, error:authMsg(error) };
      console.log('signUp: user created, session', data.session ? 'returned' : 'NOT returned (email confirmation required)');
      if (data.user && data.user.identities && data.user.identities.length === 0) return { ok:false, error:'Email is already registered.' };
      return { ok:true, session:data.session, needsConfirm:!data.session }; }
    catch (e) { return { ok:false, error:authMsg(e) }; }
  },
  async resetPassword(email) {
    if (!sb) return NOAUTH;
    try { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo:redirectUrl() }); return error ? { ok:false, error:authMsg(error) } : { ok:true }; }
    catch (e) { return { ok:false, error:authMsg(e) }; }
  },
  async updatePassword(password) {
    if (!sb) return NOAUTH;
    try { const { error } = await sb.auth.updateUser({ password }); return error ? { ok:false, error:authMsg(error) } : { ok:true }; }
    catch (e) { return { ok:false, error:authMsg(e) }; }
  },
  /** Run API.diagnoseAuth() in the browser console to see exactly which auth stage fails. Never prints tokens. */
  async diagnoseAuth() {
    const r = { clientConfigured:!!sb }; if (!sb) { console.table(r); return r; }
    const { data:{ session } } = await sb.auth.getSession(); r.sessionPresent = !!session;
    if (session) { r.userId = session.user.id; r.emailConfirmed = !!session.user.email_confirmed_at;
      const { data, error } = await sb.from('profiles').select('id, role').eq('id', session.user.id).maybeSingle();
      r.profileRow = !!data; r.role = data?.role || null; r.profileError = error ? error.code + ' ' + error.message : null; }
    console.table(r); return r;
  },
  /** Customer record for the signed-in user. RLS decides what is visible; the customers link column is detected, not assumed. */
  async getCurrentCustomer() {
    const user = await API.getCurrentUser(); if (!user) return null;
    if (_cust?.userId === user.id) return _cust.value;
    let row = null;
    for (const col of ['profile_id','user_id','id']) {
      const { data, error } = await sb.from('customers').select('*').eq(col, user.id).maybeSingle();
      if (error) { console.warn(`[db] customers.${col} lookup:`, error.code, error.message); continue; }
      if (data) { row = data; console.log('[db] customer found via customers.' + col); break; }
    }
    if (!row) console.warn('[db] no customers row visible for this user');
    const profile = await API.getCurrentProfile();
    const addr = [pick(row, ['address','address_line1','street_address','street']), pick(row, ['city']), pick(row, ['state'])].filter(Boolean).join(', ');
    const value = { id: row?.id || null, name: pick(profile, ['full_name','name']) || pick(row, ['full_name','name']) || (user.email || 'Customer').split('@')[0],
      phone: pick(profile, ['phone']) || pick(row, ['phone']) || '', addr: addr || 'No address on file', plan: pick(row, ['plan','plan_name']) || 'Green Gator customer' };
    _cust = { userId:user.id, value }; return value;
  },
  /** Run API.diagnoseData() in the console: shows which tables/columns the signed-in customer can read. Names only, no values. */
  async diagnoseData() {
    const out = { customerId:(await API.getCurrentCustomer())?.id || null };
    for (const t of ['customers','appointments','services','service_reports']) { const { data, error } = await sb.from(t).select('*').limit(1);
      out[t] = error ? 'ERROR ' + error.code + ' ' + error.message : data[0] ? 'columns: ' + Object.keys(data[0]).join(', ') : 'readable, 0 rows visible'; }
    console.table(out); return out;
  },
  /** Technician record for the signed-in user (null for anyone else). */
  async getCurrentTechnician() {
    const user = await API.getCurrentUser(); if (!user) return null;
    if (_tech?.userId === user.id) return _tech.value;
    if ((await API.getCurrentProfile())?.role !== 'technician') { console.warn('[db] signed-in user is not a technician'); return null; }   // role comes from the profiles table
    let row = null;
    for (const col of ['profile_id','user_id','id']) {
      const { data, error } = await sb.from('technicians').select('*').eq(col, user.id).maybeSingle();
      if (error) { console.warn(`[db] technicians.${col} lookup:`, error.code, error.message); continue; }
      if (data) { row = data; console.log('[db] technician found via technicians.' + col); break; }
    }
    if (!row) { console.warn('[db] no technicians row visible for this user'); return null; }
    const value = { id:row.id }; _tech = { userId:user.id, value }; return value;
  },
  getTechnicianJobs: () => live() ? liveJobs() : wait(DB.jobs.filter(j => j.tech === DB.users.technician.name.split(' ')[0])),
  getTechnicianJob: id => live() ? liveJobs(id).then(l => l[0] || null) : wait(DB.jobs.find(j => j.id === id) || null),
  addJobNote(id, text) { if (live()) return once(() => addNoteLive(id, text));
    const j = DB.jobs.find(x => x.id === id), clean = String(text || '').replace(/\s+/g, ' ').trim(); if (!j || !clean) return Promise.reject(new BookingError(clean ? 'We couldn’t find this job.' : 'Please write a note first.'));
    (j.log = j.log || []).push(`[${fmtStamp(new Date().toISOString())}] ${clean}`); return wait(true); },
  getStaffAppointments: async (from, to) => live() ? staffAppointments(from, to) : DB.demoAppointments.map(demoToEvent).filter(e => (!from || e.date >= from) && (!to || e.date <= to)).sort(evSort),
  getStaffTechnicians: async () => live() ? (await requireStaff(), (await staffContext()).techs) : CONFIG.techs.map(n => ({ id:'demo-' + n, name:n })),
  updateAppointmentAdmin: async (id, ch) => live() ? once(() => adminUpdateLive(id, ch)) : demoEdit(id, ch),
  cancelAppointmentAdmin: async (id, reason, note) => { if (live()) return once(() => adminCancelLive(id, reason, note)); const d = DB.demoAppointments.find(x => x.id === id); if (!d || CLOSED_LABELS.includes(d.status)) bad('This appointment is already closed.'); if (!CONFIG.cancelReasons.includes(reason)) bad('Please choose a cancellation reason.'); d.status = 'Cancelled'; return true; },
  getBusinessStats: async () => live() ? liveStats() : computeStats(DB.demoAppointments.map(demoToEvent), CONFIG.techs.map(n => ({ id:'demo-' + n, name:n })), DB.emergencies, DB.callbacks),
  getNotifications: (limit = 50) => live() ? liveNotifs(limit) : wait(mockNotifs()),
  async markNotificationRead(id) { if (live()) return once(() => markReadLive([id])); const n = DB.notifications.find(x => x.id === id); if (n) n.read = true; return wait(true); },
  async markAllNotificationsRead() { if (live()) return once(async () => markReadLive((await liveNotifs(200)).filter(n => !n.read).map(n => n.id))); mockNotifs().forEach(n => { n.read = true; }); return wait(true); },
  /** Admin/executive only: RLS returns nothing to anyone else. */
  getAuditLog: async (limit = 100) => live() ? (await q(sb.from('audit_logs').select('*'), 'audit log')).map(toAudit).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))).slice(0, limit) : wait(DB.audit),
  getJobNotes: id => live() ? notesLive(id) : wait((DB.jobs.find(x => x.id === id)?.log || []).map((tx, i) => ({ id:i, text:tx, by:'You', at:'' }))),
  getJobMedia: id => live() ? mediaLive(id) : wait({ photos:DB.jobMedia.filter(m => m.jobId === id).reverse(), signature:DB.jobSignatures[id] || null, error:false }),
  async uploadJobMedia(id, file, opts = {}) { if (live()) return once(() => uploadLive(id, file, opts)); checkImage(file);
    const j = DB.jobs.find(x => x.id === id); if (!j) bad(notFound); if (DONE.includes(j.status)) bad('This job is already complete, so files can no longer be added.');
    DB.jobMedia.push({ id:'m' + (DB.jobMedia.length + 1), jobId:id, url:URL.createObjectURL(file), name:file.name, at:new Date().toISOString(), by:'You', caption:opts.caption || '', type:opts.category || '' }); return true; },
  async saveJobSignature(id, blob, name) { if (live()) return once(() => uploadLive(id, blob, { signature:true, name }));
    const j = DB.jobs.find(x => x.id === id); if (!j) bad(notFound); if (DONE.includes(j.status)) bad('This job is already complete, so files can no longer be added.');
    DB.jobSignatures[id] = { id:'sig-' + id, url:await blobToDataURL(blob), at:new Date().toISOString(), by:'You', signer:String(name || '').trim() }; return true; },
  async deleteJobMedia(id, mediaId) { if (live()) return once(() => deleteLive(id, mediaId));
    const j = DB.jobs.find(x => x.id === id); if (j && DONE.includes(j.status)) bad('This job is complete, so photos can no longer be removed.'); DB.jobMedia = DB.jobMedia.filter(m => !(m.id === mediaId && m.jobId === id)); return true; },
  async completeJob(id) { if (live()) return once(() => completeLive(id));
    const j = DB.jobs.find(x => x.id === id); if (!j) bad(notFound); if (DONE.includes(j.status)) bad('This job is already finished.'); if (!DONE.includes(nextStatus(j))) bad('Start the job before completing it.');
    const chk = completionCheck(j, DB.jobMedia.filter(m => m.jobId === id), DB.jobSignatures[id] || null, j.log || []); if (!chk.ok) bad(needMsg(chk)); j.status = nextStatus(j); return j; },
  async signOut() { _cust = null; _tech = null; _jobRec = {}; _nCol = null; _ctx = null; if (!sb) return; const { error } = await sb.auth.signOut(); if (error) console.error('signOut failed:', error.message); },
  onAuthStateChange(cb) { return sb ? sb.auth.onAuthStateChange((event, session) => cb(event, session)) : null; },
  /** Role comes from the profiles table, never from local state. Returns null if signed out or no valid profile. */
  async getCurrentProfile() {
    const user = await API.getCurrentUser(); if (!user) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) { console.error('Profile load failed:', error.code, error.message, '(check the profiles SELECT policy for authenticated users)'); return null; }
    if (!data || !ROLES.includes(data.role)) { console.warn('No profile row (or unknown role) for auth user', user.id, '. Check Table Editor > profiles.'); return null; }
    return data;
  },
  getNextAppointment: () => live() ? liveUpcoming().then(l => l[0] || null) : wait(DB.appointments.filter(a => a.status !== 'Completed' && a.status !== 'Cancelled').sort((a,b)=>a.date.localeCompare(b.date))[0] || null),
  getHistory: () => live() ? liveHistory() : wait(DB.appointments.filter(a => a.status === 'Completed')),
  getAppointments: () => live() ? liveUpcoming() : wait(DB.appointments.filter(a => a.status === 'Confirmed').sort((a,b) => a.date.localeCompare(b.date))),
  getAppointment: id => live() ? myAppointments().then(l => l.find(x => x.id === id) || null) : wait(DB.appointments.find(a => a.id === id) || null),
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
  createAppointment(b) { if (live()) return createLiveAppointment(b);
    const free = b.free || [];
    const tech = b.tech !== 'auto' && free.includes(b.tech) ? b.tech : (free[0] || 'Mike');
    const appt = { id:'GG-' + (2042 + DB.appointments.length), customerId:'u1', service:b.service, date:b.date, hour:b.hour, tech, status:'Confirmed' };
    if (b.replaceId) DB.appointments = DB.appointments.filter(a => a.id !== b.replaceId);
    DB.appointments.push(appt); return wait(appt);
  },
  rescheduleAppointment: (id, b) => once(() => rescheduleLive(id, b)),
  async checkChangeable(id) { try { return (await loadChangeable(id)).a; } catch (e) { if (e instanceof BookingError) throw e; console.error('[appt] check failed:', e.message); throw new BookingError('We couldn’t update your appointment. Please try again.'); } },
  cancelAppointment(id, reason, note) { if (live()) return once(() => cancelLive(id, reason, note)); const a = DB.appointments.find(x => x.id === id); if (a) Object.assign(a, { status:'Cancelled', cancelReason: reason + (note ? ' — ' + note : ''), cancelledAt:new Date().toISOString() }); return wait(true); },
  createEmergency(e) { if (live()) return once(() => createRequestLive('emergency', e));
    const id = 'EM-' + (300 + DB.emergencies.length), r = { id, ref:id, kind:'emergency', status:'Requested', createdAt:new Date().toISOString(), eta:'45–90 min', type:e.type, description:e.description || '', phone:e.phone || '', address:e.address || '' }; DB.emergencies.push(r); return wait(r); },
  createCallback(c) { if (live()) return once(() => createRequestLive('callback', c));
    const id = 'CB-' + (500 + DB.callbacks.length), r = { id, ref:id, kind:'callback', status:'Requested', createdAt:new Date().toISOString(), type:c.reason, description:c.note || '', phone:c.phone || '', window:c.window || '' }; DB.callbacks.push(r); return wait(r); },
  getEmergencies: () => live() ? liveRequests('emergency') : wait(DB.emergencies),
  getCallbacks: () => live() ? liveRequests('callback') : wait(DB.callbacks),
  getEmergency: id => live() ? liveRequest('emergency', id) : wait(mockFind(DB.emergencies, id)),
  getCallback: id => live() ? liveRequest('callback', id) : wait(mockFind(DB.callbacks, id)),
  cancelEmergency: id => live() ? once(() => cancelRequestLive('emergency', id)) : mockCancel(DB.emergencies, id),
  cancelCallback: id => live() ? once(() => cancelRequestLive('callback', id)) : mockCancel(DB.callbacks, id),
  /** Moves a job one step along CONFIG.jobStatusFlow (Assigned → En Route → In Progress → Completed) */
  advanceJob(id) { if (live()) return once(() => advanceLive(id));
    const j = DB.jobs.find(x => x.id === id), n = j && nextStatus(j); if (n && DONE.includes(n)) return Promise.reject(new BookingError('Please finish this job from its details page.')); if (n) j.status = n; return wait(j); },
  reportJobException(id, reason, note) { if (live()) return once(async () => { await addNoteLive(id, 'Could not complete: ' + reason + (note ? ' — ' + note : '')); return true; }); const j = DB.jobs.find(x => x.id === id); if (j) Object.assign(j, { status:'Needs Follow-up', exception: reason + (note ? ' — ' + note : '') }); return wait(j); }
};
