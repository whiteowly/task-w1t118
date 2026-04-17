import { Router } from 'express';
import { requireAuth, requireCapability, type AuthenticatedRequest } from '../middleware/auth.js';
import * as bookingService from '../services/booking-service.js';

const router = Router();

function actor(req: AuthenticatedRequest) {
  return { userId: req.userId!, roles: req.userRoles! };
}

router.get(
  '/bookings/availability',
  requireAuth,
  requireCapability('workspace.booking.view'),
  (req: AuthenticatedRequest, res, next) => {
    try {
      const date = (req.query.date as string) || bookingService.todayDateKey();
      res.json(bookingService.listBookingAvailability(actor(req), date));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/bookings',
  requireAuth,
  requireCapability('workspace.booking.view'),
  (req: AuthenticatedRequest, res, next) => {
    try {
      const date = (req.query.date as string) || bookingService.todayDateKey();
      res.json(bookingService.listBookings(actor(req), date));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/bookings',
  requireAuth,
  requireCapability('workspace.booking.manage'),
  (req: AuthenticatedRequest, res, next) => {
    try {
      const result = bookingService.createBooking(actor(req), req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/bookings/:bookingId/reschedule',
  requireAuth,
  requireCapability('workspace.booking.manage'),
  (req: AuthenticatedRequest, res, next) => {
    try {
      const bookingId = String(req.params.bookingId);
      const result = bookingService.rescheduleBooking(actor(req), bookingId, req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/bookings/:bookingId/cancel',
  requireAuth,
  requireCapability('workspace.booking.manage'),
  (req: AuthenticatedRequest, res, next) => {
    try {
      const bookingId = String(req.params.bookingId);
      const result = bookingService.cancelBooking(actor(req), bookingId, req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
