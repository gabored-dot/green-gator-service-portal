# Green Gator Pest Solutions: front-end prototype

Open `index.html` in a browser (or use the VS Code "Live Server" extension). No build step.

| File | Role |
|---|---|
| `css/styles.css` | Design tokens (`:root`), components, shell, premium layer |
| `js/config.js` | Business rules: `bookingWindowDays`, hours, services, techs |
| `js/mock-db.js` | Mock data shaped like future Supabase tables |
| `js/api.js` | Only data access point. Replace bodies with `supabase.from(...)` later |
| `js/store.js` | State, role navigation, router (`go`), helpers |
| `js/views.js` | Screens as pure functions returning HTML |
| `js/app.js` | Shell render, click actions, theme, animations |
