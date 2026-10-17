/** Accent-, case- and punctuation-insensitive key. Mirrors norm() in scripts/build_data.py. */
export function norm(s) {
  return String(s == null ? '' : s)
    .replace(/\u00df/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
