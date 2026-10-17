'use strict';
// Fila de transferências: cada worker usa a própria conexão, separada da conexão de navegação.
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const posix = path.posix;

let nextId = 1;

class TransferQueue extends EventEmitter {
  /**
   * @param {object} opts { createClient(config) => RemoteClient, log(level, msg), concurrency }
   */
  constructor({ createClient, log, concurrency = 2 }) {
    super();
    this.createClient = createClient;
    this.log = log;
    this.jobs = [];
    this.workers = Array.from({ length: concurrency }, () => ({ client: null, config: null, job: null }));
    this.overwrite = 'overwrite';
    this._emitTimer = null;
  }

  _make(item, config) {
    return {
      id: nextId++,
      direction: item.direction,
      local: item.local,
      remote: item.remote,
      isDir: Boolean(item.isDir),
      size: item.size || 0,
      transferred: 0,
      speed: 0,
      fileCount: 0,
      status: 'queued',
      error: null,
      config,
    };
  }

  add(items, config) {
    this.jobs.push(...items.map((it) => this._make(it, config)));
    this._changed();
    this._pump();
  }

  setOverwrite(mode) {
    this.overwrite = mode === 'skip' ? 'skip' : 'overwrite';
  }

  cancel(id) {
    const job = this.jobs.find((j) => j.id === id);
    if (job) this._cancelJob(job);
    this._changed();
  }

  cancelAll() {
    for (const job of this.jobs) this._cancelJob(job);
    this._changed();
  }

  _cancelJob(job) {
    if (job.status === 'queued') {
      job.status = 'canceled';
    } else if (job.status === 'active') {
      job.status = 'canceled';
      const w = this.workers.find((wk) => wk.job === job);
      if (w?.client) {
        w.client.abort();
        w.client = null;
        w.config = null;
      }
    }
  }

  retry(id) {
    for (const job of this.jobs) {
      if ((id == null || job.id === id) && (job.status === 'failed' || job.status === 'canceled')) {
        Object.assign(job, { status: 'queued', error: null, transferred: 0, speed: 0 });
      }
    }
    this._changed();
    this._pump();
  }

  clearFinished() {
    this.jobs = this.jobs.filter((j) => j.status === 'queued' || j.status === 'active' || j.status === 'failed');
    this._changed();
  }

  clearFailed() {
    this.jobs = this.jobs.filter((j) => j.status !== 'failed');
    this._changed();
  }

  async shutdown() {
    this.cancelAll();
    await Promise.all(this.workers.map((w) => w.client?.close()));
  }

  snapshot() {
    return this.jobs.map(({ config, ...job }) => job);
  }

  _changed() {
    if (this._emitTimer) return;
    this._emitTimer = setTimeout(() => {
      this._emitTimer = null;
      this.emit('update', this.snapshot());
    }, 120);
  }

  _pump() {
    for (const w of this.workers) {
      if (w.job) continue;
      const job = this.jobs.find((j) => j.status === 'queued');
      if (!job) return;
      job.status = 'active';
      w.job = job;
      this._run(w, job).finally(() => {
        w.job = null;
        this._changed();
        this._pump();
      });
    }
  }

  async _clientFor(w, config) {
    if (w.client && w.config === config) return w.client;
    if (w.client) await w.client.close();
    w.client = this.createClient(config);
    w.config = config;
    return w.client;
  }

  async _run(w, job) {
    try {
      const client = await this._clientFor(w, job.config);
      if (job.isDir) await this._expand(client, job);
      else await this._transfer(client, job);
      if (job.status === 'active') job.status = 'done';
    } catch (e) {
      if (job.status === 'canceled') return;
      job.status = 'failed';
      job.error = e.message;
      const name = job.direction === 'up' ? job.local : job.remote;
      this.log('error', `Falha na transferência de ${name}: ${e.message}`);
    }
  }

  async _transfer(client, job) {
    if (this.overwrite === 'skip') {
      const exists =
        job.direction === 'up' ? await client.run(() => client.exists(job.remote)) : fs.existsSync(job.local);
      if (exists) {
        job.status = 'skipped';
        return;
      }
    }

    const started = Date.now();
    let mark = started;
    let markBytes = 0;
    const onProgress = (bytes) => {
      job.transferred = bytes;
      const now = Date.now();
      if (now - mark >= 500) {
        job.speed = ((bytes - markBytes) * 1000) / (now - mark);
        mark = now;
        markBytes = bytes;
      }
      this._changed();
    };

    if (job.direction === 'up') {
      await client.run(() => client.upload(job.local, job.remote, onProgress));
    } else {
      await fs.promises.mkdir(path.dirname(job.local), { recursive: true });
      await client.run(() => client.download(job.remote, job.local, onProgress));
    }
    if (job.status !== 'active') return;

    job.size = Math.max(job.size, job.transferred);
    job.transferred = job.size;
    job.speed = 0;
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const arrow = job.direction === 'up' ? 'enviado' : 'baixado';
    this.log('ok', `${posix.basename(job.remote)} ${arrow} com sucesso (${secs} s)`);
    this.emit('done', { direction: job.direction, local: job.local, remote: job.remote });
  }

  /** Expande uma pasta em jobs de arquivo, criando a estrutura de diretórios no destino. */
  async _expand(client, job) {
    const children = [];
    if (job.direction === 'up') {
      await client.run(() => client.mkdirp(job.remote));
      const walk = async (ldir, rdir) => {
        for (const d of await fs.promises.readdir(ldir, { withFileTypes: true })) {
          if (job.status !== 'active') return;
          const l = path.join(ldir, d.name);
          const r = posix.join(rdir, d.name);
          const st = await fs.promises.stat(l).catch(() => null);
          if (!st) continue;
          if (st.isDirectory()) {
            if (d.isSymbolicLink()) continue; // evita laços de links simbólicos
            await client.run(() => client.mkdirp(r));
            await walk(l, r);
          } else {
            children.push({ direction: 'up', local: l, remote: r, size: st.size });
          }
        }
      };
      await walk(job.local, job.remote);
    } else {
      await fs.promises.mkdir(job.local, { recursive: true });
      const walk = async (rdir, ldir) => {
        for (const e of await client.run(() => client.list(rdir))) {
          if (job.status !== 'active') return;
          const r = posix.join(rdir, e.name);
          const l = path.join(ldir, e.name);
          if (e.isDir) {
            await fs.promises.mkdir(l, { recursive: true });
            await walk(r, l);
          } else {
            children.push({ direction: 'down', remote: r, local: l, size: e.size });
          }
        }
      };
      await walk(job.remote, job.local);
    }
    if (job.status !== 'active') return;

    job.fileCount = children.length;
    job.size = children.reduce((sum, c) => sum + c.size, 0);
    const idx = this.jobs.indexOf(job);
    this.jobs.splice(idx + 1, 0, ...children.map((c) => this._make(c, job.config)));
    this.log('info', `Pasta ${posix.basename(job.remote)}: ${children.length} arquivo(s) adicionados à fila`);
    this.emit('done', { direction: job.direction, local: job.local, remote: job.remote });
  }
}

module.exports = { TransferQueue };
