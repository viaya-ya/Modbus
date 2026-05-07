import { useState, useEffect } from 'react'
import { Row, Col, Button, InputNumber, Select, Typography, Spin, message, Space, Tag } from 'antd'
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

export default function ParamRow({ device, param, modbusConnected, injectedValue }) {
  const [value, setValue] = useState(null)
  const [bitState, setBitState] = useState({})

  useEffect(() => {
    if (injectedValue !== undefined) setValue(injectedValue)
  }, [injectedValue])
  const [editValue, setEditValue] = useState(null)
  const [reading, setReading] = useState(false)
  const [writing, setWriting] = useState(false)

  async function handleRead() {
    setReading(true)
    try {
      const res = await api.post('/modbus/read', { deviceId: device.id, paramId: param.id })
      setValue(res.data.value)
      if (param.type === 'bitmask' && param.bits) {
        const state = intToBitState(param.bits, res.data.value)
        setBitState(state)
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

  function formatDisplay() {
    if (value === null) return '—'
    if (param.type === 'enum') {
      const opt = param.options?.find(o => o.value === Math.round(value))
      return opt ? opt.label : String(value)
    }
    if (param.type === 'float') return `${Number(value).toFixed(2)} ${param.unit ?? ''}`
    return `${value} ${param.unit ?? ''}`
  }

  function renderBitTags() {
    if (!isBitmask || value === null) return null
    const raw = Math.round(value)
    return param.bits.map(b => {
      const bitVal = (raw >> b.bit) & 1
      const label = b.values?.[String(bitVal)] ?? String(bitVal)
      const active = bitVal === 1
      return (
        <Tag
          key={b.bit}
          color={active ? 'success' : 'default'}
          style={{ margin: '2px', fontSize: 11 }}
        >
          <span style={{ opacity: active ? 1 : 0.5 }}>
            {b.name}
          </span>
          <span style={{
            marginLeft: 4,
            fontWeight: 600,
            color: active ? undefined : '#aaa',
          }}>
            {active ? '●' : '○'} {label}
          </span>
        </Tag>
      )
    })
  }

  return (
    <div style={{ borderBottom: '1px solid #f5f5f5' }}>
      <Row
        gutter={8}
        align="middle"
        style={{ padding: '8px 4px' }}
      >
        <Col style={{ width: 70 }}>
          <Typography.Text code style={{ fontSize: 11 }}>
            {param.id}
          </Typography.Text>
        </Col>
        <Col flex="auto">
          <Typography.Text style={{ fontSize: 13 }}>{param.name}</Typography.Text>
          {param?.unit && <Typography.Text style={{ fontSize: 13 }}> {", "}{param?.unit}</Typography.Text>}
        </Col>
        {!isBitmask && (
          <Col style={{ width: 160 }}>
            {reading ? (
              <Spin size="small" />
            ) : (
              <Typography.Text style={{ color: value !== null ? '#1677ff' : '#bbb', fontSize: 13 }}>
                {formatDisplay()}
              </Typography.Text>
            )}
          </Col>
        )}
        <Col>
          <Space size={4}>
            <Button
              size="small"
              onClick={handleRead}
              disabled={!modbusConnected}
              loading={reading}
            >
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
                        style={{ width: 130 }}
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
      {isBitmask && (
        <div style={{ paddingLeft: 74, paddingBottom: 8, display: 'flex', flexWrap: 'wrap' }}>
          {reading
            ? <Spin size="small" />
            : value !== null
              ? renderBitTags()
              : <Typography.Text style={{ color: '#bbb', fontSize: 12 }}>— нажмите Читать</Typography.Text>
          }
        </div>
      )}
    </div>
  )
}
