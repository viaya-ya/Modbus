export function isParamWritable(device, param) {
  if (device?.access_legend) {
    const description = device.access_legend[param.access]
    if (description === undefined) return false
    return !description.includes('только чтение')
  }
  return param.access === 'read-write'
}

// true если параметр можно писать только при остановленном ПЧ (access = "X")
export function isStopOnly(device, param) {
  if (!device?.access_legend) return false
  const description = device.access_legend[param.access]
  return !!description?.includes('только во время остановки')
}
