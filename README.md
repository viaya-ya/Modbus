# Modbus Controller

Программа для управления частотными преобразователями через Modbus RTU / RS-485.

## Что это такое

У тебя есть **частотный преобразователь** (ПЧ) — железяка которая управляет двигателем насоса. Внутри неё куча настроек: частота вращения, ток, температура, ПИД-регулятор и т.д.

Эта программа позволяет **читать и менять эти настройки через компьютер**.

## Как физически всё подключено

```
Компьютер
    │
  USB
    │
USB → RS-485 адаптер    ← маленькая коробочка/свисток
    │
  RS-485 (два провода: A и B)
    │
Частотный преобразователь ELHART EMD-PUMP
```

## Как работает протокол Modbus

ПЧ — это тупое устройство, само ничего не шлёт. Компьютер спрашивает — ПЧ отвечает.

```
Компьютер:  "Устройство №1, дай мне регистр №0"
ПЧ:         "Значение: 5000"
Программа:  5000 × 0.01 = 50.00 Гц  (применяем scale из JSON)
```

Каждый параметр — это просто **номер регистра** в памяти ПЧ.

## Что делает каждая часть программы

**`devices/elhart-emd-pump.json`** — это "карта" устройства. Описывает какой регистр = какой параметр, с какими единицами и масштабом. Добавил новый JSON → новое устройство в UI.

**Backend (NestJS, порт 3000)** — мозг. Он один умеет разговаривать с железом:
- читает JSON конфиги
- подключается к COM-порту
- шлёт Modbus-запросы к ПЧ
- раздаёт данные фронту

**Frontend (React, порт 5173)** — морда. Показывает всё красиво в браузере. Сам с железом не работает, только просит backend.

> Браузер → Backend → USB адаптер → RS-485 → ПЧ, и обратно.

## Запуск

**Backend** — из папки `backend/`:
```bash
npm run start:dev
```
Запускается на **порту 3000** → `http://localhost:3000`

**Frontend** — из папки `frontend/`:
```bash
npm run dev
```
Запускается на **порту 5173** → `http://localhost:5173`

## Как фронт общается с бэком

Два канала одновременно, оба на порт **3000**:

**1. HTTP REST** (через axios + Vite proxy)
- Фронт отправляет запрос на `/api/modbus/read`
- Vite-сервер (5173) перехватывает `/api/...` и проксирует на `localhost:3000/...`
- Настроено в `frontend/vite.config.js`

**2. WebSocket** (socket.io)
- Фронт подключается напрямую к `http://localhost:3000`
- Через него идут: список устройств, статус подключения, данные мониторинга в реальном времени
- Настроено в `frontend/src/socket.js`

## Схема

```
Браузер (5173)
    │
    ├─── HTTP /api/* ──► Vite proxy ──► localhost:3000  (REST: чтение/запись регистров)
    │
    └─── WebSocket ─────────────────► localhost:3000  (реалтайм: мониторинг, устройства)
```

В продакшене (без Vite) оба запроса шли бы напрямую на 3000. Proxy нужен только в режиме разработки.

## Структура проекта

```
Modbus/
  backend/        — NestJS сервер (порт 3000)
    src/
      devices/    — модуль работы с JSON конфигами устройств
      modbus/     — модуль Modbus RTU драйвера
      gateway/    — WebSocket gateway
  frontend/       — React + Vite (порт 5173)
    src/
      components/ — UI компоненты
  devices/        — JSON файлы конфигов устройств
```

## Добавление нового устройства

Положи JSON файл в папку `devices/` — устройство появится в UI автоматически без перезапуска.

---

## Запуск как десктопное приложение (Electron)

Electron упаковывает бэкенд и фронтенд в одно окно — не нужен браузер, не нужно запускать два сервера вручную.

### Требования

- Node.js 18+
- npm 9+
- Установленные зависимости во всех трёх папках:

```bash
# из корня проекта
npm install

# бэкенд
cd backend && npm install && cd ..

# фронтенд
cd frontend && npm install && cd ..
```

---

### Запуск в режиме разработки (macOS и Windows)

Сначала нужно собрать фронтенд и бэкенд, потом запустить Electron:

```bash
# из корня проекта
npm run build       # собирает frontend → backend/frontend-dist и компилирует backend
npm run electron:dev  # запускает Electron окно
```

Окно откроется автоматически. Бэкенд стартует внутри — отдельно запускать не нужно.

Чтобы остановить — закрыть окно или в терминале:
```bash
# macOS / Linux
pkill -f electron

# Windows (PowerShell)
Stop-Process -Name electron -Force
```

---

### Сборка установщика

#### macOS → .dmg

```bash
npm run dist:mac
```

Файл появится в `dist-electron/Modbus Controller-1.0.0.dmg`

#### Windows → .exe (установщик NSIS)

Выполнять **на Windows-машине**:

```bash
npm run dist:win
```

Файл появится в `dist-electron/Modbus Controller Setup 1.0.0.exe`

> Собрать .exe с macOS напрямую нельзя без Wine. Используй Windows-машину или GitHub Actions (см. ниже).

#### Linux → .AppImage

```bash
npm run dist:linux
```

---

### Сборка .exe через GitHub Actions (без Windows-машины)

Если у тебя macOS но нужен .exe — настрой автосборку на GitHub:

1. Залей проект на GitHub
2. Создай файл `.github/workflows/build.yml`:

```yaml
name: Build Electron

on:
  push:
    tags:
      - 'v*'

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm install
      - run: cd backend && npm install && cd ..
      - run: cd frontend && npm install && cd ..
      - run: npm run dist:win
      - uses: softprops/action-gh-release@v1
        with:
          files: dist-electron/*.exe
```

3. Сделай тег и запушь:

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub сам соберёт `.exe` и положит его в раздел **Releases** репозитория — оттуда можно скачать.

---

### Структура Electron

```
Modbus/
  electron/
    main.js         — главный процесс Electron:
                      запускает NestJS, ждёт готовности, открывает окно
  package.json      — корневой: скрипты сборки + конфиг electron-builder
```

**Как это работает внутри:**

```
Electron (main.js)
    │
    ├── запускает backend/dist/main.js как дочерний процесс Node.js
    │
    ├── каждые 500мс проверяет http://localhost:3000
    │
    └── когда бэкенд ответил → открывает BrowserWindow → загружает localhost:3000
```

NestJS видит папку `backend/frontend-dist` и отдаёт собранный React как статику. Всё работает на одном порту 3000.

---

### Скрипты

| Команда | Что делает |
|---|---|
| `npm run build` | Собирает фронт + бэкенд |
| `npm run build:frontend` | Только фронт (React → backend/frontend-dist) |
| `npm run build:backend` | Только бэкенд (TypeScript → dist/) |
| `npm run electron:dev` | Сборка + запуск Electron окна |
| `npm run dist:win` | Упаковать в .exe (запускать на Windows) |
| `npm run dist:mac` | Упаковать в .dmg (запускать на macOS) |
| `npm run dist:linux` | Упаковать в .AppImage (запускать на Linux) |

---

### Возможные проблемы

**Окно не открывается / "Backend не запустился"**
- Проверь что бэкенд собран: `cd backend && npm run build`
- Проверь что порт 3000 свободен: `lsof -i :3000` (macOS) или `netstat -ano | findstr :3000` (Windows)

**Ошибка с COM-портом / serialport**
- На Windows может потребоваться установить драйвер USB→RS-485 адаптера
- Адаптеры на чипе CH340 — драйвер CH341SER
- Адаптеры на чипе FTDI — драйвер с сайта ftdichip.com
- Адаптеры на чипе Silicon Labs CP210x — драйвер CP210x от silabs.com

**На macOS нет доступа к COM-порту**
- Проверь что адаптер виден: `ls /dev/tty.*`
- Обычно называется `/dev/tty.usbserial-XXXX` или `/dev/tty.wchusbserial-XXXX`
