export const MERCHANT_TAG_OPTIONS = [
  'Family Friendly',
  'Premium',
  'Late Night',
  'Delivery',
  'Quick Service',
  'Local Favorite'
] as const;

export const AMENITY_OPTIONS = [
  'Parking',
  'Outdoor Seating',
  'Wheelchair Access',
  'WiFi',
  'Pet Friendly',
  'Card Payment'
] as const;

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'] as const;
