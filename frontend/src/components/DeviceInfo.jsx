import { Image, Card, Row, Col, Empty, Typography } from 'antd'
import { PictureOutlined } from '@ant-design/icons'

const PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjVmNWY1Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiNiYmIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7QndC10YIg0YTQvtGC0L7QszwvdGV4dD48L3N2Zz4='

function DeviceImageCard({ title, src }) {
  return (
    <Card
      size="small"
      title={
        <Typography.Text>
          <PictureOutlined style={{ marginRight: 8 }} />
          {title}
        </Typography.Text>
      }
    >
      <Image
        src={src}
        alt={title}
        fallback={PLACEHOLDER}
        style={{ width: '100%', maxHeight: 380, objectFit: 'contain' }}
        preview={{ mask: 'Увеличить' }}
      />
    </Card>
  )
}

export default function DeviceInfo({ device }) {
  const deviceImg = device.images?.device
  const wiringImg = device.images?.wiring

  if (!deviceImg && !wiringImg) {
    return (
      <Empty
        description="Фотографии не добавлены. Положите файлы в папку devices/images/ и укажите их в JSON."
        style={{ marginTop: 60 }}
      />
    )
  }

  return (
    <Row gutter={[24, 24]}>
      {deviceImg && (
        <Col xs={24} md={wiringImg ? 12 : 16}>
          <DeviceImageCard
            title="Фото устройства"
            src={`/api/devices/images/${deviceImg}`}
          />
        </Col>
      )}
      {wiringImg && (
        <Col xs={24} md={deviceImg ? 12 : 16}>
          <DeviceImageCard
            title="Схема подключения"
            src={`/api/devices/images/${wiringImg}`}
          />
        </Col>
      )}
    </Row>
  )
}
