import { useState, useEffect, useRef } from 'react'
import { InputNumber, Button, Slider, Typography, Space, Select, Row, Col, notification } from 'antd'
import { PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import socket from '../../socket'

const CHANNEL_COUNT = 512

export default function OlaDmxMixer({ olaAvailable }) {
  const [universeId, setUniverseId] = useState(1)
  const [universes, setUniverses] = useState([])
  const [channels, setChannels] = useState(new Array(CHANNEL_COUNT).fill(0))
  const [monitoring, setMonitoring] = useState(false)
  const [showCount, setShowCount] = useState(32)
  const [dirty, setDirty] = useState(new Set())
  const channelsRef = useRef(channels)

  useEffect(() => { channelsRef.current = channels }, [channels])

  useEffect(() => {
    socket.on('ola:universe:list', list => setUniverses(list || []))
    socket.on('ola:dmx:data', ({ universeId: uid, channels: ch }) => {
      if (uid === universeId) {
        setChannels([...ch])
      }
    })
    socket.on('ola:error', ({ message }) => {
      notification.error({ message: 'OLA ошибка', description: message, duration: 4 })
    })
    socket.emit('ola:universe:list')
    return () => {
      socket.off('ola:universe:list')
      socket.off('ola:dmx:data')
      socket.off('ola:error')
      if (monitoring) socket.emit('ola:monitor:stop')
    }
  }, [universeId])

  function fetchDmx() {
    socket.emit('ola:dmx:get', { universeId })
  }

  function toggleMonitor() {
    if (monitoring) {
      socket.emit('ola:monitor:stop')
      setMonitoring(false)
    } else {
      socket.emit('ola:monitor:start', { universeId, intervalMs: 500 })
      setMonitoring(true)
    }
  }

  function handleChannelChange(index, value) {
    const next = [...channelsRef.current]
    next[index] = value
    channelsRef.current = next
    setChannels(next)
    setDirty(prev => new Set(prev).add(index))
  }

  function sendChannel(index, value) {
    const next = [...channelsRef.current]
    next[index] = value
    channelsRef.current = next
    setChannels(next)
    socket.emit('ola:dmx:set', { universeId, channels: next })
    setDirty(prev => {
      const s = new Set(prev)
      s.delete(index)
      return s
    })
  }

  function sendAll() {
    socket.emit('ola:dmx:set', { universeId, channels })
    setDirty(new Set())
  }

  function blackout() {
    const zeros = new Array(CHANNEL_COUNT).fill(0)
    setChannels(zeros)
    socket.emit('ola:dmx:set', { universeId, channels: zeros })
    setDirty(new Set())
  }

  const visibleChannels = channels.slice(0, showCount)

  return (
    <div style={{ padding: 16 }}>
      {/* Тулбар */}
      <Space wrap style={{ marginBottom: 16 }}>
        <span>Universe:</span>
        <Select
          value={universeId}
          onChange={v => { setUniverseId(v); setChannels(new Array(CHANNEL_COUNT).fill(0)) }}
          style={{ width: 160 }}
          options={[
            { value: universeId, label: `Universe ${universeId}` },
            ...universes
              .filter(u => u.id !== universeId)
              .map(u => ({ value: u.id, label: `${u.name || 'Universe'} (${u.id})` })),
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchDmx} disabled={!olaAvailable}>
          Прочитать
        </Button>
        <Button
          icon={monitoring ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          onClick={toggleMonitor}
          disabled={!olaAvailable}
          type={monitoring ? 'default' : 'primary'}
        >
          {monitoring ? 'Стоп монитор' : 'Монитор'}
        </Button>
        <Button onClick={sendAll} disabled={!olaAvailable || dirty.size === 0} type="primary">
          Отправить все ({dirty.size})
        </Button>
        <Button danger onClick={blackout} disabled={!olaAvailable}>
          Blackout
        </Button>
        <span>Показать каналов:</span>
        <Select
          value={showCount}
          onChange={setShowCount}
          style={{ width: 90 }}
          options={[16, 32, 64, 128, 256, 512].map(n => ({ value: n, label: n }))}
        />
      </Space>

      {/* Каналы */}
      <Row gutter={[4, 8]}>
        {visibleChannels.map((val, i) => (
          <Col key={i} xs={6} sm={4} md={3} lg={2} xl={2}>
            <ChannelStrip
              index={i}
              value={val}
              isDirty={dirty.has(i)}
              disabled={!olaAvailable}
              onChange={v => handleChannelChange(i, v)}
              onRelease={v => sendChannel(i, v)}
            />
          </Col>
        ))}
      </Row>
    </div>
  )
}

function ChannelStrip({ index, value, isDirty, disabled, onChange, onRelease }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '4px 2px',
        border: isDirty ? '1px solid #1677ff' : '1px solid #f0f0f0',
        borderRadius: 4,
        background: isDirty ? '#e6f4ff' : undefined,
      }}
    >
      <Typography.Text style={{ fontSize: 10, color: '#999', lineHeight: 1 }}>
        {index + 1}
      </Typography.Text>
      <Slider
        vertical
        min={0}
        max={255}
        value={value}
        disabled={disabled}
        onChange={onChange}
        onChangeComplete={onRelease}
        style={{ height: 80, margin: '4px 0' }}
        tooltip={{ formatter: v => v }}
      />
      <InputNumber
        min={0}
        max={255}
        value={value}
        disabled={disabled}
        size="small"
        onChange={v => { onChange(v ?? 0); onRelease(v ?? 0) }}
        style={{ width: 48, fontSize: 10 }}
        controls={false}
      />
    </div>
  )
}
