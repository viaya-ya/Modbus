import { useState, useEffect } from 'react'
import { Layout, Typography, Empty } from 'antd'
import DeviceList from './components/DeviceList'
import DeviceDetail from './components/DeviceDetail'
import ConnectionPanel from './components/ConnectionPanel'
import socket from './socket'
import 'antd/dist/reset.css'
import './App.css'

const { Header, Sider, Content } = Layout

export default function App() {
  const [devices, setDevices] = useState([])
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    socket.on('devices:list', list => setDevices(list))
    socket.on('devices:updated', list => {
      setDevices(list)
      setSelectedDevice(prev =>
        prev ? list.find(d => d.id === prev.id) ?? null : null,
      )
    })
    socket.on('modbus:status', status => setConnected(status.connected))

    return () => {
      socket.off('devices:list')
      socket.off('devices:updated')
      socket.off('modbus:status')
    }
  }, [])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          padding: '0 24px',
          background: '#001529',
        }}
      >
        <Typography.Title level={4} style={{ color: '#fff', margin: 0, whiteSpace: 'nowrap' }}>
          Modbus Controller
        </Typography.Title>
        <ConnectionPanel connected={connected} />
      </Header>

      <Layout>
        <Sider
          width={270}
          style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}
        >
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <Typography.Text strong style={{ fontSize: 13, color: '#666' }}>
              УСТРОЙСТВА
            </Typography.Text>
          </div>
          <DeviceList
            devices={devices}
            selectedId={selectedDevice?.id}
            onSelect={setSelectedDevice}
          />
        </Sider>

        <Content style={{ padding: 24, background: '#fafafa' }}>
          {selectedDevice ? (
            <DeviceDetail device={selectedDevice} modbusConnected={connected} />
          ) : (
            <Empty
              description="Выберите устройство из списка слева"
              style={{ marginTop: 80 }}
            />
          )}
        </Content>
      </Layout>
    </Layout>
  )
}
