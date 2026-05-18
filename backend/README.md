# Modbus Backend

NestJS сервер для работы с частотными преобразователями через Modbus RTU / RS-485.

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
