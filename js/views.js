/* =====================================================================
   LAYER 4 · VIEWS (pure functions → HTML strings)
   ===================================================================== */
const V = {};

V.landing = () => `<div class="land">
  <div class="row"><div class="brand sp"><span class="logo">GG</span>Green Gator Pest Solutions</div><button class="btn ghost" data-a="theme" aria-label="Toggle theme">◐</button></div>
  <div class="hero"><h1>Your home, pest-free. Your schedule, in your hands.</h1>
    <p class="mut">Book a visit, track your technician and see every treatment, all in one place. Serving Utah’s Wasatch Front.</p><div class="stats"><div><b data-count>99.9%</b><span class="mut sm">pest-free success</span></div><div><b data-count>1,000+</b><span class="mut sm">five-star reviews</span></div><div><b data-count>10+</b><span class="mut sm">years serving Utah</span></div></div></div>
  <div class="grid g2">
    <div class="card grid"><div><h2>Customer login</h2><p class="mut sm">Manage appointments and service history.</p></div>
      <input type="email" id="c-email" placeholder="Email" aria-label="Email" autocomplete="email"><input type="password" id="c-pass" placeholder="Password" aria-label="Password" autocomplete="current-password">
      <p class="autherr"></p><button class="btn pri" data-a="signin" data-v="c">Sign in</button><button class="btn ghost" data-a="signup">Create customer account</button><button class="btn ghost" data-a="forgot">Forgot password?</button></div>
    <div class="card grid"><div><h2>Staff login</h2><p class="mut sm">Technicians, office admins and leadership.</p></div>
      <input type="email" id="s-email" placeholder="Work email" aria-label="Work email" autocomplete="email"><input type="password" id="s-pass" placeholder="Password" aria-label="Password" autocomplete="current-password">
      <p class="autherr"></p><button class="btn" data-a="signin" data-v="s">Sign in as staff</button><button class="btn ghost" data-a="forgot">Forgot password?</button></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="row"><div class="sp"><h3>Demo login</h3><p class="mut sm">Shortcuts for testing. Not real authentication and not connected to Supabase.</p></div>
    <button class="btn" data-a="login" data-v="customer">Customer</button><button class="btn" data-a="login" data-v="technician">Technician</button>
    <button class="btn" data-a="login" data-v="admin">Admin</button><button class="btn" data-a="login" data-v="executive">Executive</button></div></div>
  <p class="mut sm" style="margin-top:20px">1368 West 130 South, Orem, UT · ${CONFIG.phone} · Mon–Fri 9–5, Sat 8–2</p></div>`;

V.dashboard = async () => {
  const [a, u] = [await API.getNextAppointment(), me()];
  const next = a ? `<div class="card"><div class="row"><h2 class="sp">Next appointment</h2>${pill(a.status)}</div>
    <h1 style="margin:14px 0 4px">${fmtD(a.date,{weekday:'long',month:'long',day:'numeric'})}</h1><p class="mut">${fmtH(a.hour)} arrival window · in ${Math.round((new Date(a.date+'T00:00')-addDays(0))/864e5)} days</p>
    <div class="dl" style="margin:18px 0"><div><small>Service</small><b>${svc(a.service)}</b></div><div><small>Technician</small><b>${a.tech}</b></div><div><small>Address</small><b>${u.addr}</b></div><div><small>Reference</small><b>${a.ref || a.id}</b></div></div>
    <div class="row"><button class="btn pri" data-a="resched" data-v="${a.id}">Reschedule</button><button class="btn" data-a="details" data-v="${a.id}">View details</button><button class="btn ghost" data-a="cancel" data-v="${a.id}">Cancel</button></div></div>`
    : `<div class="card"><h2>No upcoming visits</h2><p class="mut" style="margin:6px 0 14px">Book your next treatment in under a minute.</p><button class="btn pri" data-a="nav" data-v="book">Book service</button></div>`;
  return `<div><h1>${greet()}, ${u.name.split(' ')[0]}</h1><p class="mut">${u.plan}</p></div>${next}
  <div class="grid g2"><button class="card sel" data-a="nav" data-v="book"><b>Book a service</b><span class="mut sm">Pick a service, time and technician.</span></button>
  <button class="card sel" style="border-color:var(--red)" data-a="nav" data-v="emergency"><b style="color:var(--red)">Urgent pest problem?</b><span class="mut sm">Wasps, rodents or swarms: skip the booking queue.</span></button><button class="card sel" data-a="callback"><b>Prefer a call?</b><span class="mut sm">Request a callback from our office.</span></button></div>`;
};

V.history = async () => { const h = await API.getHistory();
  return `<h1>Service history</h1><div class="card scroll"><table><tr><th>Date</th><th>Service</th><th>Tech</th><th>Status</th><th></th></tr>${h.map(x => `<tr><td>${fmtD(x.date,{month:'short',day:'numeric',year:'numeric'})}</td><td>${svc(x.service)}</td><td>${x.tech}</td><td>${pill(x.status)}</td><td><button class="btn" data-a="details" data-v="${x.id}">Details</button></td></tr>`).join('')}</table></div>`; };

/* ---------- Booking flow (3 steps + success) ---------- */
V.book = async () => {
  const b = S.b, N = CONFIG.bookingWindowDays;
  const bar = `<div class="steps">${[1,2,3].map(i => `<i class="${S.step >= i ? 'on' : ''}"></i>`).join('')}</div>`;
  const head = t => `<p class="mut sm">Step ${S.step} of 3${b.replaceId ? ' · Rescheduling ' + (b.replaceRef || b.replaceId) : ''}</p><h1>${t}</h1>`;
  if (S.step === 1) return `${bar}${head('What do you need help with?')}
    <div class="grid g2">${CONFIG.services.map(s => `<button class="sel ${b.service === s.id ? 'on' : ''}" data-a="svc" data-v="${s.id}"><b>${s.name}</b><span class="mut sm">${s.desc}</span><span class="sm" style="color:var(--g);font-weight:600">${s.price}</span></button>`).join('')}</div>
    <button class="btn pri lg" ${b.service ? '' : 'disabled'} data-a="step" data-v="2">Continue</button>`;
  if (S.step === 2) {
    const days = Array.from({ length:N + 3 }, (_, i) => i + 1);
    const slots = b.date ? S.slots : [];
    return `${bar}${head('Pick a day and time')}
    <div class="banner">Online booking opens up to ${N} days ahead. Need help sooner? Use <a href="#" data-a="nav" data-v="emergency" style="color:inherit;font-weight:700">emergency help</a>.</div>
    <div class="row" style="flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px">${days.map(i => { const s = bizDay(i), d = new Date(s + 'T00:00'), closed = !CONFIG.hours[d.getDay()], locked = i > N;
      return `<button class="day ${b.date === s ? 'on' : ''}" ${locked || closed ? 'disabled' : ''} data-a="date" data-v="${s}"><small>${d.toLocaleDateString('en-US',{weekday:'short'})}</small><br><b>${d.getDate()}</b><br><small>${closed ? 'Closed' : locked ? 'Locked' : d.toLocaleDateString('en-US',{month:'short'})}</small></button>`; }).join('')}</div>
    <div class="card" ${b.replaceId && S.auth.mode === 'real' ? 'hidden' : ''}><h3>Technician preference <span class="mut sm" style="font-weight:400">(optional)</span></h3>
      <div class="row" style="margin-top:10px">${['auto', ...CONFIG.techs].map(t => `<button class="chip ${(b.tech || 'auto') === t ? 'on' : ''}" data-a="tech" data-v="${t}">${t === 'auto' ? 'Auto-assign' : t}</button>`).join('')}</div>
      <p class="mut sm" style="margin-top:10px">If your choice is booked, dashed times will be auto-assigned to the next available technician.</p></div>
    <div class="card"><h3 style="margin-bottom:12px">${b.date ? 'Times for ' + fmtD(b.date) : 'Select a day to see times'}</h3>
      <div class="grid g3">${slots.map(x => `<button class="slot ${x.state === 'fallback' ? 'fb' : ''} ${b.hour === x.hour ? 'on' : ''}" ${x.state === 'full' ? 'disabled' : ''} data-a="slot" data-v="${x.hour}">${fmtH(x.hour)}<small>${x.state === 'full' ? 'Unavailable' : x.state === 'fallback' ? 'Auto-assign' : 'Available'}</small></button>`).join('')}</div></div>
    <div class="row">${b.replaceId && S.auth.mode === 'real' ? `<button class="btn" data-a="details" data-v="${b.replaceId}">Back</button>` : '<button class="btn" data-a="step" data-v="1">Back</button>'}<button class="btn pri sp" ${b.hour ? '' : 'disabled'} data-a="step" data-v="3">Review booking</button></div>`;
  }
  if (S.step === 3) { const tech = S.auth.mode === 'real' ? (b.replaceId ? 'Unchanged' : b.tech && b.tech !== 'auto' ? b.tech + ' (preferred)' : 'No preference') : (b.tech !== 'auto' && b.free?.includes(b.tech) ? b.tech : 'Auto-assigned');
    return `${bar}${head('Review and confirm')}
    <div class="card"><div class="dl"><div><small>Service</small><b>${svc(b.service)}</b></div><div><small>Date</small><b>${fmtD(b.date,{weekday:'long',month:'long',day:'numeric'})}</b></div><div><small>Arrival window</small><b>${fmtH(b.hour)}</b></div><div><small>Technician</small><b>${tech}</b></div><div><small>Customer</small><b>${me().name}</b></div><div><small>Address</small><b>${me().addr}</b></div></div>
    <label class="sm mut" style="display:block;margin:18px 0 6px">Notes for your technician (optional)</label><textarea rows="2" id="notes" placeholder="Gate code, pets, where you saw activity"></textarea></div>
    <p class="autherr"></p><div class="row"><button class="btn" data-a="step" data-v="2">Edit</button><button class="btn pri sp" data-a="confirm">${b.replaceId ? 'Confirm new time' : 'Confirm booking'}</button></div>`; }
  const a = b.done; return `<div class="card" style="text-align:center;padding:40px 20px;max-width:560px;margin:0 auto"><div class="logo okmark" style="margin:0 auto 16px;width:56px;height:56px;border-radius:50%;background:var(--gs);color:var(--g);font-size:26px">✓</div>
    <h1>${b.replaceId ? 'Appointment rescheduled successfully' : 'You’re booked'}</h1><p class="mut" style="margin:8px 0 20px">Confirmation ${a.ref || a.id}. ${a.status === 'Requested' ? 'We’ll confirm your technician and arrival window shortly.' : 'We’ll text you when ' + a.tech + ' is on the way.'}</p>
    <div class="dl" style="text-align:left;background:var(--bg);border-radius:12px;padding:16px"><div><small>Service</small><b>${svc(a.service)}</b></div><div><small>When</small><b>${fmtD(a.date)} · ${fmtH(a.hour)}</b></div><div><small>Technician</small><b>${a.pref ? a.pref + ' (preferred)' : a.tech}</b></div></div>
    <button class="btn pri lg" style="margin-top:20px" data-a="nav" data-v="dashboard">Back to dashboard</button></div>`;
};

/* ---------- Emergency breakout channel ---------- */
V.emergency = () => {
  const e = S.emg, types = ['Stinging insects: active nest or swarm','Rodent inside living space','Infestation affecting a child, pet or health condition','Something else urgent'];
  if (e.sent) return `<div class="card emg" style="max-width:600px;margin:0 auto"><span class="pill red">Request ${e.sent.ref || e.sent.id}</span><h1 style="margin:12px 0 6px">Help is being arranged</h1>
    <p class="mut">${e.sent.eta ? 'Our emergency team will call you within 10 minutes. Estimated arrival: <b>' + e.sent.eta + '</b>.' : 'Our emergency team has been notified and will contact you shortly.'}</p>
    <div class="row" style="margin-top:18px"><a class="btn red" style="display:grid;place-items:center;text-decoration:none" href="tel:3854809747">Call ${CONFIG.phone}</a><button class="btn" data-a="nav" data-v="requests">View my requests</button><button class="btn" data-a="nav" data-v="dashboard">Done</button></div></div>`;
  return `<div class="card emg grid"><div><span class="pill red">Emergency channel</span><h1 style="margin-top:10px">Urgent pest help</h1><p class="mut">Separate from standard booking. Same-day dispatch, priority rates apply.</p></div>
    <a class="btn red lg" style="display:grid;place-items:center;text-decoration:none" href="tel:3854809747">Call now · ${CONFIG.phone}</a>
    <h3>Or tell us what’s happening</h3>
    ${types.map(t => `<button class="sel ${e.type === t ? 'on' : ''}" data-a="etype" data-v="${t}"><b>${t}</b></button>`).join('')}
    <textarea data-emg="desc" rows="2" placeholder="Describe what you’re seeing (optional)" aria-label="Description">${esc(e.desc)}</textarea>
    <div class="grid g2"><input type="tel" data-emg="phone" aria-label="Phone number" placeholder="Phone number" autocomplete="tel" value="${esc(e.phone ?? me().phone)}"><input type="text" data-emg="addr" aria-label="Address where help is needed" placeholder="Address where help is needed" autocomplete="street-address" value="${esc(e.addr ?? knownAddr())}"></div>
    ${S.auth.mode === 'real' ? '' : `<div class="grid g2"><label class="photo" id="eph" style="${e.photo ? `background-image:url(${e.photo});color:transparent` : ''}">Add photo<input type="file" accept="image/*" capture="environment" hidden data-a="ephoto"></label>
    <button class="sel ${e.loc ? 'on' : ''}" data-a="eloc"><b>${e.loc ? 'Location shared ✓' : 'Share my location'}</b><span class="mut sm">${e.loc || me().addr}</span></button></div>`}
    <p class="autherr"></p>
    <button class="btn red lg" ${e.type ? '' : 'disabled'} data-a="esend">Request emergency dispatch</button></div>`;
};

/* ---------- Technician (mobile-first) ---------- */
const linkBtn = 'class="btn sp" style="display:grid;place-items:center;text-decoration:none"';
/** Reusable job card (customer + emergency jobs). act=true shows the next-status button and the "can't complete" button */
const jobCard = (x, act, inDetails) => { const flow = flowOf(x), i = flow.indexOf(x.status), next = actionOf(x), final = DONE.includes(nextStatus(x)), where = [x.addr, x.city].filter(Boolean).join(', '), desc = x.serviceDesc || svcDesc(x.service);
  return `<div class="card${x.emergency ? ' emg' : ''}"><div class="row"><div class="sp"><b>${esc(x.name)}</b><p class="mut sm">${esc(x.ref || '')}</p></div>${x.emergency ? '<span class="pill red">Emergency</span>' : ''}${pill(x.status)}</div>
  <div class="steps" style="margin:12px 0 0">${flow.map((_, n) => `<i class="${n <= i ? 'on' : ''}"></i>`).join('')}</div>
  <h4 class="eyebrow">Customer</h4><div class="dl"><div><small>Phone</small><b>${x.phone ? `<a href="${tel(x.phone)}">${esc(x.phone)}</a>` : 'Not on file'}</b></div><div><small>Service address</small><b>${esc(where || 'Not on file')}</b></div></div>
  <h4 class="eyebrow">Appointment</h4><div class="dl"><div><small>Date</small><b>${esc(x.date ? fmtD(x.date) : 'Not scheduled')}</b></div><div><small>Time</small><b>${esc(x.time || 'Not set')}</b></div><div><small>Technician</small><b>${esc(x.tech || techName())}</b></div></div>
  <h4 class="eyebrow">Service</h4><div class="dl"><div><small>Service</small><b>${esc(x.service)}</b></div>${desc ? `<div><small>What it covers</small><b>${esc(desc)}</b></div>` : ''}${x.notes ? `<div><small>Customer notes</small><b>${esc(x.notes)}</b></div>` : ''}${x.adminNotes ? `<div><small>Office instructions</small><b>${esc(x.adminNotes)}</b></div>` : ''}${x.exception ? `<div><small>Follow-up reason</small><b>${esc(x.exception)}</b></div>` : ''}</div>
  <div class="row" style="margin-top:14px">${x.phone ? `<a ${linkBtn} href="${tel(x.phone)}">Call customer</a>` : ''}<a ${linkBtn} target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent(where)}">Directions</a><button class="btn sp" data-a="jobopen" data-v="${esc(x.id)}">Details</button></div>
  ${act && next ? `${final && inDetails ? '' : `<button class="btn pri lg" style="margin-top:12px" data-a="${final ? 'jobopen' : 'job'}" data-v="${esc(x.id)}">${final ? 'Review & complete' : next}</button>`}<button class="btn lg" style="margin-top:8px" data-a="jobx" data-v="${esc(x.id)}">Can’t complete this job</button>` : ''}</div>`; };
const jobList = (list, act, empty) => list.map(x => jobCard(x, act)).join('') || `<div class="card"><p class="mut">${empty}</p></div>`;
const isOpen = x => !CLOSED.includes(x.status);
V.techdash = async () => { const j = S.jobCache = await API.getTechnicianJobs(), t = today(), todays = j.filter(x => x.date === t);
  const kpi = [['Today', todays.filter(isOpen).length], ['In progress', j.filter(x => x.status === 'In Progress').length], ['Upcoming', j.filter(x => x.date > t && isOpen(x)).length], ['Done today', todays.filter(x => !isOpen(x)).length]];
  return `<div><h1>${greet()}, ${esc(techName().split(' ')[0])}</h1><p class="mut">Here’s what needs your attention today.</p></div>
  <div class="grid g3">${kpi.map(k => `<div class="card kpi"><span class="mut sm">${k[0]}</span><b>${k[1]}</b></div>`).join('')}</div>
  <h2>Emergency jobs</h2>${jobList(j.filter(x => x.emergency && isOpen(x)), true, 'No emergency jobs assigned.')}
  <h2>Today’s jobs</h2>${jobList(todays.filter(x => !x.emergency), true, 'No jobs assigned for today.')}`; };
/** Search + status + date filters over the cached list (re-rendered on typing without losing focus) */
const WHEN = { today:(x, t) => x.date === t, upcoming:(x, t) => x.date > t && isOpen(x), progress:x => ['In Progress','En Route'].includes(x.status), done:x => DONE.includes(x.status) };
const jobsListHtml = () => { const f = S.jobFilter, q = f.q.trim().toLowerCase(), t = today(); let j = S.jobCache.slice();
  if (f.status) j = j.filter(x => x.status === f.status); if (f.date) j = j.filter(x => x.date === f.date); if (f.when !== 'all') j = j.filter(x => WHEN[f.when](x, t));
  if (q) j = j.filter(x => [x.ref, x.name, x.service, x.addr, x.city, x.phone].join(' ').toLowerCase().includes(q));
  if (q || f.status || f.date || f.when !== 'all') return `<h2>Results (${j.length})</h2>${j.map(x => jobCard(x, x.date <= t)).join('') || '<div class="card"><p class="mut">No jobs match these filters.</p></div>'}`;
  return `<h2>Today and overdue</h2>${jobList(j.filter(x => x.date <= t && isOpen(x)), true, 'No jobs assigned for today.')}
  <h2>Upcoming</h2>${jobList(j.filter(x => x.date > t && isOpen(x)), false, 'No upcoming jobs.')}
  <h2>Completed and closed</h2>${jobList(j.filter(x => !isOpen(x)).slice(0, 15), false, 'Nothing completed yet.')}`; };
V.jobs = async () => { S.jobCache = await API.getTechnicianJobs(); const f = S.jobFilter, st = [...new Set(S.jobCache.map(x => x.status))].sort();
  return `<h1>My jobs</h1><div class="row">${[['all','All'],['today','Today'],['upcoming','Upcoming'],['progress','In progress'],['done','Completed']].map(([k, l]) => `<button class="chip ${f.when === k ? 'on' : ''}" data-a="jfwhen" data-v="${k}">${l}</button>`).join('')}</div><div class="card"><div class="grid g3" style="gap:10px"><input type="search" data-jf="q" aria-label="Search jobs" placeholder="Search name, address, number…" value="${esc(f.q)}">
    <select data-jf="status" aria-label="Filter by status"><option value="">All statuses</option>${st.map(s => `<option ${f.status === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
    <input type="date" data-jf="date" aria-label="Filter by date" value="${esc(f.date)}"></div><button class="btn ghost" style="margin-top:8px" data-a="jfclear">Clear filters</button></div>
  <div id="jobs-list">${jobsListHtml()}</div>`; };
V.job = async () => { const id = S.jobSel, x = id && await API.getTechnicianJob(id); S.jobCache = x ? [x] : [];
  if (!x) return '<div class="card"><h2>We couldn’t find this job</h2><p class="mut sm" style="margin:6px 0 14px">It may not be assigned to you. Please go back and try again.</p><button class="btn" data-a="nav" data-v="jobs">Back to my jobs</button></div>';
  const doc = await API.getJobMedia(id), notes = await API.getJobNotes(id), done = DONE.includes(x.status), final = DONE.includes(nextStatus(x)), chk = completionCheck(x, doc.photos, doc.signature, notes);
  S.jobDoc = { ...doc, notes, canEdit:!done };
  const f = (l, y) => y ? `<div><small>${l}</small><b>${esc(y)}</b></div>` : '', last = notes.slice(-1)[0];
  const thumb = p => `<div><button class="photo thumb" style="width:100%" data-a="jobview" data-v="${esc(p.id)}" aria-label="Open ${esc(p.type || 'job')} photo from ${esc(fmtStamp(p.at))}"><img src="${esc(p.url)}" alt="${esc(p.caption || p.type || 'Job photo')}" loading="lazy"></button><p class="mut sm" style="margin-top:4px">${esc([p.type, p.caption].filter(Boolean).join(' · '))}</p></div>`;
  return `<div><button class="btn ghost" data-a="nav" data-v="jobs">← My jobs</button></div>${jobCard(x, true, true)}
  <div class="card"><h3>Job details</h3><div class="dl" style="margin-top:14px">${f('Reference', x.ref)}${f('Service', x.service)}${f('Scheduled', [x.date ? fmtD(x.date) : '', x.time].filter(Boolean).join(' · '))}${f('Priority', x.priority)}${f('Created', fmtStamp(x.createdAt))}${f('Customer', x.name)}${f('Customer notes', x.notes)}${f('Office instructions', x.adminNotes)}${f('Assigned technician', x.tech || techName())}</div>${x.description ? `<p style="margin-top:14px">${esc(x.description)}</p>` : ''}</div>
  <div class="card"><h3>Service notes</h3>${notes.map(n => `<p class="sm" style="margin-top:10px"><b>${esc(n.by)}</b>${n.at ? ' · ' + esc(fmtStamp(n.at)) : ''}<br>${esc(n.text)}</p>`).join('') || '<p class="mut sm" style="margin-top:8px">No notes saved yet.</p>'}
    ${done ? '' : `<label class="sm mut" for="jn-text" style="display:block;margin:16px 0 6px">New note (not saved until you tap Save note)</label><textarea id="jn-text" rows="3" maxlength="${CONFIG.noteMax}" placeholder="Work performed, issues found, materials used, follow-up needed…"></textarea>
    <p class="autherr" style="margin-top:10px"></p><button class="btn pri lg" style="margin-top:10px" data-a="jobnote" data-v="${esc(x.id)}">Save note</button>`}</div>
  <div class="card"><h3>Job photos</h3>${doc.error ? '<p class="secerr" style="display:block;margin-top:8px">We couldn’t load the photos right now. Please refresh.</p>' : ''}
    <div class="grid g3" style="margin-top:12px">${doc.photos.map(thumb).join('') || '<p class="mut sm">No photos yet.</p>'}</div>
    ${done || x.emergency && false ? '' : `<div class="grid g2" style="margin-top:14px;gap:10px"><select id="jm-cat" aria-label="Photo type">${CONFIG.media.categories.map(c => `<option>${c}</option>`).join('')}</select><input type="text" id="jm-cap" maxlength="${CONFIG.media.captionMax}" placeholder="Caption (optional)" aria-label="Photo caption"></div>
    <div class="grid g2" style="margin-top:10px;gap:10px"><label class="btn pri lg" style="display:grid;place-items:center">Take photo<input type="file" accept="image/jpeg,image/png" capture="environment" hidden data-a="jobphoto"></label><label class="btn lg" style="display:grid;place-items:center">Choose from library<input type="file" accept="image/jpeg,image/png" multiple hidden data-a="jobphoto"></label></div>
    <p class="mut sm" data-status="photos" style="margin-top:8px"></p><p class="secerr" data-err="photos"></p>`}</div>
  <div class="card"><h3>Customer signature</h3>${doc.signature ? `<img src="${esc(doc.signature.url)}" alt="Customer signature" style="width:100%;max-width:360px;margin-top:12px;background:#fff;border:1px solid var(--line);border-radius:12px"><p class="mut sm" style="margin-top:8px">${doc.signature.signer ? 'Signed by ' + esc(doc.signature.signer) + ' · ' : ''}Captured ${esc(fmtStamp(doc.signature.at))}</p>` : '<p class="mut sm" style="margin-top:8px">No signature captured yet.</p>'}
    ${done ? '' : `<button class="btn lg" style="margin-top:12px" data-a="jobsign" data-v="${esc(x.id)}">${doc.signature ? 'Capture again' : 'Capture signature'}</button>`}</div>
  <div class="card"><h3>Completion review</h3><div class="dl" style="margin-top:14px">${f('Job', x.ref)}${f('Customer', x.name)}${f('Service', x.service)}${f('Technician', techName())}${f('Status', x.status)}${f('Photos', String(doc.photos.length))}</div>
    <ul style="list-style:none;padding:0;margin:14px 0 0">${chk.items.map(i => `<li class="row" style="margin-top:8px"><span class="pill ${i.met ? '' : 'amb'}">${i.met ? 'Done' : 'Needed'}</span><span>${esc(i.label)}${i.met ? '' : ' · ' + esc(i.hint)}</span></li>`).join('')}</ul>
    ${last ? `<p class="mut sm" style="margin-top:12px">Latest note: ${esc(last.text)}</p>` : ''}
    ${done ? '<p style="margin-top:14px"><b>This job is complete.</b> The record above is read-only.</p>' : final ? `<p class="secerr" data-err="complete" style="margin-top:12px"></p><button class="btn pri lg" style="margin-top:12px" data-a="jobdone" data-v="${esc(x.id)}" ${chk.ok ? '' : 'disabled'}>Complete job</button>${chk.ok ? '' : '<p class="mut sm" style="margin-top:8px">Finish the items marked “Needed” to complete this job.</p>'}` : '<p class="mut sm" style="margin-top:12px">Start the job to enable completion.</p>'}</div>`; };
V.photos = () => S.auth.mode === 'real' ? '<h1>Job photos</h1><div class="card"><p class="mut">Photo upload isn’t available yet. It’s coming in a later update.</p></div>' : `<div><h1>Job photos</h1><p class="mut">J-89 · Lindgren home. Tap a slot to use the camera.</p></div>
  <div class="grid g3">${['Before','Problem area','After'].map(l => `<label class="photo" style="${S.photos[l] ? `background-image:url(${S.photos[l]});color:transparent` : ''}">${l}<input type="file" accept="image/*" capture="environment" hidden data-a="tphoto" data-v="${l}"></label>`).join('')}</div>
  <button class="btn pri lg" data-a="toast" data-v="Photos queued for upload (mock)">Save to job</button>`;

/* ---------- Customer: appointments list + details (also shows completion info) ---------- */
V.appointments = async () => { const l = await API.getAppointments();
  return `<h1>My appointments</h1>${l.map(a => `<div class="card"><div class="row"><div class="sp"><b>${svc(a.service)}</b><p class="mut sm">${fmtD(a.date)} · ${fmtH(a.hour)} · ${a.tech}</p></div>${pill(a.status)}<button class="btn" data-a="details" data-v="${a.id}">Details</button></div></div>`).join('') || '<div class="card"><h2>No upcoming visits</h2><button class="btn pri" style="margin-top:12px" data-a="nav" data-v="book">Book service</button></div>'}`; };
V.appointment = async () => { const a = await API.getAppointment(S.sel), u = me();
  if (!a) return '<div class="card"><h2>Appointment not found</h2></div>';
  const done = a.status === 'Completed', c = a.completion;
  return `<div><button class="btn ghost" data-a="nav" data-v="${done ? 'history' : 'appointments'}">← Back</button></div>
  <div class="card"><div class="row"><h2 class="sp">${svc(a.service)}</h2>${pill(a.status)}</div>
    <div class="dl" style="margin-top:16px"><div><small>Date</small><b>${fmtD(a.date, { weekday:'long', month:'long', day:'numeric' })}</b></div><div><small>Arrival window</small><b>${fmtH(a.hour)}</b></div><div><small>Technician</small><b>${a.tech}</b></div><div><small>Address</small><b>${u.addr}</b></div><div><small>Reference</small><b>${a.ref || a.id}</b></div>${a.cancelReason ? `<div><small>Cancellation reason</small><b>${esc(a.cancelReason)}</b></div>` : ''}</div>
    ${['Requested','Confirmed','Assigned'].includes(a.status) ? `<div class="row" style="margin-top:18px"><button class="btn pri" data-a="resched" data-v="${a.id}">Reschedule</button><button class="btn" data-a="cancel" data-v="${a.id}">Cancel appointment</button></div>` : ''}</div>
  ${done && c ? `<div class="card"><h3>Service completed</h3><div class="dl" style="margin-top:14px"><div><small>What we did</small><b>${c.summary}</b></div><div><small>Areas treated</small><b>${c.areas}</b></div><div><small>Next visit</small><b>${c.next}</b></div></div></div>` : ''}
  <button class="card sel" data-a="callback"><b>Questions about this visit?</b><span class="mut sm">Request a callback from our office.</span></button>`; };

/* ---------- Customer: emergency + callback request history and details ---------- */
V.requests = async () => { const [em, cb] = await Promise.all([API.getEmergencies(), API.getCallbacks()]); S.requests = { emergencies:em, callbacks:cb };
  const all = [...em, ...cb].sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  const row = r => `<div class="card"><div class="row"><div class="sp"><b>${r.kind === 'emergency' ? 'Emergency' : 'Callback'}${r.type ? ' · ' + esc(r.type) : ''}</b><p class="mut sm">${fmtStamp(r.createdAt)}</p></div>${pill(r.status)}<button class="btn" data-a="reqdetails" data-v="${r.kind}|${esc(r.id)}">Details</button></div>${r.description ? `<p class="mut sm" style="margin-top:10px">${esc(r.description.slice(0, 120))}</p>` : ''}</div>`;
  return `<div class="row"><h1 class="sp">My requests</h1><button class="btn red" data-a="nav" data-v="emergency">Emergency</button><button class="btn" data-a="callback">Request callback</button></div>
  ${all.map(row).join('') || '<div class="card"><h3>No requests yet</h3><p class="mut sm" style="margin-top:6px">Emergency and callback requests you send will appear here.</p></div>'}`; };
V.request = async () => { const [kind, id] = S.reqSel || [], r = kind && await (kind === 'emergency' ? API.getEmergency(id) : API.getCallback(id));
  if (!r) return '<div class="card"><h2>We couldn’t find this request</h2><p class="mut sm" style="margin:6px 0 14px">Please refresh and try again.</p><button class="btn" data-a="nav" data-v="requests">Back</button></div>';
  const f = (l, x) => x ? `<div><small>${l}</small><b>${esc(x)}</b></div>` : '';
  return `<div><button class="btn ghost" data-a="nav" data-v="requests">← Back</button></div>
  <div class="card"><div class="row"><h2 class="sp">${kind === 'emergency' ? 'Emergency request' : 'Callback request'}</h2>${pill(r.status)}</div>
    <div class="dl" style="margin-top:16px">${f('Reference', r.ref)}${f('Sent', fmtStamp(r.createdAt))}${f(kind === 'emergency' ? 'Type' : 'Reason', r.type)}${f('Phone', r.phone)}${f('Address', r.address)}${f('Preferred time', r.window)}</div>
    ${r.description ? `<p style="margin-top:14px">${esc(r.description)}</p>` : ''}
    ${r.status === 'Requested' ? `<p class="autherr" style="margin-top:12px"></p><div class="row" style="margin-top:12px"><button class="btn" data-a="reqcancel" data-v="${kind}|${esc(r.id)}">Cancel request</button></div>` : ''}</div>`; };

/* ---------- Phase 3I: notifications (every role) + audit log (admin) ---------- */
V.notifications = async () => { const items = await API.getNotifications(50); S.notif = { items, unread:items.filter(n => !n.read).length };
  const card = n => `<div class="card${n.read ? '' : ' unread'}"><div class="row"><div class="sp"><b>${esc(n.title)}</b>${n.read ? '' : ' <span class="pill amb">Unread</span>'}<p class="mut sm" style="margin-top:2px">${esc(fmtStamp(n.createdAt))}</p></div></div>
    ${n.message ? `<p style="margin-top:8px">${esc(n.message)}</p>` : ''}<div class="row" style="margin-top:12px">${n.relatedId ? `<button class="btn" data-a="notifopen" data-v="${esc(n.id)}">Open</button>` : ''}${n.read ? '' : `<button class="btn ghost" data-a="notifread" data-v="${esc(n.id)}">Mark as read</button>`}</div></div>`;
  return `<div class="row"><h1 class="sp">Notifications</h1>${S.notif.unread ? '<button class="btn" data-a="notifreadall">Mark all as read</button>' : ''}</div>
  ${items.map(card).join('') || '<div class="card"><h3>You’re all caught up</h3><p class="mut sm" style="margin-top:6px">New updates about your appointments and requests will appear here.</p></div>'}`; };
V.audit = async () => { const rows = await API.getAuditLog(100);
  return `<h1>Audit log</h1><p class="mut sm">A read-only record of important changes. Entries are written by the system and can’t be edited or deleted.</p>
  <div class="card scroll"><table><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Summary</th></tr>${rows.map(r => `<tr><td>${esc(fmtStamp(r.createdAt))}</td><td>${esc(r.actor)}</td><td>${esc(r.action)}</td><td>${esc(r.entity)} ${esc(r.entityId)}</td><td>${esc(r.summary)}</td></tr>`).join('') || '<tr><td colspan="5" class="mut">No audit entries to show.</td></tr>'}</table></div>`; };

/* ---------- Staff (admin / executive): details, calendar, appointment list, operations, overview, rules, feature status ---------- */
const closedAppt = e => CLOSED_LABELS.includes(e.status);
const apptDetailHtml = e => `<h3>${esc(e.ref)} ${e.demo ? '<span class="pill gray">Demo data</span>' : ''}</h3><div class="row" style="margin:8px 0 0">${pill(e.status)}</div>
  <h4 class="eyebrow">Customer</h4><div class="dl"><div><small>Name</small><b>${esc(e.customer.name)}</b></div><div><small>Phone</small><b>${e.customer.phone ? `<a href="${tel(e.customer.phone)}">${esc(e.customer.phone)}</a>` : 'Not on file'}</b></div><div><small>Address</small><b>${esc(e.customer.addr || 'Not on file')}</b></div></div>
  <h4 class="eyebrow">Appointment</h4><div class="dl"><div><small>Date</small><b>${esc(fmtLong(e.date))}</b></div><div><small>Time</small><b>${fmtMin(e.startMin)} – ${fmtMin(e.endMin)}</b></div><div><small>Technician</small><b>${esc(e.tech)}</b></div></div>
  <h4 class="eyebrow">Service</h4><div class="dl"><div><small>Service</small><b>${esc(e.service)}</b></div>${e.serviceDesc ? `<div><small>What it covers</small><b>${esc(e.serviceDesc)}</b></div>` : ''}${e.notes ? `<div><small>Customer notes</small><b>${esc(e.notes)}</b></div>` : ''}${e.adminNotes ? `<div><small>Office notes</small><b>${esc(e.adminNotes)}</b></div>` : ''}</div>
  <div class="row" style="margin-top:18px"><button class="btn" data-a="dlg-close">Close</button>${canEditAppts() && !closedAppt(e) ? `<button class="btn pri sp" data-a="apptedit" data-v="${esc(e.id)}">Edit schedule / technician</button><button class="btn red" data-a="apptcancel" data-v="${esc(e.id)}">Cancel</button>` : (closedAppt(e) ? '<span class="mut sm sp">Closed appointments can’t be edited.</span>' : '<span class="mut sm sp">View only for your role.</span>')}</div>`;
const apptEditHtml = (e, techs) => `<h3>Edit ${esc(e.ref)}</h3><p class="mut sm" style="margin:6px 0 14px">${esc(e.customer.name)} · ${esc(e.service)}</p>
  <div class="grid" style="gap:10px"><label class="sm mut">Date<input type="date" id="ae-date" value="${e.date}" min="${today()}"></label><label class="sm mut">Start time<input type="time" id="ae-time" value="${hhmm(e.startMin)}" step="900"></label>
  <label class="sm mut">Technician<select id="ae-tech"><option value="">Unassigned</option>${techs.map(t => `<option value="${esc(t.id)}" ${t.id === e.techId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label></div>
  <p class="mut sm" style="margin-top:8px">Business hours, the booking window and technician conflicts are checked before saving.</p><p class="secerr" data-err="ae" style="margin-top:8px"></p>
  <div class="row" style="margin-top:14px"><button class="btn" data-a="apptview" data-v="${esc(e.id)}">Back</button><button class="btn pri sp" data-a="apptsave" data-v="${esc(e.id)}">Save changes</button></div>`;
const apptCancelHtml = e => `<h3>Cancel ${esc(e.ref)}?</h3><p class="mut sm" style="margin:8px 0 14px">${esc(e.customer.name)} · ${esc(fmtLong(e.date))}. The customer is notified automatically once notifications are enabled.</p>
  <select id="ac-reason" aria-label="Reason"><option value="">Choose a reason</option>${opts(CONFIG.cancelReasons)}</select><textarea id="ac-note" rows="2" placeholder="Note (optional)" style="margin-top:10px"></textarea><p class="secerr" data-err="ac" style="margin-top:8px"></p>
  <div class="row" style="margin-top:14px"><button class="btn" data-a="apptview" data-v="${esc(e.id)}">Keep appointment</button><button class="btn red sp" data-a="apptcancelok" data-v="${esc(e.id)}">Cancel appointment</button></div>`;
const evChip = e => `<button class="ev s-${slug(e.status)}" data-a="apptview" data-v="${esc(e.id)}" title="${esc(e.customer.name + ' · ' + e.service + ' · ' + e.tech)}"><b>${fmtMin(e.startMin)}</b> ${esc(e.customer.name)}</button>`;
const calRange = c => { const f = weekStart(addMonths(c.date, 0)); return c.view === 'month' ? { from:f, to:dAdd(f, 41) } : c.view === 'week' ? { from:weekStart(c.date), to:dAdd(weekStart(c.date), 6) } : { from:c.date, to:c.date }; };
const monthHtml = (c, evs) => { const first = weekStart(addMonths(c.date, 0)), t = today(), m = c.date.slice(0, 7);
  const cells = Array.from({ length:42 }, (_, i) => { const d = dAdd(first, i), list = evs.filter(e => e.date === d);
    return `<div class="cell${d.slice(0, 7) !== m ? ' dim' : ''}${d === t ? ' today' : ''}"><button class="dn" data-a="calday" data-v="${d}" aria-label="${esc(fmtLong(d))}">${+d.slice(8)}</button>${list.slice(0, 3).map(evChip).join('')}${list.length > 3 ? `<button class="ev" data-a="calday" data-v="${d}">+${list.length - 3} more</button>` : ''}${list.length ? `<span class="cnt">${list.length}</span>` : ''}</div>`; });
  return `<div class="cal-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(n => `<div class="cal-head">${n}</div>`).join('')}${cells.join('')}</div>`; };
const weekHtml = (c, evs) => { const s = weekStart(c.date), t = today();
  return `<div class="week">${Array.from({ length:7 }, (_, i) => { const d = dAdd(s, i), list = evs.filter(e => e.date === d);
    return `<div class="cell${d === t ? ' today' : ''}"><button class="dn" data-a="calday" data-v="${d}">${new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', timeZone:'UTC' })}</button>${list.map(evChip).join('') || '<p class="mut sm" style="margin-top:8px">No appointments</p>'}</div>`; }).join('')}</div>`; };
const dayHtml = (c, evs) => evs.filter(e => e.date === c.date).map(e => `<div class="card"><div class="row"><div class="sp"><b>${fmtMin(e.startMin)} – ${fmtMin(e.endMin)}</b> · ${esc(e.customer.name)}<p class="mut sm">${esc(e.service)} · ${esc(e.tech)}</p></div>${pill(e.status)}<button class="btn" data-a="apptview" data-v="${esc(e.id)}">Details</button></div></div>`).join('') || '<div class="card"><p class="mut">No appointments on this day.</p></div>';
V.calendar = async () => { const c = S.cal; if (!c.date) c.date = today(); const { from, to } = calRange(c), [all, techs] = await Promise.all([API.getStaffAppointments(from, to), API.getStaffTechnicians()]); S.calEvents = all;
  const evs = all.filter(e => (!c.tech || (c.tech === 'none' ? !e.techId : e.techId === c.tech)) && (!c.status || e.status === c.status));
  const title = c.view === 'month' ? new Date(addMonths(c.date, 0) + 'T12:00:00Z').toLocaleDateString('en-US', { month:'long', year:'numeric', timeZone:'UTC' }) : c.view === 'week' ? `${fmtD(weekStart(c.date))} – ${fmtD(dAdd(weekStart(c.date), 6))}` : fmtLong(c.date);
  return `<div class="row" style="gap:8px"><h1 class="sp">Calendar</h1><div class="seg">${['month','week','day'].map(k => `<button class="chip ${c.view === k ? 'on' : ''}" data-a="calview" data-v="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
  <div class="row" style="gap:8px"><button class="btn" data-a="calprev" aria-label="Previous">‹</button><button class="btn" data-a="caltoday">Today</button><button class="btn" data-a="calnext" aria-label="Next">›</button><h2 class="sp" style="min-width:150px">${esc(title)}</h2>
    <select data-cal="tech" aria-label="Filter by technician" style="width:auto"><option value="">All technicians</option><option value="none" ${c.tech === 'none' ? 'selected' : ''}>Unassigned</option>${techs.map(t => `<option value="${esc(t.id)}" ${c.tech === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
    <select data-cal="status" aria-label="Filter by status" style="width:auto"><option value="">All statuses</option>${['Requested','Confirmed','Assigned','En Route','In Progress','Completed','Cancelled'].map(s => `<option ${c.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
  <div class="legend">${['Requested','Confirmed','Assigned','In Progress','Completed','Cancelled'].map(pill).join('')}</div>
  ${c.view === 'month' ? monthHtml(c, evs) : c.view === 'week' ? weekHtml(c, evs) : dayHtml(c, evs)}
  <p class="mut sm">${evs.length} appointment${evs.length === 1 ? '' : 's'} in this view${canEditAppts() ? '. Select one to edit its schedule.' : '. Select one to see its details.'}</p>`; };
const apptRows = () => { const f = S.admFilter, q = f.q.trim().toLowerCase(); let l = S.apptCache.slice();
  if (f.status) l = l.filter(e => e.status === f.status); if (f.tech) l = l.filter(e => f.tech === 'none' ? !e.techId : e.techId === f.tech); if (f.date) l = l.filter(e => e.date === f.date);
  if (q) l = l.filter(e => [e.ref, e.customer.name, e.customer.phone, e.customer.addr, e.service, e.tech].join(' ').toLowerCase().includes(q));
  return `<p class="mut sm">${l.length} appointment${l.length === 1 ? '' : 's'}</p><div class="card scroll"><table><tr><th>Ref</th><th>When</th><th>Customer</th><th>Service</th><th>Technician</th><th>Status</th><th></th></tr>${l.map(e => `<tr><td>${esc(e.ref)}</td><td>${esc(fmtD(e.date))}<br><span class="mut sm">${fmtMin(e.startMin)}</span></td><td>${esc(e.customer.name)}<br>${e.customer.phone ? `<a class="sm" href="${tel(e.customer.phone)}">${esc(e.customer.phone)}</a>` : ''}</td><td>${esc(e.service)}</td><td>${esc(e.tech)}</td><td>${pill(e.status)}</td><td><button class="btn" data-a="apptview" data-v="${esc(e.id)}">Details</button></td></tr>`).join('') || '<tr><td colspan="7" class="mut">No appointments match these filters.</td></tr>'}</table></div>`; };
V.allappts = async () => { const [all, techs] = await Promise.all([API.getStaffAppointments(), API.getStaffTechnicians()]); S.apptCache = all; S.calEvents = all; const f = S.admFilter;
  return `<h1>Appointments</h1><div class="card"><div class="grid g3" style="gap:10px"><input type="search" data-af="q" aria-label="Search appointments" placeholder="Search name, phone, number…" value="${esc(f.q)}">
    <select data-af="status" aria-label="Status"><option value="">All statuses</option>${['Requested','Confirmed','Assigned','En Route','In Progress','Completed','Cancelled'].map(s => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <select data-af="tech" aria-label="Technician"><option value="">All technicians</option><option value="none" ${f.tech === 'none' ? 'selected' : ''}>Unassigned</option>${techs.map(t => `<option value="${esc(t.id)}" ${f.tech === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
    <input type="date" data-af="date" aria-label="Date" value="${esc(f.date)}"></div><button class="btn ghost" style="margin-top:8px" data-a="afclear">Clear filters</button></div><div id="appt-list">${apptRows()}</div>`; };
const kpi = (l, val, note) => `<div class="card kpi"><span class="mut sm">${l}</span><b>${val === null ? '—' : val}</b><span class="mut sm">${val === null ? 'Not available' : (note || '&nbsp;')}</span></div>`;
V.admin = async () => { const [st, all] = await Promise.all([API.getBusinessStats(), API.getStaffAppointments()]); S.apptCache = all; S.calEvents = all;
  const row = e => `<div class="row" style="padding:10px 0;border-top:1px solid var(--line)"><div class="sp"><b>${esc(e.customer.name)}</b><p class="mut sm">${esc(fmtD(e.date))} · ${fmtMin(e.startMin)} · ${esc(e.service)}</p></div>${pill(e.status)}<button class="btn" data-a="apptview" data-v="${esc(e.id)}">${canEditAppts() && !e.techId ? 'Assign' : 'Details'}</button></div>`;
  return `<h1>Operations</h1><div class="grid g3">${kpi('Today’s appointments', st.today.length)}${kpi('Need a technician', st.unassigned.length, 'upcoming, unassigned')}${kpi('Open emergencies', st.openEmergencies)}${kpi('Open callbacks', st.openCallbacks)}</div>
  <div class="grid g2"><div class="card"><h3>Needs a technician</h3>${st.unassigned.slice(0, 8).map(row).join('') || '<p class="mut sm" style="margin-top:8px">Every upcoming appointment has a technician.</p>'}</div>
  <div class="card"><h3>Today’s schedule</h3>${st.today.slice().sort(evSort).map(row).join('') || '<p class="mut sm" style="margin-top:8px">No appointments today.</p>'}</div></div>
  <div class="row"><button class="btn pri" data-a="nav" data-v="calendar">Open calendar</button><button class="btn" data-a="nav" data-v="allappts">All appointments</button></div>`; };
V.exec = async () => { const st = await API.getBusinessStats(), max = Math.max(1, ...Object.values(st.byStatus));
  return `<h1>Overview</h1><p class="mut sm">${S.auth.mode === 'real' ? 'Figures come from your live appointment and request records. ' : 'These are demonstration figures from fictional sample data. '}A dash means the number can’t be read yet; it is not zero.</p>
  <div class="grid g3">${kpi('Appointments (next 7 days)', st.thisWeek)}${kpi('Completed visits', st.completed, 'all time')}${kpi('Cancelled', st.cancelled, 'all time')}${kpi('Completion rate', st.completionRate === null ? null : st.completionRate + '%', 'completed ÷ (completed + cancelled + no-show)')}${kpi('Open emergencies', st.openEmergencies)}${kpi('Revenue', null)}</div>
  <div class="grid g2"><div class="card"><h3 style="margin-bottom:12px">Appointments by status</h3>${Object.entries(st.byStatus).map(([k, n]) => `<div class="row" style="margin-bottom:8px"><span style="width:96px" class="sm">${esc(k)}</span><div class="bar sp"><i style="width:${Math.round(n / max * 100)}%"></i></div><span class="sm mut">${n}</span></div>`).join('') || '<p class="mut sm">No appointments yet.</p>'}</div>
  <div class="card scroll"><h3 style="margin-bottom:6px">Technician workload</h3><table><tr><th>Technician</th><th>Today</th><th>Next 7 days</th></tr>${st.workload.map(w => `<tr><td>${esc(w.name)}</td><td>${w.today}</td><td>${w.next7}</td></tr>`).join('') || '<tr><td colspan="3" class="mut">No technicians found.</td></tr>'}</table></div></div>
  <div class="row"><button class="btn pri" data-a="nav" data-v="calendar">Open calendar</button><button class="btn" data-a="nav" data-v="allappts">All appointments</button></div>`; };
V.rules = () => `<h1>Booking rules</h1><p class="mut sm">These rules are applied to every customer booking and to admin edits. They are set in the project configuration; editing them from this page is planned.</p>
  <div class="card"><div class="dl"><div><small>Customers can book up to</small><b>${CONFIG.bookingWindowDays} days ahead</b></div><div><small>Visit length</small><b>${CONFIG.appointmentMinutes} minutes</b></div><div><small>Timezone</small><b>${esc(CONFIG.timezone)}</b></div><div><small>Office phone</small><b>${esc(CONFIG.phone)}</b></div><div><small>Admins may go past the window</small><b>${CONFIG.adminMayExceedBookingWindow ? 'Yes' : 'No'}</b></div></div>
  <h4 class="eyebrow">Business hours</h4><table>${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((n, i) => `<tr><td>${n}</td><td>${CONFIG.hours[i] ? fmtMin(CONFIG.hours[i][0] * 60) + ' – ' + fmtMin(CONFIG.hours[i][1] * 60) : 'Closed'}</td></tr>`).join('')}</table></div>`;
V.status = () => { const rows = [
  ['Customer sign-up, sign-in, password reset', 'Working', 'Live'], ['Customer profile and booking (3-day window, business hours)', 'Working', 'Live'], ['Appointment history and details', 'Working', 'Live'],
  ['Cancel and reschedule appointments', 'Partial', 'Built; needs live verification'], ['Emergency and callback requests', 'Partial', 'Built; needs live verification'], ['Technician jobs, status updates, notes', 'Partial', 'Needs database policies (supabase-sql/03)'],
  ['Job photos, customer signature, completion', 'Partial', 'Needs storage bucket and supabase-sql/04'], ['Notifications and audit log', 'Partial', 'Needs supabase-sql/05'], ['Admin appointments, calendar, technician assignment', 'Partial', 'Needs supabase-sql/06 (admin access + conflict protection)'],
  ['Owner overview (real counts)', 'Partial', 'Read-only; revenue is not tracked yet'], ['Demo logins with fictional sample data', 'Demo', 'Labelled “Demo mode”; nothing is saved'],
  ['Email and SMS messages', 'Planned', 'No provider configured'], ['Revenue and billing reports', 'Planned', 'No billing data yet'], ['Technician availability schedules', 'Planned', 'Conflicts are checked against appointments only'], ['Editing booking rules from the portal', 'Planned', 'Set in configuration for now']];
  const cls = { Working:'', Partial:'amb', Demo:'gray', Planned:'gray' };
  return `<h1>Feature status</h1><p class="mut sm">What is ready to use, what is built but still being verified, and what is planned.</p><div class="card scroll"><table><tr><th>Feature</th><th>Status</th><th>Note</th></tr>${rows.map(r => `<tr><td>${esc(r[0])}</td><td><span class="pill ${cls[r[1]]}">${r[1]}</span></td><td class="mut">${esc(r[2])}</td></tr>`).join('')}</table></div>`; };
