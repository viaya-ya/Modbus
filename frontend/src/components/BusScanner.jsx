import { useState, useEffect } from 'react'
import {
  Button, Modal, InputNumber, Progress, Space,
  Tag, Typography, Alert, Row, Col, Divider, Tooltip, List, Spin,
} from 'antd'
import { ApartmentOutlined, CloseCircleOutlined, PlusCircleOutlined, CheckCircleOutlined, ExclamationCircleOutlined, LoadingOutlined, InfoCircleOutlined } from '@ant-design/icons'
import socket from '../socket'
import api from '../api'
import { addLog } from '../log'

export default function BusScanner({ connected }) {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(32)
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [found, setFound] = useState([])
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [identifying, setIdentifying] = useState(false)
  const [identifyResults, setIdentifyResults] = useState([]) // { slaveId, model, deviceId?, name?, error? }
  const [identifyDone, setIdentifyDone] = useState(false)
  const [probeModal, setProbeModal] = useState(null) // { slaveId, loading, data }


  useEffect(() => {
    function onProgress({ current, total: t, found: f }) {
      setProgress(current)
      setTotal(t)
      setFound(f)
    }
    function onDone({ found: f }) {
      setRunning(false)
      setDone(true)
      setFound(f)
      addLog(
        f.length > 0 ? 'success' : 'info',
        f.length > 0
          ? `Сканирование завершено. Найдено ${f.length} устройств: Slave ID ${f.join(', ')}`
          : 'Сканирование завершено. Устройства не найдены.',
      )
    }
    function onError({ message: msg }) {
      setRunning(false)
      setError(msg)
      addLog('error', `Ошибка сканирования шины: ${msg}`)
    }
    function onIdentifyProgress(result) {
      setIdentifyResults(prev => [...prev, result])
    }
    function onIdentifyDone() {
      setIdentifying(false)
      setIdentifyDone(true)
    }

    socket.on('bus:scan:progress', onProgress)
    socket.on('bus:scan:done', onDone)
    socket.on('bus:scan:error', onError)
    socket.on('bus:identify:progress', onIdentifyProgress)
    socket.on('bus:identify:done', onIdentifyDone)
    return () => {
      socket.off('bus:scan:progress', onProgress)
      socket.off('bus:scan:done', onDone)
      socket.off('bus:scan:error', onError)
      socket.off('bus:identify:progress', onIdentifyProgress)
      socket.off('bus:identify:done', onIdentifyDone)
    }
  }, [])

  function handleOpen() {
    setOpen(true)
    reset()
  }

  function reset() {
    setProgress(0)
    setTotal(0)
    setFound([])
    setDone(false)
    setError(null)
    setRunning(false)
    setIdentifying(false)
    setIdentifyResults([])
    setIdentifyDone(false)
  }

  async function handleProbe(slaveId) {
    setProbeModal({ slaveId, loading: true, data: null })
    try {
      const { data } = await api.post('/modbus/probe', { slaveId })
      setProbeModal({ slaveId, loading: false, data })
    } catch (e) {
      setProbeModal({ slaveId, loading: false, data: { error: e?.response?.data?.message ?? e.message } })
    }
  }

  function handleIdentify() {
    setIdentifying(true)
    setIdentifyResults([])
    setIdentifyDone(false)
    socket.emit('bus:identify:start', { slaveIds: found })
    addLog('info', `Определение моделей устройств: Slave ID ${found.join(', ')}`)
  }

  function handleStart() {
    reset()
    setTotal(to - from + 1)
    setRunning(true)
    socket.emit('bus:scan:start', { from, to })
    addLog('info', `Запуск сканирования шины Modbus: адреса ${from}–${to}`)
  }

  function handleCancel() {
    socket.emit('bus:scan:cancel')
    setRunning(false)
    addLog('info', 'Сканирование шины отменено')
  }

  function handleClose() {
    if (running) handleCancel()
    setOpen(false)
  }

  const estSec = Math.ceil((to - from + 1) * 0.15)
  const percent = total > 0 ? Math.round((progress / total) * 100) : 0
  const currentAddr = running && total > 0 ? from + progress - 1 : null

  return (
    <>
      <Tooltip title="Поиск устройств на шине RS-485">
        <Button
          icon={<ApartmentOutlined />}
          disabled={!connected}
          onClick={handleOpen}
          style={{
            background: 'transparent',
            borderColor: '#ffffff40',
            color: connected ? '#fff' : '#ffffff40',
          }}
        >
          Сканер шины
        </Button>
      </Tooltip>

      <Modal
        title={
          <Space>
            <InfoCircleOutlined />
            {`Сырая идентификация — Slave ID ${probeModal?.slaveId}`}
          </Space>
        }
        open={!!probeModal}
        onCancel={() => setProbeModal(null)}
        footer={<Button onClick={() => setProbeModal(null)}>Закрыть</Button>}
        width={600}
        destroyOnHidden
      >
        {probeModal?.loading
          ? <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
          : (
            <pre style={{
              background: '#1a1a1a',
              color: '#d4d4d4',
              padding: 16,
              borderRadius: 6,
              fontSize: 13,
              overflow: 'auto',
              maxHeight: 480,
              margin: 0,
            }}>
              {JSON.stringify(probeModal?.data, null, 2)}
            </pre>
          )
        }
      </Modal>

      <Modal
        title={
          <Space>
            <ApartmentOutlined />
            Сканер Modbus-шины
          </Space>
        }
        open={open}
        onCancel={handleClose}
        footer={null}
        width={500}
        destroyOnHidden={false}
      >
        <Space orientation="vertical" style={{ width: '100%' }} size={16}>

          {/* Настройка диапазона */}
          <Row gutter={12} align="middle">
            <Col>
              <Space>
                <Typography.Text>Адреса с</Typography.Text>
                <InputNumber
                  min={1} max={to - 1} value={from}
                  onChange={v => v && setFrom(v)}
                  disabled={running}
                  style={{ width: 70 }}
                />
                <Typography.Text>по</Typography.Text>
                <InputNumber
                  min={from + 1} max={247} value={to}
                  onChange={v => v && setTo(v)}
                  disabled={running}
                  style={{ width: 70 }}
                />
              </Space>
            </Col>
            <Col>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                ≈ {estSec} сек
              </Typography.Text>
            </Col>
          </Row>

          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Программа последовательно обращается к каждому адресу. Устройство, которое откликнулось — добавляется в список.
          </Typography.Text>

          {/* Прогресс */}
          {(running || done) && (
            <div>
              <Progress
                percent={percent}
                status={running ? 'active' : 'success'}
                format={() =>
                  running
                    ? `${progress} / ${total}`
                    : `${total} адресов проверено`
                }
              />
              {running && currentAddr !== null && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Проверяется адрес {currentAddr}…
                </Typography.Text>
              )}
            </div>
          )}

          {/* Ошибка */}
          {error && <Alert type="error" message={error} showIcon />}

          {/* Результаты */}
          {found.length > 0 && (
            <>
              <Divider style={{ margin: '4px 0' }} />
              <div>
                <Typography.Text strong style={{ marginRight: 8 }}>
                  Найдено {found.length}:
                </Typography.Text>
                <Space wrap size={4}>
                  {found.map(id => (
                    <Space key={id} size={2}>
                      <Tag color="blue" style={{ fontSize: 13, padding: '2px 8px' }}>
                        Slave ID {id}
                      </Tag>
                      <Tooltip title="Сырая идентификация (MEI / FC17)">
                        <Button
                          size="small"
                          type="text"
                          icon={<InfoCircleOutlined />}
                          onClick={() => handleProbe(id)}
                          style={{ color: '#1677ff' }}
                        />
                      </Tooltip>
                    </Space>
                  ))}
                </Space>
              </div>
            </>
          )}

          {done && found.length === 0 && !error && (
            <Space>
              <CloseCircleOutlined style={{ color: '#faad14' }} />
              <Typography.Text type="secondary">
                В диапазоне {from}–{to} устройства не найдены
              </Typography.Text>
            </Space>
          )}

          {/* Identify block */}
          {done && found.length > 0 && !identifying && !identifyDone && (
            <>
              <Divider style={{ margin: '4px 0' }} />
              <Button
                type="primary"
                icon={<PlusCircleOutlined />}
                onClick={handleIdentify}
              >
                Определить и добавить устройства
              </Button>
            </>
          )}

          {(identifying || identifyDone) && identifyResults.length > 0 && (
            <>
              <Divider style={{ margin: '4px 0' }} />
              <List
                size="small"
                dataSource={identifyResults}
                renderItem={r => (
                  <List.Item style={{ padding: '4px 0' }}>
                    <Space>
                      {r.error
                        ? <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                        : <CheckCircleOutlined style={{ color: '#52c41a' }} />
                      }
                      <Tag color="blue">Slave ID {r.slaveId}</Tag>
                      <Tag color={r.model === 'vh' ? 'purple' : r.model === 'pump' ? 'green' : 'orange'}>
                        {r.model === 'unknown' ? 'Неизвестно' : `EMD-${r.model?.toUpperCase()}`}
                      </Tag>
                      {r.name && <Typography.Text strong>{r.name}</Typography.Text>}
                      {r.error && <Typography.Text type="danger" style={{ fontSize: 12 }}>{r.error}</Typography.Text>}
                    </Space>
                  </List.Item>
                )}
              />
              {identifying && (
                <Space>
                  <LoadingOutlined />
                  <Typography.Text type="secondary">Определение устройств...</Typography.Text>
                </Space>
              )}
            </>
          )}

          {/* Кнопки управления */}
          <Space>
            {running ? (
              <Button danger onClick={handleCancel}>
                Отменить сканирование
              </Button>
            ) : (
              <Button type="primary" onClick={handleStart} disabled={!connected}>
                {done ? 'Сканировать снова' : 'Начать сканирование'}
              </Button>
            )}
            <Button onClick={handleClose}>Закрыть</Button>
          </Space>

        </Space>
      </Modal>
    </>
  )
}
