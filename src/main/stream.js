// EventEmitter lets this file fire events that main.js can listen to.
const EventEmitter = require('events');
const http = require('http');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const onvif = require('./onvif');

const PORT = 8787;
// Fallback if ONVIF is off. Real Honeywell path is /rtsp/streaming (slash).
const RTSP_PATH = '/rtsp/streaming?channel=1&subtype=1';

class StreamService extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    // id → { ffmpeg, clients, stopping, stderr, camera }
    this.sessions = {};
  }

  buildRtspUrl(camera) {
    const user = encodeURIComponent(camera.username);
    const pass = encodeURIComponent(camera.password);
    return 'rtsp://' + user + ':' + pass + '@' + camera.ip + ':554' + RTSP_PATH;
  }

  publicUrl(id) {
    return 'http://127.0.0.1:' + PORT + '/stream/' + id;
  }

  friendlyError(stderr) {
    const text = String(stderr || '').toLowerCase();
    if (text.includes('401') || text.includes('unauthorized')) {
      return 'Camera rejected the username or password.';
    }
    if (text.includes('connection refused') || text.includes('timed out') || text.includes('timeout')) {
      return 'Cannot reach that IP on RTSP port 554.';
    }
    if (text.includes('404') || text.includes('not found')) {
      return 'RTSP path not found. Is RTSP enabled?';
    }
    return 'Stream ended. Check IP, username, password, and RTSP enable.';
  }

  startHttpServer() {
    if (this.server) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        // /stream/CAMERA_ID  — each camera has its own MJPEG URL.
        const pathname = req.url.split('?')[0];
        const match = pathname.match(/^\/stream\/([^/]+)$/);
        const session = match ? this.sessions[match[1]] : null;

        if (!session) {
          res.statusCode = 404;
          res.end();
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        session.clients.push(res);
        req.on('close', () => {
          session.clients = session.clients.filter((client) => client !== res);
        });
      });

      this.server.listen(PORT, '127.0.0.1', resolve);
      this.server.on('error', reject);
    });
  }

  // Stop one camera. Does not touch the others.
  killSession(id) {
    const session = this.sessions[id];
    if (!session) {
      return;
    }
    session.stopping = true;
    if (session.ffmpeg) {
      session.ffmpeg.kill('SIGKILL');
    }
    for (const client of session.clients) {
      client.end();
    }
    delete this.sessions[id];
  }

  startFfmpeg(camera, rtspUrl) {
    this.killSession(camera.id);

    const session = {
      ffmpeg: null,
      clients: [],
      stopping: false,
      stderr: '',
      camera
    };
    this.sessions[camera.id] = session;

    session.ffmpeg = spawn(ffmpegPath, [
      '-hide_banner',
      '-nostdin',
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      '-an',
      '-q:v', '7',
      '-f', 'mpjpeg',
      '-boundary_tag', 'frame',
      'pipe:1'
    ], { windowsHide: true });

    session.ffmpeg.stdout.on('data', (chunk) => {
      for (const client of session.clients) {
        client.write(chunk);
      }
    });

    session.ffmpeg.stderr.on('data', (chunk) => {
      session.stderr += chunk.toString();
    });

    session.ffmpeg.on('error', () => {
      this.emit('status', {
        ok: false,
        id: camera.id,
        name: camera.name,
        error: 'Could not start ffmpeg.'
      });
    });

    session.ffmpeg.on('close', () => {
      if (session.stopping) {
        return;
      }
      this.emit('status', {
        ok: false,
        id: camera.id,
        name: camera.name,
        error: this.friendlyError(session.stderr)
      });
    });
  }

  // Start (or restart) one camera. Other cameras keep running.
  async start(camera) {
    if (!ffmpegPath) {
      return { ok: false, error: 'ffmpeg is missing. Run npm install.' };
    }

    await this.startHttpServer();

    let rtspUrl = this.buildRtspUrl(camera);
    try {
      const discovered = await onvif.getRtspUrl(camera);
      if (discovered) {
        rtspUrl = discovered;
      }
    } catch (err) {
      // Keep the Honeywell fallback URL if ONVIF is unreachable.
    }

    this.startFfmpeg(camera, rtspUrl);
    this.emit('status', {
      ok: true,
      id: camera.id,
      name: camera.name,
      message: 'Connecting to ' + camera.name + '...'
    });

    return {
      ok: true,
      id: camera.id,
      name: camera.name,
      ip: camera.ip,
      url: this.publicUrl(camera.id)
    };
  }

  // Start every camera. Used by stream:start-all.
  async startAll(cameraList) {
    const streams = [];
    for (const camera of cameraList) {
      streams.push(await this.start(camera));
    }
    return { ok: true, streams };
  }

  stop() {
    for (const id of Object.keys(this.sessions)) {
      this.killSession(id);
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    return { ok: true };
  }
}

module.exports = new StreamService();
