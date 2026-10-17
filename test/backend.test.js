'use strict';
// Testa RemoteClient e TransferQueue contra servidores FTP e SFTP locais: node test/backend.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RemoteClient } = require('../src/main/remote');
const { TransferQueue } = require('../src/main/queue');
const { startFtp, startSftp, USER, PASSWORD } = require('./servers');

const logs = [];
const log = (level, msg) => logs.push(`[${level}] ${msg}`);
const hooks = { log, verifyHostKey: async () => true };

function idle(queue) {
  return new Promise((resolve) => {
    const check = () => {
      if (queue.jobs.every((j) => j.status !== 'queued' && j.status !== 'active')) resolve();
      else setTimeout(check, 20);
    };
    check();
  });
}

async function suite(protocol, port, work) {
  const config = { protocol, host: '127.0.0.1', port, user: USER, password: PASSWORD };
  const big = path.join(work, 'big.bin');
  fs.writeFileSync(big, Buffer.alloc(8 * 1024 * 1024, 7));
  const tree = path.join(work, 'tree');
  fs.mkdirSync(path.join(tree, 'sub', 'deep'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'a.txt'), 'olá mundo');
  fs.writeFileSync(path.join(tree, 'sub', 'b.txt'), 'bbb');
  fs.writeFileSync(path.join(tree, 'sub', 'deep', 'c.txt'), 'ccc');

  const c = new RemoteClient(config, hooks);
  await c.connect();
  const pwd = await c.run(() => c.pwd());
  const base = path.posix.join(pwd, `t${Date.now()}`);
  await c.run(() => c.mkdir(base));

  let progress = 0;
  await c.run(() => c.upload(big, `${base}/big.bin`, (b) => (progress = Math.max(progress, b))));
  assert.equal(progress, 8 * 1024 * 1024, 'progresso do upload chega ao total');
  let list = await c.run(() => c.list(base));
  assert.deepEqual(
    list.map((e) => [e.name, e.size, e.isDir]),
    [['big.bin', 8388608, false]],
  );

  assert.equal(await c.run(() => c.exists(`${base}/big.bin`)), true);
  assert.equal(await c.run(() => c.exists(`${base}/nao-existe`)), false);

  await c.run(() => c.rename(`${base}/big.bin`, `${base}/grande.bin`));
  await c.run(() => c.chmod(`${base}/grande.bin`, 0o640));
  list = await c.run(() => c.list(base));
  assert.equal(list[0].name, 'grande.bin');

  const dl = path.join(work, 'dl.bin');
  await c.run(() => c.download(`${base}/grande.bin`, dl, () => {}));
  assert.equal(fs.statSync(dl).size, 8388608);

  const q = new TransferQueue({ createClient: (cfg) => new RemoteClient(cfg, hooks), log });
  q.add([{ direction: 'up', local: tree, remote: `${base}/tree`, isDir: true }], config);
  await idle(q);
  assert.ok(
    q.jobs.every((j) => j.status === 'done'),
    'upload recursivo concluído',
  );
  assert.equal(q.jobs.length, 4);

  const back = path.join(work, 'back');
  q.add([{ direction: 'down', remote: `${base}/tree`, local: back, isDir: true }], config);
  await idle(q);
  assert.equal(fs.readFileSync(path.join(back, 'sub', 'deep', 'c.txt'), 'utf8'), 'ccc');
  assert.equal(fs.readFileSync(path.join(back, 'a.txt'), 'utf8'), 'olá mundo');

  q.clearFinished();
  q.setOverwrite('skip');
  q.add([{ direction: 'up', local: path.join(tree, 'a.txt'), remote: `${base}/tree/a.txt`, size: 10 }], config);
  await idle(q);
  assert.equal(q.jobs[0].status, 'skipped');
  q.setOverwrite('overwrite');

  q.clearFinished();
  const huge = path.join(work, 'huge.bin');
  fs.writeFileSync(huge, Buffer.alloc(200 * 1024 * 1024, 1));
  q.add([{ direction: 'up', local: huge, remote: `${base}/huge.bin`, size: 200 * 1024 * 1024 }], config);
  await new Promise((resolve) => {
    const t = setInterval(() => {
      if (q.jobs[0].status === 'active') {
        clearInterval(t);
        resolve();
      }
    }, 2);
  });
  q.cancel(q.jobs[0].id);
  await idle(q);
  assert.equal(q.jobs[0].status, 'canceled');

  q.add([{ direction: 'up', local: path.join(tree, 'a.txt'), remote: `${base}/depois.txt`, size: 10 }], config);
  await idle(q);
  assert.equal(q.jobs[1].status, 'done', 'a fila continua funcionando após um cancelamento');

  await c.run(() => c.remove(base, true));
  const names = (await c.run(() => c.list(pwd))).map((e) => e.name);
  assert.equal(names.includes(path.posix.basename(base)), false);

  await q.shutdown();
  await c.close();
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'barca-test-'));
  const ftp = await startFtp(path.join(work, 'ftp-root'), 2121);
  const sftp = await startSftp(path.join(work, 'sftp-root'), 2222);
  try {
    for (const [protocol, port] of [
      ['ftp', 2121],
      ['sftp', 2222],
    ]) {
      const dir = path.join(work, protocol);
      fs.mkdirSync(dir);
      await suite(protocol, port, dir);
      console.log(`OK ${protocol.toUpperCase()} (${process.platform})`);
    }
  } finally {
    await ftp.close();
    sftp.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('FALHOU:', e);
    console.error(logs.slice(-20).join('\n'));
    process.exit(1);
  },
);
