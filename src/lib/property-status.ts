export const PROPERTY_STATUS_VALUES = [
  'draft',
  'active',
  'reserved',
  'sold',
  'rented',
  'inactive',
  'archived',
] as const;

export type PropertyStatus = (typeof PROPERTY_STATUS_VALUES)[number];

const LEGACY_PROPERTY_STATUS_MAP: Record<string, PropertyStatus> = {
  ativo: 'active',
  inativo: 'inactive',
  vendido: 'sold',
  alugado: 'rented',
  privado: 'active',
};

export function normalizePropertyStatus(status?: string | null): PropertyStatus {
  const normalized = String(status || '').trim().toLowerCase();

  if ((PROPERTY_STATUS_VALUES as readonly string[]).includes(normalized)) {
    return normalized as PropertyStatus;
  }

  return LEGACY_PROPERTY_STATUS_MAP[normalized] || 'active';
}

export function isPropertySold(status?: string | null) {
  return normalizePropertyStatus(status) === 'sold';
}

export function isPropertyInactive(status?: string | null) {
  return normalizePropertyStatus(status) === 'inactive';
}
