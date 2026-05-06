import { List, Typography, Badge, Avatar, Tag } from 'antd'
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
      renderItem={device => {
        const avatar = device.images?.device
          ? (
            <Badge dot status={connected ? 'success' : 'error'} offset={[-4, 4]}>
              <Avatar
                src={`/api/devices/images/${device.images.device}`}
                size={36}
                shape="square"
                style={{ borderRadius: 6 }}
              />
            </Badge>
          )
          : (
            <Badge dot status={connected ? 'success' : 'error'} offset={[-2, 2]}>
              <Icon style={{ fontSize: 20, color: iconColor, marginTop: 2 }} />
            </Badge>
          )

        return (
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
              avatar={avatar}
              title={<span style={{ fontSize: 13 }}>{device.name}</span>}
              description={
                <span style={{ fontSize: 12 }}>
                  <Tag style={{ fontSize: 11, padding: '0 4px', marginRight: 4 }}>
                    ID {device.connection.slaveId ?? 1}
                  </Tag>
                  {device.description ?? device.connection.protocol}
                </span>
              }
            />
          </List.Item>
        )
      }}
    />
  )
}
