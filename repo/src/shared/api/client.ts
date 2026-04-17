const API_BASE = '/api/v1';

let _token: string | null = null;

export function setAuthToken(token: string | null): void {
  _token = token;
  if (token) {
    localStorage.setItem('localops_token', token);
  } else {
    localStorage.removeItem('localops_token');
  }
}

export function getAuthToken(): string | null {
  if (_token) return _token;
  _token = localStorage.getItem('localops_token');
  return _token;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: { code: 'UNKNOWN_ERROR', message: res.statusText } }));
    const err = errorBody.error ?? { code: 'UNKNOWN_ERROR', message: 'Request failed.' };
    throw Object.assign(new Error(err.message), { code: err.code, fieldErrors: err.fieldErrors, details: err.details });
  }

  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string }>('GET', '/health'),

  bootstrapAdmin: (input: { username: string; password: string; confirmPassword: string }) =>
    request<{ message: string }>('POST', '/auth/bootstrap-admin', input),

  login: async (input: { username: string; password: string }) => {
    const result = await request<{ token: string; user: { id: string; username: string; roles: string[] } }>('POST', '/auth/login', input);
    setAuthToken(result.token);
    return result;
  },

  logout: async () => {
    await request<{ message: string }>('POST', '/auth/logout');
    setAuthToken(null);
  },

  listMerchants: () => request<unknown[]>('GET', '/merchants'),

  createMerchantDraft: (input: { name: string; description: string; tags: string[]; amenities: string[] }) =>
    request<unknown>('POST', '/merchants', input),

  updateMerchantDraft: (merchantId: string, input: { expectedVersionNo: number; name: string; description: string; tags: string[]; amenities: string[]; imageAssetId: string | null }) =>
    request<unknown>('PATCH', `/merchants/${merchantId}`, input),

  submitMerchantForReview: (merchantId: string, input?: { reason?: string }) =>
    request<{ message: string }>('POST', `/merchants/${merchantId}/submit`, input ?? {}),

  approveMerchant: (merchantId: string) =>
    request<{ message: string }>('POST', `/merchants/${merchantId}/approve`, {}),

  rejectMerchant: (merchantId: string, input?: { reason?: string }) =>
    request<{ message: string }>('POST', `/merchants/${merchantId}/reject`, input ?? {}),

  publishMerchant: (merchantId: string) =>
    request<{ message: string }>('POST', `/merchants/${merchantId}/publish`, {}),

  listBookingAvailability: (date?: string) =>
    request<unknown>('GET', `/bookings/availability${date ? `?date=${date}` : ''}`),

  listBookings: (date?: string) =>
    request<unknown[]>('GET', `/bookings${date ? `?date=${date}` : ''}`),

  createBooking: (input: { resourceId: string; startsAt: string; durationMinutes: number; customerName: string; partySize: number; notes: string; idempotencyKey: string }) =>
    request<unknown>('POST', '/bookings', input),

  rescheduleBooking: (bookingId: string, input: { resourceId: string; startsAt: string; durationMinutes: number; idempotencyKey: string }) =>
    request<unknown>('POST', `/bookings/${bookingId}/reschedule`, input),

  cancelBooking: (bookingId: string, input: { reason?: string; idempotencyKey: string }) =>
    request<unknown>('POST', `/bookings/${bookingId}/cancel`, input)
};
