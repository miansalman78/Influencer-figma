import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

/**
 * Error Boundary Component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing the whole app.
 * 
 * Usage:
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to error reporting service (Sentry, Bugsnag, etc.)
    console.error('[ErrorBoundary] Error caught:', error, errorInfo);
    
    // TODO: Integrate with error tracking service
    // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
    
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      const { fallback, showDetails = false } = this.props;
      
      if (fallback) {
        return typeof fallback === 'function'
          ? fallback(this.state.error, this.handleReset)
          : fallback;
      }

      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.content}>
              <Text style={styles.title}>Oops! Something went wrong</Text>
              <Text style={styles.message}>
                We're sorry for the inconvenience. The app encountered an unexpected error.
              </Text>
              
              {showDetails && this.state.error && (
                <View style={styles.detailsContainer}>
                  <Text style={styles.detailsTitle}>Error Details:</Text>
                  <Text style={styles.detailsText}>
                    {this.state.error.toString()}
                  </Text>
                  {this.state.errorInfo && (
                    <Text style={styles.detailsText}>
                      {this.state.errorInfo.componentStack}
                    </Text>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={styles.button}
                onPress={this.handleReset}
              >
                <Text style={styles.buttonText}>Try Again</Text>
              </TouchableOpacity>

              {this.props.onRetry && (
                <TouchableOpacity
                  style={[styles.button, styles.secondaryButton]}
                  onPress={() => {
                    this.handleReset();
                    this.props.onRetry?.();
                  }}
                >
                  <Text style={[styles.buttonText, styles.secondaryButtonText]}>
                    Reload Page
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  detailsContainer: {
    width: '100%',
    marginBottom: 24,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 4,
  },
  detailsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  detailsText: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#337DEB',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    minWidth: 150,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#337DEB',
  },
  secondaryButtonText: {
    color: '#337DEB',
  },
});

export default ErrorBoundary;

