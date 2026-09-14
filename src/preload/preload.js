// Preload is the bridge. The renderer only sees window.cameraApi, not Node.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cameraApi', {
  // invoke = two-way (send + wait for a return value).
  addCamera: (camera) => ipcRenderer.invoke('cameras:add', camera),
  listCameras: () => ipcRenderer.invoke('cameras:list'),
  startStream: (id) => ipcRenderer.invoke('stream:start', id),
  startAllStreams: () => ipcRenderer.invoke('stream:start-all'),
  stopStream: () => ipcRenderer.invoke('stream:stop'),
  // on = one-way listener for messages main pushes later (no reply).
  onStreamStatus: (callback) => {
    ipcRenderer.on('stream:status', (_event, payload) => callback(payload));
  },
  playClip: (payload) => ipcRenderer.invoke('clip:play', payload),
  stopClip: () => ipcRenderer.invoke('clip:stop'),
  saveClip: (payload) => ipcRenderer.invoke('clip:save', payload),
  onClipStatus: (callback) => {
    ipcRenderer.on('clip:status', (_event, payload) => callback(payload));
  },
  listAiModels: () => ipcRenderer.invoke('ai:list-models'),
  setAiModel: (id, enabled) => ipcRenderer.invoke('ai:set-model', id, enabled),
  getLineCrossing: () => ipcRenderer.invoke('lineCrossing:get'),
  addCrossingLine: (line) => ipcRenderer.invoke('lineCrossing:add-line', line),
  removeCrossingLine: (id) => ipcRenderer.invoke('lineCrossing:remove-line', id),
  onCrossingEvent: (callback) => {
    ipcRenderer.on('lineCrossing:event', (_event, payload) => callback(payload));
  }
});
