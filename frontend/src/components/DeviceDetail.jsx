import { Tabs, Typography } from 'antd'
import ParamGroups from './ParamGroups'
import Monitor from './Monitor'
import DeviceInfo from './DeviceInfo'
import ControlPanel from './ControlPanel'
import BackupRestore from './BackupRestore'

export default function DeviceDetail({ device, modbusConnected }) {
  const items = [
    {
      key: 'params',
      label: 'Параметры',
      children: <ParamGroups device={device} modbusConnected={modbusConnected} />,
    },
    {
      key: 'monitor',
      label: 'Монитор',
      children: <Monitor device={device} modbusConnected={modbusConnected} />,
    },
    {
      key: 'info',
      label: 'Устройство',
      children: <DeviceInfo device={device} />,
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: device.description ? 4 : 16 }}>
            {device.name}
          </Typography.Title>
          {device.description && (
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              {device.description}
            </Typography.Text>
          )}
        </div>
        {/*<BackupRestore device={device} modbusConnected={modbusConnected} />*/}
      </div>
      <ControlPanel device={device} modbusConnected={modbusConnected} />
      <Tabs items={items} defaultActiveKey="params" />
    </div>
  )
}
