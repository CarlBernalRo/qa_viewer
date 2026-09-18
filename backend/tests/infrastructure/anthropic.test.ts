import { specialistReportSchema, type SpecialistReport } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import type { AgentModelRequest } from '../../src/domain/ports.js';
import { AnthropicAgentModel } from '../../src/infrastructure/agents/AnthropicAgentModel.js';

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

const message = (input: unknown, stopReason = 'tool_use') => ({
  content: [{ type: 'tool_use', name: 'informar', input }],
  stop_reason: stopReason,
  usage: { input_tokens: 300, output_tokens: 60, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
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

describe('AnthropicAgentModel', () => {
  it('fuerza la tool y toma el input ya parseado, sin JSON.parse de por medio', async () => {
    const { fetcher, calls } = fakeFetch(json(message(report)));
    const model = new AnthropicAgentModel('claude-sonnet-4-5', 'clave', fetcher, 0);
    const result = await model.run(request);

    expect(result.output).toEqual(report);
    expect(result.usage).toEqual({ inputTokens: 300, outputTokens: 60, cacheReadTokens: 100, cacheWriteTokens: 0 });
    const [call] = calls;
    expect(call?.url).toBe('https://api.anthropic.com/v1/messages');
    const headers = call?.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('clave');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(String(call?.init.body));
    expect(body.system).toBe('REGLAS\n\nRESUMEN');
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'informar' });
    expect(body.tools[0].input_schema.required).toContain('summary');
  });

  it('manda las imágenes como bloques base64', async () => {
    const { fetcher, calls } = fakeFetch(json(message(report)));
    await new AnthropicAgentModel('claude-sonnet-4-5', 'k', fetcher, 0).run({
      ...request,
      images: [{ mimeType: 'image/jpeg', data: 'YQ==' }],
    });
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'TAREA' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'YQ==' } },
    ]);
  });

  it('traduce el 401 sin exponer la clave', async () => {
    const { fetcher } = fakeFetch(json({ error: { message: 'invalid x-api-key' } }, 401));
    await expect(new AnthropicAgentModel('claude-sonnet-4-5', 'k', fetcher, 0).run(request)).rejects.toThrow(
      'La clave de ANTHROPIC_API_KEY no es válida.',
    );
  });

  it('reintenta ante un 529 (sobrecarga, específico de Anthropic)', async () => {
    const { fetcher, calls } = fakeFetch(json({ error: { message: 'overloaded' } }, 529), json(message(report)));
    const result = await new AnthropicAgentModel('claude-sonnet-4-5', 'k', fetcher, 0).run(request);
    expect(result.output.summary).toBe('Todo en orden');
    expect(calls).toHaveLength(2);
  });

  it('avisa si no hay bloque tool_use en la respuesta', async () => {
    const { fetcher } = fakeFetch(json({ content: [{ type: 'text', text: 'no puedo ayudarte con eso' }], usage: { input_tokens: 1, output_tokens: 1 } }));
    await expect(new AnthropicAgentModel('claude-sonnet-4-5', 'k', fetcher, 0).run(request)).rejects.toThrow(
      'no devolvió el informe',
    );
  });

  it('avisa si la respuesta quedó cortada por longitud', async () => {
    const { fetcher } = fakeFetch(json(message(report, 'max_tokens')));
    await expect(new AnthropicAgentModel('claude-sonnet-4-5', 'k', fetcher, 0).run(request)).rejects.toThrow('quedó cortada');
  });
});
