export interface AdiaBridgeAPI {
  searchWeb(request: { query: string; maxResults?: number }): Promise<Array<{ title: string; url: string; snippet: string }>>;
}

declare global {
  interface Window {
    adia?: AdiaBridgeAPI;
  }
}
