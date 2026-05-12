import { useState } from 'react'
import { List, Typography, Badge, Avatar, Tag, Button, Modal, Form, Input, InputNumber, Select, Popconfirm, Tooltip, Checkbox } from 'antd'
import { LinkOutlined, DisconnectOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../api'

export default function DeviceList({ devices, selectedIds, onSelectionChange, connected }) {
  const [addOpen, setAddOpen]       = useState(false)
  const [templates, setTemplates]   = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [form]                      = Form.useForm()

  async function openAdd() {
    const { data } = await api.get('/devices/templates')
    setTemplates(data)
    form.resetFields()
    setAddOpen(true)
  }

  async function handleAdd(values) {
    setSubmitting(true)
    try {
      await api.post('/devices', values)
      setAddOpen(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(device, e) {
    e.stopPropagation()
    try {
      await api.delete(`/devices/${device.id}`)
      const next = new Set(selectedIds)
      next.delete(device.id)
      onSelectionChange(next)
    } catch (e) {
      console.error(e)
    }
  }

  function handleRowClick(device) {
    onSelectionChange(new Set([device.id]))
  }

  function handleCheckbox(device, checked) {
    const next = new Set(selectedIds)
    if (checked) next.add(device.id)
    else next.delete(device.id)
    onSelectionChange(next)
  }

  const Icon = connected ? LinkOutlined : DisconnectOutlined
  const iconColor = connected ? '#52c41a' : '#ff4d4f'
  const visibleDevices = devices.filter(d => !d.template)

  return (
    <>
      <div style={{ padding: '8px 16px 4px' }}>
        <Button type="dashed" icon={<PlusOutlined />} size="small" block onClick={openAdd}>
          Добавить устройство
        </Button>
      </div>

      {visibleDevices.length === 0 ? (
        <Typography.Text type="secondary" style={{ display: 'block', padding: '16px' }}>
          Нет устройств
        </Typography.Text>
      ) : (
        <List
          dataSource={visibleDevices}
          renderItem={device => {
            const isSelected = selectedIds.has(device.id)
            const avatar = device.images?.device
              ? (
                <Badge dot status={connected ? 'success' : 'error'} offset={[-4, 4]}>
                  <Avatar
                    src={`/api/devices/images/${device.images.device}`}
                    size={36}
                    shape="square"
                    style={{ borderRadius: 6 }}
                  />
                </Badge>
              )
              : (
                <Badge dot status={connected ? 'success' : 'error'} offset={[-2, 2]}>
                  <Icon style={{ fontSize: 20, color: iconColor, marginTop: 2 }} />
                </Badge>
              )

            return (
              <List.Item
                onClick={() => handleRowClick(device)}
                style={{
                  cursor: 'pointer',
                  padding: '8px 16px 8px 8px',
                  background: isSelected ? '#e6f4ff' : 'transparent',
                  borderLeft: isSelected ? '3px solid #1677ff' : '3px solid transparent',
                }}
                actions={[
                  <Popconfirm
                    key="del"
                    title="Удалить устройство?"
                    description="Файл конфига будет удалён безвозвратно."
                    okText="Удалить"
                    cancelText="Отмена"
                    okButtonProps={{ danger: true }}
                    onConfirm={e => handleDelete(device, e ?? { stopPropagation: () => {} })}
                    onPopupClick={e => e.stopPropagation()}
                  >
                    <Tooltip title="Удалить устройство">
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={e => e.stopPropagation()}
                      />
                    </Tooltip>
                  </Popconfirm>
                ]}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <Checkbox
                    checked={isSelected}
                    onClick={e => e.stopPropagation()}
                    onChange={e => handleCheckbox(device, e.target.checked)}
                  />
                  <List.Item.Meta
                    avatar={avatar}
                    title={<span style={{ fontSize: 13 }}>{device.name}</span>}
                    description={
                      <span style={{ fontSize: 12 }}>
                        <Tag style={{ fontSize: 11, padding: '0 4px', marginRight: 4 }}>
                          ID {device.connection.slaveId ?? 1}
                        </Tag>
                        {device.description ?? device.connection.protocol}
                      </span>
                    }
                  />
                </div>
              </List.Item>
            )
          }}
        />
      )}

      <Modal
        title="Добавить устройство"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => form.submit()}
        okText="Добавить"
        cancelText="Отмена"
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" onFinish={handleAdd} style={{ marginTop: 16 }}>
          <Form.Item name="templateId" label="Тип устройства (шаблон)" rules={[{ required: true, message: 'Выберите шаблон' }]}>
            <Select
              placeholder="Выберите шаблон"
              options={templates.map(t => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input placeholder="Например: Насос 1" />
          </Form.Item>
          <Form.Item name="slaveId" label="Slave ID (адрес на шине)" rules={[{ required: true, message: 'Введите Slave ID' }]}>
            <InputNumber min={1} max={247} style={{ width: '100%' }} placeholder="1–247" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
