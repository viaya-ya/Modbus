import { useState, useEffect, useRef } from 'react'
import { Button, Select, AutoComplete, Space, Tag, Modal, Form, message, Tooltip } from 'antd'
import { ReloadOutlined, ScanOutlined, LoadingOutlined } from '@ant-design/icons'
import socket from '../socket'
import api from '../api'
import { addLog } from '../log'

export default function ConnectionPanel({ connected, reconnecting, reconnectAttempt }) {
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()
  const [ports, setPorts] = useState([])
  const [loadingPorts, setLoadingPorts] = useState(false)
  const [scanning, setScanning] = useState(false)
  const prevReconnecting = useRef(false)

  useEffect(() => {
    if (reconnecting && !prevReconnecting.current) {
      addLog('warning', 'Соединение потеряно. Запуск авто-переподключения...')
    }
    if (!reconnecting && prevReconnecting.current && connected) {
      addLog('success', 'Соединение восстановлено')
    }
    prevReconnecting.current = reconnecting
  }, [reconnecting, connected])

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
      const baudRate = form.getFieldValue('baudRate') ?? undefined
      const { data } = await api.post('/modbus/scan', { baudRate })
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
    })
    addLog('info', `Подключение к порту ${values.portPath}, ${values.baudRate} бод`)
    setOpen(false)
  }

  function handleDisconnect() {
    socket.emit('disconnect:port')
    addLog('info', 'Отключение от порта')
  }

  const portOptions = ports.map(p => ({
    value: p.path,
    label: p.manufacturer ? `${p.path} — ${p.manufacturer}` : p.path,
  }))

  const statusTag = connected ? (
    <Tag color="green" style={{ margin: 0 }}>Подключено</Tag>
  ) : reconnecting ? (
    <Tag color="orange" icon={<LoadingOutlined spin />} style={{ margin: 0 }}>
      Переподключение… попытка {reconnectAttempt}
    </Tag>
  ) : (
    <Tag color="red" style={{ margin: 0 }}>Не подключено</Tag>
  )

  return (
    <Space>
      {statusTag}

      {connected ? (
        <Button size="small" danger onClick={handleDisconnect}>
          Отключить
        </Button>
      ) : reconnecting ? (
        <Button size="small" onClick={handleDisconnect}>
          Отменить
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
          initialValues={{ baudRate: 9600 }}
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

          <Form.Item
            name="baudRate"
            label="Скорость (бод)"
            extra="Все устройства на одной шине RS-485 должны работать на одной скорости"
          >
            <Select style={{ width: '100%' }} options={[
              { value: 1200,   label: '1200' },
              { value: 2400,   label: '2400' },
              { value: 4800,   label: '4800' },
              { value: 9600,   label: '9600' },
              { value: 19200,  label: '19200' },
              { value: 38400,  label: '38400' },
              { value: 57600,  label: '57600' },
              { value: 115200, label: '115200' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
