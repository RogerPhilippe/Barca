'use strict';
// Teste de ponta a ponta da interface: npx electron test/smoke.js
// Conecta por SFTP, envia e baixa uma pasta pela interface, confere os arquivos e salva uma captura.
const { app, safeStorage } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startSftp, USER, PASSWORD } = require('./servers');

const PORT = 2222;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'barca-smoke-'));
const userData = path.join(work, 'userdata');
const serverRoot = path.join(work, 'server');
const localDir = path.join(work, 'local');
const outDir = path.join(__dirname, '..', 'test-output');
const consoleErrors = [];

fs.mkdirSync(path.join(localDir, 'pasta', 'sub'), { recursive: true });
fs.writeFileSync(path.join(localDir, 'a.txt'), 'arquivo a');
fs.writeFileSync(path.join(localDir, 'pasta', 'b.txt'), 'arquivo b');
fs.writeFileSync(path.join(localDir, 'pasta', 'sub', 'c.txt'), 'arquivo c');
app.setPath('userData', userData);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(e) {
  console.error('FALHOU:', e?.stack || e);
  app.exit(1);
}

setTimeout(() => fail(new Error('tempo esgotado')), 120000).unref();

// A lista da interface chega com atraso (atualizações agrupadas), então espera jobs da direção pedida.
async function untilIdle(wc, direction) {
  for (let i = 0; i < 300; i++) {
    const jobs = await wc.executeJavaScript(
      `QueueUI.jobs.filter((j) => j.direction === '${direction}').map((j) => j.status)`,
    );
    if (jobs.length && jobs.every((s) => s !== 'queued' && s !== 'active')) return jobs;
    await wait(100);
  }
  throw new Error('a fila não terminou');
}

async function scenario(win) {
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(`(async () => { ${code} })()`);
  const step = (msg) => console.log(`• ${msg}`);

  step(`plataforma ${process.platform}, cofre de senhas: ${process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : 'nativo'}`);

  const local = await js(`await App.local.load(${JSON.stringify(localDir)}); return {
    path: App.local.path, parent: App.local.parent(App.local.path), rows: App.local.rows.map((r) => r.name),
    reveal: App.menuItems(App.local)[1].label }`);
  assert.equal(local.path.toLowerCase(), path.resolve(localDir).toLowerCase(), 'painel local abre a pasta');
  assert.equal(local.parent.toLowerCase(), path.dirname(path.resolve(localDir)).toLowerCase(), 'pasta acima');
  assert.deepEqual(local.rows, ['pasta', 'a.txt']);
  const expectedReveal = { darwin: 'Finder', win32: 'Explorador de Arquivos', linux: 'gerenciador de arquivos' }[process.platform];
  assert.equal(local.reveal, `Mostrar no ${expectedReveal}`);
  step(`painel local: ${local.path}`);

  if (process.platform === 'win32') {
    const nav = await js(`await App.local.load('C:\\\\'); const p = App.local.path; const up = App.local.parent(p);
      return { p, up, root: App.local.isRoot(p), hasDotDot: !!App.local.tbody.querySelector('.up-row') }`);
    assert.equal(nav.p, 'C:\\');
    assert.equal(nav.up, 'C:\\');
    assert.equal(nav.root, true);
    assert.equal(nav.hasDotDot, false, 'raiz do drive não mostra ".."');
    await js(`await App.local.load(${JSON.stringify(localDir)})`);
    step('navegação na raiz do drive C:\\ OK');
  }

  await js(`await App.connect({ protocol: 'sftp', host: '127.0.0.1', port: ${PORT}, user: '${USER}', password: '${PASSWORD}' })`);
  const connected = await js('return { ok: App.connected, path: App.remote.path }');
  assert.equal(connected.ok, true, 'conectado por SFTP');
  step(`conectado, pasta remota: ${connected.path}`);

  await js('App.transfer(App.local, App.local.rows)');
  const up = await untilIdle(wc, 'up');
  assert.ok(up.every((s) => s === 'done'), `envios concluídos: ${up}`);
  assert.equal(fs.readFileSync(path.join(serverRoot, 'a.txt'), 'utf8'), 'arquivo a');
  assert.equal(fs.readFileSync(path.join(serverRoot, 'pasta', 'sub', 'c.txt'), 'utf8'), 'arquivo c');
  step(`envio da pasta pela interface: ${up.length} job(s) concluídos`);

  const downDir = path.join(localDir, 'baixados');
  fs.mkdirSync(downDir);
  await js(`await oz.queue.clearFinished(); await App.local.load(${JSON.stringify(downDir)}); await App.remote.load('/');
    App.transfer(App.remote, App.remote.rows.filter((r) => r.name === 'pasta'))`);
  const down = await untilIdle(wc, 'down');
  assert.ok(down.every((s) => s === 'done'), `downloads concluídos: ${down}`);
  assert.equal(fs.readFileSync(path.join(downDir, 'pasta', 'sub', 'c.txt'), 'utf8'), 'arquivo c');
  step(`download da pasta pela interface: ${down.length} job(s) concluídos`);

  const save = await js(`try { await oz.sites.save({ name: 'teste', protocol: 'sftp', host: 'h', user: 'u', password: 'p' });
    return 'salvou'; } catch (e) { return e.message; }`);
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    assert.match(save, /não pode ser salva com segurança/, `Linux sem cofre deve recusar salvar senha, veio: ${save}`);
    step(`Linux sem cofre de senhas: salvar senha foi recusado, como esperado ("${save}")`);
  } else {
    assert.equal(save, 'salvou');
    step('senha salva no cofre do sistema');
  }

  await js(`await App.local.load(${JSON.stringify(localDir)}); await App.remote.refresh()`);
  await wait(400);
  fs.mkdirSync(outDir, { recursive: true });
  const shot = path.join(outDir, `smoke-${process.platform}.png`);
  fs.writeFileSync(shot, (await wc.capturePage()).toPNG());
  step(`captura salva em ${shot}`);

  assert.deepEqual(consoleErrors, [], 'sem erros no console da interface');
  console.log(`OK interface (${process.platform})`);
}

app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') consoleErrors.push(e.message);
  });
  win.webContents.on('preload-error', (_ev, _p, err) => consoleErrors.push(`preload: ${err.message}`));
  win.webContents.once('did-finish-load', () => {
    wait(500)
      .then(() => scenario(win))
      .then(() => app.exit(0), fail);
  });
});

startSftp(serverRoot, PORT).then(({ fingerprint }) => {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(path.join(userData, 'known_hosts.json'), JSON.stringify({ [`127.0.0.1:${PORT}`]: fingerprint }));
  require('../src/main/main.js');
}, fail);
