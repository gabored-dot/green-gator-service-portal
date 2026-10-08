/* =====================================================================
   LAYER 0 · CONFIG — business rules live here, never inside views.
   Later: load from a Supabase `settings` table via API.getConfig().
   ===================================================================== */
const CONFIG = {
  bookingWindowDays: 3,                       // max days in advance a customer can book
  phone: '(385) 480-9747',
  supabase: {                                  // browser-safe values only. NEVER put a service-role key here
    url: 'https://lpuxmodswcbqgcyqvvqa.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwdXhtb2Rzd2NicWdjeXF2dnFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MDQwNTAsImV4cCI6MjEwNjk4MDA1MH0.YYfPmdHElPPasxKbXbqdLk3naLQ5KGWbrdLGFq08pKo'
  },
  hours: { 0: null, 1: [9,17], 2: [9,17], 3: [9,17], 4: [9,17], 5: [9,17], 6: [8,14] }, // Sun closed, Sat 8-2
  services: [
    { id:'general', name:'General pest control', desc:'Interior + exterior barrier, eave de-webbing', price:'from $119' },
    { id:'rodent',  name:'Rodent control', desc:'Inspection, trapping, exclusion', price:'from $189' },
    { id:'spider',  name:'Spider control', desc:'Web removal and perimeter treatment', price:'from $119' },
    { id:'ant',     name:'Ant control', desc:'Trail tracing and colony treatment', price:'from $119' },
    { id:'wasp',    name:'Wasp control', desc:'Nest removal and prevention', price:'from $149' },
    { id:'mosquito',name:'Mosquito control', desc:'Yard fogging and standing-water check', price:'from $99' },
    { id:'other',   name:'Other / not sure', desc:'We will inspect and recommend', price:'free estimate' }
  ],
  techs: ['Mike','David','James'],
  jobStatusFlow: ['Assigned','En Route','In Progress','Completed'],      // technician status order
  jobActions: { 'Assigned':'Start route', 'En Route':'Start job', 'In Progress':'Complete job' }, // button label per current status
  jobExceptions: ['Customer unavailable','Cannot access property','Customer did not respond','Safety issue','Other'],
  cancelReasons: ['Schedule conflict','Issue resolved','Found another provider','Cost','Other'],
  callbackWindows: ['As soon as possible','Morning','Afternoon']
};
