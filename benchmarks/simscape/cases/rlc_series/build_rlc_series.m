function build_rlc_series()
% Series RLC step: 10 V DC source -> 10 Ohm -> 10 mH -> 10 uF (v0 = 0, i0 = 0). Foundation blocks only.
% Underdamped: alpha = R/2L = 500 1/s, w0 = 1/sqrt(LC) = 3162.3 rad/s, wd = 3122.0 rad/s, overshoot exp(-pi alpha/wd) = 60.5 %.
% Writes ../../golden/rlc_series.csv (time,v_c) and rlc_series.meta.json.
mdl = 'rlc_series_sscm';
if bdIsLoaded(mdl), close_system(mdl, 0); end
new_system(mdl); open_system(mdl);

% Library paths (R2024b Foundation), same as build_rc_charging.m.
P.src = 'fl_lib/Electrical/Electrical Sources/DC Voltage Source';
P.res = 'fl_lib/Electrical/Electrical Elements/Resistor';
P.ind = 'fl_lib/Electrical/Electrical Elements/Inductor';
P.cap = 'fl_lib/Electrical/Electrical Elements/Capacitor';
P.ref = 'fl_lib/Electrical/Electrical Elements/Electrical Reference';
P.vs  = 'fl_lib/Electrical/Electrical Sensors/Voltage Sensor';
P.cfg = 'nesl_utility/Solver Configuration';
P.psc = 'nesl_utility/PS-Simulink Converter';

add_block(P.src, [mdl '/Vs']);  set_param([mdl '/Vs'], 'v0', '10', 'v0_unit', 'V');
add_block(P.res, [mdl '/R']);   set_param([mdl '/R'], 'R', '10', 'R_unit', 'Ohm');
add_block(P.ind, [mdl '/L']);   set_param([mdl '/L'], 'l', '0.01', 'l_unit', 'H');
try
    set_param([mdl '/L'], 'i0', '0', 'i0_unit', 'A', 'priority', 'high');
catch, end
add_block(P.cap, [mdl '/C']);   set_param([mdl '/C'], 'c', '1e-5', 'c_unit', 'F');
try
    set_param([mdl '/C'], 'v0', '0', 'v0_unit', 'V', 'priority', 'high');
catch, end
add_block(P.ref, [mdl '/GND']);
add_block(P.vs,  [mdl '/VSense']);
add_block(P.cfg, [mdl '/Solver']);
add_block(P.psc, [mdl '/PSS']);
add_block('simulink/Sinks/Out1', [mdl '/v_c']);

h = @(b) get_param([mdl '/' b], 'PortHandles');
Vs = h('Vs'); R = h('R'); L = h('L'); C = h('C'); G = h('GND'); S = h('VSense'); K = h('Solver');
% Electrical (physical) ports: LConn/RConn. Vs: LConn=+, RConn=-.
add_line(mdl, Vs.LConn(1), R.LConn(1));
add_line(mdl, R.RConn(1),  L.LConn(1));
add_line(mdl, L.RConn(1),  C.LConn(1));
add_line(mdl, C.RConn(1),  G.LConn(1));
add_line(mdl, Vs.RConn(1), G.LConn(1));
add_line(mdl, K.RConn(1),  G.LConn(1));
add_line(mdl, S.LConn(1),  C.LConn(1));
add_line(mdl, S.LConn(2),  G.LConn(1));
add_line(mdl, S.RConn(1),  get_param([mdl '/PSS'], 'PortHandles').LConn(1));
add_line(mdl, get_param([mdl '/PSS'], 'PortHandles').Outport(1), ...
              get_param([mdl '/v_c'], 'PortHandles').Inport(1));

% grid = case.json dt (2 us) over stopTime (10 ms); MaxStep one grid step so the 2.0 ms oscillation period is resolved
tgrid = 0:2e-6:0.01;
set_param(mdl, 'Solver', 'daessc', 'StopTime', '0.01', 'MaxStep', '2e-6', ...
    'RelTol', '1e-6', 'AbsTol', '1e-8', ...
    'OutputOption', 'SpecifiedOutputTimes', 'OutputTimes', 'tgrid_bench', ...
    'SaveOutput', 'on', 'OutputSaveName', 'yout', 'SaveFormat', 'Dataset');
assignin('base', 'tgrid_bench', tgrid);
set_param(mdl, 'ReturnWorkspaceOutputs', 'on');
out = sim(mdl);
y = out.yout{1}.Values;
t = y.Time(:); v = y.Data(:);
v_c = interp1(t, v, tgrid(:), 'linear', 'extrap');

here = fileparts(mfilename('fullpath'));
gdir = fullfile(here, '..', '..', 'golden');
if ~exist(gdir, 'dir'), mkdir(gdir); end
T = table(tgrid(:), v_c, 'VariableNames', {'time', 'v_c'});
writetable(T, fullfile(gdir, 'rlc_series.csv'));

vv = ver; names = {vv.Name};
meta = struct('case', 'rlc_series', 'matlab', version, ...
    'simscape', vv(strcmp(names, 'Simscape')).Version, ...
    'solver', 'daessc', 'relTol', 1e-6, 'absTol', 1e-8, ...
    'stopTime', 0.01, 'outputTimes', '0:2e-6:0.01', ...
    'date', char(datetime('now', 'Format', 'yyyy-MM-dd''T''HH:mm:ss')));
fid = fopen(fullfile(gdir, 'rlc_series.meta.json'), 'w');
fwrite(fid, jsonencode(meta, 'PrettyPrint', true)); fclose(fid);
close_system(mdl, 0);
end
