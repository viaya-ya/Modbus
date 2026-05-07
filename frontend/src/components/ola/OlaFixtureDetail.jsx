import { useState, useEffect, useRef } from 'react'
import {
  Card, Button, Descriptions, Tag, Slider, InputNumber, Space, Tooltip,
  Statistic, Row, Col, Divider, Switch, Alert, Typography, Spin,
} from 'antd'
import {
  ReloadOutlined, BulbOutlined, BulbFilled, ThunderboltOutlined, WarningOutlined,
} from '@ant-design/icons'
import socket from '../../socket'

export default function OlaFixtureDetail({ fixture }) {
  const [info, setInfo] = useState(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [identifying, setIdentifying] = useState(false)
  const [polling, setPolling] = useState(false)
  const [pollData, setPollData] = useState(null)
  const [brightness, setBrightness] = useState(null)
  const [settingBrightness, setSettingBrightness] = useState(false)
  const pollTimer = useRef(null)

  useEffect(() => {
    if (!fixture) return
    setInfo(null)
    setPollData(null)
    fetchInfo()

    socket.on('ola:rdm:device-info', ({ uid, device }) => {
      if (uid === fixture.uid) setInfo(device)
    })
    socket.on('ola:rdm:status', data => {
      const dev = data.devices?.find(d => d.uid === fixture.uid)
      if (dev) setPollData(dev)
    })
    socket.on('ola:error', err => {
      setLoadingInfo(false)
      setPolling(false)
    })

    return () => {
      socket.off('ola:rdm:device-info')
      socket.off('ola:rdm:status')
      socket.off('ola:error')
      stopPoll()
    }
  }, [fixture?.id])

  function fetchInfo() {
    if (!fixture?.uid) return
    setLoadingInfo(true)
    socket.emit('ola:rdm:device-info', { universeId: fixture.universeId, uid: fixture.uid })
    setTimeout(() => setLoadingInfo(false), 5000)
  }

  useEffect(() => {
    if (info) setLoadingInfo(false)
  }, [info])

  function startPoll() {
    setPolling(true)
    doPoll()
    pollTimer.current = setInterval(doPoll, 5000)
  }

  function stopPoll() {
    setPolling(false)
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }

  function doPoll() {
    if (!fixture?.uid) return
    socket.emit('ola:rdm:poll', {
      universeId: fixture.universeId,
      expectedUids: [fixture.uid],
    })
  }

  function handleIdentify(on) {
    setIdentifying(on)
    socket.emit('ola:rdm:identify', { universeId: fixture.universeId, uid: fixture.uid, on })
  }

  function handleBrightness(val) {
    if (!fixture) return
    setSettingBrightness(true)
    const dmxVal = Math.round((val / 100) * 255)
    socket.emit('ola:dmx:set-channel', {
      universeId: fixture.universeId,
      channel: fixture.dmxAddress ?? 1,
      value: dmxVal,
    })
    setTimeout(() => setSettingBrightness(false), 500)
  }

  if (!fixture) return null

  const online = pollData?.online ?? null
  const hasUid = !!fixture.uid

  return (
    <div style={{ padding: 16 }}>
      {/* Статус */}
      <Card
        size="small"
        title={
          <Space>
            <BulbFilled style={{ color: '#faad14' }} />
            <span>{fixture.name}</span>
            {online === true && <Tag color="green">Онлайн</Tag>}
            {online === false && <Tag color="red">Офлайн</Tag>}
            {online === null && <Tag color="default">Неизвестно</Tag>}
          </Space>
        }
        extra={
          <Space>
            <Button size="small" icon={<ReloadOutlined />} onClick={fetchInfo} loading={loadingInfo}>
              Инфо
            </Button>
            {hasUid && (
              polling
                ? <Button size="small" danger onClick={stopPoll}>Стоп опрос</Button>
                : <Button size="small" onClick={startPoll}>Опрос каждые 5с</Button>
            )}
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Descriptions size="small" column={2}>
          <Descriptions.Item label="Universe">{fixture.universeId}</Descriptions.Item>
          <Descriptions.Item label="DMX адрес">{fixture.dmxAddress ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="UID" span={2}>{fixture.uid || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* RDM информация */}
      {hasUid && (
        <Card size="small" title="RDM информация" style={{ marginBottom: 16 }}>
          {loadingInfo && !info && <Spin size="small" style={{ margin: 8 }} />}
          {info && (
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="Производитель">{info.manufacturer || '—'}</Descriptions.Item>
              <Descriptions.Item label="Модель">{info.model || '—'}</Descriptions.Item>
              <Descriptions.Item label="Software Ver">{info.software_version || '—'}</Descriptions.Item>
              <Descriptions.Item label="DMX адрес">{info.dmx_start_address ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="DMX каналов">{info.dmx_footprint ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Personaliti">{info.current_personality ?? '—'}</Descriptions.Item>
            </Descriptions>
          )}
          {!loadingInfo && !info && (
            <Typography.Text type="secondary">Нет данных. Нажмите «Инфо» для получения.</Typography.Text>
          )}
        </Card>
      )}

      {/* Телеметрия */}
      {pollData && (
        <Card size="small" title="Телеметрия" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Statistic
                title="Температура"
                value={pollData.temperature ?? '—'}
                suffix={pollData.temperature != null ? '°C' : ''}
                valueStyle={{ color: pollData.temperature > 70 ? '#cf1322' : undefined }}
                prefix={pollData.temperature > 70 ? <WarningOutlined /> : <ThunderboltOutlined />}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Часы лампы"
                value={pollData.lampHours ?? '—'}
                suffix={pollData.lampHours != null ? 'ч' : ''}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="DMX адрес"
                value={pollData.dmxAddress ?? '—'}
              />
            </Col>
          </Row>
        </Card>
      )}

      {/* Управление */}
      <Card size="small" title="Управление DMX">
        <div style={{ marginBottom: 16 }}>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Яркость (канал {fixture.dmxAddress ?? 1})
          </Typography.Text>
          <Space style={{ width: '100%' }}>
            <Slider
              min={0}
              max={100}
              value={brightness ?? 0}
              onChange={setBrightness}
              onChangeComplete={handleBrightness}
              style={{ flex: 1, minWidth: 200 }}
            />
            <InputNumber
              min={0}
              max={100}
              value={brightness ?? 0}
              onChange={v => { setBrightness(v); handleBrightness(v) }}
              suffix="%"
              style={{ width: 80 }}
            />
          </Space>
          {settingBrightness && <Typography.Text type="secondary" style={{ fontSize: 11 }}>Отправка...</Typography.Text>}
        </div>

        {hasUid && (
          <>
            <Divider style={{ margin: '8px 0' }} />
            <div>
              <Typography.Text type="secondary" style={{ marginRight: 8 }}>Идентификация (мигание):</Typography.Text>
              <Switch
                checked={identifying}
                onChange={handleIdentify}
                checkedChildren={<BulbFilled />}
                unCheckedChildren={<BulbOutlined />}
              />
            </div>
          </>
        )}
      </Card>

      {!hasUid && (
        <Alert
          type="info"
          message="RDM функции недоступны"
          description="Укажите UID устройства для использования RDM (телеметрия, идентификация, параметры)."
          style={{ marginTop: 16 }}
          showIcon
        />
      )}
    </div>
  )
}
