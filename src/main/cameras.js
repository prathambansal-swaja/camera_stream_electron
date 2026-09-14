// Camera list stored in Electron userData/cameras.json.
const fs = require('fs');
const path = require('path');

let filePath = '';

function init(userDataPath) {
  filePath = path.join(userDataPath, 'cameras.json');
}

function readAll() {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function addCamera(camera) {
  const name = String(camera.name || '').trim();
  const ip = String(camera.ip || '').trim();
  const username = String(camera.username || '').trim();
  const password = String(camera.password || '');

  if (!name || !ip || !username || !password) {
    return { ok: false, error: 'All fields are required.' };
  }

  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipPattern.test(ip)) {
    return { ok: false, error: 'Enter a valid IPv4 address.' };
  }

  const cameras = readAll();
  const saved = { id: Date.now().toString(), name, ip, username, password };
  cameras.push(saved);
  fs.writeFileSync(filePath, JSON.stringify(cameras, null, 2));
  return { ok: true, id: saved.id, name, ip };
}

function listCameras() {
  return readAll().map((camera) => ({
    id: camera.id,
    name: camera.name,
    ip: camera.ip,
    username: camera.username
  }));
}

function getById(id) {
  return readAll().find((camera) => camera.id === id) || null;
}

function getAll() {
  return readAll();
}

module.exports = { init, addCamera, listCameras, getById, getAll };
