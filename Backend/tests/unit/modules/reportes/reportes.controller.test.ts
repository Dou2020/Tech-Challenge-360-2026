import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportesController } from '../../../../src/modules/reportes/reportes.controller.js';
import { transmitirEventos } from '../../../../src/shared/eventos/transmitir.js';

vi.mock('../../../../src/modules/reportes/reportes.service.js', () => ({ reportesService: {} }));
vi.mock('../../../../src/shared/eventos/transmitir.js', () => ({ transmitirEventos: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reportesController.stream', () => {
  it('delega en transmitirEventos sin filtro', async () => {
    // Arrange
    const req = {} as Request;
    const res = {} as Response;

    // Act
    await reportesController.stream(req, res);

    // Assert
    expect(transmitirEventos).toHaveBeenCalledWith(req, res);
  });
});
