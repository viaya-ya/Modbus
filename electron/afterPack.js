const fs = require('fs')
const path = require('path')

module.exports = async function afterPack(context) {
  const resourcesPath = path.join(context.appOutDir, 'resources')
  const src  = path.join(__dirname, '..', 'backend', 'node_modules')
  const dest = path.join(resourcesPath, 'backend', 'node_modules')

  console.log('[afterPack] Copying backend/node_modules →', dest)
  fs.cpSync(src, dest, { recursive: true })
  console.log('[afterPack] Done')
}
