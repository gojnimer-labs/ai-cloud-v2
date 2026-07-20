import { Component } from "react";
import type { ReactNode } from "react";

interface QueryErrorBoundaryProps {
  children: ReactNode;
  // Re-mounts (and thus retries) children some time after an error, since
  // the errors this guards against are typically transient (a Convex
  // deployment briefly bouncing) rather than a real bug.
  retryDelayMs?: number;
}

interface QueryErrorBoundaryState {
  hasError: boolean;
}

const DEFAULT_RETRY_DELAY_MS = 15_000;

// Convex's useQuery re-throws a server-side query error on the client
// during render — without a boundary, that error propagates past this
// component and unmounts everything above it in the tree. Both
// SystemAlertBanners and NotificationBell are mounted at the app-shell
// level (see widgets/authed-shell), so an error in either would otherwise
// take down the entire authed layout, not just the widget itself — this is
// exactly what happened with a transient error during a Convex deployment.
//
// Renders nothing while erroring rather than a visible fallback: these are
// supplementary widgets, not critical page content, so losing them for a
// few seconds is fine — breaking the whole shell is not. Auto-retries by
// clearing the error state after retryDelayMs, since the underlying error
// is expected to resolve itself once the deployment finishes; if it's
// still failing, the retry just re-triggers this same boundary and waits
// again.
export class QueryErrorBoundary extends Component<
  QueryErrorBoundaryProps,
  QueryErrorBoundaryState
> {
  private retryTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(props: QueryErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): QueryErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    this.retryTimeout = setTimeout(() => {
      // oxlint-disable-next-line react/no-set-state -- componentDidCatch's own recovery path: there's no hook-based equivalent for error boundaries, this.setState is the only way to clear caught-error state.
      this.setState({ hasError: false });
    }, this.props.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
  }

  componentWillUnmount() {
    clearTimeout(this.retryTimeout);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
