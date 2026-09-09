export interface RenderResult { svg?: string; error?: { code: 'render-failed'; message: string }; }
export type LocalPlantUmlRender = (source: string, options?: { format?: 'svg' }) => Promise<string>;

/** UI-facing boundary for a bundled Electron-local PlantUML renderer. No network fallback is permitted. */
export class OfflinePlantUmlRenderer {
  constructor(private readonly localRender: LocalPlantUmlRender) {}

  async render(source: string, options: { format?: 'svg' } = {}): Promise<RenderResult> {
    try { return { svg: await this.localRender(source, { format: options.format ?? 'svg' }) }; }
    catch (error) { return { error: { code: 'render-failed', message: error instanceof Error ? error.message : String(error) } }; }
  }
}
