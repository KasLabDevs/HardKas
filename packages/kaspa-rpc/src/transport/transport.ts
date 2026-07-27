export interface RpcOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface RpcTransport {
  /**
   * Envía una solicitud tipada al nodo y espera la respuesta.
   */
  send<TRequest, TResponse>(
    method: string,
    request?: TRequest,
    options?: RpcOptions
  ): Promise<TResponse>;

  /**
   * Registra un manejador para notificaciones asíncronas del nodo.
   */
  subscribe<TNotification>(
    event: string,
    handler: (data: TNotification) => void
  ): void;

  /**
   * Elimina un manejador de notificaciones.
   */
  unsubscribe<TNotification>(
    event: string,
    handler: (data: TNotification) => void
  ): void;

  /**
   * Cierra el transporte.
   */
  close(): Promise<void>;
}
