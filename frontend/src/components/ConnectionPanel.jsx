import { useState } from 'react'
import { Button, InputNumber, AutoComplete, Space, Tag, Modal, Form, message, Tooltip } from 'antd'
import { ReloadOutlined, ScanOutlined } from '@ant-design/icons'
import socket from '../socket'
import api from '../api'

export default function ConnectionPanel({ connected }) {
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()
  const [ports, setPorts] = useState([])
  const [loadingPorts, setLoadingPorts] = useState(false)
  const [scanning, setScanning] = useState(false)

  async function fetchPorts() {
    setLoadingPorts(true)
    try {
      const { data } = await api.get('/modbus/ports')
      setPorts(data)
    } catch {
      message.error('Не удалось получить список портов')
    } finally {
      setLoadingPorts(false)
    }
  }

  function handleOpen() {
    setOpen(true)
    fetchPorts()
  }

  async function handleScan() {
    setScanning(true)
    try {
      const slaveId = form.getFieldValue('slaveId') ?? 1
      const baudRate = form.getFieldValue('baudRate') ?? undefined
      const { data } = await api.post('/modbus/scan', { slaveId, baudRate })
      form.setFieldsValue({ portPath: data.portPath, baudRate: data.baudRate })
      message.success(`Найдено: ${data.portPath} — ${data.baudRate} бод`)
    } catch {
      message.error('Адаптер USB→RS-485 не найден. Проверьте, подключён ли он к компьютеру.')
    } finally {
      setScanning(false)
    }
  }

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

  const portOptions = ports.map(p => ({
    value: p.path,
    label: p.manufacturer ? `${p.path} — ${p.manufacturer}` : p.path,
  }))

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
        <Button size="small" type="primary" onClick={handleOpen}>
          Подключить
        </Button>
      )}

      <Modal
        title="Подключение к устройству"
        open={open}
        onCancel={() => setOpen(false)}
        footer={[
          <Tooltip key="scan" title="Находит USB→RS-485 адаптер по идентификатору производителя (Silicon Labs, FTDI, CH340 и др.)">
            <Button
              icon={<ScanOutlined />}
              onClick={handleScan}
              loading={scanning}
            >
              Автопоиск
            </Button>
          </Tooltip>,
          <Button key="cancel" onClick={() => setOpen(false)}>
            Отмена
          </Button>,
          <Button key="connect" type="primary" onClick={() => form.submit()}>
            Подключить
          </Button>,
        ]}
      >
        <Form
          form={form}
          onFinish={handleConnect}
          layout="vertical"
          initialValues={{ baudRate: 9600, slaveId: 1 }}
        >
          <Form.Item
            name="portPath"
            label={
              <Space>
                COM порт
                <Tooltip title="Обновить список портов">
                  <Button
                    size="small"
                    type="text"
                    icon={<ReloadOutlined spin={loadingPorts} />}
                    onClick={fetchPorts}
                  />
                </Tooltip>
              </Space>
            }
            rules={[{ required: true, message: 'Укажите порт' }]}
          >
            <AutoComplete
              options={portOptions}
              placeholder="Выберите из списка или введите вручную"
              filterOption={(input, option) =>
                option.value.toLowerCase().includes(input.toLowerCase())
              }
              notFoundContent={loadingPorts ? 'Загрузка...' : 'Порты не найдены'}
            />
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
