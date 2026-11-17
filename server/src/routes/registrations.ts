import { Router, Request, Response } from 'express';

const router = Router();

// Link legado: matrículas novas são feitas somente pelo dashboard do aluno.
router.post('/:classId/registrations', async (_req: Request, res: Response) => {
  res.status(410).json({
    error: 'Inscrições por link foram encerradas. Acesse o dashboard para se inscrever no curso.',
  });
});

export default router;
