import { useState } from 'react'
import { Button, List, Modal, Form, Input, InputNumber, Tooltip, Popconfirm, Tag } from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  BulbOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import socket from '../../socket'

const STORAGE_KEY = 'ola_fixtures'

function loadFixtures() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveFixtures(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export default function OlaFixtureList({ fixtures, onChange, selectedId, onSelect, olaAvailable }) {
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [discoverUniverse, setDiscoverUniverse] = useState(1)
  const [discovering, setDiscovering] = useState(false)
  const [discovered, setDiscovered] = useState([])
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()

  function handleAdd(values) {
    const next = [
      ...fixtures,
      { id: Date.now().toString(), ...values },
    ]
    onChange(next)
    saveFixtures(next)
    setAddOpen(false)
    form.resetFields()
  }

  function openEdit(e, fixture) {
    e.stopPropagation()
    setEditTarget(fixture)
    editForm.setFieldsValue(fixture)
  }

  function handleEdit(values) {
    const next = fixtures.map(f => f.id === editTarget.id ? { ...f, ...values } : f)
    onChange(next)
    saveFixtures(next)
    if (selectedId === editTarget.id) onSelect(next.find(f => f.id === editTarget.id))
    setEditTarget(null)
    editForm.resetFields()
  }

  function handleDelete(id) {
    const next = fixtures.filter(f => f.id !== id)
    onChange(next)
    saveFixtures(next)
    if (selectedId === id) onSelect(null)
  }

  function handleDiscover() {
    setDiscovering(true)
    setDiscovered([])
    socket.emit('ola:rdm:discover', { universeId: discoverUniverse, withInfo: true })
    socket.once('ola:rdm:devices', ({ devices }) => {
      setDiscovered(devices || [])
      setDiscovering(false)
    })
    setTimeout(() => setDiscovering(false), 10000)
  }

  function importDiscovered(device) {
    const already = fixtures.some(f => f.uid === device.uid)
    if (already) return
    const next = [
      ...fixtures,
      {
        id: Date.now().toString(),
        name: device.label || device.model || device.uid,
        uid: device.uid,
        universeId: discoverUniverse,
        dmxAddress: device.dmx_start_address ?? 1,
      },
    ]
    onChange(next)
    saveFixtures(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 8 }}>
        <Tooltip title="Добавить светильник вручную">
          <Button size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            Добавить
          </Button>
        </Tooltip>
        <Tooltip title={olaAvailable ? 'Поиск RDM устройств' : 'OLA недоступна'}>
          <Button
            size="small"
            icon={<SearchOutlined />}
            onClick={() => setDiscoverOpen(true)}
            disabled={!olaAvailable}
          >
            Найти
          </Button>
        </Tooltip>
      </div>

      <List
        size="small"
        dataSource={fixtures}
        style={{ flex: 1, overflowY: 'auto' }}
        locale={{ emptyText: 'Нет светильников' }}
        renderItem={f => (
          <List.Item
            style={{
              cursor: 'pointer',
              padding: '8px 12px',
              background: selectedId === f.id ? '#e6f4ff' : undefined,
              borderLeft: selectedId === f.id ? '3px solid #1677ff' : '3px solid transparent',
            }}
            onClick={() => onSelect(f)}
            actions={[
              <Button
                key="edit"
                size="small"
                type="text"
                icon={<EditOutlined />}
                onClick={e => openEdit(e, f)}
              />,
              <Popconfirm
                key="del"
                title="Удалить светильник?"
                onConfirm={() => handleDelete(f.id)}
                okText="Да"
                cancelText="Нет"
              >
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={e => e.stopPropagation()}
                />
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              avatar={<BulbOutlined style={{ fontSize: 18, color: '#faad14' }} />}
              title={<span style={{ fontSize: 13 }}>{f.name}</span>}
              description={
                <span style={{ fontSize: 11, color: '#999' }}>
                  Universe {f.universeId} · DMX {f.dmxAddress ?? '?'} · {f.uid || 'нет UID'}
                </span>
              }
            />
          </List.Item>
        )}
      />

      {/* Добавить вручную */}
      <Modal
        title="Добавить светильник"
        open={addOpen}
        onCancel={() => { setAddOpen(false); form.resetFields() }}
        onOk={() => form.submit()}
        okText="Добавить"
        cancelText="Отмена"
      >
        <Form form={form} layout="vertical" onFinish={handleAdd}>
          <Form.Item label="Название" name="name" rules={[{ required: true, message: 'Введите название' }]}>
            <Input placeholder="Прожектор 1" />
          </Form.Item>
          <Form.Item label="UID (RDM)" name="uid">
            <Input placeholder="0102:00000001" />
          </Form.Item>
          <Form.Item label="Universe" name="universeId" initialValue={1} rules={[{ required: true }]}>
            <InputNumber min={0} max={65535} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="DMX адрес (1-512)" name="dmxAddress" initialValue={1}>
            <InputNumber min={1} max={512} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Редактировать */}
      <Modal
        title="Редактировать светильник"
        open={!!editTarget}
        onCancel={() => { setEditTarget(null); editForm.resetFields() }}
        onOk={() => editForm.submit()}
        okText="Сохранить"
        cancelText="Отмена"
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item label="Название" name="name" rules={[{ required: true, message: 'Введите название' }]}>
            <Input placeholder="Прожектор 1" />
          </Form.Item>
          <Form.Item label="UID (RDM)" name="uid">
            <Input placeholder="0102:00000001" />
          </Form.Item>
          <Form.Item label="Universe" name="universeId" rules={[{ required: true }]}>
            <InputNumber min={0} max={65535} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="DMX адрес (1-512)" name="dmxAddress">
            <InputNumber min={1} max={512} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Обнаружение RDM */}
      <Modal
        title="Поиск RDM устройств"
        open={discoverOpen}
        onCancel={() => setDiscoverOpen(false)}
        footer={[
          <Button key="close" onClick={() => setDiscoverOpen(false)}>Закрыть</Button>,
        ]}
        width={520}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <span>Universe:</span>
          <InputNumber
            min={0}
            max={65535}
            value={discoverUniverse}
            onChange={v => setDiscoverUniverse(v)}
          />
          <Button type="primary" loading={discovering} onClick={handleDiscover}>
            Запустить поиск
          </Button>
        </div>
        <List
          size="small"
          dataSource={discovered}
          locale={{ emptyText: discovering ? 'Поиск...' : 'Нет устройств' }}
          renderItem={d => {
            const already = fixtures.some(f => f.uid === d.uid)
            return (
              <List.Item
                actions={[
                  already
                    ? <Tag color="green">Добавлен</Tag>
                    : <Button size="small" onClick={() => importDiscovered(d)}>Добавить</Button>,
                ]}
              >
                <List.Item.Meta
                  title={d.label || d.model || d.uid}
                  description={`UID: ${d.uid} · DMX: ${d.dmx_start_address ?? '?'}`}
                />
              </List.Item>
            )
          }}
        />
      </Modal>
    </div>
  )
}
