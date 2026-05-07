import { useRef, useState, useEffect, useMemo, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text, Stars, Environment } from '@react-three/drei'
import * as THREE from 'three'
import { Button, Tag, Spin } from 'antd'
import { PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons'
import socket from '../../socket'

// ─── Вода ─────────────────────────────────────────────────────────────────────

function WaterSurface() {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.material.opacity = 0.65 + Math.sin(clock.elapsedTime * 1.8) * 0.08
    }
  })
  return (
    <mesh ref={ref} position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[2.88, 72]} />
      <meshStandardMaterial color="#0d5a82" transparent opacity={0.7} roughness={0.05} metalness={0.4} />
    </mesh>
  )
}

// ─── Бассейн ──────────────────────────────────────────────────────────────────

function Pool() {
  return (
    <group>
      {/* Дно */}
      <mesh position={[0, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.9, 64]} />
        <meshStandardMaterial color="#0e2030" roughness={0.9} />
      </mesh>
      {/* Стенка бассейна (цилиндр) */}
      <mesh position={[0, -0.3, 0]}>
        <cylinderGeometry args={[3.0, 3.0, 0.5, 72, 1, true]} />
        <meshStandardMaterial color="#1a3a55" roughness={0.7} side={THREE.BackSide} />
      </mesh>
      {/* Бортик — тор */}
      <mesh position={[0, 0, 0]}>
        <torusGeometry args={[3.0, 0.18, 16, 72]} />
        <meshStandardMaterial color="#2a5a7a" roughness={0.4} metalness={0.2} />
      </mesh>
      {/* Верхняя грань бортика */}
      <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.82, 3.18, 72]} />
        <meshStandardMaterial color="#3a7a9a" roughness={0.3} metalness={0.3} />
      </mesh>
      {/* Площадка вокруг */}
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.18, 7.5, 72]} />
        <meshStandardMaterial color="#111c25" roughness={0.95} />
      </mesh>
      {/* Вода */}
      <WaterSurface />
    </group>
  )
}

// ─── Струя воды ───────────────────────────────────────────────────────────────

function WaterJet({ x, z, phase, maxH = 2.2, width = 0.05 }) {
  const scaleRef = useRef()
  const topRef = useRef()
  useFrame(({ clock }) => {
    const h = 0.3 + 0.7 * Math.abs(Math.sin(clock.elapsedTime * 1.1 + phase))
    if (scaleRef.current) scaleRef.current.scale.y = h
    if (topRef.current) {
      topRef.current.position.y = maxH * h
      topRef.current.material.opacity = 0.4 + h * 0.4
    }
  })
  return (
    <group position={[x, 0.02, z]}>
      <group ref={scaleRef}>
        <mesh position={[0, maxH / 2, 0]}>
          <cylinderGeometry args={[width * 0.6, width, maxH, 6]} />
          <meshStandardMaterial color="#8dd8f8" transparent opacity={0.75} />
        </mesh>
      </group>
      <mesh ref={topRef} position={[0, maxH, 0]}>
        <sphereGeometry args={[width * 2.2, 8, 8]} />
        <meshStandardMaterial color="#c8eeff" transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

function CenterJet() {
  const ref = useRef()
  const topRef = useRef()
  useFrame(({ clock }) => {
    const h = 0.7 + 0.3 * Math.sin(clock.elapsedTime * 0.9)
    if (ref.current) ref.current.scale.y = h
    if (topRef.current) topRef.current.position.y = 3.5 * h
  })
  return (
    <group position={[0, 0.05, 0]}>
      <mesh>
        <cylinderGeometry args={[0.06, 0.1, 0.12, 12]} />
        <meshStandardMaterial color="#2a6a8a" metalness={0.6} />
      </mesh>
      <group ref={ref}>
        <mesh position={[0, 1.75, 0]}>
          <cylinderGeometry args={[0.04, 0.09, 3.5, 8]} />
          <meshStandardMaterial color="#aae4ff" transparent opacity={0.8} />
        </mesh>
      </group>
      <mesh ref={topRef} position={[0, 3.5, 0]}>
        <sphereGeometry args={[0.18, 10, 10]} />
        <meshStandardMaterial color="#e0f6ff" transparent opacity={0.65} />
      </mesh>
    </group>
  )
}

// ─── Светильник ───────────────────────────────────────────────────────────────

function Fixture({ position, name, dmxValue, isSelected, onClick }) {
  const bodyRef = useRef()

  const { bodyColor, emissive, lightIntensity } = useMemo(() => {
    if (!dmxValue || dmxValue === 0) {
      return { bodyColor: new THREE.Color('#1e3040'), emissive: new THREE.Color(0, 0, 0), lightIntensity: 0 }
    }
    const t = dmxValue / 255
    const hue = 0.12   // тёплый жёлтый
    const lightness = 0.15 + t * 0.55
    const bodyColor = new THREE.Color().setHSL(hue, 0.9, lightness)
    const emissive = new THREE.Color().setHSL(hue, 1, t * 0.35)
    return { bodyColor, emissive, lightIntensity: t * 4 }
  }, [dmxValue])

  useFrame(({ clock }) => {
    if (bodyRef.current && isSelected) {
      bodyRef.current.rotation.y = clock.elapsedTime * 1.5
    }
  })

  const pct = dmxValue > 0 ? Math.round((dmxValue / 255) * 100) : null

  return (
    <group position={position} onClick={e => { e.stopPropagation(); onClick() }}>
      {/* Основание */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 0.1, 12]} />
        <meshStandardMaterial color="#1a3040" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Корпус */}
      <mesh ref={bodyRef} position={[0, 0.08, 0]}>
        <sphereGeometry args={[0.18, 20, 20]} />
        <meshStandardMaterial
          color={bodyColor}
          emissive={emissive}
          emissiveIntensity={1}
          roughness={0.25}
          metalness={0.5}
        />
      </mesh>
      {/* Линза */}
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshStandardMaterial
          color="white"
          emissive="white"
          emissiveIntensity={lightIntensity > 0 ? 0.8 : 0.05}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* Кольцо выделения */}
      {isSelected && (
        <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.26, 0.025, 8, 32]} />
          <meshStandardMaterial color="#1677ff" emissive="#1677ff" emissiveIntensity={1} />
        </mesh>
      )}
      {/* Точечный свет */}
      {lightIntensity > 0.1 && (
        <pointLight color={bodyColor} intensity={lightIntensity} distance={3.5} decay={2} position={[0, 0.3, 0]} />
      )}
      {/* Метки */}
      <Text position={[0, 0.5, 0]} fontSize={0.13} color={isSelected ? '#69b1ff' : '#778899'} anchorX="center">
        {name.length > 9 ? name.slice(0, 8) + '…' : name}
      </Text>
      {pct !== null && (
        <Text position={[0, -0.3, 0]} fontSize={0.11} color="#faad14" anchorX="center">
          {pct}%
        </Text>
      )}
    </group>
  )
}

// ─── Главная сцена ─────────────────────────────────────────────────────────────

function FountainScene({ fixtures, selectedId, onSelect, dmxValues }) {
  const jetInner = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2
    return { x: Math.cos(a) * 1.0, z: Math.sin(a) * 1.0, phase: i * 0.5, maxH: 1.6, width: 0.04 }
  })
  const jetOuter = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    return { x: Math.cos(a) * 2.0, z: Math.sin(a) * 2.0, phase: i * 0.7 + 1.2, maxH: 1.0, width: 0.035 }
  })
  const fixtureR = 3.38

  return (
    <>
      <color attach="background" args={['#05090f']} />
      <Stars radius={60} depth={30} count={800} factor={3} fade />
      <ambientLight intensity={0.25} color="#1a2a4a" />
      <directionalLight position={[6, 10, 6]} intensity={0.6} color="#ffffff" castShadow />
      <directionalLight position={[-6, 4, -4]} intensity={0.2} color="#4488bb" />

      <Pool />
      <CenterJet />

      {jetInner.map((j, i) => <WaterJet key={'in' + i} {...j} />)}
      {jetOuter.map((j, i) => <WaterJet key={'out' + i} {...j} />)}

      {fixtures.map((f, i) => {
        const a = (i / fixtures.length) * Math.PI * 2 - Math.PI / 2
        return (
          <Fixture
            key={f.id}
            position={[Math.cos(a) * fixtureR, 0.12, Math.sin(a) * fixtureR]}
            name={f.name}
            dmxValue={dmxValues[f.dmxAddress] ?? 0}
            isSelected={selectedId === f.id}
            onClick={() => onSelect(f)}
          />
        )
      })}

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={3}
        maxDistance={22}
        target={[0, 0, 0]}
      />
    </>
  )
}

// ─── Обёртка ──────────────────────────────────────────────────────────────────

export default function OlaFountain3D({ fixtures, selectedId, onSelect, olaAvailable }) {
  const [dmxValues, setDmxValues] = useState({})
  const [monitoring, setMonitoring] = useState(false)

  useEffect(() => {
    socket.on('ola:dmx:data', ({ channels }) => {
      const map = {}
      channels.forEach((v, i) => { map[i + 1] = v })
      setDmxValues(map)
    })
    return () => {
      socket.off('ola:dmx:data')
      if (monitoring) socket.emit('ola:monitor:stop')
    }
  }, [])

  function toggleMonitor() {
    if (monitoring) {
      socket.emit('ola:monitor:stop')
      setMonitoring(false)
    } else {
      const universeId = fixtures[0]?.universeId ?? 1
      socket.emit('ola:monitor:start', { universeId, intervalMs: 100 })
      setMonitoring(true)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{
        padding: '8px 16px',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        background: '#0a0f18',
        borderBottom: '1px solid #1a2a3a',
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
        {monitoring && <Tag color="blue">10 кадров/с · клик по светильнику для выбора</Tag>}
        <Tag color="default" style={{ marginLeft: 'auto', background: 'transparent', color: '#556' }}>
          ЛКМ — вращение · Колесо — зум · ПКМ — панорама
        </Tag>
      </div>

      <div style={{ flex: 1 }}>
        <Suspense fallback={
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#05090f' }}>
            <Spin size="large" />
          </div>
        }>
          <Canvas
            camera={{ position: [0, 6, 10], fov: 50 }}
            style={{ height: '100%', background: '#05090f' }}
            shadows
          >
            <FountainScene
              fixtures={fixtures}
              selectedId={selectedId}
              onSelect={onSelect}
              dmxValues={dmxValues}
            />
          </Canvas>
        </Suspense>
      </div>
    </div>
  )
}
