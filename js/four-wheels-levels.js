(function (root) {
  'use strict';
  const up = -Math.PI / 2, down = Math.PI / 2;
  const cone = (x, y) => ({ kind: 'cone', x, y });
  const box = (x, y) => ({ kind: 'box', x, y });
  const shelf = (x, y, w, h, label, stock = 'jars') => ({ x, y, w, h, label, stock });
  const levels = [
    {
      name: 'First push', department: '01 / Welcome to the store', limit: 65, par: 30,
      tip: 'Turn before the corner. Your cart will keep sliding until your next push changes its path.',
      start: { x: 76, y: 235, a: up },
      gates: [{ x: 82, y: 80 }, { x: 281, y: 76 }, { x: 392, y: 173 }],
      exit: { side: 'right', center: 249, width: 64 },
      shelves: [shelf(171, 137, 120, 48, 'THE NICE THINGS', 'plants')],
      objects: [cone(131, 91), cone(334, 152), cone(345, 238)],
      signs: [{ x: 68, y: 270, text: 'START HERE' }, { x: 237, y: 211, text: 'PLEASE BE CAREFUL' }]
    },
    {
      name: 'Endcap trouble', department: '02 / Household essentials', limit: 75, par: 43,
      tip: 'Swing the nose around the shelf, then push across the slide. Braking buys you room.',
      start: { x: 60, y: 235, a: up },
      gates: [{ x: 63, y: 67 }, { x: 234, y: 70 }, { x: 233, y: 239 }, { x: 411, y: 239 }],
      exit: { side: 'top', center: 417, width: 74 },
      shelves: [shelf(111, 111, 70, 93, 'CANDLES'), shelf(289, 108, 68, 96, 'MORE CANDLES')],
      objects: [cone(95, 66), cone(201, 165), cone(274, 216), cone(375, 169)],
      signs: [{ x: 57, y: 270, text: 'NO SHORTCUTS' }]
    },
    {
      name: 'The dish aisle', department: '03 / Everything is breakable', limit: 80, par: 44,
      tip: 'A cone costs two seconds. A shelf of dishes costs five. Leave room for the person behind the cart.',
      start: { x: 65, y: 240, a: 0 },
      gates: [{ x: 229, y: 237 }, { x: 236, y: 73 }, { x: 408, y: 75 }],
      exit: { side: 'bottom', center: 413, width: 82 },
      shelves: [shelf(99, 103, 82, 70, 'VERY BREAKABLE', 'dishes'), shelf(292, 140, 48, 126, 'ALSO BREAKABLE', 'dishes')],
      objects: [cone(227, 165), cone(270, 117), cone(375, 123), cone(367, 210), box(196, 207)],
      signs: [{ x: 97, y: 72, text: 'CERAMICS' }]
    },
    {
      name: 'Wet floor', department: '04 / A small maintenance issue', limit: 80, par: 43,
      tip: 'The puddle rolls faster and brakes slower. Turn early, and ease off the push before you reach it.',
      start: { x: 62, y: 237, a: up },
      gates: [{ x: 70, y: 69 }, { x: 250, y: 76 }, { x: 275, y: 174 }, { x: 417, y: 150 }],
      exit: { side: 'right', center: 244, width: 80 },
      puddle: { x: 287, y: 132, rx: 85, ry: 63 },
      shelves: [shelf(123, 116, 71, 99, 'DRY TOWELS', 'towels'), shelf(280, 226, 64, 48, 'MOPS', 'plants')],
      objects: [cone(213, 106), cone(357, 109), cone(296, 197), cone(367, 239)],
      signs: [{ x: 290, y: 49, text: 'SOMEONE IS ON IT' }]
    },
    {
      name: 'Some assembly required', department: '05 / The flat-pack department', limit: 85, par: 46,
      tip: 'The boxes can move. They would prefer not to. Use a little reverse to settle a turn.',
      start: { x: 62, y: 76, a: down },
      gates: [{ x: 72, y: 234 }, { x: 214, y: 234 }, { x: 216, y: 77 }, { x: 326, y: 99 }, { x: 326, y: 233 }, { x: 424, y: 232 }],
      exit: { side: 'top', center: 427, width: 72 },
      shelves: [shelf(126, 30, 51, 133, 'FLAT PACK', 'boxes'), shelf(255, 141, 48, 135, 'SOME ASSEMBLY', 'boxes'), shelf(349, 31, 39, 131, 'ONE SCREW LEFT', 'boxes')],
      objects: [box(197, 169), box(325, 110), box(115, 202), cone(219, 219), cone(406, 183)],
      signs: [{ x: 78, y: 48, text: 'WAREHOUSE' }]
    },
    {
      name: 'Closing time', department: '06 / Last cart out', limit: 70, par: 40,
      tip: 'A full lap, a few loose boxes, and one final exit. The store closes when the clock runs out.',
      start: { x: 61, y: 243, a: up },
      gates: [{ x: 61, y: 68 }, { x: 239, y: 68 }, { x: 240, y: 242 }, { x: 417, y: 239 }],
      exit: { side: 'top', center: 418, width: 78 },
      shelves: [shelf(113, 110, 65, 94, 'LAST CHANCE', 'dishes'), shelf(301, 103, 54, 98, 'DO NOT TOUCH', 'plants')],
      objects: [cone(204, 117), cone(274, 170), cone(385, 123), box(265, 215), box(90, 81), cone(371, 218)],
      puddle: { x: 241, y: 154, rx: 34, ry: 42 },
      signs: [{ x: 64, y: 274, text: 'CLOSING IN ONE MINUTE' }]
    }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = levels;
  else root.CartLevels = levels;
})(typeof globalThis !== 'undefined' ? globalThis : this);
