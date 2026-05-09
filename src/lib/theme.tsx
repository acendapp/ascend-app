import { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

export interface Colors {
  bg: string
  surface: string
  surfaceHigh: string
  border: string
  borderSub: string
  text: string
  textSub: string
  textMuted: string
  textFaint: string
  accent: string
  accentBg: string
  accentBorder: string
  inputBg: string
  isDark: boolean
}

const DARK: Colors = {
  bg: '#080E1C',
  surface: '#0D1728',
  surfaceHigh: '#111E30',
  border: '#1A2A42',
  borderSub: '#0F1A2C',
  text: '#FFFFFF',
  textSub: '#5A7A9A',
  textMuted: '#3A5A7A',
  textFaint: '#2E4A6A',
  accent: '#4A9EFF',
  accentBg: 'rgba(74,158,255,0.12)',
  accentBorder: 'rgba(74,158,255,0.25)',
  inputBg: '#0D1728',
  isDark: true,
}

const LIGHT: Colors = {
  bg: '#F0F4FA',
  surface: '#FFFFFF',
  surfaceHigh: '#F7FAFF',
  border: '#DDE6F0',
  borderSub: '#EEF3FA',
  text: '#0D1728',
  textSub: '#5A7A9A',
  textMuted: '#8FAAC2',
  textFaint: '#A8BFCF',
  accent: '#2B7FE0',
  accentBg: 'rgba(43,127,224,0.10)',
  accentBorder: 'rgba(43,127,224,0.30)',
  inputBg: '#FFFFFF',
  isDark: false,
}

interface ThemeCtx { theme: Theme; colors: Colors; toggleTheme: () => void }

const Ctx = createContext<ThemeCtx>({ theme: 'light', colors: LIGHT, toggleTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('ascend_theme') as Theme | null) ?? 'light'
  )
  const colors = theme === 'dark' ? DARK : LIGHT

  function toggleTheme() {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark'
      localStorage.setItem('ascend_theme', next)
      return next
    })
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.body.style.backgroundColor = colors.bg
  }, [theme, colors.bg])

  return <Ctx.Provider value={{ theme, colors, toggleTheme }}>{children}</Ctx.Provider>
}

export function useTheme() { return useContext(Ctx) }
