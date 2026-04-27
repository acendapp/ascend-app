import { useNavigate, useLocation } from 'react-router-dom'

const tabs = [
  {
    id: 'home',
    label: 'Home',
    path: '/home',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"
          stroke={active ? '#4A9EFF' : '#5A7A9A'}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9 21V12h6v9"
          stroke={active ? '#4A9EFF' : '#5A7A9A'}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'workout',
    label: 'Workout',
    path: '/workout',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M6 4v16M18 4v16M3 8h3M18 8h3M3 16h3M18 16h3M6 12h12"
          stroke={active ? '#4A9EFF' : '#5A7A9A'}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'groups',
    label: 'Groups',
    path: '/groups',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3" stroke={active ? '#4A9EFF' : '#5A7A9A'} strokeWidth="1.8" />
        <circle cx="17" cy="9" r="2.5" stroke={active ? '#4A9EFF' : '#5A7A9A'} strokeWidth="1.8" />
        <path
          d="M3 19c0-3.314 2.686-5 6-5s6 1.686 6 5"
          stroke={active ? '#4A9EFF' : '#5A7A9A'}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M17 14c2.5 0 4 1.2 4 3.5"
          stroke={active ? '#4A9EFF' : '#5A7A9A'}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    path: '/profile',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke={active ? '#4A9EFF' : '#5A7A9A'} strokeWidth="1.8" />
        <path
          d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6"
          stroke={active ? '#4A9EFF' : '#5A7A9A'}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 390,
        background: '#0D1728',
        borderTop: '1px solid #1A2A42',
        display: 'flex',
        zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {tabs.map(tab => {
        const active = location.pathname === tab.path
        return (
          <button
            key={tab.id}
            onClick={() => navigate(tab.path)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '10px 0 8px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            {tab.icon(active)}
            <span style={{ color: active ? '#4A9EFF' : '#5A7A9A', fontSize: 10, fontWeight: active ? 600 : 400 }}>
              {tab.label}
            </span>
            {active && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  width: 20,
                  height: 3,
                  borderRadius: 2,
                  background: '#4A9EFF',
                }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
