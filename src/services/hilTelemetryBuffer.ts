export interface TelemetrySample {
  timestamp: number;
  values: Record<string, number>;
}

export interface TelemetryFlushSnapshot {
  timestamps: number[];
  plotData: Record<string, number[]>;
  latestValues: Record<string, number>;
  samplesCount: number;
  bytesCount: number;
}

export interface HILTelemetryBufferOptions {
  maxDisplayPoints?: number;
  flushIntervalMs?: number;
  onFlush?: (snapshot: TelemetryFlushSnapshot) => void;
}

export class HILTelemetryBuffer {
  private maxDisplayPoints: number;
  private flushIntervalMs: number;
  private onFlush?: (snapshot: TelemetryFlushSnapshot) => void;

  private displayTimestamps: number[] = [];
  private displayPlotData: Record<string, number[]> = {};
  private latestValues: Record<string, number> = {};

  private isRecording = false;
  private recordedData: TelemetrySample[] = [];

  private samplesCount = 0;
  private bytesCount = 0;

  private timerId: any = null;
  private dirty = false;

  constructor(options: HILTelemetryBufferOptions = {}) {
    this.maxDisplayPoints = options.maxDisplayPoints ?? 100;
    this.flushIntervalMs = options.flushIntervalMs ?? 33; // ~30 fps
    this.onFlush = options.onFlush;
  }

  public setMaxDisplayPoints(limit: number): void {
    this.maxDisplayPoints = Math.max(1, limit);
    this.trimDisplay();
  }

  public startRecording(): void {
    this.isRecording = true;
  }

  public stopRecording(): void {
    this.isRecording = false;
  }

  public getRecordedData(): readonly TelemetrySample[] {
    return this.recordedData;
  }

  public pushSample(sample: TelemetrySample, byteLength = 0): void {
    const { timestamp, values } = sample;
    this.samplesCount++;
    this.bytesCount += byteLength;

    // Full recording storage
    if (this.isRecording) {
      this.recordedData.push({ timestamp, values: { ...values } });
    }

    // Append to bounded display
    this.displayTimestamps.push(timestamp);
    for (const [key, val] of Object.entries(values)) {
      if (!this.displayPlotData[key]) {
        this.displayPlotData[key] = [];
      }
      this.displayPlotData[key].push(val);
      this.latestValues[key] = val;
    }

    // Fill missing channel points for channels previously observed
    for (const ch of Object.keys(this.displayPlotData)) {
      if (values[ch] === undefined) {
        const lastVal = this.latestValues[ch] ?? 0;
        this.displayPlotData[ch].push(lastVal);
      }
    }

    this.trimDisplay();
    this.dirty = true;
    this.scheduleFlush();
  }

  private trimDisplay(): void {
    if (this.displayTimestamps.length > this.maxDisplayPoints) {
      const overflow = this.displayTimestamps.length - this.maxDisplayPoints;
      this.displayTimestamps.splice(0, overflow);
      for (const ch of Object.keys(this.displayPlotData)) {
        if (this.displayPlotData[ch].length > this.maxDisplayPoints) {
          const chOverflow = this.displayPlotData[ch].length - this.maxDisplayPoints;
          this.displayPlotData[ch].splice(0, chOverflow);
        }
      }
    }
  }

  private scheduleFlush(): void {
    if (this.timerId !== null) return;

    this.timerId = setTimeout(() => {
      this.timerId = null;
      if (this.dirty) {
        this.flush();
      }
    }, this.flushIntervalMs);
  }

  public flush(): TelemetryFlushSnapshot {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.dirty = false;

    // Build plotData clone
    const plotDataCopy: Record<string, number[]> = {};
    for (const [k, arr] of Object.entries(this.displayPlotData)) {
      plotDataCopy[k] = [...arr];
    }

    const snapshot: TelemetryFlushSnapshot = {
      timestamps: [...this.displayTimestamps],
      plotData: plotDataCopy,
      latestValues: { ...this.latestValues },
      samplesCount: this.samplesCount,
      bytesCount: this.bytesCount,
    };

    if (this.onFlush) {
      this.onFlush(snapshot);
    }

    return snapshot;
  }

  public clear(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.displayTimestamps = [];
    this.displayPlotData = {};
    this.latestValues = {};
    this.recordedData = [];
    this.samplesCount = 0;
    this.bytesCount = 0;
    this.dirty = false;
  }

  public dispose(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.dirty = false;
  }
}
