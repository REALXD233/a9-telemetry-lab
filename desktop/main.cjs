const { app, BrowserWindow, Menu } = require('electron')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.traineddata': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

let staticServer = null

function startStaticServer() {
  const root = path.resolve(__dirname, '..', 'dist')
  return new Promise((resolve, reject) => {
    staticServer = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname)
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
      const filePath = path.resolve(root, relative)
      if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end('Forbidden')
        return
      }
      fs.readFile(filePath, (error, data) => {
        if (error) {
          response.writeHead(404).end('Not found')
          return
        }
        response.writeHead(200, {
          'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
          'Cross-Origin-Resource-Policy': 'same-origin',
        })
        response.end(data)
      })
    })
    staticServer.once('error', reject)
    staticServer.listen(0, '127.0.0.1', () => resolve(staticServer.address().port))
  })
}

async function createWindow() {
  const port = await startStaticServer()
  Menu.setApplicationMenu(null)
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 980,
    minHeight: 700,
    backgroundColor: '#08090a',
    title: 'A9 Telemetry Lab',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  await window.loadURL(`http://127.0.0.1:${port}/`)
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', () => staticServer?.close())
