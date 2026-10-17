[English](README.md) · [Português (BR)](README.pt-BR.md) · [Español](README.es.md)

# Barca

A modern FTP, FTPS and SFTP client for macOS, native on Apple Silicon.

Two-pane file manager (local ⇄ server), transfer queue, site manager and
operation log — built with Electron, Node.js and plain HTML5/CSS/JavaScript.

## Features

- **Protocols:** SFTP (password or private key), FTPS (explicit and implicit) and FTP
- **Dual pane:** sortable columns, multi-selection (⌘/⇧), keyboard navigation, editable path
- **Drag and drop:** between panes, or from Finder straight to the server
- **Transfer queue:** 2 parallel connections, recursive folders, progress and speed,
  cancel, retry, overwrite or skip existing files
- **Remote operations:** new folder, rename, delete, permissions (chmod), copy path
- **Site manager:** passwords encrypted with the macOS Keychain (`safeStorage`)
- **Security:** SSH host key fingerprint confirmation and change alert;
  warning when using unencrypted FTP
- Automatic light/dark theme

## Running locally

Requirements: macOS 12+, Node.js 20+

```bash
npm install
npx install-electron   # downloads the Electron binary (npm 12+ blocks install scripts)
npm start
```

## Building the app

```bash
npm run icon   # generates build/icon.icns from build/icon.svg
npm run dist   # generates dist/Barca-darwin-arm64/Barca.app
```

The generated app has an ad-hoc signature. To distribute it to other Macs
without Gatekeeper warnings, sign it with a Developer ID and notarize it.

## Project structure

```
src/main/       main process (Node.js)
  main.js       window, IPC, host key verification
  remote.js     unified FTP/FTPS/SFTP client
  queue.js      transfer queue
  store.js      saved sites and trusted SSH keys
  preload.js    secure bridge between main process and UI
src/renderer/   interface (HTML5, CSS, JavaScript)
```

## Stack

Electron · Node.js · [basic-ftp](https://github.com/patrickjuchli/basic-ftp) ·
[ssh2-sftp-client](https://github.com/theophilusx/ssh2-sftp-client) · HTML5 · CSS · JavaScript

## License

Barca is distributed under a **dual license**:

- [AGPLv3](LICENSE) — free, as long as any modified version (including use
  as a network service) is also made available under the same license.
- [Commercial license](COMMERCIAL-LICENSE.md) — a safeguard, not a product:
  selling Barca or using it in closed-source software requires the
  maintainer's explicit permission.

Contributions are subject to the terms in [CONTRIBUTING.md](CONTRIBUTING.md).

Third-party dependencies keep their own licenses (MIT, Apache-2.0,
BSD-3-Clause, ISC, Unlicense), all compatible with both license options.

## Disclaimer

Barca is an independent project written from scratch. It contains no
source code from FileZilla® and is not affiliated with, endorsed by, or
sponsored by the FileZilla project or Tim Kosse. FileZilla is a trademark of
its respective owner.

Copyright © 2026 Roger Philippe Pereira
