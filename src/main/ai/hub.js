// AI model registry. Add a new model by requiring it here.
const lineCrossing = require('./line-crossing');
const intrusion = require('./intrusion');
const loitering = require('./loitering');

const models = { lineCrossing, intrusion, loitering };

function init(userData) {
  for (const model of Object.values(models)) {
    model.init(userData);
  }
}

function list() {
  return Object.values(models).map((model) => model.info());
}

function setEnabled(id, enabled) {
  if (!models[id]) {
    return { ok: false, error: 'Unknown model.' };
  }
  models[id].setEnabled(!!enabled);
  return { ok: true, models: list() };
}

function get(id) {
  return models[id] || null;
}

function stop() {
  for (const model of Object.values(models)) {
    if (model.stop) {
      model.stop();
    }
  }
}

module.exports = { init, list, setEnabled, get, stop, lineCrossing };
