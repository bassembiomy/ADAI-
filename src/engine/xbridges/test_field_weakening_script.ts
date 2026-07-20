import { BLOCK_LIBRARY } from './BlockDefinitions';

// Simple runner script to demonstrate the realistic behavior of the FIELD_WEAKENING block.
// This simulates a motor accelerating to high speeds, forcing terminal voltage above limit,
// entering field weakening, saturating the d-axis current reference, avoiding integrator windup,
// and then recovering as speed decreases.

function runSimulation() {
  console.log("==========================================================================");
  console.log("Simulating FIELD_WEAKENING Block Saturation and Anti-Windup");
  console.log("==========================================================================");

  const block = BLOCK_LIBRARY['FIELD_WEAKENING']('pmsm_fw_sim', {
    v_max: 300,       // Max voltage limit: 300V
    Kp: 0.1,          // Proportional gain
    Ki: 10.0,         // Integral gain
    id_min: -25.0,    // Max demagnetization negative current: -25A
    id_max: 0.0       // Maximum d-axis current: 0A (MTPA flux reference base is 0)
  });

  let state = { integral: 0, lastTime: 0 };
  let time = 0.0;
  const dt = 0.01; // 10ms simulation time step
  const id_base = 0.0; // Assume MTPA base is 0A

  // We will simulate 3 phases:
  // Phase 1: Normal speed. Speed rises but voltage remains below v_max (0s to 0.5s)
  // Phase 2: Over-speed. Speed goes very high, voltage goes to 400V (0.5s to 1.5s)
  //          Field weakening activates, saturates, and tests anti-windup.
  // Phase 3: Speed reduction. Voltage drops back to 200V (1.5s to 2.0s)
  //          Field weakening recovers and shuts off.

  console.log(
    `Time(s) | vMag(V) | id_base(A) | id_ref(A)  | Integral | Status`
  );
  console.log("--------------------------------------------------------------------------");

  for (let step = 0; step <= 200; step++) {
    time = step * dt;
    let vMag = 0;

    if (time <= 0.5) {
      // Phase 1: Speed ramps up, voltage goes 100V -> 280V
      vMag = 100 + (280 - 100) * (time / 0.5);
    } else if (time <= 1.5) {
      // Phase 2: High speed, voltage goes to 400V
      vMag = 400;
    } else {
      // Phase 3: Ramps down, voltage goes back to 200V
      vMag = 400 - (400 - 200) * ((time - 1.5) / 0.5);
    }

    // Execute the block
    const res = block.execute([vMag, id_base], block.params, state, time);
    const idRef = res.outputs[0] as number;
    
    // Status message
    let status = "Inactive";
    if (idRef < 0) {
      status = "Active";
    }
    if (idRef === block.params.id_min) {
      status = "Saturated (Min)";
    }

    // Print every 10 steps (100ms) or at phase changes to keep output clean
    if (
      step % 10 === 0 || 
      Math.abs(time - 0.5) < 1e-5 || 
      Math.abs(time - 1.5) < 1e-5 ||
      step === 200
    ) {
      console.log(
        `${time.toFixed(2).padStart(7)} | ` +
        `${vMag.toFixed(1).padStart(7)} | ` +
        `${id_base.toFixed(1).padStart(10)} | ` +
        `${idRef.toFixed(3).padStart(9)} | ` +
        `${state.integral.toFixed(3).padStart(8)} | ` +
        `${status}`
      );
    }

    // Update state
    state = res.nextState;
  }
  console.log("==========================================================================");
}

runSimulation();
