// AI tab shell: toggles models and shows the matching panel. No detection logic here.
const modelsEl = document.getElementById('ai-models');

function showModelPanel(id, enabled) {
  const panel = document.getElementById('panel-' + id);
  if (panel) {
    panel.hidden = !enabled;
  }
  if (id === 'lineCrossing' && enabled && window.refreshLineCrossingUi) {
    window.refreshLineCrossingUi();
  }
  if (id === 'intrusion' && enabled && window.refreshIntrusionUi) {
    window.refreshIntrusionUi();
  }
  if (id === 'loitering' && enabled && window.refreshLoiteringUi) {
    window.refreshLoiteringUi();
  }
}

async function renderAiModels() {
  const result = await window.cameraApi.listAiModels();
  modelsEl.innerHTML = '';
  for (const model of result.models || []) {
    const row = document.createElement('label');
    row.className = 'ai-model';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = model.enabled;
    box.addEventListener('change', async () => {
      const next = await window.cameraApi.setAiModel(model.id, box.checked);
      for (const item of next.models || []) {
        showModelPanel(item.id, item.enabled);
      }
    });
    row.appendChild(box);
    row.appendChild(document.createTextNode(' ' + model.name));
    modelsEl.appendChild(row);
    showModelPanel(model.id, model.enabled);
  }
}

document.getElementById('view-nav').addEventListener('click', (event) => {
  if (event.target.closest('[data-view="ai"]')) {
    renderAiModels();
  }
});
