/**
 * Orden alfabético en español para los `ORDER BY` sobre texto.
 *
 * Sin esto, el orden depende de la configuración regional con la que se creó
 * la base. Con la configuración «C» se compara byte por byte, y «Álvarez» o
 * «Ñandú» quedan después de «Zúñiga», y las minúsculas después de las
 * mayúsculas. La colación ICU `es-x-icu` viene con PostgreSQL (compilado con
 * ICU, como los instaladores oficiales y la imagen de Docker) y da el mismo
 * orden en cualquier servidor: los acentos no mueven la letra y la «ñ» va
 * después de la «n».
 *
 * Uso: `ORDER BY e.apellidos ${ORDEN_ES}, e.nombre ${ORDEN_ES}`. Toda consulta
 * nueva que ordene por un texto visible debe usarla.
 */
export const ORDEN_ES = 'COLLATE "es-x-icu"';
