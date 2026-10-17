'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const EVENTS = new Set(['log', 'queue:update', 'queue:done']);

contextBridge.exposeInMainWorld('oz', {
  platform: process.platform,
  local: {
    home: () => call('local:home'),
    list: (dir) => call('local:list', dir),
    mkdir: (p) => call('local:mkdir', p),
    rename: (from, to) => call('local:rename', from, to),
    trash: (paths) => call('local:trash', paths),
    reveal: (p) => call('local:reveal', p),
  },
  remote: {
    connect: (params) => call('remote:connect', params),
    disconnect: () => call('remote:disconnect'),
    list: (dir) => call('remote:list', dir),
    mkdir: (p) => call('remote:mkdir', p),
    rename: (from, to) => call('remote:rename', from, to),
    delete: (items) => call('remote:delete', items),
    chmod: (paths, mode) => call('remote:chmod', paths, mode),
  },
  queue: {
    add: (items) => call('queue:add', items),
    cancel: (id) => call('queue:cancel', id),
    cancelAll: () => call('queue:cancelAll'),
    retry: (id) => call('queue:retry', id),
    clearFinished: () => call('queue:clearFinished'),
    clearFailed: () => call('queue:clearFailed'),
    setOverwrite: (mode) => call('queue:setOverwrite', mode),
  },
  sites: {
    list: () => call('sites:list'),
    save: (site) => call('sites:save', site),
    delete: (id) => call('sites:delete', id),
  },
  pickFile: () => call('dialog:pickFile'),
  pickDir: () => call('dialog:pickDir'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  on: (channel, fn) => {
    if (EVENTS.has(channel)) ipcRenderer.on(channel, (_e, data) => fn(data));
  },
});
