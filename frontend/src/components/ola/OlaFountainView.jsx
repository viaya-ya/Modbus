import { useState, useEffect, useRef } from 'react'
import { Button, Tooltip, Tag } from 'antd'
import { PlayCircleOutlined, PauseCircleOutlined, EditOutlined } from '@ant-design/icons'
import socket from '../../socket'

const W = 580
const H = 580
const CX = W / 2
const CY = H / 2
const POOL_R = 215
const WATER_R = 160
const FIXTURE_RING_R = 192
const JET_COUNT = 16

const POSITIONS_KEY = 'ola_fixture_positions'

function loadPositions() {
  try { return JSON.parse(localStorage.getItem(POSITIONS_KEY) || '{}') } catch { return {} }
}
function savePositions(p) { localStorage.setItem(POSITIONS_KEY, JSON.stringify(p)) }

function defaultPos(index, total) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2
  return { x: CX + FIXTURE_RING_R * Math.cos(angle), y: CY + FIXTURE_RING_R * Math.sin(angle) }
}

function dmxToStyle(dmx) {
  if (!dmx || dmx === 0) return { fill: '#2a3a4a', lens: 0.15, glow: null }
  const t = dmx / 255
  const l = 20 + t * 55
  const fill = `hsl(45, 95%, ${l}%)`
  return {
    fill,
    lens: 0.5 + t * 0.5,
    glow: `drop-shadow(0 0 ${3 + t * 10}px hsl(45, 100%, 65%))`,
  }
}

export default function OlaFountainView({ fixtures, selectedId, onSelect, olaAvailable }) {
  const [positions, setPositions] = useState(loadPositions)
  const [dmxValues, setDmxValues] = useState({})
  const [monitoring, setMonitoring] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [dragging, setDragging] = useState(null)
  const [tick, setTick] = useState(0)
  const svgRef = useRef()
  const posRef = useRef(positions)

  useEffect(() => { posRef.current = positions }, [positions])

  // Анимация воды
  useEffect(() => {
    const t = setInterval(() => setTick(n => (n + 1) % 120), 40)
    return () => clearInterval(t)
  }, [])

  // Данные DMX для раскраски светильников
  useEffect(() => {
    socket.on('ola:dmx:data', ({ channels }) => {
      const map = {}
      channels.forEach((v, i) => { map[i + 1] = v })
      setDmxValues(map)
    })
    return () => socket.off('ola:dmx:data')
  }, [])

  function toggleMonitor() {
    if (monitoring) {
      socket.emit('ola:monitor:stop')
      setMonitoring(false)
    } else {
      const universeId = fixtures[0]?.universeId ?? 1
      socket.emit('ola:monitor:start', { universeId, intervalMs: 200 })
      setMonitoring(true)
    }
  }

  // Drag — начало
  function onMouseDown(e, fixtureId) {
    if (!editMode) return
    e.preventDefault()
    e.stopPropagation()
    const rect = svgRef.current.getBoundingClientRect()
    const sx = W / rect.width
    const sy = H / rect.height
    const idx = fixtures.findIndex(f => f.id === fixtureId)
    const pos = posRef.current[fixtureId] || defaultPos(idx, fixtures.length)
    setDragging({
      fixtureId,
      ox: (e.clientX - rect.left) * sx - pos.x,
      oy: (e.clientY - rect.top) * sy - pos.y,
    })
  }

  function onMouseMove(e) {
    if (!dragging) return
    const rect = svgRef.current.getBoundingClientRect()
    const sx = W / rect.width
    const sy = H / rect.height
    const x = Math.max(16, Math.min(W - 16, (e.clientX - rect.left) * sx - dragging.ox))
    const y = Math.max(16, Math.min(H - 16, (e.clientY - rect.top) * sy - dragging.oy))
    const next = { ...posRef.current, [dragging.fixtureId]: { x, y } }
    posRef.current = next
    setPositions({ ...next })
  }

  function onMouseUp() {
    if (dragging) { savePositions(posRef.current); setDragging(null) }
  }

  // Генерация струй воды
  function renderJets() {
    return Array.from({ length: JET_COUNT }, (_, i) => {
      const baseAngle = (i / JET_COUNT) * Math.PI * 2
      const phase = ((tick + i * (120 / JET_COUNT)) % 120) / 120
      const h = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2)
      const r = 18 + WATER_R * h
      const opacity = 0.25 + h * 0.55
      const width = 1.5 + h * 3
      return (
        <line
          key={i}
          x1={CX + 18 * Math.cos(baseAngle)}
          y1={CY + 18 * Math.sin(baseAngle)}
          x2={CX + r * Math.cos(baseAngle)}
          y2={CY + r * Math.sin(baseAngle)}
          stroke={`rgba(150, 220, 255, ${opacity})`}
          strokeWidth={width}
          strokeLinecap="round"
        />
      )
    })
  }

  // Блики на воде
  function renderRipples() {
    return Array.from({ length: 4 }, (_, i) => {
      const phase = ((tick + i * 30) % 120) / 120
      const r = 20 + phase * (WATER_R - 20)
      return (
        <circle
          key={i}
          cx={CX} cy={CY} r={r}
          fill="none"
          stroke={`rgba(150, 220, 255, ${0.12 * (1 - phase)})`}
          strokeWidth={1}
        />
      )
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Тулбар */}
      <div style={{
        padding: '8px 16px',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        borderBottom: '1px solid #1a2a3a',
        background: '#0d1520',
      }}>
        <Button
          size="small"
          icon={monitoring ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          onClick={toggleMonitor}
          disabled={!olaAvailable || fixtures.length === 0}
          type={monitoring ? 'default' : 'primary'}
        >
          {monitoring ? 'Стоп монитор' : 'Монитор яркости'}
        </Button>
        <Tooltip title="Перетаскивайте светильники на схеме для расстановки">
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => setEditMode(v => !v)}
            type={editMode ? 'primary' : 'default'}
          >
            {editMode ? 'Готово' : 'Расставить'}
          </Button>
        </Tooltip>
        {editMode && <Tag color="orange">Перетаскивайте светильники</Tag>}
        {monitoring && <Tag color="blue">Яркость обновляется 5 раз/с</Tag>}
        {fixtures.length === 0 && (
          <Tag color="default">Добавьте светильники во вкладке «Светильники»</Tag>
        )}
      </div>

      {/* Холст */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#060d14',
        overflow: 'hidden',
      }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: '100%', maxWidth: 600, maxHeight: 600, userSelect: 'none' }}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <defs>
            <radialGradient id="poolFill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1a4a6a" />
              <stop offset="70%" stopColor="#0a2a40" />
              <stop offset="100%" stopColor="#051520" />
            </radialGradient>
            <radialGradient id="deckFill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1e3040" />
              <stop offset="100%" stopColor="#0f1e2a" />
            </radialGradient>
            <filter id="softBlur">
              <feGaussianBlur stdDeviation="2" />
            </filter>
          </defs>

          {/* Декоративная площадка вокруг бассейна */}
          <circle cx={CX} cy={CY} r={POOL_R + 22} fill="url(#deckFill)" />
          <circle cx={CX} cy={CY} r={POOL_R + 22} fill="none" stroke="#1a3a50" strokeWidth={2} />

          {/* Бортик */}
          <circle cx={CX} cy={CY} r={POOL_R} fill="#12202e" stroke="#2a5a7a" strokeWidth={6} />
          <circle cx={CX} cy={CY} r={POOL_R - 5} fill="none" stroke="#1a3a50" strokeWidth={1.5} />

          {/* Вода */}
          <circle cx={CX} cy={CY} r={POOL_R - 8} fill="url(#poolFill)" />

          {/* Круги ряби */}
          {renderRipples()}

          {/* Струи */}
          {renderJets()}

          {/* Центральная форсунка */}
          <circle cx={CX} cy={CY} r={16} fill="#0f2030" stroke="#2a6a8a" strokeWidth={2} />
          <circle cx={CX} cy={CY} r={8} fill="#1a4a6a" />
          <circle cx={CX} cy={CY} r={4} fill="#93d2ff" opacity={0.9} />
          {/* Верхняя струя */}
          {Array.from({ length: 3 }, (_, i) => {
            const phase = ((tick + i * 40) % 120) / 120
            const h = 0.6 + 0.4 * Math.sin(phase * Math.PI * 2)
            return (
              <ellipse
                key={i}
                cx={CX}
                cy={CY - 30 * h - i * 8}
                rx={2 - i * 0.5}
                ry={3 + h * 5}
                fill={`rgba(150, 220, 255, ${0.6 - i * 0.15})`}
              />
            )
          })}

          {/* Светильники */}
          {fixtures.map((f, i) => {
            const pos = positions[f.id] || defaultPos(i, fixtures.length)
            const dmx = dmxValues[f.dmxAddress] ?? 0
            const { fill, lens, glow } = dmxToStyle(dmx)
            const isSelected = selectedId === f.id
            const pct = dmx > 0 ? Math.round((dmx / 255) * 100) : null

            return (
              <g
                key={f.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{
                  cursor: editMode ? 'grab' : 'pointer',
                  filter: glow ?? undefined,
                }}
                onMouseDown={e => onMouseDown(e, f.id)}
                onClick={() => !editMode && onSelect(f)}
              >
                {/* Ореол яркости */}
                {dmx > 40 && (
                  <circle r={22} fill={fill} opacity={0.08} filter="url(#softBlur)" />
                )}
                {/* Кольцо выделения */}
                {isSelected && (
                  <circle
                    r={18}
                    fill="none"
                    stroke="#1677ff"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                  />
                )}
                {/* Корпус */}
                <circle
                  r={13}
                  fill={fill}
                  stroke={isSelected ? '#4096ff' : 'rgba(255,255,255,0.2)'}
                  strokeWidth={isSelected ? 2 : 1}
                />
                {/* Линза */}
                <circle r={5} fill="white" opacity={lens} />
                {/* Блик на линзе */}
                <circle r={2} cx={-1.5} cy={-1.5} fill="white" opacity={lens * 0.6} />

                {/* Метка с процентом яркости */}
                {pct !== null && (
                  <text
                    y={-20}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight="bold"
                    fill="#faad14"
                    style={{ pointerEvents: 'none' }}
                  >
                    {pct}%
                  </text>
                )}

                {/* Название */}
                <text
                  y={26}
                  textAnchor="middle"
                  fontSize={9}
                  fill={isSelected ? '#69b1ff' : '#8899aa'}
                  style={{ pointerEvents: 'none' }}
                >
                  {f.name.length > 11 ? f.name.slice(0, 10) + '…' : f.name}
                </text>

                {/* DMX адрес */}
                <text
                  y={36}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#445566"
                  style={{ pointerEvents: 'none' }}
                >
                  DMX {f.dmxAddress ?? '?'}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
