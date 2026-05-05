import { Tabs, Typography } from 'antd'
import ParamGroups from './ParamGroups'
import Monitor from './Monitor'

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
  ]

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {device.name}
      </Typography.Title>
      {device.description && (
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          {device.description}
        </Typography.Text>
      )}
      <Tabs items={items} defaultActiveKey="params" />
    </div>
  )
}
