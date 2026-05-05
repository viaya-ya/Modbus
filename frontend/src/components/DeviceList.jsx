import { List, Typography, Badge } from 'antd'
import { LinkOutlined, DisconnectOutlined } from '@ant-design/icons'

export default function DeviceList({ devices, selectedId, onSelect, connected }) {
  if (!devices.length) {
    return (
      <Typography.Text type="secondary" style={{ display: 'block', padding: '16px' }}>
        Нет устройств
      </Typography.Text>
    )
  }

  const Icon = connected ? LinkOutlined : DisconnectOutlined
  const iconColor = connected ? '#52c41a' : '#ff4d4f'

  return (
    <List
      dataSource={devices}
      renderItem={device => (
        <List.Item
          onClick={() => onSelect(device)}
          style={{
            cursor: 'pointer',
            padding: '12px 16px',
            background: selectedId === device.id ? '#e6f4ff' : 'transparent',
            borderLeft: selectedId === device.id ? '3px solid #1677ff' : '3px solid transparent',
          }}
        >
          <List.Item.Meta
            avatar={
              <Badge dot status={connected ? 'success' : 'error'} offset={[-2, 2]}>
                <Icon style={{ fontSize: 20, color: iconColor, marginTop: 2 }} />
              </Badge>
            }
            title={<span style={{ fontSize: 13 }}>{device.name}</span>}
            description={
              <span style={{ fontSize: 12 }}>
                {device.description ?? device.connection.protocol}
              </span>
            }
          />
        </List.Item>
      )}
    />
  )
}
