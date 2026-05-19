import { useState, useEffect, useRef } from 'react'
import { Button, InputNumber, Select, Typography, Spin, message, Space, Tag, Tooltip } from 'antd'
import api from '../api'
import { addLog } from '../log'

function bitsToInt(bits, bitState) {
  return bits.reduce((acc, b) => acc | ((bitState[b.bit] ?? 0) << b.bit), 0)
}

function intToBitState(bits, raw) {
  const state = {}
  bits.forEach(b => { state[b.bit] = (Math.round(raw) >> b.bit) & 1 })
  return state
}

function normalizeOptions(options) {
  if (!options) return []
  if (Array.isArray(options)) return options
  return Object.entries(options).map(([k, v]) => ({ value: Number(k), label: v }))
}

function formatValue(type, val, unit, options) {
  if (val === null || val === undefined) return '—'
  if (type === 'enum') {
    const opts = normalizeOptions(options)
    const opt = opts.find(o => o.value === Math.round(val))
    return opt ? opt.label : String(val)
  }
  if (type === 'float') return `${Number(val).toFixed(2)}${unit ? ' ' + unit : ''}`
  return `${val}${unit ? ' ' + unit : ''}`
}

const DEFAULT_COLS = { id: 90, desc: 220, def: 120, cur: 150, write: 290 }

export default function ParamRow({ device, param, modbusConnected, injectedValue, cols, onWrite, onClearGroupValue, pendingWriteValue, onPendingWriteChange, fillStamp }) {
  const [value, setValue]         = useState(null)
  const [bitState, setBitState]   = useState({})
  const [editValue, setEditValue] = useState(null)
  const appliedStamp = useRef(0)

  useEffect(() => {
    if (!fillStamp || fillStamp === appliedStamp.current || pendingWriteValue == null) return
    appliedStamp.current = fillStamp
    setEditValue(pendingWriteValue)
    if (param.type === 'bitmask' && param.bits) {
      setBitState(intToBitState(param.bits, pendingWriteValue))
    }
  }, [fillStamp])
  const [reading, setReading]   = useState(false)
  const [writing, setWriting]   = useState(false)

  const C = cols ?? DEFAULT_COLS

  // Sync bitmask controls when group-read updates the value
  useEffect(() => {
    if (injectedValue !== undefined && param.type === 'bitmask' && param.bits) {
      setBitState(intToBitState(param.bits, injectedValue))
      setEditValue(injectedValue)
      setValue(injectedValue)
    }
  }, [injectedValue])

  async function handleRead() {
    setReading(true)
    try {
      const res = await api.post('/modbus/read', { deviceId: device.id, paramId: param.id })
      onClearGroupValue?.(param.id)
      setValue(res.data.value)
      if (param.type === 'bitmask' && param.bits) {
        setBitState(intToBitState(param.bits, res.data.value))
        setEditValue(res.data.value)
      }
      addLog('success', `Прочитано ${param.id} (${param.name}): ${res.data.value} ${param.unit ?? ''}`)
    } catch (e) {
      const msg = e.response?.data?.message ?? 'Ошибка чтения'
      message.error(msg)
      addLog('error', `Ошибка чтения ${param.id}: ${msg}`)
    } finally {
      setReading(false)
    }
  }

  async function handleWrite() {
    if (editValue === null || editValue === undefined) return
    setWriting(true)
    try {
      if (onWrite) {
        await onWrite(param.id, editValue)
      } else {
        await api.post('/modbus/write', { deviceId: device.id, paramId: param.id, value: editValue })
        onClearGroupValue?.(param.id)
        setValue(editValue)
        message.success('Записано успешно')
        addLog('success', `Записано ${param.id} (${param.name}): ${editValue} ${param.unit ?? ''}`)
      }
    } catch (e) {
      const msg = e.response?.data?.message ?? 'Ошибка записи'
      message.error(msg)
      addLog('error', `Ошибка записи ${param.id}: ${msg}`)
    } finally {
      setWriting(false)
    }
  }

  const isBitmask = param.type === 'bitmask' && param.bits

  function renderBitTags(raw) {
    return param.bits.map(b => {
      const bitVal = (Math.round(raw) >> b.bit) & 1
      const label  = b.values?.[String(bitVal)] ?? String(bitVal)
      const active = bitVal === 1
      return (
        <Tag key={b.bit} color={active ? 'success' : 'default'} style={{ margin: '2px', fontSize: 11 }}>
          <span style={{ opacity: active ? 1 : 0.5 }}>{b.name}</span>
          <span style={{ marginLeft: 4, fontWeight: 600, color: active ? undefined : '#aaa' }}>
            {active ? '●' : '○'} {label}
          </span>
        </Tag>
      )
    })
  }

  const defaultFormatted = formatValue(param.type, param.default, param.unit, param.options)
  // injectedValue (from group read) takes priority; cleared on individual read/write so value wins
  const displayValue = injectedValue !== undefined ? injectedValue : value
  const currentFormatted = formatValue(param.type, displayValue, param.unit, param.options)

  /* ── ширина ввода в колонке "Записать" ───────────────────────── */
  const inputW = Math.max(60, C.write - 130)   // место за вычетом кнопок Читать + Записать

  return (
    <div style={{ borderBottom: '1px solid #f5f5f5' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 4px', minHeight: 36 }}>

        {/* Параметр / Адрес */}
        <div style={{ width: C.id, flexShrink: 0 }}>
          <Typography.Text code style={{ fontSize: 11, display: 'block' }}>{param.id}</Typography.Text>
          <Typography.Text style={{ fontSize: 10, color: '#999' }}>рег.{param.register}</Typography.Text>
        </div>

        {/* Описание */}
        <div style={{ width: C.desc, flexShrink: 0, paddingRight: 8, overflow: 'hidden' }}>
          <Tooltip title={param.description ?? param.name} placement="topLeft">
            <Typography.Text
              style={{ fontSize: 12, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {param.name}
            </Typography.Text>
          </Tooltip>
        </div>

        {/* Заводское значение */}
        <div style={{ width: C.def, flexShrink: 0, overflow: 'hidden' }}>
          <Typography.Text
            style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
          >
            {defaultFormatted}
          </Typography.Text>
        </div>

        {/* Значение на устройстве */}
        <div style={{ width: C.cur, flexShrink: 0 }}>
          {reading ? <Spin size="small" /> : (
            !isBitmask && (
              <Typography.Text style={{
                fontSize: 12,
                color: displayValue !== null ? '#1677ff' : '#bbb',
                fontWeight: displayValue !== null ? 500 : 400,
              }}>
                {currentFormatted}
              </Typography.Text>
            )
          )}
        </div>

        {/* Значение для записи */}
        <div style={{ width: C.write, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <Button size="small" onClick={handleRead} disabled={!modbusConnected || !!onWrite} loading={reading}>
            Читать
          </Button>
          {param.access === 'read-write' && !isBitmask && (
            <>
              {param.type === 'enum' ? (
                <Select
                  size="small"
                  style={{ width: inputW }}
                  placeholder="Выбрать"
                  popupMatchSelectWidth={false}
                  value={editValue ?? undefined}
                  options={normalizeOptions(param.options)}
                  onChange={val => { setEditValue(val); onPendingWriteChange?.(param.id, val) }}
                />
              ) : (
                <InputNumber
                  size="small"
                  style={{ width: inputW }}
                  min={param.min}
                  max={param.max}
                  step={param.scale ?? 1}
                  placeholder={String(param.default ?? '')}
                  value={editValue ?? undefined}
                  onChange={val => { setEditValue(val); onPendingWriteChange?.(param.id, val) }}
                />
              )}
              <Button
                size="small"
                type="primary"
                onClick={handleWrite}
                disabled={!modbusConnected || editValue === null || editValue === undefined}
                loading={writing}
              >
                Записать
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Биты bitmask — отдельная строка */}
      {isBitmask && (
        <div style={{ paddingLeft: C.id + 4, paddingBottom: 8 }}>
          {reading ? (
            <Spin size="small" />
          ) : value !== null ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {renderBitTags(value)}
              </div>
              {param.access === 'read-write' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {param.bits.map(b => (
                    <Select
                      key={b.bit}
                      size="small"
                      style={{ width: 130 }}
                      placeholder={b.name}
                      value={bitState[b.bit] ?? null}
                      popupMatchSelectWidth={false}
                      options={Object.entries(b.values ?? { 0: '0', 1: '1' }).map(([k, v]) => ({
                        value: Number(k),
                        label: `${b.name}: ${v}`,
                      }))}
                      onChange={val => {
                        const next = { ...bitState, [b.bit]: val }
                        setBitState(next)
                        const intVal = bitsToInt(param.bits, next)
                        setEditValue(intVal)
                        onPendingWriteChange?.(param.id, intVal)
                      }}
                    />
                  ))}
                  <Button
                    size="small"
                    type="primary"
                    onClick={handleWrite}
                    disabled={!modbusConnected || editValue === null || editValue === undefined}
                    loading={writing}
                  >
                    Записать
                  </Button>
                </div>
              )}
            </>
          ) : (
            <Typography.Text style={{ color: '#bbb', fontSize: 12 }}>— нажмите Читать</Typography.Text>
          )}
        </div>
      )}
    </div>
  )
}
