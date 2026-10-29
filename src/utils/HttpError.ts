/** Error con código HTTP que el manejador de errores convierte en respuesta JSON. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detalles?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
