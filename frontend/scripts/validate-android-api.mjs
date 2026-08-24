const apiBase = process.env.VITE_API_BASE_URL?.trim()

if (!apiBase) {
  console.error('缺少 VITE_API_BASE_URL。Android 构建必须显式指定受信 HTTPS 后端，例如 https://example.com/api。')
  process.exit(1)
}

let url
try {
  url = new URL(apiBase)
} catch {
  console.error('VITE_API_BASE_URL 不是有效 URL。')
  process.exit(1)
}

const placeholderHosts = new Set(['example.com', 'api.example.com', 'example.invalid', 'localhost'])
if (url.protocol !== 'https:' || placeholderHosts.has(url.hostname)) {
  console.error('Android 构建只接受真实的 HTTPS 后端地址，不能使用 HTTP、localhost 或示例域名。')
  process.exit(1)
}

console.log(`Android API 地址校验通过：${url.origin}${url.pathname.replace(/\/$/, '')}`)
