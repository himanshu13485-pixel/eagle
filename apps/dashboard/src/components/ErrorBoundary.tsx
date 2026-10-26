import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches a render-time crash and shows something recoverable.
 *
 * There was no boundary anywhere, so any thrown error unmounted the whole app
 * to a blank white page with no way back — the user's only option was to guess
 * that reloading might help.
 */
interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ui] render crash", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center bg-gray-50 p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-2xl">!</div>
          <h1 className="mt-4 text-xl font-bold text-gray-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-gray-500">
            This page hit an unexpected error. Your data is safe — reloading usually fixes it.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => location.reload()}
              className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
            >
              Reload
            </button>
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200"
            >
              Try again
            </button>
          </div>
          <p className="mt-5 text-xs text-gray-400">
            If it keeps happening, send this to support: <span className="font-mono">{error.message.slice(0, 120)}</span>
          </p>
        </div>
      </div>
    );
  }
}
