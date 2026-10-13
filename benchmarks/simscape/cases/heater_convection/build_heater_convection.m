function build_heater_convection()
% Resistive heater on a thermal mass cooled by convection to ambient (WP-30, connected model 2).
%   24 V DC source -> 10 Ohm resistor (Current Sensor); Joule heat Q = R i^2 enters the Thermal Mass through a Controlled Heat Flow
%   Source (Simscape Foundation has no electro-thermal resistor; the PS product R i^2 is the same Joule law V^2/R). Convective Heat
%   Transfer (h = 20 W/(m^2 K), A = 0.1 m^2) to a 293.15 K Ideal Temperature Source.
%   C dT/dt = V^2/R - h A (T - T_amb),  C = m c = 450 J/K,  T(0) = 293.15 K
% Analytic: dT(t) = T - T_amb = V^2/(R h A) (1 - exp(-t h A / C)) = 28.8 [1 - exp(-t/225)] K (runCase.ts, first_order_step).
% The recorded signal is dT, measured by an Ideal Temperature Sensor between the mass and the ambient source.
% Writes ../../golden/heater_convection.csv (time,dT) and heater_convection.meta.json.
%
% STATUS: analytic reference only. This builder has NOT been run (no golden exists yet, Simscape licence required): the block
% parameter names of the Foundation library are mapped below by name and must be confirmed on the first licensed run (the
% builder stops with a clear error instead of guessing a different mapping).
mdl = 'heater_convection_sscm';
if bdIsLoaded(mdl), close_system(mdl, 0); end
new_system(mdl); open_system(mdl);

P.vs   = 'fl_lib/Electrical/Electrical Sources/DC Voltage Source';
P.res  = 'fl_lib/Electrical/Electrical Elements/Resistor';
P.isen = 'fl_lib/Electrical/Electrical Sensors/Current Sensor';
P.eref = 'fl_lib/Electrical/Electrical Elements/Electrical Reference';
P.qsrc = 'fl_lib/Thermal/Thermal Sources/Controlled Heat Flow Rate Source';
P.tsrc = 'fl_lib/Thermal/Thermal Sources/Ideal Temperature Source';
P.mass = 'fl_lib/Thermal/Thermal Elements/Thermal Mass';
P.conv = 'fl_lib/Thermal/Thermal Elements/Convective Heat Transfer';
P.sens = 'fl_lib/Thermal/Thermal Sensors/Ideal Temperature Sensor';
P.tref = 'fl_lib/Thermal/Thermal Elements/Thermal Reference';
P.prod = 'fl_lib/Physical Signals/Functions/PS Product';
P.gain = 'fl_lib/Physical Signals/Functions/PS Gain';
P.s2ps = 'nesl_utility/Simulink-PS Converter';
P.cfg  = 'nesl_utility/Solver Configuration';
P.psc  = 'nesl_utility/PS-Simulink Converter';

add_block(P.vs, [mdl '/Vs']);    set_param([mdl '/Vs'], 'v0', '24', 'v0_unit', 'V');
add_block(P.res, [mdl '/R']);    set_param([mdl '/R'], 'R', '10', 'R_unit', 'Ohm');
add_block(P.isen, [mdl '/Isen']);
add_block(P.eref, [mdl '/GND']);
add_block(P.prod, [mdl '/i2']);
add_block(P.gain, [mdl '/Rgain']); set_param([mdl '/Rgain'], 'gain', '10');
add_block(P.qsrc, [mdl '/Q']);
add_block(P.mass, [mdl '/Mass']); setp([mdl '/Mass'], {'th_mass', 'mass'}, '450', 'J/K');
setp([mdl '/Mass'], {'T_init', 'T', 'temp_init'}, '293.15', 'K');
add_block(P.conv, [mdl '/Conv']); setp([mdl '/Conv'], {'area'}, '0.1', 'm^2');
setp([mdl '/Conv'], {'heat_tr_coeff', 'h'}, '20', 'W/(m^2*K)');
add_block('simulink/Sources/Constant', [mdl '/Tamb']); set_param([mdl '/Tamb'], 'Value', '293.15');
add_block(P.s2ps, [mdl '/S2PS_amb']);
add_block(P.tsrc, [mdl '/Amb']);
add_block(P.sens, [mdl '/Sensor']);
add_block(P.tref, [mdl '/TRef']);
add_block(P.cfg,  [mdl '/Solver']);
add_block(P.psc,  [mdl '/PSS']);
add_block('simulink/Sinks/Out1', [mdl '/dT']);

h = @(b) get_param([mdl '/' b], 'PortHandles');
Vs = h('Vs'); R = h('R'); I = h('Isen'); G = h('GND'); X = h('i2'); Kg = h('Rgain'); Q = h('Q'); M = h('Mass'); C = h('Conv');
SA = h('S2PS_amb'); A = h('Amb'); N = h('Sensor'); TR = h('TRef'); K = h('Solver'); PS = h('PSS');
% electrical: Vs(+) -> current sensor -> R -> GND, Vs(-) -> GND
add_line(mdl, Vs.LConn(1), I.LConn(1));
add_line(mdl, I.RConn(2), R.LConn(1));
add_line(mdl, R.RConn(1), G.LConn(1));
add_line(mdl, Vs.RConn(1), G.LConn(1));
add_line(mdl, K.RConn(1), G.LConn(1));
% Joule heat R i^2 -> controlled heat flow source from the reference into the mass
add_line(mdl, I.RConn(1), X.LConn(1));
add_line(mdl, I.RConn(1), X.LConn(2));
add_line(mdl, X.RConn(1), Kg.LConn(1));
add_line(mdl, Kg.RConn(1), Q.LConn(1));
add_line(mdl, Q.LConn(2), TR.LConn(1));
add_line(mdl, Q.RConn(1), M.LConn(1));
% convection to ambient, sensor between mass and ambient
add_line(mdl, get_param([mdl '/Tamb'], 'PortHandles').Outport(1), SA.Inport(1));
add_line(mdl, SA.RConn(1), A.LConn(1));  add_line(mdl, A.RConn(1), TR.LConn(1));
add_line(mdl, M.LConn(1), C.LConn(1));   add_line(mdl, C.RConn(1), A.LConn(2));
add_line(mdl, N.LConn(1), M.LConn(1));   add_line(mdl, N.RConn(1), A.LConn(2));
add_line(mdl, N.RConn(2), PS.LConn(1));
add_line(mdl, PS.Outport(1), get_param([mdl '/dT'], 'PortHandles').Inport(1));

tgrid = 0:2:1200;
set_param(mdl, 'Solver', 'daessc', 'StopTime', '1200', 'MaxStep', '2', ...
    'RelTol', '1e-6', 'AbsTol', '1e-8', ...
    'OutputOption', 'SpecifiedOutputTimes', 'OutputTimes', 'tgrid_bench', ...
    'SaveOutput', 'on', 'OutputSaveName', 'yout', 'SaveFormat', 'Dataset');
assignin('base', 'tgrid_bench', tgrid);
set_param(mdl, 'ReturnWorkspaceOutputs', 'on');
out = sim(mdl);
y = out.yout{1}.Values;
t = y.Time(:); v = y.Data(:);
dT = interp1(t, v, tgrid(:), 'linear', 'extrap');

here = fileparts(mfilename('fullpath'));
gdir = fullfile(here, '..', '..', 'golden');
if ~exist(gdir, 'dir'), mkdir(gdir); end
T = table(tgrid(:), dT, 'VariableNames', {'time', 'dT'});
writetable(T, fullfile(gdir, 'heater_convection.csv'));

vv = ver; names = {vv.Name};
meta = struct('case', 'heater_convection', 'matlab', version, ...
    'simscape', vv(strcmp(names, 'Simscape')).Version, ...
    'solver', 'daessc', 'relTol', 1e-6, 'absTol', 1e-8, ...
    'stopTime', 1200, 'outputTimes', '0:2:1200', ...
    'date', char(datetime('now', 'Format', 'yyyy-MM-dd''T''HH:mm:ss')));
fid = fopen(fullfile(gdir, 'heater_convection.meta.json'), 'w');
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
error('build_heater_convection:param', 'Block %s has none of the parameters {%s}; map them on the first licensed run.', blk, strjoin(candidates, ', '));
end
