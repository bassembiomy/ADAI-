function build_halfwave_rectifier()
% Half-wave rectifier: 10 V / 50 Hz AC source -> Foundation Diode (piecewise linear: Vf = 0.7 V,
% Ron = 0.01 Ohm, Goff = 1e-6 S) -> 100 Ohm load. Foundation blocks only.
% Writes ../../golden/halfwave_rectifier.csv (time,v_load) and halfwave_rectifier.meta.json.
%
% NOT YET RUN: authored without a MATLAB licence (WP-11). Before generating the golden, confirm the block paths and the
% diode parameter names below with  find_system('fl_lib','Name','Diode')  and  get(..., 'DialogParameters').
% Until the golden exists the case is checked against the closed-form PWL solution (case.json "analytic").
mdl = 'halfwave_rectifier_sscm';
if bdIsLoaded(mdl), close_system(mdl, 0); end
new_system(mdl); open_system(mdl);

P.src = 'fl_lib/Electrical/Electrical Sources/AC Voltage Source';
P.dio = 'fl_lib/Electrical/Electrical Elements/Diode';
P.res = 'fl_lib/Electrical/Electrical Elements/Resistor';
P.ref = 'fl_lib/Electrical/Electrical Elements/Electrical Reference';
P.vs  = 'fl_lib/Electrical/Electrical Sensors/Voltage Sensor';
P.cfg = 'nesl_utility/Solver Configuration';
P.psc = 'nesl_utility/PS-Simulink Converter';

add_block(P.src, [mdl '/Vs']);
set_param([mdl '/Vs'], 'amplitude', '10', 'amplitude_unit', 'V', 'freq', '50', 'freq_unit', 'Hz', 'phase', '0', 'phase_unit', 'deg');
add_block(P.dio, [mdl '/D']);
% Piecewise-linear diode: i = v*Goff (v < Vf), i = (v - Vf)/Ron + Vf*Goff (v >= Vf)
set_param([mdl '/D'], 'Vf', '0.7', 'Vf_unit', 'V', 'Ron', '0.01', 'Ron_unit', 'Ohm', 'Goff', '1e-6', 'Goff_unit', '1/Ohm');
add_block(P.res, [mdl '/R']);   set_param([mdl '/R'], 'R', '100', 'R_unit', 'Ohm');
add_block(P.ref, [mdl '/GND']);
add_block(P.vs,  [mdl '/VSense']);
add_block(P.cfg, [mdl '/Solver']);
add_block(P.psc, [mdl '/PSS']);
add_block('simulink/Sinks/Out1', [mdl '/v_load']);

h = @(b) get_param([mdl '/' b], 'PortHandles');
Vs = h('Vs'); D = h('D'); R = h('R'); G = h('GND'); S = h('VSense'); K = h('Solver');
add_line(mdl, Vs.LConn(1), D.LConn(1));
add_line(mdl, D.RConn(1),  R.LConn(1));
add_line(mdl, R.RConn(1),  G.LConn(1));
add_line(mdl, Vs.RConn(1), G.LConn(1));
add_line(mdl, K.RConn(1),  G.LConn(1));
add_line(mdl, S.LConn(1),  R.LConn(1));
add_line(mdl, S.LConn(2),  G.LConn(1));
add_line(mdl, S.RConn(1),  get_param([mdl '/PSS'], 'PortHandles').LConn(1));
add_line(mdl, get_param([mdl '/PSS'], 'PortHandles').Outport(1), ...
              get_param([mdl '/v_load'], 'PortHandles').Inport(1));

tgrid = 0:1e-4:0.04;
set_param(mdl, 'Solver', 'daessc', 'StopTime', '0.04', ...
    'RelTol', '1e-6', 'AbsTol', '1e-8', 'MaxStep', '1e-4', ...
    'OutputOption', 'SpecifiedOutputTimes', 'OutputTimes', 'tgrid_bench', ...
    'SaveOutput', 'on', 'OutputSaveName', 'yout', 'SaveFormat', 'Dataset');
assignin('base', 'tgrid_bench', tgrid);
set_param(mdl, 'ReturnWorkspaceOutputs', 'on');
out = sim(mdl);
y = out.yout{1}.Values;
t = y.Time(:); v = y.Data(:);
v_load = interp1(t, v, tgrid(:), 'linear', 'extrap');

here = fileparts(mfilename('fullpath'));
gdir = fullfile(here, '..', '..', 'golden');
if ~exist(gdir, 'dir'), mkdir(gdir); end
T = table(tgrid(:), v_load, 'VariableNames', {'time', 'v_load'});
writetable(T, fullfile(gdir, 'halfwave_rectifier.csv'));

vv = ver; names = {vv.Name};
meta = struct('case', 'halfwave_rectifier', 'matlab', version, ...
    'simscape', vv(strcmp(names, 'Simscape')).Version, ...
    'solver', 'daessc', 'relTol', 1e-6, 'absTol', 1e-8, ...
    'stopTime', 0.04, 'outputTimes', '0:1e-4:0.04', ...
    'date', char(datetime('now', 'Format', 'yyyy-MM-dd''T''HH:mm:ss')));
fid = fopen(fullfile(gdir, 'halfwave_rectifier.meta.json'), 'w');
fwrite(fid, jsonencode(meta, 'PrettyPrint', true)); fclose(fid);
close_system(mdl, 0);
end
