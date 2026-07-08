import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 端口错开其它本地站（L2A 5191、雅思白皮书 5192），避免回退导致 HMR 错配。
export default defineConfig({
  plugins: [react()],
  server: { port: 5292, strictPort: true },
})
