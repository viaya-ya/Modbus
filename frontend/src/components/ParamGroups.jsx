import { Collapse } from 'antd'
import ParamRow from './ParamRow'

export default function ParamGroups({ device, modbusConnected }) {
  const items = device.groups.map(group => ({
    key: group.id,
    label: `${group.id} — ${group.name}`,
    children: group.params.map(param => (
      <ParamRow
        key={param.id}
        device={device}
        param={param}
        modbusConnected={modbusConnected}
      />
    )),
  }))

  return <Collapse items={items} defaultActiveKey={[device.groups[0]?.id]} />
}
