/**
 * Status dot colour on a requirement symbol. Canonical statuses are lowercase
 * (draft, approved, implemented, verified, failed, stale, retired); comparison
 * ignores case so legacy capitalised values still resolve.
 */
export function requirementStatusColor(status: string | undefined): string {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'verified': return '#4ade80';
    case 'approved':
    case 'implemented': return '#6c9ac6';
    case 'draft': return '#888';
    case 'retired': return '#555';
    case 'failed':
    case 'stale':
    default: return '#c96c8a';
  }
}
