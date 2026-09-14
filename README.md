# Camera desktop app

Electron app for live RTSP, SD-card clips, and AI line-crossing.

```
src/
  main/                 Node / Electron main process
    index.js            App start, window, quit
    ipc.js              All IPC channels (add handlers here)
    cameras.js          Saved camera list
    stream.js           Live ffmpeg + HTTP MJPEG
    clip.js             SD-card playback / save
    onvif.js            Discover live RTSP URL
    ai/
      hub.js            Registers AI models
      line-crossing.js  Line-crossing detection
      intrusion.js      Intrusion model stub
      loitering.js      Loitering model stub
  preload/
    preload.js          Safe bridge → window.cameraApi
  renderer/             Chromium UI
    index.html
    app.js              Tabs + Live view
    clip.js             Clip view
    styles/app.css
    ai/
      hub.js            Model toggles
      line-crossing.js  Draw line + events
      intrusion.js
      loitering.js
```

## How to change things

| Task | Where |
|---|---|
| New IPC channel | `src/main/ipc.js` and `src/preload/preload.js` |
| Live stream | `src/main/stream.js` |
| SD playback | `src/main/clip.js` |
| Add/save cameras | `src/main/cameras.js` |
| New AI model | New files in `src/main/ai/` and `src/renderer/ai/`, register in both hub files |
| UI / CSS | `src/renderer/` |

```bash
npm start
```
