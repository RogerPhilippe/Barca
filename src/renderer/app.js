'use strict';
/* global oz */

// ---------- utilidades ----------

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);

function fmtSize(n) {
  if (n == null || Number.isNaN(n)) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < units.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0).replace('.', ',')} ${units[i]}`;
}

const fmtDate = (ms) =>
  ms ? new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';

const joinPath = (dir, name) => `${dir === '/' ? '' : dir.replace(/\/+$/, '')}/${name}`;

function parentPath(p) {
  const t = p.replace(/\/+$/, '');
  const i = t.lastIndexOf('/');
  return i <= 0 ? '/' : t.slice(0, i);
}

const baseName = (p) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

// Caminhos locais seguem o sistema: no Windows são "C:\pasta", nos demais são POSIX.
const PLATFORM = oz.platform;
const WIN = PLATFORM === 'win32';
const isDriveRoot = (p) => /^[A-Za-z]:[\\/]*$/.test(p);

function localJoin(dir, name) {
  if (!WIN) return joinPath(dir, name);
  return `${dir.replace(/[\\/]+$/, '')}\\${name}`;
}

function localParent(p) {
  if (!WIN) return parentPath(p);
  const t = p.replace(/[\\/]+$/, '');
  if (isDriveRoot(t)) return `${t}\\`;
  const i = Math.max(t.lastIndexOf('\\'), t.lastIndexOf('/'));
  if (i < 0) return p;
  const up = t.slice(0, i);
  return isDriveRoot(up) ? `${up}\\` : up;
}

const FILE_MANAGER = WIN ? 'Explorador de Arquivos' : PLATFORM === 'darwin' ? 'Finder' : 'gerenciador de arquivos';
const SECRET_STORE =
  PLATFORM === 'darwin'
    ? 'o Keychain do macOS'
    : WIN
      ? 'a proteção de dados do Windows'
      : 'o cofre de senhas do sistema (GNOME Keyring ou KWallet)';
const MOD_KEY = PLATFORM === 'darwin' ? '⌘' : 'Ctrl+';
document.body.classList.add(`platform-${PLATFORM}`);

const DEFAULT_PORTS = { sftp: 22, ftp: 21, ftps: 21, 'ftps-implicit': 990 };
const PROTO_LABELS = { sftp: 'SFTP', ftp: 'FTP', ftps: 'FTPS', 'ftps-implicit': 'FTPS implícito' };

function permsToMode(p) {
  if (!p || p.length < 9) return null;
  let m = 0;
  for (let i = 0; i < 9; i++) if (p[i] !== '-') m |= 1 << (8 - i);
  return m;
}

const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* armazenamento indisponível */
    }
  },
};

const ICONS = {
  folder:
    '<svg class="ico-folder" viewBox="0 0 16 16"><path fill="currentColor" d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3.2l1.6 1.6H13A1.5 1.5 0 0 1 14.5 5v7.5A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5z"/></svg>',
  file:
    '<svg class="ico-file" viewBox="0 0 16 16"><path fill="none" stroke="currentColor" stroke-width="1.2" d="M4 1.6h5.2L12.4 4.8v9.1a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2.1a.5.5 0 0 1 .5-.5zM9 1.8V5h3.2"/></svg>',
  link:
    '<svg class="ico-link" viewBox="0 0 16 16"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.8.8M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.8-.8"/></svg>',
  up: '<svg viewBox="0 0 16 16"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg>',
  refresh:
    '<svg viewBox="0 0 16 16"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.8h-2.8"/></svg>',
  home: '<svg viewBox="0 0 16 16"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" d="M2.5 7.5 8 2.8l5.5 4.7V13a.6.6 0 0 1-.6.6H9.6V10H6.4v3.6H3.1a.6.6 0 0 1-.6-.6z"/></svg>',
};

// ---------- registro de mensagens ----------

const Log = {
  el: $('#log'),
  add({ level = 'info', msg, time = Date.now() }) {
    const line = document.createElement('div');
    line.className = `log-line ${level}`;
    line.innerHTML = `<span class="t">${new Date(time).toLocaleTimeString('pt-BR')}</span><span class="m">${esc(msg)}</span>`;
    const stick = this.el.scrollTop + this.el.clientHeight >= this.el.scrollHeight - 10;
    this.el.append(line);
    while (this.el.childElementCount > 2000) this.el.firstChild.remove();
    if (stick) this.el.scrollTop = this.el.scrollHeight;
  },
  info(msg) {
    this.add({ level: 'info', msg });
  },
  ok(msg) {
    this.add({ level: 'ok', msg });
  },
  warn(msg) {
    this.add({ level: 'warn', msg });
  },
  error(msg) {
    this.add({ level: 'error', msg });
  },
};

// ---------- modais ----------

const modalStack = [];

/**
 * Abre um modal. Cada botão tem `value` (valor fixo ou função(body) que devolve o valor;
 * `undefined` mantém o modal aberto). Resolve com o valor escolhido ou null.
 */
function modal({ title, body, buttons = [{ label: 'OK', value: true, primary: true }], wide = false, onOpen }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const box = document.createElement('div');
    box.className = `modal${wide ? ' wide' : ''}`;
    box.innerHTML = `<div class="modal-title">${esc(title)}</div><div class="modal-body"></div><div class="modal-actions"></div>`;
    const bodyEl = $('.modal-body', box);
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.append(body);

    const entry = { close: null };
    const close = (value) => {
      backdrop.remove();
      modalStack.splice(modalStack.indexOf(entry), 1);
      document.removeEventListener('keydown', onKey, true);
      resolve(value);
    };
    entry.close = close;

    let primary = null;
    const actions = $('.modal-actions', box);
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn${b.primary ? ' primary' : ''}${b.danger ? ' danger' : ''}`;
      btn.textContent = b.label;
      btn.onclick = () => {
        const v = typeof b.value === 'function' ? b.value(bodyEl) : b.value;
        if (v !== undefined) close(v);
      };
      actions.append(btn);
      if (b.primary) primary = btn;
    }

    const onKey = (e) => {
      if (modalStack[modalStack.length - 1] !== entry) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(null);
      } else if (e.key === 'Enter' && primary && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        primary.click();
      }
    };
    document.addEventListener('keydown', onKey, true);
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) close(null);
    });

    modalStack.push(entry);
    backdrop.append(box);
    document.body.append(backdrop);
    Menu.hide();
    (bodyEl.querySelector('input:not([type=checkbox]),select') || primary)?.focus();
    onOpen?.(bodyEl, close);
  });
}

function promptDialog(title, label, initial = '') {
  return modal({
    title,
    body: `<label class="field"><span>${esc(label)}</span><input class="input" value="${esc(initial)}" spellcheck="false"></label>`,
    buttons: [
      { label: 'Cancelar', value: null },
      { label: 'OK', primary: true, value: (el) => $('input', el).value.trim() || undefined },
    ],
    onOpen: (el) => {
      const input = $('input', el);
      const dot = initial.lastIndexOf('.');
      input.setSelectionRange(0, dot > 0 ? dot : initial.length);
    },
  });
}

async function confirmDialog(title, message, okLabel = 'OK', danger = false) {
  const r = await modal({
    title,
    body: `<p>${esc(message)}</p>`,
    buttons: [
      { label: 'Cancelar', value: false },
      { label: okLabel, value: true, primary: true, danger },
    ],
  });
  return r === true;
}

// ---------- menu de contexto ----------

const Menu = {
  el: $('#menu'),
  show(x, y, items) {
    this.el.innerHTML = '';
    for (const it of items) {
      if (it === '-') {
        this.el.append(document.createElement('hr'));
        continue;
      }
      const b = document.createElement('button');
      b.textContent = it.label;
      b.disabled = Boolean(it.disabled);
      if (it.danger) b.className = 'danger';
      b.onclick = () => {
        this.hide();
        it.action();
      };
      this.el.append(b);
    }
    this.el.hidden = false;
    const { width, height } = this.el.getBoundingClientRect();
    this.el.style.left = `${Math.min(x, innerWidth - width - 6)}px`;
    this.el.style.top = `${Math.min(y, innerHeight - height - 6)}px`;
  },
  hide() {
    this.el.hidden = true;
  },
};

document.addEventListener('mousedown', (e) => {
  if (!Menu.el.contains(e.target)) Menu.hide();
});
window.addEventListener('blur', () => Menu.hide());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') Menu.hide();
});

// Impede que arquivos soltos fora das áreas válidas abram na janela.
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// ---------- painéis de arquivos ----------

let dragState = null; // { from: Pane, dir, entries } durante um arrasto interno

class Pane {
  constructor(side) {
    this.side = side;
    this.el = $(`#pane-${side}`);
    this.path = '';
    this.entries = [];
    this.rows = [];
    this.sel = new Set();
    this.anchor = -1;
    this.sort = storage.get(`sort-${side}`, { key: 'name', dir: 1 });
    this.enabled = side === 'local';
    this._build();
    this._bind();
  }

  get isRemote() {
    return this.side === 'remote';
  }

  get api() {
    return this.isRemote ? oz.remote : oz.local;
  }

  get other() {
    return this.isRemote ? App.local : App.remote;
  }

  joinIn(dir, name) {
    return this.isRemote ? joinPath(dir, name) : localJoin(dir, name);
  }

  parent(p) {
    return this.isRemote ? parentPath(p) : localParent(p);
  }

  isRoot(p) {
    return p === '/' || (!this.isRemote && WIN && isDriveRoot(p));
  }

  invalidName(name) {
    return this.isRemote || !WIN ? name.includes('/') : /[\\/:*?"<>|]/.test(name);
  }

  _build() {
    const remote = this.isRemote;
    this.el.innerHTML = `
      <div class="pane-head">
        <span class="pane-title">${remote ? 'Servidor' : 'Local'}</span>
        <button class="icon-btn up" title="Pasta acima">${ICONS.up}</button>
        ${remote ? '' : `<button class="icon-btn home" title="Pasta pessoal">${ICONS.home}</button>`}
        <input class="input path" spellcheck="false" placeholder="${remote ? 'Não conectado' : ''}">
        <button class="icon-btn refresh" title="Atualizar">${ICONS.refresh}</button>
      </div>
      <div class="table-wrap" tabindex="0">
        <table class="files">
          <thead><tr>
            <th class="c-name" data-sort="name">Nome</th>
            <th class="c-size" data-sort="size">Tamanho</th>
            <th class="c-date" data-sort="mtime">Modificado</th>
            ${remote ? '<th class="c-perms" data-sort="perms">Permissões</th>' : ''}
          </tr></thead>
          <tbody></tbody>
        </table>
        <div class="overlay" ${remote ? '' : 'hidden'}>
          <b>Não conectado</b>
          <span>Use a conexão rápida acima ou o Gerenciador de sites.</span>
        </div>
      </div>
      <div class="pane-status"></div>`;
    this.pathInput = $('.path', this.el);
    this.tbody = $('tbody', this.el);
    this.wrap = $('.table-wrap', this.el);
    this.statusEl = $('.pane-status', this.el);
    this.overlay = $('.overlay', this.el);
  }

  setEnabled(on) {
    this.enabled = on;
    this.overlay.hidden = on;
    if (!on) {
      this.path = '';
      this.entries = [];
      this.sel.clear();
      this.pathInput.value = '';
      this.render();
    }
  }

  async load(p, { keepSelection = false, quiet = false } = {}) {
    if (!this.enabled) return false;
    try {
      const r = await this.api.list(p);
      const same = r.path === this.path;
      this.path = r.path;
      this.entries = r.entries;
      if (keepSelection && same) {
        const names = new Set(r.entries.map((e) => e.name));
        for (const n of [...this.sel]) if (!names.has(n)) this.sel.delete(n);
      } else {
        this.sel.clear();
        this.anchor = -1;
        this.wrap.scrollTop = 0;
      }
      this.pathInput.value = this.path;
      this.render();
      if (!this.isRemote) storage.set('local-path', this.path);
      return true;
    } catch (e) {
      if (!quiet) Log.error(`Não foi possível abrir ${p}: ${e.message}`);
      this.pathInput.value = this.path;
      return false;
    }
  }

  refresh() {
    return this.path ? this.load(this.path, { keepSelection: true }) : Promise.resolve(false);
  }

  sorted() {
    const { key, dir } = this.sort;
    const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });
    return [...this.entries].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      let r = 0;
      if (key === 'size') r = a.size - b.size;
      else if (key === 'mtime') r = (a.mtime || 0) - (b.mtime || 0);
      else if (key === 'perms') r = (a.perms || '').localeCompare(b.perms || '');
      return (r || byName(a, b)) * dir;
    });
  }

  render() {
    this.rows = this.sorted();
    const remote = this.isRemote;
    const extra = remote ? '<td></td>' : '';
    const html = [];
    if (this.path && !this.isRoot(this.path)) {
      html.push(
        `<tr class="up-row" data-i="-1"><td class="name"><div class="nm">${ICONS.folder}<span>..</span></div></td><td></td><td></td>${extra}</tr>`,
      );
    }
    this.rows.forEach((e, i) => {
      const icon = e.isDir ? ICONS.folder : e.isLink ? ICONS.link : ICONS.file;
      const cls = `${this.sel.has(e.name) ? 'sel' : ''}${e.isDir ? ' dir' : ''}`;
      html.push(
        `<tr data-i="${i}" draggable="true" class="${cls}">` +
          `<td class="name" title="${esc(e.name)}"><div class="nm">${icon}<span>${esc(e.name)}</span></div></td>` +
          `<td class="size">${e.isDir ? '' : fmtSize(e.size)}</td>` +
          `<td class="date">${e.mtime ? fmtDate(e.mtime) : esc(e.mtimeRaw || '')}</td>` +
          (remote ? `<td class="perms">${esc(e.perms || '')}</td>` : '') +
          '</tr>',
      );
    });
    this.tbody.innerHTML = html.join('');
    for (const th of $$('th[data-sort]', this.el)) {
      th.dataset.dir = th.dataset.sort === this.sort.key ? (this.sort.dir > 0 ? 'asc' : 'desc') : '';
    }
    this.updateStatus();
  }

  selected() {
    return this.rows.filter((e) => this.sel.has(e.name));
  }

  updateStatus() {
    if (!this.enabled || !this.path) {
      this.statusEl.textContent = '';
      return;
    }
    const sel = this.selected();
    if (sel.length) {
      const size = sel.reduce((s, e) => s + (e.isDir ? 0 : e.size), 0);
      this.statusEl.textContent = `${sel.length} item(ns) selecionado(s) · ${fmtSize(size)}`;
    } else {
      const files = this.entries.filter((e) => !e.isDir);
      const total = files.reduce((s, e) => s + e.size, 0);
      this.statusEl.textContent = `${files.length} arquivo(s) e ${this.entries.length - files.length} pasta(s) · ${fmtSize(total)}`;
    }
  }

  paintSelection() {
    for (const tr of this.tbody.children) {
      const i = Number(tr.dataset.i);
      if (i >= 0) tr.classList.toggle('sel', this.sel.has(this.rows[i].name));
    }
    this.updateStatus();
  }

  rowIndex(e) {
    const tr = e.target.closest('tr[data-i]');
    return tr ? Number(tr.dataset.i) : null;
  }

  selectOnly(i) {
    this.sel.clear();
    if (i >= 0 && this.rows[i]) this.sel.add(this.rows[i].name);
    this.anchor = i;
    this.paintSelection();
  }

  clickRow(i, e) {
    if (i < 0) return this.selectOnly(-1);
    const name = this.rows[i].name;
    if (e.shiftKey && this.anchor >= 0) {
      if (!(e.metaKey || e.ctrlKey)) this.sel.clear();
      const [a, b] = [Math.min(this.anchor, i), Math.max(this.anchor, i)];
      for (let k = a; k <= b; k++) this.sel.add(this.rows[k].name);
      this.paintSelection();
    } else if (e.metaKey || e.ctrlKey) {
      if (this.sel.has(name)) this.sel.delete(name);
      else this.sel.add(name);
      this.anchor = i;
      this.paintSelection();
    } else {
      this.selectOnly(i);
    }
  }

  async open(i) {
    if (i < 0) return this.load(this.parent(this.path));
    const e = this.rows[i];
    const full = this.joinIn(this.path, e.name);
    if (e.isDir) return this.load(full);
    if (e.isLink && (await this.load(full, { quiet: true }))) return true; // link para pasta
    return App.transfer(this, [e]);
  }

  moveCursor(delta, extend) {
    if (!this.rows.length) return;
    const next = Math.max(0, Math.min(this.rows.length - 1, (this.anchor < 0 ? -1 : this.anchor) + delta));
    if (extend) {
      this.sel.add(this.rows[next].name);
      this.anchor = next;
      this.paintSelection();
    } else {
      this.selectOnly(next);
    }
    this.tbody.querySelector(`tr[data-i="${next}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  _bind() {
    $('.up', this.el).onclick = () => this.path && this.load(this.parent(this.path));
    $('.refresh', this.el).onclick = () => this.refresh();
    $('.home', this.el)?.addEventListener('click', async () => this.load(await oz.local.home()));

    this.pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.load(this.pathInput.value.trim() || '/');
      } else if (e.key === 'Escape') {
        this.pathInput.value = this.path;
      }
    });

    for (const th of $$('th[data-sort]', this.el)) {
      th.onclick = () => {
        const key = th.dataset.sort;
        this.sort = { key, dir: this.sort.key === key ? -this.sort.dir : 1 };
        storage.set(`sort-${this.side}`, this.sort);
        this.render();
      };
    }

    this.tbody.addEventListener('click', (e) => {
      const i = this.rowIndex(e);
      if (i !== null) this.clickRow(i, e);
    });
    this.tbody.addEventListener('dblclick', (e) => {
      const i = this.rowIndex(e);
      if (i !== null) this.open(i);
    });
    this.wrap.addEventListener('click', (e) => {
      if (e.target === this.wrap) this.selectOnly(-1);
    });

    this.wrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      const i = this.rowIndex(e);
      if (i === null || i < 0) this.selectOnly(-1);
      else if (!this.sel.has(this.rows[i].name)) this.selectOnly(i);
      Menu.show(e.clientX, e.clientY, App.menuItems(this));
    });

    this.wrap.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const mod = e.metaKey || e.ctrlKey;
      const sel = this.selected();
      if (e.key === 'Enter') {
        if (sel.length === 1 && sel[0].isDir) this.load(this.joinIn(this.path, sel[0].name));
        else if (sel.length) App.transfer(this, sel);
      } else if ((e.key === 'Backspace' && mod) || e.key === 'Delete') {
        App.remove(this);
      } else if (e.key === 'Backspace' || (e.key === 'ArrowUp' && mod)) {
        this.load(this.parent(this.path));
      } else if (e.key === 'ArrowDown' && mod) {
        if (sel.length === 1) this.open(this.rows.indexOf(sel[0]));
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        this.moveCursor(e.key === 'ArrowDown' ? 1 : -1, e.shiftKey);
      } else if (e.key === 'a' && mod) {
        for (const r of this.rows) this.sel.add(r.name);
        this.paintSelection();
      } else if (e.key === 'F2') {
        App.rename(this);
      } else {
        return;
      }
      e.preventDefault();
    });

    // Arrastar e soltar entre painéis e a partir do Finder
    this.tbody.addEventListener('dragstart', (e) => {
      const i = this.rowIndex(e);
      if (i === null || i < 0) return e.preventDefault();
      if (!this.sel.has(this.rows[i].name)) this.selectOnly(i);
      dragState = { from: this, dir: this.path, entries: this.selected() };
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', dragState.entries.map((x) => this.joinIn(this.path, x.name)).join('\n'));
    });
    this.tbody.addEventListener('dragend', () => {
      dragState = null;
    });

    const accepts = (e) =>
      this.enabled &&
      ((dragState && dragState.from !== this) ||
        (!dragState && this.isRemote && e.dataTransfer.types.includes('Files')));

    this.wrap.addEventListener('dragover', (e) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      this.el.classList.add('drop');
      this._setDropRow(e.target.closest('tr.dir'));
    });
    this.wrap.addEventListener('dragleave', (e) => {
      if (!this.wrap.contains(e.relatedTarget)) {
        this.el.classList.remove('drop');
        this._setDropRow(null);
      }
    });
    this.wrap.addEventListener('drop', (e) => {
      if (!accepts(e)) return;
      e.preventDefault();
      const tr = e.target.closest('tr.dir');
      this.el.classList.remove('drop');
      this._setDropRow(null);
      const toDir = tr ? this.joinIn(this.path, this.rows[Number(tr.dataset.i)].name) : this.path;
      if (dragState) {
        const { from, dir, entries } = dragState;
        dragState = null;
        App.transfer(from, entries, { fromDir: dir, toDir });
      } else {
        const paths = [...e.dataTransfer.files].map((f) => oz.pathForFile(f)).filter(Boolean);
        if (paths.length) App.uploadPaths(paths, toDir);
      }
    });
  }

  _setDropRow(tr) {
    if (this._dropRow === tr) return;
    this._dropRow?.classList.remove('drop-target');
    this._dropRow = tr;
    tr?.classList.add('drop-target');
  }
}

// ---------- fila de transferências ----------

const QueueUI = {
  jobs: [],
  tab: 'pending',
  body: $('#queue-body'),
  empty: $('#queue-empty'),
  groups: {
    pending: (j) => j.status === 'queued' || j.status === 'active',
    failed: (j) => j.status === 'failed',
    done: (j) => j.status === 'done' || j.status === 'skipped' || j.status === 'canceled',
  },

  init() {
    for (const tab of $$('.tab')) {
      tab.onclick = () => {
        this.tab = tab.dataset.tab;
        $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
        this.render();
      };
    }
    const ow = $('#q-overwrite');
    ow.value = storage.get('overwrite', 'overwrite');
    oz.queue.setOverwrite(ow.value);
    ow.onchange = () => {
      storage.set('overwrite', ow.value);
      oz.queue.setOverwrite(ow.value);
    };
    $('[data-qa="retry"]').onclick = () => oz.queue.retry(null);
    $('[data-qa="clear"]').onclick = () =>
      this.tab === 'failed' ? oz.queue.clearFailed() : oz.queue.clearFinished();
    $('[data-qa="cancelAll"]').onclick = async () => {
      if (this.jobs.some(this.groups.pending) && (await confirmDialog('Cancelar tudo', 'Cancelar todas as transferências pendentes?', 'Cancelar tudo', true))) {
        oz.queue.cancelAll();
      }
    };
    this.body.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (btn.dataset.act === 'cancel') oz.queue.cancel(id);
      else if (btn.dataset.act === 'retry') oz.queue.retry(id);
    });
    oz.on('queue:update', (jobs) => {
      this.jobs = jobs;
      this.render();
    });
  },

  statusCell(j) {
    const pct = j.size ? Math.min(100, Math.floor((j.transferred / j.size) * 100)) : 0;
    switch (j.status) {
      case 'active':
        if (j.isDir) return '<div class="status"><div class="bar indeterminate"><i></i></div>Listando pasta…</div>';
        return `<div class="status"><div class="bar"><i style="width:${pct}%"></i></div>${pct}%${j.speed ? ` · ${fmtSize(j.speed)}/s` : ''}</div>`;
      case 'queued':
        return '<div class="status">Aguardando</div>';
      case 'done':
        return `<div class="status done">${j.isDir ? `Pasta · ${j.fileCount} arquivo(s)` : 'Concluído'}</div>`;
      case 'skipped':
        return '<div class="status">Ignorado (já existe)</div>';
      case 'canceled':
        return '<div class="status">Cancelado</div>';
      case 'failed':
        return `<div class="status failed" title="${esc(j.error)}">${esc(j.error)}</div>`;
      default:
        return '';
    }
  },

  render() {
    const counts = { pending: 0, failed: 0, done: 0 };
    let remaining = 0;
    let speed = 0;
    for (const j of this.jobs) {
      for (const k in this.groups) if (this.groups[k](j)) counts[k]++;
      if (this.groups.pending(j) && !j.isDir) remaining += Math.max(0, j.size - j.transferred);
      if (j.status === 'active') speed += j.speed || 0;
    }
    for (const k in counts) $(`[data-count="${k}"]`).textContent = counts[k];
    $('#queue-summary').textContent = counts.pending
      ? `${counts.pending} pendente(s) · ${fmtSize(remaining)} restantes${speed ? ` · ${fmtSize(speed)}/s` : ''}`
      : '';

    const list = this.jobs.filter(this.groups[this.tab]);
    const shown = list.slice(0, 500);
    this.body.innerHTML = shown
      .map((j) => {
        const up = j.direction === 'up';
        let act = '';
        if (j.status === 'queued' || j.status === 'active') act = `<button class="row-btn" data-act="cancel" data-id="${j.id}">Cancelar</button>`;
        else if (j.status === 'failed' || j.status === 'canceled') act = `<button class="row-btn" data-act="retry" data-id="${j.id}">Repetir</button>`;
        return (
          `<tr><td class="qdir ${up ? 'up' : 'down'}" title="${up ? 'Envio' : 'Download'}">${up ? '↑' : '↓'}</td>` +
          `<td title="${esc(j.local)}">${esc(j.local)}</td><td title="${esc(j.remote)}">${esc(j.remote)}</td>` +
          `<td class="qsize">${j.isDir && j.status !== 'done' ? '' : fmtSize(j.size)}</td>` +
          `<td>${this.statusCell(j)}</td><td class="qact">${act}</td></tr>`
        );
      })
      .join('');
    if (list.length > shown.length) {
      this.body.insertAdjacentHTML('beforeend', `<tr><td></td><td colspan="5">… e mais ${list.length - shown.length} item(ns)</td></tr>`);
    }
    this.empty.hidden = list.length > 0;
    this.empty.textContent =
      this.tab === 'pending'
        ? `Arraste arquivos entre os painéis (ou do ${FILE_MANAGER} para o servidor) para transferir.`
        : this.tab === 'failed'
          ? 'Nenhuma falha.'
          : 'Nenhuma transferência concluída.';
  },
};

// ---------- gerenciador de sites ----------

async function openSiteManager() {
  let sites = await oz.sites.list();
  let current = null;
  let clearFlags = {};

  const body = document.createElement('div');
  body.className = 'sites';
  body.innerHTML = `
    <div class="sites-list">
      <div class="sites-items"></div>
      <div class="sites-list-actions">
        <button type="button" class="btn small" data-a="new">Novo site</button>
        <button type="button" class="btn small danger" data-a="del">Excluir</button>
      </div>
    </div>
    <form class="sites-form" autocomplete="off">
      <label class="field"><span>Nome</span><input name="name" class="input" spellcheck="false"></label>
      <div class="row">
        <label class="field proto"><span>Protocolo</span>
          <select name="protocol" class="input">
            ${Object.entries(PROTO_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>Servidor</span><input name="host" class="input" spellcheck="false" placeholder="exemplo.com.br"></label>
        <label class="field port"><span>Porta</span><input name="port" class="input" inputmode="numeric"></label>
      </div>
      <div class="row">
        <label class="field"><span>Usuário</span><input name="user" class="input" spellcheck="false"></label>
        <label class="field"><span>Senha</span><input name="password" type="password" class="input">
          <button type="button" class="link-btn" data-a="clearPassword" hidden>Esquecer senha salva</button>
        </label>
      </div>
      <div class="row" data-only="sftp">
        <label class="field"><span>Chave privada (opcional)</span>
          <div class="with-btn"><input name="keyFile" class="input" spellcheck="false" placeholder="~/.ssh/id_ed25519"><button type="button" class="btn" data-a="pickKey">Escolher…</button></div>
        </label>
        <label class="field"><span>Senha da chave</span><input name="passphrase" type="password" class="input">
          <button type="button" class="link-btn" data-a="clearPassphrase" hidden>Esquecer senha da chave</button>
        </label>
      </div>
      <label class="check" data-only="ftps"><input type="checkbox" name="insecure"> Aceitar certificados TLS inválidos ou autoassinados</label>
      <div class="row">
        <label class="field"><span>Pasta remota inicial</span><input name="remoteDir" class="input" spellcheck="false" placeholder="padrão do servidor"></label>
        <label class="field"><span>Pasta local inicial</span>
          <div class="with-btn"><input name="localDir" class="input" spellcheck="false"><button type="button" class="btn" data-a="pickDir">Escolher…</button></div>
        </label>
      </div>
      <p class="hint">As senhas são criptografadas com ${esc(SECRET_STORE)}. Deixe o campo em branco para manter a senha salva.</p>
      <div class="form-actions">
        <button type="button" class="btn" data-a="save">Salvar</button>
        <button type="submit" class="btn primary">Conectar</button>
      </div>
    </form>`;

  const form = $('form', body);
  const list = $('.sites-items', body);
  const F = (name) => form.elements[name];

  const toggleProto = () => {
    const p = F('protocol').value;
    $('[data-only="sftp"]', form).hidden = p !== 'sftp';
    $('[data-only="ftps"]', form).hidden = !p.startsWith('ftps');
    F('port').placeholder = DEFAULT_PORTS[p];
  };

  const fill = (site) => {
    current = site;
    clearFlags = {};
    for (const k of ['name', 'host', 'port', 'user', 'keyFile', 'remoteDir', 'localDir']) F(k).value = site[k] ?? '';
    F('protocol').value = site.protocol || 'sftp';
    F('insecure').checked = Boolean(site.insecure);
    F('password').value = '';
    F('passphrase').value = '';
    F('password').placeholder = site.hasPassword ? '•••••••• (salva)' : '';
    F('passphrase').placeholder = site.hasPassphrase ? '•••••••• (salva)' : '';
    $('[data-a="clearPassword"]', form).hidden = !site.hasPassword;
    $('[data-a="clearPassphrase"]', form).hidden = !site.hasPassphrase;
    toggleProto();
    renderList();
  };

  const read = () => {
    const data = { id: current?.id };
    for (const k of ['name', 'protocol', 'host', 'port', 'user', 'password', 'keyFile', 'passphrase', 'remoteDir', 'localDir']) {
      data[k] = F(k).value.trim();
    }
    data.password = F('password').value; // senhas não são aparadas
    data.passphrase = F('passphrase').value;
    data.insecure = F('insecure').checked;
    return { ...data, ...clearFlags };
  };

  const renderList = () => {
    list.innerHTML = sites.length
      ? sites
          .map(
            (s) =>
              `<div class="site-item${current?.id === s.id ? ' active' : ''}" data-id="${esc(s.id)}"><span>${esc(s.name)}</span><small>${esc(PROTO_LABELS[s.protocol] || s.protocol)} · ${esc(s.user ? `${s.user}@` : '')}${esc(s.host)}</small></div>`,
          )
          .join('')
      : '<div class="sites-empty">Nenhum site salvo ainda.</div>';
  };

  const save = async () => {
    const data = read();
    if (!data.host) {
      Log.warn('Informe o servidor antes de salvar o site.');
      F('host').focus();
      return null;
    }
    try {
      const saved = await oz.sites.save(data);
      sites = await oz.sites.list();
      fill(saved);
      Log.ok(`Site "${saved.name}" salvo`);
      return saved;
    } catch (e) {
      Log.error(`Não foi possível salvar o site: ${e.message}`);
      return null;
    }
  };

  F('protocol').onchange = toggleProto;
  F('host').addEventListener('input', () => {
    if (!current?.id && (!F('name').value || F('name').value === 'Novo site')) F('name').value = F('host').value;
  });

  await modal({
    title: 'Gerenciador de sites',
    body,
    wide: true,
    buttons: [{ label: 'Fechar', value: null }],
    onOpen: (_el, close) => {
      list.addEventListener('click', (e) => {
        const item = e.target.closest('.site-item');
        if (item) fill(sites.find((s) => s.id === item.dataset.id));
      });
      list.addEventListener('dblclick', (e) => {
        const item = e.target.closest('.site-item');
        if (item) {
          close(null);
          App.connect({ siteId: item.dataset.id });
        }
      });
      body.addEventListener('click', async (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'new') {
          fill({ name: 'Novo site', protocol: 'sftp' });
          F('host').focus();
        } else if (a === 'del' && current?.id) {
          if (await confirmDialog('Excluir site', `Excluir o site "${current.name}"?`, 'Excluir', true)) {
            await oz.sites.delete(current.id);
            sites = await oz.sites.list();
            fill(sites[0] || { name: 'Novo site', protocol: 'sftp' });
          }
        } else if (a === 'save') {
          await save();
        } else if (a === 'pickKey') {
          const f = await oz.pickFile();
          if (f) F('keyFile').value = f;
        } else if (a === 'pickDir') {
          const d = await oz.pickDir();
          if (d) F('localDir').value = d;
        } else if (a === 'clearPassword' || a === 'clearPassphrase') {
          clearFlags[a] = true;
          e.target.hidden = true;
          F(a === 'clearPassword' ? 'password' : 'passphrase').placeholder = 'será removida ao salvar';
        }
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saved = await save();
        if (saved) {
          close(null);
          App.connect({ siteId: saved.id });
        }
      });
      fill(sites[0] || { name: 'Novo site', protocol: 'sftp' });
    },
  });
}

// ---------- aplicação ----------

const App = {
  connected: false,
  local: null,
  remote: null,
  refreshTimers: new Map(),

  async init() {
    this.local = new Pane('local');
    this.remote = new Pane('remote');
    QueueUI.init();
    oz.on('log', (entry) => Log.add(entry));
    oz.on('queue:done', ({ direction, local, remote }) => {
      const pane = direction === 'up' ? this.remote : this.local;
      const dest = direction === 'up' ? remote : local;
      if (pane.path && pane.parent(dest) === pane.path) this.scheduleRefresh(pane);
    });

    const start = storage.get('local-path', null);
    if (!start || !(await this.local.load(start, { quiet: true }))) await this.local.load(await oz.local.home());

    this._bindToolbar();
    this._bindResizers();
    Log.info('Barca pronta. Conecte-se a um servidor para começar.');
  },

  scheduleRefresh(pane) {
    clearTimeout(this.refreshTimers.get(pane));
    this.refreshTimers.set(
      pane,
      setTimeout(() => pane.refresh(), 400),
    );
  },

  _bindToolbar() {
    const proto = $('#q-proto');
    const syncPort = () => ($('#q-port').placeholder = DEFAULT_PORTS[proto.value]);
    proto.value = storage.get('quick-proto', 'sftp');
    syncPort();
    proto.onchange = () => {
      storage.set('quick-proto', proto.value);
      syncPort();
    };

    $('#quick').addEventListener('submit', (e) => {
      e.preventDefault();
      const params = {
        protocol: proto.value,
        host: $('#q-host').value.trim(),
        user: $('#q-user').value.trim(),
        password: $('#q-pass').value,
        port: $('#q-port').value.trim(),
      };
      // Aceita URLs como sftp://usuario@host:2222/pasta
      if (params.host.includes('://')) {
        try {
          const u = new URL(params.host);
          const scheme = u.protocol.replace(':', '');
          if (DEFAULT_PORTS[scheme]) params.protocol = scheme;
          params.host = u.hostname;
          params.port = u.port || params.port;
          if (u.username) params.user = decodeURIComponent(u.username);
          if (u.password) params.password = decodeURIComponent(u.password);
          if (u.pathname && u.pathname !== '/') params.remoteDir = decodeURIComponent(u.pathname);
        } catch {
          Log.error('Endereço inválido');
          return;
        }
      }
      if (!params.host) {
        Log.warn('Informe o servidor.');
        $('#q-host').focus();
        return;
      }
      this.connect(params);
    });

    $('#btn-sites').title = `Gerenciador de sites (${MOD_KEY}S)`;
    $('#btn-sites').onclick = () => openSiteManager();
    $('#btn-disconnect').onclick = () => this.disconnect();
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && !modalStack.length) {
        e.preventDefault();
        openSiteManager();
      }
    });
  },

  _bindResizers() {
    for (const key of ['log', 'queue']) {
      const h = storage.get(`${key}-h`, null);
      if (h) document.body.style.setProperty(`--${key}-h`, `${h}px`);
    }
    for (const r of $$('.resizer')) {
      r.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const key = r.dataset.resize;
        const startY = e.clientY;
        const startH = parseFloat(getComputedStyle(document.body).getPropertyValue(`--${key}-h`));
        r.classList.add('active');
        let h = startH;
        const move = (ev) => {
          const dy = ev.clientY - startY;
          h = Math.round(Math.max(48, Math.min(innerHeight * 0.55, key === 'log' ? startH + dy : startH - dy)));
          document.body.style.setProperty(`--${key}-h`, `${h}px`);
        };
        const up = () => {
          r.classList.remove('active');
          storage.set(`${key}-h`, h);
          removeEventListener('mousemove', move);
          removeEventListener('mouseup', up);
        };
        addEventListener('mousemove', move);
        addEventListener('mouseup', up);
      });
    }
  },

  setConnState(state, label = '') {
    const conn = $('#conn');
    conn.classList.toggle('on', state === 'on');
    conn.classList.toggle('busy', state === 'busy');
    $('#conn-label').textContent =
      state === 'on' ? label : state === 'busy' ? 'Conectando…' : 'Desconectado';
    $('#conn-label').title = label;
    $('#btn-disconnect').hidden = state !== 'on';
    $('#btn-connect').disabled = state === 'busy';
  },

  async connect(params) {
    this.setConnState('busy');
    try {
      const r = await oz.remote.connect(params);
      this.connected = true;
      this.remote.setEnabled(true);
      await this.remote.load(r.path);
      if (r.localDir) await this.local.load(r.localDir);
      this.setConnState('on', r.label);
      this.remote.wrap.focus();
    } catch {
      // o processo principal já registrou o erro no log
      this.connected = false;
      this.remote.setEnabled(false);
      this.setConnState('off');
    }
  },

  async disconnect() {
    await oz.remote.disconnect();
    this.connected = false;
    this.remote.setEnabled(false);
    this.setConnState('off');
  },

  transfer(fromPane, entries, { fromDir = fromPane.path, toDir = fromPane.other.path } = {}) {
    if (!this.connected) {
      Log.warn('Conecte-se a um servidor antes de transferir arquivos.');
      return;
    }
    if (!entries.length || !toDir) return;
    const toPane = fromPane.other;
    const items = entries.map((e) =>
      fromPane.isRemote
        ? { direction: 'down', remote: fromPane.joinIn(fromDir, e.name), local: toPane.joinIn(toDir, e.name), isDir: e.isDir, size: e.size }
        : { direction: 'up', local: fromPane.joinIn(fromDir, e.name), remote: toPane.joinIn(toDir, e.name) },
    );
    oz.queue.add(items).catch((err) => Log.error(`Não foi possível adicionar à fila: ${err.message}`));
  },

  uploadPaths(paths, toDir) {
    const items = paths.map((p) => ({ direction: 'up', local: p, remote: joinPath(toDir, baseName(p)) }));
    oz.queue.add(items).catch((err) => Log.error(`Não foi possível adicionar à fila: ${err.message}`));
  },

  menuItems(pane) {
    const sel = pane.selected();
    const one = sel.length === 1;
    const refresh = { label: 'Atualizar', action: () => pane.refresh() };
    if (!pane.isRemote) {
      return [
        { label: 'Enviar para o servidor', disabled: !sel.length || !this.connected, action: () => this.transfer(pane, sel) },
        { label: `Mostrar no ${FILE_MANAGER}`, disabled: !one, action: () => oz.local.reveal(pane.joinIn(pane.path, sel[0].name)) },
        '-',
        { label: 'Nova pasta…', action: () => this.newFolder(pane) },
        { label: 'Renomear…', disabled: !one, action: () => this.rename(pane) },
        { label: 'Mover para a Lixeira', disabled: !sel.length, danger: true, action: () => this.remove(pane) },
        '-',
        refresh,
      ];
    }
    return [
      { label: 'Baixar', disabled: !sel.length, action: () => this.transfer(pane, sel) },
      '-',
      { label: 'Nova pasta…', action: () => this.newFolder(pane) },
      { label: 'Renomear…', disabled: !one, action: () => this.rename(pane) },
      { label: 'Excluir', disabled: !sel.length, danger: true, action: () => this.remove(pane) },
      { label: 'Permissões…', disabled: !sel.length, action: () => this.chmod(pane) },
      {
        label: 'Copiar caminho',
        action: () => navigator.clipboard.writeText(one ? pane.joinIn(pane.path, sel[0].name) : pane.path),
      },
      '-',
      refresh,
    ];
  },

  async newFolder(pane) {
    const name = await promptDialog('Nova pasta', 'Nome da pasta:', 'Nova pasta');
    if (!name) return;
    if (pane.invalidName(name)) return Log.error('Nome inválido: contém caracteres não permitidos');
    try {
      await pane.api.mkdir(pane.joinIn(pane.path, name));
      await pane.refresh();
      pane.sel = new Set([name]);
      pane.paintSelection();
    } catch (e) {
      Log.error(`Não foi possível criar a pasta: ${e.message}`);
    }
  },

  async rename(pane) {
    const [item] = pane.selected();
    if (!item) return;
    const name = await promptDialog('Renomear', `Novo nome para "${item.name}":`, item.name);
    if (!name || name === item.name) return;
    if (pane.invalidName(name)) return Log.error('Nome inválido: contém caracteres não permitidos');
    if (pane.entries.some((e) => e.name === name)) return Log.error(`Já existe um item chamado "${name}"`);
    try {
      await pane.api.rename(pane.joinIn(pane.path, item.name), pane.joinIn(pane.path, name));
      Log.info(`Renomeado: ${item.name} → ${name}`);
      await pane.refresh();
      pane.sel = new Set([name]);
      pane.paintSelection();
    } catch (e) {
      Log.error(`Não foi possível renomear: ${e.message}`);
    }
  },

  async remove(pane) {
    const sel = pane.selected();
    if (!sel.length) return;
    const what = sel.length === 1 ? `"${sel[0].name}"` : `${sel.length} itens`;
    try {
      if (pane.isRemote) {
        const ok = await confirmDialog(
          'Excluir do servidor',
          `Excluir ${what} permanentemente do servidor? Pastas são excluídas com todo o conteúdo. Esta ação não pode ser desfeita.`,
          'Excluir',
          true,
        );
        if (!ok) return;
        await oz.remote.delete(sel.map((e) => ({ path: pane.joinIn(pane.path, e.name), isDir: e.isDir })));
      } else {
        const ok = await confirmDialog('Mover para a Lixeira', `Mover ${what} para a Lixeira?`, 'Mover', true);
        if (!ok) return;
        await oz.local.trash(sel.map((e) => pane.joinIn(pane.path, e.name)));
        Log.info(`${what} movido(s) para a Lixeira`);
      }
    } catch (e) {
      Log.error(`Não foi possível excluir: ${e.message}`);
    }
    pane.refresh();
  },

  async chmod(pane) {
    const sel = pane.selected();
    if (!sel.length) return;
    const initial = permsToMode(sel[0].perms) ?? (sel[0].isDir ? 0o755 : 0o644);
    const who = [
      ['Dono', 6],
      ['Grupo', 3],
      ['Outros', 0],
    ];
    const bits = [
      ['Ler', 4],
      ['Gravar', 2],
      ['Executar', 1],
    ];
    const grid =
      '<div class="perm-grid"><span></span>' +
      bits.map(([l]) => `<span class="h">${l}</span>`).join('') +
      who
        .map(
          ([w, shift]) =>
            `<span class="who">${w}</span>` +
            bits.map(([, b]) => `<label><input type="checkbox" data-bit="${b << shift}"></label>`).join(''),
        )
        .join('') +
      '</div>';
    const target = sel.length === 1 ? `"${esc(sel[0].name)}"` : `${sel.length} itens`;
    const mode = await modal({
      title: 'Permissões',
      body: `<p>Alterar permissões de ${target}</p>${grid}<label class="field"><span>Valor numérico (octal)</span><input class="input" name="octal" maxlength="4" inputmode="numeric"></label>`,
      buttons: [
        { label: 'Cancelar', value: null },
        {
          label: 'Aplicar',
          primary: true,
          value: (el) => {
            const v = $('[name=octal]', el).value.trim();
            if (!/^[0-7]{3,4}$/.test(v)) {
              Log.error('Valor octal inválido (use, por exemplo, 755 ou 644)');
              return undefined;
            }
            return parseInt(v, 8);
          },
        },
      ],
      onOpen: (el) => {
        const octal = $('[name=octal]', el);
        const boxes = $$('[data-bit]', el);
        const fromMode = (m) => {
          for (const b of boxes) b.checked = Boolean(m & Number(b.dataset.bit));
          octal.value = (m & 0o777).toString(8).padStart(3, '0');
        };
        fromMode(initial);
        for (const b of boxes) {
          b.onchange = () => fromMode(boxes.reduce((m, x) => (x.checked ? m | Number(x.dataset.bit) : m), 0));
        }
        octal.oninput = () => {
          if (/^[0-7]{3}$/.test(octal.value)) {
            const m = parseInt(octal.value, 8);
            for (const b of boxes) b.checked = Boolean(m & Number(b.dataset.bit));
          }
        };
      },
    });
    if (mode == null) return;
    try {
      await oz.remote.chmod(
        sel.map((e) => pane.joinIn(pane.path, e.name)),
        mode,
      );
      await pane.refresh();
    } catch (e) {
      Log.error(`Não foi possível alterar as permissões: ${e.message}`);
    }
  },
};

App.init();
