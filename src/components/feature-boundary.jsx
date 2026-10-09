import { Component, Suspense } from "react";
import { ContentPlaceholder } from "./content-placeholder.jsx";

export class FeatureBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <main className="feature-message" role="alert">
          <h1>页面暂时无法打开</h1>
          <p>请检查网络后重新加载，已保存的学习记录可以继续使用。</p>
          <button className="primary" onClick={() => window.location.reload()}>
            重新加载页面
          </button>
        </main>
      );
    return (
      <Suspense
        fallback={this.props.fallback === undefined ? <ContentPlaceholder /> : this.props.fallback}
      >
        {this.props.children}
      </Suspense>
    );
  }
}
