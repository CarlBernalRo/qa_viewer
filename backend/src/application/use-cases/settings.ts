import { readFile, writeFile } from 'node:fs/promises';
import { AGENT_PROVIDER_META, agentProviderSchema, type AppSettingsDto, type RealAgentProviderId, type UpdateAppSettingsInput } from '@rastro/shared';

type ApiKeyField = Exclude<keyof AppSettingsDto, 'agentProvider' | 'agentModel'>;

/** Campo del DTO de cada clave, p. ej. `gemini` → `geminiApiKey`. Coincide con `appSettingsSchema`. */
function keyField(provider: RealAgentProviderId): ApiKeyField {
  return `${provider}ApiKey` as ApiKeyField;
}

const EMPTY_SETTINGS: AppSettingsDto = {
  agentProvider: 'auto',
  agentModel: '',
  geminiApiKey: '',
  openrouterApiKey: '',
  openaiApiKey: '',
  anthropicApiKey: '',
  groqApiKey: '',
  mistralApiKey: '',
  deepseekApiKey: '',
  ollamaApiKey: '',
};

function extractValue(content: string, key: string): string | undefined {
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match?.[1]?.trim();
}

function updateValue(content: string, key: string, value: string): string {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) return content.replace(regex, `${key}=${value}`);
  const prefix = content && !content.endsWith('\n') ? '\n' : '';
  return `${content}${prefix}${key}=${value}\n`;
}

export class GetAppSettings {
  constructor(private readonly envPath: string) {}

  async execute(): Promise<AppSettingsDto> {
    let content: string;
    try {
      content = await readFile(this.envPath, 'utf-8');
    } catch {
      return EMPTY_SETTINGS;
    }
    const provider = agentProviderSchema.safeParse(extractValue(content, 'RASTRO_AGENT_PROVIDER'));
    const settings: AppSettingsDto = {
      ...EMPTY_SETTINGS,
      agentProvider: provider.success ? provider.data : 'auto',
      agentModel: extractValue(content, 'RASTRO_AGENT_MODEL') ?? '',
    };
    for (const provider of Object.keys(AGENT_PROVIDER_META) as RealAgentProviderId[]) {
      settings[keyField(provider)] = extractValue(content, AGENT_PROVIDER_META[provider].envKey) ?? '';
    }
    return settings;
  }
}

export class UpdateAppSettings {
  constructor(private readonly envPath: string) {}

  async execute(input: UpdateAppSettingsInput): Promise<void> {
    let content = '';
    try {
      content = await readFile(this.envPath, 'utf-8');
    } catch {
      // Sin archivo todavía: se crea uno nuevo.
    }

    content = updateValue(content, 'RASTRO_AGENT_PROVIDER', input.agentProvider);
    if (input.agentModel !== undefined) content = updateValue(content, 'RASTRO_AGENT_MODEL', input.agentModel);
    for (const provider of Object.keys(AGENT_PROVIDER_META) as RealAgentProviderId[]) {
      const value = input[keyField(provider)];
      if (value !== undefined) content = updateValue(content, AGENT_PROVIDER_META[provider].envKey, value);
    }

    await writeFile(this.envPath, content, 'utf-8');
  }
}
