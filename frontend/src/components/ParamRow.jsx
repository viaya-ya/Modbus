import { useState } from 'react'
import { Row, Col, Button, InputNumber, Select, Typography, Spin, message, Space } from 'antd'
import api from '../api'

export default function ParamRow({ device, param, modbusConnected }) {
  const [value, setValue] = useState(null)
  const [editValue, setEditValue] = useState(null)
  const [reading, setReading] = useState(false)
  const [writing, setWriting] = useState(false)

  async function handleRead() {
    setReading(true)
    try {
      const res = await api.post('/modbus/read', { deviceId: device.id, paramId: param.id })
      setValue(res.data.value)
    } catch (e) {
      message.error(e.response?.data?.message ?? 'Ошибка чтения')
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
    } catch (e) {
      message.error(e.response?.data?.message ?? 'Ошибка записи')
    } finally {
      setWriting(false)
    }
  }

  function formatDisplay() {
    if (value === null) return '—'
    if (param.type === 'enum') {
      const opt = param.options?.find(o => o.value === Math.round(value))
      return opt ? opt.label : String(value)
    }
    if (param.type === 'float') return `${Number(value).toFixed(2)} ${param.unit ?? ''}`
    return `${value} ${param.unit ?? ''}`
  }

  return (
    <Row
      gutter={8}
      align="middle"
      style={{ padding: '8px 4px', borderBottom: '1px solid #f5f5f5' }}
    >
      <Col style={{ width: 70 }}>
        <Typography.Text code style={{ fontSize: 11 }}>
          {param.id}
        </Typography.Text>
      </Col>
      <Col flex="auto">
        <Typography.Text style={{ fontSize: 13 }}>{param.name}</Typography.Text>
      </Col>
      <Col style={{ width: 160 }}>
        {reading ? (
          <Spin size="small" />
        ) : (
          <Typography.Text style={{ color: value !== null ? '#1677ff' : '#bbb', fontSize: 13 }}>
            {formatDisplay()}
          </Typography.Text>
        )}
      </Col>
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
  )
}
