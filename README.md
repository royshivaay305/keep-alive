# Supabase Keep-Alive

This project now has two modes:

- Browser dashboard in `index.html` for manual monitoring and testing
- GitHub Actions runner for real background keep-alive pings

## Browser mode

Open `index.html` in a modern browser.

Notes:

- Runs fully client-side with no backend or build step.
- Project credentials are kept in memory only and are cleared on refresh.
- Browser timers stop when the tab closes.

## GitHub Actions mode

The workflow file is `.github/workflows/keepalive.yml`.

It runs every 3 days and can also be triggered manually from the GitHub Actions tab.

### Required secret

Create a repository secret named `SUPABASE_PROJECTS` with JSON like this:

```json
[
  {
    "name": "Main App",
    "url": "https://your-project.supabase.co",
    "table": "healthcheck",
    "apiKey": "your-anon-key"
  },
  {
    "name": "Staging",
    "url": "https://another-project.supabase.co",
    "table": "healthcheck",
    "apiKey": "another-anon-key"
  }
]
```

### Important

- Use anon or publishable Supabase keys only.
- Do not use `service_role` keys in this setup.
- The scheduled job is what keeps projects active without an open browser tab.

## Supabase healthcheck table

Run [supabase-healthcheck.sql](C:/Users/roysh/Desktop/tool/supabase-healthcheck.sql) in the SQL editor of each Supabase project.

It will:

- create a lightweight `public.healthcheck` table
- enable RLS
- add an anon `SELECT` policy
- insert one starter row if the table is empty
