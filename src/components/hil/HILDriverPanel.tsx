import React from 'react';
import { Plus, Trash2, ShieldAlert } from 'lucide-react';
import { DriverChannel, PeripheralType, TargetMCU } from '../../engine/hil/hilTypes';
import { v4 as uuidv4 } from 'uuid';

interface HILDriverPanelProps {
  channels: DriverChannel[];
  onChange: (channels: DriverChannel[]) => void;
  target?: TargetMCU;
}

const PERIPHERALS: PeripheralType[] = ['GPIO', 'ADC', 'DAC', 'PWM', 'UART', 'SPI', 'I2C', 'CAN', 'Timer'];
const DATA_TYPES = ['bool', 'uint8_t', 'int8_t', 'uint16_t', 'int16_t', 'uint32_t', 'int32_t', 'float', 'double'] as const;

export const TARGET_PIN_MAPS: Record<TargetMCU, Record<PeripheralType, string[]>> = {
  Arduino_Mega: {
    GPIO: Array.from({ length: 54 }, (_, i) => String(i)).concat(Array.from({ length: 16 }, (_, i) => `A${i}`)),
    ADC: Array.from({ length: 16 }, (_, i) => `A${i}`),
    DAC: ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '44', '45', '46'],
    PWM: ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '44', '45', '46'],
    UART: ['19', '18', '17', '16', '15', '14', '0', '1'],
    SPI: ['53', '51', '50', '52'],
    I2C: ['20', '21'],
    CAN: ['CAN_TX', 'CAN_RX'],
    Timer: ['TIMER1', 'TIMER2', 'TIMER3', 'TIMER4', 'TIMER5']
  },
  Arduino_Uno: {
    GPIO: Array.from({ length: 14 }, (_, i) => String(i)).concat(Array.from({ length: 6 }, (_, i) => `A${i}`)),
    ADC: Array.from({ length: 6 }, (_, i) => `A${i}`),
    DAC: ['3', '5', '6', '9', '10', '11'],
    PWM: ['3', '5', '6', '9', '10', '11'],
    UART: ['10', '11', '0', '1'],
    SPI: ['10', '11', '12', '13'],
    I2C: ['A4', 'A5'],
    CAN: ['CAN_TX', 'CAN_RX'],
    Timer: ['TIMER1', 'TIMER2']
  },
  STM32F4: {
    GPIO: [
      'PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'PA14', 'PA15',
      'PB0', 'PB1', 'PB2', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'PB8', 'PB9', 'PB10', 'PB11', 'PB12', 'PB13', 'PB14', 'PB15',
      'PC0', 'PC1', 'PC2', 'PC3', 'PC4', 'PC5', 'PC6', 'PC7', 'PC8', 'PC9', 'PC10', 'PC11', 'PC12', 'PC13', 'PC14', 'PC15',
      'PD0', 'PD1', 'PD2', 'PD3', 'PD4', 'PD5', 'PD6', 'PD7', 'PD8', 'PD9', 'PD10', 'PD11', 'PD12', 'PD13', 'PD14', 'PD15',
      'PE0', 'PE1', 'PE2', 'PE3', 'PE4', 'PE5', 'PE6', 'PE7', 'PE8', 'PE9', 'PE10', 'PE11', 'PE12', 'PE13', 'PE14', 'PE15'
    ],
    ADC: ['PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PB0', 'PB1', 'PC0', 'PC1', 'PC2', 'PC3', 'PC4', 'PC5'],
    DAC: ['PA4', 'PA5'],
    PWM: ['PA8', 'PA9', 'PA10', 'PA11', 'PB6', 'PB7', 'PB8', 'PB9', 'PC6', 'PC7', 'PC8', 'PC9', 'PE9', 'PE11', 'PE13', 'PE14'],
    UART: ['PA9', 'PA10', 'PA2', 'PA3', 'PC10', 'PC11', 'PB10', 'PB11'],
    SPI: ['PA4', 'PA5', 'PA6', 'PA7', 'PB12', 'PB13', 'PB14', 'PB15'],
    I2C: ['PB6', 'PB7', 'PB8', 'PB9'],
    CAN: ['PD0', 'PD1', 'PB8', 'PB9'],
    Timer: ['TIM1', 'TIM2', 'TIM3', 'TIM4', 'TIM5', 'TIM8']
  },
  STM32F1: {
    GPIO: [
      'PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'PA14', 'PA15',
      'PB0', 'PB1', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'PB8', 'PB9', 'PB10', 'PB11', 'PB12', 'PB13', 'PB14', 'PB15',
      'PC13', 'PC14', 'PC15'
    ],
    ADC: ['PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PB0', 'PB1'],
    DAC: ['PA4', 'PA5'],
    PWM: ['PA0', 'PA1', 'PA2', 'PA3', 'PA8', 'PA9', 'PA10', 'PA11', 'PB6', 'PB7', 'PB8', 'PB9'],
    UART: ['PA9', 'PA10', 'PA2', 'PA3', 'PB10', 'PB11'],
    SPI: ['PA4', 'PA5', 'PA6', 'PA7', 'PB12', 'PB13', 'PB14', 'PB15'],
    I2C: ['PB6', 'PB7', 'PB8', 'PB9'],
    CAN: ['PB8', 'PB9', 'PA11', 'PA12'],
    Timer: ['TIM1', 'TIM2', 'TIM3', 'TIM4']
  },
  ESP32: {
    GPIO: ['0', '2', '4', '5', '12', '13', '14', '15', '16', '17', '18', '19', '21', '22', '23', '25', '26', '27', '32', '33', '34', '35', '36', '39'],
    ADC: ['32', '33', '34', '35', '36', '39'],
    DAC: ['25', '26'],
    PWM: ['2', '4', '12', '13', '14', '15', '16', '17', '18', '19', '21', '22', '23', '25', '26', '27'],
    UART: ['16', '17', '9', '10', '1', '3'],
    SPI: ['5', '18', '19', '23'],
    I2C: ['21', '22'],
    CAN: ['4', '5'],
    Timer: ['TIMER0', 'TIMER1', 'TIMER2', 'TIMER3']
  },
  Generic: {
    GPIO: Array.from({ length: 10 }, (_, i) => `PIN_${i}`),
    ADC: Array.from({ length: 5 }, (_, i) => `ADC_${i}`),
    DAC: ['DAC_0', 'DAC_1'],
    PWM: ['PWM_0', 'PWM_1', 'PWM_2'],
    UART: ['UART_TX', 'UART_RX'],
    SPI: ['SPI_CS', 'SPI_SCK', 'SPI_MOSI', 'SPI_MISO'],
    I2C: ['I2C_SDA', 'I2C_SCL'],
    CAN: ['CAN_TX', 'CAN_RX'],
    Timer: ['SYS_TICK']
  }
};

import { validatePinAssignments, PinValidationIssue } from '../../engine/hil/pinValidator';

export const HILDriverPanel: React.FC<HILDriverPanelProps> = ({ channels, onChange, target = 'Generic' }) => {
  const mcuTarget = target || 'Generic';

  const issues: PinValidationIssue[] = React.useMemo(
    () => validatePinAssignments(channels, { targetLegacy: target }),
    [channels, target]
  );
  const errors = issues.filter(i => i.level === 'error');
  const warnings = issues.filter(i => i.level === 'warning');

  const addChannel = () => {
    const allPins = TARGET_PIN_MAPS[mcuTarget]?.GPIO || TARGET_PIN_MAPS.Generic.GPIO;
    const usedPins = new Set(channels.map(c => c.pin));
    const defaultPin = allPins.find(p => !usedPins.has(p)) || allPins[0] || 'PA0';

    const newCh: DriverChannel = {
      id: uuidv4(),
      name: `ch_${channels.length + 1}`,
      peripheral: 'GPIO',
      pin: defaultPin,
      direction: 'In',
      dataType: 'bool',
      rangeMin: 0,
      rangeMax: 1,
      scalingFactor: 1,
      unit: ''
    };
    onChange([...channels, newCh]);
  };

  const removeChannel = (id: string) => {
    onChange(channels.filter(c => c.id !== id));
  };

  const updateChannel = (id: string, updates: Partial<DriverChannel>) => {
    onChange(channels.map(c => (c.id === id ? { ...c, ...updates } : c)));
  };

  // Find pin conflicts
  const pinCounts = channels.reduce((acc, c) => {
    if (c.pin) acc[c.pin] = (acc[c.pin] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="bg-[#121212] border border-[#222] rounded-xl p-4 flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <div>
          <h2 className="text-md font-bold text-[#e0e0e0] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f97316] animate-pulse"></span>
            Hardware Peripherals & Pins ({mcuTarget.replace('_', ' ')})
          </h2>
          <p className="text-xs text-[#888]">Define pin assignments per peripheral for {mcuTarget}</p>
        </div>
        <button
          onClick={addChannel}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f97316] text-[#0a0a0a] text-xs font-semibold rounded hover:bg-[#ea580c] transition-colors"
        >
          <Plus size={14} /> Add Channel
        </button>
      </div>

      {errors.length > 0 && (
        <div className="mb-3 rounded border border-red-700 bg-red-900/40 p-2 text-xs text-red-300 space-y-1">
          {errors.map((i, idx) => <p key={idx}>PIN ERROR: {i.message}</p>)}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mb-3 rounded border border-yellow-600 bg-yellow-900/30 p-2 text-xs text-yellow-200 space-y-1">
          {warnings.map((i, idx) => <p key={idx}>PIN WARN: {i.message}</p>)}
        </div>
      )}

      <div className="flex-1 overflow-y-auto pr-1 no-scrollbar">
        {channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 border border-dashed border-[#333] rounded-lg text-center p-6 text-[#666]">
            <p className="text-sm">No driver channels defined yet.</p>
            <p className="text-xs mt-1">Click "Add Channel" to create pin assignments.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((ch) => {
              const hasConflict = pinCounts[ch.pin] > 1;

              const allPins = TARGET_PIN_MAPS[mcuTarget]?.[ch.peripheral] || TARGET_PIN_MAPS.Generic[ch.peripheral] || [];
              const usedPinsOtherChannels = new Set(channels.filter(c => c.id !== ch.id).map(c => c.pin));
              const availablePins = allPins.filter(p => !usedPinsOtherChannels.has(p) || p === ch.pin);

              const selectedPinValid = availablePins.includes(ch.pin);
              const currentPin = selectedPinValid ? ch.pin : (availablePins[0] || ch.pin);

              return (
                <div
                  key={ch.id}
                  className={`relative p-3.5 bg-[#181818] border rounded-lg transition-colors duration-200 ${
                    hasConflict ? 'border-red-900/60 bg-red-950/10' : 'border-[#282828] hover:border-[#333]'
                  }`}
                >
                  {hasConflict && (
                    <div className="absolute top-2 right-2 text-red-500 flex items-center gap-1 text-[10px]" title="Pin Conflict Detected">
                      <ShieldAlert size={14} />
                      <span>Conflict</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 mb-2.5">
                    {/* Name */}
                    <div>
                      <label className="block text-[10px] text-[#888] font-medium mb-1">Channel Name</label>
                      <input
                        type="text"
                        value={ch.name}
                        onChange={(e) => updateChannel(ch.id, { name: e.target.value.trim().replace(/[^a-zA-Z0-9_]/g, '') })}
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#f97316]"
                      />
                    </div>

                    {/* Pin Selection Dropdown */}
                    <div>
                      <label className="block text-[10px] text-[#888] font-medium mb-1">
                        Pin ({ch.peripheral} on {mcuTarget.replace('_', ' ')})
                      </label>
                      <select
                        value={currentPin}
                        onChange={(e) => updateChannel(ch.id, { pin: e.target.value })}
                        className={`w-full bg-[#0a0a0a] border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#f97316] ${
                          hasConflict ? 'border-red-800' : 'border-[#2a2a2a]'
                        }`}
                      >
                        {availablePins.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                        {!availablePins.includes(ch.pin) && (
                          <option key={ch.pin} value={ch.pin}>
                            {ch.pin} (Custom)
                          </option>
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-2.5">
                    {/* Peripheral */}
                    <div>
                      <label className="block text-[10px] text-[#888] font-medium mb-1">Peripheral</label>
                      <select
                        value={ch.peripheral}
                        onChange={(e) => {
                          const val = e.target.value as PeripheralType;
                          let direction = ch.direction;
                          let dataType = ch.dataType;
                          if (val === 'ADC') {
                            direction = 'In';
                            dataType = 'uint16_t';
                          } else if (val === 'DAC' || val === 'PWM') {
                            direction = 'Out';
                            dataType = 'uint8_t';
                          }
                          // Auto pick first available pin for new peripheral
                          const newPins = TARGET_PIN_MAPS[mcuTarget]?.[val] || TARGET_PIN_MAPS.Generic[val] || [];
                          const usedPins = new Set(channels.filter(c => c.id !== ch.id).map(c => c.pin));
                          const firstFree = newPins.find(p => !usedPins.has(p)) || newPins[0] || 'PA0';

                          updateChannel(ch.id, { peripheral: val, direction, dataType, pin: firstFree });
                        }}
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-1.5 py-1 text-xs text-white focus:outline-none focus:border-[#f97316]"
                      >
                        {PERIPHERALS.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    {/* Direction */}
                    <div>
                      <label className="block text-[10px] text-[#888] font-medium mb-1">Direction</label>
                      <select
                        value={ch.direction}
                        disabled={ch.peripheral === 'ADC' || ch.peripheral === 'DAC' || ch.peripheral === 'PWM'}
                        onChange={(e) => updateChannel(ch.id, { direction: e.target.value as 'In' | 'Out' })}
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-1.5 py-1 text-xs text-white focus:outline-none focus:border-[#f97316] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="In">Input</option>
                        <option value="Out">Output</option>
                      </select>
                    </div>

                    {/* Data Type */}
                    <div>
                      <label className="block text-[10px] text-[#888] font-medium mb-1">C Data Type</label>
                      <select
                        value={ch.dataType}
                        onChange={(e) => updateChannel(ch.id, { dataType: e.target.value as any })}
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-1.5 py-1 text-xs text-white focus:outline-none focus:border-[#f97316]"
                      >
                        {DATA_TYPES.map((dt) => (
                          <option key={dt} value={dt}>{dt}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Math scaling configurations */}
                  <div className="grid grid-cols-4 gap-2 border-t border-[#222]/80 pt-2">
                    <div>
                      <label className="block text-[9px] text-[#666] mb-0.5">Min Range</label>
                      <input
                        type="number"
                        value={ch.rangeMin}
                        onChange={(e) => updateChannel(ch.id, { rangeMin: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1 py-0.5 text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-[#666] mb-0.5">Max Range</label>
                      <input
                        type="number"
                        value={ch.rangeMax}
                        onChange={(e) => updateChannel(ch.id, { rangeMax: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1 py-0.5 text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-[#666] mb-0.5">Scale Coeff</label>
                      <input
                        type="number"
                        step="any"
                        value={ch.scalingFactor}
                        onChange={(e) => updateChannel(ch.id, { scalingFactor: parseFloat(e.target.value) || 1 })}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1 py-0.5 text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-[#666] mb-0.5">Unit</label>
                      <input
                        type="text"
                        placeholder="e.g. V, Hz"
                        value={ch.unit}
                        onChange={(e) => updateChannel(ch.id, { unit: e.target.value })}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1 py-0.5 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => removeChannel(ch.id)}
                    className="absolute bottom-2.5 right-2 px-1.5 py-1 text-red-500 hover:text-red-400 hover:bg-red-950/20 rounded transition-colors"
                    title="Delete Channel"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
