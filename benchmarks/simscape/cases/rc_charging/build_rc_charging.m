function build_rc_charging()
% RC charging: 10 V DC source -> 1 kOhm -> 1 mF (v0 = 0). Foundation blocks only.
% Writes ../../golden/rc_charging.csv (time,v_c) and rc_charging.meta.json.
mdl = 'rc_charging_sscm';
if bdIsLoaded(mdl), close_system(mdl, 0); end
new_system(mdl); open_system(mdl);

% Library paths (R2024b Foundation). Resolved via libinfo-free direct paths; if a
% path moves in a future release, use find_system('fl_lib','Name','Resistor').
P.src = 'fl_lib/Electrical/Electrical Sources/DC Voltage Source';
P.res = 'fl_lib/Electrical/Electrical Elements/Resistor';
P.cap = 'fl_lib/Electrical/Electrical Elements/Capacitor';
P.ref = 'fl_lib/Electrical/Electrical Elements/Electrical Reference';
P.vs  = 'fl_lib/Electrical/Electrical Sensors/Voltage Sensor';
P.cfg = 'nesl_utility/Solver Configuration';
P.psc = 'nesl_utility/PS-Simulink Converter';

add_block(P.src, [mdl '/Vs']);  set_param([mdl '/Vs'], 'v0', '10', 'v0_unit', 'V');
add_block(P.res, [mdl '/R']);   set_param([mdl '/R'], 'R', '1000', 'R_unit', 'Ohm');
add_block(P.cap, [mdl '/C']);   set_param([mdl '/C'], 'c', '1e-3', 'c_unit', 'F');
try
    set_param([mdl '/C'], 'v0', '0', 'v0_unit', 'V', 'priority', 'high');
catch, end
add_block(P.ref, [mdl '/GND']);
add_block(P.vs,  [mdl '/VSense']);
add_block(P.cfg, [mdl '/Solver']);
add_block(P.psc, [mdl '/PSS']);
add_block('simulink/Sinks/Out1', [mdl '/v_c']);

h = @(b) get_param([mdl '/' b], 'PortHandles');
Vs = h('Vs'); R = h('R'); C = h('C'); G = h('GND'); S = h('VSense'); K = h('Solver');
% Electrical (physical) ports: LConn/RConn. Vs: LConn=+, RConn=-.
add_line(mdl, Vs.LConn(1), R.LConn(1));
add_line(mdl, R.RConn(1),  C.LConn(1));
add_line(mdl, C.RConn(1),  G.LConn(1));
add_line(mdl, Vs.RConn(1), G.LConn(1));
add_line(mdl, K.RConn(1),  G.LConn(1));
add_line(mdl, S.LConn(1),  C.LConn(1));
add_line(mdl, S.LConn(2),  G.LConn(1));
add_line(mdl, S.RConn(1),  get_param([mdl '/PSS'], 'PortHandles').LConn(1));
add_line(mdl, get_param([mdl '/PSS'], 'PortHandles').Outport(1), ...
              get_param([mdl '/v_c'], 'PortHandles').Inport(1));

tgrid = 0:0.001:5;
set_param(mdl, 'Solver', 'daessc', 'StopTime', '5', ...
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
writetable(T, fullfile(gdir, 'rc_charging.csv'));

vv = ver; names = {vv.Name};
meta = struct('case', 'rc_charging', 'matlab', version, ...
    'simscape', vv(strcmp(names, 'Simscape')).Version, ...
    'solver', 'daessc', 'relTol', 1e-6, 'absTol', 1e-8, ...
    'stopTime', 5, 'outputTimes', '0:0.001:5', ...
    'date', char(datetime('now', 'Format', 'yyyy-MM-dd''T''HH:mm:ss')));
fid = fopen(fullfile(gdir, 'rc_charging.meta.json'), 'w');
fwrite(fid, jsonencode(meta, 'PrettyPrint', true)); fclose(fid);
close_system(mdl, 0);
end
