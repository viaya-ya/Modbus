import { useState, useRef, useCallback } from 'react'
import { Collapse, Button, Input, message, Typography, Popconfirm } from 'antd'
import { DownloadOutlined, SearchOutlined, RollbackOutlined } from '@ant-design/icons'
import ParamRow from './ParamRow'
import api from '../api'

const DEFAULT_COLS = { id: 90, desc: 220, def: 120, cur: 150, write: 290 }
const MIN_COLS     = { id: 60, desc: 100, def: 80,  cur: 100, write: 200 }

function loadCols() {
  try { return { ...DEFAULT_COLS, ...JSON.parse(localStorage.getItem('param_col_widths') ?? '{}') } }
  catch { return DEFAULT_COLS }
}

function HeaderCell({ label, width, onResizeStart }) {
  return (
    <div style={{ position: 'relative', width, flexShrink: 0, paddingRight: 10, boxSizing: 'border-box' }}>
      <Typography.Text style={{ fontSize: 11, color: '#888', fontWeight: 600, userSelect: 'none' }}>
        {label}
      </Typography.Text>
      <div
        onMouseDown={onResizeStart}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: 5,
          cursor: 'col-resize',
          borderRight: '2px solid transparent',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderRightColor = '#1677ff' }}
        onMouseLeave={e => { e.currentTarget.style.borderRightColor = 'transparent' }}
      />
    </div>
  )
}

function ParamTableHeader({ cols, onResizeStart }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '5px 4px',
      background: '#fafafa',
      borderBottom: '2px solid #e8e8e8',
      borderTop: '1px solid #e8e8e8',
      position: 'sticky', top: 0, zIndex: 1,
    }}>
      <HeaderCell label="Параметр / Адрес"      width={cols.id}    onResizeStart={onResizeStart('id')} />
      <HeaderCell label="Описание параметра"     width={cols.desc}  onResizeStart={onResizeStart('desc')} />
      <HeaderCell label="Заводское значение"     width={cols.def}   onResizeStart={onResizeStart('def')} />
      <HeaderCell label="Значение на устройстве" width={cols.cur}   onResizeStart={onResizeStart('cur')} />
      <HeaderCell label="Значение для записи"    width={cols.write} onResizeStart={onResizeStart('write')} />
    </div>
  )
}

export default function ParamGroups({ device, modbusConnected }) {
  const [readingGroup, setReadingGroup] = useState(null)
  const [groupValues, setGroupValues]   = useState({})
  const [search, setSearch]             = useState('')
  const [cols, setCols]                 = useState(loadCols)
  const resizing = useRef(null)

  const startResize = useCallback((key) => (e) => {
    e.preventDefault()
    resizing.current = { key, startX: e.clientX, startW: cols[key] }

    function onMove(e) {
      if (!resizing.current) return
      const { key, startX, startW } = resizing.current
      const newW = Math.max(MIN_COLS[key], startW + e.clientX - startX)
      setCols(prev => {
        const next = { ...prev, [key]: newW }
        localStorage.setItem('param_col_widths', JSON.stringify(next))
        return next
      })
    }
    function onUp() {
      resizing.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [cols])

  async function readGroup(group, e) {
    e.stopPropagation()
    setReadingGroup(group.id)
    const results = {}
    for (const param of group.params) {
      try {
        const { data } = await api.post('/modbus/read', { deviceId: device.id, paramId: param.id })
        results[param.id] = data.value
      } catch { }
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
        ? group.params.filter(p =>
            p.id.toLowerCase().includes(query) ||
            p.name.toLowerCase().includes(query))
        : group.params,
    }))
    .filter(g => g.params.length > 0)

  const totalWidth = cols.id + cols.desc + cols.def + cols.cur + cols.write

  const items = filteredGroups.map(group => ({
    key: group.id,
    label: group.name,
    extra: (
      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
        <Button
          size="small"
          icon={<DownloadOutlined />}
          loading={readingGroup === group.id}
          disabled={!modbusConnected || (readingGroup !== null && readingGroup !== group.id)}
          onClick={e => readGroup(group, e)}
        >
          Прочитать всё
        </Button>
        <Popconfirm
          title="Сброс до заводских"
          description={`Записать заводские значения во все параметры группы «${group.name}»?`}
          okText="Сбросить"
          cancelText="Отмена"
          okButtonProps={{ danger: true }}
          onConfirm={e => resetGroup(group, e ?? { stopPropagation: () => {} })}
        >
          <Button
            size="small"
            icon={<RollbackOutlined />}
            disabled={!modbusConnected || readingGroup !== null}
            danger
          >
            Заводские
          </Button>
        </Popconfirm>
      </div>
    ),
    children: (
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: totalWidth }}>
          <ParamTableHeader cols={cols} onResizeStart={startResize} />
          {group.params.map(param => (
            <ParamRow
              key={param.id}
              device={device}
              param={param}
              modbusConnected={modbusConnected}
              injectedValue={groupValues[param.id]}
              cols={cols}
            />
          ))}
        </div>
      </div>
    ),
  }))

  async function resetGroup(group, e) {
    e.stopPropagation()
    const toWrite = group.params.filter(
      p => p.access === 'read-write' && p.default !== undefined && p.default !== null
    )
    if (toWrite.length === 0) {
      message.info('Нет параметров с заводскими значениями')
      return
    }
    setReadingGroup(group.id)
    let ok = 0
    for (const param of toWrite) {
      try {
        await api.post('/modbus/write', { deviceId: device.id, paramId: param.id, value: param.default })
        ok++
      } catch { }
    }
    setReadingGroup(null)
    message.success(`Сброшено ${ok} из ${toWrite.length} параметров группы ${group.name}`)
  }

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
