/**
 * EventSource de mentira para las pruebas (jsdom no trae uno). Guarda cada
 * conexión abierta en `EventSourceFalso.instancias` y deja que la prueba
 * envíe eventos o simule cortes.
 */
export class EventSourceFalso {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instancias: EventSourceFalso[] = [];

  readonly url: string;
  readyState = EventSourceFalso.CONNECTING;
  onerror: ((evento: Event) => void) | null = null;
  private oyentes = new Map<string, Array<(evento: MessageEvent) => void>>();

  constructor(url: string | URL) {
    this.url = String(url);
    EventSourceFalso.instancias.push(this);
  }

  /** La última conexión abierta. */
  static get ultima(): EventSourceFalso {
    const ultima = EventSourceFalso.instancias.at(-1);
    if (!ultima) throw new Error('No se abrió ninguna conexión SSE');
    return ultima;
  }

  addEventListener(tipo: string, oyente: (evento: MessageEvent) => void): void {
    this.oyentes.set(tipo, [...(this.oyentes.get(tipo) ?? []), oyente]);
  }

  removeEventListener(tipo: string, oyente: (evento: MessageEvent) => void): void {
    this.oyentes.set(tipo, (this.oyentes.get(tipo) ?? []).filter((o) => o !== oyente));
  }

  close(): void {
    this.readyState = EventSourceFalso.CLOSED;
  }

  /** El servidor envía un evento. */
  emitir(tipo: string, datos: unknown = {}): void {
    if (tipo === 'conectado') this.readyState = EventSourceFalso.OPEN;
    for (const oyente of this.oyentes.get(tipo) ?? []) oyente(new MessageEvent(tipo, { data: JSON.stringify(datos) }));
  }

  /** Se corta la conexión. Con `definitivo`, el navegador ya no reintenta. */
  fallar(definitivo = false): void {
    this.readyState = definitivo ? EventSourceFalso.CLOSED : EventSourceFalso.CONNECTING;
    this.onerror?.(new Event('error'));
  }
}
