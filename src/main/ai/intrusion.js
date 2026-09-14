// Intrusion model. Separate file so it can grow without touching line-crossing.
const fs = require('fs');
const path = require('path');

const model = {
  id: 'intrusion',
  name: 'Intrusion',
  enabled: false,
  filePath: '',

  info() {
    return { id: this.id, name: this.name, enabled: this.enabled };
  },

  init(userData) {
    this.filePath = path.join(userData, 'ai-intrusion.json');
    if (fs.existsSync(this.filePath)) {
      this.enabled = !!JSON.parse(fs.readFileSync(this.filePath, 'utf8')).enabled;
    }
  },

  setEnabled(on) {
    this.enabled = on;
    fs.writeFileSync(this.filePath, JSON.stringify({ enabled: this.enabled }, null, 2));
    return this.info();
  },

  stop() {}
};

module.exports = model;
