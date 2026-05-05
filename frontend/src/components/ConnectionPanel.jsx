import { useState } from 'react'
import { Button, InputNumber, Input, Space, Tag, Modal, Form } from 'antd'
import socket from '../socket'

export default function ConnectionPanel({ connected }) {
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()

  function handleConnect(values) {
    socket.emit('connect:port', {
      portPath: values.portPath,
      baudRate: values.baudRate,
      slaveId: values.slaveId,
    })
    setOpen(false)
  }

  function handleDisconnect() {
    socket.emit('disconnect:port')
  }

  return (
    <Space>
      <Tag color={connected ? 'green' : 'red'} style={{ margin: 0 }}>
        {connected ? 'Подключено' : 'Не подключено'}
      </Tag>

      {connected ? (
        <Button size="small" danger onClick={handleDisconnect}>
          Отключить
        </Button>
      ) : (
        <Button size="small" type="primary" onClick={() => setOpen(true)}>
          Подключить
        </Button>
      )}

      <Modal
        title="Подключение к устройству"
        open={open}
        onOk={() => form.submit()}
        onCancel={() => setOpen(false)}
        okText="Подключить"
        cancelText="Отмена"
      >
        <Form
          form={form}
          onFinish={handleConnect}
          layout="vertical"
          initialValues={{ baudRate: 9600, slaveId: 1 }}
        >
          <Form.Item
            name="portPath"
            label="COM порт"
            rules={[{ required: true, message: 'Укажите порт' }]}
          >
            <Input placeholder="Например: /dev/tty.usbserial-10 или COM3" />
          </Form.Item>
          <Form.Item name="baudRate" label="Скорость (бод)">
            <InputNumber min={1200} max={115200} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="slaveId" label="Адрес Modbus (Slave ID)">
            <InputNumber min={1} max={247} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
