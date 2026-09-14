// Playback from the camera SD card. One clip ffmpeg at a time.
const EventEmitter = require('events');
const http = require('http');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const PORT = 8788;
const CLIP_URL = 'http://127.0.0.1:' + PORT + '/clip';

class ClipService extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.ffmpeg = null;
    this.clients = [];
    this.stopping = false;
    this.stderr = '';
  }

  // Honeywell ONVIF replay URL. localtime=true = start/end are camera-local.
  buildPlaybackUrl(camera, startIso, endIso) {
    const user = encodeURIComponent(camera.username);
    const pass = encodeURIComponent(camera.password);
    return 'rtsp://' + user + ':' + pass + '@' + camera.ip +
      ':554/rtsp/playback?channel=1&starttime=' + encodeURIComponent(startIso) +
      '&endtime=' + encodeURIComponent(endIso) + '&localtime=true';
  }

  startHttpServer() {
    if (this.server) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        if (req.url.split('?')[0] !== '/clip') {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        this.clients.push(res);
        req.on('close', () => {
          this.clients = this.clients.filter((c) => c !== res);
        });
      });
      this.server.listen(PORT, '127.0.0.1', resolve);
      this.server.on('error', reject);
    });
  }

  killFfmpeg() {
    if (!this.ffmpeg) {
      return;
    }
    this.stopping = true;
    this.ffmpeg.kill('SIGKILL');
    this.ffmpeg = null;
  }

  startFfmpeg(rtspUrl) {
    this.killFfmpeg();
    this.stopping = false;
    this.stderr = '';

    this.ffmpeg = spawn(ffmpegPath, [
      '-hide_banner', '-nostdin',
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      '-an', '-q:v', '7',
      '-f', 'mpjpeg', '-boundary_tag', 'frame',
      'pipe:1'
    ], { windowsHide: true });

    this.ffmpeg.stdout.on('data', (chunk) => {
      for (const client of this.clients) {
        client.write(chunk);
      }
    });
    this.ffmpeg.stderr.on('data', (chunk) => {
      this.stderr += chunk.toString();
    });
    this.ffmpeg.on('close', () => {
      if (!this.stopping) {
        this.emit('status', {
          ok: false,
          error: 'Clip ended. Check the time range and that the SD card has footage.'
        });
      }
    });
  }

  async play(camera, startIso, endIso) {
    if (!ffmpegPath) {
      return { ok: false, error: 'ffmpeg is missing. Run npm install.' };
    }
    await this.startHttpServer();
    this.startFfmpeg(this.buildPlaybackUrl(camera, startIso, endIso));
    this.emit('status', { ok: true, message: 'Playing clip from ' + camera.name });
    return { ok: true, url: CLIP_URL, name: camera.name, ip: camera.ip };
  }

  // Write the same SD-card range to an .mp4 file (Save clip).
  save(camera, startIso, endIso, filePath) {
    return new Promise((resolve) => {
      const ff = spawn(ffmpegPath, [
        '-hide_banner', '-nostdin', '-y',
        '-rtsp_transport', 'tcp',
        '-i', this.buildPlaybackUrl(camera, startIso, endIso),
        '-an', '-c', 'copy',
        filePath
      ], { windowsHide: true });

      let stderr = '';
      ff.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      ff.on('close', (code) => {
        if (code === 0) {
          resolve({ ok: true, filePath });
        } else {
          resolve({ ok: false, error: 'Could not save clip. Is there footage in that range?' });
        }
      });
    });
  }

  stop() {
    this.killFfmpeg();
    for (const client of this.clients) {
      client.end();
    }
    this.clients = [];
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    return { ok: true };
  }
}

module.exports = new ClipService();
