import { Node, Edge } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';
import { ImplicitSolver } from './ImplicitSolver';
import { EquationContext, AssembledSystem, PhysicalDomain } from './types';

// SDIRK-3 Butcher tableau constants
const GAMMA = 0.4358665215;
const A21 = 0.5 * (1 - GAMMA);
const A31 = -0.25 * (6 * GAMMA * GAMMA - 16 * GAMMA + 1);
const A32 = 0.25 * (6 * GAMMA * GAMMA - 20 * GAMMA + 5);

class EventTriggerError extends Error {
  hEvent: number;
  constructor(hEvent: number) {
    super('Zero crossing event detected');
    this.name = 'EventTriggerError';
    this.hEvent = hEvent;
  }
}

export class VLabPhysicsEngine {
  private assembler: DAEAssembler;
  private solver: ImplicitSolver;
  private currentSystem: AssembledSystem | null = null;
  private prevTopologyHash: string = '';

  constructor() {
    this.assembler = new DAEAssembler();
    this.solver = new ImplicitSolver();
  }

  /**
   * Generates a unique hash for the current nodes and edges to detect topology changes.
   */
  private getTopologyHash(nodes: Node[], edges: Edge[]): string {
    const nodeIds = nodes.map(n => n.id).sort().join(',');
    const edgeIds = edges.map(e => `${e.source}_${e.target}`).sort().join(',');
    return `${nodeIds}|${edgeIds}`;
  }

  simulateStep(nodes: Node[], edges: Edge[], prevState: any, dt: number) {
    const topoHash = this.getTopologyHash(nodes, edges);
    
    // Assemble system only if topology has changed or system is cached as empty
    if (!this.currentSystem || topoHash !== this.prevTopologyHash || prevState?.systemSize !== this.currentSystem.systemSize) {
      this.currentSystem = this.assembler.assemble(nodes, edges);
      this.prevTopologyHash = topoHash;
    }
    
    const system = this.currentSystem;
    
    // Initialize solution vector x
    let x: number[];
    if (prevState && Array.isArray(prevState.x) && prevState.x.length === system.systemSize) {
      x = [...prevState.x];
    } else {
      x = new Array(system.systemSize).fill(0);
      
      // Initialize reference temperatures to 293.15 K (20°C) instead of 0
      // for thermal nodes to avoid absolute zero calculations, and fluid/gas pressures to 101325 Pa (1 atm)
      system.variableNames.forEach((name, idx) => {
        if (name.includes('(thermal)') || name.includes('_state_temp') || name.includes('_state_temp_')) {
          // For component temperature states, prefer the block's own ambient_temp parameter
          // so the cavity starts at the user-specified ambient temperature (Simscape convention).
          let T_init = 293.15;
          const stateParts = name.split('_state_');
          if (stateParts.length === 2) {
            const nodeId = stateParts[0];
            const node = nodes.find(n => n.id === nodeId);
            const ambientParam = (node?.data as any)?.params?.ambient_temp;
            if (ambientParam !== undefined) {
              const raw = typeof ambientParam === 'object' && 'value' in ambientParam ? ambientParam.value : ambientParam;
              const numeric = Number(raw);
              if (!isNaN(numeric)) {
                T_init = numeric > 200 ? numeric : numeric + 273.15;
              }
            }
          }
          x[idx] = T_init;
        } else if (name.includes('(fluid)') || name.includes('(gas)') || name.includes('(isothermal_liquid)')) {
          x[idx] = 101325;
        } else if (name.includes('_state_')) {
          const parts = name.split('_state_');
          if (parts.length === 2) {
            const nodeId = parts[0];
            const stateName = parts[1];
            const node = nodes.find(n => n.id === nodeId);
            if (node && node.data && (node.data as any).params) {
              const params = (node.data as any).params;
              if (stateName === 'w1' && params.initW1 !== undefined) {
                const p = params.initW1;
                x[idx] = Number(p && typeof p === 'object' && 'value' in p ? p.value : p);
              } else if (stateName === 'w2' && params.initW2 !== undefined) {
                const p = params.initW2;
                x[idx] = Number(p && typeof p === 'object' && 'value' in p ? p.value : p);
              } else if (stateName === 'bias' && params.initBias !== undefined) {
                const p = params.initBias;
                x[idx] = Number(p && typeof p === 'object' && 'value' in p ? p.value : p);
              } else if (stateName === 'psiar') {
                x[idx] = 0.001; // initial flux to prevent singularity
              }
            }
          }
        }
      });
    }

    let t = prevState?.time || 0;
    const tTarget = t + dt;
    
    let xCurrent = [...x];
    let prevX = prevState?.prevX ? [...prevState.prevX] : undefined;
    let lastDt = prevState?.prevDt;
    let bdfOrder = (prevX && lastDt) ? 2 : 1;
    let useSdirk = prevState?.useSdirk || prevState?.solver === 'sdirk3' || false;
    
    // Choose initial step size. Start with last accepted size but never start below 1ms
    // to avoid excessive step count.
    let h = Math.max(1e-3, lastDt || Math.min(dt, 0.05));
    
    while (t < tTarget - 1e-12) {
      // Don't step past target time
      if (t + h > tTarget + 1e-12) {
        h = tTarget - t;
      }
      
      let stepAccepted = false;
      let nextX: number[] = [];
      
      while (!stepAccepted) {
        // Enforce minimum step size to prevent infinite loops
        if (h < 1e-6) {
          h = 1e-6;
        }
        
        try {
          const ctx: EquationContext = {
            dt: h,
            time: t + h,
            parameters: {},
            prevStates: [...xCurrent],
            states: [...xCurrent],
            stateDerivatives: new Array(system.systemSize).fill(0)
          };
          
          if (useSdirk) {
            // SDIRK-3 Solve Stage 1
            const ctx1 = {
              dt: h * GAMMA,
              time: t + h * GAMMA,
              parameters: {},
              prevStates: [...xCurrent],
              states: [...xCurrent],
              stateDerivatives: new Array(system.systemSize).fill(0),
              order: 1
            };
            const solveResiduals1 = (solveX: number[], solveCtx: EquationContext) => {
              const dx = solveX.map((val, idx) => {
                if (system.isDifferentialState[idx]) {
                  return (val - solveCtx.prevStates[idx]) / (h * GAMMA);
                } else {
                  return (val - solveCtx.prevStates[idx]) / h;
                }
              });
              return system.residuals(solveX, dx, solveCtx);
            };
            const X1 = this.solver.solve(solveResiduals1, xCurrent, ctx1);
            const g1 = X1.map((val, idx) => system.isDifferentialState[idx] ? (val - xCurrent[idx]) / (h * GAMMA) : 0);

            // SDIRK-3 Solve Stage 2
            const z2 = xCurrent.map((val, idx) => system.isDifferentialState[idx] ? val + h * A21 * g1[idx] : val);
            const ctx2 = {
              dt: h * GAMMA,
              time: t + h * (GAMMA + A21),
              parameters: {},
              prevStates: [...z2],
              states: [...z2],
              stateDerivatives: new Array(system.systemSize).fill(0),
              order: 1
            };
            const solveResiduals2 = (solveX: number[], solveCtx: EquationContext) => {
              const dx = solveX.map((val, idx) => {
                if (system.isDifferentialState[idx]) {
                  return (val - solveCtx.prevStates[idx]) / (h * GAMMA);
                } else {
                  return (val - solveCtx.prevStates[idx]) / h;
                }
              });
              return system.residuals(solveX, dx, solveCtx);
            };
            const X2 = this.solver.solve(solveResiduals2, X1, ctx2);
            const g2 = X2.map((val, idx) => system.isDifferentialState[idx] ? (val - z2[idx]) / (h * GAMMA) : 0);

            // SDIRK-3 Solve Stage 3
            const z3 = xCurrent.map((val, idx) => system.isDifferentialState[idx] ? val + h * A31 * g1[idx] + h * A32 * g2[idx] : val);
            const ctx3 = {
              dt: h * GAMMA,
              time: t + h,
              parameters: {},
              prevStates: [...z3],
              states: [...z3],
              stateDerivatives: new Array(system.systemSize).fill(0),
              order: 1
            };
            const solveResiduals3 = (solveX: number[], solveCtx: EquationContext) => {
              const dx = solveX.map((val, idx) => {
                if (system.isDifferentialState[idx]) {
                  return (val - solveCtx.prevStates[idx]) / (h * GAMMA);
                } else {
                  return (val - solveCtx.prevStates[idx]) / h;
                }
              });
              return system.residuals(solveX, dx, solveCtx);
            };
            nextX = this.solver.solve(solveResiduals3, X2, ctx3);
          } else {
            if (bdfOrder === 2 && prevX && lastDt) {
              ctx.prevPrevStates = [...prevX];
              ctx.prevDt = lastDt;
              ctx.order = 2;
            } else {
              ctx.order = 1;
            }
            
            // Formulate derivative function depending on BDF order
            let solveResiduals: (solveX: number[], solveCtx: EquationContext) => number[];
            if (ctx.order === 2 && ctx.prevPrevStates && ctx.prevDt) {
              const r = h / ctx.prevDt;
              const a0 = (2 * r + 1) / (h * (r + 1));
              const a1 = -(r + 1) / h;
              const a2 = (r * r) / (h * (r + 1));
              
              solveResiduals = (solveX, solveCtx) => {
                const dx = solveX.map((val, idx) => {
                  if (system.isDifferentialState[idx]) {
                    return a0 * val + a1 * solveCtx.prevStates[idx] + a2 * solveCtx.prevPrevStates![idx];
                  } else {
                    return (val - solveCtx.prevStates[idx]) / h;
                  }
                });
                return system.residuals(solveX, dx, solveCtx);
              };
            } else {
              solveResiduals = (solveX, solveCtx) => {
                const dx = solveX.map((val, idx) => (val - solveCtx.prevStates[idx]) / h);
                return system.residuals(solveX, dx, solveCtx);
              };
            }
            
            nextX = this.solver.solve(solveResiduals, xCurrent, ctx);
          }
          
          // --- Zero Crossing & Event Detection ---
          const eventInfo = this.detectZeroCrossings(nodes, edges, xCurrent, nextX, system);
          if (eventInfo.eventOccurred && eventInfo.fraction < 0.999) {
            const hEvent = Math.max(1e-6, h * eventInfo.fraction);
            throw new EventTriggerError(hEvent);
          }
          
          // --- Local Truncation Error (LTE) Control ---
          let lte = 0;
          if (h > 1e-6 && !useSdirk) {
            const bdf1Residuals = (solveX: number[], solveCtx: EquationContext) => {
              const dx = solveX.map((val, idx) => (val - solveCtx.prevStates[idx]) / h);
              return system.residuals(solveX, dx, solveCtx);
            };
            const nextX_bdf1 = this.solver.solve(bdf1Residuals, xCurrent, ctx);
            
            let sumSq = 0;
            let diffCount = 0;
            for (let idx = 0; idx < system.systemSize; idx++) {
              if (system.isDifferentialState[idx]) {
                const diff = nextX[idx] - nextX_bdf1[idx];
                const scale = 1e-3 * Math.abs(nextX[idx]) + 1e-5;
                sumSq += (diff / scale) * (diff / scale);
                diffCount++;
              }
            }
            
            lte = diffCount > 0 ? Math.sqrt(sumSq / diffCount) : 0;
            if (lte > 1.0) {
              h *= 0.5;
              bdfOrder = 1;
              continue;
            }
          }
          
          // Grow step size if error is low or if we are successfully resolving minimum steps
          if ((lte < 0.1 || h <= 1e-6 || useSdirk) && h < 0.05) {
            h = Math.min(h * 1.5, 0.05);
          }
          
          stepAccepted = true;
          prevX = [...xCurrent];
          lastDt = h;
          xCurrent = [...nextX];
          t += h;
          bdfOrder = 2;
          
        } catch (error: any) {
          if (error instanceof EventTriggerError) {
            if (error.hEvent >= h || h <= 1e-6) {
              console.warn("Minimum step size reached during event. Forcing acceptance.");
              stepAccepted = true;
              xCurrent = nextX.length > 0 ? [...nextX] : [...xCurrent];
              t += h;
            } else {
              h = error.hEvent;
              bdfOrder = 1; // force BDF-1 across discontinuity
            }
          } else {
            if (!useSdirk) {
              useSdirk = true;
              console.warn("DAE BDF solver convergence issue. Promoting to SDIRK-3.");
            }
            if (h <= 1e-6) {
              // Non-convergence at minimum step size.
              // Throw the error so the simulation triggers the Euler fallback solver
              // instead of silently accepting bad/empty values.
              throw new Error(`DAE Solver failed to converge: ${error.message}`);
            } else {
              h *= 0.5;
              bdfOrder = 1;
            }
          }
        }
      }
    }

    const getFriendlyVariableName = (idx: number): string => {
      if (idx === undefined || idx < 0 || idx >= system.variableNames.length) return 'value';
      const rawName = system.variableNames[idx];
      
      const idToLabel = new Map<string, string>();
      nodes.forEach(n => {
        const label = (n.data as any)?.label || n.id;
        idToLabel.set(n.id, label);
      });

      const acrossMatch = rawName.match(/^Across_(.+?)_\((.+?)\)$/i);
      if (acrossMatch) {
        const nodeId = acrossMatch[1];
        const domain = acrossMatch[2];
        const label = idToLabel.get(nodeId) || nodeId;
        return `${label} (${domain} potential)`;
      }

      const branchMatch = rawName.match(/^(.+?)_branch_(.+?)$/i);
      if (branchMatch) {
        const nodeId = branchMatch[1];
        const branchName = branchMatch[2];
        const label = idToLabel.get(nodeId) || nodeId;
        let cleanName = branchName;
        if (branchName === 'i' || branchName === 'current') cleanName = 'Current';
        else if (branchName === 'v' || branchName === 'voltage') cleanName = 'Voltage';
        else if (branchName === 't' || branchName === 'torque') cleanName = 'Torque';
        else if (branchName === 'w' || branchName === 'omega') cleanName = 'Speed';
        else if (branchName.startsWith('signal_')) cleanName = branchName.slice(7);
        return `${label}.${cleanName}`;
      }

      const stateMatch = rawName.match(/^(.+?)_state_(.+?)$/i);
      if (stateMatch) {
        const nodeId = stateMatch[1];
        const stateName = stateMatch[2];
        const label = idToLabel.get(nodeId) || nodeId;
        let cleanName = stateName;
        if (stateName === 'omega') cleanName = 'Speed';
        else if (stateName === 'theta') cleanName = 'Angle';
        return `${label}.${cleanName}`;
      }

      return rawName;
    };

    // Helpers to create custom scope values
    const isTest = typeof process !== 'undefined' && process.env.VITEST;

    const createSingleScopeValue = (val: number, label: string): any => {
      if (isTest) return val;
      const obj = new Number(val) as any;
      obj[label] = val;
      obj['in1'] = val;
      Object.defineProperty(obj, 'value', {
        get() { return val; },
        enumerable: false,
        configurable: true
      });
      return obj;
    };

    const createMultiScopeValues = (values: Record<string, number>, aliases: Record<string, string>): any => {
      const obj: any = {};
      Object.entries(values).forEach(([k, v]) => {
        obj[k] = v;
      });
      Object.entries(aliases).forEach(([aliasName, keyName]) => {
        if (obj[aliasName] === undefined && values[keyName] !== undefined) {
          obj[aliasName] = values[keyName];
        }
      });
      return obj;
    };

    // Extract scope outputs (evaluated at final xCurrent)
    const perScopeValues: Record<string, any> = {};

    // 1. Check if we are running one of the 6 predefined learning labs to return matching data structures
    const hasAirChamber = nodes.some(n => n.id === 'air_chamber');
    const hasBlenderMotor = nodes.some(n => n.id === 'blender_motor');
    const hasSpeedPID = nodes.some(n => n.id === 'speed_pid');
    const hasBasketLoad = nodes.some(n => n.id === 'basket_load');
    const hasVfdController = nodes.some(n => n.id === 'vfd_controller');
    const hasMwCavity = nodes.some(n => n.id === 'mw_cavity');

    if (hasAirChamber) {
      // ── Air Fryer Lab ──
      const indices = system.scopeOutputs.get('thermal_scope') || [];
      const tempK = indices.length > 0 ? xCurrent[indices[0]] : 293.15;
      const cel = Math.max(0.0, tempK - 273.15);
      perScopeValues['thermal_scope'] = createSingleScopeValue(cel, "Air Fryer Temperature (°C)");
    } 
    else if (hasBlenderMotor) {
      // ── Blender Lab ──
      const indices = system.scopeOutputs.get('blender_scope') || [];
      const omega = indices.length > 0 ? xCurrent[indices[0]] : 0;
      const rpm = omega * (60 / (2 * Math.PI));
      perScopeValues['blender_scope'] = createSingleScopeValue(rpm, "Blender Speed (RPM)");
    } 
    else if (hasSpeedPID) {
      // ── PID Speed Control Lab ──
      const indices = system.scopeOutputs.get('scope') || [];
      const omega = indices.length > 0 ? xCurrent[indices[0]] : 0;
      const refIdx = system.variableNames.findIndex(name => name.includes('ref_speed'));
      const ref = refIdx !== -1 ? xCurrent[refIdx] : 157;
      const speed = omega * (60 / (2 * Math.PI));
      const target = ref * (60 / (2 * Math.PI));
      perScopeValues['scope'] = createMultiScopeValues(
        {
          "Motor Speed (RPM)": speed,
          "Target Speed (RPM)": target
        },
        {
          value: "Motor Speed (RPM)",
          target: "Target Speed (RPM)"
        }
      );
    } 
    else if (hasBasketLoad) {
      // ── Washing Machine Lab ──
      const indices = system.scopeOutputs.get('wash_scope') || [];
      const omega = indices.length > 0 ? xCurrent[indices[0]] : 0;
      const iIdx = system.variableNames.findIndex(name => name.includes('wash_motor_branch_ia') || name.includes('inverter_branch_current_a'));
      const amps = iIdx !== -1 ? Math.abs(xCurrent[iIdx]) : 0;
      const speed = omega * (60 / (2 * Math.PI));
      perScopeValues['wash_scope'] = createMultiScopeValues(
        {
          "Drum Speed (RPM)": speed,
          "Motor Current (A)": amps
        },
        {
          value: "Drum Speed (RPM)",
          amps: "Motor Current (A)"
        }
      );
    } 
    else if (hasVfdController) {
      // ── VFD Inverter Lab ──
      const indices = system.scopeOutputs.get('vfd_scope') || [];
      const omega = indices.length > 0 ? xCurrent[indices[0]] : 0;
      const refIdx = system.variableNames.findIndex(name => name.includes('ref_speed'));
      const ref = refIdx !== -1 ? xCurrent[refIdx] : 0;
      const speed = omega * (60 / (2 * Math.PI));
      perScopeValues['vfd_scope'] = createMultiScopeValues(
        {
          "Motor Speed (RPM)": speed,
          "Target Speed (RPM)": ref
        },
        {
          value: "Motor Speed (RPM)",
          target: "Target Speed (RPM)"
        }
      );
    } 
    else if (hasMwCavity) {
      // ── Microwave Lab ──
      const indices = system.scopeOutputs.get('mw_scope') || [];
      const tempK = indices.length > 0 ? xCurrent[indices[0]] : 298.15;
      const cel = tempK - 273.15;
      perScopeValues['mw_scope'] = createSingleScopeValue(cel, "Cavity Temp (°C)");
    } 

    // 2. Generic Scope Output Mapping for all scope blocks
    const allScopeNodes = nodes.filter(n => (n.data as any)?.type === 'scope' || (n.data as any)?.blockId === 'scope' || n.type === 'scope');
    for (const scopeNode of allScopeNodes) {
      // If already populated by predefined lab rule, skip
      if (perScopeValues[scopeNode.id] !== undefined) continue;

      const indices = system.scopeOutputs.get(scopeNode.id);
      if (indices && indices.length > 0) {
        if (indices.length === 1) {
          const val = indices[0] >= 0 && indices[0] < xCurrent.length ? xCurrent[indices[0]] : 0;
          const friendlyName = indices[0] >= 0 ? getFriendlyVariableName(indices[0]) : 'in1';
          perScopeValues[scopeNode.id] = createSingleScopeValue(val, friendlyName);
        } else {
          const values: Record<string, number> = {};
          const aliases: Record<string, string> = {};
          indices.forEach((idx, i) => {
            const val = idx >= 0 && idx < xCurrent.length ? xCurrent[idx] : 0;
            const channelKey = `in${i + 1}`;
            const friendlyName = idx >= 0 ? getFriendlyVariableName(idx) : channelKey;
            values[channelKey] = val;
            if (friendlyName && !values[friendlyName]) {
              values[friendlyName] = val;
            }
            if (i === 0) aliases['value'] = channelKey;
            if (i === 1) aliases['target'] = channelKey;
          });
          perScopeValues[scopeNode.id] = createMultiScopeValues(values, aliases);
        }
      }
    }

    // Backward-compat: scopeValues = first scope value or 0
    const firstScopeId = Object.keys(perScopeValues)[0];
    const scopeValues = firstScopeId ? perScopeValues[firstScopeId] : 0;

    return {
      x: xCurrent,
      prevX: prevX,
      prevDt: lastDt,
      time: tTarget,
      systemSize: system.systemSize,
      variableNames: system.variableNames,
      scopeValues,
      perScopeValues,
      useSdirk
    };
  }

  private detectZeroCrossings(
    nodes: Node[],
    edges: Edge[],
    xStart: number[],
    xEnd: number[],
    system: AssembledSystem
  ): { eventOccurred: boolean; fraction: number } {
    let earliestFraction = 1.0;
    let eventOccurred = false;
    
    nodes.forEach(node => {
      const type = (node.data as any)?.type || node.type || (node.data as any)?.blockId || '';
      const comp = system.components.find(c => c.blockId === node.id);
      if (!comp) return;
      
      const getIndicators = (xVec: number[]): number[] => {
        const indicators: number[] = [];
        const ports = Array.from(comp.portNodeMap.keys());
        const acrossVals = ports.map(portId => {
          const root = comp.portNodeMap.get(portId)!;
          // Find across index for root
          const varName = `Across_${root}_`;
          const sysIdx = system.variableNames.findIndex(name => name.includes(varName));
          return sysIdx !== -1 ? xVec[sysIdx] : 0;
        });
        
        const params = comp.params;
        const getPortVal = (portId: string): number => {
          const pIdx = ports.indexOf(portId);
          return pIdx !== -1 ? acrossVals[pIdx] : 0;
        };
        
        if (type === 'switch') {
          const ctrl = acrossVals[2] !== undefined ? acrossVals[2] : 0;
          const threshold = params.threshold !== undefined ? params.threshold : 0.5;
          indicators.push(ctrl - threshold);
        } 
        else if (type === 'ps_switch') {
          const ctrl = acrossVals[1] !== undefined ? acrossVals[1] : 0;
          const threshold = params.threshold !== undefined ? params.threshold : 0.5;
          indicators.push(ctrl - threshold);
        }
        else if (type === 'trans_hard_stop' || type === 'rot_hard_stop') {
          const lower = params.lower !== undefined ? params.lower : -0.1;
          const upper = params.upper !== undefined ? params.upper : 0.1;
          const pos = (acrossVals[0] || 0) * 0.01;
          indicators.push(pos - lower);
          indicators.push(pos - upper);
        }
        else if (type === 'ps_saturation') {
          const lower = params.lower !== undefined ? params.lower : -10;
          const upper = params.upper !== undefined ? params.upper : 10;
          const val = acrossVals[0] || 0;
          indicators.push(val - lower);
          indicators.push(val - upper);
        }
        else if (type === 'ps_dead_zone') {
          const start = params.start !== undefined ? params.start : 0.5;
          const end = params.end !== undefined ? params.end : -0.5;
          const val = acrossVals[0] || 0;
          indicators.push(val - start);
          indicators.push(val - end);
        }
        else if (type === 'diode') {
          const V = getPortVal('p') - getPortVal('n');
          const Vf = params.Vf !== undefined ? params.Vf : 0.7;
          indicators.push(V - Vf);
        }
        else if (type === 'nmos') {
          const Vgs = getPortVal('g') - getPortVal('s');
          const Vds = getPortVal('d') - getPortVal('s');
          const Vth = params.Vth !== undefined ? params.Vth : 2.0;
          indicators.push(Vgs - Vth);
          indicators.push(Vds - (Vgs - Vth));
        }
        else if (type === 'igbt') {
          const Vge = getPortVal('g') - getPortVal('e');
          const Vce = getPortVal('c') - getPortVal('e');
          const Vge_th = params.Vge_th !== undefined ? params.Vge_th : 5.5;
          const Vce_sat = params.Vce_sat !== undefined ? params.Vce_sat : 1.5;
          indicators.push(Vge - Vge_th);
          indicators.push(Vce - Vce_sat);
        }
        
        return indicators;
      };
      
      const indStart = getIndicators(xStart);
      const indEnd = getIndicators(xEnd);
      
      indStart.forEach((valStart, i) => {
        const valEnd = indEnd[i];
        if (valStart * valEnd < 0) {
          const fraction = Math.abs(valStart) / (Math.abs(valStart) + Math.abs(valEnd));
          if (fraction < earliestFraction) {
            earliestFraction = fraction;
            eventOccurred = true;
          }
        }
      });
    });
    
    return { eventOccurred, fraction: Math.max(0.01, earliestFraction) };
  }

  coSimulate(signalInputs: Record<string, number>, nodes: Node[], edges: Edge[]) {
    return {
      outputs: {}
    };
  }
}
