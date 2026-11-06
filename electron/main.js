// Electron shell for the Windows build: loads the bundled game from local files.
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
// speed, with nothing lost: laptops with two GPUs run the game on the fast one; the game never gets throttled when
// another window is in front; textures upload without an extra copy
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

function create() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540,
    backgroundColor: '#111111', title: 'Wrecking Yard', show: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, backgroundThrottling: false, spellcheck: false, v8CacheOptions: 'bypassHeatCheckAndEagerCompile' },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
}
app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
