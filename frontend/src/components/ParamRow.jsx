import { useState, useEffect } from 'react'
import { Row, Col, Button, InputNumber, Select, Typography, Spin, message, Space, Tag, Tooltip } from 'antd'
import api from '../api'
import { addLog } from '../log'

export const COL = { id: 90, desc: null, def: 110, cur: 150, write: 260 }

function bitsToInt(bits, bitState) {
  return bits.reduce((acc, b) => acc | ((bitState[b.bit] ?? 0) << b.bit), 0)
}

function intToBitState(bits, raw) {
  const state = {}
  bits.forEach(b => { state[b.bit] = (Math.round(raw) >> b.bit) & 1 })
  return state
}

function formatValue(type, val, unit, options, scale) {
  if (val === null || val === undefined) return '—'
  if (type === 'enum') {
    const opt = options?.find(o => o.value === Math.round(val))
    return opt ? opt.label : String(val)
  }
  if (type === 'float') return `${Number(val).toFixed(2)}${unit ? ' ' + unit : ''}`
  return `${val}${unit ? ' ' + unit : ''}`
}

export default function ParamRow({ device, param, modbusConnected, injectedValue }) {
  const [value, setValue] = useState(null)
  const [bitState, setBitState] = useState({})
  const [editValue, setEditValue] = useState(null)
  const [reading, setReading] = useState(false)
  const [writing, setWriting] = useState(false)

  useEffect(() => {
    if (injectedValue !== undefined) setValue(injectedValue)
  }, [injectedValue])

  async function handleRead() {
    setReading(true)
    try {
      const res = await api.post('/modbus/read', { deviceId: device.id, paramId: param.id })
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
      await api.post('/modbus/write', { deviceId: device.id, paramId: param.id, value: editValue })
      setValue(editValue)
      message.success('Записано успешно')
      addLog('success', `Записано ${param.id} (${param.name}): ${editValue} ${param.unit ?? ''}`)
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
      const label = b.values?.[String(bitVal)] ?? String(bitVal)
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

  const defaultFormatted = formatValue(param.type, param.default, param.unit, param.options, param.scale)
  const currentFormatted = formatValue(param.type, value, param.unit, param.options, param.scale)

  return (
    <div style={{ borderBottom: '1px solid #f5f5f5' }}>
      <Row gutter={0} align="middle" style={{ padding: '6px 4px', minHeight: 36 }}>

        {/* Параметр / Адрес */}
        <Col style={{ width: COL.id, flexShrink: 0 }}>
          <Typography.Text code style={{ fontSize: 11, display: 'block' }}>{param.id}</Typography.Text>
          <Typography.Text style={{ fontSize: 10, color: '#999' }}>рег. {param.register}</Typography.Text>
        </Col>

        {/* Описание */}
        <Col flex="auto" style={{ paddingRight: 8 }}>
          <Tooltip title={param.description ?? ''} placement="topLeft">
            <Typography.Text style={{ fontSize: 12 }}>{param.name}</Typography.Text>
          </Tooltip>
        </Col>

        {/* Заводское значение */}
        <Col style={{ width: COL.def, flexShrink: 0 }}>
          <Typography.Text style={{ fontSize: 12, color: '#888' }}>
            {defaultFormatted}
          </Typography.Text>
        </Col>

        {/* Значение на устройстве */}
        <Col style={{ width: COL.cur, flexShrink: 0 }}>
          {reading ? <Spin size="small" /> : (
            !isBitmask && (
              <Typography.Text style={{ fontSize: 12, color: value !== null ? '#1677ff' : '#bbb', fontWeight: value !== null ? 500 : 400 }}>
                {currentFormatted}
              </Typography.Text>
            )
          )}
        </Col>

        {/* Значение для записи */}
        <Col style={{ width: COL.write, flexShrink: 0 }}>
          <Space size={4} wrap={false}>
            <Button size="small" onClick={handleRead} disabled={!modbusConnected} loading={reading}>
              Читать
            </Button>
            {param.access === 'read-write' && (
              <>
                {param.type === 'enum' ? (
                  <Select
                    size="small"
                    style={{ width: 150 }}
                    placeholder="Выбрать"
                    options={param.options?.map(o => ({ value: o.value, label: o.label }))}
                    onChange={val => setEditValue(val)}
                  />
                ) : isBitmask ? (
                  <Space size={4} wrap>
                    {param.bits.map(b => (
                      <Select
                        key={b.bit}
                        size="small"
                        style={{ width: 120 }}
                        placeholder={b.name}
                        value={bitState[b.bit] ?? null}
                        options={Object.entries(b.values ?? { 0: '0', 1: '1' }).map(([k, v]) => ({
                          value: Number(k),
                          label: `${b.name}: ${v}`,
                        }))}
                        onChange={val => {
                          const next = { ...bitState, [b.bit]: val }
                          setBitState(next)
                          setEditValue(bitsToInt(param.bits, next))
                        }}
                      />
                    ))}
                  </Space>
                ) : (
                  <InputNumber
                    size="small"
                    style={{ width: 90 }}
                    min={param.min}
                    max={param.max}
                    step={param.scale ?? 1}
                    placeholder={String(param.default ?? '')}
                    onChange={val => setEditValue(val)}
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
          </Space>
        </Col>
      </Row>

      {/* Биты bitmask — отдельная строка */}
      {isBitmask && (
        <div style={{ paddingLeft: COL.id + 4, paddingBottom: 8, display: 'flex', flexWrap: 'wrap' }}>
          {reading
            ? <Spin size="small" />
            : value !== null
              ? renderBitTags(value)
              : <Typography.Text style={{ color: '#bbb', fontSize: 12 }}>— нажмите Читать</Typography.Text>
          }
        </div>
      )}
    </div>
  )
}
