import type { Property } from '@/hooks/use-properties';

type PropertyUser = {
  id?: string | null;
  role?: string | null;
} | null | undefined;

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

export function isPropertyResponsible(property: Pick<Property, 'cadastrado_por' | 'corretor_id'> | null | undefined, userId?: string | null) {
  if (!property || !userId) return false;

  return property.cadastrado_por === userId || property.corretor_id === userId;
}

export function canEditProperty(property: Pick<Property, 'cadastrado_por' | 'corretor_id'> | null | undefined, user: PropertyUser, isSuperAdmin = false) {
  if (isSuperAdmin || ADMIN_ROLES.has(user?.role || '')) return true;

  return isPropertyResponsible(property, user?.id);
}

export function canDeleteProperty(user: PropertyUser, isSuperAdmin = false) {
  return isSuperAdmin || ADMIN_ROLES.has(user?.role || '');
}
