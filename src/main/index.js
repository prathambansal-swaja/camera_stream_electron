// Electron main process entry. Window + app lifecycle only.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const cameras = require('./cameras');
const stream = require('./stream');
const clip = require('./clip');
const aiHub = require('./ai/hub');
const registerIpc = require('./ipc');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  const userData = app.getPath('userData');
  cameras.init(userData);
  aiHub.init(userData);
  createWindow();
  registerIpc(() => mainWindow);
});

app.on('window-all-closed', () => {
  stream.stop();
  clip.stop();
  aiHub.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
