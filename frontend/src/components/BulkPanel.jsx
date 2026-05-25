import { useState } from 'react'
import { Button, Space, Typography, Tag, Popconfirm, Progress, message } from 'antd'
import { DownloadOutlined, RollbackOutlined, CloseOutlined } from '@ant-design/icons'
import api from '../api'
import ParamGroups from './ParamGroups'
import { isParamWritable } from '../access'

export default function BulkPanel({ devices, modbusConnected, onDeselect }) {
  const [progress, setProgress] = useState(null)

  async function readAll() {
    const ops = devices.flatMap(d => d.groups.flatMap(g => g.params.map(p => ({ device: d, param: p }))))
    setProgress({ done: 0, total: ops.length })
    let done = 0
    for (const { device, param } of ops) {
      try { await api.post('/modbus/read', { deviceId: device.id, paramId: param.id }) } catch {}
      setProgress({ done: ++done, total: ops.length })
    }
    setProgress(null)
    message.success(`Прочитано со всех ${devices.length} устройств`)
  }

  async function resetAll() {
    const ops = devices.flatMap(d =>
      d.groups.flatMap(g =>
        g.params
          .filter(p => isParamWritable(d, p) && p.default != null)
          .map(p => ({ device: d, param: p }))
      )
    )
    if (ops.length === 0) { message.info('Нет параметров с заводскими значениями'); return }
    setProgress({ done: 0, total: ops.length })
    let done = 0
    for (const { device, param } of ops) {
      try { await api.post('/modbus/write', { deviceId: device.id, paramId: param.id, value: param.default }) } catch {}
      setProgress({ done: ++done, total: ops.length })
    }
    setProgress(null)
    message.success(`Сброшено на ${devices.length} устройствах`)
  }

  async function handleBulkWrite(paramId, value) {
    let ok = 0
    for (const device of devices) {
      try {
        await api.post('/modbus/write', { deviceId: device.id, paramId, value })
        ok++
      } catch {}
    }
    message.success(`Записано на ${ok} из ${devices.length} устройств`)
  }

  async function handleBulkReadGroup(group) {
    let ok = 0
    for (const device of devices) {
      for (const param of group.params) {
        try { await api.post('/modbus/read', { deviceId: device.id, paramId: param.id }); ok++ } catch {}
      }
    }
    message.success(`Группа ${group.id} прочитана на ${devices.length} устройствах`)
  }

  async function handleBulkResetGroup(group) {
    const toWrite = group.params.filter(p => isParamWritable(devices[0], p) && p.default != null)
    if (toWrite.length === 0) { message.info('Нет параметров с заводскими значениями'); return }
    let ok = 0
    for (const device of devices) {
      for (const param of toWrite) {
        try { await api.post('/modbus/write', { deviceId: device.id, paramId: param.id, value: param.default }); ok++ } catch {}
      }
    }
    message.success(`Группа ${group.id} сброшена на ${devices.length} устройствах`)
  }

  const busy = !!progress
  const percent = progress ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Typography.Text strong>Выбрано:</Typography.Text>
        <Space wrap size={4}>
          {devices.map(d => (
            <Tag
              key={d.id}
              color="blue"
              closable
              closeIcon={<CloseOutlined />}
              onClose={() => onDeselect(d.id)}
            >
              {d.name} · ID {d.connection.slaveId}
            </Tag>
          ))}
        </Space>
        <Space style={{ marginLeft: 'auto' }}>
          <Button
            icon={<DownloadOutlined />}
            disabled={!modbusConnected || busy}
            loading={busy}
            onClick={readAll}
          >
            Прочитать все
          </Button>
          <Popconfirm
            title="Сброс до заводских"
            description={`Записать заводские значения на все ${devices.length} выбранных устройства?`}
            okText="Сбросить"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
            onConfirm={resetAll}
          >
            <Button icon={<RollbackOutlined />} danger disabled={!modbusConnected || busy}>
              Сбросить до заводских
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {progress && (
        <Progress
          percent={percent}
          status="active"
          format={() => `${progress.done} / ${progress.total}`}
          style={{ marginBottom: 16 }}
        />
      )}

      <ParamGroups
        device={devices[0]}
        modbusConnected={modbusConnected && !busy}
        onWrite={handleBulkWrite}
        onReadGroup={handleBulkReadGroup}
        onResetGroup={handleBulkResetGroup}
      />
    </div>
  )
}
