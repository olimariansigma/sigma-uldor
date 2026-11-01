// Wrecking Yard launcher UI (shared by the Windows and Android launchers).
// Game versions are GitHub releases of the repository with a "WreckingYard-game-<version>.zip" asset.
// The native side (Electron preload / Android bridge) lists, downloads, unpacks, deletes and starts versions.
(() => {
  const REPO = 'olimariansigma/sigma-uldor';
  const ASSET = /^WreckingYard-game-(.+)\.zip$/;
  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------- native adapters
  function androidNative(A) {
    const wait = { rel: [], dl: {} };
    window.wyEvent = (e) => {
      if (e.type === 'releases') for (const w of wait.rel.splice(0)) (e.ok ? w.res(e.body) : w.rej(new Error(e.error || 'network error')));
      else if (e.type === 'progress') { const d = wait.dl[e.version]; if (d) d.prog(e.got, e.total); }
      else if (e.type === 'done') { const d = wait.dl[e.version]; delete wait.dl[e.version]; if (d) (e.ok ? d.res() : d.rej(new Error(e.error || 'download failed'))); }
    };
    return {
      info: async () => JSON.parse(A.info()),
      installed: async () => JSON.parse(A.installed()),
      releases: () => new Promise((res, rej) => { wait.rel.push({ res, rej }); A.releases(); }),
      download: (v, url, prog) => new Promise((res, rej) => { wait.dl[v] = { res, rej, prog }; A.download(v, url); }),
      remove: async (v) => A.remove(v),
      play: (v) => A.play(v),
      open: (u) => A.openUrl(u),
    };
  }
  // plain browser (for testing the page): pretend-installs into localStorage
  function browserNative() {
    const key = 'wyl-installed', get = () => JSON.parse(localStorage.getItem(key) || '[]');
    return {
      info: async () => ({ platform: 'browser', launcher: 'dev' }),
      installed: async () => get(),
      releases: async () => { const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); },
      download: async (v, url, prog) => { for (let i = 1; i <= 10; i++) { await new Promise((r) => setTimeout(r, 60)); prog(i * 10, 100); } localStorage.setItem(key, JSON.stringify([...new Set([...get(), v])])); },
      remove: async (v) => localStorage.setItem(key, JSON.stringify(get().filter((x) => x !== v))),
      play: (v) => alert('Would start version ' + v),
      open: (u) => window.open(u, '_blank'),
    };
  }
  const N = window.wyNative || (window.WYAndroid ? androidNative(window.WYAndroid) : browserNative());

  // ---------------------------------------------------------------- state
  const st = { releases: null, relError: null, installed: new Set(), busy: {}, open: new Set(), checking: false };
  const cmp = (a, b) => { const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0), pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0); for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; } return 0; };
  const mb = (n) => (n / 1048576).toFixed(n > 104857600 ? 0 : 1) + ' MB';
  const cleanNotes = (s) => (s || '').replace(/\r/g, '').split('\n').filter((l) => !/^(Co-Authored-By|Claude-Session|https:\/\/claude\.ai)/i.test(l.trim())).join('\n').replace(/\*\*/g, '').trim();

  function parseReleases(body) {
    const out = [];
    for (const r of JSON.parse(body)) {
      if (r.draft) continue;
      const a = (r.assets || []).find((x) => ASSET.test(x.name));
      if (!a) continue;
      const version = a.name.match(ASSET)[1];
      out.push({ version, tag: r.tag_name, date: (r.published_at || r.created_at || '').slice(0, 10), notes: cleanNotes(r.body), url: a.browser_download_url, size: a.size, page: r.html_url });
    }
    out.sort((x, y) => cmp(y.version, x.version));
    if (out.length) out[0].latest = true;
    return out;
  }

  async function refreshInstalled() { st.installed = new Set(await N.installed()); }
  async function check() {
    st.checking = true; render();
    try { st.releases = parseReleases(await N.releases()); st.relError = null; } catch (e) { st.relError = e.message || String(e); }
    st.checking = false; render();
  }

  const newestInstalled = () => [...st.installed].sort((a, b) => cmp(b, a))[0] || null;
  const latestRelease = () => (st.releases && st.releases[0]) || null;

  async function download(v) {
    const rel = st.releases && st.releases.find((r) => r.version === v);
    if (!rel || st.busy[v] != null) return false;
    st.busy[v] = 0; render();
    try {
      await N.download(v, rel.url, (got, total) => { st.busy[v] = total ? got / total : 0; paintBar(v); });
      await refreshInstalled();
      return true;
    } catch (e) {
      alert(`Download of ${v} failed: ${e.message || e}`);
      return false;
    } finally { delete st.busy[v]; render(); }
  }
  async function remove(v) {
    if (!confirm(`Delete version ${v} from this device? (Your saves are kept.)`)) return;
    await N.remove(v); await refreshInstalled(); render();
  }
  function play(v) { if (v) N.play(v); }

  // ---------------------------------------------------------------- UI
  function paintBar(v) { const b = document.querySelector(`.row[data-v="${CSS.escape(v)}"] .bar > div`); if (b) b.style.width = Math.round((st.busy[v] || 0) * 100) + '%'; }

  function render() {
    const inst = newestInstalled(), latest = latestRelease();
    const upd = latest && (!inst || cmp(latest.version, inst) > 0) ? latest : null;
    $('heroVer').textContent = upd ? (inst ? `v${inst}` : `v${upd.version}`) : inst ? `v${inst}` : '—';
    const s = $('status');
    s.className = 'status';
    if (st.checking) s.textContent = 'Checking for updates…';
    else if (st.relError && !inst) { s.textContent = "Can't reach GitHub. Connect to the internet to download the game."; s.classList.add('bad'); }
    else if (st.relError) { s.textContent = "Can't reach GitHub right now. Your installed versions still work."; s.classList.add('warn'); }
    else if (upd && inst) { s.textContent = `Update available: v${upd.version}`; s.classList.add('warn'); }
    else if (upd) { s.textContent = `Version ${upd.version} is ready to download.`; }
    else if (inst) { s.textContent = `You have the latest version.`; s.classList.add('good'); }
    else s.textContent = 'No versions found yet.';
    const pb = $('playBtn');
    const busyAny = Object.keys(st.busy).length > 0;
    if (upd) { pb.textContent = inst ? `UPDATE TO v${upd.version}` : 'DOWNLOAD & PLAY'; pb.disabled = busyAny; pb.onclick = async () => { if (await download(upd.version)) play(upd.version); }; }
    else { pb.textContent = 'PLAY'; pb.disabled = !inst || busyAny; pb.onclick = () => play(inst); }
    $('checkBtn').disabled = st.checking;

    // versions list: every release plus anything installed that is no longer listed
    const map = new Map();
    for (const r of st.releases || []) map.set(r.version, r);
    for (const v of st.installed) if (!map.has(v)) map.set(v, { version: v });
    const rows = [...map.values()].sort((a, b) => cmp(b.version, a.version));
    const box = $('versions');
    if (!rows.length) { box.innerHTML = `<div class="empty">${st.checking ? 'Loading versions…' : st.relError ? 'Versions will show up here when you are online.' : 'No releases yet.'}</div>`; return; }
    box.innerHTML = rows.map((r) => {
      const has = st.installed.has(r.version), busy = st.busy[r.version] != null;
      const meta = [r.date ? 'Released ' + r.date : has ? 'Installed on this device' : '', r.size ? mb(r.size) : ''].filter(Boolean).join(' · ');
      const acts = busy ? '<span class="meta">Downloading…</span>'
        : has ? `<button class="btn primary sm" data-act="play">PLAY</button><button class="btn red sm" data-act="del">DELETE</button>`
        : r.url ? `<button class="btn dark sm" data-act="dl">DOWNLOAD</button>` : '';
      const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      return `<div class="row${busy ? ' busy' : ''}${st.open.has(r.version) ? ' open' : ''}" data-v="${esc(r.version)}">
        <div><div class="name">v${esc(r.version)}${r.latest ? '<span class="tag latest">LATEST</span>' : ''}${has ? '<span class="tag inst">INSTALLED</span>' : ''}</div>
        <div class="meta">${esc(meta)}${r.notes ? ' · <span class="more" data-act="notes">What\'s new</span>' : ''}</div></div>
        <div class="acts">${acts}</div>
        <div class="bar"><div style="width:${Math.round((st.busy[r.version] || 0) * 100)}%"></div></div>
        ${r.notes ? `<div class="notes">${esc(r.notes)}</div>` : ''}
      </div>`;
    }).join('');
  }

  $('versions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const v = b.closest('.row').dataset.v, act = b.dataset.act;
    if (act === 'play') play(v);
    else if (act === 'del') remove(v);
    else if (act === 'dl') download(v);
    else if (act === 'notes') { st.open.has(v) ? st.open.delete(v) : st.open.add(v); render(); }
  });
  $('checkBtn').addEventListener('click', check);
  $('ghLink').addEventListener('click', (e) => { e.preventDefault(); N.open(`https://github.com/${REPO}/releases`); });
  window.wyRefresh = async () => { await refreshInstalled(); render(); };

  (async () => {
    try { const i = await N.info(); $('appInfo').textContent = `Launcher ${i.launcher} · ${i.platform}`; } catch (e) { /* ignore */ }
    await refreshInstalled(); render();
    check();
  })();
})();
