/** Reviewed instruction supplements. Registry values remain authoritative. */
export interface BlockGuidance { description: string; behavior?: string; example?: string; equation?: string; parameters?: Record<string, string> }
export const BLOCK_GUIDANCE: Record<string, BlockGuidance> = {};
function add(id: string, description: string, example?: string, behavior?: string) {
  BLOCK_GUIDANCE[`xbridges:${id}`] = { description, example, behavior };
}
add('AND', 'Returns true only when every input is truthy.', 'Inputs [1, 0] produce false; [1, 1] produce true.');
add('OR', 'Returns true when at least one input is truthy.', 'Inputs [0, 1] produce true.');
add('NOT', 'Negates the truth value of its input.', 'Input 0 produces true; input 2 produces false.');
add('XOR', 'Returns true for an odd number of truthy inputs.', 'Inputs [1, 1, 1] produce true; [1, 1] produce false.');
for (const [id, text, example] of [
  ['BitwiseOR', 'Combines the set bits of two signed 32-bit integers using JavaScript bitwise OR.', 'Inputs 5 and 3 produce 7.'],
  ['BitwiseXOR', 'Sets each bit where two signed 32-bit integer inputs differ.', 'Inputs 5 and 3 produce 6.'],
  ['BitwiseNOT', 'Complements every bit after converting the input to a signed 32-bit integer.', 'For a zero input, the signed output is -1.'],
  ['ShiftLeft', 'Shifts signed 32-bit input bits left by the second input; JavaScript masks the shift count to five bits.', 'Inputs 3 and 2 produce 12.'],
  ['ShiftRight', 'Shifts signed 32-bit input bits right with sign extension.', 'Inputs -8 and 2 produce -2.'],
  ['Constant', 'Emits the configured value, parsing MATLAB-style scalar, vector and matrix text.', 'Set value to [1 2 3] to emit the vector [1,2,3].'],
  ['VectorAdd', 'Adds inputs element by element with scalar broadcasting through VectorUtils.', 'Inputs [1,2] and [3,4] produce [4,6].'],
  ['VectorSub', 'Subtracts the second input from the first element by element.', 'Inputs [3,5] and [1,2] produce [2,3].'],
  ['VectorMul', 'Multiplies all inputs element by element with scalar broadcasting.', 'Inputs [2,3] and 2 produce [4,6].'],
  ['VectorDiv', 'Divides the first input by the second element by element.', 'Inputs [4,6] and 2 produce [2,3].'],
  ['VectorPow', 'Raises each base element to the corresponding exponent.', 'Inputs [2,3] and 2 produce [4,9].'],
  ['UnaryNeg', 'Changes the sign of every scalar, vector or matrix element.', 'Input [1,-2] produces [-1,2].'],
  ['Abs', 'Returns the absolute value of each scalar, vector or matrix element.', 'Input [-1,2] produces [1,2].'],
  ['SumElements', 'Reduces input elements to their sum through VectorUtils.', 'Input [1,2,3] produces 6.'],
  ['Mean', 'Reduces input elements to their arithmetic mean through VectorUtils.', 'Input [2,4] produces 3.'],
  ['Max', 'A single array input is reduced to its maximum; multiple inputs use element-wise maximum.', 'Single input [1,5,2] produces 5.'],
  ['MatrixMul', 'Performs matrix multiplication through VectorUtils rather than element-wise multiplication.', 'Multiply [[1,0],[0,1]] by [[2,3],[4,5]] to preserve the second matrix.'],
  ['Transpose', 'Interchanges matrix rows and columns.', 'Input [[1,2],[3,4]] produces [[1,3],[2,4]].'],
  ['Inverse', 'Computes a matrix inverse through VectorUtils; use a nonsingular square matrix.', 'Input [[2,0],[0,4]] produces [[0.5,0],[0,0.25]].'],
  ['Determinant', 'Computes the determinant of a square matrix through VectorUtils.', 'Input [[2,0],[0,3]] produces 6.'],
  ['MatrixConcat', 'Concatenates inputs sequentially along the configured axis.', 'With axis 0, concatenate [[1,2]] and [[3,4]] into two rows.'],
  ['IdentityMatrix', 'Emits a square identity matrix; dim is floored and clamped to at least one.', 'Set dim to 2 to emit [[1,0],[0,1]].'],
  ['SubMatrix', 'Selects a rectangular submatrix using configured row and column index ranges.', 'Use all index defaults (0) on [[1,2],[3,4]] to select the first element.'],
  ['MatrixSolve', 'Solves the linear system A*x=B using VectorUtils.', 'A=[[2,0],[0,4]] and B=[2,8] give x=[1,2].'],
  ['Integrator', 'Integrates a signal from its initial condition.', 'A constant input of 2 with initialCondition 1 gives y=1+2t.', 'The output is the current state. Its derivative is exactly the input; the selected continuous solver advances that state.'],
  ['INTEGRATOR_CONTINUOUS', 'Integrates a scalar signal using continuous solver state.', 'Input 1 and initial_condition 0 yield y=t.', 'The output reads state.y; the derivative is Number(input). The continuous solver advances state.'],
  ['Scope', 'Records sampled input histories with decimation, optional sample interval and a bounded buffer.', 'Connect Step to In 1; with defaults, retain up to 1000 samples.', 'Each execution increments a step count. Decimation and sampleTime decide whether to append. Vector raw values are retained beside the first scalar display value; no output port is driven.'],
  ['DEMUX', 'Returns vector elements as separate outputs; a scalar becomes one output.', 'Input [2,5] produces output values 2 and 5.'],
  ['IF_ELSE', 'Selects the true or false data input using JavaScript truthiness of cond.', 'cond=1, u_true=5 and u_false=2 produce 5.'],
  ['SWITCH_CASE', 'Floors a one-based selector and selects that input index, falling back to case 1 when absent.', 'selector=2, case 1=10 and case 2=20 produce 20. Selector 0 reads the selector itself.'],
  ['PRODUCT', 'Multiplies numeric inputs, or divides an accumulator by every input in divide mode.', 'Multiply mode inputs [2,3] produce 6. Divide mode [6,2] produces 0.5 because the first input is also included in the reduction.'],
  ['DATA_TYPE_CONVERSION', 'Converts a scalar into a configured integer, floating-point, boolean or fixed-point representation.', 'Select uint8, floor and saturate; input 300 becomes 255.', 'Validates output type, rounding and overflow policy before xbConvertScalar. Invalid settings return output zero with a runtime error. Float16 and Float64 require the corresponding support flags.'],
  ['TERMINATOR', 'Consumes an input without producing a signal or updating a state.', 'Connect an unused signal to u; there are no output ports.'],
  ['DFlipFlop', 'Stores a boolean data input on a rising clock edge.', 'Drive D=1, CLK from 0 to 1 and RST=0 to obtain Q=1 and Q!=0.', 'Reset has priority and clears Q. Otherwise a rising clock edge samples D; without an edge Q is held. Q! is the complement.'],
] as const) add(id, text, example);
BLOCK_GUIDANCE['xbridges:Integrator'].behavior = 'The output is the current state. Its derivative is exactly the input; the selected continuous solver advances that state.';
BLOCK_GUIDANCE['xbridges:INTEGRATOR_CONTINUOUS'].behavior = 'The output reads state.y; the derivative is Number(input). The continuous solver advances state.';
BLOCK_GUIDANCE['xbridges:DFlipFlop'].behavior = 'Reset has priority and clears Q. Otherwise a rising clock edge samples D; without an edge Q is held. Q! is the complement.';
for (const id of ['MatrixDiag', 'DiagExtract', 'ExtractDiag', 'Diag']) add(id, 'Calls the same VectorUtils.diag operation: a vector creates a diagonal matrix and a matrix yields its diagonal; diagMode does not change this execute function.', 'Input [2,3] creates [[2,0],[0,3]]. A matrix input extracts its diagonal.');
BLOCK_GUIDANCE['vlab:resistor'] = { description: 'Models an electrical resistance with Ohm’s law and dissipates electrical energy.', behavior: 'The terminal voltage is v_p−v_n. Current flows p to n as I=(v_p−v_n)/R. R must be strictly positive.', example: 'With R=100 Ω and a 10 V terminal voltage, current is 0.1 A and dissipation is 1 W.' };

const robot: Record<string, [string, string]> = {
  LIDAR_SENSOR: ['Raycasts 45 beams spaced 8 degrees apart around a supplied pose; accepts a pose array or separate X,Y,θ inputs. The second output carries the pose array.', 'Connect [0,0,0] to X/Pose Array and inspect the 45 range values.'],
  ODOMETRY_SENSOR: ['Integrates encoder count differences into planar pose using wheel radius, separation and counts per revolution; heading is wrapped using atan2.', 'Equal increases of 360 counts move both wheels one circumference forward without changing heading.'],
  CLIFF_IR: ['Emits 0.6 when |x| or |y| exceeds 2.8, otherwise 0.05. The cliff_threshold parameter is currently unread.', 'Pose [3,0] gives cliff 0.6; [0,0] gives 0.05.'],
  DUSTBIN_SENSOR: ['A 2D grid produces the percentage of positive cells; without a grid, fill is min(100,5+0.5t+random noise).', 'Grid [[1,0],[1,0]] produces 50 percent.'],
  MOTOR_CURRENT: ['Adds absolute left and right currents; a zero total uses the synthetic 0.5+0.15 sin(3.7t) current.', 'Inputs -0.3 and 0.4 produce motor current 0.7.'],
  ROOM_SEGMENTATION: ['Classifies position into four fixed rooms split at x=0.5 and y=-1.', 'Position (0,0) returns room 1; (1,0) returns room 2.'],
  SEMANTIC_MAP: ['Classifies a fixed map: dock region returns 2, the central corridor returns 1, other cells return 0.', 'Position (0,-2.8) returns 2 for the dock region.'],
  COVERAGE_PLANNER: ['Passes the numeric room segment through as the coverage plan; semantic_map is currently unread.', 'Room segment 3 gives coverage plan 3.'],
  ROOM_SCHEDULER: ['Always emits the fixed schedule [1,2,4,3]; semantic_map is currently unread.', 'Attach the output to Goal Manager and inspect the same four-room schedule each step.'],
  BATTERY_MONITOR: ['Flags return-to-dock when battery percentage is no greater than distance to (0,-2.8) times drain_rate plus safety_margin.', 'At the dock with defaults, battery 5 percent sets status 1.'],
  GOAL_MANAGER: ['Chooses [0,-2.8] for a nonzero battery status and [1.5,1.5] otherwise; schedule and estimated pose do not affect this selection.', 'battery_status=1 yields dock target [0,-2.8].'],
  WAYPOINT_GEN: ['Tracks mapping, zig-zag cleaning and exiting phases with a 0.3 arrival tolerance. Low battery overrides to the dock waypoint [0,-2.8].', 'Set battery_status=1 to switch the active waypoint to [0,-2.8].'],
  SURFACE_ADAPTER: ['Returns carpet flag 1 for x>0,y>0 or x<-1,y<-1; other positions return 0.', 'Position (1,1) returns surface 1.'],
  CLIFF_HALT: ['Returns halt 1 for cliff_val>0.3, otherwise 0; the surface input is currently unread.', 'cliff_val=0.6 produces halt command 1.'],
  VELOCITY_PID: ['Passes the two numeric components of Velocity CMD through; Kp and Ki are currently unread and no PID state is updated.', 'Input [0.2,0.1] produces the same Speed PWM vector [0.2,0.1].'],
  MODE_SUPERVISOR: ['A nonzero halt input turns suction and brush off; otherwise their outputs are 0.8 and 0.6.', 'halt_cmd=1 produces [0,0]; halt_cmd=0 produces [0.8,0.6].'],
  BUMPER_SENSOR: ['Calls the fixed-room collision check at the supplied X,Y and returns 1 for collision or 0 for free space.', 'Connect estimated X and Y and route Bump State to obstacle avoidance logic.'],
  SIDE_BRUSH: ['Computes brush PWM times (1+0.1w), where w is the second element of Speed PWM.', 'Speed [0,2] and brush PWM 0.6 produce torque 0.72.'],
  SUCTION_PWM: ['Scales the numeric suction PWM by 240.', 'Suction PWM 0.8 produces suction force 192.'],
  TERRAIN_MODEL: ['Returns friction 0.35 in the two fixed carpet regions and 0.15 elsewhere; accepts a pose array or separate X,Y.', 'Pose [1,1] returns friction 0.35.'],
  COLLISION_MESH: ['Always emits the identifiers circle1,circle2,box1,box2; X,Y are currently unread.', 'Inspect Mesh to receive the four fixed geometry identifiers.'],
  DOCK_BEACON: ['Returns 1/(1+distance²) from the pose to the fixed dock at (0,-2.8).', 'At [0,-2.8], beacon is 1.'],
  CAPACITY_THRESHOLD: ['Returns 1 only when dust input is strictly greater than the configured limit.', 'With limit 85, dust=85 returns 0 and dust=86 returns 1.'],
  HALT_ALERT: ['Converts the numeric threshold flag into 1 if truthy, otherwise 0.', 'Threshold flag 1 produces Halt & Alert 1.'],
  DOCK_DETECT: ['Returns 1 when battery status is nonzero OR beacon exceeds 0.95; it does not require both.', 'Battery status 1 with beacon 0 still reports docked 1.'],
  RESUME_SCHEDULER: ['Returns 0 while docked is nonzero and 1 otherwise.', 'docked=1 produces resume=0.'],
};
for (const [id, [description, example]] of Object.entries(robot)) add(`ROBOT_VACUUM_${id}`, description, example);
for (const [id, token] of Object.entries({ FURNITURE_MESH: 'furniture_mesh', DIRT_DENSITY: 'dirt_density', ROOM_ZONE_COLORS: 'zone_colors', COVERAGE_HEATMAP: 'coverage_heatmap', DOCK_ICON: 'dock_icon', BATTERY_HUD: 'hud_battery', DUSTBIN_HUD: 'hud_dustbin' })) {
  add(`ROBOT_VACUUM_${id}`, `Emits the fixed visualization token ${token}; its inputs do not drive a physical simulation in this execute function.`, `Connect the output to the scene visualizer; the token remains ${token} every step.`);
}
add('ROBOT_VACUUM_3D_VIZ_COLORS', 'Emits the four fixed room colors #10b981, #3b82f6, #f59e0b and #ef4444; goal_path is currently unread.', 'Inspect Room Colors to see the same four colors each step.');

for (const [id, formula, example] of [
  ['COS', 'cos(u)', 'angle_unit=degrees and u=60 produce approximately 0.5.'],
  ['TAN', 'tan(u)', 'angle_unit=degrees and u=45 produce approximately 1.'],
  ['COT', '1/tan(u)', 'angle_unit=degrees and u=45 produce approximately 1.'],
  ['SEC', '1/cos(u)', 'angle_unit=degrees and u=60 produce approximately 2.'],
] as const) add(id, `Computes ${formula} on a numeric scalar. When angle_unit is degrees, converts input to radians first. Singularities follow JavaScript floating-point arithmetic.`, example);
for (const [id, formula, example] of [
  ['ASIN', 'asin(u)', 'u=0.5 with angle_unit=degrees produces approximately 30.'],
  ['ACOS', 'acos(u)', 'u=0.5 with angle_unit=degrees produces approximately 60.'],
  ['ATAN', 'atan(u)', 'u=1 with angle_unit=degrees produces 45.'],
  ['ACOT', 'atan(1/u)', 'u=1 with angle_unit=degrees produces 45.'],
  ['ASEC', 'acos(1/u)', 'u=2 with angle_unit=degrees produces approximately 60.'],
  ['ACOSEC', 'asin(1/u)', 'u=2 with angle_unit=degrees produces approximately 30.'],
] as const) add(id, `Computes ${formula} on a numeric scalar. The result is radians unless angle_unit is degrees. Out-of-domain values follow the underlying JavaScript Math function.`, example);
for (const [id, formula, example] of [
  ['SINH', 'sinh(u)', 'u=0 produces 0.'], ['COSH', 'cosh(u)', 'u=0 produces 1.'],
  ['TANH', 'tanh(u)', 'u=0 produces 0.'], ['COTH', '1/tanh(u)', 'u=1 produces approximately 1.313.'],
  ['SECH', '1/cosh(u)', 'u=0 produces 1.'], ['COSECH', '1/sinh(u)', 'u=1 produces approximately 0.851.'],
  ['ASINH', 'asinh(u)', 'u=0 produces 0.'], ['ACOSH', 'acosh(u)', 'u=1 produces 0.'],
  ['ATANH', 'atanh(u)', 'u=0 produces 0.'], ['ACOTH', 'atanh(1/u)', 'u=2 produces approximately 0.5493.'],
  ['ASECH', 'acosh(1/u)', 'u=1 produces 0.'],
] as const) add(id, `Computes ${formula} on Number(input), using JavaScript hyperbolic functions. These blocks have no angle-unit conversion or editable parameters.`, `Numerical example: ${example}`);
add('ACOSECH', 'The current implementation computes reciprocal sine, 1/sin(u), rather than inverse hyperbolic cosecant. It has no declared editable parameters; default input interpretation is radians.', 'Input π/2 produces 1. This documents the implemented behavior and the naming discrepancy.');
add('THREE_PHASE_PWM', 'Compares three normalized phase references with an accumulated sawtooth phase; Saddle/SVPWM methods subtract the midpoint of the largest and smallest reference before comparison.', 'At t=0, references [0,0,0] normalize to 0.5 and all three gates output 1.');
add('SIX_STEP_COMMUTATION', 'Thresholds three Hall inputs at 0.5, decodes their three-bit code and selects six high/low gate commands; invalid codes 000 and 111 disable every gate.', 'Hall [1,0,1] produces [AH,AL,BH,BL,CH,CL]=[1,0,0,1,0,0].');
add('SENSORLESS_SIX_STEP', 'Detects sign changes of the floating phase voltage relative to the three-phase average; advances a six-step sequence and estimates speed from twice the zero-crossing interval. Threshold and Vdc are currently unused.', 'Initial step 1 produces phase commands [1,-1,0]; a floating-phase sign change advances to step 2.');
add('DC_VOLTAGE_SOURCE', 'Emits the configured numeric DC voltage on Vdc+ and zero on Vdc−; this is signal-based power modeling.', 'The default voltage 400 produces [400,0].');
add('THREE_PHASE_LOAD', 'Divides each phase voltage by resistance, using a minimum resistance of 0.001 and a zero-value fallback to 10.', 'With R=10 and voltages [100,-50,-50], currents are [10,-5,-5].');
add('THREE_PHASE_INVERTER', 'Each gate above 0.5 selects the DC bus difference; otherwise its pole is zero. Subtracts the mean pole voltage to obtain line-to-neutral outputs. Ron and Vf are currently unused.', 'Vdc+=300, Vdc−=0 and gates [1,0,0] yield phase voltages [200,-100,-100].');
add('SINGLE_PHASE_H_BRIDGE', 'Outputs the difference of two gate-selected DC bus voltages; gates are true above 0.5. Ron is currently unused.', 'DC bus 12 V and gates [1,0] produce 12 V; [0,1] produce -12 V.');
add('VOLTAGE_REFERENCE_GENERATOR', 'Generates three amplitude-scaled sine references with successive phase offsets of 120 degrees, using the Freq input.', 'Amplitude 1 and t=0 give [0,-√3/2,+√3/2].');
add('FIELD_ORIENTED_CONTROL', 'Transforms two phase currents to dq, integrates reference errors with dt=max(1e-6,t-lastTime), computes two PI voltages and applies inverse Park/Clarke for three phase references.', 'At θ=0, ia=0, ib=0, id_ref=1 and iq_ref=0, the d-axis proportional term is Kp and the q-axis error is zero.');
add('CLARKE_TRANSFORM', 'Computes α=Ia and β=(Ia+2Ib)/√3 for balanced two-current input; Ic is reconstructed by the balanced-system assumption.', 'Ia=1 and Ib=-0.5 produce α=1 and β=0.');
add('Inport', 'Bridges a parent input into a subsystem. If the incoming value is undefined, emits stored state.value or the configured numeric value.', 'With value=5 and no incoming value, emits 5. An incoming value of 0 passes through as 0.');
add('Outport', 'Passes its input unchanged to the parent subsystem output.', 'Input [2,3] passes through as the same vector.');
add('Subsystem', 'Represents a hierarchical container. The factory itself has no ports and executes with an empty output list; child-model wiring supplies subsystem behavior.', 'Create child Inport and Outport blocks inside the container to expose model connections.');
add('PARK_TRANSFORM', 'Rotates stationary αβ into dq with d=αcosθ+βsinθ and q=−αsinθ+βcosθ; θ is radians.', 'At θ=0, inputs α=1,β=2 produce d=1,q=2.');
add('INVERSE_PARK', 'Rotates dq into stationary αβ with α=dcosθ−qsinθ and β=dsinθ+qcosθ; θ is radians.', 'At θ=0, d=1,q=2 produce α=1,β=2.');
add('INVERSE_CLARKE', 'Reconstructs three balanced phase values: a=α, b=−α/2+√3β/2 and c=−α/2−√3β/2.', 'α=1,β=0 produce phases [1,-0.5,-0.5].');
add('CURRENT_CONTROLLER_DQ', 'First scales the requested current vector to iMax, then integrates separate d/q errors and returns two PI control voltages. dt is clamped to at least 1e-6.', 'References [3,4] with iMax=2.5 are limited to [1.5,2] before feedback subtraction.');
add('DOE_MODEL', 'Evaluates a schemaVersion=1 deployed DOE model when present, otherwise legacy RSM equations, GMDH layers or nearest-level Taguchi effects. Invalid configuration returns NaN, an error and lastFault diagnostics.', 'A legacy RSM equation X1*2 with inputNames=[X1] and X1=3 predicts 6.');
add('SPEED_CONTROLLER', 'Integrates speed error, computes Kp*error+Ki*integral and clamps the current reference to ±maxIq; the integral continues to accumulate under saturation.', 'With default maxIq=10 and a large positive speed error, Iq* is clamped to 10.');
add('FLUX_REFERENCE', 'Emits Number(value) constantly. The mode parameter currently does not implement speed-dependent field weakening.', 'Set value=2 to emit d-axis reference 2 at every time step.');
add('ROTOR_POSITION_ESTIMATOR', 'Hall_sensor mode decodes voltage sectors into angles; other modes estimate back-EMF from voltage minus Rs*current minus Ls*current derivative, derive angle and smooth speed. Speed is limited to ±500.', 'Hall_sensor with phase voltages [1,0,1] selects code 5 and angle π/3.');
add('SECTOR_SELECTOR', 'Converts angle radians to degrees, applies (degrees+360)%360 and divides into nominal 60-degree sectors numbered from 1.', 'Input π/3 returns sector 2; input 0 returns sector 1.');
add('SWITCHING_TIME_CALCULATOR', 'Uses Vref, sector angle, Vdc and Ts inputs to calculate T1=Ts√3Vref/Vdc sin(π/3−θs), T2=Ts√3Vref/Vdc sinθs and T0=Ts−T1−T2; each result is independently clamped to zero.', 'Vref=0 with Ts=0.0001 yields [T1,T2,T0]=[0,0,0.0001].');
add('SVPWM_GATE_GENERATOR', 'Folds time within Ts around Ts/2 and compares it with sector-dependent thresholds made from T0/4,T1/2,T2/2 to generate three phase gates.', 'With sector=1,T1=T2=0,T0=Ts, all gates turn on when folded time exceeds Ts/4.');
add('ZERO_SEQUENCE_INJECTION', 'Subtracts the midpoint of the largest and smallest phase reference from all three phases.', 'Input [1,0,-0.5] has midpoint 0.25 and produces [0.75,-0.25,-0.75].');
add('SATURATION', 'Clamps a numeric input between lowerLimit and upperLimit; NaN is propagated.', 'With default limits -1 and 1, input 3 produces 1.');
add('DEADZONE', 'Returns zero inside [lowerLimit,upperLimit]; outside, subtracts the nearest bound from the input. NaN is propagated.', 'Default bounds ±0.5 give input 2 an output of 1.5.');
add('RATE_LIMITER', 'Clamps the change from previousOutput using risingSlewRate and fallingSlewRate times Number(sampleTime)||1. Inherited sample time therefore uses dt=1 in this execute function.', 'With defaults and previous output 0, an input 5 produces output 1.');
add('RELAY', 'Turns on for u>=switchOn, stays on while u>switchOff and turns off at or below switchOff.', 'With defaults, inputs 1,0.5,0 produce outputs true,true,false.');
add('WHITE_NOISE', 'Generates Gaussian samples using Box–Muller and scales by sqrt(variance), then adds mean; it uses Math.random and is not deterministically seeded.', 'Mean 2 and variance 4 produce samples centered on 2 with standard deviation 2.');
add('BAND_LIMITED_NOISE', 'Generates Gaussian noise and applies a first-order low-pass recursion with τ=1/(2πfc), dt=max(1e-6,t-lastTime) and α=dt/(τ+dt).', 'Set fc=100 and connect y to Scope; observe a filtered random signal with state carried between steps.');
add('HIGH_PASS_FILTER', 'For positive sampleTime, uses y=α(y_prev+u−u_prev) with α=τ/(τ+sampleTime). Continuous mode outputs state.y+u with derivative −2πfc*(state.y+u).', 'A constant step initially appears at the output and decays toward zero.');
add('NUMERIC_REPRESENTATION', 'Converts a scalar according to fixed_point or floating_point mode and outputs both the converted value and quantization error. Unsupported mode/type/policy reports a runtime error.', 'Fixed point with fractionLength=8 and floor rounds 0.1 down to 25/256=0.09765625.');
add('DOE_MODULE', 'The execute function returns stored state.model or null and a prediction of zero. Dataset and Train inputs currently do not initiate training in this function.', 'A newly created module with default state produces [null,0] even when Train=1.');
add('MTPA_FW_MANAGER', 'Computes saliency-dependent MTPA d/q current references, limits their magnitude to i_max, and activates field weakening when estimated voltage exceeds 0.95*Vdc/√3. The v_max parameter is currently unread.', 'Zero torque and zero speed produce id_ref=0,iq_ref=0 and FW_Active=0.');
add('DEM_WASHING_MACHINE_TWIN', 'The factory execute function passes its input unchanged; the connected drum and particle blocks provide actual twin dynamics.', 'Input [1,2] is emitted unchanged as [1,2].');
add('DEM_DRUM', 'Converts RPM to ω=RPM*2π/60, advances drum angle and optional pulsator angle and emits drum_state. The fourth execute argument is treated as dt only between 0 and 0.05, otherwise 0.016 is used.', 'At 60 RPM with dt=0.01, angular velocity is 2π rad/s and angle increases by 0.02π rad.');
add('DEM_PARTICLE_SYSTEM', 'Initializes two 4×4 particle sheets by default, sums contact/bond/fluid forces with gravity, updates velocity and position, constrains drum/rib/pulsator collisions and accumulates a synthetic cleanliness metric peaked at 55 RPM.', 'With default sheets, positions and velocities each contain 64 flattened x/y components for 32 particles.');
add('DEM_HERTZ_CONTACT', 'Computes equal-and-opposite particle pair forces for positive overlap using stiffness_normal*overlap^1.5 and inward forces for drum-wall penetration; emits flattened x/y force pairs.', 'Two radius-0.05 particles at [0,0] and [0.08,0] overlap by 0.02 and receive opposing forces.');
add('ROBOT_VACUUM_SENSOR_FUSION_EKF', 'Predicts pose from odometry increments, propagates a 3×3 covariance with fixed Q, and corrects toward reference pose using a Kalman gain and fixed R when innovation covariance is nonsingular.', 'Connect reference and odometry poses both [0,0,0]; the estimated pose stays at the origin.');
add('ROBOT_VACUUM_COLLISION_AVOID', 'Tests four forward speeds and seven yaw rates over eight 0.15-second prediction steps, rejecting trajectories closer than collision_dist to LiDAR points. Scores heading, goal distance and speed; falls back to escape turning or low-speed steering.', 'Connect a target waypoint and 45-beam ranges; the output is [linear speed,yaw rate] for the highest-scoring admissible trajectory.');
add('ROBOT_VACUUM_3D_SCENE_VIEW', 'Stores pose, estimated pose, grid, ranges, battery and dust in visualization state. Appends a trail after movement exceeds 0.05 and caps each trail at 1000 points. The Animation signal output remains zero.', 'Supply pose [1,2,0,1.1,2.1,0]; state records separate true and estimated positions for display.');
add('DEM_BOND_FABRIC', 'Builds horizontal, vertical and diagonal fabric bonds over sheet grids, then applies equal-and-opposite forces bond_stiffness*(distance−restLength). Emits flattened force pairs and absolute bond magnitudes.', 'A horizontal rest length of 0.08 stretched to 0.10 with stiffness 150 produces bond force magnitude 3.');
add('DEM_FLUID_COUPLING', 'Below the fill-level waterline, computes drag_coeff times rotating-fluid velocity minus particle velocity; above the waterline forces are zero.', 'At zero drum speed, a submerged particle with velocity [1,0] and drag_coeff=0.8 receives [-0.8,0].');
add('CFD_SPH_WATER_SOLVER', 'Initializes fluid particles, advances them with gravity and supplied coupling forces, resolves drum/lifter/pulsator collisions and estimates wall torque and a velocity/height-based slosh metric. Density, viscosity, smoothing length and SPH stiffness are currently unread in the execute dynamics.', 'Default num_fluid_particles=20 produces 40 flattened position and velocity components. This implementation does not calculate an SPH pressure field.');
add('DEM_CFD_COSIMULATION_INTERFACE', 'For each DEM/fluid pair closer than 0.1, applies drag_coeff times relative velocity to the DEM particle and its negative to the fluid particle. drag_model is currently unread.', 'Coincident particles with DEM velocity [0,0], fluid velocity [1,0] and drag_coeff=0.8 produce opposing [0.8,0] and [-0.8,0] forces.');
add('FABRIC_HARMONIC_ANALYZER', 'Averages particle positions for eccentricity, applies mass*eccentricity*ω² forcing to a two-axis spring-damper suspension with damping 100, integrates displacement and returns its magnitude. Velocity and fluid-force inputs are currently unread.', 'Symmetric particle positions [1,0,-1,0] have zero eccentricity; with zero initial suspension state, vibration remains zero.');
add('CFD_DEM_SURROGATE_LEARNER', 'Predicts four metrics with separate affine RPM models, updates their weights/biases in training mode, then searches RPM 15..140 in steps of 5 to maximize predicted cleanliness−200*vibration. Fill input does not enter predictions.', 'With initial weights and rpm=0, predictions are vibration 0.01, cleanliness 10, torque 0.4 and slosh 0.3.');
add('KALMAN_FILTER', 'Estimates linear-system state from the configured model, measurements and covariance settings. Statistical quality depends on model and noise assumptions.', 'Provide a measurement signal consistent with the configured C matrix and inspect the state estimate against that measurement.');
add('FUZZY_PID_CONTROLLER', 'Uses a built-in fuzzy inference system to adapt PID gains from error and error-rate inputs. Model-specific validation is needed before comparing control performance.', 'Compare the Control output to a fixed-gain PID on the same plant and input; inspect changes in the gain outputs.');
const elementaryExamples: Record<string, string> = {
  NAND: 'Inputs [1,1] produce false; [1,0] produce true.', NOR: 'Inputs [0,0] produce true; [0,1] produce false.',
  BitwiseAND: 'Inputs 5 and 3 produce 1 after signed 32-bit conversion.',
  JKFlipFlop: 'With RST=0 and J=K=1, each rising clock edge toggles Q.',
  Register: 'With default bitWidth=8, Data=257, EN=1 and a rising CLK edge store 1.',
  Counter: 'With maxValue=2 and EN=1, rising edges count 1,2,0; RST clears the count.',
  Clock: 'At default freq=1 Hz, the output is 1 at t=0 and 0 at t=0.5 seconds.',
  WaveformGen: 'Default sine settings produce 0 at t=0 and 1 at t=0.25 seconds.',
  Step: 'Default settings output 0 before t=1 second and 1 starting at t=1.',
  Sum: 'Set signs to +-; inputs 5 and 2 produce 3.',
  MUX: 'Inputs 2 and 5 produce the vector [2,5], preserving input ordering.',
  GAIN: 'Set gain=3; input [1,2] produces [3,6].',
  SWITCH: 'Default criteria > and threshold 0 select u1=5 for ctrl=1, otherwise u2=2.',
  SIN: 'angle_unit=degrees with input 90 produces 1.',
  INTEGRATOR_DISCRETE: 'For backward_euler, constant u=2 over an elapsed dt=0.1 adds 0.2 to the stored integral.',
  INTEGRATOR: 'Set initialCondition=0 and constant input 1; with limits disabled the continuous output is y=t.',
  DERIVATIVE: 'Connect a step and observe a transient derivative response that decays with the configured tau.',
  STATE_SPACE: 'A=[[-1]], B=[[1]], C=[[1]], D=[[0]], x0=[0] represent a first-order unit-gain lag.',
  TRANSFER_FUNCTION: 'Numerator [1] and denominator [1,1] represent 1/(s+1), a first-order unit-gain lag.',
  ZERO_POLE_GAIN: 'Empty zeros, poles [-1] and gain 1 represent 1/(s+1).',
  SVPWM_CORE: 'Zero voltage-vector inputs give sector 1, T1=0,T2=0 and T0=Ts.',
  DISCRETE_IMPULSE: 'Default amplitude=1, delay=0 and sampleTime=0.1 output a pulse at sample zero.',
  LOW_PASS_FILTER: 'Apply a constant step and observe output approaching it with time constant 1/(2πfc).',
  FUZZY_MF_TRIMF: 'With vertices a=0,b=1,c=2, input x=1 has membership 1 and x=0.5 has membership 0.5.',
  FUZZY_MF_TRAPMF: 'With a=0,b=1,c=2,d=3, every input between 1 and 2 has membership 1.',
  FUZZY_MF_GAUSSMF: 'At the configured center c, membership is exp(0)=1.',
  FUZZY_MF_SIGMF: 'At the configured crossover c, membership is 0.5.',
  FUZZY_AND: 'With minimum method, memberships 0.2 and 0.8 give 0.2; product method gives 0.16.',
  FUZZY_OR: 'With maximum method, memberships 0.2 and 0.8 give 0.8; probabilistic OR gives 0.84.',
  FUZZY_NOT: 'Input membership 0.3 produces complement membership 0.7.',
  Note: 'Set text to Motor control loop to annotate the diagram; the block has no simulation signals.',
  PWM_GENERATOR: 'Drive Duty=0.5, choose triangle carrier and route PWM to Scope. Gates are high when the duty exceeds the current triangle-carrier value; reduce the simulation step to resolve pulses.',
  SVPWM_MODULATOR: 'Set both αβ reference inputs to zero. The internal SVPWM_CORE returns T0=Ts and the gate generator produces equal three-phase pulse patterns.',
  DELAY: 'With delay_length=2 and initial_condition=0, feed the sequence 1,2,3,4 and inspect the output two simulation steps behind the input.',
  PID_CONTROLLER: 'Set mode=P, Kp=2, beta=1 and limits wide enough; Ref=3, Feedback=1, Enable=1 and Reset=0 produce proportional control 4. Reset=1 clears all five outputs.',
  UNIT_DELAY: 'Set initialCondition=0 and sampleTime=0.1; drive a step and inspect y as the previous sampled input rather than the current input.',
  MEMORY: 'Set initialCondition=0; connect a changing input and inspect y from the preceding integration step.',
  LAPLACE_TRANSFORM: 'Configure a supported polynomial mapping and connect the DOE-derived polynomial. Compare the response against the displayed denominator P(s); invalid polynomial payloads must be corrected before interpreting output.',
  DISCRETE_TRANSFER_FUNCTION: 'Use numerator [1] and denominator [1,-0.5] at a positive sampleTime; compare the sampled response to the configured H(z), not a continuous Laplace response.',
  PID_BASIC: 'Set mode=P, Kp=2, Enable=1 and Reset=0. Supply Error=3 (compute reference minus feedback upstream); Control is 6 within the limits. Reset=1 clears the output and state.',
  MOVING_AVERAGE: 'Feed alternating low and high samples and set window_size=4; inspect the output as the retained sample window fills and older samples are removed.',
  EXTENDED_KALMAN_FILTER: 'Configure f and h for the same nonlinear plant and connect its measurements. Compare estimated state with simulated state while varying Q and R, and inspect errors when model expressions or dimensions are invalid.',
  MPC_CONTROLLER: 'Connect a state/reference signal for the configured A,B,C,D model. Set finite u_min/u_max and inspect whether Control stays within those constraints as the reference changes; compare prediction and control horizons Np/Nc. Use Q=[[10]] for the default single-output C=[[1,0]]; the factory Q default is incompatible. The solver uses 20 projected fast-gradient iterations and does not apply D.',
  AC_INDUCTION_MOTOR: 'Drive Va,Vb,Vc with balanced three-phase voltages and hold load torque constant. Plot mechanical speed, electromagnetic torque and phase currents; increase load torque to observe the opposing term in the mechanical equation.',
  IM_SCALAR_CONTROL: 'Sweep the frequency reference with v_f_ratio held fixed. Inspect phase-voltage amplitude against V/f scaling and low-frequency boost, using the generated phase outputs to drive an induction motor.',
  IM_FOC_CONTROL: 'Close the speed/current loop around the induction-motor model using matching pole-pair and inductance parameters. Step the speed reference and inspect dq current references and phase commands.',
  IM_FLUX_OBSERVER: 'Connect measured stator currents and rotor speed from the same induction motor. Inspect estimated flux magnitude and angle while changing the motor operating point, keeping Rr,Lr,Lm consistent.',
  VF_SLIP_COMP: 'Hold the commanded operating frequency and vary measured q-axis current. Inspect the added slip compensation compared with a fixed V/f command.',
  FIELD_WEAKENING: 'Raise measured terminal voltage above v_max and inspect the d-axis reference reduction, bounded by id_min and id_max. Return voltage below the limit to examine recovery.',
  MTPA_CONTROLLER: 'Supply a torque request with Ld,Lq and psi_m matching the motor. Inspect the resulting d/q references; compare the equal-inductance case to the salient-pole case.',
  AC_MOTOR_PID_CONTROL: 'Step the speed target w_ref while retaining the default motor parameters. Plot motor speed against the target, then add load torque tl and inspect PID regulation and control saturation.',
  LMS_ADAPTIVE_FILTER: 'Provide x and desired d=2*x with a positive learning rate. Observe prediction, error and learned filter weights across samples; compare error before and after adaptation.',
  NEURAL_NEURON_LEARNING: 'Supply two input signals and a bounded target compatible with tanh output. Inspect prediction and error while weights and bias adapt; reduce learning rate if updates become unstable.',
  RL_Q_LEARNING_CONTROLLER: 'Connect regulation error to the agent. Compare epsilon=0 with nonzero exploration and inspect selected actions from the configured discrete action set while Q values update.',
  AIR_FRYER_LEARNING_MODEL: 'Step heater command with fan operation held steady. Plot chamber temperature and the estimated gain/time constant; vary fan command to observe its convection contribution.',
  ROBOT_VACUUM_BATTERY: 'Connect left/right motor currents and start undocked. Observe charge decreasing under load, then assert the docked input and observe the configured charging contribution.',
  ROBOT_VACUUM_COMM: 'Send a changing command with packet_loss_rate=0 and inspect received values after latency_ms. Increase packet loss and compare retained/dropped command behavior.',
  ROBOT_VACUUM_BOUSTROPHEDON_SWEEP: 'Select a room zone and supply estimated pose. Observe alternating scan waypoints at configured spacing and progression as pose reaches each target.',
  ROBOT_VACUUM_ERODE_MASK: 'Supply the room free-space mask and set a positive robot radius. Compare the output mask with the original near walls; narrow corridors may disappear after erosion.',
  ROBOT_VACUUM_DOOR_TRACKER: 'Move the estimated pose through a room doorway and inspect the stored entry-door identifier used for later return routing.',
  ROBOT_VACUUM_DOOR_CROSSING: 'Supply a target-room crossing trajectory. Observe the completion flag when the robot centroid reaches target-room cells, rather than when only the waypoint is selected.',
  ROBOT_VACUUM_CONTINUOUS_ENERGY: 'Supply battery level and a return route to the dock. Increase route length or energy_per_meter and inspect when the required reserve exceeds available energy.',
  ROBOT_VACUUM_TOPOLOGY_RETURN: 'Supply current room and the dock room using the fixed connectivity graph. Inspect the ordered door-hop sequence and use it as targets for the local path planner.',
  ROBOT_VACUUM_THETA_STAR: 'Supply a free-space grid, start and goal. Inspect the path around occupied cells and line-of-sight shortcuts; increase inflation to keep the route farther from walls.',
  ROBOT_VACUUM_DIGITAL_TWIN: 'Run the integrated twin with default geometry and motor parameters. Inspect true pose, estimated pose, battery and coverage together as the mission advances through cleaning and docking states.',
  ROBOT_VACUUM_MOTOR: 'Drive a wheel voltage command and inspect wheel speed, current and encoder counts. Reverse voltage to examine direction while keeping motor_R,motor_L,motor_K and inertia consistent.',
  ROBOT_VACUUM_DYNAMICS: 'Apply equal left/right wheel speeds and observe forward motion with near-zero yaw rate. Apply unequal speeds and inspect the resulting heading change.',
  ROBOT_VACUUM_ENVIRONMENT: 'Drive pose around the fixed room map. Inspect the collision flag and LiDAR ranges as the robot approaches an obstacle; compare the displayed map with the detected geometry.',
  ROBOT_VACUUM_ODOMETRY: 'Increase both encoder counts equally. Compare forward displacement with one wheel circumference per encoder_cpr and inspect near-zero heading change.',
  ROBOT_VACUUM_FUSION: 'Connect odometry increments, gyro/reference signals and true pose from the same twin. Compare corrected pose against raw dead reckoning when odometry drifts.',
  ROBOT_VACUUM_SLAM: 'Supply scan ranges and changing pose. Inspect occupancy updates and pose corrections when the robot revisits previously observed geometry.',
  ROBOT_VACUUM_NAV: 'Run with a valid room grid and pose estimate. Reduce battery during cleaning and inspect the mission transition into return/docking behavior along with coverage statistics.',
  ROBOT_VACUUM_KINEMATICS: 'Set linear speed target 0 and a nonzero angular target. The inverse differential-drive relation gives opposing left/right wheel references for rotation in place.',
  ROBOT_VACUUM_WHEEL_CONTROL: 'Provide equal positive wheel-speed references with zero measured speeds. Inspect positive PI voltage commands and their clipping to the configured battery-voltage limits.',
  ROBOT_VACUUM_ENCODER: 'Supply wheel speeds and inspect quantized incremental encoder counts. Compare the default noisy result with noise_std reduced to zero.',
  ROBOT_VACUUM_LIDAR: 'Connect pose [x,y,theta] from the twin. Inspect the eight range beams and their angles as a wall comes within lidar_max_range.',
  ROBOT_VACUUM_LOCALIZATION: 'Connect true/reference and dead-reckoning pose from the same simulation. Inspect estimated pose and covariance while varying filter gain and odometry error.',
  ROBOT_VACUUM_MAPPING: 'Supply range scans and pose estimates. Compare occupancy, obstacle and free-space grid outputs before and after the same wall is scanned repeatedly.',
  ROBOT_VACUUM_COVERAGE: 'Supply the room grid and estimated pose. Follow the generated sweep waypoints and inspect coverage progression as the robot visits successive cells.',
  ROBOT_VACUUM_GLOBAL_PLANNER: 'Supply a grid containing an obstacle between start and goal. Inspect the collision-free route and the next waypoint selected for the local controller.',
  ROBOT_VACUUM_OBSTACLE_AVOIDANCE: 'Supply a forward waypoint and then introduce short front-range returns. Inspect reductions in commanded forward speed and changes in local steering.',
  ROBOT_VACUUM_MOTION_CONTROLLER: 'Provide a waypoint ahead of the estimated pose and inspect steering commands. Move the waypoint to one side and compare the angular component used for tracking.',
  ROBOT_VACUUM_MOTOR_COMMAND: 'Connect linear/angular speed targets and measured wheel speeds. Inspect conversion to wheel commands and the PI regulation response when actual speeds lag targets.',
  ROBOT_VACUUM_VISUALIZATION: 'Connect coverage grid, true pose, estimated pose and LiDAR scans from the same run. Compare true and estimated trails and inspect updated coverage cells on the display.',
  FUZZY_RULE: 'Use antecedent memberships 0.2 and 0.8 with minimum AND. The firing strength is 0.2; inspect consequent implication under the selected implication method.',
  FUZZY_INFERENCE_SYSTEM: 'Define low/high memberships and matching rules in the properties panel. Sweep an input across its range and inspect the defuzzified response; compare Mamdani output aggregation with Sugeno weighted output.',
  FUZZY_DEFUZZIFY: 'Provide a symmetric sampled membership vector over a symmetric range and choose centroid. Inspect a crisp result at the symmetry center, then make one side heavier and observe the shift.',
  FUZZY_SURFACE_VIEWER: 'Configure a two-input FIS, choose input1_range/input2_range and resolution, then inspect the swept surface alongside the live FIS output for the current inputs.',
  ROOT_LOCUS: 'Use numerator [1], denominator [1,2,1] and positive gain. Compare open_loop to closed_loop simulationType while viewing poles satisfying 1+K*G(s)=0; increasing maxGain extends the plot sweep.',
};
// Supplements inherit descriptions from the live registry; no copied metadata.
export const BLOCK_EXAMPLES = elementaryExamples;
function addPhysical(id: string, description: string, example: string) {
  BLOCK_GUIDANCE[`vlab:${id}`] = { description, behavior: description, example };
}
addPhysical('ma_selector', 'The current residuals enforce equal across values between the first two ports and equal values of the two branch quantities; there is no mode-selecting calculation.', 'Connect its conserving path and monitor the declared measurement output; the runtime imposes across[0]=across[1] and branch[0]=branch[1].');
addPhysical('ma_pressure_source', 'Imposes Pb−Pa=P*ctrl. A wired s port supplies ctrl, including zero; an unwired s defaults to ctrl=1.', 'Set P=150 and wire s=0.5 to impose pressure difference 75.');
addPhysical('ps_lookup_2d', 'The current runtime multiplies its two inputs; it does not interpolate a two-dimensional table.', 'Supply input signals 2 and 3 to obtain output 6.');
addPhysical('vlab_probe', 'Drives a signal branch equal to the first across value, allowing observation of the connected quantity.', 'Connect a signal of 3 and view the probe output as 3.');
addPhysical('conn_label', 'Names the net attached to its single port. Adds no through variable or component residual; its domain and direction follow the connected net.', 'Attach the label to an existing signal wire to name that net without changing the equation.');
addPhysical('fluid_ref', 'The assembler pins its network node to the fluid reference pressure and permits reference flow; the component function contributes no residual.', 'Connect the fluid reference to the return side of a pressure-source/resistance loop and inspect pressure relative to that datum.');
addPhysical('trans_motion_sensor', 'The ideal sensor has zero through force, publishes relative velocity and its integrated position, and obeys dx/dt=v.', 'Impose relative velocity 1 m/s; velocity output is 1 and position rises at 1 m/s.');
addPhysical('ps_sum', 'The current runtime passes the first input through; the second input is not included in the equation.', 'Inputs 2 and 3 produce output 2, documenting the current runtime limit.');
addPhysical('ps_min', 'The current runtime passes the first input through; the second input is currently unread.', 'Inputs 5 and 2 produce output 5, rather than the mathematical minimum.');
addPhysical('ps_max', 'The current runtime passes the first input through; the second input is currently unread.', 'Inputs 2 and 5 produce output 2, rather than the mathematical maximum.');
addPhysical('ps_delay', 'The current residual directly passes input to output; no stored transport delay is applied.', 'A step at the input appears at the output at the same simulation time.');
addPhysical('ps_rms', 'The current residual calculates the instantaneous absolute input value rather than a windowed RMS estimate.', 'Input -3 produces output 3; a sine wave produces its full-wave rectified signal.');
addPhysical('ma_separator', 'The current runtime equalizes the first two across quantities and their branch flows; it does not apply a vapor-removal efficiency calculation.', 'Connect the component in a moist-air path and compare inlet and outlet values; the residuals enforce equality.');
addPhysical('ps_integrator_gen', 'Integrates the first input through dState[0]=input and outputs state[0]. The reset input is currently unread.', 'Input 1 makes output increase with slope 1; reset does not alter this equation.');
addPhysical('ps_moving_avg', 'The current runtime is a first-order lag with a fixed MOVING_AVG_TAU time constant, not a finite window arithmetic mean.', 'Apply a step and observe an exponential approach rather than a moving-window ramp.');
addPhysical('ps_sr_flipflop', 'The current continuous equation is dQ/dt=S*(1−Q)−R*Q and complementary output=1−Q; it is a continuous approximation, not an edge-triggered digital latch.', 'With S=1,R=0,Q initially 0, Q approaches 1 exponentially.');
addPhysical('ps_sample_hold', 'When trigger exceeds 0.5, the stored value approaches input at rate 1000*(input−stored); otherwise its derivative is zero. Output equals stored state.', 'Hold trigger at zero to keep the stored value constant; set trigger to 1 to track input with a short lag.');
addPhysical('ps_smith_predictor', 'Smith predictor (Smith 1957) around a PI controller: the internal model tau*dym/dt+ym=Km*u with dead time theta predicts the delay-free output, and the controller acts on e_c=r−(y+ym−ym(t−theta)), u=Kp*e_c+I, dI/dt=Ki*e_c.', 'With a plant 1/(0.1s+1) followed by a 0.2 s delay, matching model parameters and Kp=1,Ki=10, the output is 1−exp(−10(t−0.2)) for t>0.2.');
addPhysical('ps_state_feedback', 'Full-state feedback u=Nr*r−K*x on the 2-element state vector x; K must have two entries. The law has no memory, so Reset has no effect.', 'K=[12 7], Nr=1, r=0 and x=[1;0] give u=−12.');
addPhysical('ps_sliding_mode', 'Boundary-layer sliding mode for a relative-degree-2 plant: s=d(y−r)/dt+lambda*(y−r), u=−k*clamp(s/boundary_layer,−1,1) (boundary_layer=0: −k*sign(s)).', 'With y=1, dy/dt=0, r=0, lambda=2, k=5 and a small boundary layer, s=2 and u=−5.');
addPhysical('quad_decoder', 'Counts every edge of A and B (4x) along the Gray sequence 00→10→11→01 (A leading B counts up, the reverse counts down); a rising Z clears the count. Position is 2π*count/(4*ppr); velocity is the count change over the sample time ts.', 'With ppr=100, twelve edges give position 2π*12/400 rad.');
addPhysical('resolver_to_digital', 'Type II tracking loop: synchronous demodulation of Vx=Vp*sinθ, Vy=Vp*cosθ with the carrier Vp, low pass at freq/5, then dω/dt=ωn²*ef and dφ/dt=ω+2ζωn*ef with ωn=2π*bandwidth. The angle error of a ramp goes to zero.', 'A ramp angle of 50 rad/s is tracked and the velocity output approaches 50 rad/s.');
addPhysical('bldc_commutation', 'Six-step Hall decoding: Hall code 4*Ha+2*Hb+Hc selects the energised pair (5: A+B−, 4: A+C−, 6: B+C−, 2: B+A−, 3: C+A−, 1: C+B−); 0 and 7 leave all phases floating; dir<0 reverses the polarity.', 'Hall code 5 gives abc=[1,−1,0].');
addPhysical('bldc_current_ctrl', 'PI on the DC-link current error, u=clamp(Kp*e+I,±v_max) with back-calculation anti-windup, applied to the phase pair selected by the Hall code and direction: vabc=pattern*u.', 'Current error 2, Kp=1, Ki=10, Hall 5: after 0.1 s vabc=[4,−4,0].');
addPhysical('bldc_pwm_ctrl', 'PI on the current error gives the modulation u=clamp(Kp*e+I,±1) of the energised pair; the leg duty (1+pattern*u)/2 is compared with a triangular carrier of frequency freq. g is the leg-state vector (+1 upper switch on).', 'u=0.4 and Hall 5: the carrier average of g is [0.4,−0.4,0].');
addPhysical('dcdc_ctrl', 'duty=clamp(FF+Kp*e+I,0,1) with e=vRef−v (an open vRef uses v_ref), dI/dt=Ki*e plus back-calculation anti-windup, Reset clears I.', 'With v=v_ref and FF=0.4 the duty is 0.4.');
addPhysical('pfc_rectifier_ctrl', 'Per-unit dq control: grid angle from the sensed voltage, id*=Kp_v*(VdcRef−VdcSens)+I, iq*=−QRef, and v_conv=v_grid−Kp_i*(i*−i) rotated back to VabcRef (clamped to ±1). vis is id*.', 'A 10 V DC error with Kp_v=0.1 gives id*=1 at t=0.');
addPhysical('cycloconverter_ctrl', 'Cosine-wave crossing: cos(α)=m*clamp(VRef,0,1)*sin(2π*fRef*t+phase) gives the firing angle (rad) on P; the bank follows the polarity of Icyc and is blocked for bank_limit seconds at a change.', 'At t=0 with phase 0 the firing angle is π/2.');
addPhysical('pmsm_field_weakening', 'Voltage-feedback field weakening: when |vdq| exceeds v_margin*VphMax the d-axis current reference is reduced by d=clamp(Kp*e+I,−id_fw_max,0), e=v_margin*VphMax−|vdq|; an open VphMax disables it.', '|vdq|=50, VphMax=40 and id_fw_max=20 give id_fw=id*−20.');
addPhysical('pmsm_tq_est', 'tau=1.5*p*(flux*iq+(Ld−Lq)*id*iq) from the measured dq currents.', 'iq=6 A, id=0, p=4, flux=0.1 Wb gives 3.6 N·m.');
addPhysical('dc_current_ctrl', 'vRef=clamp(Kp*e+I,±vMax) with e=iRef−i, dI/dt=Ki*e plus back-calculation anti-windup; vMax is the port when wired, else the v_max parameter. Reset clears I.', 'Error 2, Kp=1, Ki=10: after 0.1 s the output is 4 V.');
addPhysical('dc_voltage_ctrl', 'duty=clamp(Kp*e+I,0,1) with e=vRef−v, dI/dt=Ki*e plus back-calculation anti-windup; Reset clears I.', 'Error 0.1, Kp=0.5, Ki=5: after 0.1 s the duty is 0.055.');
addPhysical('velocity_ctrl', 'TqRefUnsat=Kp*e+I with e=wRef−wMech and dI/dt=Ki*e+Kb*(TqRefSat−TqRefUnsat) (Kb=Ki/Kp) when TqRefSat is wired; Reset clears I.', 'Error 10, Kp=1, Ki=2, no saturation feedback: the output is 10+20t.');
addPhysical('hysteresis_ctrl_3ph', 'Every sample time ts each phase is a relay with memory: s=+1 if iabc*−iabc>band/2, −1 if below −band/2, otherwise the previous s (initially −1). s is the leg-state vector for the inverter.', 'band=0.04 and errors [0.03,−0.03,0] give s=[1,−1,−1] on the first sample.');
addPhysical('im_scalar_ctrl', 'Constant volts-per-hertz: V=v_boost+(V_rated−v_boost)*|f|/f_rated up to f_rated, V_rated above, V_rated=v_f_ratio*f_rated; theta integrates 2π*fRef and vabc=V*sin(theta−k*2π/3).', 'v_f_ratio=4.4, f_rated=50, boost 0, f=25 Hz: amplitude 110 V.');
addPhysical('im_dtc_ctrl', 'Takahashi-Noguchi direct torque control: stator flux from dψ/dt=v−Rs*i, torque 1.5*P*(ψα*iβ−ψβ*iα), flux and torque hysteresis comparators and the switching table (flux up: V(k+1)/zero/V(k−1), flux down: V(k+2)/zero/V(k−2)) every ts. g=2S−1 per leg.', 'A flux below FluxRef and a torque below TqRef select the vector 60° ahead of the flux sector.');
addPhysical('im_curr_ctrl', 'Per axis v=Kp*(i*−i)+I+vdq_ff, circular limit |v|≤VphMax (when wired), back-calculation anti-windup (Kb=Ki/Kp), Reset clears I.', 'idq*=[2,0], idq=0, Kp=1: the first output is 2 V plus the integral.');
addPhysical('pmsm_curr_ctrl', 'Per axis v=Kp*(i*−i)+I+vdq_ff (the decoupling terms arrive on vdq_ff), circular limit |v|≤VphMax (when wired), back-calculation anti-windup (Kb=Ki/Kp), Reset clears I.', 'idq*=[2,3], idq=0, Kp=2: the outputs start at [4,6] V.');
addPhysical('pmsm_ref_gen', 'Torque to current: minimum-current point of id²+iq²≤i_max² and ωe²((Ld*id+λ)²+(Lq*iq)²)≤(vdc/2)² with tau=1.5*p*iq*(λ+(Ld−Lq)*id) (MTPA, field weakening above base speed); the torque request is limited to the largest feasible torque TqLim.', 'A non-salient machine below base speed: id=0, iq=tau/(1.5*p*λ).');
addPhysical('im_foc_ctrl', 'Indirect rotor-flux-oriented control (mode 1): speed PI to torque, iq*=(2/3)(1/P)(Lr/Lm)*tau/ψr*, id*=imrRef, slip ωsl=(Rr/Lr)*iq*/id*, field angle ∫(P*wr+ωsl), dq PI loops with decoupling, |v|≤vdc/2. Mode 0 is open-loop V/f. g is the modulation vector, Vabc the amplitude of the voltage reference.', 'Mode 0, P=2, wrRef=100 rad/s, v_f_ratio=4.4: Vabc=140 V.');
addPhysical('luenberger_observer', 'dx̂/dt=A*x̂+B*u+L*(y−C*x̂) for a 2-state plant with matrices A (2×2), B, C, L; the estimation error follows eig(A−L*C).', 'With A−L*C stable the estimate converges to the plant state whatever u is.');
addPhysical('im_flux_observer', 'Current model in the stationary frame: dψr/dt=−ψr/Tr+j*P*wr*ψr+(Lm/Tr)*is with Tr=Lr/Rr; outputs imr=|ψr|/Lm, the flux angle, the synchronous speed we=P*wr+(Lm/Tr)*isq/|ψr| and the stator current in field coordinates.', 'At steady state with sinusoidal currents the synchronous speed equals the stator frequency.');
addPhysical('pmsm_foc', 'Field-oriented control: iq*=tau*/(1.5*p*(λ+(Ld−Lq)*id*)), id*=0, Park(Clarke(iabc),p*θ), PI plus decoupling feed-forward (−ωe*Lq*iq, ωe*(Ld*id+λ), Rs*i*), |v|≤vdc/2, back-calculation anti-windup, inverse Park to the modulation vector g.', 'At stiff speed the currents settle at id=0, iq=tau*/(1.5*p*λ).');
addPhysical('ps_stair_gen', 'Outputs floor(time/ts); the declared steps level list is currently unread.', 'ts=0.1 gives values 0 at t=0,1 at t=0.1 and 2 at t=0.2.');
addPhysical('vfd_controller', 'The current runtime converts speed command to grid-frequency rad/s, outputs clamp(abs(speed)/1500,0.1,1) on vabc, 1 on g and zero on other recognized outputs.', 'A speed command of 750 RPM gives vabc=0.5 and g=1.');

/** Source-reviewed parameters unused by the component residual (initialization excluded). */
export const VLAB_UNUSED_PARAMETERS: Record<string, string[]> = {
  ma_separator: ['efficiency'], ps_delay: ['delay'], ps_min: ['limit'], ps_max: ['limit'], ps_rms: ['window'],
};
export const VLAB_RUNTIME_RELATIONS: Record<string, string> = {
  ma_selector: 'across[0]=across[1]; branch[0]=branch[1]', ma_pressure_source: 'Pb−Pa=P*ctrl (unwired ctrl=1)',
  ps_lookup_2d: 'output=input1*input2', vlab_probe: 'output=across[0]', conn_label: 'No component residual; names the connected net',
  fluid_ref: 'Network pressure reference=101325 Pa', trans_motion_sensor: 'sensor_force=0; velocity=v1−v2; dx/dt=velocity; position=x',
  ps_sum: 'output=input1', ps_min: 'output=input1', ps_max: 'output=input1', ps_delay: 'output=input', ps_rms: 'output=|input|',
  ma_separator: 'across[0]=across[1]; branch[0]=branch[1]', ps_integrator_gen: 'dState[0]/dt=input1; output=state[0]', ps_moving_avg: 'dState[0]/dt=(input−state[0])/MOVING_AVG_TAU; output=state[0]',
  ps_sr_flipflop: 'dQ/dt=S*(1−Q)−R*Q; Qbar=1−Q', ps_sample_hold: 'dState/dt=trigger>0.5 ? 1000*(input−state) : 0; output=state',
  ps_stair_gen: 'output=floor(time/ts)',
  vfd_controller: 'grid_freq=RPM*2π/60; vabc=clamp(|RPM|/1500,0.1,1); g=1',
};

addPhysical('fundamental_reluctance','Computes R=l/(mu0*mu_r*A), then enforces MMF difference=R*magnetic flux; mu0=1.25663706212e-6 H/m.','With l=0.1 m, A=1e-4 m² and mu_r=1000, R is approximately 795775 A/Wb; MMF difference 10 gives flux approximately 1.25664e-5 Wb.');
addPhysical('ma_moisture_sensor','Outputs water-vapor mass fraction from the node pressure and this component’s T/phi parameters through moistAirState. Moist-air conserving ports carry pressure and mass flow; humidity is not advected as a network state.','At fixed pressure and T, vary phi from 0 to 0.5 and inspect the vapor mass-fraction output; phi=0 gives zero.');
addPhysical('ma_thermo_sensor','Outputs mixture density from node pressure and this component’s T/phi parameters through moistAirState. It does not emit a fixed 1000 signal.','At 101325 Pa, T=293.15 K and phi=0, compare the output against dry-air ideal-gas density p/(R_a*T).');
addPhysical('ma_flow_source','Imposes mass flow rate*ctrl from A through the component to B. A wired s port supplies ctrl, including zero; unwired s defaults to 1.','Set rate=0.01 kg/s and wire s=0.5: the imposed flow is 0.005 kg/s; wiring zero gives zero.');
add('MPC_CONTROLLER','Approximates a constrained quadratic output-tracking/control-effort problem with 20 projected fast-gradient iterations. Q must be ny×ny, R nu×nu; default C=[[1,0]] needs Q=[[10]], unlike the incompatible factory Q default. Prediction uses A,B,C; D is stored but unused. The solver is cached in block state.','Use dimensionally compatible matrices and Q=[[10]] for the default one-output plant. Change the reference, observe predicted outputs, and verify Control remains between u_min/u_max.','Uses 20 projected fast-gradient iterations. Builds prediction matrices over Np and Nc, then warm-starts using the previous control sequence. Reinitialize the solver state when changing its model/configuration; do not assume a cached solver rebuilds itself.');
VLAB_RUNTIME_RELATIONS.fundamental_reluctance='R=l/(mu0*mu_r*A); MMF_difference=R*flux';
VLAB_RUNTIME_RELATIONS.ma_moisture_sensor='output=moistAirState(p,T,phi).massFraction';
VLAB_RUNTIME_RELATIONS.ma_thermo_sensor='output=moistAirState(p,T,phi).rho';
VLAB_RUNTIME_RELATIONS.ma_flow_source='mass_flow=rate*ctrl (unwired ctrl=1)';
BLOCK_GUIDANCE['xbridges:MPC_CONTROLLER'].equation='J = Σ ((predicted_y − reference)ᵀ Q (predicted_y − reference) + uᵀ R u), with u_min ≤ u ≤ u_max';
