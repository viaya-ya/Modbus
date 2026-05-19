import { useState, useEffect } from 'react'
import { Dropdown, Button, Modal, Form, Input, Space, Popconfirm, message } from 'antd'
import { PlusOutlined, FolderOpenOutlined, DownOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../api'

export default function ProjectSelector({ onProjectChange, onProjectInit }) {
  const [projects, setProjects] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editProject, setEditProject] = useState(null)  // { id, name }
  const [saving, setSaving] = useState(false)
  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [{ data: list }, { data: active }] = await Promise.all([
        api.get('/projects'),
        api.get('/projects/active'),
      ])
      setProjects(list)
      const validId = active.id && list.some(p => p.id === active.id) ? active.id : null
      setActiveId(validId)
      onProjectInit?.(validId)
    } catch {}
  }

  async function handleSelect(id) {
    try {
      await api.post('/projects/active', { id })
      setActiveId(id)
      onProjectChange?.(id)
    } catch {
      message.error('Не удалось переключить проект')
    }
  }

  async function handleCreate({ name }) {
    setCreating(true)
    try {
      const { data: project } = await api.post('/projects', { name })
      await api.post('/projects/active', { id: project.id })
      setProjects(prev => [...prev, project])
      setActiveId(project.id)
      onProjectChange?.(project.id)
      setCreateOpen(false)
      createForm.resetFields()
      message.success(`Проект «${name}» создан`)
    } catch (e) {
      message.error(e?.response?.data?.message ?? 'Ошибка создания проекта')
    } finally {
      setCreating(false)
    }
  }

  async function handleRename({ name }) {
    setSaving(true)
    try {
      const oldId = editProject.id
      const { data: updated } = await api.patch(`/projects/${oldId}`, { name })
      setProjects(prev => prev.map(p => p.id === oldId ? updated : p))
      if (activeId === oldId) {
        setActiveId(updated.id)
        if (updated.id !== oldId) onProjectChange?.(updated.id)
      }
      setEditProject(null)
      editForm.resetFields()
      message.success('Проект переименован')
    } catch (e) {
      message.error(e?.response?.data?.message ?? 'Ошибка переименования')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/projects/${id}`)
      setProjects(prev => prev.filter(p => p.id !== id))
      if (activeId === id) {
        setActiveId(null)
        onProjectChange?.(null)
      }
      message.success('Проект удалён')
    } catch (e) {
      message.error(e?.response?.data?.message ?? 'Ошибка удаления')
    }
  }

  function openEdit(project) {
    setEditProject(project)
    editForm.setFieldsValue({ name: project.name })
  }

  const activeName = projects.find(p => p.id === activeId)?.name ?? 'Выберите проект'

  const menuItems = [
    ...projects.map(p => ({
      key: p.id,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 180 }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
          <Space size={0} onClick={e => e.stopPropagation()}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              style={{ color: '#888' }}
              onClick={() => openEdit(p)}
            />
            <Popconfirm
              title="Удалить проект?"
              description="Все устройства проекта будут удалены."
              okText="Удалить"
              cancelText="Отмена"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDelete(p.id)}
            >
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                danger
              />
            </Popconfirm>
          </Space>
        </div>
      ),
    })),
    { type: 'divider' },
    {
      key: '__new',
      icon: <PlusOutlined />,
      label: 'Новый проект',
    },
  ]

  function onMenuClick({ key }) {
    if (key === '__new') setCreateOpen(true)
    else handleSelect(key)
  }

  return (
    <>
      <Dropdown
        menu={{ items: menuItems, onClick: onMenuClick, selectedKeys: activeId ? [activeId] : [] }}
        trigger={['click']}
      >
        <Space style={{ cursor: 'pointer', userSelect: 'none' }}>
          <FolderOpenOutlined style={{ color: '#fff', fontSize: 14 }} />
          <span style={{ color: '#fff', fontSize: 14 }}>{activeName}</span>
          <DownOutlined style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }} />
        </Space>
      </Dropdown>

      <Modal
        title="Новый проект"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields() }}
        onOk={() => createForm.submit()}
        okText="Создать"
        cancelText="Отмена"
        confirmLoading={creating}
      >
        <Form form={createForm} onFinish={handleCreate} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Название проекта" rules={[{ required: true, message: 'Введите название' }]}>
            <Input placeholder="Например: Завод 1" autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Переименовать проект"
        open={!!editProject}
        onCancel={() => { setEditProject(null); editForm.resetFields() }}
        onOk={() => editForm.submit()}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={saving}
      >
        <Form form={editForm} onFinish={handleRename} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Название проекта" rules={[{ required: true, message: 'Введите название' }]}>
            <Input autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
