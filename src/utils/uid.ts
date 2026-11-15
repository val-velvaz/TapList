/** Quita espacios y dos puntos y pasa a mayúsculas: '04:a2:b3:c4' → '04A2B3C4'. */
export function normalizarUid(uid: string): string {
  return uid.replace(/[\s:]/g, '').toUpperCase();
}

/** Solo los últimos 4 caracteres, para los logs (RNF-06): '04A2B3C4' → '****B3C4'. */
export function enmascararUid(uid: string): string {
  return `****${uid.slice(-4)}`;
}

/**
 * Formato canónico del UID (ver docs/contrato-dispositivo.md): hexadecimal en
 * mayúsculas, sin separadores, de 4, 7 o 10 bytes (8, 14 o 20 caracteres).
 * Son los tres tamaños de UID de ISO 14443A. Otras longitudes indican un
 * error de formato: decimal, ceros perdidos o un UID truncado.
 */
export const PATRON_UID = /^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/;

export const esUidCanonico = (uid: string): boolean => PATRON_UID.test(uid);

// -----------------------------------------------------------------------------
// Análisis para `npm run uid:revisar`. La API no usa lo que sigue: sirve para
// revisar a mano lo que entrega un lector antes de vincular credenciales.
// -----------------------------------------------------------------------------

export interface AnalisisUid {
  /** El valor sin espacios ni dos puntos y en mayúsculas, como lo vería la API. */
  normalizado: string;
  /** `true` si la API lo aceptaría tal cual. */
  valido: boolean;
  /** Los bytes en orden, si el valor es hexadecimal de longitud par. */
  bytes: string[];
  /** Por qué la API lo rechazaría. */
  problemas: string[];
  /** Sospechas que la API no puede detectar. */
  avisos: string[];
}

const bytesDe = (hex: string): string[] => hex.match(/../g) ?? [];
const invertir = (hex: string): string => bytesDe(hex).reverse().join('');

/**
 * Las formas en que un lector escribiría en decimal un UID de 4 bytes: con los
 * bytes en orden o invertidos. Devuelve los hexadecimales correspondientes.
 */
function decimalAHex(digitos: string): string[] {
  if (!/^\d{1,10}$/.test(digitos)) return [];
  const numero = Number(digitos);
  if (numero > 0xffffffff) return [];
  const hex = numero.toString(16).toUpperCase().padStart(8, '0');
  return [...new Set([hex, invertir(hex)])];
}

export function analizarUid(valor: string): AnalisisUid {
  const normalizado = normalizarUid(valor);
  const problemas: string[] = [];
  const avisos: string[] = [];

  if (normalizado === '') {
    return { normalizado, valido: false, bytes: [], problemas: ['Está vacío.'], avisos };
  }

  // Lo que la API no acepta como separador, pero que varios lectores escriben.
  const sinAdornos = normalizado.replace(/0X/g, '').replace(/[-,.]/g, '');
  if (sinAdornos !== normalizado) {
    problemas.push('Trae guiones, comas, puntos o el prefijo «0x». La API solo acepta espacios y dos puntos como separadores.');
  }

  const esHex = /^[0-9A-F]+$/.test(sinAdornos);
  const soloDigitos = /^\d+$/.test(sinAdornos);
  if (!esHex) problemas.push('Tiene caracteres que no son hexadecimales (solo se permiten 0-9 y A-F).');

  if (esHex && sinAdornos.length % 2 === 1) {
    problemas.push(
      `Tiene ${sinAdornos.length} caracteres, una cantidad impar. Cada byte son dos caracteres: ` +
        'probablemente se perdió un cero a la izquierda (el byte 0x0A escrito como «A»).',
    );
  } else if (esHex && ![8, 14, 20].includes(sinAdornos.length)) {
    problemas.push(
      `Tiene ${sinAdornos.length / 2} bytes (${sinAdornos.length} caracteres). Un UID tiene 4, 7 o 10 bytes (8, 14 o 20 caracteres).`,
    );
  }

  const bytes = esHex && sinAdornos.length % 2 === 0 ? bytesDe(sinAdornos) : [];

  if (soloDigitos) {
    const equivalentes = decimalAHex(sinAdornos);
    const comoHex = equivalentes.length
      ? ` Si fuera decimal, en hexadecimal sería ${equivalentes.join(' (bytes en orden) o ')}${equivalentes.length > 1 ? ' (bytes invertidos)' : ''}.`
      : '';
    avisos.push(
      'Solo tiene dígitos: puede ser un UID en DECIMAL, como lo entregan muchos lectores USB. ' +
        `Un UID hexadecimal real casi siempre tiene alguna letra de la A a la F.${comoHex}`,
    );
  }

  if (bytes.length > 0 && new Set(bytes).size === 1 && ['00', 'FF'].includes(bytes[0]!)) {
    avisos.push('Todos los bytes son iguales (00 o FF): parece una lectura fallida, no un UID.');
  }
  if (bytes.length === 4 && bytes[0] === '08') {
    avisos.push(
      'Es un UID de 4 bytes que empieza con 08: así empiezan los UID ALEATORIOS (celulares y algunas tarjetas), ' +
        'que cambian en cada lectura. Lee la misma tarjeta tres veces: si cambia, no sirve como credencial.',
    );
  }
  if (bytes[0] === '88') {
    avisos.push(
      'Empieza con 88, la «etiqueta de cascada» de las tarjetas de 7 o 10 bytes. Ningún UID completo empieza así: ' +
        'el lector se quedó a media lectura o la librería no terminó la anticolisión.',
    );
  }

  return { normalizado, valido: problemas.length === 0, bytes, problemas, avisos };
}

export type RelacionUid = 'iguales' | 'invertidos' | 'truncado' | 'decimal' | 'ceros_perdidos' | 'distintos';

export interface ComparacionUid {
  relacion: RelacionUid;
  explicacion: string;
}

/** Quita lo mismo que `analizarUid` para poder comparar valores mal formados. */
const limpiar = (valor: string): string => normalizarUid(valor).replace(/0X/g, '').replace(/[-,.]/g, '');

/**
 * Compara el valor revisado con un UID de referencia de la misma tarjeta (por
 * ejemplo, el que imprime el ESP32) y dice cuál es la diferencia de formato.
 */
export function compararUids(valor: string, referencia: string): ComparacionUid {
  const a = limpiar(valor);
  const b = limpiar(referencia);
  const pares = (x: string) => x.length % 2 === 0 && /^[0-9A-F]+$/.test(x);

  if (a === b) {
    return { relacion: 'iguales', explicacion: 'Son el mismo UID: los dos lectores entregan el mismo formato.' };
  }
  if (pares(a) && pares(b) && invertir(a) === b) {
    return {
      relacion: 'invertidos',
      explicacion: 'Son la misma tarjeta con los BYTES INVERTIDOS. Uno de los dos lectores debe cambiar el orden; el correcto es el de la anticolisión (ver docs/contrato-dispositivo.md).',
    };
  }
  if (decimalAHex(a).includes(b) || decimalAHex(b).includes(a)) {
    return {
      relacion: 'decimal',
      explicacion: 'Son la misma tarjeta, pero uno está en DECIMAL y el otro en hexadecimal. Configura el lector para que entregue hexadecimal.',
    };
  }
  const sinCeros = (x: string) => bytesDe(x).map((byte) => byte.replace(/^0/, '')).join('');
  if ((pares(b) && sinCeros(b) === a) || (pares(a) && sinCeros(a) === b)) {
    return {
      relacion: 'ceros_perdidos',
      explicacion: 'Son la misma tarjeta, pero uno PERDIÓ CEROS a la izquierda (un byte como 0x0A escrito «A»). Cada byte debe escribirse con dos caracteres.',
    };
  }
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  const sinCascada = corto.startsWith('88') ? corto.slice(2) : corto;
  if (corto.length >= 6 && corto.length < largo.length && (largo.startsWith(corto) || largo.endsWith(corto) || largo.startsWith(sinCascada))) {
    return {
      relacion: 'truncado',
      explicacion: 'Uno es una parte del otro: el más corto está TRUNCADO (suele pasar con tarjetas de 7 bytes leídas como si fueran de 4). Hay que enviar todos los bytes.',
    };
  }
  return {
    relacion: 'distintos',
    explicacion: 'No se parecen: son tarjetas distintas, o una diferencia de formato que esta herramienta no reconoce.',
  };
}
