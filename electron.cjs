const { app, BrowserWindow } = require('electron');
const path = require('path');
const url = require('url');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const indexPath = path.join(__dirname, 'dist', 'index.html');
  console.log('Attempting to load:', indexPath);

  win.loadFile(indexPath).catch(e => {
    console.error('Failed to load index.html:', e);
    // Attempt to load as URL if file load fails
    win.loadURL(`file://${indexPath}`).catch(e => {
      console.error('Failed to load as URL:', e);
    });
  });

  win.webContents.openDevTools();

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