import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/errorReporting";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React error boundary — catches render-time exceptions and shows a friendly
 * fallback UI instead of a blank screen.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComplexPage />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    reportClientError({
      logType: "CLIENT_EXCEPTION",
      message: error.message,
      stackTrace: `${error.stack ?? ""}\n${info.componentStack}`,
      metadata: { source: "react-error-boundary" },
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 border border-red-200">
            <AlertTriangle className="h-7 w-7 text-red-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Something went wrong</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              {import.meta.env.DEV && this.state.error
                ? this.state.error.message
                : "An unexpected error occurred. Please try refreshing the page."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={this.handleRetry} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
