import { useEffect, useState } from 'react';
import { DEFAULT_EFFORT, DEFAULT_MODEL, modelLabel } from '../../shared/defaults';
import type { AppConfig } from '../../shared/protocol';
import { DIRECT_MODE, DIRECT_MODEL } from '../lib/mode';

const initialModel = DIRECT_MODE ? DIRECT_MODEL : DEFAULT_MODEL;
/** Final in the browser-only build; in server mode, shown until the server answers. */
const INITIAL: AppConfig = {
  model: initialModel,
  modelLabel: modelLabel(initialModel),
  defaultEffort: DEFAULT_EFFORT,
};

/** In server mode, asks the server which model it is configured to use, so the UI never guesses. */
export function useAppConfig(): AppConfig {
  const [config, setConfig] = useState<AppConfig>(INITIAL);

  useEffect(() => {
    if (DIRECT_MODE) return;
    const controller = new AbortController();
    fetch('/api/config', { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<AppConfig>) : INITIAL))
      .then(setConfig)
      .catch(() => {
        // Aborted or offline — keep the initial values.
      });
    return () => controller.abort();
  }, []);

  return config;
}
