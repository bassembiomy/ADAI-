import { describe, it, expect, vi } from 'vitest';
import { HILSerialSession, type SerialTransport, type VariableUpdate } from './hilSerialSession';
import { encodeBinaryFrame } from './hilProtocol';

class MockSerialTransport implements SerialTransport {
  public isOpen = false;
  public writtenData: string[] = [];
  public writtenBuffers: Buffer[] = [];
  private dataListeners: Array<(data: Buffer | string) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];

  async open(_port: string, _baudRate: number): Promise<void> {
    this.isOpen = true;
  }

  async close(): Promise<void> {
    this.isOpen = false;
  }

  async write(data: string | Buffer): Promise<void> {
    if (typeof data === 'string') {
      this.writtenData.push(data);
    } else {
      this.writtenBuffers.push(data);
    }
  }

  onData(cb: (data: Buffer | string) => void): void {
    this.dataListeners.push(cb);
  }

  onError(cb: (err: Error) => void): void {
    this.errorListeners.push(cb);
  }

  emitData(data: Buffer | string): void {
    for (const listener of this.dataListeners) {
      listener(data);
    }
  }

  emitError(err: Error): void {
    for (const listener of this.errorListeners) {
      listener(err);
    }
  }
}

describe('HILSerialSession', () => {
  it('opens and closes session cleanly', async () => {
    const transport = new MockSerialTransport();
    const session = new HILSerialSession({ transport, port: 'COM3', baudRate: 115200 });

    expect(session.isActive()).toBe(false);
    await session.start();
    expect(session.isActive()).toBe(true);
    expect(transport.isOpen).toBe(true);

    await session.stop();
    expect(session.isActive()).toBe(false);
    expect(transport.isOpen).toBe(false);
  });

  it('decodes incoming text telemetry frames and notifies subscribers', async () => {
    const transport = new MockSerialTransport();
    const session = new HILSerialSession({ transport, port: 'COM3', baudRate: 115200, format: 'text' });
    await session.start();

    const updates: VariableUpdate[] = [];
    session.onVariableUpdate(u => updates.push(u));

    // Telemetry chunk
    transport.emitData('sensor_val=42.5000;actuator_on=1.0000\n');

    expect(updates.length).toBe(2);
    expect(updates[0]).toMatchObject({ variable: 'sensor_val', value: 42.5 });
    expect(updates[1]).toMatchObject({ variable: 'actuator_on', value: 1.0 });

    await session.stop();
  });

  it('buffers partial text frames until newline delimiter', async () => {
    const transport = new MockSerialTransport();
    const session = new HILSerialSession({ transport, port: 'COM3', baudRate: 115200, format: 'text' });
    await session.start();

    const updates: VariableUpdate[] = [];
    session.onVariableUpdate(u => updates.push(u));

    // Partial chunks
    transport.emitData('temp=25.');
    expect(updates.length).toBe(0);

    transport.emitData('4000;speed=100\n');
    expect(updates.length).toBe(2);
    expect(updates[0]).toMatchObject({ variable: 'temp', value: 25.4 });
    expect(updates[1]).toMatchObject({ variable: 'speed', value: 100 });

    await session.stop();
  });

  it('decodes incoming binary frames', async () => {
    const transport = new MockSerialTransport();
    const session = new HILSerialSession({ transport, port: 'COM3', baudRate: 115200, format: 'binary' });
    await session.start();

    const updates: VariableUpdate[] = [];
    session.onVariableUpdate(u => updates.push(u));

    const frame = encodeBinaryFrame('motor_speed', 125.5, 'float');
    transport.emitData(Buffer.from(frame));

    expect(updates.length).toBe(1);
    expect(updates[0].variable).toBe('motor_speed');
    expect(updates[0].value).toBeCloseTo(125.5, 3);

    await session.stop();
  });

  it('sends text override and release commands to device', async () => {
    const transport = new MockSerialTransport();
    const session = new HILSerialSession({ transport, port: 'COM3', baudRate: 115200, format: 'text' });
    await session.start();

    await session.setOverride('sensor_temp', 37.2);
    expect(transport.writtenData).toContain('SET sensor_temp=37.2\n');

    await session.releaseOverride('sensor_temp');
    expect(transport.writtenData).toContain('RELEASE sensor_temp\n');

    await session.stop();
  });

  it('handles transport errors gracefully', async () => {
    const transport = new MockSerialTransport();
    const session = new HILSerialSession({ transport, port: 'COM3', baudRate: 115200 });
    await session.start();

    const errorHandler = vi.fn();
    session.onError(errorHandler);

    transport.emitError(new Error('Device disconnected'));
    expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));

    await session.stop();
  });
});
