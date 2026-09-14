// All IPC channels. Add new handlers here, not in index.js.
const { ipcMain, dialog } = require('electron');
const cameras = require('./cameras');
const stream = require('./stream');
const clip = require('./clip');
const aiHub = require('./ai/hub');

function send(getWindow, channel, payload) {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

function registerIpc(getWindow) {
  ipcMain.handle('cameras:add', (event, camera) => cameras.addCamera(camera));
  ipcMain.handle('cameras:list', () => ({ ok: true, cameras: cameras.listCameras() }));

  ipcMain.handle('stream:start', async (event, id) => {
    const camera = cameras.getById(id);
    if (!camera) {
      return { ok: false, error: 'Camera not found.' };
    }
    return stream.start(camera);
  });
  ipcMain.handle('stream:start-all', async () => stream.startAll(cameras.getAll()));
  ipcMain.handle('stream:stop', () => stream.stop());

  ipcMain.handle('clip:play', async (event, payload) => {
    const camera = cameras.getById(payload.cameraId);
    if (!camera) {
      return { ok: false, error: 'Camera not found.' };
    }
    return clip.play(camera, payload.start, payload.end);
  });
  ipcMain.handle('clip:stop', () => clip.stop());
  ipcMain.handle('clip:save', async (event, payload) => {
    const camera = cameras.getById(payload.cameraId);
    if (!camera) {
      return { ok: false, error: 'Camera not found.' };
    }
    const picked = await dialog.showSaveDialog(getWindow(), {
      defaultPath: camera.name + '-clip.mp4',
      filters: [{ name: 'MP4', extensions: ['mp4'] }]
    });
    if (picked.canceled || !picked.filePath) {
      return { ok: false, error: 'Save cancelled.' };
    }
    return clip.save(camera, payload.start, payload.end, picked.filePath);
  });

  ipcMain.handle('ai:list-models', () => ({ ok: true, models: aiHub.list() }));
  ipcMain.handle('ai:set-model', (event, id, enabled) => aiHub.setEnabled(id, enabled));
  ipcMain.handle('lineCrossing:get', () => aiHub.lineCrossing.getState());
  ipcMain.handle('lineCrossing:remove-line', (event, id) => aiHub.lineCrossing.removeLine(id));
  ipcMain.handle('lineCrossing:add-line', (event, line) => {
    const camera = cameras.getById(line.cameraId);
    if (!camera) {
      return { ok: false, error: 'Camera not found.' };
    }
    return aiHub.lineCrossing.addLine({
      cameraId: camera.id,
      cameraName: camera.name,
      ip: camera.ip,
      x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2,
      direction: line.direction
    });
  });

  stream.on('status', (payload) => send(getWindow, 'stream:status', payload));
  clip.on('status', (payload) => send(getWindow, 'clip:status', payload));
  aiHub.lineCrossing.on('event', (payload) => send(getWindow, 'lineCrossing:event', payload));
}

module.exports = registerIpc;
