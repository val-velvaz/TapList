/** Quita espacios y dos puntos y pasa a mayúsculas: '04:a2:b3:c4' → '04A2B3C4'. */
export function normalizarUid(uid: string): string {
  return uid.replace(/[\s:]/g, '').toUpperCase();
}

/** Solo los últimos 4 caracteres, para los logs (RNF-06): '04A2B3C4' → '****B3C4'. */
export function enmascararUid(uid: string): string {
  return `****${uid.slice(-4)}`;
}
