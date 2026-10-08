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
    { id:'J-94', date:iso(addDays(0)), time:'10:00 AM', tech:'Mike', name:'Orchard Café', phone:'(801) 555-0138', addr:'60 E State St', city:'Lehi', service:'Spider control', status:'In Progress' }
  ],
  callbacks: [],
  emergencies: []
};
