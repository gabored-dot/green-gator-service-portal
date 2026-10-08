/* =====================================================================
   LAYER 3 · STORE + ROUTER
   ===================================================================== */
const S = { role:null, route:'landing', drawer:false, b:{}, step:1, slots:[], emg:{}, photos:{}, sel:null, auth:{ mode:'demo', user:null, profile:null } };
const NAV = {
  customer:  [['dashboard','Dashboard'],['appointments','My appointments'],['book','Book service'],['history','Service history'],['emergency','Emergency help']],
  technician:[['jobs','Today’s jobs'],['upcoming','Upcoming jobs'],['photos','Job photos']],
  admin:     [['admin','Operations'],['rules','Booking rules']],
  executive: [['exec','Performance']]
};
const home = r => NAV[r][0][0];
const go = (route, extra = {}) => { Object.assign(S, { route, drawer:false }, extra); render(); window.scrollTo(0,0); };
const login = role => { S.auth = { mode:'demo', user:null, profile:null }; S.role = role; S.b = {}; S.step = 1; go(home(role)); };
const toast = m => { const t = Object.assign(document.createElement('div'), { className:'toast', textContent:m }); document.body.append(t); setTimeout(() => t.remove(), 3200); };

/* ===== helpers ===== */
const $ = s => document.querySelector(s);
const fmtH = h => `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}`;
const fmtD = (s, o = { weekday:'short', month:'short', day:'numeric' }) => new Date(s + 'T00:00').toLocaleDateString('en-US', o);
const svc = id => CONFIG.services.find(s => s.id === id)?.name || id;
const pill = s => `<span class="pill ${{Confirmed:'',Completed:'gray','Assigned':'gray','En Route':'amb','In Progress':'amb','Needs Follow-up':'red',Cancelled:'red'}[s] ?? ''}">${s}</span>`;
const tel = p => 'tel:' + String(p).replace(/\D/g, '');
const opts = list => list.map(o => `<option>${o}</option>`).join('');
/* Real (Supabase) session: the role is taken from the database profile */
const loginReal = (user, profile) => { S.auth = { mode:'real', user, profile }; S.role = profile.role; S.b = {}; S.step = 1; go(home(profile.role)); };
const resetSession = () => { S.auth = { mode:'demo', user:null, profile:null }; S.role = null; S.b = {}; S.step = 1; go('landing'); };
