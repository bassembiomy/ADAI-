import {
  decodeBinaryFrame,
  decodeTextFrame,
  encodeBinaryFrame,
  HIL_CHANNEL_NAME_PATTERN,
  MIN_BINARY_FRAME_LENGTH,
} from './hilProtocol';

const MAX_TEXT_BUFFER = 4096;

function assertChannelName(name: string): void {
  if (typeof name !== 'string' || !HIL_CHANNEL_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid HIL channel name '${String(name)}': must be a C identifier`);
  }
}

export interface VariableUpdate {
  variable: string;
  value: number;
  timestamp: number;
}

export interface SerialTransport {
  open(port: string, baudRate: number): Promise<void>;
  close(): Promise<void>;
  write(data: string | Buffer): Promise<void>;
  onData(cb: (data: Buffer | string) => void): void;
  onError(cb: (err: Error) => void): void;
}

export interface HILSerialSessionOptions {
  port: string;
  baudRate: number;
  format?: 'text' | 'binary';
  transport?: SerialTransport;
}

export class HILSerialSession {
  private port: string;
  private baudRate: number;
  private format: 'text' | 'binary';
  private transport: SerialTransport;
  private running = false;
  private textBuffer = '';
  private discardingText = false;
  private binaryBuffer = Buffer.alloc(0);

  private variableListeners: Array<(update: VariableUpdate) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];

  constructor(opts: HILSerialSessionOptions) {
    this.port = opts.port;
    this.baudRate = opts.baudRate;
    this.format = opts.format || 'text';
    this.transport = opts.transport || this.createDefaultTransport();

    this.transport.onData(data => this.handleIncomingData(data));
    this.transport.onError(err => this.handleError(err));
  }

  public isActive(): boolean {
    return this.running;
  }

  public async start(): Promise<void> {
    if (this.running) return;
    await this.transport.open(this.port, this.baudRate);
    this.running = true;
    this.textBuffer = '';
    this.discardingText = false;
    this.binaryBuffer = Buffer.alloc(0);
  }

  public async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    await this.transport.close();
  }

  public async setOverride(channelName: string, value: number): Promise<void> {
    assertChannelName(channelName);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Invalid override value for '${channelName}': must be a finite number`);
    }
    if (this.format === 'text') {
      await this.transport.write(`${channelName}=${value}\n`);
    } else {
      const frame = encodeBinaryFrame(channelName, value, 'float');
      await this.transport.write(Buffer.from(frame));
    }
  }

  public async releaseOverride(channelName: string): Promise<void> {
    assertChannelName(channelName);
    if (this.format === 'text') {
      await this.transport.write(`${channelName}_release=1\n`);
    } else {
      // In binary, special NaN or sentinel value indicates release
      const frame = encodeBinaryFrame(`${channelName}_release`, 0, 'uint8_t');
      await this.transport.write(Buffer.from(frame));
    }
  }

  public onVariableUpdate(listener: (update: VariableUpdate) => void): () => void {
    this.variableListeners.push(listener);
    return () => {
      this.variableListeners = this.variableListeners.filter(l => l !== listener);
    };
  }

  public onError(listener: (err: Error) => void): () => void {
    this.errorListeners.push(listener);
    return () => {
      this.errorListeners = this.errorListeners.filter(l => l !== listener);
    };
  }

  private handleIncomingData(chunk: Buffer | string): void {
    if (!this.running) return;

    if (this.format === 'text') {
      let text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      if (this.discardingText) {
        const nl = text.indexOf('\n');
        if (nl === -1) return;
        text = text.slice(nl + 1);
        this.discardingText = false;
      }
      this.textBuffer += text;

      let newlineIndex: number;
      while ((newlineIndex = this.textBuffer.indexOf('\n')) !== -1) {
        const line = this.textBuffer.slice(0, newlineIndex).trim();
        this.textBuffer = this.textBuffer.slice(newlineIndex + 1);

        if (line.length > 0) {
          this.parseTextTelemetryLine(line);
        }
      }

      if (this.textBuffer.length > MAX_TEXT_BUFFER) {
        // Unterminated flood: drop it and skip to the next line boundary.
        this.textBuffer = '';
        this.discardingText = true;
      }
    } else {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'binary') : chunk;
      this.binaryBuffer = Buffer.concat([this.binaryBuffer, buf]);

      while (this.binaryBuffer.length >= MIN_BINARY_FRAME_LENGTH) {
        const startIdx = this.binaryBuffer.indexOf(0xAA);
        if (startIdx === -1) {
          this.binaryBuffer = Buffer.alloc(0);
          break;
        }
        if (startIdx > 0) {
          this.binaryBuffer = this.binaryBuffer.subarray(startIdx);
        }
        if (this.binaryBuffer.length < MIN_BINARY_FRAME_LENGTH) break;

        const frameLength = this.binaryBuffer[1];
        if (frameLength < MIN_BINARY_FRAME_LENGTH) {
          // Not a plausible frame start; resync.
          this.binaryBuffer = this.binaryBuffer.subarray(1);
          continue;
        }
        if (frameLength > this.binaryBuffer.length) break; // wait for more data

        const decoded = decodeBinaryFrame(new Uint8Array(this.binaryBuffer.subarray(0, frameLength)));
        if (decoded) {
          this.notifyVariableUpdate(decoded.channelId, decoded.value);
          this.binaryBuffer = this.binaryBuffer.subarray(decoded.length);
        } else {
          this.binaryBuffer = this.binaryBuffer.subarray(1);
        }
      }
    }
  }

  private parseTextTelemetryLine(line: string): void {
    const parsed = decodeTextFrame(line + '\n');
    const now = Date.now();
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'number') {
        this.notifyVariableUpdate(key, val, now);
      }
    }
  }

  private notifyVariableUpdate(variable: string, value: number, timestamp = Date.now()): void {
    const update: VariableUpdate = { variable, value, timestamp };
    for (const listener of this.variableListeners) {
      try {
        listener(update);
      } catch (e) {
        console.error('Error in variable listener', e);
      }
    }
  }

  private handleError(err: Error): void {
    for (const listener of this.errorListeners) {
      try {
        listener(err);
      } catch (e) {
        console.error('Error in error listener', e);
      }
    }
  }

  private createDefaultTransport(): SerialTransport {
    let portInstance: any = null;
    let dataCallback: ((data: Buffer | string) => void) | null = null;
    let errorCallback: ((err: Error) => void) | null = null;

    return {
      async open(port: string, baudRate: number): Promise<void> {
        return new Promise((resolve, reject) => {
          try {
            const { SerialPort } = require('serialport');
            portInstance = new SerialPort({ path: port, baudRate, autoOpen: false });

            portInstance.open((err: Error | null) => {
              if (err) return reject(err);

              portInstance.on('data', (data: Buffer) => {
                if (dataCallback) dataCallback(data);
              });

              portInstance.on('error', (error: Error) => {
                if (errorCallback) errorCallback(error);
              });

              resolve();
            });
          } catch (e) {
            reject(e);
          }
        });
      },
      async close(): Promise<void> {
        return new Promise((resolve) => {
          if (portInstance && portInstance.isOpen) {
            portInstance.close(() => resolve());
          } else {
            resolve();
          }
        });
      },
      async write(data: string | Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
          if (!portInstance || !portInstance.isOpen) {
            return reject(new Error('Port not open'));
          }
          portInstance.write(data, (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          });
        });
      },
      onData(cb: (data: Buffer | string) => void): void {
        dataCallback = cb;
      },
      onError(cb: (err: Error) => void): void {
        errorCallback = cb;
      },
    };
  }
}
