import type { AgentProviderId } from '@rastro/shared';
import anthropicSvg from 'simple-icons/icons/anthropic.svg?raw';
import deepseekSvg from 'simple-icons/icons/deepseek.svg?raw';
import geminiSvg from 'simple-icons/icons/googlegemini.svg?raw';
import mistralSvg from 'simple-icons/icons/mistralai.svg?raw';
import ollamaSvg from 'simple-icons/icons/ollama.svg?raw';
import openrouterSvg from 'simple-icons/icons/openrouter.svg?raw';

/** El path del logo real (simple-icons, CC0), extraído una sola vez al cargar el módulo. */
function extractPath(raw: string): string {
  const path = /<path\s+d="([^"]+)"/.exec(raw)?.[1];
  if (!path) throw new Error('No se pudo leer el ícono del proveedor.');
  return path;
}

/**
 * Logo real de cada proveedor (paquete `simple-icons`, CC0). OpenAI y Groq no tienen ícono en el
 * paquete (retirados/no publicados por temas de marca): esos dos quedan sin ícono propio, y
 * `ProviderCard` cae a su inicial como badge.
 */
const PROVIDER_ICON_PATHS: Partial<Record<AgentProviderId, string>> = {
  anthropic: extractPath(anthropicSvg),
  deepseek: extractPath(deepseekSvg),
  gemini: extractPath(geminiSvg),
  mistral: extractPath(mistralSvg),
  ollama: extractPath(ollamaSvg),
  openrouter: extractPath(openrouterSvg),
};

export function hasProviderIcon(id: AgentProviderId): boolean {
  return id in PROVIDER_ICON_PATHS;
}

export function ProviderBrandIcon({ id, className }: { id: AgentProviderId; className?: string }) {
  const path = PROVIDER_ICON_PATHS[id];
  if (!path) return null;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
