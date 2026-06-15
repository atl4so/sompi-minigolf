import { useEffect, useState } from 'react';

const PRELOAD_ASSETS = [
  '/assets/sprites/bg-lobbyselect.gif',
  '/assets/sprites/bg-lobby-single.gif',
  '/assets/sprites/bg-lobby-dual.gif',
  '/assets/sprites/bg-lobby-multi.gif',
  '/assets/sprites/language-flags.png',
];

export function useAssetPreloader() {
  const [loadingAssets, setLoadingAssets] = useState(true);

  useEffect(() => {
    let loadedAssets = 0;
    const fallbackTimer = window.setTimeout(() => setLoadingAssets(false), 1500);

    PRELOAD_ASSETS.forEach((picture) => {
      const img = new Image();

      const markLoaded = () => {
        loadedAssets++;
        if (loadedAssets === PRELOAD_ASSETS.length) {
          setLoadingAssets(false);
        }
      };

      img.onload = markLoaded;
      img.onerror = markLoaded;
      img.src = picture;
    });

    return () => window.clearTimeout(fallbackTimer);
  }, []);

  return { loadingAssets };
}
