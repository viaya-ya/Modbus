import { useState, useEffect } from 'react'
import { Button, Card, Row, Col, Statistic, Space, Typography, Alert } from 'antd'
import { PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons'
import socket from '../socket'

export default function Monitor({ device, modbusConnected }) {
  const [running, setRunning] = useState(false)
  const [data, setData] = useState({})
  const [error, setError] = useState(null)

  useEffect(() => {
    function onMonitorData({ deviceId, data: incoming }) {
      if (deviceId === device.id) setData(incoming)
    }
    function onError({ message }) {
      setError(message)
    }
    socket.on('monitor:data', onMonitorData)
    socket.on('modbus:error', onError)
    return () => {
      socket.off('monitor:data', onMonitorData)
      socket.off('modbus:error', onError)
    }
  }, [device.id])

  useEffect(() => {
    return () => {
      socket.emit('monitor:stop')
      setRunning(false)
      setData({})
    }
  }, [device.id])

  function toggle() {
    if (running) {
      socket.emit('monitor:stop')
      setRunning(false)
      setData({})
    } else {
      socket.emit('monitor:start', { deviceId: device.id })
      setRunning(true)
    }
  }

  const f0Group = device.groups.find(g => g.id === 'F0')
  const monitorParams = f0Group?.params ?? []

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {error && (
        <Alert
          type="error"
          message={error}
          closable
          onClose={() => setError(null)}
        />
      )}

      <Space align="center">
        <Button
          type={running ? 'default' : 'primary'}
          icon={running ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          onClick={toggle}
          disabled={!modbusConnected}
          danger={running}
        >
          {running ? 'Остановить мониторинг' : 'Запустить мониторинг'}
        </Button>
        {!modbusConnected && (
          <Typography.Text type="secondary">Требуется подключение к порту</Typography.Text>
        )}
      </Space>

      {!monitorParams.length && (
        <Typography.Text type="secondary">
          Нет параметров группы F0 для мониторинга
        </Typography.Text>
      )}

      <Row gutter={[16, 16]}>
        {monitorParams.map(param => {
          const entry = data[param.id]
          return (
            <Col key={param.id} xs={24} sm={12} md={8} lg={6}>
              <Card size="small" title={param.name} style={{ minHeight: 80 }}>
                {entry?.error ? (
                  <Typography.Text type="danger" style={{ fontSize: 12 }}>
                    {entry.error}
                  </Typography.Text>
                ) : (
                  <Statistic
                    value={entry?.value ?? '—'}
                    suffix={param.unit}
                    precision={param.type === 'float' ? 2 : 0}
                    valueStyle={{
                      fontSize: 20,
                      color: entry ? '#1677ff' : '#bbb',
                    }}
                  />
                )}
              </Card>
            </Col>
          )
        })}
      </Row>
    </Space>
  )
}
