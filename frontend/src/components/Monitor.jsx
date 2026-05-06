import { useState, useEffect, useRef } from 'react'
import { Button, Card, Row, Col, Statistic, Space, Typography, Alert, Tag, notification } from 'antd'
import { PlayCircleOutlined, PauseCircleOutlined, DownloadOutlined, BellOutlined } from '@ant-design/icons'
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import socket from '../socket'
import { addLog } from '../log'

const MAX_POINTS = 60
const COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#eb2f96', '#722ed1', '#13c2c2', '#faad14', '#f5222d']
const CONDITION_LABEL = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠' }

function evalCondition(value, condition, threshold) {
  switch (condition) {
    case 'gt':  return value > threshold
    case 'gte': return value >= threshold
    case 'lt':  return value < threshold
    case 'lte': return value <= threshold
    case 'eq':  return value === threshold
    case 'neq': return value !== threshold
    default:    return false
  }
}

export default function Monitor({ device, modbusConnected }) {
  const [running, setRunning] = useState(false)
  const [data, setData] = useState({})
  const [history, setHistory] = useState({})
  const [error, setError] = useState(null)
  const [alertStatus, setAlertStatus] = useState({})

  const activeAlertsRef = useRef(new Set())
  const deviceRef = useRef(device)
  useEffect(() => { deviceRef.current = device })

  function getParamName(paramId) {
    for (const group of deviceRef.current.groups) {
      const p = group.params.find(p => p.id === paramId)
      if (p) return p.name
    }
    return paramId
  }

  function checkAlerts(incoming) {
    const alerts = deviceRef.current.alerts ?? []
    if (!alerts.length) return

    const updates = {}
    for (const alert of alerts) {
      const entry = incoming[alert.paramId]
      if (!entry || entry.error || entry.value === undefined) continue

      const fired = evalCondition(entry.value, alert.condition, alert.threshold)
      const wasActive = activeAlertsRef.current.has(alert.id)
      updates[alert.id] = fired

      if (fired && !wasActive) {
        activeAlertsRef.current.add(alert.id)
        const msg = alert.message.replace('{{value}}', Number(entry.value).toFixed(1))
        notification[alert.level]?.({ message: 'Оповещение', description: msg, duration: 0 })
        addLog(alert.level, `Оповещение: ${msg}`)
      } else if (!fired && wasActive) {
        activeAlertsRef.current.delete(alert.id)
        const label = `${getParamName(alert.paramId)} ${CONDITION_LABEL[alert.condition]} ${alert.threshold}`
        addLog('info', `Оповещение снято: ${label}`)
      }
    }
    setAlertStatus(prev => ({ ...prev, ...updates }))
  }

  function clearAlerts() {
    activeAlertsRef.current.clear()
    setAlertStatus({})
  }

  useEffect(() => {
    function onMonitorData({ deviceId, data: incoming }) {
      if (deviceId !== device.id) return
      setData(incoming)
      checkAlerts(incoming)
      const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      setHistory(prev => {
        const next = { ...prev }
        for (const [id, entry] of Object.entries(incoming)) {
          if (entry.error || entry.value === undefined) continue
          const arr = prev[id] ?? []
          next[id] = [...arr.slice(-(MAX_POINTS - 1)), { t: time, v: entry.value }]
        }
        return next
      })
    }
    function onError({ message: msg }) {
      setError(msg)
      addLog('error', `Ошибка мониторинга: ${msg}`)
    }
    socket.on('monitor:data', onMonitorData)
    socket.on('modbus:error', onError)
    return () => {
      socket.off('monitor:data', onMonitorData)
      socket.off('modbus:error', onError)
    }
  }, [device.id])

  useEffect(() => {
    return () => {
      socket.emit('monitor:stop')
      setRunning(false)
      setData({})
      setHistory({})
      clearAlerts()
    }
  }, [device.id])

  function toggle() {
    if (running) {
      socket.emit('monitor:stop')
      setRunning(false)
      setData({})
      setHistory({})
      clearAlerts()
      addLog('info', `Мониторинг остановлен: ${device.name}`)
    } else {
      socket.emit('monitor:start', { deviceId: device.id })
      setRunning(true)
      addLog('info', `Мониторинг запущен: ${device.name}`)
    }
  }

  function exportCsv() {
    const params = monitorParams
    const allTimes = [...new Set(
      params.flatMap(p => (history[p.id] ?? []).map(pt => pt.t))
    )].sort()

    const header = ['Время', ...params.map(p => `${p.id} ${p.unit ? `(${p.unit})` : ''}`.trim())]
    const rows = allTimes.map(t => {
      const row = [t]
      for (const p of params) {
        const pt = (history[p.id] ?? []).find(x => x.t === t)
        row.push(pt !== undefined ? pt.v : '')
      }
      return row
    })

    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n')

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `monitor_${device.id}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    addLog('success', `Экспорт CSV: ${rows.length} строк, ${params.length} параметров`)
  }

  const f0Group = device.groups.find(g => g.id === 'F0')
  const monitorParams = f0Group?.params.filter(p => p.id !== 'F0.00') ?? []
  const configuredAlerts = device.alerts ?? []

  function getErrorText(code) {
    if (!code && code !== 0) return null
    return device.errorCodes?.[String(Math.round(code))] ?? null
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} />
      )}

      <Space align="center" wrap>
        <Button
          type={running ? 'default' : 'primary'}
          icon={running ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          onClick={toggle}
          disabled={!modbusConnected}
          danger={running}
        >
          {running ? 'Остановить мониторинг' : 'Запустить мониторинг'}
        </Button>
        <Button
          icon={<DownloadOutlined />}
          onClick={exportCsv}
          disabled={Object.values(history).every(h => !h?.length)}
        >
          Экспорт CSV
        </Button>
        {!modbusConnected && (
          <Typography.Text type="secondary">Требуется подключение к порту</Typography.Text>
        )}
      </Space>

      {/* Панель пороговых оповещений */}
      {configuredAlerts.length > 0 && (
        <Card
          size="small"
          title={
            <Space>
              <BellOutlined />
              <span>Пороговые оповещения</span>
            </Space>
          }
          styles={{ body: { padding: '8px 12px' } }}
        >
          <Space wrap>
            {configuredAlerts.map(alert => {
              const triggered = alertStatus[alert.id]
              const paramName = getParamName(alert.paramId)
              const condLabel = CONDITION_LABEL[alert.condition] ?? alert.condition
              let color = 'default'
              if (running) {
                if (triggered) color = alert.level === 'error' ? 'error' : 'warning'
                else if (triggered === false) color = 'success'
              }
              return (
                <Tag key={alert.id} color={color} style={{ fontSize: 12 }}>
                  {paramName} {condLabel} {alert.threshold}
                </Tag>
              )
            })}
          </Space>
          {!running && (
            <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              Оповещения активны только во время мониторинга
            </Typography.Text>
          )}
        </Card>
      )}

      {!monitorParams.length && (
        <Typography.Text type="secondary">Нет параметров группы F0 для мониторинга</Typography.Text>
      )}

      <Row gutter={[16, 16]}>
        {monitorParams.map((param, idx) => {
          const entry = data[param.id]
          const hist  = history[param.id] ?? []
          const color = COLORS[idx % COLORS.length]
          const isError = param.id === 'F0.10' && entry?.value
          const errText = isError ? getErrorText(entry.value) : null

          // подсветка если параметр участвует в сработавшем оповещении
          const hasTriggeredAlert = configuredAlerts.some(
            a => a.paramId === param.id && alertStatus[a.id]
          )

          return (
            <Col key={param.id} xs={24} sm={12} md={8} lg={6}>
              <Card
                size="small"
                title={<span style={{ fontSize: 12 }}>{param.name}</span>}
                style={{
                  minHeight: 110,
                  borderColor: hasTriggeredAlert ? '#ff7875' : undefined,
                }}
                styles={{ body: { paddingBottom: 8 } }}
              >
                {entry?.error ? (
                  <Typography.Text type="danger" style={{ fontSize: 12 }}>
                    {entry.error}
                  </Typography.Text>
                ) : (
                  <>
                    <Statistic
                      value={entry?.value ?? '—'}
                      suffix={param.unit}
                      precision={param.type === 'float' ? 2 : 0}
                      valueStyle={{
                        fontSize: 18,
                        color: (isError && entry?.value !== 0) || hasTriggeredAlert
                          ? '#ff4d4f'
                          : entry ? color : '#bbb',
                      }}
                    />

                    {errText && entry?.value !== 0 && (
                      <Tag color="error" style={{ marginTop: 4, fontSize: 11, whiteSpace: 'normal' }}>
                        {errText}
                      </Tag>
                    )}
                    {isError && entry?.value === 0 && (
                      <Tag color="success" style={{ marginTop: 4, fontSize: 11 }}>Нет ошибки</Tag>
                    )}

                    {hist.length > 1 && (
                      <ResponsiveContainer width="100%" height={36}>
                        <LineChart data={hist}>
                          <YAxis domain={['auto', 'auto']} hide />
                          <Tooltip
                            formatter={v => [`${Number(v).toFixed(param.type === 'float' ? 2 : 0)} ${param.unit ?? ''}`, param.name]}
                            labelFormatter={l => `Время: ${l}`}
                            contentStyle={{ fontSize: 11 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="v"
                            stroke={hasTriggeredAlert ? '#ff4d4f' : color}
                            dot={false}
                            strokeWidth={1.5}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </>
                )}
              </Card>
            </Col>
          )
        })}
      </Row>
    </Space>
  )
}
