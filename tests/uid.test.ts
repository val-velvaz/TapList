import { describe, expect, it } from 'vitest';
import { esquemaUid } from '../src/modules/lecturas/lecturas.schemas.js';
import { analizarUid, compararUids, enmascararUid, normalizarUid } from '../src/utils/uid.js';

/*
 * Formato canónico del UID (docs/contrato-dispositivo.md): hexadecimal en
 * mayúsculas, sin separadores, de 4, 7 o 10 bytes. `esquemaUid` es la única
 * validación: la usan las lecturas del ESP32 y la vinculación de P5.
 */

const UID_4 = '04A1B2C3';
const UID_7 = '0411223344556A';
const UID_10 = '04112233445566778899';

/** El mismo UID escrito de las formas que la API acepta. */
function variantes(uid: string): string[] {
  const bytes = uid.match(/../g)!;
  return [uid, uid.toLowerCase(), bytes.join(':'), bytes.join(':').toLowerCase(), bytes.join(' '), `  ${bytes.join(' ').toLowerCase()}  `, `${uid}\n`];
}

describe('esquemaUid: lo que la API acepta', () => {
  for (const [nombre, uid] of [['4 bytes', UID_4], ['7 bytes', UID_7], ['10 bytes', UID_10]] as const) {
    it(`${nombre}: mayúsculas, minúsculas, dos puntos y espacios dan el mismo formato canónico`, () => {
      for (const variante of variantes(uid)) expect(esquemaUid.parse(variante)).toBe(uid);
    });
  }
});

describe('esquemaUid: lo que la API rechaza', () => {
  const rechaza = (valor: unknown) => expect(esquemaUid.safeParse(valor).success, String(valor)).toBe(false);

  it('longitudes que no son de 4, 7 o 10 bytes', () => {
    // 3, 5, 6, 8, 9 y 11 bytes
    for (const caracteres of [6, 10, 12, 16, 18, 22]) rechaza('A'.repeat(caracteres));
  });

  it('longitud impar: un cero a la izquierda perdido (0x0A escrito «A»)', () => {
    for (const valor of ['4A1B2C3', '04A1B2C3D', '0411223344556', '0411223344556677889']) rechaza(valor);
  });

  it('el decimal de 10 dígitos que entregan los lectores USB', () => {
    for (const valor of ['0077705923', '0078912345', '4294967295']) rechaza(valor);
  });

  it('decimales de otras longitudes inválidas', () => {
    for (const valor of ['77705923123', '123456789', '1234567']) rechaza(valor);
  });

  it('un UID de 7 bytes truncado a 5 o 6 bytes', () => {
    for (const valor of ['0411223344', '041122334455']) rechaza(valor);
  });

  it('caracteres no hexadecimales y separadores que no son espacios ni dos puntos', () => {
    for (const valor of ['04A1B2CG', 'ZZZZZZZZ', '04-A1-B2-C3', '0x04A1B2C3', '04,A1,B2,C3', '04.A1.B2.C3', '']) rechaza(valor);
  });

  it('valores que no son texto', () => {
    for (const valor of [undefined, null, 77705923, ['04A1B2C3']]) rechaza(valor);
  });

  it('el mensaje dice las longitudes válidas', () => {
    const resultado = esquemaUid.safeParse('0077705923');
    expect(resultado.error?.issues[0]?.message).toBe('El UID debe ser hexadecimal de 4, 7 o 10 bytes (8, 14 o 20 caracteres)');
  });
});

describe('normalizarUid y enmascararUid', () => {
  it('normaliza sin validar y enmascara dejando los últimos 4 caracteres', () => {
    expect(normalizarUid(' 04:a1 b2:C3 ')).toBe(UID_4);
    expect(enmascararUid(UID_7)).toBe('****556A');
  });
});

describe('analizarUid (npm run uid:revisar)', () => {
  it('un UID correcto es válido, con sus bytes en orden y sin avisos', () => {
    expect(analizarUid('04:a1:b2:c3')).toEqual({ normalizado: UID_4, valido: true, bytes: ['04', 'A1', 'B2', 'C3'], problemas: [], avisos: [] });
    expect(analizarUid(UID_7)).toMatchObject({ valido: true, avisos: [] });
    expect(analizarUid(UID_10).bytes).toHaveLength(10);
  });

  it('coincide con la API en qué es válido', () => {
    for (const valor of [UID_4, UID_7, UID_10, '0077705923', '4A1B2C3', '041122334455', '04-A1-B2-C3', '0x04A1B2C3', 'ZZZZZZZZ', '', '12345678']) {
      expect(analizarUid(valor).valido, valor).toBe(esquemaUid.safeParse(valor).success);
    }
  });

  it('avisa que solo dígitos puede ser decimal y muestra el hexadecimal equivalente', () => {
    const decimal = analizarUid('0077705923'); // 0x04A1B2C3 en decimal
    expect(decimal.valido).toBe(false);
    expect(decimal.avisos.join(' ')).toMatch(/DECIMAL/);
    expect(decimal.avisos.join(' ')).toContain('04A1B2C3');
    expect(decimal.avisos.join(' ')).toContain('C3B2A104');

    // Ocho dígitos son un hexadecimal válido para la API: solo se puede avisar.
    const ambiguo = analizarUid('12345678');
    expect(ambiguo.valido).toBe(true);
    expect(ambiguo.avisos.join(' ')).toMatch(/DECIMAL/);
  });

  it('explica la longitud impar y la longitud que no es de 4, 7 o 10 bytes', () => {
    expect(analizarUid('4A1B2C3').problemas.join(' ')).toMatch(/impar.*cero a la izquierda/);
    expect(analizarUid('041122334455').problemas.join(' ')).toMatch(/6 bytes/);
  });

  it('señala los separadores que la API no acepta', () => {
    for (const valor of ['04-A1-B2-C3', '0x04A1B2C3', '0x04,0xA1,0xB2,0xC3']) {
      const analisis = analizarUid(valor);
      expect(analisis.valido).toBe(false);
      expect(analisis.problemas.join(' ')).toMatch(/guiones, comas, puntos o el prefijo «0x»/);
    }
  });

  it('avisa de un UID aleatorio (08…), de la etiqueta de cascada (88…) y de lecturas fallidas', () => {
    expect(analizarUid('08A1B2C3').avisos.join(' ')).toMatch(/ALEATORIOS/);
    expect(analizarUid('0811223344556A').avisos.join(' ')).not.toMatch(/ALEATORIOS/); // solo aplica a 4 bytes
    expect(analizarUid('8804A1B2').avisos.join(' ')).toMatch(/etiqueta de cascada/);
    expect(analizarUid('00000000').avisos.join(' ')).toMatch(/lectura fallida/);
    expect(analizarUid('FFFFFFFFFFFFFF').avisos.join(' ')).toMatch(/lectura fallida/);
  });
});

describe('compararUids (--comparar)', () => {
  const relacion = (a: string, b: string) => compararUids(a, b).relacion;

  it('iguales, aunque estén escritos distinto', () => {
    expect(relacion('04:a1:b2:c3', UID_4)).toBe('iguales');
  });

  it('bytes invertidos, en 4 y en 7 bytes', () => {
    expect(relacion('C3B2A104', UID_4)).toBe('invertidos');
    expect(relacion('6A554433221104', UID_7)).toBe('invertidos');
  });

  it('decimal contra hexadecimal, con los bytes en orden o invertidos y en cualquier sentido', () => {
    expect(relacion('0077705923', UID_4)).toBe('decimal'); // 0x04A1B2C3
    expect(relacion('3283263748', UID_4)).toBe('decimal'); // 0xC3B2A104
    expect(relacion(UID_4, '77705923')).toBe('decimal');
  });

  it('ceros a la izquierda perdidos', () => {
    expect(relacion('4A1B2C3', UID_4)).toBe('ceros_perdidos');
    expect(relacion('0A0B0C0D', 'ABCD')).toBe('ceros_perdidos');
  });

  it('UID de 7 bytes truncado a 4, con y sin la etiqueta de cascada', () => {
    expect(relacion('04112233', UID_7)).toBe('truncado');
    expect(relacion(UID_7, '04112233')).toBe('truncado');
    expect(relacion('88041122', UID_7)).toBe('truncado');
  });

  it('tarjetas distintas', () => {
    expect(relacion('9F8E7D6C', UID_4)).toBe('distintos');
  });
});
