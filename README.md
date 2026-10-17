[English](README.md) · [Português (BR)](README.pt-BR.md) · [Español](README.es.md)

# Barca

A modern FTP, FTPS and SFTP client for macOS (Apple Silicon), Windows and Linux.

Two-pane file manager (local ⇄ server), transfer queue, site manager and
operation log — built with Electron, Node.js and plain HTML5/CSS/JavaScript.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png">
  <img alt="Barca with a saved site connected over SFTP and uploads in progress" src="docs/screenshot-light.png">
</picture>

## Features

- **Protocols:** SFTP (password or private key), FTPS (explicit and implicit) and FTP
- **Dual pane:** sortable columns, multi-selection (⌘ or Ctrl, ⇧), keyboard navigation, editable path
- **Drag and drop:** between panes, or from Finder or Explorer straight to the server
- **Transfer queue:** 2 parallel connections, recursive folders, progress and speed,
  cancel, retry, overwrite or skip existing files
- **Remote operations:** new folder, rename, delete, permissions (chmod), copy path
- **Site manager:** passwords encrypted by the system keychain (macOS Keychain, Windows DPAPI, GNOME Keyring or KWallet)
- **Security:** SSH host key fingerprint confirmation and change alert;
  warning when using unencrypted FTP
- Automatic light/dark theme

## Download

Get the latest version on the [Releases](https://github.com/RogerPhilippe/Barca/releases) page:

| System | File |
|---|---|
| macOS (Apple Silicon) | `Barca-<version>-macos-arm64.zip` |
| Windows x64 | `Barca-<version>-windows-x64.zip` |
| Linux x64 | `Barca-<version>-linux-x64.tar.gz` |

The builds are not signed by Apple or Microsoft, so the system shows a warning
on first launch. The release notes explain how to allow it on each system.

## Running locally

Requirements: Node.js 20+

```bash
npm install
npx install-electron   # downloads the Electron binary (npm 12+ blocks install scripts)
npm start
```

## Building the app

```bash
npm run icon        # generates the icons from build/icon.svg (requires macOS)
npm run dist        # builds macOS arm64, Windows x64 and Linux x64 into dist/
npm run dist:mac    # or a single platform: dist:mac, dist:win, dist:linux
```

The macOS app gets an ad-hoc signature. To distribute without Gatekeeper or
SmartScreen warnings, sign with a Developer ID (macOS) or a code-signing
certificate (Windows).

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

Copyright © 2026 Roger Philippe Pereira
