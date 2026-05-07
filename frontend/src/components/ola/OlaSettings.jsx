import { useState, useEffect } from 'react'
import { Form, Input, InputNumber, Button, Card, Tag, Space, Typography } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import socket from '../../socket'

export default function OlaSettings() {
  const [form] = Form.useForm()
  const [status, setStatus] = useState({ available: false, config: { host: 'localhost', port: 9090 } })
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    socket.on('ola:status', s => setStatus(s))
    socket.emit('ola:ping')
    return () => socket.off('ola:status')
  }, [])

  useEffect(() => {
    form.setFieldsValue(status.config)
  }, [status.config, form])

  function handleSave(values) {
    socket.emit('ola:configure', values)
  }

  function handlePing() {
    setChecking(true)
    socket.emit('ola:ping')
    setTimeout(() => setChecking(false), 2000)
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
      <Card title="Подключение к OLA">
        <Space style={{ marginBottom: 24 }}>
          <Typography.Text>Статус демона OLA:</Typography.Text>
          {status.available ? (
            <Tag icon={<CheckCircleOutlined />} color="success">Доступен</Tag>
          ) : (
            <Tag icon={<CloseCircleOutlined />} color="error">Недоступен</Tag>
          )}
          <Button
            size="small"
            icon={<ReloadOutlined spin={checking} />}
            onClick={handlePing}
          >
            Проверить
          </Button>
        </Space>

        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={status.config}>
          <Form.Item label="Хост OLA" name="host" rules={[{ required: true }]}>
            <Input placeholder="localhost" />
          </Form.Item>
          <Form.Item label="Порт OLA" name="port" rules={[{ required: true }]}>
            <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="9090" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">Сохранить</Button>
          </Form.Item>
        </Form>

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          OLA (Open Lighting Architecture) — демон управления DMX/RDM оборудованием.
          По умолчанию работает на порту 9090.
        </Typography.Text>
      </Card>
    </div>
  )
}
