import { useState } from 'react'
import { Collapse, Button, Input, message, Row, Col, Typography } from 'antd'
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons'
import ParamRow, { COL } from './ParamRow'
import api from '../api'

function ParamTableHeader() {
  return (
    <Row
      gutter={0}
      align="middle"
      style={{
        padding: '4px 4px',
        background: '#fafafa',
        borderBottom: '2px solid #e8e8e8',
        borderTop: '1px solid #e8e8e8',
        position: 'sticky',
        top: 0,
        zIndex: 1,
      }}
    >
      <Col style={{ width: COL.id, flexShrink: 0 }}>
        <Typography.Text style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Параметр / Адрес</Typography.Text>
      </Col>
      <Col flex="auto" style={{ paddingRight: 8 }}>
        <Typography.Text style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Описание параметра</Typography.Text>
      </Col>
      <Col style={{ width: COL.def, flexShrink: 0 }}>
        <Typography.Text style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Заводское значение</Typography.Text>
      </Col>
      <Col style={{ width: COL.cur, flexShrink: 0 }}>
        <Typography.Text style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Значение на устройстве</Typography.Text>
      </Col>
      <Col style={{ width: COL.write, flexShrink: 0 }}>
        <Typography.Text style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Значение для записи</Typography.Text>
      </Col>
    </Row>
  )
}

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
    // label: `${group.id} — ${group.name}`,
    label: `${group.name}`,
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
    children: (
      <>
        <ParamTableHeader />
        {group.params.map(param => (
          <ParamRow
            key={param.id}
            device={device}
            param={param}
            modbusConnected={modbusConnected}
            injectedValue={groupValues[param.id]}
          />
        ))}
      </>
    ),
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
