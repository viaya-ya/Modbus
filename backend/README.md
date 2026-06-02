# Modbus Backend

NestJS сервер для работы с частотными преобразователями через Modbus RTU / RS-485.

## Библиотеки

### `path` — встроенный модуль Node.js

Работа с путями файловой системы. Не импортируется из npm — входит в Node.js.

Главная задача — склеивать пути правильно на любой ОС. На Windows разделитель `\`, на macOS/Linux — `/`. Если писать пути руками через строки — код сломается на другой ОС.

```typescript
import * as path from 'path'

path.join('/projects', 'myProject', 'myProject.project.json')
// → '/projects/myProject/myProject.project.json'

path.basename('/projects/myProject/myProject.project.json')
// → 'myProject.project.json'

path.join(process.cwd(), '..', 'devices')
// → корректный путь к папке devices независимо от ОС
```

Используется везде где нужно собрать путь к файлу проекта, шаблона или изображения устройства.

---

### `fs` — встроенный модуль Node.js

Работа с файловой системой: чтение, запись, создание, удаление файлов и папок. Тоже встроен в Node.js, без npm.

```typescript
import * as fs from 'fs'

fs.readFileSync('/path/to/file.json', 'utf-8')   // прочитать файл
fs.writeFileSync('/path/to/file.json', data)      // записать файл
fs.mkdirSync('/path/to/dir', { recursive: true }) // создать папку
fs.existsSync('/path/to/file')                    // проверить существование
fs.rmSync('/path/to/dir', { recursive: true })    // удалить папку рекурсивно
fs.readdirSync('/path', { withFileTypes: true })  // список файлов в папке
```

Используется в `ProjectsService` и `DevicesService` для чтения JSON-конфигов и записи состояния проектов.

---

### `events` — встроенный модуль Node.js

Реализация паттерна «подписчик / издатель» (EventEmitter). Встроен в Node.js.

Позволяет одному модулю сообщать другому что что-то произошло — без прямой зависимости между ними.

```typescript
import { EventEmitter } from 'events'

const emitter = new EventEmitter()

// Подписчик (в другом модуле)
emitter.on('device:added', (device) => {
  server.emit('devices:updated', getAll())
})

// Издатель (здесь же)
emitter.emit('device:added', newDevice)
```

В проекте каждый сервис имеет `readonly events = new EventEmitter()`. Через него:
- `DevicesService` сообщает `ModbusGateway` об изменении устройств
- `ProjectsService` сообщает `ModbusGateway` о несоответствиях имён папок
- `ModbusService` сообщает `ModbusGateway` об обрыве соединения

---

### `chokidar` — слежение за файловой системой

Сторонняя библиотека. Решает проблему ненадёжности встроенного `fs.watch()` — тот по-разному работает на macOS, Windows и Linux, часто пропускает события.

Chokidar использует нативные API каждой ОС:
- macOS → FSEvents
- Linux → inotify
- Windows → ReadDirectoryChangesW

```typescript
const chokidar = await import('chokidar') // ESM-only, поэтому динамический import

const watcher = chokidar.watch('/path/to/folder', {
  depth: 1,                  // смотреть папку и один уровень вглубь
  ignoreInitial: true,       // не стрелять событиями по уже существующим файлам
  awaitWriteFinish: {        // ждать пока файл дописан до конца
    stabilityThreshold: 300,
    pollInterval: 100,
  },
})

watcher.on('add',       (path) => { /* новый файл */ })
watcher.on('change',    (path) => { /* файл изменён */ })
watcher.on('unlink',    (path) => { /* файл удалён */ })
watcher.on('addDir',    (path) => { /* новая папка */ })
watcher.on('unlinkDir', (path) => { /* папка удалена */ })
```

В проекте используется в двух местах:
- `DevicesService` — следит за `devices/templates/`, hot-reload шаблонов устройств
- `ProjectsService` — следит за `projects/`, обнаруживает ручные переименования папок

---

### `serialport` — работа с COM-портами

Сторонняя библиотека. Низкоуровневый доступ к последовательным портам (COM, USB-to-Serial).

Напрямую в коде почти не используется — только для получения списка доступных портов в системе:

```typescript
import { SerialPort } from 'serialport'

const ports = await SerialPort.list()
// [{ path: '/dev/tty.usbserial-0001', manufacturer: 'FTDI', vendorId: '0403', ... }]
```

По `vendorId` определяем USB→RS-485 адаптер (Silicon Labs = `10c4`, FTDI = `0403`, CH340 = `1a86`) — это функция автопоиска адаптера в `ModbusService.findAdapterPort()`.

Реальное открытие порта и передача данных идёт через `modbus-serial`, которая использует `serialport` внутри себя.

---

### `modbus-serial` — протокол Modbus RTU

Сторонняя библиотека. Реализует протокол Modbus RTU поверх последовательного порта: собирает байтовые пакеты, считает CRC, парсит ответы устройства.

```typescript
import ModbusRTU from 'modbus-serial'

const client = new ModbusRTU()

// Подключение к порту
await client.connectRTUBuffered('/dev/ttyUSB0', { baudRate: 9600 })

// Адресация устройства на шине
client.setID(1)           // Slave ID — кому адресован пакет

// Чтение (функция 03 — Read Holding Registers)
const data = await client.readHoldingRegisters(108, 1)
// data.data[0] → сырое целое число из регистра 108

// Запись (функция 06 — Write Single Register)
await client.writeRegister(108, 150)
```

Библиотека сама:
- собирает байты пакета по стандарту Modbus RTU
- считает CRC16
- ждёт ответа устройства (таймаут задаётся через `client.setTimeout`)
- парсит ответ и выбрасывает исключение при Modbus exception-коде

Всё что нужно — знать адрес регистра и значение. Всё остальное делает библиотека.

---

### `socket.io` — двусторонняя связь в реальном времени

Сторонняя библиотека. Реализует постоянное двустороннее соединение между сервером и браузером поверх WebSocket (с автоматическим fallback на long-polling если WebSocket недоступен).

В отличие от обычного HTTP (запрос → ответ), socket.io позволяет серверу самому инициировать отправку данных браузеру в любой момент.

```typescript
// Сервер (NestJS Gateway)
@WebSocketServer() server: Server

server.emit('monitor:data', { deviceId, data })  // шлёт всем клиентам
client.emit('modbus:error', { message })          // шлёт только одному клиенту

// Подписка на событие от браузера
@SubscribeMessage('monitor:start')
handleMonitorStart(@MessageBody() payload: { deviceId: string }) { ... }
```

```javascript
// Браузер (React)
import { io } from 'socket.io-client'
const socket = io('http://localhost:3000')

socket.emit('monitor:start', { deviceId: 'насос_1' })     // отправить на сервер
socket.on('monitor:data', (data) => { /* обновить UI */ }) // получить с сервера
```

В проекте через socket.io работают:
- монитор реального времени (`monitor:data` каждую секунду)
- статус подключения к порту (`modbus:status`)
- обновление списка устройств при изменении файлов (`devices:updated`)
- обнаружение несоответствий имён проектов (`project:folder:mismatch`)
- сканирование шины RS-485 с прогрессом (`bus:scan:progress`)

---

---

## Разбор файла `modbus.service.ts`

Этот сервис — единственная точка общения с железом. Всё что связано с COM-портом и Modbus-пакетами происходит здесь.

### Приватные поля класса

```typescript
private client = new ModbusRTU()
```
Объект библиотеки `modbus-serial`. Через него идут все команды: открыть порт, читать регистр, писать регистр. Один экземпляр на весь сервер — один физический COM-порт.

```typescript
private connected = false
```
Флаг нашего уровня — считаем ли мы себя подключёнными. Это не то же самое что `client.isOpen` (флаг библиотеки). Расхождение между ними — это и есть признак обрыва соединения.

```typescript
private options: ConnectOptions | null = null
```
Запоминает параметры последнего подключения (`portPath` и `baudRate`). Нужно для автопереподключения — когда watchdog обнаружит обрыв, gateway возьмёт эти параметры и попробует переподключиться.

```typescript
private intentionalDisconnect = false
```
Флаг «мы сами нажали Отключить». Без него watchdog не смог бы отличить намеренное отключение от обрыва кабеля — в обоих случаях `client.isOpen` становится `false`.

```typescript
private watchdogTimer: NodeJS.Timeout | null = null
```
Ссылка на таймер watchdog-а. Хранится чтобы можно было остановить его через `clearInterval` при отключении.

```typescript
private mutexTail: Promise<void> = Promise.resolve()
```
Хвост очереди мьютекса. Это ключевая переменная — объяснение ниже в разделе про `withLock`.

---

### `withLock` — мьютекс для шины RS-485

```typescript
private withLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = this.mutexTail.then(fn)
  this.mutexTail = result.then(() => {}, () => {})
  return result
}
```

**Зачем нужен мьютекс?**

На шине RS-485 одновременно может быть несколько устройств с разными `slaveId`. Перед каждой командой нужно вызвать `client.setID(slaveId)` — сказать библиотеке кому адресовать пакет. Проблема: если два HTTP-запроса придут одновременно (читаем насос_1 и насос_2), без блокировки возникает гонка:

```
Запрос А: setID(1)        ← адресуем насос_1
Запрос Б: setID(2)        ← перебивает! теперь адрес = насос_2
Запрос А: readRegisters() ← читаем, но пакет уйдёт насос_2 ← ОШИБКА
```

Пара `setID + read/write` должна быть атомарной — никакой другой запрос не должен вклиниться между ними.

**Как работает мьютекс через цепочку Promise:**

`mutexTail` — это всегда Promise последней поставленной в очередь операции.

```
Изначально:  mutexTail = Promise.resolve()  (уже выполнен)

Запрос А приходит:
  result_A = mutexTail.then(fn_A)   → fn_A запустится сразу (tail уже resolved)
  mutexTail = result_A              → теперь хвост = операция А

Запрос Б приходит пока А ещё работает:
  result_B = mutexTail.then(fn_B)   → fn_B запустится ПОСЛЕ result_A
  mutexTail = result_B              → теперь хвост = операция Б

Запрос В приходит:
  result_C = mutexTail.then(fn_C)   → fn_C запустится ПОСЛЕ result_B
  mutexTail = result_C
```

Получается очередь: А → Б → В. Каждая операция ждёт предыдущую. `setID + read` внутри одного `fn` никогда не будут прерваны.

---

### `connect` и `disconnect`

```typescript
async connect(opts: ConnectOptions): Promise<void> {
  if (this.connected) await this.disconnect()   // сначала закрываем если уже открыто
  this.intentionalDisconnect = false            // сбрасываем флаг намеренного отключения
  await this.client.connectRTUBuffered(opts.portPath, { baudRate, dataBits: 8, ... })
  this.client.setTimeout(2000)                  // таймаут ожидания ответа от ПЧ = 2 сек
  this.connected = true
  this.options = opts                           // запоминаем параметры для переподключения
  this.startWatchdog()
}
```

`connectRTUBuffered` — режим с буферизацией. В отличие от `connectRTU` он накапливает входящие байты и обрабатывает их порциями, что надёжнее на медленных скоростях (9600 бод).

`setTimeout(2000)` — если ПЧ не ответил за 2 секунды, библиотека выбросит исключение. Без этого запрос мог бы зависнуть навсегда.

```typescript
async disconnect(): Promise<void> {
  this.intentionalDisconnect = true   // говорим watchdog-у: это мы сами отключились
  this.stopWatchdog()
  await new Promise<void>(resolve => this.client.close(() => resolve()))
  this.connected = false
  this.options = null
}
```

`client.close` принимает callback — он вызывается когда порт физически закрыт. Оборачиваем в Promise чтобы можно было использовать `await`.

---

### Watchdog — сторожевой таймер

```typescript
private startWatchdog() {
  this.watchdogTimer = setInterval(() => {
    if (this.connected && !this.client.isOpen && !this.intentionalDisconnect) {
      this.connected = false
      this.stopWatchdog()
      this.events.emit('connection:lost')
    }
  }, 3000)
}
```

Каждые 3 секунды проверяет три условия одновременно:
- `this.connected` — мы считаем себя подключёнными?
- `!this.client.isOpen` — но библиотека говорит порт закрыт?
- `!this.intentionalDisconnect` — и это не мы сами нажали «Отключить»?

Если все три `true` — значит кабель выдернули или адаптер отвалился. Эмитим `connection:lost`.

Gateway слушает это событие и запускает попытки переподключения каждые 5 секунд.

---

### `readRegister` и `writeRegister`

```typescript
async readRegister(register: number, slaveId: number): Promise<number> {
  return this.withLock(async () => {
    this.client.setID(slaveId)
    const data = await this.client.readHoldingRegisters(register, 1)
    return data.data[0]
  })
}
```

`data` — объект ответа от библиотеки. Имеет структуру `{ data: number[], buffer: Buffer }`.
`data.data` — массив считанных регистров (мы всегда читаем 1 регистр, поэтому берём `[0]`).
`data.buffer` — сырые байты ответа (нам не нужен, используем только распарсенное значение).

```typescript
async writeRegister(register: number, rawValue: number, slaveId: number): Promise<void> {
  return this.withLock(async () => {
    this.client.setID(slaveId)
    await this.client.writeRegister(register, rawValue)
  })
}
```

`rawValue` — уже пересчитанное целое число. Деление на `scale` и округление делает контроллер до вызова этого метода.

---

### `listPorts` — список COM-портов

```typescript
async listPorts(): Promise<PortInfo[]> {
  const ports = await SerialPort.list()
  return ports.map(p => ({
    path:         p.path,
    manufacturer: p.manufacturer,
    serialNumber: p.serialNumber,
    vendorId:     p.vendorId,
    productId:    p.productId,
  }))
}
```

`SerialPort.list()` опрашивает ОС и возвращает все последовательные порты. Каждый порт — это объект с такими полями:

| Поле | Что это | Пример |
|------|---------|--------|
| `path` | Имя порта в системе | macOS: `/dev/tty.usbserial-0001`  Windows: `COM3` |
| `manufacturer` | Название производителя чипа | `Silicon Labs` |
| `serialNumber` | Серийный номер USB-устройства | `0001` |
| `vendorId` | VID — 4-значный hex-код производителя чипа, присвоен организацией USB-IF | `10c4` |
| `productId` | PID — 4-значный hex-код конкретной модели чипа | `ea60` |

`vendorId` и `productId` — это не произвольные числа, а официально зарегистрированные коды. Каждый производитель чипов платит взнос и получает свой уникальный VID. Поэтому по VID можно точно определить производителя.

---

### `findAdapterPort` — автоопределение USB→RS-485 адаптера

```typescript
const knownVids = [
  '10c4',  // Silicon Labs CP2102/CP2104  (Elhart EDC-A1-U1 использует именно этот)
  '0403',  // FTDI FT232
  '1a86',  // WCH CH340/CH341
  '067b',  // Prolific PL2303
  '04d8',  // Microchip MCP2200
]
const knownManufacturers = ['silicon', 'ftdi', 'wch', 'prolific', 'microchip']
```

Это списки известных USB→Serial чипов. Практически все USB→RS-485 адаптеры в мире используют один из этих пяти чипов. По VID однозначно определяем что это за чип.

Поиск идёт в три этапа по убыванию точности:

```
1. Ищем по vendorId (точно):
   ports.find(p => knownVids.includes(p.vendorId.toLowerCase()))
   → нашли 10c4 — это Silicon Labs, точно адаптер

2. Если не нашли — ищем по manufacturer (менее точно):
   ports.find(p => knownManufacturers.some(m => p.manufacturer.toLowerCase().includes(m)))
   → нашли "FTDI" в строке производителя

3. Если всё ещё не нашли — а порт в системе только один:
   if (!found && ports.length === 1) found = ports[0]
   → возможно это и есть наш адаптер, больше некому
```

**Почему `toLowerCase()`?** ОС возвращает vendorId по-разному: Windows даёт `10C4` (в верхнем регистре), macOS даёт `10c4` (в нижнем). `toLowerCase()` нормализует оба варианта.

**Почему `includes(m)`?** Строка manufacturer тоже не стандартизирована. Один драйвер пишет `"Silicon Labs"`, другой `"Silicon Laboratories"`, третий `"SiLabs"`. `includes('silicon')` поймает все варианты.

Результат функции — `{ portPath, baudRate }` — автоматически подставляется в форму подключения в UI.

---

### `scanBus` — сканирование шины RS-485

```typescript
async scanBus(from, to, onProgress, isCancelled): Promise<number[]> {
  for (let addr = from; addr <= to; addr++) {
    const responded = await this.withLock(async () => {
      this.client.setTimeout(150)    // короткий таймаут для сканирования
      this.client.setID(addr)
      await this.client.readHoldingRegisters(0, 1)
      return true                    // устройство ответило
    })
  }
}
```

Перебирает адреса от `from` до `to` (обычно 1–32 или 1–247). Для каждого адреса пытается прочитать регистр 0. Если устройство ответило — оно есть на шине.

`setTimeout(150)` вместо обычных 2000 мс — при сканировании не ждём долго. 150 мс достаточно: если устройство есть, оно ответит за миллисекунды. `finally { this.client.setTimeout(2000) }` возвращает нормальный таймаут после каждой попытки.

`onProgress(addr, found)` — колбэк который вызывается после каждого адреса. Gateway передаёт его в `scanBus` и через него шлёт прогресс в браузер через WebSocket (`bus:scan:progress`).

`isCancelled()` — колбэк который возвращает `true` если пользователь нажал «Отмена». Проверяется перед каждым адресом — цикл прерывается через `break`.

---

## Запуск

```bash
npm install
npm run start:dev
```

---

## Как устроен Modbus пакет (буфер байт)

При чтении регистра библиотека `modbus-serial` собирает массив байт и отправляет его в COM-порт побайтово.

Пример: читаем регистр 108 (параметр F1.08):

```
buffer[0] = 01        ← Slave ID (адрес устройства)
buffer[1] = 03        ← функция (03 = читать holding registers)
buffer[2] = 00        ← старший байт адреса регистра
buffer[3] = 6C        ← младший байт адреса регистра  (108 = 0x006C)
buffer[4] = 00        ← старший байт количества регистров
buffer[5] = 01        ← младший байт количества регистров (читаем 1)
buffer[6] = XX        ← CRC младший (считается автоматически)
buffer[7] = XX        ← CRC старший
```

Адрес регистра разбивается на два байта битовыми операциями:

```javascript
buffer[2] = register >> 8    // сдвиг вправо на 8 бит = старший байт
buffer[3] = register & 0xFF  // маска 0xFF = оставить только младший байт
```

Пример для register = 108:

```
108 в двоичном: [ 0000 0000 ] [ 0110 1100 ]
                  старший        младший

108 >> 8  = 0    → buffer[2] = 0x00
108 & 0xFF = 108 → buffer[3] = 0x6C
```

Пример для register = 1792 (параметры группы F7):

```
1792 в двоичном: [ 0000 0111 ] [ 0000 0000 ]

1792 >> 8  = 7   → buffer[2] = 0x07
1792 & 0xFF = 0  → buffer[3] = 0x00
```

Протокол Modbus всегда Big Endian — старший байт идёт первым.

---

## Адресация регистров EMD-PUMP

Адрес регистра = номер параметра в десятичном виде. Документация пишет адреса в hex (суффикс `h`), в JSON используем десятичные числа — библиотека сама переведёт в байты пакета.

```
F0.01 → регистр 1    → 001h
F1.08 → регистр 108  → 06Ch
F7.00 → регистр 1792 → 700h  (7×256 + 0)
```

---

## Как устроены конфиги устройств: шаблоны и экземпляры

Устройство в приложении существует в двух видах.

### Шаблон (template)

Полный JSON-файл с картой всех регистров. Лежит в `devices/templates/`. Описывает модель устройства целиком: все группы, все параметры, типы, масштабы, диапазоны. Шаблон один на всю модель.

```
devices/templates/elhart-emd-pump.json   ← шаблон модели ELHART EMD-PUMP
```

### Экземпляр (instance)

Маленький JSON-файл с минимальными данными: имя, какой шаблон использовать, и только те поля соединения которые отличаются от шаблона (как правило — только `slaveId`). Лежит в папке активного проекта.

```
projects/мой_проект/насос_1.json  ← экземпляр: slaveId=1
projects/мой_проект/насос_2.json  ← экземпляр: slaveId=2
```

Пример файла экземпляра:

```json
{
  "id": "насос_1",
  "name": "Насос 1",
  "templateId": "elhart-emd-pump",
  "connection": { "slaveId": 1 }
}
```

### Слияние (merge)

Когда приложение работает с экземпляром — оно сливает экземпляр с шаблоном:

```
DevicesService.merge(instance)
  ├── берёт шаблон по instance.templateId
  ├── заменяет id, name — из экземпляра
  ├── connection: { ...шаблон.connection, ...экземпляр.connection }
  │     (поля экземпляра перекрывают поля шаблона)
  └── возвращает полный DeviceConfig с groups, params и т.д.
```

Все параметры (группы, регистры, типы) берутся из шаблона. Экземпляр хранит только имя и slaveId.

---

## Полная цепочка чтения параметра

Пример: нажали кнопку "Прочитать" у параметра `F1.08` устройства `насос_1`.

### Шаг 1 — Браузер отправляет HTTP-запрос

```
POST http://localhost:5173/api/modbus/read
Body: { "deviceId": "насос_1", "paramId": "F1.08" }
```

### Шаг 2 — Vite Proxy перенаправляет

Vite сервер разработки работает на порту 5173. Он настроен как прокси:

```
/api/* → http://localhost:3000/*
```

Запрос попадает в NestJS на порт 3000:

```
POST http://localhost:3000/modbus/read
```

### Шаг 3 — ModbusController принимает запрос

Файл: `src/modbus/modbus.controller.ts`

```typescript
@Post('read')
async read(@Body() body: { deviceId: string; paramId: string }) {
```

Контроллер выполняет три проверки по порядку:

1. **Подключены ли мы к порту?**
   `modbusService.isConnected()` — если нет, сразу 400 Bad Request.

2. **Существует ли устройство?**
   `devicesService.getById("насос_1")` — ищет экземпляр, сливает с шаблоном. Если нет — 404.

3. **Существует ли параметр?**
   `devicesService.findParam("насос_1", "F1.08")` — перебирает все группы устройства, ищет параметр по id. Если нет — 404.

После проверок контроллер знает: `param.register = 108`, `param.scale = 0.1`.

Берёт Slave ID из конфига устройства: `device.connection.slaveId` (например, `1`).

### Шаг 4 — ModbusService читает регистр

Файл: `src/modbus/modbus.service.ts`

```typescript
async readRegister(register: number, slaveId: number): Promise<number> {
  return this.withLock(async () => {
    this.client.setID(slaveId);
    const data = await this.client.readHoldingRegisters(register, 1);
    return data.data[0];
  });
}
```

**Что делает `withLock`?**

На шине RS-485 может быть несколько устройств с разными `slaveId`. Если два HTTP-запроса придут одновременно (насос_1 и насос_2), без блокировки произойдёт гонка:

```
Запрос А: setID(1)
Запрос Б: setID(2)   ← перебивает!
Запрос А: readHoldingRegisters(108) ← но ID уже 2, читаем не то устройство!
```

`withLock` строит очередь через цепочку Promise:

```
withLock(А) → выполняется сразу
withLock(Б) → ждёт пока А не завершится → тогда выполняется
```

Операция `setID + read` всегда атомарная — никакой другой запрос не вклинится между ними.

**Что делает `setID`?**

Говорит библиотеке: следующий пакет адресовать устройству с этим Slave ID. Значение попадёт в `buffer[0]` Modbus-пакета.

**Что делает `readHoldingRegisters(108, 1)`?**

Параметр `1` — количество регистров для чтения. Мы всегда читаем по одному регистру.

Библиотека собирает пакет (8 байт), отправляет в COM-порт, ждёт ответа (таймаут 2000 мс), парсит ответ.

Ответ устройства: `data.data[0]` — это сырое целое число, например `150`.

### Шаг 5 — Контроллер масштабирует и возвращает ответ

```typescript
const rawValue = 150;
const scale    = 0.1;
return {
  paramId:  "F1.08",
  rawValue: 150,
  value:    150 * 0.1,   // = 15.0
  unit:     "с",
};
```

Ответ уходит обратно через Vite Proxy в браузер: `HTTP 200 { value: 15, unit: "с" }`.

### Что происходит при ошибке

Если устройство не ответило или вернуло Modbus exception — библиотека бросает исключение. Контроллер ловит его в `wrapModbusError`:

```typescript
private wrapModbusError(e: any, paramId: string, register: number) {
  const code = e?.modbusCode;
  const descriptions = {
    1: 'недопустимая функция',
    2: 'регистр не поддерживается устройством',
    3: 'недопустимое значение данных',
    4: 'ошибка устройства',
  };
  // Возвращает HTTP 422 с понятным описанием
}
```

Браузер получает `HTTP 422` с текстом: `"F1.08 (рег. 108): Modbus exception 2: регистр не поддерживается устройством"`.

---

## Полная цепочка записи параметра

Пример: вводим 15 секунд в поле F1.08 и нажимаем "Записать".

### Шаг 1 — Браузер

```
POST /api/modbus/write
Body: { "deviceId": "насос_1", "paramId": "F1.08", "value": 15 }
```

### Шаг 2 — ModbusController

Те же три проверки (подключение, устройство, параметр), плюс:

```typescript
if (param.access !== 'read-write')
  throw new BadRequestException('Param is read-only');
```

Параметры с `"access": "read"` защищены — записать в них нельзя, даже если знаешь адрес регистра.

Преобразование значения:

```typescript
const scale    = param.scale ?? 1;    // = 0.1
const rawValue = Math.round(15 / 0.1) // = 150
```

Устройство работает только с целыми числами. Дробь `15.0` делится на масштаб `0.1` и округляется до `150`.

### Шаг 3 — ModbusService пишет регистр

```typescript
async writeRegister(register: number, rawValue: number, slaveId: number): Promise<void> {
  return this.withLock(async () => {
    this.client.setID(slaveId);
    await this.client.writeRegister(register, rawValue);
  });
}
```

Та же блокировка `withLock` — атомарная пара `setID + write`.

`writeRegister(108, 150)` собирает пакет с функцией 06 (Write Single Register):

```
01   06   00 6C   00 96   XX XX
│    │    │        │       └── CRC
│    │    │        └────────── значение: 150 = 0x0096
│    │    └─────────────────── регистр: 108 = 0x006C
│    └──────────────────────── функция 06 = записать
└───────────────────────────── Slave ID = 1
```

Устройство записывает значение и отвечает эхом того же пакета — это подтверждение успеха.

### Шаг 4 — Ответ

```
HTTP 200 { "success": true }
```

---

## Мониторинг в реальном времени

Монитор работает иначе — не через HTTP, а через WebSocket.

### Как запускается

1. Браузер открывает WebSocket-соединение с сервером (через `socket.io`).
2. Пользователь нажимает "Запустить мониторинг" — браузер отправляет событие:
   ```
   socket.emit('monitor:start', { deviceId: 'насос_1', paramIds: ['F0.01', 'F0.02', ...] })
   ```
3. Gateway на сервере запускает `setInterval` каждые 1000 мс.

### Что происходит каждую секунду

Файл: `src/gateway/modbus.gateway.ts`, метод `startMonitor`.

```
setInterval каждые 1000 мс:
  ├── для каждого параметра:
  │     ├── modbusService.readRegister(param.register, slaveId)
  │     │     └── withLock → setID → readHoldingRegisters → rawValue
  │     ├── value = rawValue × scale
  │     └── data[param.id] = { value, rawValue, unit }
  └── server.emit('monitor:data', { deviceId, data })
         └── уходит всем подключённым браузерам
```

Браузер получает `monitor:data` и обновляет карточки со значениями.

### Почему monitor:data идёт всем, а не только тому кто запустил

`this.server.emit(...)` рассылает событие всем подключённым клиентам. Если два браузера открыли одно устройство — оба получат данные. Один запустил мониторинг — второй тоже видит обновления.

### Остановка

При `monitor:stop` или при разрыве соединения вызывается `stopMonitor()` — просто `clearInterval`.

---

## Watchdog — защита от обрыва соединения

После подключения к порту каждые 3 секунды запускается проверка:

```typescript
this.watchdogTimer = setInterval(() => {
  if (this.connected && !this.client.isOpen && !this.intentionalDisconnect) {
    this.connected = false;
    this.stopWatchdog();
    this.events.emit('connection:lost');
  }
}, 3000);
```

`client.isOpen` — флаг самой библиотеки: порт физически открыт? Если USB-адаптер вытащили — флаг станет `false`.

Gateway слушает `connection:lost` и запускает автопереподключение каждые 5 секунд:

```
connection:lost
  → stopMonitor()
  → server.emit('modbus:status', { connected: false, reconnecting: true })
  → setInterval каждые 5 сек: пробуем modbusService.connect(lastOptions)
  → если успешно: stopReconnect() + emit('modbus:status', { connected: true })
```

---

## Хранение настроек интерфейса

Настройки (порядок карточек, ширина колонок, видимые параметры) сохраняются в `settings.json` через NestJS, а не в localStorage браузера.

### Ключ настроек — templateId, не id устройства

Два экземпляра одного шаблона (`насос_1` и `насос_2`) имеют один и тот же `templateId`. Настройки хранятся по `templateId`:

```json
{
  "deviceSettings": {
    "elhart-emd-pump": {
      "monitorOrder": ["F0.01", "F0.03", "F0.02"],
      "monitorVisible": ["F0.01", "F0.02"],
      "groupOrder": ["F1", "F0", "F2"],
      "paramColWidths": { "id": 90, "desc": 250, "def": 120, "cur": 150, "write": 290 }
    }
  }
}
```

Настроил порядок колонок для `насос_1` — `насос_2` увидит те же настройки, потому что они одной модели.

### Как работает `PATCH /settings/device/:deviceId`

```typescript
updateDeviceSettings(deviceId: string, patch: Partial<DeviceUISettings>) {
  const current = this.load();   // читает актуальный файл с диска
  const updated = {
    ...current,
    deviceSettings: {
      ...current.deviceSettings,
      [deviceId]: { ...current.deviceSettings?.[deviceId], ...patch },
    },
  };
  this.settings = updated;
  fs.writeFileSync(this.filePath, JSON.stringify(updated, null, 2));
  return updated;
}
```

Каждый вызов читает файл с диска перед записью — это защита от потери данных если файл был изменён вручную.

---

## Слежение за файлами (hot-reload)

### Шаблоны

`chokidar` следит за папкой `devices/templates/`. При изменении файла:

```
add / change → loadTemplateFile(path) → templates.set(id, config)
             → events.emit('device:added' / 'device:changed', config)

unlink       → templates.delete(id)
             → events.emit('device:removed', id)
```

### Экземпляры активного проекта

`chokidar` следит за папкой активного проекта. Логика та же, но после загрузки файла — сразу вызывается `merge(instance)` чтобы получить полный конфиг.

### Gateway реагирует на события

```typescript
devicesService.events.on('device:added',   () => server.emit('devices:updated', getAll()))
devicesService.events.on('device:changed', () => server.emit('devices:updated', getAll()))
devicesService.events.on('device:removed', () => server.emit('devices:updated', getAll()))
```

Браузер получает `devices:updated` и перерисовывает список устройств без перезагрузки страницы.

---

## Схема модулей

```
AppModule
  ├── SettingsModule
  │     ├── SettingsService   — чтение/запись settings.json
  │     └── SettingsController — GET /settings, PATCH /settings, PATCH /settings/device/:id
  │
  ├── ProjectsModule
  │     ├── ProjectsService   — управление папками проектов, активный проект
  │     └── ProjectsController — GET/POST/DELETE /projects, POST /projects/active
  │
  ├── DevicesModule
  │     ├── DevicesService    — шаблоны + экземпляры + merge, chokidar-слежка
  │     └── DevicesController — GET /devices, GET /devices/:id, POST /devices, и т.д.
  │
  ├── ModbusModule
  │     ├── ModbusService     — connect/disconnect, readRegister, writeRegister, mutex
  │     └── ModbusController  — POST /modbus/read, POST /modbus/write, и т.д.
  │
  └── GatewayModule
        └── ModbusGateway     — WebSocket: monitor:start/stop, connect:port, bus:scan:start
```
