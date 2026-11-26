import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { err: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return (
        <div className="h-screen w-screen bg-[#0E1012] text-[#F2EFE9] flex items-center justify-center p-8">
          <div className="max-w-lg border border-[#F43F5E]/60 bg-[#14171A] p-6 space-y-3">
            <div className="text-sm font-semibold text-[#F43F5E]">Arayüz hatası yakalandı</div>
            <pre className="text-xs font-mono-num text-[#9AA2AC] whitespace-pre-wrap">
              {this.state.err.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#10B981] text-[#0E1012] text-xs font-semibold cursor-pointer"
            >
              Yeniden Yükle
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
