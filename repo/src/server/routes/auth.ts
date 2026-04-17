import { Router } from 'express';
import * as authService from '../services/auth-service.js';

const router = Router();

router.post('/auth/bootstrap-admin', (req, res, next) => {
  try {
    authService.bootstrapAdmin(req.body);
    res.status(201).json({ message: 'Administrator created.' });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/login', (req, res, next) => {
  try {
    const result = authService.login(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/auth/logout', (req, res, next) => {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    authService.logout(token);
    res.json({ message: 'Logged out.' });
  } catch (err) {
    next(err);
  }
});

export default router;
