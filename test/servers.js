'use strict';
// Servidores FTP e SFTP locais para os testes. Cada um serve um diretório como raiz "/".
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Server, utils } = require('ssh2');
const FtpSrv = require('ftp-srv');

const USER = 'test';
const PASSWORD = 'secret';

const silentLog = {
  info() {},
  debug() {},
  trace() {},
  warn() {},
  error() {},
  child() {
    return this;
  },
};

async function startFtp(root, port) {
  fs.mkdirSync(root, { recursive: true });
  const server = new FtpSrv({
    url: `ftp://127.0.0.1:${port}`,
    pasv_url: '127.0.0.1',
    pasv_min: port + 1000,
    pasv_max: port + 1100,
    anonymous: false,
    log: silentLog,
  });
  server.on('login', ({ username, password }, resolve, reject) => {
    if (username === USER && password === PASSWORD) resolve({ root });
    else reject(new Error('login inválido'));
  });
  await server.listen();
  return { close: () => server.close() };
}

function startSftp(root, port) {
  const { STATUS_CODE } = utils.sftp;
  fs.mkdirSync(root, { recursive: true });
  const keys = utils.generateKeyPairSync('ed25519');
  const wire = Buffer.from(keys.public.split(' ')[1], 'base64');
  const fingerprint = `SHA256:${crypto.createHash('sha256').update(wire).digest('base64').replace(/=+$/, '')}`;

  const real = (p) => path.join(root, path.posix.normalize(`/${p}`));
  const attrsOf = (st) => ({
    mode: st.mode,
    uid: 0,
    gid: 0,
    size: st.size,
    atime: Math.floor(st.atimeMs / 1000),
    mtime: Math.floor(st.mtimeMs / 1000),
  });
  const longname = (name, st) => {
    const type = st.isDirectory() ? 'd' : st.isSymbolicLink() ? 'l' : '-';
    let perms = '';
    for (let i = 8; i >= 0; i--) perms += st.mode & (1 << i) ? 'rwx'[(8 - i) % 3] : '-';
    return `${type}${perms} 1 test test ${st.size} Jan 1 00:00 ${name}`;
  };
  const code = (err) =>
    err?.code === 'ENOENT'
      ? STATUS_CODE.NO_SUCH_FILE
      : err?.code === 'EACCES' || err?.code === 'EPERM'
        ? STATUS_CODE.PERMISSION_DENIED
        : STATUS_CODE.FAILURE;

  const server = new Server({ hostKeys: [keys.private] }, (client) => {
    client.on('error', () => {});
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === USER && ctx.password === PASSWORD) ctx.accept();
      else ctx.reject(['password']);
    });
    client.on('ready', () => {
      client.on('session', (acceptSession) => {
        acceptSession().on('sftp', (acceptSftp) => {
          const sftp = acceptSftp();
          const handles = new Map();
          let next = 0;
          const newHandle = (value) => {
            const h = Buffer.alloc(4);
            h.writeUInt32BE(next++);
            handles.set(h.toString('hex'), value);
            return h;
          };
          const get = (h) => handles.get(h.toString('hex'));
          const done = (id) => (err) => sftp.status(id, err ? code(err) : STATUS_CODE.OK);
          const stat = (id, p) =>
            fs.stat(real(p), (err, st) => (err ? sftp.status(id, code(err)) : sftp.attrs(id, attrsOf(st))));

          sftp.on('OPEN', (id, file, flags) => {
            const mode = utils.sftp.flagsToString(flags) || 'r';
            fs.open(real(file), mode, (err, fd) => (err ? sftp.status(id, code(err)) : sftp.handle(id, newHandle({ fd }))));
          });
          sftp.on('READ', (id, h, offset, len) => {
            const buf = Buffer.alloc(len);
            fs.read(get(h).fd, buf, 0, len, offset, (err, n) => {
              if (err) sftp.status(id, code(err));
              else if (n === 0) sftp.status(id, STATUS_CODE.EOF);
              else sftp.data(id, buf.subarray(0, n));
            });
          });
          sftp.on('WRITE', (id, h, offset, data) => fs.write(get(h).fd, data, 0, data.length, offset, done(id)));
          sftp.on('CLOSE', (id, h) => {
            const v = get(h);
            handles.delete(h.toString('hex'));
            if (v?.fd != null) fs.close(v.fd, done(id));
            else sftp.status(id, STATUS_CODE.OK);
          });
          sftp.on('FSTAT', (id, h) =>
            fs.fstat(get(h).fd, (err, st) => (err ? sftp.status(id, code(err)) : sftp.attrs(id, attrsOf(st)))),
          );
          sftp.on('STAT', stat);
          sftp.on('LSTAT', stat);
          sftp.on('OPENDIR', (id, p) =>
            fs.stat(real(p), (err, st) =>
              err || !st.isDirectory()
                ? sftp.status(id, code(err))
                : sftp.handle(id, newHandle({ dir: real(p), sent: false })),
            ),
          );
          sftp.on('READDIR', (id, h) => {
            const d = get(h);
            if (d.sent) return sftp.status(id, STATUS_CODE.EOF);
            d.sent = true;
            const names = fs.readdirSync(d.dir).map((n) => {
              const st = fs.lstatSync(path.join(d.dir, n));
              return { filename: n, longname: longname(n, st), attrs: attrsOf(st) };
            });
            if (!names.length) return sftp.status(id, STATUS_CODE.EOF);
            return sftp.name(id, names);
          });
          sftp.on('REALPATH', (id, p) =>
            sftp.name(id, [{ filename: path.posix.normalize(`/${p === '.' ? '' : p}`), longname: '', attrs: {} }]),
          );
          sftp.on('MKDIR', (id, p) => fs.mkdir(real(p), done(id)));
          sftp.on('RMDIR', (id, p) => fs.rmdir(real(p), done(id)));
          sftp.on('REMOVE', (id, p) => fs.unlink(real(p), done(id)));
          sftp.on('RENAME', (id, a, b) => fs.rename(real(a), real(b), done(id)));
          sftp.on('SETSTAT', (id, p, attrs) =>
            attrs.mode != null ? fs.chmod(real(p), attrs.mode, done(id)) : sftp.status(id, STATUS_CODE.OK),
          );
          sftp.on('FSETSTAT', (id) => sftp.status(id, STATUS_CODE.OK));
        });
      });
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ fingerprint, close: () => server.close() }));
  });
}

module.exports = { startFtp, startSftp, USER, PASSWORD };
