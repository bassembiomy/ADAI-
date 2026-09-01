import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class GlobalErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('GlobalErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetStorage = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0a0a0a',
          color: '#e0e0e0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <div style={{
            maxWidth: '680px',
            width: '100%',
            backgroundColor: '#141414',
            border: '1px solid #2a2a2a',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
                fontWeight: 'bold',
                fontSize: '18px'
              }}>
                !
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f87171' }}>
                  ADIA Runtime Recovery
                </h2>
                <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>
                  An unexpected render exception was caught by the boundary.
                </p>
              </div>
            </div>

            <div style={{
              backgroundColor: '#0d0d0d',
              border: '1px solid #222',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '12px',
              fontFamily: 'monospace',
              color: '#fca5a5',
              overflowX: 'auto',
              marginBottom: '16px',
              whiteSpace: 'pre-wrap',
              maxHeight: '200px'
            }}>
              {this.state.error?.toString() || 'Unknown Error'}
              {this.state.errorInfo?.componentStack && (
                <div style={{ color: '#666', marginTop: '8px', fontSize: '11px' }}>
                  {this.state.errorInfo.componentStack}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={this.handleResetStorage}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: '#222',
                  border: '1px solid #333',
                  color: '#aaa',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Clear Local Storage & Reload
              </button>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: '#ea580c',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '13px'
                }}
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
