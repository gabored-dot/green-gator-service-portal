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
      <p class="autherr"></p><button class="btn pri" data-a="signin" data-v="c">Sign in</button><button class="btn ghost" data-a="signup">Create customer account</button></div>
    <div class="card grid"><div><h2>Staff login</h2><p class="mut sm">Technicians, office admins and leadership.</p></div>
      <input type="email" id="s-email" placeholder="Work email" aria-label="Work email" autocomplete="email"><input type="password" id="s-pass" placeholder="Password" aria-label="Password" autocomplete="current-password">
      <p class="autherr"></p><button class="btn" data-a="signin" data-v="s">Sign in as staff</button></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="row"><div class="sp"><h3>Demo login</h3><p class="mut sm">Shortcuts for testing. Not real authentication and not connected to Supabase.</p></div>
    <button class="btn" data-a="login" data-v="customer">Customer</button><button class="btn" data-a="login" data-v="technician">Technician</button>
    <button class="btn" data-a="login" data-v="admin">Admin</button><button class="btn" data-a="login" data-v="executive">Executive</button></div></div>
  <p class="mut sm" style="margin-top:20px">1368 West 130 South, Orem, UT · ${CONFIG.phone} · Mon–Fri 9–5, Sat 8–2</p></div>`;

V.dashboard = async () => {
  const [a, u] = [await API.getNextAppointment(), DB.users.customer];
  const next = a ? `<div class="card"><div class="row"><h2 class="sp">Next appointment</h2>${pill(a.status)}</div>
    <h1 style="margin:14px 0 4px">${fmtD(a.date,{weekday:'long',month:'long',day:'numeric'})}</h1><p class="mut">${fmtH(a.hour)} arrival window · in ${Math.round((new Date(a.date+'T00:00')-addDays(0))/864e5)} days</p>
    <div class="dl" style="margin:18px 0"><div><small>Service</small><b>${svc(a.service)}</b></div><div><small>Technician</small><b>${a.tech}</b></div><div><small>Address</small><b>${u.addr}</b></div><div><small>Reference</small><b>${a.id}</b></div></div>
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
  const head = t => `<p class="mut sm">Step ${S.step} of 3${b.replaceId ? ' · Rescheduling ' + b.replaceId : ''}</p><h1>${t}</h1>`;
  if (S.step === 1) return `${bar}${head('What do you need help with?')}
    <div class="grid g2">${CONFIG.services.map(s => `<button class="sel ${b.service === s.id ? 'on' : ''}" data-a="svc" data-v="${s.id}"><b>${s.name}</b><span class="mut sm">${s.desc}</span><span class="sm" style="color:var(--g);font-weight:600">${s.price}</span></button>`).join('')}</div>
    <button class="btn pri lg" ${b.service ? '' : 'disabled'} data-a="step" data-v="2">Continue</button>`;
  if (S.step === 2) {
    const days = Array.from({ length:N + 3 }, (_, i) => i + 1);
    const slots = b.date ? S.slots : [];
    return `${bar}${head('Pick a day and time')}
    <div class="banner">Online booking opens up to ${N} days ahead. Need help sooner? Use <a href="#" data-a="nav" data-v="emergency" style="color:inherit;font-weight:700">emergency help</a>.</div>
    <div class="row" style="flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px">${days.map(i => { const d = addDays(i), s = iso(d), closed = !CONFIG.hours[d.getDay()], locked = i > N;
      return `<button class="day ${b.date === s ? 'on' : ''}" ${locked || closed ? 'disabled' : ''} data-a="date" data-v="${s}"><small>${d.toLocaleDateString('en-US',{weekday:'short'})}</small><br><b>${d.getDate()}</b><br><small>${closed ? 'Closed' : locked ? 'Locked' : d.toLocaleDateString('en-US',{month:'short'})}</small></button>`; }).join('')}</div>
    <div class="card"><h3>Technician preference <span class="mut sm" style="font-weight:400">(optional)</span></h3>
      <div class="row" style="margin-top:10px">${['auto', ...CONFIG.techs].map(t => `<button class="chip ${(b.tech || 'auto') === t ? 'on' : ''}" data-a="tech" data-v="${t}">${t === 'auto' ? 'Auto-assign' : t}</button>`).join('')}</div>
      <p class="mut sm" style="margin-top:10px">If your choice is booked, dashed times will be auto-assigned to the next available technician.</p></div>
    <div class="card"><h3 style="margin-bottom:12px">${b.date ? 'Times for ' + fmtD(b.date) : 'Select a day to see times'}</h3>
      <div class="grid g3">${slots.map(x => `<button class="slot ${x.state === 'fallback' ? 'fb' : ''} ${b.hour === x.hour ? 'on' : ''}" ${x.state === 'full' ? 'disabled' : ''} data-a="slot" data-v="${x.hour}">${fmtH(x.hour)}<small>${x.state === 'full' ? 'Unavailable' : x.state === 'fallback' ? 'Auto-assign' : 'Available'}</small></button>`).join('')}</div></div>
    <div class="row"><button class="btn" data-a="step" data-v="1">Back</button><button class="btn pri sp" ${b.hour ? '' : 'disabled'} data-a="step" data-v="3">Review booking</button></div>`;
  }
  if (S.step === 3) { const tech = b.tech !== 'auto' && b.free?.includes(b.tech) ? b.tech : 'Auto-assigned';
    return `${bar}${head('Review and confirm')}
    <div class="card"><div class="dl"><div><small>Service</small><b>${svc(b.service)}</b></div><div><small>Date</small><b>${fmtD(b.date,{weekday:'long',month:'long',day:'numeric'})}</b></div><div><small>Arrival window</small><b>${fmtH(b.hour)}</b></div><div><small>Technician</small><b>${tech}</b></div><div><small>Address</small><b>${DB.users.customer.addr}</b></div></div>
    <label class="sm mut" style="display:block;margin:18px 0 6px">Notes for your technician (optional)</label><textarea rows="2" id="notes" placeholder="Gate code, pets, where you saw activity"></textarea></div>
    <div class="row"><button class="btn" data-a="step" data-v="2">Edit</button><button class="btn pri sp" data-a="confirm">Confirm booking</button></div>`; }
  const a = b.done; return `<div class="card" style="text-align:center;padding:40px 20px;max-width:560px;margin:0 auto"><div class="logo okmark" style="margin:0 auto 16px;width:56px;height:56px;border-radius:50%;background:var(--gs);color:var(--g);font-size:26px">✓</div>
    <h1>You’re booked</h1><p class="mut" style="margin:8px 0 20px">Confirmation ${a.id}. We’ll text you when ${a.tech} is on the way.</p>
    <div class="dl" style="text-align:left;background:var(--bg);border-radius:12px;padding:16px"><div><small>Service</small><b>${svc(a.service)}</b></div><div><small>When</small><b>${fmtD(a.date)} · ${fmtH(a.hour)}</b></div><div><small>Technician</small><b>${a.tech}</b></div></div>
    <button class="btn pri lg" style="margin-top:20px" data-a="nav" data-v="dashboard">Back to dashboard</button></div>`;
};

/* ---------- Emergency breakout channel ---------- */
V.emergency = () => {
  const e = S.emg, types = ['Stinging insects: active nest or swarm','Rodent inside living space','Infestation affecting a child, pet or health condition','Something else urgent'];
  if (e.sent) return `<div class="card emg" style="max-width:600px;margin:0 auto"><span class="pill red">Dispatch request ${e.sent.id}</span><h1 style="margin:12px 0 6px">Help is being arranged</h1>
    <p class="mut">Our emergency team will call you within 10 minutes. Estimated arrival: <b>${e.sent.eta}</b>.</p>
    <div class="row" style="margin-top:18px"><a class="btn red" style="display:grid;place-items:center;text-decoration:none" href="tel:3854809747">Call ${CONFIG.phone}</a><button class="btn" data-a="nav" data-v="dashboard">Done</button></div></div>`;
  return `<div class="card emg grid"><div><span class="pill red">Emergency channel</span><h1 style="margin-top:10px">Urgent pest help</h1><p class="mut">Separate from standard booking. Same-day dispatch, priority rates apply.</p></div>
    <a class="btn red lg" style="display:grid;place-items:center;text-decoration:none" href="tel:3854809747">Call now · ${CONFIG.phone}</a>
    <h3>Or tell us what’s happening</h3>
    ${types.map(t => `<button class="sel ${e.type === t ? 'on' : ''}" data-a="etype" data-v="${t}"><b>${t}</b></button>`).join('')}
    <div class="grid g2"><label class="photo" id="eph" style="${e.photo ? `background-image:url(${e.photo});color:transparent` : ''}">Add photo<input type="file" accept="image/*" capture="environment" hidden data-a="ephoto"></label>
    <button class="sel ${e.loc ? 'on' : ''}" data-a="eloc"><b>${e.loc ? 'Location shared ✓' : 'Share my location'}</b><span class="mut sm">${e.loc || DB.users.customer.addr}</span></button></div>
    <button class="btn red lg" ${e.type ? '' : 'disabled'} data-a="esend">Request emergency dispatch</button></div>`;
};

/* ---------- Technician (mobile-first) ---------- */
const linkBtn = 'class="btn sp" style="display:grid;place-items:center;text-decoration:none"';
/** Reusable job card. act=true shows the status-flow button + exception button */
const jobCard = (x, act) => { const flow = CONFIG.jobStatusFlow, i = flow.indexOf(x.status), next = CONFIG.jobActions[x.status];
  return `<div class="card"><div class="row"><div class="sp"><b>${x.name}</b><p class="mut sm">${x.service} · ${x.time}</p></div>${pill(x.status)}</div>
  <div class="steps" style="margin:14px 0 4px">${flow.map((_, n) => `<i class="${n <= i ? 'on' : ''}"></i>`).join('')}</div>
  <div class="dl" style="margin:12px 0"><div><small>Address</small><b>${x.addr}, ${x.city}</b></div><div><small>Phone</small><b>${x.phone}</b></div>${x.notes ? `<div><small>Notes</small><b>${x.notes}</b></div>` : ''}${x.exception ? `<div><small>Follow-up reason</small><b>${x.exception}</b></div>` : ''}</div>
  <div class="row"><a ${linkBtn} href="${tel(x.phone)}">Call customer</a><a ${linkBtn} target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent(x.addr + ', ' + x.city + ', UT')}">Directions</a></div>
  ${act && next ? `<button class="btn pri lg" style="margin-top:12px" data-a="job" data-v="${x.id}">${next}</button><button class="btn lg" style="margin-top:8px" data-a="jobx" data-v="${x.id}">Can’t complete this job</button>` : ''}</div>`; };
const myJobs = () => API.getJobs(DB.users.technician.name.split(' ')[0]);
V.jobs = async () => { const t = iso(addDays(0)), j = (await myJobs()).filter(x => x.date === t);
  return `<div><h1>Today’s jobs</h1><p class="mut">${DB.users.technician.name} · ${j.filter(x => x.status === 'Completed').length} of ${j.length} done</p></div>
  ${j.map(x => jobCard(x, true)).join('') || '<div class="card"><b>No jobs today</b></div>'}`; };
V.upcoming = async () => { const t = iso(addDays(0)), j = (await myJobs()).filter(x => x.date > t), days = [...new Set(j.map(x => x.date))];
  return `<h1>Upcoming jobs</h1>${days.map(d => `<h3>${fmtD(d, { weekday:'long', month:'long', day:'numeric' })}</h3>${j.filter(x => x.date === d).map(x => jobCard(x, false)).join('')}`).join('') || '<div class="card"><b>Nothing scheduled yet</b></div>'}`; };
V.photos = () => `<div><h1>Job photos</h1><p class="mut">J-89 · Lindgren home. Tap a slot to use the camera.</p></div>
  <div class="grid g3">${['Before','Problem area','After'].map(l => `<label class="photo" style="${S.photos[l] ? `background-image:url(${S.photos[l]});color:transparent` : ''}">${l}<input type="file" accept="image/*" capture="environment" hidden data-a="tphoto" data-v="${l}"></label>`).join('')}</div>
  <button class="btn pri lg" data-a="toast" data-v="Photos queued for upload (mock)">Save to job</button>`;

/* ---------- Admin / Executive (thin baselines) ---------- */
V.admin = async () => { const j = await API.getJobs();
  return `<h1>Operations</h1><div class="grid g3"><div class="card kpi"><span class="mut sm">Jobs today</span><b>${j.length}</b></div><div class="card kpi"><span class="mut sm">Open emergencies</span><b>${DB.emergencies.length}</b></div><div class="card kpi"><span class="mut sm">Techs on route</span><b>${j.filter(x => x.status === 'En Route').length}</b></div></div>
  <div class="card scroll"><h3 style="margin-bottom:6px">Schedule</h3><table><tr><th>Job</th><th>Service</th><th>City</th><th>Time</th><th>Status</th></tr>${j.map(x => `<tr><td>${x.name}</td><td>${x.service}</td><td>${x.city}</td><td>${x.time}</td><td>${pill(x.status)}</td></tr>`).join('')}</table></div>
  ${DB.emergencies.length ? `<div class="card emg"><h3>Emergency queue</h3>${DB.emergencies.map(x => `<p class="sm">${x.id} · ${x.type}</p>`).join('')}</div>` : ''}`; };
V.rules = () => `<h1>Booking rules</h1><div class="card grid" style="max-width:480px"><div><h3>Advance booking window</h3><p class="mut sm">How many days ahead customers can book online. Takes effect immediately in the customer flow.</p></div>
  <div class="row"><button class="btn" data-a="win" data-v="-1">−</button><b style="font-size:26px;min-width:40px;text-align:center">${CONFIG.bookingWindowDays}</b><button class="btn" data-a="win" data-v="1">+</button><span class="mut">days</span></div></div>`;
V.exec = () => `<h1>Performance</h1><div class="grid g3">${[['Revenue (MTD)','$184k'],['Pest-free rate','99.9%'],['Repeat customers','82%']].map(k => `<div class="card kpi"><span class="mut sm">${k[0]}</span><b>${k[1]}</b></div>`).join('')}</div>
  <div class="card"><h3 style="margin-bottom:14px">Jobs by service (mock)</h3>${[['General',78],['Rodent',52],['Wasp',34],['Mosquito',27],['Ant',22]].map(r => `<div class="row" style="margin-bottom:10px"><span style="width:80px" class="sm">${r[0]}</span><div class="bar sp"><i style="width:${r[1]}%"></i></div><span class="sm mut">${r[1]}</span></div>`).join('')}</div>`;

/* ---------- Customer: appointments list + details (also shows completion info) ---------- */
V.appointments = async () => { const l = await API.getAppointments();
  return `<h1>My appointments</h1>${l.map(a => `<div class="card"><div class="row"><div class="sp"><b>${svc(a.service)}</b><p class="mut sm">${fmtD(a.date)} · ${fmtH(a.hour)} · ${a.tech}</p></div>${pill(a.status)}<button class="btn" data-a="details" data-v="${a.id}">Details</button></div></div>`).join('') || '<div class="card"><h2>No upcoming visits</h2><button class="btn pri" style="margin-top:12px" data-a="nav" data-v="book">Book service</button></div>'}`; };
V.appointment = async () => { const a = await API.getAppointment(S.sel), u = DB.users.customer;
  if (!a) return '<div class="card"><h2>Appointment not found</h2></div>';
  const done = a.status === 'Completed', c = a.completion;
  return `<div><button class="btn ghost" data-a="nav" data-v="${done ? 'history' : 'appointments'}">← Back</button></div>
  <div class="card"><div class="row"><h2 class="sp">${svc(a.service)}</h2>${pill(a.status)}</div>
    <div class="dl" style="margin-top:16px"><div><small>Date</small><b>${fmtD(a.date, { weekday:'long', month:'long', day:'numeric' })}</b></div><div><small>Arrival window</small><b>${fmtH(a.hour)}</b></div><div><small>Technician</small><b>${a.tech}</b></div><div><small>Address</small><b>${u.addr}</b></div><div><small>Reference</small><b>${a.id}</b></div>${a.cancelReason ? `<div><small>Cancellation reason</small><b>${a.cancelReason}</b></div>` : ''}</div>
    ${a.status === 'Confirmed' ? `<div class="row" style="margin-top:18px"><button class="btn pri" data-a="resched" data-v="${a.id}">Reschedule</button><button class="btn" data-a="cancel" data-v="${a.id}">Cancel appointment</button></div>` : ''}</div>
  ${done && c ? `<div class="card"><h3>Service completed</h3><div class="dl" style="margin-top:14px"><div><small>What we did</small><b>${c.summary}</b></div><div><small>Areas treated</small><b>${c.areas}</b></div><div><small>Next visit</small><b>${c.next}</b></div></div></div>` : ''}
  <button class="card sel" data-a="callback"><b>Questions about this visit?</b><span class="mut sm">Request a callback from our office.</span></button>`; };
