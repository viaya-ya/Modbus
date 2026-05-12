const { app, BrowserWindow, dialog } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')

let mainWindow = null
let backendProcess = null

// ── Запуск NestJS бэкенда ─────────────────────────────────────────────────────
function startBackend() {
  const isPacked = app.isPackaged

  // В упакованном приложении бэкенд лежит в resources/backend
  // В dev-режиме запускаем напрямую через ts-node / node dist
  const backendDir = isPacked
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '..', 'backend')

  const script = isPacked
    ? path.join(backendDir, 'dist', 'main.js')
    : path.join(backendDir, 'dist', 'main.js')

  backendProcess = spawn(process.execPath, [script], {
    cwd: backendDir,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  backendProcess.stdout.on('data', d => console.log('[backend]', d.toString().trim()))
  backendProcess.stderr.on('data', d => console.error('[backend]', d.toString().trim()))

  backendProcess.on('exit', code => {
    console.log(`[backend] exited with code ${code}`)
  })
}

// ── Ожидание готовности бэкенда (опрос localhost:3000) ───────────────────────
function waitForBackend(maxAttempts = 30) {
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
          reject(new Error('Backend не запустился за отведённое время'))
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

// ── Жизненный цикл приложения ─────────────────────────────────────────────────
app.whenReady().then(async () => {
  startBackend()

  try {
    await waitForBackend()
    createWindow()
  } catch (err) {
    dialog.showErrorBox('Ошибка запуска', err.message)
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
