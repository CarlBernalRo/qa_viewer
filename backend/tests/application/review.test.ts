import { summarizeCriteria } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import { createUseCases } from '../../src/application/index.js';
import { DomainError, InvalidStateError, NotFoundError } from '../../src/domain/errors.js';
import { createTestDeps } from '../fakes.js';
import { sampleInput } from '../samples.js';

async function setup() {
  const deps = createTestDeps();
  const useCases = createUseCases(deps);
  const session = await useCases.createSession.execute(sampleInput());
  return { deps, useCases, id: session.id };
}

describe('marcas del QA', () => {
  it('mientras graba, la marca queda en el reloj de la sesión', async () => {
    const { deps, useCases, id } = await setup();
    await useCases.startRecording.execute(id);
    deps.clock.advance(4200);
    const review = await useCases.addMarker.execute(id, { criterionId: 'CA1', note: 'Aparece el error' });
    expect(review.markers).toMatchObject([{ t: 4200, criterionId: 'CA1', note: 'Aparece el error' }]);
  });

  it('al revisar, pide el momento y no deja pasar el final de la grabación', async () => {
    const { deps, useCases, id } = await setup();
    await useCases.startRecording.execute(id);
    deps.clock.advance(10_000);
    await useCases.stopRecording.execute(id);
    await expect(useCases.addMarker.execute(id, { note: 'sin momento' })).rejects.toBeInstanceOf(InvalidStateError);
    const review = await useCases.addMarker.execute(id, { t: 999_999, note: 'Al final' });
    expect(review.markers.map((marker) => [marker.t, marker.criterionId])).toEqual([[10_000, null]]);
  });

  it('las ordena por momento y se pueden borrar', async () => {
    const { deps, useCases, id } = await setup();
    await useCases.startRecording.execute(id);
    deps.clock.advance(8000);
    await useCases.addMarker.execute(id, { t: 6000, note: 'segunda' });
    const review = await useCases.addMarker.execute(id, { t: 2000, note: 'primera' });
    expect(review.markers.map((marker) => marker.note)).toEqual(['primera', 'segunda']);
    const [first] = review.markers;
    const after = await useCases.removeMarker.execute(id, first?.id ?? '');
    expect(after.markers.map((marker) => marker.note)).toEqual(['segunda']);
    await expect(useCases.removeMarker.execute(id, 'no-existe')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza marcas vacías, criterios que no existen y sesiones sin grabar', async () => {
    const { useCases, id } = await setup();
    await expect(useCases.addMarker.execute(id, { t: 0, note: 'x' })).rejects.toBeInstanceOf(InvalidStateError);
    await useCases.startRecording.execute(id);
    await expect(useCases.addMarker.execute(id, { note: '   ' })).rejects.toBeInstanceOf(DomainError);
    await expect(useCases.addMarker.execute(id, { criterionId: 'CA9' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('veredicto por criterio', () => {
  it('guarda, resume y vuelve a pendiente', async () => {
    const { useCases, id } = await setup();
    await useCases.startRecording.execute(id);
    await useCases.stopRecording.execute(id);
    await useCases.setCriterionVerdict.execute(id, 'CA1', { verdict: 'pass', note: 'Pedido en estado Pagado' });
    let review = await useCases.setCriterionVerdict.execute(id, 'CA2', { verdict: 'fail' });
    expect(review.criteria['CA1']).toMatchObject({ verdict: 'pass', note: 'Pedido en estado Pagado' });
    expect(summarizeCriteria(['CA1', 'CA2'], review)).toEqual({ pass: 1, fail: 1, blocked: 0, pending: 0 });

    review = await useCases.setCriterionVerdict.execute(id, 'CA1', { verdict: null });
    expect(review.criteria['CA1']).toBeUndefined();
    expect(summarizeCriteria(['CA1', 'CA2'], review)).toEqual({ pass: 0, fail: 1, blocked: 0, pending: 1 });
  });

  it('no acepta veredictos en borrador ni sobre criterios que no existen', async () => {
    const { useCases, id } = await setup();
    await expect(useCases.setCriterionVerdict.execute(id, 'CA1', { verdict: 'pass' })).rejects.toBeInstanceOf(
      InvalidStateError,
    );
    await useCases.startRecording.execute(id);
    await expect(useCases.setCriterionVerdict.execute(id, 'CA7', { verdict: 'pass' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('el informe incluye la revisión del QA', async () => {
    const { deps, useCases, id } = await setup();
    await useCases.startRecording.execute(id);
    await useCases.stopRecording.execute(id);
    await useCases.setCriterionVerdict.execute(id, 'CA2', { verdict: 'blocked', note: 'No hay tarjeta de prueba' });
    await useCases.exportSessionReport.execute(id);
    expect(deps.renderer.rendered[0]?.review.criteria['CA2']?.verdict).toBe('blocked');
  });
});
