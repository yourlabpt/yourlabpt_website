(function () {
  let loading = null;

  // Follows the app's theme, so a diagram is not a dark island on a light page.
  function themeNow() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'neutral';
  }
  function init(mermaid) {
    const theme = themeNow();
    if (mermaid._yourlabTheme === theme) return;
    mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict' });
    mermaid._yourlabTheme = theme;
    mermaid._yourlabInit = true;
  }

  window.ensureMermaidLoaded = function ensureMermaidLoaded() {
    if (window.mermaid) {
      init(window.mermaid);
      return Promise.resolve(window.mermaid);
    }
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
      script.async = true;
      script.onload = () => {
        if (window.mermaid) {
          init(window.mermaid);
          resolve(window.mermaid);
        } else {
          reject(new Error('Mermaid não disponível'));
        }
      };
      script.onerror = () => reject(new Error('Falha ao carregar Mermaid'));
      document.head.appendChild(script);
    });
    return loading;
  };
})();
