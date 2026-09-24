const loading = new Map<string, Promise<void>>();

/** Adds a <script> once and resolves when it has loaded. A failed load can be retried. */
export function loadScript(src: string): Promise<void> {
  let promise = loading.get(src);
  if (!promise) {
    promise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        loading.delete(src);
        reject(new Error(`Failed to load ${src}`));
      };
      document.head.appendChild(script);
    });
    loading.set(src, promise);
  }
  return promise;
}
