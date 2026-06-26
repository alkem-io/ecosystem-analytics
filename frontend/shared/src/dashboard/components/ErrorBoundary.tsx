import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional label so the fallback can say which area failed. */
  label?: string;
  /** Optional custom fallback. */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors in a subtree so one broken component (e.g. unexpected API
 * data) shows a contained, recoverable message instead of blanking the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[dashboard] component error', this.props.label ?? '', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="m-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">
            {this.props.label ? `${this.props.label}: ` : ''}Er ging iets mis in dit onderdeel.
          </p>
          <p className="mt-1 break-words text-xs text-muted-foreground">{this.state.error.message}</p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-3 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            Opnieuw proberen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
