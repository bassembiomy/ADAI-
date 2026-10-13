function build_dc_motor_load()
% DC motor under a voltage step: 24 V DC source -> Simscape DC Motor -> rotor inertia + viscous damper (WP-12a).
%   La di/dt = V - Ra i - k w,   J dw/dt = k i - B w          (J = J_motor + J_load, B = B_motor + b_damper)
% Parameters: Ra = 1 Ohm, La = 10 mH, k = Ke = Kt = 0.1 V*s/rad (= N*m/A),
%             J = 0.001 (motor) + 0.01 (load) = 0.011 kg*m^2, B = 0.001 (motor) + 0.02 (damper) = 0.021 N*m*s/rad.
% Analytic: w_ss = k V/(Ra B + k^2) = 77.42 rad/s, real poles s = -2.85 and -99.1 1/s (see simscape_benchmarks/runCase.ts).
% Writes ../../golden/dc_motor_load.csv (time,omega) and dc_motor_load.meta.json.
%
% STATUS: analytic reference only. This builder has NOT been run (no golden exists yet, Simscape licence required): the
% parameter names of the DC Motor block are mapped below by name and must be confirmed on the first licensed run (the
% builder stops with a clear error instead of guessing a different mapping).
mdl = 'dc_motor_load_sscm';
if bdIsLoaded(mdl), close_system(mdl, 0); end
new_system(mdl); open_system(mdl);

P.src = 'fl_lib/Electrical/Electrical Sources/DC Voltage Source';
P.mot = 'ee_lib/Electromechanical/Brushed Motors/DC Motor';   % Simscape Electrical
P.jr  = 'fl_lib/Mechanical/Rotational Elements/Inertia';
P.dmp = 'fl_lib/Mechanical/Rotational Elements/Rotational Damper';
P.mref= 'fl_lib/Mechanical/Rotational Elements/Mechanical Rotational Reference';
P.eref= 'fl_lib/Electrical/Electrical Elements/Electrical Reference';
P.sens= 'fl_lib/Mechanical/Mechanical Sensors/Ideal Rotational Motion Sensor';
P.cfg = 'nesl_utility/Solver Configuration';
P.psc = 'nesl_utility/PS-Simulink Converter';

add_block(P.src, [mdl '/Vs']);   set_param([mdl '/Vs'], 'v0', '24', 'v0_unit', 'V');
add_block(P.mot, [mdl '/Motor']);
setp([mdl '/Motor'], {'R', 'resistance', 'Ra'}, '1', 'Ohm');
setp([mdl '/Motor'], {'L', 'inductance', 'La'}, '0.01', 'H');
setp([mdl '/Motor'], {'k', 'Km', 'torque_constant', 'Kt', 'back_emf_constant'}, '0.1', 'N*m/A');
setp([mdl '/Motor'], {'J', 'inertia', 'rotor_inertia'}, '0.001', 'kg*m^2');
setp([mdl '/Motor'], {'D', 'damping', 'rotor_damping', 'B'}, '0.001', 'N*m/(rad/s)');
add_block(P.jr,  [mdl '/Jload']); set_param([mdl '/Jload'], 'inertia', '0.01', 'inertia_unit', 'kg*m^2');
add_block(P.dmp, [mdl '/Damper']); set_param([mdl '/Damper'], 'D', '0.02', 'D_unit', 'N*m/(rad/s)');
add_block(P.mref,[mdl '/MRef']);
add_block(P.eref,[mdl '/GND']);
add_block(P.sens,[mdl '/Sensor']);
add_block(P.cfg, [mdl '/Solver']);
add_block(P.psc, [mdl '/PSS']);
add_block('simulink/Sinks/Out1', [mdl '/omega']);

h = @(b) get_param([mdl '/' b], 'PortHandles');
Vs = h('Vs'); M = h('Motor'); J = h('Jload'); D = h('Damper'); R = h('MRef'); G = h('GND'); S = h('Sensor'); K = h('Solver');
% electrical: Vs(+) -> Motor(+), Motor(-) -> GND, Vs(-) -> GND
add_line(mdl, Vs.LConn(1), M.LConn(1));
add_line(mdl, M.LConn(2),  G.LConn(1));
add_line(mdl, Vs.RConn(1), G.LConn(1));
add_line(mdl, K.RConn(1),  G.LConn(1));
% mechanical: motor shaft (R) -> inertia, damper (R side), sensor (R side); damper C, sensor C -> mechanical reference
add_line(mdl, M.RConn(1), J.LConn(1));
add_line(mdl, M.RConn(1), D.LConn(1));
add_line(mdl, D.RConn(1), R.LConn(1));
add_line(mdl, M.RConn(1), S.LConn(1));
add_line(mdl, S.LConn(2), R.LConn(1));   % sensor reference port
add_line(mdl, S.RConn(1), get_param([mdl '/PSS'], 'PortHandles').LConn(1));   % w output
add_line(mdl, get_param([mdl '/PSS'], 'PortHandles').Outport(1), get_param([mdl '/omega'], 'PortHandles').Inport(1));

tgrid = 0:0.001:1.0;
set_param(mdl, 'Solver', 'daessc', 'StopTime', '1.0', 'MaxStep', '0.001', ...
    'RelTol', '1e-6', 'AbsTol', '1e-8', ...
    'OutputOption', 'SpecifiedOutputTimes', 'OutputTimes', 'tgrid_bench', ...
    'SaveOutput', 'on', 'OutputSaveName', 'yout', 'SaveFormat', 'Dataset');
assignin('base', 'tgrid_bench', tgrid);
set_param(mdl, 'ReturnWorkspaceOutputs', 'on');
out = sim(mdl);
y = out.yout{1}.Values;
t = y.Time(:); v = y.Data(:);
omega = interp1(t, v, tgrid(:), 'linear', 'extrap');

here = fileparts(mfilename('fullpath'));
gdir = fullfile(here, '..', '..', 'golden');
if ~exist(gdir, 'dir'), mkdir(gdir); end
T = table(tgrid(:), omega, 'VariableNames', {'time', 'omega'});
writetable(T, fullfile(gdir, 'dc_motor_load.csv'));

vv = ver; names = {vv.Name};
meta = struct('case', 'dc_motor_load', 'matlab', version, ...
    'simscape', vv(strcmp(names, 'Simscape')).Version, ...
    'solver', 'daessc', 'relTol', 1e-6, 'absTol', 1e-8, ...
    'stopTime', 1.0, 'outputTimes', '0:0.001:1.0', ...
    'date', char(datetime('now', 'Format', 'yyyy-MM-dd''T''HH:mm:ss')));
fid = fopen(fullfile(gdir, 'dc_motor_load.meta.json'), 'w');
fwrite(fid, jsonencode(meta, 'PrettyPrint', true)); fclose(fid);
close_system(mdl, 0);
end

function setp(blk, candidates, value, unit)
% Set the first block parameter whose name exists; the unit parameter is <name>_unit. Stops if none matches.
dlg = get_param(blk, 'DialogParameters');
for k = 1:numel(candidates)
    if isfield(dlg, candidates{k})
        set_param(blk, candidates{k}, value);
        if isfield(dlg, [candidates{k} '_unit']), set_param(blk, [candidates{k} '_unit'], unit); end
        return;
    end
end
error('build_dc_motor_load:param', 'DC Motor has none of the parameters {%s}; map them on the first licensed run.', strjoin(candidates, ', '));
end
