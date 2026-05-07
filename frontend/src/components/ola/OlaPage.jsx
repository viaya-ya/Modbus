import { useState, useEffect } from 'react'
import { Layout, Typography, Tabs, Tag, Empty } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import socket from '../../socket'
import OlaFixtureList from './OlaFixtureList'
import OlaFixtureDetail from './OlaFixtureDetail'
import OlaDmxMixer from './OlaDmxMixer'
import OlaSettings from './OlaSettings'
import OlaFountainView from './OlaFountainView'
import OlaFountain3D from './OlaFountain3D'

const { Sider, Content } = Layout

const STORAGE_KEY = 'ola_fixtures'

function loadFixtures() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export default function OlaPage() {
  const [olaStatus, setOlaStatus] = useState({ available: false, config: { host: 'localhost', port: 9090 } })
  const [fixtures, setFixtures] = useState(loadFixtures)
  const [selectedFixture, setSelectedFixture] = useState(null)
  const [activeTab, setActiveTab] = useState('fixtures')

  useEffect(() => {
    socket.on('ola:status', s => setOlaStatus(s))
    socket.emit('ola:ping')
    return () => socket.off('ola:status')
  }, [])

  const tabs = [
    {
      key: 'fixtures',
      label: 'Светильники',
      children: (
        <Layout style={{ height: '100%' }}>
          <Sider
            width={260}
            style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}
          >
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
              <Typography.Text strong style={{ fontSize: 12, color: '#666' }}>
                СВЕТИЛЬНИКИ
              </Typography.Text>
            </div>
            <OlaFixtureList
              fixtures={fixtures}
              onChange={setFixtures}
              selectedId={selectedFixture?.id}
              onSelect={setSelectedFixture}
              olaAvailable={olaStatus.available}
            />
          </Sider>
          <Content style={{ overflowY: 'auto', background: '#fafafa' }}>
            {selectedFixture ? (
              <OlaFixtureDetail fixture={selectedFixture} />
            ) : (
              <Empty
                description="Выберите светильник или добавьте новый"
                style={{ marginTop: 80 }}
              />
            )}
          </Content>
        </Layout>
      ),
    },
    {
      key: 'fountain3d',
      label: '3D Фонтан',
      children: (
        <div style={{ height: '100%' }}>
          <OlaFountain3D
            fixtures={fixtures}
            selectedId={selectedFixture?.id}
            onSelect={f => { setSelectedFixture(f); setActiveTab('fixtures') }}
            olaAvailable={olaStatus.available}
          />
        </div>
      ),
    },
    {
      key: 'fountain',
      label: 'Схема (2D)',
      children: (
        <div style={{ height: '100%' }}>
          <OlaFountainView
            fixtures={fixtures}
            selectedId={selectedFixture?.id}
            onSelect={f => { setSelectedFixture(f); setActiveTab('fixtures') }}
            olaAvailable={olaStatus.available}
          />
        </div>
      ),
    },
    {
      key: 'dmx',
      label: 'DMX Микшер',
      children: (
        <div style={{ overflowY: 'auto', height: '100%' }}>
          <OlaDmxMixer olaAvailable={olaStatus.available} />
        </div>
      ),
    },
    {
      key: 'settings',
      label: 'Настройки OLA',
      children: <OlaSettings />,
    },
  ]

  return (
    <Layout style={{ height: '100%' }}>
      <div
        style={{
          padding: '0 24px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <Typography.Text strong>OLA / DMX</Typography.Text>
        {olaStatus.available ? (
          <Tag icon={<CheckCircleOutlined />} color="success">Демон доступен</Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">Демон недоступен</Tag>
        )}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabs.map(t => ({ key: t.key, label: t.label }))}
          style={{ marginBottom: 0 }}
          tabBarStyle={{ marginBottom: 0 }}
        />
      </div>
      <Content style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tabs.find(t => t.key === activeTab)?.children}
      </Content>
    </Layout>
  )
}
