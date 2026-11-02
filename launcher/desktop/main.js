// Wrecking Yard launcher for Windows.
// Lists the game versions published as GitHub releases, downloads and unpacks the one you pick into the user
// data folder and starts it in its own window. Every version runs from local files under the same app name,
// so saves are shared between versions (and with the old stand-alone Wrecking Yard app).
const { app, BrowserWindow, Menu, ipcMain, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const unzip = require('./unzip');

const REPO = 'olimariansigma/sigma-uldor';
const API = `https://api.github.com/repos/${REPO}/releases?per_page=100`;
const DL_PREFIX = `https://github.com/${REPO}/releases/download/`;
const SAFE = /^[0-9A-Za-z.-]{1,32}$/;

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');

const versionsDir = () => path.join(app.getPath('userData'), 'versions');
const versionDir = (v) => { if (!SAFE.test(v)) throw new Error('bad version name'); return path.join(versionsDir(), v); };
let launcher = null;

function installed() {
  try {
    return fs.readdirSync(versionsDir(), { withFileTypes: true })
      .filter((d) => d.isDirectory() && SAFE.test(d.name) && fs.existsSync(path.join(versionsDir(), d.name, 'index.html')))
      .map((d) => d.name);
  } catch (e) { return []; }
}

async function download(sender, version, url) {
  if (!url.startsWith(DL_PREFIX)) throw new Error('unexpected download address');
  const dir = versionDir(version);
  fs.mkdirSync(versionsDir(), { recursive: true });
  const zip = path.join(versionsDir(), `.download-${version}.zip`), tmp = path.join(versionsDir(), `.unpack-${version}`);
  const r = await net.fetch(url, { headers: { 'User-Agent': 'WreckingYard-Launcher' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const total = +r.headers.get('content-length') || 0;
  const out = fs.createWriteStream(zip);
  const reader = r.body.getReader();
  let got = 0, last = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!out.write(Buffer.from(value))) await new Promise((res) => out.once('drain', res));
      got += value.length;
      const now = Date.now();
      if (now - last > 120) { last = now; sender.send('dl-progress', { version, got, total }); }
    }
  } finally { await new Promise((res) => out.end(res)); }
  sender.send('dl-progress', { version, got: total || got, total: total || got });
  fs.rmSync(tmp, { recursive: true, force: true });
  try {
    unzip(zip, tmp);
    if (!fs.existsSync(path.join(tmp, 'index.html'))) throw new Error('the download is not a game build');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
  } finally {
    fs.rmSync(zip, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function play(version) {
  const index = path.join(versionDir(version), 'index.html');
  if (!fs.existsSync(index)) throw new Error('version not installed');
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540, backgroundColor: '#111111',
    title: `Wrecking Yard ${version}`, show: false, icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, backgroundThrottling: false },
  });
  win.loadFile(index);
  win.once('ready-to-show', () => { win.maximize(); win.show(); if (launcher) launcher.hide(); });
  win.webContents.on('before-input-event', (e, input) => { if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen()); });
  // links out of the game open in the browser, never inside the game window
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
  win.on('closed', () => { if (launcher) { launcher.show(); launcher.webContents.executeJavaScript('window.wyRefresh && window.wyRefresh()').catch(() => {}); } });
}

function createLauncher() {
  Menu.setApplicationMenu(null);
  launcher = new BrowserWindow({
    width: 1120, height: 780, minWidth: 720, minHeight: 560, backgroundColor: '#0f1114', title: 'Wrecking Yard Launcher', show: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  });
  launcher.loadFile(path.join(__dirname, 'ui', 'index.html'));
  launcher.once('ready-to-show', () => launcher.show());
  launcher.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  launcher.on('closed', () => { launcher = null; if (!BrowserWindow.getAllWindows().length) app.quit(); });
}

ipcMain.handle('info', () => ({ platform: 'Windows', launcher: app.getVersion() }));
ipcMain.handle('installed', () => installed());
ipcMain.handle('releases', async () => {
  // always ask GitHub (its answers carry a 60 s cache header: a fresh release would not show up yet)
  const r = await net.fetch(`${API}&t=${Date.now()}`, { cache: 'no-store', headers: { 'User-Agent': 'WreckingYard-Launcher', Accept: 'application/vnd.github+json', 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error('GitHub answered ' + r.status);
  return r.text();
});
ipcMain.handle('download', (e, version, url) => download(e.sender, version, url));
ipcMain.handle('remove', (_e, version) => { fs.rmSync(versionDir(version), { recursive: true, force: true }); });
ipcMain.handle('play', (_e, version) => play(version));
ipcMain.handle('quit', () => app.quit());
ipcMain.handle('open', (_e, url) => { if (typeof url === 'string' && url.startsWith('https://github.com/')) shell.openExternal(url); });

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (launcher) { if (launcher.isMinimized()) launcher.restore(); launcher.show(); launcher.focus(); } });
  app.whenReady().then(createLauncher);
  app.on('window-all-closed', () => app.quit());
}
