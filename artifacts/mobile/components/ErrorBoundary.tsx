import { Component, type ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { reportClientError } from "@/utils/errorReporting";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level error boundary — catches render-time exceptions anywhere in the
 * routed screens and shows a friendly fallback instead of a blank/crashed app.
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
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>An unexpected error occurred.</Text>
          <Pressable onPress={this.handleRetry} style={styles.button}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 18, fontWeight: "600" },
  message: { fontSize: 14, color: "#666", textAlign: "center" },
  button: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#ccc" },
  buttonText: { fontSize: 14, fontWeight: "500" },
});
