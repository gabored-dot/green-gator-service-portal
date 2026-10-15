/* =====================================================================
   LAYER 1 · MOCK DB — shaped like future Supabase tables.
   ===================================================================== */
const iso = d => d.toLocaleDateString('en-CA');
const addDays = n => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+n); return d; };
const DB = {
  users: {
    customer: { id:'u1', name:'Sarah Whitaker', phone:'(801) 555-0142', addr:'482 N Center St, Lehi, UT', plan:'Quarterly protection plan' },
    technician: { id:'u2', name:'David Alvarez' },
    admin: { id:'u3', name:'Priya Shah' },
    executive: { id:'u4', name:'Gage Dayton' }
  },
  appointments: [
    { id:'GG-2041', customerId:'u1', service:'general', date:iso(addDays(2)), hour:10, tech:'David', status:'Confirmed' },
    { id:'GG-1877', customerId:'u1', service:'ant', date:'2026-07-14', hour:13, tech:'Mike', status:'Completed',
      completion:{ summary:'Ant trails traced and treated at the kitchen and patio entry points.', areas:'Kitchen, patio door, exterior foundation', next:'Quarterly visit due in October' } },
    { id:'GG-1612', customerId:'u1', service:'general', date:'2026-04-09', hour:9, tech:'James', status:'Completed',
      completion:{ summary:'Full interior and exterior treatment with eave de-webbing.', areas:'Whole home, eaves, fence line', next:'Quarterly visit due in July' } }
  ],
  jobs: [
    { id:'J-88', date:iso(addDays(0)), time:'9:00 AM', tech:'David', name:'Okafor residence', phone:'(801) 555-0117', addr:'1210 E 800 N', city:'Orem', service:'Rodent control', status:'Completed', notes:'Garage entry points' },
    { id:'J-89', date:iso(addDays(0)), time:'11:00 AM', tech:'David', name:'Lindgren home', phone:'(801) 555-0166', addr:'77 S 200 W', city:'Lindon', service:'General pest control', status:'En Route', notes:'Dog in backyard' },
    { id:'J-90', date:iso(addDays(0)), time:'1:30 PM', tech:'David', name:'Bright Dental', phone:'(801) 555-0190', addr:'315 W Center St', city:'Provo', service:'Ant control', status:'Assigned', notes:'Ask for Dana at the front desk' },
    { id:'J-91', date:iso(addDays(0)), time:'3:00 PM', tech:'David', name:'Nguyen residence', phone:'(801) 555-0123', addr:'940 W 500 S', city:'American Fork', service:'Wasp control', status:'Assigned', notes:'Nest under back deck' },
    { id:'J-92', date:iso(addDays(1)), time:'9:30 AM', tech:'David', name:'Hale family', phone:'(801) 555-0155', addr:'28 N 100 E', city:'Pleasant Grove', service:'Mosquito control', status:'Assigned' },
    { id:'J-93', date:iso(addDays(2)), time:'10:00 AM', tech:'David', name:'Sarah Whitaker', phone:'(801) 555-0142', addr:'482 N Center St', city:'Lehi', service:'General pest control', status:'Assigned' },
    { id:'J-94', date:iso(addDays(0)), time:'10:00 AM', tech:'Mike', name:'Orchard Café', phone:'(801) 555-0138', addr:'60 E State St', city:'Lehi', service:'Spider control', status:'In Progress' },
    { id:'J-95', date:iso(addDays(0)), time:'ASAP', tech:'David', emergency:true, name:'Whitaker residence', phone:'(801) 555-0142', addr:'482 N Center St', city:'Lehi', service:'Emergency · Wasp nest', status:'Assigned', notes:'Nest by the front door' }
  ],
  callbacks: [],
  jobMedia: [], jobSignatures: {},
  // DEMONSTRATION appointments (fictional people). Used only in demo mode, always labelled "Demo data".
  demoAppointments: [
    { id:'D-1',  ref:'DEMO-101', off:0,  startMin:540,  endMin:600,  status:'Completed',   service:'General pest control', name:'Alex Morgan (demo)',   phone:'(555) 010-0101', addr:'12 Demo Street, Sampletown', tech:'Mike',  notes:'Dog in backyard' },
    { id:'D-2',  ref:'DEMO-102', off:0,  startMin:660,  endMin:720,  status:'In Progress', service:'Rodent control',       name:'Riley Chen (demo)',    phone:'(555) 010-0102', addr:'48 Sample Ave, Sampletown', tech:'David', notes:'Garage entry points' },
    { id:'D-3',  ref:'DEMO-103', off:0,  startMin:810,  endMin:870,  status:'Assigned',    service:'Ant control',          name:'Sam Rivera (demo)',    phone:'(555) 010-0103', addr:'7 Example Road, Sampletown', tech:'James', notes:'' },
    { id:'D-4',  ref:'DEMO-104', off:1,  startMin:600,  endMin:660,  status:'Confirmed',   service:'Wasp control',         name:'Jordan Lee (demo)',    phone:'(555) 010-0104', addr:'90 Placeholder Ln, Sampletown', tech:'Mike',  notes:'Nest under the deck' },
    { id:'D-5',  ref:'DEMO-105', off:1,  startMin:780,  endMin:840,  status:'Requested',   service:'Mosquito control',     name:'Taylor Brooks (demo)', phone:'(555) 010-0105', addr:'3 Mock Court, Sampletown', tech:null,    notes:'Yard treatment' },
    { id:'D-6',  ref:'DEMO-106', off:2,  startMin:540,  endMin:600,  status:'Confirmed',   service:'Spider control',       name:'Casey Nguyen (demo)',  phone:'(555) 010-0106', addr:'21 Fictional Way, Sampletown', tech:'David', notes:'' },
    { id:'D-7',  ref:'DEMO-107', off:2,  startMin:840,  endMin:900,  status:'Requested',   service:'General pest control', name:'Morgan Diaz (demo)',   phone:'(555) 010-0107', addr:'66 Test Blvd, Sampletown', tech:null,    notes:'First visit' },
    { id:'D-8',  ref:'DEMO-108', off:3,  startMin:660,  endMin:720,  status:'Confirmed',   service:'Rodent control',       name:'Jamie Patel (demo)',   phone:'(555) 010-0108', addr:'5 Imaginary Pl, Sampletown', tech:'James', notes:'' },
    { id:'D-9',  ref:'DEMO-109', off:-2, startMin:600,  endMin:660,  status:'Completed',   service:'Ant control',          name:'Drew Kim (demo)',      phone:'(555) 010-0109', addr:'30 Sandbox St, Sampletown', tech:'Mike',  notes:'' },
    { id:'D-10', ref:'DEMO-110', off:-1, startMin:780,  endMin:840,  status:'Cancelled',   service:'Wasp control',         name:'Avery Scott (demo)',   phone:'(555) 010-0110', addr:'18 Pretend Dr, Sampletown', tech:'David', notes:'Customer cancelled' }
  ],
  notifications: [
    { id:'n1', role:'customer', title:'Appointment reminder', message:'Your pest control visit is coming up soon.', type:'reminder', relatedType:'appointment', relatedId:'GG-2041', read:false, createdAt:new Date(Date.now() - 36e5).toISOString() },
    { id:'n2', role:'customer', title:'Booking received', message:'We received your appointment request.', type:'booking', relatedType:'appointment', relatedId:'GG-2041', read:true, createdAt:new Date(Date.now() - 864e5).toISOString() },
    { id:'n3', role:'technician', title:'New job assigned', message:'You have a job today at 1:30 PM.', type:'assignment', relatedType:'appointment', relatedId:'J-90', read:false, createdAt:new Date(Date.now() - 18e5).toISOString() },
    { id:'n4', role:'admin', title:'New emergency request', message:'A customer sent an emergency request that needs attention.', type:'emergency', relatedType:'emergency_request', relatedId:null, read:false, createdAt:new Date(Date.now() - 6e5).toISOString() }
  ],
  audit: [
    { id:'au1', action:'Appointment Created', entity:'Appointment', entityId:'GG-2041', actor:'Sarah Whitaker', summary:'Appointment created', createdAt:new Date(Date.now() - 864e5).toISOString() },
    { id:'au2', action:'Technician Assigned', entity:'Appointment', entityId:'GG-2041', actor:'Priya Shah', summary:'Technician changed', createdAt:new Date(Date.now() - 72e5).toISOString() }
  ],
  emergencies: []
};
