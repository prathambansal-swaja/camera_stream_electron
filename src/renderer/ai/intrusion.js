// Intrusion UI. Kept separate from line-crossing.
window.refreshIntrusionUi = function () {
  const el = document.getElementById('intrusion-status');
  if (el) {
    el.textContent = 'Enable Intrusion in Models. Zone settings will go in this file.';
  }
};
