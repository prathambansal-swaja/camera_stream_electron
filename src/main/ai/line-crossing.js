// Line-crossing model only. Watchers, saved lines, and SD-card events.
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const cameras = require('../cameras');
const stream = require('../stream');

const W = 320;
const H = 180;
const FRAME = W * H;

class LineCrossing extends EventEmitter {
  constructor() {
    super();
    this.enabled = false;
    this.filePath = '';
    this.thumbDir = '';
    this.lines = [];
    this.events = [];
    this.watchers = {};
    this.mem = {};
  }

  info() {
    return { id: 'lineCrossing', name: 'Line crossing', enabled: this.enabled };
  }

  init(userData) {
    this.filePath = path.join(userData, 'ai-line-crossing.json');
    this.thumbDir = path.join(userData, 'ai-thumbs');
    if (!fs.existsSync(this.thumbDir)) {
      fs.mkdirSync(this.thumbDir, { recursive: true });
    }
    if (fs.existsSync(this.filePath)) {
      const saved = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.enabled = !!saved.enabled;
      this.lines = saved.lines || [];
      this.events = saved.events || [];
    }
    if (this.enabled) {
      this.syncWatchers();
    }
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify({
      enabled: this.enabled,
      lines: this.lines,
      events: this.events.map((e) => ({
        id: e.id, cameraId: e.cameraId, cameraName: e.cameraName,
        direction: e.direction, at: e.at
      }))
    }, null, 2));
  }

  thumbUrl(id) {
    const file = path.join(this.thumbDir, id + '.jpg');
    if (!fs.existsSync(file)) {
      return '';
    }
    return 'data:image/jpeg;base64,' + fs.readFileSync(file).toString('base64');
  }

  getState() {
    return {
      ok: true,
      enabled: this.enabled,
      lines: this.lines,
      events: this.events.map((e) => Object.assign({}, e, { thumb: this.thumbUrl(e.id) }))
    };
  }

  setEnabled(on) {
    this.enabled = on;
    this.save();
    on ? this.syncWatchers() : this.stop();
    return this.info();
  }

  addLine(line) {
    this.lines.push({
      id: Date.now().toString(),
      cameraId: line.cameraId,
      cameraName: line.cameraName,
      ip: line.ip,
      x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2,
      direction: line.direction || 'both'
    });
    this.save();
    if (this.enabled) {
      this.syncWatchers();
    }
    return this.getState();
  }

  removeLine(id) {
    this.lines = this.lines.filter((l) => l.id !== id);
    delete this.mem[id];
    this.save();
    this.syncWatchers();
    return this.getState();
  }

  stop() {
    for (const id of Object.keys(this.watchers)) {
      this.watchers[id].ffmpeg.kill('SIGKILL');
      delete this.watchers[id];
    }
  }

  syncWatchers() {
    const needed = {};
    for (const line of this.lines) {
      needed[line.cameraId] = true;
    }
    for (const id of Object.keys(this.watchers)) {
      if (!needed[id] || !this.enabled) {
        this.watchers[id].ffmpeg.kill('SIGKILL');
        delete this.watchers[id];
      }
    }
    if (!this.enabled) {
      return;
    }
    for (const id of Object.keys(needed)) {
      if (!this.watchers[id]) {
        this.startWatcher(id);
      }
    }
  }

  startWatcher(cameraId) {
    const camera = cameras.getById(cameraId);
    if (!camera || !ffmpegPath) {
      return;
    }
    const ff = spawn(ffmpegPath, [
      '-hide_banner', '-nostdin', '-rtsp_transport', 'tcp',
      '-i', stream.buildRtspUrl(camera),
      '-an', '-s', W + 'x' + H, '-r', '2',
      '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'
    ], { windowsHide: true });
    const watcher = { ffmpeg: ff, prev: null, buf: Buffer.alloc(0) };
    this.watchers[cameraId] = watcher;
    ff.stdout.on('data', (chunk) => {
      watcher.buf = Buffer.concat([watcher.buf, chunk]);
      while (watcher.buf.length >= FRAME) {
        const frame = watcher.buf.subarray(0, FRAME);
        watcher.buf = watcher.buf.subarray(FRAME);
        if (watcher.prev) {
          this.scanFrame(camera, frame, watcher.prev);
        }
        watcher.prev = Buffer.from(frame);
      }
    });
    ff.on('close', () => {
      if (this.watchers[cameraId] && this.watchers[cameraId].ffmpeg === ff) {
        delete this.watchers[cameraId];
      }
    });
  }

  scanFrame(camera, curr, prev) {
    for (const line of this.lines) {
      if (line.cameraId !== camera.id) {
        continue;
      }
      const mem = this.mem[line.id] || { last: '', lastAt: 0, cool: 0 };
      const now = Date.now();
      if (now < mem.cool) {
        this.mem[line.id] = mem;
        continue;
      }
      // Forget an old side so later unrelated motion is not a "cross".
      if (mem.last && now - mem.lastAt > 2000) {
        mem.last = '';
      }
      const ax = line.x1 * W;
      const ay = line.y1 * H;
      const bx = line.x2 * W;
      const by = line.y2 * H;
      const ldx = bx - ax;
      const ldy = by - ay;
      const len2 = ldx * ldx + ldy * ldy || 1;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < FRAME; i++) {
        if (Math.abs(curr[i] - prev[i]) < 28) {
          continue;
        }
        const x = i % W;
        const y = (i - x) / W;
        const t = Math.max(0, Math.min(1, ((x - ax) * ldx + (y - ay) * ldy) / len2));
        const dx = x - (ax + t * ldx);
        const dy = y - (ay + t * ldy);
        if (dx * dx + dy * dy > 324) {
          continue;
        }
        sum += ldx * (y - ay) - ldy * (x - ax);
        n += 1;
      }
      if (n < 22) {
        this.mem[line.id] = mem;
        continue;
      }
      const side = sum > 0 ? 'A' : 'B';
      const recent = mem.last && now - mem.lastAt <= 2000;
      const crossed = recent && (
        (mem.last === 'A' && side === 'B' && line.direction !== 'b-to-a') ||
        (mem.last === 'B' && side === 'A' && line.direction !== 'a-to-b')
      );
      if (crossed) {
        mem.cool = now + 8000;
        this.recordEvent(camera, mem.last + '→' + side);
        mem.last = '';
        mem.lastAt = 0;
      } else if (side !== mem.last) {
        mem.last = side;
        mem.lastAt = now;
      } else {
        mem.lastAt = now;
      }
      this.mem[line.id] = mem;
    }
  }

  recordEvent(camera, direction) {
    const id = Date.now().toString();
    const event = { id, cameraId: camera.id, cameraName: camera.name, direction, at: new Date().toISOString() };
    const thumb = path.join(this.thumbDir, id + '.jpg');
    // Snapshot only after a confirmed crossing. No event card without that frame.
    const grab = spawn(ffmpegPath, [
      '-hide_banner', '-nostdin', '-rtsp_transport', 'tcp',
      '-i', stream.buildRtspUrl(camera),
      '-frames:v', '1', '-s', '160x90', '-y', thumb
    ], { windowsHide: true });
    grab.on('close', () => {
      if (!fs.existsSync(thumb)) {
        return;
      }
      this.events.unshift(event);
      this.events = this.events.slice(0, 40);
      this.save();
      this.emit('event', Object.assign({}, event, { thumb: this.thumbUrl(id) }));
    });
  }
}

module.exports = new LineCrossing();
