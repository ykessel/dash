import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Last line of defence: a render error shows a way back instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="boot boot--error" role="alert">
        <h1>Something broke on this page</h1>
        <p>Your work is saved. Reload to pick up where you left off.</p>
        <div className="boot__actions">
          <button type="button" className="btn btn--primary" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}
