import { specialistReportSchema, type SpecialistReport } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import type { AgentModelRequest } from '../../src/domain/ports.js';
import { OpenRouterAgentModel } from '../../src/infrastructure/agents/OpenRouterAgentModel.js';

const report: SpecialistReport = { summary: 'Todo en orden', criteria: [], observations: [], approvalPercentage: 100 };

const request: AgentModelRequest<SpecialistReport> = {
  agentId: 'api',
  system: 'REGLAS',
  brief: 'RESUMEN DE LA SESIÓN',
  task: 'TAREA DEL AGENTE',
  schema: specialistReportSchema,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const completion = (content: string, finish = 'stop') => ({
  choices: [{ message: { content }, finish_reason: finish }],
  usage: { prompt_tokens: 1000, completion_tokens: 150, prompt_tokens_details: { cached_tokens: 800 } },
});

/** fetch simulado: responde en orden y guarda lo que recibió. Nada sale a la red. */
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

describe('OpenRouterAgentModel', () => {
  it('pide JSON con esquema estricto, manda el resumen en el sistema y separa la caché del uso', async () => {
    const { fetcher, calls } = fakeFetch(json(completion(`\`\`\`json\n${JSON.stringify(report)}\n\`\`\``)));
    const model = new OpenRouterAgentModel('google/gemini-2.5-pro', 'clave-de-prueba', fetcher, 0);
    const result = await model.run(request);

    expect(result.output).toEqual(report);
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 150, cacheReadTokens: 800, cacheWriteTokens: 0 });

    const [call] = calls;
    expect(call?.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((call?.init.headers as Record<string, string>).Authorization).toBe('Bearer clave-de-prueba');
    const body = JSON.parse(String(call?.init.body));
    expect(body.model).toBe('google/gemini-2.5-pro');
    expect(body.messages).toEqual([
      { role: 'system', content: 'REGLAS\n\nRESUMEN DE LA SESIÓN' },
      { role: 'user', content: 'TAREA DEL AGENTE' },
    ]);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.$schema).toBeUndefined();
    expect(body.response_format.json_schema.schema.required).toContain('summary');
    expect(body.provider).toEqual({ require_parameters: true });
  });

  it('reintenta ante el límite de uso y sigue', async () => {
    const { fetcher, calls } = fakeFetch(
      json({ error: { code: 429, message: 'Rate limit' } }, 429),
      json(completion(JSON.stringify(report))),
    );
    const result = await new OpenRouterAgentModel('m', 'k', fetcher, 0).run(request);
    expect(result.output.summary).toBe('Todo en orden');
    expect(calls).toHaveLength(2);
  });

  it('traduce los errores de clave y de saldo, sin reintentar', async () => {
    const invalid = fakeFetch(json({ error: { code: 401, message: 'No auth' } }, 401));
    await expect(new OpenRouterAgentModel('m', 'k', invalid.fetcher, 0).run(request)).rejects.toThrow(
      'La clave de OPENROUTER_API_KEY no es válida.',
    );
    expect(invalid.calls).toHaveLength(1);

    // OpenRouter también manda errores con status 200.
    const credits = fakeFetch(json({ error: { code: 402, message: 'Insufficient credits' } }));
    await expect(new OpenRouterAgentModel('m', 'k', credits.fetcher, 0).run(request)).rejects.toThrow('no tiene saldo');
  });

  it('ante un 404 muestra el motivo real (p. ej., la política de datos de los modelos gratuitos)', async () => {
    const { fetcher } = fakeFetch(json({ error: { code: 404, message: 'No endpoints found matching your data policy' } }, 404));
    const run = new OpenRouterAgentModel('nvidia/nemotron-3-super-120b-a12b:free', 'k', fetcher, 0).run(request);
    await expect(run).rejects.toThrow('No endpoints found matching your data policy');
  });

  it('si se agota el tiempo mientras llega la respuesta, lo dice (y no reintenta)', async () => {
    // OpenRouter responde 200 enseguida; lo que se corta es la lectura del cuerpo.
    const slow = {
      ok: true,
      status: 200,
      text: () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
    } as unknown as Response;
    const { fetcher, calls } = fakeFetch(slow);
    await expect(new OpenRouterAgentModel('m', 'k', fetcher, 0).run(request)).rejects.toThrow('no terminó de responder');
    expect(calls).toHaveLength(1);
  });

  it('reintenta si la conexión se cierra sin respuesta completa', async () => {
    const { fetcher, calls } = fakeFetch(
      new Response('   \n  {"choi', { status: 200 }),
      json(completion(JSON.stringify(report))),
    );
    const result = await new OpenRouterAgentModel('m', 'k', fetcher, 0).run(request);
    expect(result.output.summary).toBe('Todo en orden');
    expect(calls).toHaveLength(2);
  });

  it('acepta el texto en partes y reporta dónde está el formato inesperado', async () => {
    const parts = fakeFetch(json({ choices: [{ message: { content: [{ type: 'text', text: JSON.stringify(report) }] } }] }));
    expect((await new OpenRouterAgentModel('m', 'k', parts.fetcher, 0).run(request)).output).toEqual(report);

    const empty = fakeFetch(json({ choices: [] }));
    await expect(new OpenRouterAgentModel('m', 'k', empty.fetcher, 0).run(request)).rejects.toThrow(
      'formato inesperado (choices: no trajo ninguna respuesta del modelo)',
    );
  });

  it('traduce el error que el proveedor manda dentro de la respuesta', async () => {
    const { fetcher } = fakeFetch(
      json({ choices: [{ message: { content: '' }, finish_reason: 'error', error: { code: 429, message: 'Rate limit' } }] }),
    );
    await expect(new OpenRouterAgentModel('m', 'k', fetcher, 0).run(request)).rejects.toThrow('límite de uso');
  });

  it('si el proveedor sigue saturado tras los reintentos, lo dice con el motivo', async () => {
    const overloaded = () => json({ error: { code: 502, message: 'Upstream error from Nvidia: Service temporarily overloaded' } });
    const { fetcher, calls } = fakeFetch(overloaded(), overloaded(), overloaded());
    await expect(new OpenRouterAgentModel('m', 'k', fetcher, 0).run(request)).rejects.toThrow(
      'saturado o no disponible (Upstream error from Nvidia: Service temporarily overloaded)',
    );
    expect(calls).toHaveLength(3);
  });

  it('avisa si la respuesta quedó cortada', async () => {
    const { fetcher } = fakeFetch(json(completion('{"summary":', 'length')));
    await expect(new OpenRouterAgentModel('m', 'k', fetcher, 0).run(request)).rejects.toThrow('quedó cortada');
  });
});
