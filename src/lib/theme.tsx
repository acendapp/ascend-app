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

export const ACCENT_COLORS: Record<string, { light: string; dark: string; label: string; swatch: string }> = {
  blue:   { light: '#2B7FE0', dark: '#4A9EFF', label: 'Blue',   swatch: '#4A9EFF' },
  red:    { light: '#DC2626', dark: '#F87171', label: 'Red',    swatch: '#F87171' },
  pink:   { light: '#DB2777', dark: '#F472B6', label: 'Pink',   swatch: '#F472B6' },
  purple: { light: '#7C3AED', dark: '#A78BFA', label: 'Purple', swatch: '#A78BFA' },
  orange: { light: '#EA580C', dark: '#FB923C', label: 'Orange', swatch: '#FB923C' },
  yellow: { light: '#CA8A04', dark: '#FACC15', label: 'Yellow', swatch: '#FACC15' },
  green:  { light: '#16A34A', dark: '#4ADE80', label: 'Green',  swatch: '#4ADE80' },
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const BASE_DARK = {
  bg: '#080E1C', surface: '#0D1728', surfaceHigh: '#111E30',
  border: '#1A2A42', borderSub: '#0F1A2C',
  text: '#FFFFFF', textSub: '#5A7A9A', textMuted: '#3A5A7A', textFaint: '#2E4A6A',
  inputBg: '#0D1728', isDark: true,
}

const BASE_LIGHT = {
  bg: '#F0F4FA', surface: '#FFFFFF', surfaceHigh: '#F7FAFF',
  border: '#DDE6F0', borderSub: '#EEF3FA',
  text: '#0D1728', textSub: '#5A7A9A', textMuted: '#8FAAC2', textFaint: '#A8BFCF',
  inputBg: '#FFFFFF', isDark: false,
}

function buildColors(theme: Theme, accentKey: string): Colors {
  const def = ACCENT_COLORS[accentKey] ?? ACCENT_COLORS.blue
  const accent = theme === 'dark' ? def.dark : def.light
  const base = theme === 'dark' ? BASE_DARK : BASE_LIGHT
  return {
    ...base,
    accent,
    accentBg: hexToRgba(accent, theme === 'dark' ? 0.12 : 0.10),
    accentBorder: hexToRgba(accent, theme === 'dark' ? 0.25 : 0.30),
  }
}

interface ThemeCtx {
  theme: Theme
  colors: Colors
  toggleTheme: () => void
  accentKey: string
  setAccentColor: (key: string) => void
}

const Ctx = createContext<ThemeCtx>({
  theme: 'light',
  colors: buildColors('light', 'blue'),
  toggleTheme: () => {},
  accentKey: 'blue',
  setAccentColor: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('ascend_theme') as Theme | null) ?? 'light'
  )
  const [accentKey, setAccentKeyState] = useState<string>(() =>
    localStorage.getItem('ascend_accent_color') ?? 'blue'
  )

  const colors = buildColors(theme, accentKey)

  function toggleTheme() {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark'
      localStorage.setItem('ascend_theme', next)
      return next
    })
  }

  function setAccentColor(key: string) {
    localStorage.setItem('ascend_accent_color', key)
    setAccentKeyState(key)
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.body.style.backgroundColor = colors.bg
  }, [theme, colors.bg])

  return (
    <Ctx.Provider value={{ theme, colors, toggleTheme, accentKey, setAccentColor }}>
      {children}
    </Ctx.Provider>
  )
}

export function useTheme() { return useContext(Ctx) }
