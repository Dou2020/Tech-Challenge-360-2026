import { Router } from 'express';
import { sistemaController } from './sistema.controller.js';

export const sistemaRoutes = Router();

sistemaRoutes.get('/health', sistemaController.health);
