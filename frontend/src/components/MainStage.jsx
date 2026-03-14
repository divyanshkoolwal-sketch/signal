import React from 'react'
import useStore from '../store/useStore.js'
import PhaseGrid from './PhaseGrid.jsx'
import SignalDashboard from './SignalDashboard.jsx'

export default function MainStage() {
  const { selectedPair } = useStore()

  return (
    <main className="main-stage">
      {selectedPair ? (
        <SignalDashboard pair={selectedPair} />
      ) : (
        <PhaseGrid />
      )}
    </main>
  )
}
