// ============================================================
// ERROR BOUNDARY — Captura errores de React y los muestra
// en pantalla en lugar de pantalla en blanco.
// Útil para debug en dispositivos móviles sin DevTools.
// ============================================================

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: string;
  stack: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: '', stack: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error: error.message,
      stack: error.stack ?? '',
    };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    console.error('[ErrorBoundary]', error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#0f172a',
          color: '#f1f5f9',
          padding: '24px',
          fontFamily: 'monospace',
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #ef4444',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '16px',
          }}>
            <h2 style={{ color: '#ef4444', margin: '0 0 8px' }}>
              ⚠️ Error de aplicación
            </h2>
            <p style={{ color: '#94a3b8', margin: '0 0 16px', fontSize: '14px' }}>
              Copia este texto y compártelo para diagnóstico:
            </p>
            <pre style={{
              background: '#0f172a',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '12px',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              color: '#fca5a5',
              margin: 0,
            }}>
              {this.state.error}
            </pre>
          </div>

          <div style={{
            background: '#1e293b',
            borderRadius: '12px',
            padding: '20px',
          }}>
            <p style={{ color: '#94a3b8', margin: '0 0 8px', fontSize: '12px' }}>
              Stack trace:
            </p>
            <pre style={{
              fontSize: '10px',
              color: '#64748b',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0,
            }}>
              {this.state.stack}
            </pre>
          </div>

          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '16px',
              background: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            🔄 Recargar app
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}