'use strict';
// Persistência em userData: sites salvos (segredos cifrados com safeStorage/Keychain) e chaves SSH confiáveis.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SECRET_FIELDS = ['password', 'passphrase'];

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

class SiteStore {
  constructor(file, safeStorage) {
    this.file = file;
    this.safeStorage = safeStorage;
    this.sites = readJson(file, []);
  }

  _encrypt(value) {
    if (!value) return '';
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('Criptografia do sistema indisponível: a senha não pode ser salva com segurança.');
    }
    return this.safeStorage.encryptString(value).toString('base64');
  }

  _decrypt(value) {
    if (!value) return '';
    return this.safeStorage.decryptString(Buffer.from(value, 'base64'));
  }

  /** Lista para a interface: sem segredos, apenas indicadores. */
  list() {
    return this.sites.map((s) => {
      const pub = { ...s, hasPassword: Boolean(s.password), hasPassphrase: Boolean(s.passphrase) };
      for (const f of SECRET_FIELDS) delete pub[f];
      return pub;
    });
  }

  /** Configuração completa, com segredos decifrados, para conectar. */
  get(id) {
    const s = this.sites.find((x) => x.id === id);
    if (!s) throw new Error('Site não encontrado');
    const out = { ...s };
    for (const f of SECRET_FIELDS) out[f] = this._decrypt(s[f]);
    return out;
  }

  /**
   * Salva um site. Campo secreto vazio mantém o valor existente; `clear<Campo>` remove.
   */
  save(input) {
    const existing = this.sites.find((x) => x.id === input.id);
    const site = {
      id: existing?.id || crypto.randomUUID(),
      name: String(input.name || input.host || 'Novo site').trim(),
      protocol: input.protocol || 'sftp',
      host: String(input.host || '').trim(),
      port: input.port ? Number(input.port) : '',
      user: String(input.user || ''),
      keyFile: input.keyFile || '',
      insecure: Boolean(input.insecure),
      remoteDir: input.remoteDir || '',
      localDir: input.localDir || '',
    };
    for (const f of SECRET_FIELDS) {
      const clearKey = `clear${f[0].toUpperCase()}${f.slice(1)}`;
      if (input[clearKey]) site[f] = '';
      else if (input[f]) site[f] = this._encrypt(input[f]);
      else site[f] = existing?.[f] || '';
    }
    if (existing) Object.assign(existing, site);
    else this.sites.push(site);
    this.sites.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    writeJson(this.file, this.sites);
    return this.list().find((s) => s.id === site.id);
  }

  remove(id) {
    this.sites = this.sites.filter((s) => s.id !== id);
    writeJson(this.file, this.sites);
  }
}

class HostKeyStore {
  constructor(file) {
    this.file = file;
    this.keys = readJson(file, {});
    this.session = new Map(); // confiança apenas nesta execução
  }

  static fingerprint(key) {
    return `SHA256:${crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
  }

  /** @returns {'trusted'|'unknown'|'changed'} */
  check(hostId, fp) {
    const known = this.session.get(hostId) || this.keys[hostId];
    if (!known) return 'unknown';
    return known === fp ? 'trusted' : 'changed';
  }

  trust(hostId, fp, permanent) {
    this.session.set(hostId, fp);
    if (permanent) {
      this.keys[hostId] = fp;
      writeJson(this.file, this.keys);
    }
  }
}

module.exports = { SiteStore, HostKeyStore };
