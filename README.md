# AHT Runner

A desktop application that runs AHT commands automatically with a simple UI.
Users can enter an app name and the app automatically runs `aht a:i`, `aht server`, `aht dc`,
and `aht do:li`, displaying results in real-time.

**Zero-configuration.** Clone repo → Double-click the app → It works. That's it.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| macOS 10.13+ | Currently packaged for macOS (arm64 Apple Silicon) |
| AHT CLI | Must be installed on your machine and available in `$PATH` |

---

## Installation

### For Non-Technical Users (Recommended)

1. Clone this repository or download it
2. Go to the `dist/` folder
3. Double-click **`AHT Runner-1.0.0-arm64.dmg`**
4. Drag "AHT Runner" to the Applications folder
5. Open Applications → Double-click "AHT Runner"
6. Enter app name and run commands

**That's it. No npm, no terminals, no configuration.**

---

## How to Use

1. Launch the **AHT Runner** app
2. Enter an **app name** (e.g., `myapp`)
3. Click **Run AHT Commands**
4. Watch the progress as all four commands execute
5. Results display with full command output

---

## Troubleshooting

**"command not found: aht"**
- AHT CLI is not installed or not in your PATH
- Install AHT on your machine
- Verify from terminal: `aht --help`

**App won't start**
- Verify AHT is properly installed and accessible from terminal
- Check that port 3001 is not blocked by firewall

**Results show errors**
- Verify the app name is correct
- Ensure you have AHT access for that app

---

## For Developers — Building from Source

### Prerequisites
- Node.js 16+ and npm
- AHT CLI installed

### Build Steps

```bash
# Clone and setup
git clone <repo-url>
cd aht-runner-COPY
npm install

# Development with hot reload
npm start

# Build production app
npm run build

# Build installers for all platforms
npm run electron-build
```

Production packages appear in `dist/`:
- **macOS**: `AHT Runner-1.0.0-arm64.dmg` (ready to distribute)
- **macOS ZIP**: For manual distribution if needed
- Other platforms: Modify electron-builder config in `package.json`

---

## Architecture

- **Frontend**: React UI (clean, simple input/output)
- **Backend**: Node.js + Express (executes AHT commands)
- **Desktop**: Electron (auto-launches server + UI on app start)
- **Packaging**: electron-builder (cross-platform installers)

User flow:
1. User launches app
2. Electron main process starts
3. Backend server auto-spawns on localhost:3001
4. React UI opens in window
5. User enters app name and runs commands
6. Everything is transparent—users never see a terminal

---

## Project Structure

```
.
├── public/
│   ├── electron.js          # Electron main process
│   ├── index.html
│   └── favicon.ico
├── src/
│   ├── App.js              # React UI component
│   ├── App.css
│   ├── index.js
│   └── index.css
├── server.js               # Node.js backend (executes AHT commands)
├── package.json            # Scripts, dependencies, Electron config
├── dist/                   # Packaged apps ready to distribute
│   ├── AHT Runner-1.0.0-arm64.dmg
│   └── AHT Runner-1.0.0-arm64-mac.zip
└── README.md
```

---

*Internal tool — Acquia T1 Support*



