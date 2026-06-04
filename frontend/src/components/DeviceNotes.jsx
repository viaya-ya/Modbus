import { useState, useEffect } from 'react'
import { Button, Input, List, Typography, Popconfirm, Empty, Space, Tag } from 'antd'
import { DeleteOutlined, PlusOutlined, FileTextOutlined } from '@ant-design/icons'
import api from '../api'

export default function DeviceNotes({ device }) {
  const [notes, setNotes] = useState([])
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    setNotes([])
    api.get(`/devices/${device.id}/notes`)
      .then(({ data }) => setNotes(data))
      .catch(() => {})
  }, [device.id])

  async function handleAdd() {
    if (!text.trim()) return
    setAdding(true)
    try {
      const { data } = await api.post(`/devices/${device.id}/notes`, { text: text.trim() })
      setNotes(prev => [...prev, data])
      setText('')
    } catch {
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(noteId) {
    await api.delete(`/devices/${device.id}/notes/${noteId}`).catch(() => {})
    setNotes(prev => prev.filter(n => n.id !== noteId))
  }

  function formatDate(iso) {
    const d = new Date(iso)
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
        <Input.TextArea
          placeholder="Новая запись — техническое обслуживание, замена, настройка..."
          value={text}
          onChange={e => setText(e.target.value)}
          autoSize={{ minRows: 2, maxRows: 6 }}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAdd()
          }}
          style={{ borderRadius: '6px 0 0 6px' }}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          loading={adding}
          disabled={!text.trim()}
          onClick={handleAdd}
          style={{ height: 'auto', borderRadius: '0 6px 6px 0', alignSelf: 'stretch' }}
        >
          Добавить
        </Button>
      </Space.Compact>

      {notes.length === 0 ? (
        <Empty
          image={<FileTextOutlined style={{ fontSize: 40, color: '#d9d9d9' }} />}
          imageStyle={{ height: 48 }}
          description={<Typography.Text type="secondary">Записей пока нет</Typography.Text>}
        />
      ) : (
        <List
          dataSource={[...notes].reverse()}
          renderItem={note => (
            <List.Item
              style={{
                alignItems: 'flex-start',
                padding: '10px 12px',
                marginBottom: 6,
                background: '#fafafa',
                borderRadius: 6,
                border: '1px solid #f0f0f0',
              }}
              actions={[
                <Popconfirm
                  key="del"
                  title="Удалить запись?"
                  okText="Удалить"
                  cancelText="Отмена"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDelete(note.id)}
                >
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                  />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Tag color="default" style={{ fontSize: 11, fontWeight: 400 }}>
                    {formatDate(note.createdAt)}
                  </Tag>
                }
                description={
                  <Typography.Text style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>
                    {note.text}
                  </Typography.Text>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  )
}
