import express from 'express'
import cors from 'cors'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.server manually (no dotenv dependency needed)
try {
  const envPath = resolve(__dirname, '.env.server')
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (key && !process.env[key]) process.env[key] = val
  }
} catch {
  // .env.server is optional; ANTHROPIC_API_KEY may already be set in the environment
}

const app = express()
app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

app.post('/api/generate-workout', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server' })
  }

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    })

    const data = await upstream.json()

    if (!upstream.ok) {
      return res.status(upstream.status).json(data)
    }

    res.json(data)
  } catch (err) {
    res.status(502).json({ error: String(err) })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Ascend API proxy running on http://localhost:${PORT}`)
})
