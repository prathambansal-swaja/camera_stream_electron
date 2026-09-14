// Line-crossing UI only. Click once for A, click again for B, then Add line.
const camEl = document.getElementById('lc-camera');
const preview = document.getElementById('lc-preview');
const canvas = document.getElementById('lc-canvas');
const ctx = canvas.getContext('2d');
const linesEl = document.getElementById('lc-lines');
const eventsEl = document.getElementById('lc-events');
const pagerEl = document.getElementById('lc-pager');
const pageLabelEl = document.getElementById('lc-page-label');
const pagePrevEl = document.getElementById('lc-page-prev');
const pageNextEl = document.getElementById('lc-page-next');
const player = document.getElementById('lc-player');
const playerLabel = document.getElementById('lc-player-label');
const hintEl = document.getElementById('lc-draw-hint');

const PAGE_SIZE = 15;
let eventPage = 1;
let draft = null;
let state = { lines: [], events: [] };

function dirLabel(dir) {
  if (dir === 'a-to-b') return 'A → B';
  if (dir === 'b-to-a') return 'B → A';
  return 'A ↔ B';
}

function selectedDir() {
  const box = document.querySelector('input[name="lc-dir"]:checked');
  return box ? box.value : 'both';
}

function sizeCanvas() {
  const box = canvas.parentElement.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(box.width));
  canvas.height = Math.max(1, Math.floor(box.height));
  drawAll();
}

function pointFromEvent(event) {
  const box = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - box.left) / box.width,
    y: (event.clientY - box.top) / box.height
  };
}

function paint(x1, y1, x2, y2, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1 * canvas.width, y1 * canvas.height);
  ctx.lineTo(x2 * canvas.width, y2 * canvas.height);
  ctx.stroke();
  ctx.font = '14px sans-serif';
  ctx.fillText('A', x1 * canvas.width + 6, y1 * canvas.height - 6);
  ctx.fillText('B', x2 * canvas.width + 6, y2 * canvas.height - 6);
}

function drawAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const line of state.lines || []) {
    if (line.cameraId === camEl.value) {
      paint(line.x1, line.y1, line.x2, line.y2, '#f2c48a');
    }
  }
  if (draft && draft.x2 != null) {
    paint(draft.x1, draft.y1, draft.x2, draft.y2, '#ffffff');
  } else if (draft) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(draft.x1 * canvas.width, draft.y1 * canvas.height, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText('A', draft.x1 * canvas.width + 8, draft.y1 * canvas.height - 6);
  }
}

function renderLines() {
  linesEl.innerHTML = '';
  for (const line of state.lines || []) {
    const row = document.createElement('div');
    row.className = 'ai-line-row';
    row.textContent = line.cameraName + ' · ' + dirLabel(line.direction) + ' ';
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Remove';
    del.addEventListener('click', async () => {
      await window.cameraApi.removeCrossingLine(line.id);
      refresh();
    });
    row.appendChild(del);
    linesEl.appendChild(row);
  }
}

function renderEvents() {
  const all = state.events || [];
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  if (eventPage > pages) {
    eventPage = pages;
  }
  const start = (eventPage - 1) * PAGE_SIZE;
  eventsEl.innerHTML = '';
  for (const ev of all.slice(start, start + PAGE_SIZE)) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'ai-event';
    const img = document.createElement('img');
    img.alt = ev.direction;
    if (ev.thumb) img.src = ev.thumb;
    const meta = document.createElement('span');
    meta.textContent = ev.cameraName + ' · ' + ev.direction + '\n' + new Date(ev.at).toLocaleString();
    card.appendChild(img);
    card.appendChild(meta);
    card.addEventListener('click', () => playEvent(ev));
    eventsEl.appendChild(card);
  }
  pagerEl.hidden = all.length < PAGE_SIZE;
  pageLabelEl.textContent = 'Page ' + eventPage + ' of ' + pages;
  pagePrevEl.disabled = eventPage <= 1;
  pageNextEl.disabled = eventPage >= pages;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function toLocalInput(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

async function playEvent(ev) {
  const at = new Date(ev.at);
  playerLabel.textContent = 'SD playback · ' + ev.cameraName;
  const result = await window.cameraApi.playClip({
    cameraId: ev.cameraId,
    start: toLocalInput(new Date(at.getTime() - 3000)) + 'Z',
    end: toLocalInput(new Date(at.getTime() + 3000)) + 'Z'
  });
  if (!result.ok) {
    playerLabel.textContent = result.error;
    return;
  }
  player.src = result.url + '?t=' + Date.now();
}

async function showPreview() {
  if (!camEl.value) return;
  await window.cameraApi.startStream(camEl.value);
  preview.src = 'http://127.0.0.1:8787/stream/' + camEl.value + '?t=' + Date.now();
  sizeCanvas();
}

async function refresh() {
  state = await window.cameraApi.getLineCrossing();
  const cams = await window.cameraApi.listCameras();
  const keep = camEl.value;
  camEl.innerHTML = '';
  for (const cam of cams.cameras || []) {
    const opt = document.createElement('option');
    opt.value = cam.id;
    opt.textContent = cam.name + ' (' + cam.ip + ')';
    camEl.appendChild(opt);
  }
  if (keep) camEl.value = keep;
  renderLines();
  renderEvents();
  sizeCanvas();
}

canvas.addEventListener('click', (event) => {
  event.preventDefault();
  const p = pointFromEvent(event);
  if (!draft) {
    draft = { x1: p.x, y1: p.y };
    hintEl.textContent = 'Click point B to finish the line.';
  } else {
    draft.x2 = p.x;
    draft.y2 = p.y;
    hintEl.textContent = 'Line ready. Click Add line, or click again to redraw.';
  }
  drawAll();
});

document.getElementById('lc-add-line').addEventListener('click', async () => {
  if (!draft || draft.x2 == null || !camEl.value) {
    hintEl.textContent = 'Click A, then B, on the video before adding.';
    return;
  }
  await window.cameraApi.addCrossingLine({
    cameraId: camEl.value,
    x1: draft.x1, y1: draft.y1, x2: draft.x2, y2: draft.y2,
    direction: selectedDir()
  });
  draft = null;
  hintEl.textContent = 'Line saved. Click A to draw another.';
  refresh();
});

document.getElementById('lc-clear-draft').addEventListener('click', () => {
  draft = null;
  hintEl.textContent = 'Click on the video to set point A, then point B.';
  drawAll();
});

camEl.addEventListener('change', showPreview);
window.addEventListener('resize', sizeCanvas);

pagePrevEl.addEventListener('click', () => {
  if (eventPage > 1) {
    eventPage -= 1;
    renderEvents();
  }
});

pageNextEl.addEventListener('click', () => {
  eventPage += 1;
  renderEvents();
});

window.cameraApi.onCrossingEvent((ev) => {
  state.events.unshift(ev);
  eventPage = 1;
  renderEvents();
});

window.refreshLineCrossingUi = async function () {
  await refresh();
  await showPreview();
};
