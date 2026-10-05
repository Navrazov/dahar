import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportClientError } from '../lib/monitoring'
import { Button } from './button'
import { Card, Empty } from './surface'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
    reportClientError(error, info.componentStack ?? undefined)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Card className="mx-auto mt-10 max-w-md">
        <Empty
          title="Страница сломалась"
          hint={this.state.error.message}
          action={
            <Button variant="primary" onClick={() => window.location.reload()}>
              Перезагрузить
            </Button>
          }
        />
      </Card>
    )
  }
}
