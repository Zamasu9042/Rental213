import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || "Unknown frontend error."
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Frontend render error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ maxWidth: 960, margin: "40px auto", padding: 24, fontFamily: "Arial, Helvetica, sans-serif" }}>
          <h1>Frontend error</h1>
          <p>The UI crashed before it could render normally.</p>
          <p><strong>Message:</strong> {this.state.errorMessage}</p>
          <ol>
            <li>Open the app through <code>npm run dev</code> or <code>npm run preview</code>, not by double-clicking <code>index.html</code>.</li>
            <li>Open the browser console and copy the first red error if it still fails.</li>
            <li>Make sure the backend is running if <code>VITE_USE_MOCKS=false</code>.</li>
          </ol>
        </div>
      );
    }

    return this.props.children;
  }
}
