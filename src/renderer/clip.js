// Clip tab: SD-card playback, save, and ±5s transport.
const clipCameraEl = document.getElementById('clip-camera');
const clipStartEl = document.getElementById('clip-start');
const clipEndEl = document.getElementById('clip-end');
const clipLiveEl = document.getElementById('clip-live');
const clipStatusEl = document.getElementById('clip-status');
const clipLabelEl = document.getElementById('clip-label');

function pad(n) {
  return String(n).padStart(2, '0');
}

function toInputValue(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

function toCameraIso(value) {
  if (!value) {
    return '';
  }
  return (value.length === 16 ? value + ':00' : value) + 'Z';
}

function setLastMinutes(minutes) {
  const end = new Date();
  const start = new Date(end.getTime() - minutes * 60 * 1000);
  clipStartEl.value = toInputValue(start);
  clipEndEl.value = toInputValue(end);
}

async function fillClipCameras() {
  const result = await window.cameraApi.listCameras();
  const selected = clipCameraEl.value;
  clipCameraEl.innerHTML = '';
  for (const camera of result.cameras || []) {
    const option = document.createElement('option');
    option.value = camera.id;
    option.textContent = camera.name + ' (' + camera.ip + ')';
    clipCameraEl.appendChild(option);
  }
  if (selected) {
    clipCameraEl.value = selected;
  }
}

function clipPayload() {
  return {
    cameraId: clipCameraEl.value,
    start: toCameraIso(clipStartEl.value),
    end: toCameraIso(clipEndEl.value)
  };
}

let clipPlaying = false;
let playStartedAt = 0;
let cursorStartMs = 0;
let rangeStartMs = 0;
let rangeEndMs = 0;

function inputToMs(value) {
  return new Date(value.length === 16 ? value + ':00' : value).getTime();
}

function markPlayStart(startValue) {
  clipPlaying = true;
  playStartedAt = Date.now();
  cursorStartMs = inputToMs(startValue);
  rangeStartMs = inputToMs(clipStartEl.value);
  rangeEndMs = inputToMs(clipEndEl.value);
}

function currentPosMs() {
  if (!clipPlaying) {
    return cursorStartMs || rangeStartMs || inputToMs(clipStartEl.value);
  }
  return Math.min(rangeEndMs, cursorStartMs + (Date.now() - playStartedAt));
}

async function startClipFrom(startValue) {
  clipStatusEl.textContent = 'Loading clip from SD card...';
  const result = await window.cameraApi.playClip({
    cameraId: clipCameraEl.value,
    start: toCameraIso(startValue),
    end: toCameraIso(clipEndEl.value)
  });
  if (!result.ok) {
    clipPlaying = false;
    clipStatusEl.textContent = result.error;
    return;
  }
  markPlayStart(startValue);
  clipLabelEl.textContent = result.name + ' · ' + result.ip;
  clipLiveEl.src = result.url + '?t=' + Date.now();
}

function clipRangeOk() {
  if (!clipCameraEl.value) {
    clipStatusEl.textContent = 'Add and select a camera first.';
    return false;
  }
  if (!clipStartEl.value || !clipEndEl.value) {
    clipStatusEl.textContent = 'Pick a start and end date/time.';
    return false;
  }
  if (clipStartEl.value >= clipEndEl.value) {
    clipStatusEl.textContent = 'End must be after start.';
    return false;
  }
  return true;
}

document.getElementById('clip-last-5').addEventListener('click', () => setLastMinutes(5));
document.getElementById('clip-last-15').addEventListener('click', () => setLastMinutes(15));

document.getElementById('clip-play').addEventListener('click', async () => {
  if (clipRangeOk()) {
    await startClipFrom(clipStartEl.value);
  }
});

document.getElementById('clip-stop').addEventListener('click', async () => {
  await window.cameraApi.stopClip();
  clipPlaying = false;
  clipLiveEl.removeAttribute('src');
  clipStatusEl.textContent = 'Clip stopped.';
});

document.getElementById('clip-replay').addEventListener('click', async () => {
  if (clipRangeOk()) {
    await startClipFrom(clipStartEl.value);
  }
});

async function seekClip(seconds) {
  if (!clipRangeOk()) {
    return;
  }
  if (!rangeStartMs) {
    rangeStartMs = inputToMs(clipStartEl.value);
    rangeEndMs = inputToMs(clipEndEl.value);
    cursorStartMs = rangeStartMs;
  }
  const next = Math.min(rangeEndMs - 1000, Math.max(rangeStartMs, currentPosMs() + seconds * 1000));
  clipStatusEl.textContent = seconds < 0 ? 'Going back 5s...' : 'Jumping forward 5s...';
  await startClipFrom(toInputValue(new Date(next)));
}

document.getElementById('clip-back').addEventListener('click', () => seekClip(-5));
document.getElementById('clip-fwd').addEventListener('click', () => seekClip(5));

document.getElementById('clip-save').addEventListener('click', async () => {
  if (!clipRangeOk()) {
    return;
  }
  clipStatusEl.textContent = 'Saving clip...';
  const result = await window.cameraApi.saveClip(clipPayload());
  clipStatusEl.textContent = result.ok ? 'Saved to ' + result.filePath : result.error;
});

document.getElementById('clip-full').addEventListener('click', () => {
  if (clipLiveEl.requestFullscreen) {
    clipLiveEl.requestFullscreen();
  }
});

window.cameraApi.onClipStatus((payload) => {
  if (!payload.ok) {
    clipPlaying = false;
  }
  clipStatusEl.textContent = payload.message || payload.error || '';
});

window.fillClipCameras = fillClipCameras;
setLastMinutes(5);
