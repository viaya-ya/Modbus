const { app, BrowserWindow, dialog } = require('electron')
const path = require('path')
const http = require('http')

let mainWindow = null

// ── Запуск NestJS бэкенда прямо в главном процессе Electron ──────────────────
function startBackend() {
  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '..', 'backend')

  // Указываем Node.js где искать node_modules бэкенда
  const nodeModulesPath = path.join(backendDir, 'node_modules')
  process.env.NODE_PATH = nodeModulesPath
  require('module')._initPaths()

  // Меняем рабочую директорию чтобы бэкенд нашёл папку devices/
  process.chdir(backendDir)

  // Загружаем скомпилированный NestJS — он стартует HTTP сервер на порту 3000
  require(path.join(backendDir, 'dist', 'main.js'))
}

// ── Ожидание готовности бэкенда (опрос localhost:3000) ───────────────────────
function waitForBackend(maxAttempts = 40) {
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
  if (process.platform !== 'darwin') app.quit()
})
