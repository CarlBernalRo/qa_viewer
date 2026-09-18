import { specialistReportSchema, type SpecialistReport } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import type { AgentModelRequest } from '../../src/domain/ports.js';
import { OpenAICompatibleAgentModel } from '../../src/infrastructure/agents/OpenAICompatibleAgentModel.js';

const report: SpecialistReport = { summary: 'Todo en orden', criteria: [], observations: [], approvalPercentage: 100 };

const request: AgentModelRequest<SpecialistReport> = {
  agentId: 'api',
  system: 'REGLAS',
  brief: 'RESUMEN',
  task: 'TAREA',
  schema: specialistReportSchema,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const completion = (content: string, finish = 'stop') => ({
  choices: [{ message: { content }, finish_reason: finish }],
  usage: { prompt_tokens: 500, completion_tokens: 80 },
});

function fakeFetch(...responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('sin más respuestas');
    return next;
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe('OpenAICompatibleAgentModel', () => {
  it('manda Bearer + json_object y separa el uso', async () => {
    const { fetcher, calls } = fakeFetch(json(completion(JSON.stringify(report))));
    const model = new OpenAICompatibleAgentModel('Groq', 'llama-3.3-70b', 'https://api.groq.com/openai/v1/chat/completions', 'GROQ_API_KEY', 'clave', 'json_object', fetcher, 0);
    const result = await model.run(request);

    expect(result.output).toEqual(report);
    expect(result.usage).toEqual({ inputTokens: 500, outputTokens: 80, cacheReadTokens: 0, cacheWriteTokens: 0 });
    const [call] = calls;
    expect(call?.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((call?.init.headers as Record<string, string>).Authorization).toBe('Bearer clave');
    const body = JSON.parse(String(call?.init.body));
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('sin clave (Ollama local) no manda Authorization', async () => {
    const { fetcher, calls } = fakeFetch(json(completion(JSON.stringify(report))));
    await new OpenAICompatibleAgentModel('Ollama', 'llama3', 'http://127.0.0.1:11434/v1/chat/completions', 'OLLAMA_API_KEY', undefined, 'json_object', fetcher, 0).run(request);
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('json_schema pide el schema estricto', async () => {
    const { fetcher, calls } = fakeFetch(json(completion(JSON.stringify(report))));
    await new OpenAICompatibleAgentModel('OpenAI', 'gpt-4.1', 'https://api.openai.com/v1/chat/completions', 'OPENAI_API_KEY', 'k', 'json_schema', fetcher, 0).run(request);
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
  });

  it('manda las imágenes como image_url con data URL', async () => {
    const { fetcher, calls } = fakeFetch(json(completion(JSON.stringify(report))));
    await new OpenAICompatibleAgentModel('OpenAI', 'gpt-4.1', 'https://api.openai.com/v1/chat/completions', 'OPENAI_API_KEY', 'k', 'json_object', fetcher, 0).run({
      ...request,
      images: [{ mimeType: 'image/jpeg', data: 'YQ==' }],
    });
    const body = JSON.parse(String(calls[0]?.init.body));
    const userMessage = body.messages[1];
    expect(userMessage.content).toEqual([
      { type: 'text', text: 'TAREA' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,YQ==' } },
    ]);
  });

  it('traduce el 401 mencionando la variable de entorno correcta', async () => {
    const { fetcher } = fakeFetch(json({ error: { message: 'invalid api key' } }, 401));
    await expect(
      new OpenAICompatibleAgentModel('Mistral', 'mistral-large-latest', 'https://api.mistral.ai/v1/chat/completions', 'MISTRAL_API_KEY', 'k', 'json_object', fetcher, 0).run(request),
    ).rejects.toThrow('La clave de MISTRAL_API_KEY no es válida.');
  });

  it('reintenta ante un 503 y después funciona', async () => {
    const { fetcher, calls } = fakeFetch(json({ error: { message: 'overloaded' } }, 503), json(completion(JSON.stringify(report))));
    const result = await new OpenAICompatibleAgentModel('DeepSeek', 'deepseek-chat', 'https://api.deepseek.com/chat/completions', 'DEEPSEEK_API_KEY', 'k', 'json_object', fetcher, 0).run(request);
    expect(result.output.summary).toBe('Todo en orden');
    expect(calls).toHaveLength(2);
  });

  it('avisa si la respuesta quedó cortada por longitud', async () => {
    const { fetcher } = fakeFetch(json(completion('{"summary":', 'length')));
    await expect(
      new OpenAICompatibleAgentModel('OpenAI', 'gpt-4.1', 'https://api.openai.com/v1/chat/completions', 'OPENAI_API_KEY', 'k', 'json_object', fetcher, 0).run(request),
    ).rejects.toThrow('quedó cortada');
  });
});
