export interface BackgroundRequest<T> {
  requestId: number;
  kind: string;
  payload: T;
}

export interface BackgroundResponse<R> {
  requestId: number;
  ok: boolean;
  result?: R;
  error?: {
    message: string;
    stack?: string;
  };
}
