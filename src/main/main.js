'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, nativeTheme } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const posix = path.posix;
const { RemoteClient } = require('./remote');
const { TransferQueue } = require('./queue');
const { SiteStore, HostKeyStore } = require('./store');

app.setName('Barca');

let win = null;
let session = null; // { config, client, label }
let sites;
let hostKeys;

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function log(level, msg) {
  send('log', { level, msg: String(msg), time: Date.now() });
}

async function verifyHostKey({ host, port, key }) {
  const hostId = `${host}:${port}`;
  const fp = HostKeyStore.fingerprint(key);
  const state = hostKeys.check(hostId, fp);
  if (state === 'trusted') return true;

  if (state === 'unknown') {
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      message: 'Chave do servidor desconhecida',
      detail:
        `A chave deste servidor ainda não é conhecida.\n\nServidor: ${hostId}\nImpressão digital: ${fp}\n\n` +
        'Confira a impressão digital com o administrador do servidor antes de confiar.',
      buttons: ['Confiar sempre', 'Confiar só desta vez', 'Cancelar'],
      defaultId: 0,
      cancelId: 2,
    });
    if (response === 2) {
      log('error', `Chave de ${hostId} rejeitada pelo usuário`);
      return false;
    }
    hostKeys.trust(hostId, fp, response === 0);
    log('info', `Chave de ${hostId} aceita: ${fp}`);
    return true;
  }

  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    message: 'ATENÇÃO: a chave do servidor mudou!',
    detail:
      `A chave de ${hostId} é diferente da registrada anteriormente. Isso pode indicar um ataque ` +
      `man-in-the-middle ou uma reinstalação do servidor.\n\nNova impressão digital: ${fp}`,
    buttons: ['Cancelar conexão', 'Confiar na nova chave'],
    defaultId: 0,
    cancelId: 0,
  });
  if (response !== 1) {
    log('error', `Conexão a ${hostId} cancelada: chave do servidor mudou`);
    return false;
  }
  hostKeys.trust(hostId, fp, true);
  return true;
}

function createClient(config) {
  return new RemoteClient(config, { log, verifyHostKey });
}

const queue = new TransferQueue({ createClient, log, concurrency: 2 });
queue.on('update', (jobs) => send('queue:update', jobs));
queue.on('done', (info) => send('queue:done', info));

function requireSession() {
  if (!session) throw new Error('Não conectado');
  return session.client;
}

function expandHome(p) {
  if (!p) return os.homedir();
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

async function listLocal(dir) {
  const full = path.resolve(expandHome(dir));
  const dirents = await fs.promises.readdir(full, { withFileTypes: true });
  const entries = await Promise.all(
    dirents.map(async (d) => {
      const st = await fs.promises.stat(path.join(full, d.name)).catch(() => null);
      return {
        name: d.name,
        size: st?.size ?? 0,
        isDir: st ? st.isDirectory() : d.isDirectory(),
        isLink: d.isSymbolicLink(),
        mtime: st?.mtimeMs ?? null,
      };
    }),
  );
  return { path: full, entries };
}

async function disconnect() {
  if (!session) return;
  const { client, label } = session;
  session = null;
  await client.close();
  log('info', `Desconectado de ${label}`);
}

/** Registra um handler IPC que devolve { ok, value } ou { ok: false, error }. */
function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });
}

function registerIpc() {
  // Sistema de arquivos local
  handle('local:home', () => os.homedir());
  handle('local:list', (dir) => listLocal(dir));
  handle('local:mkdir', (p) => fs.promises.mkdir(p));
  handle('local:rename', async (from, to) => {
    if (fs.existsSync(to)) throw new Error('Já existe um item com esse nome');
    await fs.promises.rename(from, to);
  });
  handle('local:trash', async (paths) => {
    for (const p of paths) await shell.trashItem(p);
  });
  handle('local:reveal', (p) => shell.showItemInFolder(p));

  // Servidor remoto
  handle('remote:connect', async (params) => {
    await disconnect();
    const config = params.siteId ? sites.get(params.siteId) : { ...params };
    if (!config.host) throw new Error('Informe o servidor');
    const client = createClient(config);
    try {
      await client.connect();
      const start = config.remoteDir || (await client.run(() => client.pwd())) || '/';
      const label = config.name || `${config.user || 'anonymous'}@${config.host}`;
      session = { config, client, label };
      return { path: posix.normalize(start), label, localDir: config.localDir || null };
    } catch (e) {
      await client.close();
      log('error', `Falha ao conectar: ${e.message}`);
      throw e;
    }
  });
  handle('remote:disconnect', () => disconnect());
  handle('remote:list', async (dir) => {
    const client = requireSession();
    const p = posix.normalize(dir || '/');
    const entries = await client.run(() => client.list(p));
    return { path: p, entries };
  });
  handle('remote:mkdir', (p) => {
    const client = requireSession();
    return client.run(() => client.mkdir(p));
  });
  handle('remote:rename', (from, to) => {
    const client = requireSession();
    return client.run(() => client.rename(from, to));
  });
  handle('remote:delete', async (items) => {
    const client = requireSession();
    for (const it of items) {
      await client.run(() => client.remove(it.path, it.isDir));
      log('info', `Excluído: ${it.path}`);
    }
  });
  handle('remote:chmod', async (paths, mode) => {
    const client = requireSession();
    for (const p of paths) await client.run(() => client.chmod(p, mode));
    log('info', `Permissões alteradas para ${mode.toString(8)} em ${paths.length} item(ns)`);
  });

  // Fila
  handle('queue:add', async (items) => {
    requireSession();
    const resolved = [];
    for (const it of items) {
      if (it.direction === 'up') {
        const st = await fs.promises.stat(it.local);
        resolved.push({ ...it, isDir: st.isDirectory(), size: st.isDirectory() ? 0 : st.size });
      } else {
        resolved.push(it);
      }
    }
    queue.add(resolved, session.config);
  });
  handle('queue:cancel', (id) => queue.cancel(id));
  handle('queue:cancelAll', () => queue.cancelAll());
  handle('queue:retry', (id) => queue.retry(id));
  handle('queue:clearFinished', () => queue.clearFinished());
  handle('queue:clearFailed', () => queue.clearFailed());
  handle('queue:setOverwrite', (mode) => queue.setOverwrite(mode));

  // Gerenciador de sites
  handle('sites:list', () => sites.list());
  handle('sites:save', (site) => sites.save(site));
  handle('sites:delete', (id) => sites.remove(id));

  // Diálogos nativos
  handle('dialog:pickFile', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Escolher chave privada',
      defaultPath: path.join(os.homedir(), '.ssh'),
      properties: ['openFile', 'showHiddenFiles'],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('dialog:pickDir', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: 'Barca',
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1d21' : '#f5f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(() => {
  const data = app.getPath('userData');
  sites = new SiteStore(path.join(data, 'sites.json'), safeStorage);
  hostKeys = new HostKeyStore(path.join(data, 'known_hosts.json'));
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (!win) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  queue.shutdown();
  session?.client.close();
});
