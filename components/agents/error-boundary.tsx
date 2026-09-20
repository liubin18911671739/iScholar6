/**
 * AgentErrorBoundary (components/agents/error-boundary.tsx)
 *
 * Functionality:
 * - Class-based React error boundary that catches render errors in the agent UI subtree.
 * - Shows the supplied `fallback` node or a default "Component Error" panel with the error message.
 * - Stores `hasError` and the caught `Error` in component state via `getDerivedStateFromError`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { Component, type ReactNode } from "react";

/** Props for `AgentErrorBoundary`: wrapped children and an optional fallback UI. */
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

/** Internal state tracking whether an error was caught and which error. */
interface State {
  hasError: boolean;
  error: Error | null;
}

/** Error boundary wrapper for agent panels. */
export class AgentErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  // React lifecycle hook that records the thrown error into state.
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="cosmic-panel rounded-xl p-4 text-sm text-muted-foreground space-y-2">
            <p className="text-destructive font-medium">Component Error</p>
            <p className="text-xs">{this.state.error?.message}</p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
