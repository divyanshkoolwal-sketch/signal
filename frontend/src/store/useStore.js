import { create } from 'zustand'

let alertIdCounter = 0
let notifIdCounter = 0
let positionIdCounter = 0

const useStore = create((set, get) => ({
  markets: {},
  selectedPair: null,
  tradePanelOpen: false,
  tradePanelPair: null,
  alerts: [],
  positions: [],
  connected: false,
  authConnected: true,
  notifications: [],

  setMarket: (pair, state) =>
    set((s) => ({
      markets: {
        ...s.markets,
        [pair]: {
          ...(s.markets[pair] || {}),
          ...state,
        },
      },
    })),

  setSelectedPair: (pair) =>
    set({ selectedPair: pair }),

  openTradePanel: (pair) =>
    set({ tradePanelOpen: true, tradePanelPair: pair }),

  closeTradePanel: () =>
    set({ tradePanelOpen: false, tradePanelPair: null }),

  addAlert: (pair, targetPhase) => {
    const id = ++alertIdCounter
    set((s) => ({
      alerts: [...s.alerts, { pair, targetPhase, id }],
    }))
    return id
  },

  removeAlert: (id) =>
    set((s) => ({
      alerts: s.alerts.filter((a) => a.id !== id),
    })),

  addPosition: (position) => {
    const id = ++positionIdCounter
    set((s) => ({
      positions: [...s.positions, { ...position, id }],
    }))
    return id
  },

  removePosition: (id) =>
    set((s) => ({
      positions: s.positions.filter((p) => p.id !== id),
    })),

  setConnected: (v) => set({ connected: v }),

  setAuthConnected: (v) => set({ authConnected: v }),

  addNotification: (notif) => {
    const id = ++notifIdCounter
    set((s) => ({
      notifications: [...s.notifications, { ...notif, id }],
    }))
    return id
  },

  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),
}))

export default useStore
