const placeholderValues = new Set([
  "replace_with_maptiler_key",
  "replace_with_shared_device_token"
]);

function cleanEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed || placeholderValues.has(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function numberEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(cleanEnv(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getMapStyleUrl(): string {
  const directStyleUrl = cleanEnv(import.meta.env.VITE_MAP_STYLE_URL);
  if (directStyleUrl) {
    return directStyleUrl;
  }

  const maptilerKey = cleanEnv(import.meta.env.VITE_MAPTILER_KEY);
  if (maptilerKey) {
    const styleId = cleanEnv(import.meta.env.VITE_MAPTILER_STYLE_ID) ?? "outdoor-v4";
    return `https://api.maptiler.com/maps/${styleId}/style.json?key=${encodeURIComponent(maptilerKey)}`;
  }

  return cleanEnv(import.meta.env.VITE_MAP_FALLBACK_STYLE_URL) ?? "https://tiles.openfreemap.org/styles/liberty";
}

export const mapInitialView = {
  center: [
    numberEnv(import.meta.env.VITE_MAP_CENTER_LNG, 2.1029),
    numberEnv(import.meta.env.VITE_MAP_CENTER_LAT, 41.4197)
  ] as [number, number],
  zoom: numberEnv(import.meta.env.VITE_MAP_INITIAL_ZOOM, 12.2)
};

export const apiBaseUrl = cleanEnv(import.meta.env.VITE_API_BASE_URL) ?? "http://localhost:3000";
export const socketUrl = cleanEnv(import.meta.env.VITE_SOCKET_URL) ?? apiBaseUrl;
