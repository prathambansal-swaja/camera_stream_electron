// Shared UI: tab nav + Live view. Clip and AI load from their own files.
const form = document.getElementById('add-camera-form');
const statusEl = document.getElementById('status');
const gridEl = document.getElementById('live-grid');
const navEl = document.getElementById('view-nav');

function showView(name) {
  for (const button of navEl.querySelectorAll('button')) {
    button.classList.toggle('active', button.dataset.view === name);
  }
  for (const view of document.querySelectorAll('.view')) {
    view.classList.toggle('active', view.id === 'view-' + name);
  }
  if (name === 'clip' && window.fillClipCameras) {
    window.fillClipCameras();
  }
}

navEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-view]');
  if (button) {
    showView(button.dataset.view);
  }
});

function addTile(stream) {
  if (document.getElementById('tile-' + stream.id)) {
    updateTile(stream);
    return;
  }

  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.id = 'tile-' + stream.id;

  const nameEl = document.createElement('div');
  nameEl.className = 'tile-name';
  nameEl.textContent = stream.name;

  const ipEl = document.createElement('div');
  ipEl.className = 'tile-ip';
  ipEl.textContent = stream.ip;

  const img = document.createElement('img');
  img.alt = stream.name;
  if (stream.url) {
    img.src = stream.url + '?t=' + Date.now();
  }

  const tileStatus = document.createElement('p');
  tileStatus.className = 'tile-status';
  tileStatus.id = 'status-' + stream.id;
  tileStatus.textContent = stream.error || 'Connecting...';

  tile.appendChild(nameEl);
  tile.appendChild(ipEl);
  tile.appendChild(img);
  tile.appendChild(tileStatus);
  gridEl.appendChild(tile);
}

function updateTile(stream) {
  const img = document.querySelector('#tile-' + stream.id + ' img');
  const tileStatus = document.getElementById('status-' + stream.id);
  if (img && stream.url) {
    img.src = stream.url + '?t=' + Date.now();
  }
  if (tileStatus) {
    tileStatus.textContent = stream.error || 'Connecting...';
  }
}

async function playAll() {
  statusEl.textContent = 'Starting all streams...';
  const result = await window.cameraApi.startAllStreams();
  gridEl.innerHTML = '';
  for (const stream of result.streams || []) {
    addTile(stream);
  }
  statusEl.textContent = (result.streams || []).length
    ? 'Live tiles ready.'
    : 'Add a camera to see a live stream.';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusEl.textContent = 'Saving...';

  const result = await window.cameraApi.addCamera({
    name: form.name.value,
    ip: form.ip.value,
    username: form.username.value,
    password: form.password.value
  });

  if (!result.ok) {
    statusEl.textContent = result.error;
    return;
  }

  form.reset();
  statusEl.textContent = 'Saved "' + result.name + '"';
  const started = await window.cameraApi.startStream(result.id);
  addTile(started.ok ? started : { id: result.id, name: result.name, ip: result.ip, error: started.error });
});

window.cameraApi.onStreamStatus((payload) => {
  const tileStatus = document.getElementById('status-' + payload.id);
  const text = payload.message || payload.error || '';
  if (tileStatus) {
    tileStatus.textContent = text;
  }
  statusEl.textContent = text;
});

playAll();
