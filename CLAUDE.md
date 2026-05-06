# Modbus Converter — Контекст проекта

## Что это за проект
Программа для управления частотными преобразователями (ПЧ) через протокол Modbus RTU / RS-485.
Аналог EXOdesigner — файловая конфигурация устройств (добавил JSON файл = новое устройство в UI).
Архитектура: локальный сервер + браузер (как Node-RED). Интернет не нужен, всё работает локально.

## Стек
- **Backend:** Node.js + NestJS (TypeScript), порт 3000
- **Frontend:** React + Vite (JavaScript), порт 5173
- **Протокол:** Modbus RTU через RS-485 (USB→RS-485 адаптер)

## Библиотеки backend
- `modbus-serial` — общение с ПЧ через RS-485
- `chokidar` — слежение за папкой /devices/ (hot-reload конфигов)
- `@nestjs/websockets` + `socket.io` — реалтайм обновления на фронт
- `class-validator` + `class-transformer` — валидация данных

## Библиотеки frontend
- `socket.io-client` — реалтайм данные с ПЧ
- `axios` — HTTP запросы к NestJS
- `antd` — UI компоненты (Ant Design)
- НЕ используем RTK Query — только useState/useEffect + socket.io

## Структура проекта
```
Modbus/
  backend/        ← NestJS сервер
    src/
      devices/    ← модуль работы с JSON конфигами
      modbus/     ← модуль Modbus RTU драйвера
      gateway/    ← WebSocket gateway
  frontend/       ← React + Vite
    src/
  devices/        ← JSON файлы драйверов устройств (конфиги ПЧ)
    elhart-emd-pump.json
```

## Концепция — "Файл = Драйвер устройства"
Папка /devices/ содержит JSON файлы. Каждый файл описывает одно устройство.
- Добавил JSON файл → устройство появилось в приложении (без перезапуска)
- Удалил файл → устройство исчезло
- Изменил файл → UI обновился автоматически
- chokidar следит за папкой и шлёт обновления через WebSocket

## Несколько устройств на одной шине RS-485
- RS-485 — многоточечная шина: один COM-порт, до 247 устройств
- Каждое устройство имеет уникальный `slaveId` (адрес 1–247) в своём JSON-файле
- Подключение в UI: только порт + скорость (без Slave ID) — одно соединение на всю шину
- Перед каждым чтением/записью сервис вызывает `client.setID(slaveId)` из конфига устройства
- Мьютекс в `ModbusService.withLock()` гарантирует: `setID + read/write` — атомарная операция
  (без него параллельные HTTP-запросы могли бы поменять slaveId между `setID` и реальной командой)
- Добавить новое устройство на шину = создать новый JSON файл с уникальным `slaveId`

## Структура JSON файла устройства
```json
{
  "id": "elhart-emd-pump",
  "name": "ELHART EMD-PUMP",
  "connection": {
    "slaveId": 1,
    "baudRate": 9600,
    "dataBits": 8,
    "stopBits": 1,
    "parity": "none",
    "protocol": "modbus-rtu"
  },
  "groups": [
    {
      "id": "F0",
      "name": "Информационные параметры",
      "params": [
        {
          "id": "F000",
          "name": "Выходная частота",
          "register": 0,
          "access": "read",
          "type": "float",
          "scale": 0.01,
          "unit": "Гц",
          "min": 0,
          "max": 400
        }
      ]
    }
  ]
}
```

## Устройства которые поддерживаем
### ELHART EMD-PUMP (основное)
- Назначение: ПЧ для управления насосами
- Протокол: Modbus RTU, RS-485, макс 38400 бод
- Адресация: номер параметра = адрес регистра (F000 = регистр 0, F100 = регистр 256)
- Группы параметров:
    - F0 — Информационные (только чтение): частота, ток, напряжение, температура, код ошибки
    - F1 — Базовые параметры управления: источник команд, источник частоты, макс/мин частота, время разгона/торможения
    - F2 — Параметры двигателя: мощность, напряжение, ток, частота, скорость
    - F3 — Конфигурация входов/выходов
    - F4 — Дополнительные параметры двигателя
    - F5 — Режим программного управления
    - F6 — ПИД-регулятор и каскадный режим: уставка давления, P/I/D коэффициенты
    - F7 — Параметры RS-485: адрес устройства (1-247), скорость (9600 по умолч), формат данных
    - F8 — Расширенные настройки
- Типы параметров: float (с масштабом scale), int, enum (список значений)
- Доступ: read (только чтение), read-write (чтение и запись)

## Как работает Modbus RTU
- Компьютер = Master (ведущий), ПЧ = Slave (ведомый)
- Запрос: [адрес устройства][функция][адрес регистра][кол-во регистров][CRC]
- Функция 03 = чтение регистров, функция 06 = запись одного регистра
- Адрес устройства по умолчанию = 1
- Значения хранятся как целые числа, масштабируются через поле scale
- Пример: регистр вернул 5000, scale=0.01 → 50.00 Гц

## Что уже сделано
- [x] Создан NestJS backend (`backend/`)
- [x] Создан React+Vite frontend (`frontend/`)
- [x] Установлены все библиотеки
- [x] Создана папка `devices/`
- [x] Создан `devices/elhart-emd-pump.json` с полной картой регистров

## Что нужно сделать (MVP)
- [ ] DevicesModule — читает JSON из /devices/, следит за изменениями через chokidar
- [ ] ModbusModule — подключается к ПЧ, читает/пишет регистры
- [ ] WebSocket Gateway — шлёт данные в реалтайм на фронт
- [ ] REST API — список устройств, чтение/запись параметров
- [ ] React: список устройств из JSON
- [ ] React: дерево параметров (группы → параметры)
- [ ] React: форма чтения/записи параметров
- [ ] React: монитор реального времени (частота, ток, давление)

## Важные решения
- Конфиги устройств в JSON (не YAML, не БД)
- WebSocket для реалтайм данных, REST для команд
- Без Redux/RTK Query — только useState + socket.io
- Ant Design для UI компонентов
- Без Electron на первом этапе — локальный сервер + браузер

---

## Функции Modbus и структура пакета

### Функция 06 — откуда берётся

Функция — это стандартный номер операции в протоколе Modbus. Придуманы раз и навсегда в 1979 году, все устройства в мире их понимают одинаково.

```
Код    Название                    Что делает
─────────────────────────────────────────────────────
03     Read Holding Registers      Прочитать регистры
06     Write Single Register       Записать один регистр
16     Write Multiple Registers    Записать несколько регистров сразу
01     Read Coils                  Читать биты (вкл/выкл)
05     Write Single Coil           Записать один бит
```

Используются только **03** и **06** — этого достаточно для EMD-PUMP.

В `modbus.service.ts` библиотека подставляет код сама:
```typescript
client.readHoldingRegisters(register, 1)  // → функция 03 в байте №2
client.writeRegister(register, rawValue)  // → функция 06 в байте №2
```

### Разбор каждого байта пакета

Пример: запись значения 1 (Пуск) в регистр 8192 (CMD):
```
01   06   20 00   00 01   43 CA
│    │    │        │       │
│    │    │        │       └── CRC (2 байта, контрольная сумма)
│    │    │        └────────── значение: 0x0001 = 1
│    │    └─────────────────── адрес регистра: 0x2000 = 8192
│    └──────────────────────── функция 06 = записать регистр
└───────────────────────────── Slave ID = 1 (адрес устройства)
```

**Байт 1 — Slave ID:** кому адресован пакет. Остальные устройства на шине молчат.

**Байт 2 — Функция:** что нужно сделать (03=читать, 06=писать).

**Байты 3-4 — Адрес регистра:** два байта, Big Endian. `0x2000` = 8192.

**Байты 5-6 — Значение:** всегда целое число 0–65535 (uint16). Дробей нет — ПЧ хранит целые, масштаб применяется через поле `scale`:
```
Стоп              value=0   → 00 00
Пуск              value=1   → 00 01
Частота 50 Гц     50/0.01=5000  → 13 88
Время разгона 15с 15/0.1=150   → 00 96
```

**Байты 7-8 — CRC16:** контрольная сумма всех предыдущих байт. ПЧ пересчитывает и сравнивает — если не совпало, пакет игнорируется. `modbus-serial` считает автоматически.

ПЧ отвечает эхом того же пакета = "принял, выполнил". При ошибке шлёт пакет с кодом причины.

---

## Полная цепочка записи — от клика до ПЧ

Пример: записываем время разгона F1.08 = 15 секунд.

### Шаг 1 — Браузер (React, ParamRow.jsx)
```javascript
api.post('/modbus/write', {
  deviceId: 'elhart-emd-pump',
  paramId:  'F1.08',
  value:    15
})
// HTTP POST → http://localhost:5173/api/modbus/write
```

### Шаг 2 — Vite Proxy
```
/api/modbus/write → перенаправляет на → http://localhost:3000/modbus/write
```

### Шаг 3 — NestJS Controller (modbus.controller.ts)
```typescript
// 1. Находит параметр в JSON-конфиге
param = findParam('elhart-emd-pump', 'F1.08')
// → { register: 108, scale: 0.1, access: 'read-write' }

// 2. Проверяет что access = 'read-write' (не read-only)

// 3. Переводит значение пользователя в сырое число
rawValue = Math.round(15 / 0.1) = 150

// 4. Передаёт в сервис
modbusService.writeRegister(108, 150)
```

### Шаг 4 — NestJS Service → modbus-serial
```typescript
client.writeRegister(108, 150)
// Библиотека собирает байты:
// 01  06  00 6C  00 96  XX XX
//         ^108   ^150   ^CRC
```

### Шаг 5 — Физическая передача
```
Байты → COM-порт → USB → EDC-A1-U1 → RS-485 провода A/B → ПЧ
```

### Шаг 6 — ПЧ принимает
```
Проверяет: Slave ID=01 (мне), функция=06 (писать),
регистр=108 (F1.08 "Время разгона"), CRC=ОК
Записывает: 150 × scale(0.1) = 15.0 секунд
Отвечает эхом: 01 06 00 6C 00 96 XX XX
```

### Шаг 7 — Ответ обратно в браузер
```
ПЧ → RS-485 → EDC-A1-U1 → USB → modbus-serial → NestJS
→ HTTP 200 { success: true } → axios → message.success('Записано')
```

### Вся цепочка одной схемой
```
[Браузер]              [NestJS]                  [Железо]

Ввёл 15 сек
  ↓
POST /modbus/write
  { value: 15 }
        ↓
   findParam()  →  register=108, scale=0.1
   rawValue = 15/0.1 = 150
        ↓
   writeRegister(108, 150)
        ↓
   modbus-serial → байты:
   01 06 00 6C 00 96 XX XX
        ↓
   COM-порт → USB
                           ↓
                    EDC-A1-U1
                    USB → RS-485
                           ↓
                    ПЧ: F1.08 = 15 сек ✓
                    отвечает эхом
        ↓
  { success: true }
        ↓
message.success ✓
```

---

## Детальная структура Backend (`backend/src/`)

### `devices/` — работа с JSON-конфигами устройств

**`device.types.ts`** — TypeScript-интерфейсы (только типы, без логики):
- `DeviceParam` — один параметр (id, name, register, access, type, scale, unit, min, max, options)
- `ParamGroup` — группа параметров (id, name, params[])
- `DeviceConfig` — полный конфиг устройства (id, name, connection, groups[])

**`devices.service.ts`** — вся логика работы с файлами:
- `onModuleInit()` — при старте читает все JSON из `/devices/` и запускает chokidar-слежку
- `loadAll()` — читает все `.json` файлы из папки и кладёт в `Map<id, DeviceConfig>`
- `loadFile(filePath)` — читает один JSON файл, парсит, добавляет в Map
- `startWatcher()` — запускает chokidar (ESM-only, поэтому `await import('chokidar')`); на события `add/change/unlink` перечитывает файл и эмитит `device:added / device:changed / device:removed`
- `getAll()` — возвращает массив всех загруженных устройств
- `getById(id)` — возвращает одно устройство по id
- `findParam(deviceId, paramId)` — ищет параметр по id устройства и id параметра (нужно для чтения/записи регистра)

**`devices.controller.ts`** — REST-эндпоинты:
- `GET /devices` → список всех устройств
- `GET /devices/:id` → одно устройство по id

---

### `modbus/` — драйвер Modbus RTU

**`modbus.service.ts`** — вся работа с железом:
- `connect(opts)` — открывает COM-порт через `connectRTUBuffered`, устанавливает slaveId и таймаут 2000 мс
- `disconnect()` — закрывает порт, сбрасывает флаг connected
- `isConnected()` — возвращает boolean, подключены ли сейчас
- `getStatus()` — возвращает `{ connected, options }` — текущее состояние подключения
- `readRegister(register)` — читает один Holding Register (функция 03), возвращает сырое int-значение
- `writeRegister(register, rawValue)` — пишет один регистр (функция 06), принимает сырое значение (уже делённое на scale)
- `listPorts()` — возвращает список всех COM-портов системы через `SerialPort.list()` (path, manufacturer, vendorId и др.)
- `findAdapterPort(opts)` — ищет USB→RS-485 адаптер: сначала по VID (10c4=Silicon Labs, 0403=FTDI, 1a86=CH340, 067b=Prolific), потом по имени производителя, потом если порт один — берёт его; возвращает `{ portPath, baudRate, slaveId }` для автозаполнения формы

**`modbus.controller.ts`** — REST-эндпоинты:
- `GET /modbus/status` → текущий статус подключения
- `GET /modbus/ports` → список COM-портов системы
- `POST /modbus/scan` → автопоиск USB→RS-485 адаптера по VID/производителю
- `POST /modbus/connect` → подключиться к порту `{ portPath, baudRate, slaveId }`
- `POST /modbus/disconnect` → отключиться
- `POST /modbus/read` → прочитать параметр `{ deviceId, paramId }` → возвращает `{ rawValue, value, unit }` (value = rawValue × scale)
- `POST /modbus/write` → записать параметр `{ deviceId, paramId, value }` (rawValue = round(value / scale))

---

### `gateway/` — WebSocket (socket.io)

**`modbus.gateway.ts`** — реалтайм-общение с браузером:
- `handleConnection(client)` — при подключении нового браузера сразу шлёт ему `devices:list` и `modbus:status`
- `onModuleInit()` — подписывается на события DevicesService; при изменении файлов в `/devices/` шлёт всем клиентам `devices:updated`
- `connect:port` (входящее) → вызывает `modbusService.connect()`, шлёт всем `modbus:status`; при ошибке шлёт клиенту `modbus:error`
- `disconnect:port` (входящее) → останавливает монитор, вызывает `modbusService.disconnect()`, шлёт всем `modbus:status`
- `monitor:start { deviceId }` (входящее) → запускает `setInterval` каждые 1000 мс: читает все параметры группы F0 и шлёт всем `monitor:data { deviceId, data }`
- `monitor:stop` (входящее) → останавливает интервал
- `startMonitor()` — внутренний метод: берёт группу F0 устройства, в цикле читает каждый регистр, формирует объект с `value / rawValue / unit / error`
- `stopMonitor()` — очищает интервал

---

## Детальная структура Frontend (`frontend/src/`)

### Точки входа

**`main.jsx`** — монтирует `<App />` в DOM

**`socket.js`** — создаёт единственный экземпляр socket.io клиента подключённого к `http://localhost:3000`; импортируется в любой компонент которому нужен WebSocket

**`api.js`** — создаёт axios instance с `baseURL: '/api'`; Vite-proxy перенаправляет `/api/*` → `http://localhost:3000/*`

**`App.jsx`** — корневой компонент:
- Держит состояние: `devices[]`, `selectedDevice`, `connected`
- Слушает socket-события: `devices:list`, `devices:updated`, `modbus:status`
- Рендерит Layout: Header → `ConnectionPanel`, Sider → `DeviceList`, Content → `DeviceDetail` или `Empty`

---

### `components/`

**`ConnectionPanel.jsx`** — панель подключения в шапке:
- `fetchPorts()` — GET `/modbus/ports`, заполняет выпадающий список портов
- `handleOpen()` — открывает модальное окно и сразу вызывает `fetchPorts()`
- `handleScan()` — POST `/modbus/scan`, автоматически заполняет поле порта найденным адаптером
- `handleConnect(values)` — эмитит socket-событие `connect:port { portPath, baudRate, slaveId }`
- `handleDisconnect()` — эмитит socket-событие `disconnect:port`
- Поле порта — `AutoComplete` (можно выбрать из списка или ввести вручную)

**`DeviceList.jsx`** — список устройств в левой панели:
- Получает пропсы: `devices`, `selectedId`, `onSelect`, `connected`
- Иконка меняется: `LinkOutlined` зелёная = подключено, `DisconnectOutlined` красная = не подключено
- `Badge dot` — цветная точка-статус поверх иконки

**`DeviceDetail.jsx`** — содержимое правой панели при выбранном устройстве:
- Показывает название и описание устройства
- Рендерит `Tabs`: вкладка "Параметры" → `ParamGroups`, вкладка "Монитор" → `Monitor`

**`ParamGroups.jsx`** — дерево групп параметров:
- Разворачивает группы устройства в `Collapse` (аккордеон)
- Для каждого параметра группы рендерит `ParamRow`

**`ParamRow.jsx`** — одна строка параметра:
- `handleRead()` — POST `/modbus/read { deviceId, paramId }`, показывает полученное значение
- `handleWrite()` — POST `/modbus/write { deviceId, paramId, value }`, записывает введённое значение
- `formatDisplay()` — форматирует значение: для enum ищет label по value, для float добавляет 2 знака, для int — целое; показывает единицу измерения
- Для `read-write` параметров: enum → `Select`, число → `InputNumber` с шагом scale

**`Monitor.jsx`** — вкладка реального времени:
- `toggle()` — старт: эмитит `monitor:start { deviceId }`; стоп: эмитит `monitor:stop`
- Слушает `monitor:data` — обновляет карточки значений
- Слушает `modbus:error` — показывает Alert с ошибкой
- Отображает параметры группы F0 как карточки `Statistic` (обновляются каждую секунду)
- При смене устройства автоматически останавливает мониторинг предыдущего