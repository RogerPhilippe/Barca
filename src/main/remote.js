'use strict';
// Cliente remoto unificado: a mesma interface para FTP, FTPS (explícito/implícito) e SFTP.
const fs = require('node:fs');
const ftp = require('basic-ftp');
const SftpClient = require('ssh2-sftp-client');

const DEFAULT_PORTS = { ftp: 21, ftps: 21, 'ftps-implicit': 990, sftp: 22 };
const LISTING_LINE = /^([-dlbcps][-rwxsStT]{9}|\S*type=\S+;)/i;
const CONN_ERROR =/not connected|no sftp connection|ECONNRESET|EPIPE|socket|closed|ended|timeout/i;

function triad(r, w, x) {
  return (r ? 'r' : '-') + (w ? 'w' : '-') + (x ? 'x' : '-');
}

function permsFromFtp(p) {
  if (!p) return '';
  const t = (n) => triad(n & 4, n & 2, n & 1);
  return t(p.user) + t(p.group) + t(p.world);
}

function permsFromSftp(r) {
  if (!r) return '';
  const t = (s = '') => triad(s.includes('r'), s.includes('w'), s.includes('x'));
  return t(r.user) + t(r.group) + t(r.other);
}

class RemoteClient {
  /**
   * @param {object} config { protocol, host, port, user, password, keyFile, passphrase, insecure }
   * @param {object} hooks  { log(level, msg), verifyHostKey({host, port, key}) => Promise<boolean> }
   */
  constructor(config, { log, verifyHostKey }) {
    this.config = config;
    this.log = log;
    this.verifyHostKey = verifyHostKey;
    this.c = null;
    this.connected = false;
    this.aborting = false;
    this._chain = Promise.resolve();
  }

  get isSftp() {
    return this.config.protocol === 'sftp';
  }

  get port() {
    return Number(this.config.port) || DEFAULT_PORTS[this.config.protocol] || 21;
  }

  async connect() {
    const { host, user, password, protocol } = this.config;
    this.log('info', `Conectando a ${host}:${this.port} (${protocol.toUpperCase()})…`);
    if (this.isSftp) await this._connectSftp();
    else await this._connectFtp();
    this.connected = true;
    this.log('ok', `Conectado a ${host} como ${user || 'anonymous'}`);
    if (protocol === 'ftp' && password) {
      this.log('warn', 'FTP sem criptografia: usuário e senha trafegam em texto puro. Prefira FTPS ou SFTP.');
    }
  }

  async _connectFtp() {
    const { host, user, password, protocol, insecure } = this.config;
    const c = new ftp.Client(30000);
    c.ftp.verbose = true;
    c.ftp.log = (msg) => {
      const m = msg.trim();
      if (!LISTING_LINE.test(m)) this.log('cmd', m); // não despeja a listagem crua no log
    };
    await c.access({
      host,
      port: this.port,
      user: user || 'anonymous',
      password: password || '',
      secure: protocol === 'ftps' ? true : protocol === 'ftps-implicit' ? 'implicit' : false,
      secureOptions: insecure ? { rejectUnauthorized: false } : undefined,
    });
    this.c = c;
  }

  async _connectSftp() {
    const { host, user, password, keyFile, passphrase } = this.config;
    const c = new SftpClient('barca');
    const opts = {
      host,
      port: this.port,
      username: user,
      readyTimeout: 20000,
      tryKeyboard: true,
      hostVerifier: (key, verify) => {
        this.verifyHostKey({ host, port: this.port, key }).then(verify, () => verify(false));
      },
    };
    if (password) opts.password = password;
    if (keyFile) {
      opts.privateKey = fs.readFileSync(keyFile);
      if (passphrase) opts.passphrase = passphrase;
    }
    c.on('keyboard-interactive', (_name, _instr, _lang, prompts, finish) => {
      finish(prompts.map(() => password || ''));
    });
    c.on('close', () => {
      this.connected = false;
    });
    await c.connect(opts);
    this.c = c;
  }

  async close() {
    const c = this.c;
    this.c = null;
    this.connected = false;
    if (!c) return;
    try {
      if (this.isSftp) await c.end();
      else c.close();
    } catch {
      /* conexão já encerrada */
    }
  }

  /** Interrompe a operação em andamento (cancelamento de transferência). */
  abort() {
    this.aborting = true;
    return this.close();
  }

  /** Executa operações em série e reconecta uma vez se a conexão tiver caído. */
  run(fn) {
    const task = this._chain.then(() => this._exec(fn));
    this._chain = task.catch(() => {});
    return task;
  }

  async _exec(fn) {
    if (this.aborting) throw new Error('Cancelado');
    if (!this.connected || (!this.isSftp && this.c?.closed)) await this.connect();
    try {
      return await fn();
    } catch (e) {
      if (this.aborting) throw new Error('Cancelado');
      const lost = this.isSftp ? !this.connected || CONN_ERROR.test(e.message) : this.c?.closed;
      if (!lost) throw e;
      this.log('warn', `Conexão perdida (${e.message}). Reconectando…`);
      await this.close();
      await this.connect();
      return await fn();
    }
  }

  // As operações abaixo devem ser chamadas dentro de run().

  async pwd() {
    return this.isSftp ? this.c.cwd() : this.c.pwd();
  }

  async list(dir) {
    if (this.isSftp) {
      const items = await this.c.list(dir);
      return items
        .filter((i) => i.name !== '.' && i.name !== '..')
        .map((i) => ({
          name: i.name,
          size: i.size,
          isDir: i.type === 'd',
          isLink: i.type === 'l',
          mtime: i.modifyTime || null,
          perms: permsFromSftp(i.rights),
        }));
    }
    const items = await this.c.list(dir);
    return items
      .filter((i) => i.name !== '.' && i.name !== '..')
      .map((i) => ({
        name: i.name,
        size: i.size,
        isDir: i.isDirectory,
        isLink: i.isSymbolicLink,
        mtime: i.modifiedAt ? i.modifiedAt.getTime() : null,
        mtimeRaw: i.rawModifiedAt || '', // LIST sem MLSD só traz a data em texto
        perms: permsFromFtp(i.permissions),
      }));
  }

  async mkdir(p) {
    if (this.isSftp) await this.c.mkdir(p, false);
    else await this.c.send(`MKD ${p}`);
  }

  async mkdirp(p) {
    if (this.isSftp) await this.c.mkdir(p, true);
    else await this.c.ensureDir(p);
  }

  async rename(from, to) {
    await this.c.rename(from, to);
  }

  async remove(p, isDir) {
    if (this.isSftp) {
      if (isDir) await this.c.rmdir(p, true);
      else await this.c.delete(p);
    } else if (isDir) {
      await this.c.removeDir(p);
    } else {
      await this.c.remove(p);
    }
  }

  async chmod(p, mode) {
    if (this.isSftp) await this.c.chmod(p, mode);
    else await this.c.send(`SITE CHMOD ${mode.toString(8)} ${p}`);
  }

  async exists(p) {
    if (this.isSftp) return Boolean(await this.c.exists(p));
    try {
      await this.c.size(p);
      return true;
    } catch {
      return false;
    }
  }

  async upload(local, remote, onProgress) {
    if (this.isSftp) {
      await this.c.fastPut(local, remote, { step: (done) => onProgress(done) });
      return;
    }
    this.c.trackProgress((info) => onProgress(info.bytes));
    try {
      await this.c.uploadFrom(local, remote);
    } finally {
      this.c.trackProgress();
    }
  }

  async download(remote, local, onProgress) {
    if (this.isSftp) {
      await this.c.fastGet(remote, local, { step: (done) => onProgress(done) });
      return;
    }
    this.c.trackProgress((info) => onProgress(info.bytes));
    try {
      await this.c.downloadTo(local, remote);
    } finally {
      this.c.trackProgress();
    }
  }
}

module.exports = { RemoteClient, DEFAULT_PORTS };
