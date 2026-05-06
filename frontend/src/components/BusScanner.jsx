import { useState, useEffect } from 'react'
import {
  Button, Modal, InputNumber, Progress, Space,
  Tag, Typography, Alert, Row, Col, Divider, Tooltip,
} from 'antd'
import { ApartmentOutlined, CloseCircleOutlined } from '@ant-design/icons'
import socket from '../socket'
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
    socket.on('bus:scan:progress', onProgress)
    socket.on('bus:scan:done', onDone)
    socket.on('bus:scan:error', onError)
    return () => {
      socket.off('bus:scan:progress', onProgress)
      socket.off('bus:scan:done', onDone)
      socket.off('bus:scan:error', onError)
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
            <ApartmentOutlined />
            Сканер Modbus-шины
          </Space>
        }
        open={open}
        onCancel={handleClose}
        footer={null}
        width={500}
        destroyOnClose={false}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>

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
                    <Tag key={id} color="blue" style={{ fontSize: 13, padding: '2px 8px' }}>
                      Slave ID {id}
                    </Tag>
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
