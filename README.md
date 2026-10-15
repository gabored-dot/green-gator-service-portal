# Green Gator Pest Solutions: service portal

Plain HTML, CSS and JavaScript (no build step). Open `index.html` with a local server (VS Code "Live Server") or deploy the folder to GitHub Pages.

Architecture: **views.js → store.js → api.js → Supabase** (`mock-db.js` powers the demo logins).

| File | Role |
|---|---|
| `index.html` | Page shell, loads the scripts in order |
| `css/styles.css` | Design tokens, components, layout |
| `js/config.js` | Business rules, status flows, Supabase URL + anon key (browser-safe only) |
| `js/mock-db.js` | Demo data (demo logins only) |
| `js/supabase.js` | Supabase client setup |
| `js/api.js` | The only place that talks to Supabase (live) or the mock data (demo) |
| `js/store.js` | State, role navigation, route guard, helpers |
| `js/views.js` | Screens |
| `js/app.js` | Rendering, click actions, auth startup |

Never put a service-role key in this folder.
