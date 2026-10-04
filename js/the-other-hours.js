/* Page-local clock arithmetic and an unranked follow-up list. */
(function () {
  'use strict';

  function formatTime(minutes) {
    minutes = ((minutes % 1440) + 1440) % 1440;
    var hours = Math.floor(minutes / 60);
    var remainder = minutes % 60;
    return (hours % 12 || 12) + ':' + String(remainder).padStart(2, '0') +
      (hours < 12 ? ' am' : ' pm');
  }

  var bedtime = document.getElementById('c-bed');
  var interval = document.getElementById('c-sens');
  var caffeineOutput = document.getElementById('c-out');
  if (bedtime && interval && caffeineOutput) {
    function updateCaffeine() {
      var match = /^(\d{2}):(\d{2})$/.exec(bedtime.value);
      var hours = Number(interval.value);
      if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 ||
          [8, 10, 12].indexOf(hours) === -1) {
        bedtime.setAttribute('aria-invalid', 'true');
        caffeineOutput.textContent = 'Enter a valid bedtime';
        return;
      }
      bedtime.removeAttribute('aria-invalid');
      var cutoff = Number(match[1]) * 60 + Number(match[2]) - hours * 60;
      caffeineOutput.textContent = formatTime(cutoff) +
        (cutoff < 0 ? ', previous day' : ', same day');
    }
    bedtime.disabled = false;
    interval.disabled = false;
    bedtime.addEventListener('input', updateCaffeine);
    bedtime.addEventListener('change', updateCaffeine);
    interval.addEventListener('change', updateCaffeine);
    updateCaffeine();
  }

  var grid = document.getElementById('audit-grid');
  var heading = document.getElementById('audit-head');
  var note = document.getElementById('audit-note');
  var list = document.getElementById('audit-list');
  if (grid && heading && note && list) {
    var inputs = Array.prototype.slice.call(grid.querySelectorAll('input[type="checkbox"]'));
    function updateList() {
      var selected = inputs.filter(function (input) { return input.checked; });
      list.replaceChildren();
      list.hidden = selected.length === 0;
      heading.textContent = selected.length === 0 ? 'No subjects selected' :
        selected.length + (selected.length === 1 ? ' subject to follow up on' : ' subjects to follow up on');
      note.textContent = selected.length === 0 ?
        'Select any subjects above to make a follow-up list. An empty list is not a health assessment.' :
        'Your selections appear in page order. You decide which to pursue first; the list makes no medical assessment.';
      selected.forEach(function (input) {
        var item = document.createElement('li');
        var link = document.createElement('a');
        link.href = '#' + input.getAttribute('data-target');
        link.textContent = input.getAttribute('data-label');
        item.appendChild(link);
        list.appendChild(item);
      });
    }
    inputs.forEach(function (input) {
      input.disabled = false;
      input.addEventListener('change', updateList);
    });
    updateList();
  }
})();
