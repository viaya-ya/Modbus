import { useState } from 'react'
import { Collapse, Button, Input, message } from 'antd'
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons'
import ParamRow from './ParamRow'
import api from '../api'

export default function ParamGroups({ device, modbusConnected }) {
  const [readingGroup, setReadingGroup] = useState(null)
  const [groupValues, setGroupValues] = useState({})
  const [search, setSearch] = useState('')

  async function readGroup(group, e) {
    e.stopPropagation()
    setReadingGroup(group.id)
    const results = {}
    for (const param of group.params) {
      try {
        const { data } = await api.post('/modbus/read', {
          deviceId: device.id,
          paramId: param.id,
        })
        results[param.id] = data.value
      } catch {
        // пропускаем параметры которые не удалось прочитать
      }
    }
    setGroupValues(prev => ({ ...prev, ...results }))
    setReadingGroup(null)
    message.success(`Группа ${group.id} прочитана`)
  }

  const query = search.trim().toLowerCase()

  const filteredGroups = device.groups
    .map(group => ({
      ...group,
      params: query
        ? group.params.filter(
            p =>
              p.id.toLowerCase().includes(query) ||
              p.name.toLowerCase().includes(query),
          )
        : group.params,
    }))
    .filter(g => g.params.length > 0)

  const items = filteredGroups.map(group => ({
    key: group.id,
    label: `${group.id} — ${group.name}`,
    extra: (
      <Button
        size="small"
        icon={<DownloadOutlined />}
        loading={readingGroup === group.id}
        disabled={!modbusConnected || (readingGroup !== null && readingGroup !== group.id)}
        onClick={e => readGroup(group, e)}
      >
        Прочитать всё
      </Button>
    ),
    children: group.params.map(param => (
      <ParamRow
        key={param.id}
        device={device}
        param={param}
        modbusConnected={modbusConnected}
        injectedValue={groupValues[param.id]}
      />
    )),
  }))

  return (
    <>
      <Input
        prefix={<SearchOutlined style={{ color: '#bbb' }} />}
        placeholder="Поиск параметра по коду или названию"
        value={search}
        onChange={e => setSearch(e.target.value)}
        allowClear
        style={{ marginBottom: 12 }}
      />
      <Collapse
        items={items}
        defaultActiveKey={[device.groups[0]?.id]}
        activeKey={query ? filteredGroups.map(g => g.id) : undefined}
      />
    </>
  )
}
