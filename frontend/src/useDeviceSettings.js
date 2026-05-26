import { useState, useEffect, useCallback, useRef } from 'react'
import api from './api'

export function useDeviceSettings(deviceId) {
    const [settings, setSettings] = useState(null) // null = ещё не загружено
    const latestRef = useRef({})

    useEffect(() => {
        setSettings(null)
        let cancelled = false

        api.get('/settings')
            .then(({ data }) => {
                if (cancelled) return
                const s = data.deviceSettings?.[deviceId] ?? {}
                latestRef.current = s
                setSettings(s)
            })
            .catch(() => {
                if (cancelled) return
                setSettings({})
            })

        return () => { cancelled = true }
    }, [deviceId])

    const save = useCallback((patch) => {
        latestRef.current = { ...latestRef.current, ...patch }
        api.patch(`/settings/device/${encodeURIComponent(deviceId)}`, patch).catch(() => {})
    }, [deviceId])

    return [settings, save]
}