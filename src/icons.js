// UI icon set: small inline SVGs (24x24, stroke = currentColor) so menus, HUD and touch buttons look
// consistent on every device instead of relying on emoji fonts.
const P = {
  hammer: '<path d="M13.5 3.5l7 7-3.2 3.2-7-7z" fill="currentColor" stroke="none"/><path d="M12 9L3.5 17.5l3 3L15 12"/>',
  hand: '<path d="M7.5 12.5V6.8a1.5 1.5 0 013 0V11m0-5.2V4.6a1.5 1.5 0 013 0V11m0-5a1.5 1.5 0 013 0v6m0-3.4a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1.3a6 6 0 01-4.8-2.4l-2.6-3.6a1.6 1.6 0 012.5-2l1.2 1.4"/>',
  brick: '<rect x="2.5" y="8.5" width="19" height="9.5" rx="1.6"/><rect x="5.6" y="11" width="5" height="4.5" rx=".8"/><rect x="13.4" y="11" width="5" height="4.5" rx=".8"/>',
  throw: '<rect x="8" y="10" width="13" height="7.5" rx="1.4"/><rect x="10.2" y="12" width="3.4" height="3.5" rx=".6"/><rect x="15.4" y="12" width="3.4" height="3.5" rx=".6"/><path d="M2 9h4M3 12.5h3M2 16h4"/>',
  jump: '<path d="M12 18V5M6.5 10.5L12 5l5.5 5.5M5 21h14"/>',
  spawn: '<rect x="2" y="16" width="12.5" height="4.5" rx="2.25"/><path d="M4 16v-3.5h3.5L9 9h4v7"/><path d="M11.5 10.5l5.5-6 4.5 6.5"/><path d="M21.5 11l-1.2 4.2h-3.2l1.2-3.2" fill="currentColor"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  save: '<path d="M5 3h11l4 4v12a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 011-2z"/><path d="M8 3v5h7V3M8 21v-6.5h8V21"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 014.5 5H9l2 2.5h8.5A1.5 1.5 0 0121 9v9.5a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.3a2.7 2.7 0 015.2 1c0 1.8-2.6 2.3-2.6 4"/><circle cx="12" cy="17.4" r=".7" fill="currentColor"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".7" fill="currentColor"/>',
  camera: '<rect x="2.5" y="7" width="13.5" height="10" rx="2"/><path d="M16 11l5.5-3v8L16 13"/>',
  grab: '<path d="M12 2.5V7M7 7h10M8 7l-3.5 6 3.5 5.5M16 7l3.5 6-3.5 5.5"/><circle cx="12" cy="7" r="1.2" fill="currentColor"/>',
  armOut: '<path d="M5 19L19 5M10 5h9v9"/>',
  armIn: '<path d="M19 5L5 19M14 19H5v-9"/>',
  curlIn: '<path d="M20 12a8 8 0 11-2.3-5.7"/><path d="M20.2 3.8v5h-5"/>',
  curlOut: '<path d="M4 12a8 8 0 102.3-5.7"/><path d="M3.8 3.8v5h5"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  pile: '<path d="M2 20l7.5-11.5 4 6 3-4L22 20z"/>',
  cement: '<path d="M4 9l2.6 10h10.8L20 9z"/><path d="M3 9h18"/><path d="M8.5 5.5c1.6-1.4 5.4-1.4 7 0"/>',
  road: '<path d="M8 3L4 21M16 3l4 18M12 4v3M12 10.5v3M12 17v3.5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0115 0"/>',
  userPlus: '<circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0114 0M19 7.5v6M16 10.5h6"/>',
  userMinus: '<circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0114 0M16 10.5h6"/>',
  broom: '<path d="M20.5 3.5l-8.5 8.5"/><path d="M7.5 12.5l4 4-1.6 4.5-7-7z"/>',
  pothole: '<ellipse cx="12" cy="14" rx="9" ry="4.2"/><path d="M7.5 13.5l2.2 1.1 2.8-1.1 2.8 1.1 1.4-.6"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  refresh: '<path d="M20 12a8 8 0 01-14.3 4.9M4 12A8 8 0 0118.3 7.1"/><path d="M19 3v4.5h-4.5M5 21v-4.5h4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bucket: '<path d="M5 8.5h14L17 20H7z"/><path d="M5 8.5a7 4.5 0 0114 0"/>',
  water: '<path d="M12 3s7 7.5 7 12a7 7 0 01-14 0c0-4.5 7-12 7-12z"/>',
  gate: '<rect x="5" y="3" width="14" height="18" rx="1"/><circle cx="15" cy="12" r="1.1" fill="currentColor"/>',
  vibrate: '<path d="M2 12h3l2-5 3 10 3-10 3 10 2-5h4"/>',
  enter: '<path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 012 2v14a2 2 0 01-2 2h-5"/>',
  exit: '<path d="M14 7l-5 5 5 5M9 12h12M10 3H5a2 2 0 00-2 2v14a2 2 0 002 2h5"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  play: '<path d="M7 4.5l12.5 7.5L7 19.5z" fill="currentColor"/>',
  house: '<path d="M3 11l9-7 9 7v9.5H3z"/><path d="M9.5 20.5v-6h5v6"/>',
  weight: '<path d="M6.5 8.5h11l3 11.5h-17z"/><circle cx="12" cy="5.5" r="2.2"/>',
  ball: '<path d="M12 2v8"/><circle cx="12" cy="15" r="6" fill="currentColor"/>',
  paver: '<path d="M2 18h20M4 18v-5h9l2-4h5v9"/><path d="M2 21h20" stroke-dasharray="2 2"/>',
  check: '<path d="M4.5 12.5l5 5L20 7"/>',
  trowel: '<path d="M3 21l5-5"/><path d="M8.5 15.5l2.2-2.2"/><path d="M10.5 13.5L21 3l-2 9-9 1.5z" fill="currentColor"/>',
  wifi: '<path d="M2 9a15 15 0 0120 0M5.5 12.5a10 10 0 0113 0M9 16a5 5 0 016 0"/><circle cx="12" cy="19.2" r="1" fill="currentColor"/>',
};

export function ic(name, cls = '') {
  const p = P[name] || P.help;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

// replace the emoji used in older message strings with icons
const EMOJI = [['🔨', 'hammer'], ['✋', 'hand'], ['🧱', 'brick'], ['🏗️', 'spawn'], ['🌐', 'globe'], ['❌', 'error'], ['💾', 'save'], ['⚠️', 'warn'],
  ['📂', 'folder'], ['🛣️', 'road'], ['👋', 'userMinus'], ['🙋', 'userPlus'], ['⭐', 'star'], ['🧹', 'broom'], ['🕳️', 'pothole'], ['🫗', 'trash'],
  ['⛰️', 'pile'], ['📍', 'pin'], ['⏱️', 'clock'], ['🗑', 'trash'], ['🔄', 'refresh'], ['➕', 'plus'], ['🪣', 'bucket'], ['🧑', 'user'], ['✊', 'grab'],
  ['🚪', 'gate'], ['⚙️', 'gear'], ['〰️', 'vibrate'], ['🎥', 'camera'], ['💧', 'water'], ['✅', 'check'], ['🚧', 'warn'], ['🏠', 'house']];
export function iconize(html) {
  if (!html) return html;
  let s = String(html);
  for (const [e, n] of EMOJI) if (s.includes(e)) s = s.split(e).join(ic(n, 'inl'));
  return s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\u{FE0F}?/gu, '');
}

// fill every <i data-ic="name"> placeholder in the page
export function fillIcons(root = document) {
  root.querySelectorAll('[data-ic]').forEach((el) => { if (!el.dataset.done) { el.innerHTML = ic(el.dataset.ic) + el.innerHTML; el.dataset.done = '1'; } });
}
