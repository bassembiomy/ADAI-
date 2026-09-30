import { PHYSICAL_DOMAINS } from './types';

const CANONICAL_DOMAINS = new Set<string>(PHYSICAL_DOMAINS);
const SUPPLEMENTAL_PORT_DOMAINS = new Set(['any', 'beltproperty']);

export const isValidVLabPortDomain = (domain: string): boolean => {
  const normalized = domain.trim().toLowerCase();
  return CANONICAL_DOMAINS.has(normalized) || SUPPLEMENTAL_PORT_DOMAINS.has(normalized);
};
