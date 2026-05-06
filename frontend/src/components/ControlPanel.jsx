import { useState, useEffect } from 'react'
import { Button, InputNumber, Card, Space, Row, Col, Statistic, Typography, message } from 'antd'
import { CaretRightOutlined, PoweroffOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons'
import api from '../api'
import socket from '../socket'

export default function ControlPanel({ device, modbusConnected }) {
  const [frequency, setFrequency] = useState(50)
  const [sending, setSending] = useState(null)
  const [liveData, setLiveData] = useState({})

  useEffect(() => {
    function onData({ deviceId, data }) {
      if (deviceId === device.id) setLiveData(data)
    }
    socket.on('monitor:data', onData)
    return () => socket.off('monitor:data', onData)
  }, [device.id])

  const controlGroup = device.groups.find(g => g.id === 'control')
  if (!controlGroup) return null

  async function sendCmd(value, key) {
    setSending(key)
    try {
      await api.post('/modbus/write', { deviceId: device.id, paramId: 'CMD', value })
    } catch (e) {
      message.error(e.response?.data?.message ?? 'Ошибка команды')
    } finally {
      setSending(null)
    }
  }

  async function sendFreq() {
    if (frequency === null || frequency === undefined) return
    setSending('freq')
    try {
      await api.post('/modbus/write', { deviceId: device.id, paramId: 'FSET', value: frequency })
      message.success(`Задана частота: ${frequency} Гц`)
    } catch (e) {
      message.error(e.response?.data?.message ?? 'Ошибка задания частоты')
    } finally {
      setSending(null)
    }
  }

  const outFreq  = liveData['F0.02']?.value
  const current  = liveData['F0.03']?.value
  const temp     = liveData['F0.08']?.value
  const errCode  = liveData['F0.10']?.value
  const hasLive  = outFreq !== undefined
  const hasError = errCode !== undefined && errCode !== null && errCode !== 0
  const errText  = hasError ? (device.errorCodes?.[String(Math.round(errCode))] ?? null) : null

  return (
    <Card
      style={{ marginBottom: 16, borderColor: '#d9d9d9' }}
      styles={{ body: { padding: '16px 20px' } }}
    >
      <Row gutter={[24, 12]} align="middle" wrap>

        {/* Кнопки управления */}
        <Col>
          <Space size={8} wrap>
            <Button
              size="large"
              icon={<CaretRightOutlined />}
              style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff', minWidth: 100 }}
              disabled={!modbusConnected}
              loading={sending === 'start'}
              onClick={() => sendCmd(1, 'start')}
            >
              Пуск
            </Button>
            <Button
              danger
              size="large"
              icon={<PoweroffOutlined />}
              style={{ minWidth: 100 }}
              disabled={!modbusConnected}
              loading={sending === 'stop'}
              onClick={() => sendCmd(0, 'stop')}
            >
              Стоп
            </Button>
            <Button
              size="large"
              icon={<ReloadOutlined />}
              disabled={!modbusConnected}
              loading={sending === 'reset'}
              onClick={() => sendCmd(5, 'reset')}
            >
              Сброс ошибки
            </Button>
          </Space>
        </Col>

        {/* Задание частоты */}
        <Col>
          <Space align="center">
            <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
              Частота:
            </Typography.Text>
            <InputNumber
              value={frequency}
              min={0}
              max={400}
              step={0.5}
              precision={2}
              addonAfter="Гц"
              style={{ width: 150 }}
              disabled={!modbusConnected}
              onChange={val => setFrequency(val)}
              onPressEnter={sendFreq}
            />
            <Button
              type="primary"
              ghost
              icon={<SendOutlined />}
              disabled={!modbusConnected || frequency === null}
              loading={sending === 'freq'}
              onClick={sendFreq}
            >
              Задать
            </Button>
          </Space>
        </Col>

        {/* Текущие показания из монитора */}
        {hasLive && (
          <Col flex="auto">
            <Row gutter={[20, 0]} justify="end" wrap={false}>
              <Col>
                <Statistic
                  title="Выходная частота"
                  value={outFreq}
                  precision={2}
                  suffix="Гц"
                  valueStyle={{ fontSize: 15, color: '#1677ff' }}
                />
              </Col>
              {current !== undefined && (
                <Col>
                  <Statistic
                    title="Ток"
                    value={current}
                    precision={1}
                    suffix="А"
                    valueStyle={{ fontSize: 15 }}
                  />
                </Col>
              )}
              {temp !== undefined && (
                <Col>
                  <Statistic
                    title="Температура"
                    value={temp}
                    suffix="°C"
                    valueStyle={{ fontSize: 15, color: temp > 70 ? '#ff4d4f' : undefined }}
                  />
                </Col>
              )}
              {hasError && (
                <Col>
                  <Statistic
                    title={errText ?? 'Авария'}
                    value={`E${Math.round(errCode)}`}
                    valueStyle={{ fontSize: 15, color: '#ff4d4f' }}
                  />
                </Col>
              )}
            </Row>
          </Col>
        )}

      </Row>

      {!modbusConnected && (
        <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
          Для управления подключитесь к устройству
        </Typography.Text>
      )}
    </Card>
  )
}
