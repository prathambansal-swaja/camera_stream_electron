// Loitering UI. Kept separate from line-crossing.
window.refreshLoiteringUi = function () {
  const el = document.getElementById('loitering-status');
  if (el) {
    el.textContent = 'Enable Loitering in Models. Dwell-time settings will go in this file.';
  }
};
