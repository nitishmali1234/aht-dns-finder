# AHT Query Tool — Documentation

A simple, click-based tool for looking up Acquia hosting information —
without typing `aht` commands by hand in a terminal.

**AHT** stands for **Acquia Hosting Toolkit**, the internal command-line
tool this app talks to.

> **Note:** This tool does not replace `aht` or give you access to Acquia's
> systems by itself. You still need `aht` installed and working on your
> computer (bastion/VPN access, login, etc.) — this app just gives you
> buttons and a nice-looking screen instead of typing commands.

---

## 1. What can this tool do?

| Button | What it does |
|---|---|
| **GET ENVIRONMENTS** | Shows info about an application — servers, PHP version, provider, etc. |
| **DOMAIN LIST** | Lists all domains attached to an environment |
| **DOMAINS POINTED** | Checks where each domain currently points (its DNS target) |
| **GET SERVER INFO** | Looks up one server by name (handy for finding its IP address for DNS changes) |
| **RUN DIG** | Looks up where a domain/URL points right now, using the standard `dig` DNS tool |

Every result also shows the exact command that was run and the raw text
output, in case you need to double-check anything.

---

## 2. Before you start (requirements)

You need:

1. **A computer with macOS, Windows, or Linux.**
2. **The `aht` tool already installed and working** on that computer — i.e.
   you can already open a terminal and successfully run something like
   `aht @someapp.prod application:info`. This app is only a friendlier way
   to run that same command — it can't do anything `aht` itself can't do.
3. **Access to your company's bastion/VPN**, the same access `aht` already
   needs to reach Acquia's systems.
4. If running from source: **Node.js** version 16 or newer (18 recommended).
   Not needed if you're just using the ready-made Mac app.

If you're not sure how `aht` or bastion access is set up on your machine,
check with your team first — this app won't fix that part for you.

---

## 3. How to install and run it

There are two ways to use this tool. Pick whichever fits you.

### Option A — Use the ready-made Mac app (easiest, no coding)

1. Get the `AHT Query Tool.dmg` file from whoever built it (see
   [`electron-app/BUILD.md`](electron-app/BUILD.md) if you're the one building it).
2. Double-click the `.dmg` file. A window opens with the app icon.
3. Drag the app icon into the **Applications** folder shown next to it.
4. Open **AHT Query Tool** from your Applications folder or Spotlight.
5. **First time only:** macOS will say it can't verify the developer.
   Right-click the app → **Open** → **Open** again. This is normal for
   internal tools that aren't signed with an Apple Developer certificate —
   you only need to do it once.
6. The app opens its own window with the tool ready to use. That's it —
   no terminal, no extra setup.

### Option B — Run it from source (works on Mac, Windows, or Linux)

This runs the same tool as a local website in your browser instead of a
desktop app.

**Step 1 — Get the code**

Download or `git clone` this project onto your computer.

**Step 2 — Install and start the backend**

Open a terminal in the project folder and run:

```bash
cd backend
npm install
npm run dev
```

You should see:

```
AHT Query Backend running on http://localhost:4000
AHT binary: aht
Timeout: 3600000ms
```

That's the whole setup — there is no separate build step and no second
server to start. The backend serves the entire tool by itself.

**Step 3 — Open it in your browser**

Go to:

```
http://localhost:4000
```

and the tool's screen should appear.

**Quick sanity check** (optional): visiting
`http://localhost:4000/api/health` in a browser should show
`{"status":"ok", ...}` if the backend is running correctly.

---

## 4. How to use it

1. **Get environment info:** Type an application/customer name (e.g.
   `acquia`, `rcn`, `marriott`) into **Application / Docroot Name**, then
   click **GET ENVIRONMENTS**.
2. **List or check domains:** Fill in both **Application / Docroot Name**
   and **Environment** (e.g. `prod`, `01live`), then click **DOMAIN LIST**
   or **DOMAINS POINTED**. Both of these need an environment — you'll get a
   clear message if you forget it.
3. **Look up a server:** Type a server hostname (e.g. `bal-12345`) into
   **Server Name** and click **GET SERVER INFO**. If the server has a
   public IP address (EIP), it's shown at the top with a **Copy** button —
   handy when repointing a customer's DNS.
4. **Look up a domain's DNS:** Paste a domain or full URL (e.g.
   `https://example.com/page` also works) into **Hostname / URL** and
   click **RUN DIG**.
5. **CLEAR RESULTS** empties the form and the results panel so you can
   start fresh.

The results panel always shows, in order: when the command ran, the exact
command used, any warnings, the parsed/structured information, and the raw
text output at the very bottom (click to expand it).

---

## 5. Understanding error messages

The tool checks what you type before it even runs a command, so mistakes
are caught early with a clear message instead of a confusing failure:

| Message | What it means |
|---|---|
| **"Missing application/customer name"** (or similar) | You left a required box empty. Fill it in and try again. |
| **"Invalid application/customer name: ... Only letters, numbers, dots, hyphens, and underscores are allowed."** | The name you typed has a character the tool won't accept (like a space or symbol). Double-check the spelling. |
| **"No customer or application found matching '...'. Please check the name and try again."** | The name looks valid, but `aht` couldn't find an application, customer, or environment with that name. This usually means a typo — double-check it against the customer's actual account name. |
| **"Environment is required for ... command"** | The Domain List / Domains Pointed buttons need an environment name filled in. |
| **"Could not extract a valid hostname from the input provided"** | The DNS Lookup box doesn't contain anything that looks like a real domain or URL. |

---

## 6. Common problems and fixes

| Symptom | Likely cause |
|---|---|
| `aht binary not found` | `aht` isn't installed, or isn't on your system PATH |
| Command times out | Your bastion/VPN connection isn't reachable — check your VPN/SSH connection |
| Blank page when opening `http://localhost:4000` | The backend isn't running — check the terminal for errors and re-run `npm run dev` in `backend/` |
| Results look empty even though the raw text at the bottom looks correct | `aht`'s text output changed slightly and the parser doesn't recognize it — this is a small code fix, not a setup problem |

---

## 7. Is my data safe?

- This tool runs entirely on your own computer. It doesn't send anything to
  a third-party server — it only talks to Acquia's systems the same way
  `aht` already does on its own.
- Nothing you type or see in the results is stored or logged anywhere
  outside your own machine.
- All input fields are checked before being used, so typing unusual
  characters into a field (accidentally or on purpose) can't be used to run
  unintended commands on your computer.

---

## 8. For developers: building the Mac app yourself

If you want to build the `.dmg` installer file from scratch (instead of
using one someone already built), see
[`electron-app/BUILD.md`](electron-app/BUILD.md) for the full step-by-step
guide.

---

## 9. Project folder overview

```
aht-query-tool/
├── backend/            The server that runs `aht` commands and serves the app
│   ├── server.js         Handles requests, runs commands, checks input
│   └── parser.js         Turns aht's raw text output into structured data
├── frontend/
│   └── public/          The whole user interface (plain HTML/CSS/JS — no build step)
│       ├── index.html
│       ├── app.js
│       └── styles.css
└── electron-app/        Wraps everything into a double-clickable Mac/Windows app
    └── main.js
```
