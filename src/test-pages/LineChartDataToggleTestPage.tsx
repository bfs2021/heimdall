import React, { useState } from 'react'
import { LineChart } from '../components/LineChart'

// Regression page for tinkermonkey/heimdall#297: a LineChart whose data switches between empty
// and non-empty must keep rendering. The error boundary turns a render throw into visible text
// so the spec can assert on it.
class ChartErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }
  render() {
    if (this.state.error) return <div data-testid="chart-error">{this.state.error}</div>
    return this.props.children
  }
}

const DATA = [[4, 9, 6, 12, 8, 14]]

export default function LineChartDataToggleTestPage() {
  const [empty, setEmpty] = useState(true)
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button type="button" data-testid="toggle-data" onClick={() => setEmpty(e => !e)} style={{ alignSelf: 'flex-start' }}>
        {empty ? 'Load data' : 'Clear data'}
      </button>
      <div data-testid="chart-host">
        <ChartErrorBoundary>
          <LineChart series={empty ? [[]] : DATA} width={320} height={120} tooltip axes />
        </ChartErrorBoundary>
      </div>
    </div>
  )
}
