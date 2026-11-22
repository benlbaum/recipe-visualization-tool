const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { execFile } = require('node:child_process');
const path = require('path');
const { pathToFileURL } = require('node:url');
const indexPath = path.join(__dirname, 'dist', 'index.html');

ipcMain.handle('mise:import-website', async (event, input) => {
  if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== pathToFileURL(indexPath).href)
    throw new Error('Open the import form in Mise.');
  const script = path.join(app.isPackaged ? process.resourcesPath : __dirname, 'website', 'import_recipe.py');
  const payload = JSON.stringify(input);
  if (Buffer.byteLength(payload) > 3_000_000) return { error: 'Import body is too large.' };
  return new Promise(resolve => {
    const child = execFile(process.platform === 'win32' ? 'python' : 'python3', [script], {
      windowsHide: true, timeout: 55000, maxBuffer: 12_000_000,
    }, (error, output) => {
      if (error) return resolve({ error: error.code === 'ENOENT'
        ? 'Install Python 3.12 or open the local Mise website to import a link.' : 'The website import could not finish. Try again or use saved HTML.' });
      try { resolve(JSON.parse(output)); } catch { resolve({ error: 'The website importer returned an unreadable response.' }); }
    });
    child.stdin.on('error', () => {}); // A missing interpreter can close the pipe before the callback.
    child.stdin.end(payload);
  });
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    backgroundColor: '#f6f5ef',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== pathToFileURL(indexPath).href) event.preventDefault();
  });
  win.loadFile(indexPath);

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
