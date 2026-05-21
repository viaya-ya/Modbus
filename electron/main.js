const { app, BrowserWindow, dialog } = require('electron')
const { fork } = require('child_process')
const path = require('path')
const http = require('http')

let backendProcess = null
let mainWindow = null
let backendErrors = []

// ── Запуск NestJS через fork с ELECTRON_RUN_AS_NODE ──────────────────────────
function startBackend() {
  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '..', 'backend')

  const scriptPath = path.join(backendDir, 'dist', 'main.js')

  backendProcess = fork(scriptPath, [], {
    cwd: backendDir,
    execPath: process.execPath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      USER_DATA_PATH: app.getPath('userData'),
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })

  backendProcess.stdout?.on('data', d => console.log('[backend]', d.toString().trim()))
  backendProcess.stderr?.on('data', d => {
    const msg = d.toString().trim()
    console.error('[backend]', msg)
    backendErrors.push(msg)
  })
  backendProcess.on('exit', code => console.log(`[backend] exited: ${code}`))
}

// ── Ожидание готовности бэкенда ───────────────────────────────────────────────
function waitForBackend(maxAttempts = 120) {
  return new Promise((resolve, reject) => {
    let attempts = 0
    function check() {
      const req = http.get('http://localhost:3000', res => {
        res.destroy()
        resolve()
      })
      req.on('error', () => {
        attempts++
        if (attempts >= maxAttempts) {
          const errDetail = backendErrors.slice(-5).join('\n') || 'нет вывода'
          reject(new Error(`Backend не запустился (${maxAttempts * 0.5} сек)\n\nПоследние ошибки:\n${errDetail}`))
        } else {
          setTimeout(check, 500)
        }
      })
      req.setTimeout(500, () => { req.destroy() })
    }
    check()
  })
}

// ── Создание окна ─────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Modbus Controller',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  mainWindow.loadURL('http://localhost:3000')
  mainWindow.on('closed', () => { mainWindow = null })
}

// ── Жизненный цикл ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    startBackend()
    await waitForBackend()
    createWindow()
  } catch (err) {
    dialog.showErrorBox('Ошибка запуска', String(err.message ?? err))
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill()
})
