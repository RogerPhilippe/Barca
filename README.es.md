[English](README.md) · [Português (BR)](README.pt-BR.md) · [Español](README.es.md)

# Barca

Cliente FTP, FTPS y SFTP moderno para macOS (Apple Silicon), Windows y Linux.

Gestor de archivos de dos paneles (local ⇄ servidor), cola de transferencias,
gestor de sitios y registro de operaciones — hecho con Electron, Node.js y
HTML5/CSS/JavaScript puro.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png">
  <img alt="Barca conectada a un sitio guardado por SFTP, con envíos en curso" src="docs/screenshot-light.png">
</picture>

## Funcionalidades

- **Protocolos:** SFTP (contraseña o clave privada), FTPS (explícito e implícito) y FTP
- **Dos paneles:** columnas ordenables, selección múltiple (⌘ o Ctrl, ⇧), navegación con teclado, ruta editable
- **Arrastrar y soltar:** entre los paneles o desde el Finder o el Explorador de archivos directamente al servidor
- **Cola de transferencias:** 2 conexiones en paralelo, carpetas recursivas, progreso y
  velocidad, cancelar, reintentar, sobrescribir u omitir archivos existentes
- **Operaciones remotas:** nueva carpeta, renombrar, eliminar, permisos (chmod), copiar ruta
- **Gestor de sitios:** contraseñas cifradas por el almacén del sistema (Llavero de macOS, DPAPI de Windows, GNOME Keyring o KWallet)
- **Seguridad:** confirmación de la huella digital de la clave SSH y alerta de cambio;
  aviso al usar FTP sin cifrado
- Tema claro/oscuro automático

## Descarga

Descargue la versión más reciente en la página de [Releases](https://github.com/RogerPhilippe/Barca/releases):

| Sistema | Archivo |
|---|---|
| macOS (Apple Silicon) | `Barca-<versión>-macos-arm64.zip` |
| Windows x64 | `Barca-<versión>-windows-x64.zip` |
| Linux x64 | `Barca-<versión>-linux-x64.tar.gz` |

Las compilaciones no están firmadas por Apple ni por Microsoft, así que el
sistema muestra un aviso en la primera apertura. Las notas de la versión
explican cómo permitirla en cada sistema.

## Ejecución local

Requisitos: Node.js 20+

```bash
npm install
npx install-electron   # descarga el binario de Electron (npm 12+ bloquea los scripts de instalación)
npm start
```

## Generar la aplicación

```bash
npm run icon        # genera los íconos a partir de build/icon.svg (requiere macOS)
npm run dist        # genera macOS arm64, Windows x64 y Linux x64 en dist/
npm run dist:mac    # o una sola plataforma: dist:mac, dist:win, dist:linux
```

La app de macOS recibe una firma ad-hoc. Para distribuir sin avisos de
Gatekeeper o SmartScreen, fírmela con un Developer ID (macOS) o un
certificado de firma de código (Windows).

## Estructura del proyecto

```
src/main/       proceso principal (Node.js)
  main.js       ventana, IPC, verificación de claves del servidor
  remote.js     cliente unificado FTP/FTPS/SFTP
  queue.js      cola de transferencias
  store.js      sitios guardados y claves SSH de confianza
  preload.js    puente seguro entre el proceso principal y la interfaz
src/renderer/   interfaz (HTML5, CSS, JavaScript)
```

## Stack

Electron · Node.js · [basic-ftp](https://github.com/patrickjuchli/basic-ftp) ·
[ssh2-sftp-client](https://github.com/theophilusx/ssh2-sftp-client) · HTML5 · CSS · JavaScript

## Licencia

Barca se distribuye bajo **doble licencia**:

- [AGPLv3](LICENSE) — gratuita, siempre que cualquier versión modificada
  (incluido su uso como servicio en red) también se ponga a disposición bajo
  la misma licencia.
- [Licencia comercial](COMMERCIAL-LICENSE.es.md) — una garantía, no un
  producto: vender Barca o usarla en software de código cerrado requiere la
  autorización expresa del mantenedor.

Las contribuciones están sujetas a los términos de [CONTRIBUTING.es.md](CONTRIBUTING.es.md).

Las dependencias de terceros conservan sus propias licencias (MIT, Apache-2.0,
BSD-3-Clause, ISC, Unlicense), todas compatibles con ambas opciones de licencia.

Copyright © 2026 Roger Philippe Pereira
