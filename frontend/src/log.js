import { useState, useEffect } from 'react'

let _entries = []
const _listeners = new Set()

export function addLog(level, message) {
  const entry = {
    id: Date.now() + '-' + Math.random(),
    time: new Date().toLocaleTimeString('ru-RU'),
    level, // 'info' | 'success' | 'error' | 'warning'
    message,
  }
  _entries = [entry, ..._entries].slice(0, 500)
  _listeners.forEach(fn => fn(_entries))
}

export function clearLog() {
  _entries = []
  _listeners.forEach(fn => fn([]))
}

export function useLog() {
  const [entries, setEntries] = useState(_entries)
  useEffect(() => {
    setEntries(_entries)
    _listeners.add(setEntries)
    return () => _listeners.delete(setEntries)
  }, [])
  return entries
}
