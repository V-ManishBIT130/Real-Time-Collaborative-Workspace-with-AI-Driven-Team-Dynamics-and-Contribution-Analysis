import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const certPath = path.resolve(__dirname, '.cert/cert.pem')
const httpsConfig = fs.existsSync(certPath)
  ? {
      key: fs.readFileSync(certPath),
      cert: fs.readFileSync(certPath),
    }
  : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Expose on local network (0.0.0.0)
    port: 5173,
    // Allow tunnel hostnames (localtunnel, cloudflare, ngrok)
    allowedHosts: true,
    // When tunneling, the tunnel provides public HTTPS, so local server runs plain HTTP
    https: process.env.HTTPS === 'true' && httpsConfig ? httpsConfig : undefined,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
        secure: false,
      }
    }
  },
})