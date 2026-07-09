# AHT Query Tool

A local web UI for running `aht` CLI commands (`application:info`, `domains:list`)
without typing them by hand — a plain HTML/CSS/JS frontend (no build step)
talking to a small Node/Express backend that actually shells out to the `aht`
binary.

## Folder structure

```
aht-query-tool/
├── backend/
│   ├── package.json
│   ├── server.js      ← Express server, executes `aht` via child_process,
│   │                     and serves frontend/public as static files
│   └── parser.js       ← Turns raw aht text output into structured JSON
└── frontend/
    └── public/
        ├── index.html   ← the whole UI markup
        ├── app.js        ← vanilla JS: form handling, fetch calls, rendering
        └── styles.css    ← all styling
```

There is no bundler, no JSX, and no `npm run build` — `frontend/public` is
served as-is. (`frontend/src.legacy-react/`, `frontend/node_modules/`, and
`frontend/build/` are left over from an earlier Create React App version and
aren't used by the running app.)

## 1. Backend setup

```bash
cd backend
npm install
```

**Before starting it**, make sure this machine can actually run `aht` from a
terminal — i.e. you already have bastion/SSH access configured the same way
you'd use to run `aht @app.env application:info` manually. If you're not sure
how that's set up, check with whoever maintains your existing AHT chatbot.

If `aht` isn't on your PATH, or needs extra environment variables (bastion
host, SSH agent socket, etc.), open `backend/server.js` and look for the
`AHT_ENV` and `AHT_BINARY` constants near the top — there are comments
showing exactly where to add them. You can also just export the variables
in your shell before starting the server; they'll be inherited automatically.

Start it:
```bash
npm run dev
```

You should see:
```
AHT Query Backend running on http://localhost:4000
AHT binary: aht
Timeout: 60000ms
```

Open `http://localhost:4000` in a browser — the backend serves the UI
directly, no separate frontend process or build step needed.

Sanity check it's alive:
```bash
curl http://localhost:4000/api/health
```

## 2. Using it

- Enter an app name (e.g. `tufts.01live`) in **Application/Docroot Name**.
- Click **GET ENVIRONMENTS** to run `application:info`.
- Enter an environment too, then click **GET DOMAINS** to run `domains:list`
  (this one requires the environment field).
- **CLEAR RESULTS** resets the form and results panel.

The results panel shows, in order: timestamp + the literal command that ran,
any warnings (e.g. bastion selection messages), parsed app info, the hosts
table, entitlements table or domains list, and the raw text output at the
bottom.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `aht binary not found` | `aht` isn't on PATH — set `AHT_PATH` env var to its full path |
| Command times out after 60s | Bastion isn't reachable from this machine — check VPN/SSH |
| CORS error in browser console | Only relevant if serving the frontend from elsewhere — normally the backend serves the UI itself on port 4000 |
| "Invalid application/customer name" / "No customer or application found matching..." | The app, environment, or server name field has a typo, invalid characters, or doesn't exist — check the spelling |
| Blank/empty parsed sections, but raw output looks right | `aht`'s output format differs slightly from what `parser.js` expects — share a raw output sample and the parser regexes can be adjusted |
