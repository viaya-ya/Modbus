import { List, Typography } from 'antd'
import { ApiOutlined } from '@ant-design/icons'

export default function DeviceList({ devices, selectedId, onSelect }) {
  if (!devices.length) {
    return (
      <Typography.Text type="secondary" style={{ display: 'block', padding: '16px' }}>
        Нет устройств
      </Typography.Text>
    )
  }

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
            avatar={<ApiOutlined style={{ fontSize: 20, color: '#1677ff', marginTop: 2 }} />}
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
