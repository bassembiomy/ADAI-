function build_thermal_rc()
% Thermal mass heated through a conductance from a fixed-temperature source (WP-15, F-011).
%   C dT/dt = k (T_hot - T),  T(0) = T0     ->  T(t) = T_hot + (T0 - T_hot) exp(-t k / C)
% Parameters: T_hot = 353.15 K, k = 2 W/K, C = 100 J/K, T0 = 293.15 K (tau = C / k = 50 s). The recorded signal is the
% temperature rise dT = T - 293.15 K measured by an Ideal Temperature Sensor against a 293.15 K Ideal Temperature Source (the
% same sensor reads the ABSOLUTE temperature when its B port sits on the Thermal Reference, which is 0 K in Simscape and in V-Lab).
% Analytic: dT(t) = 60 [1 - exp(-t/50)] (see simscape_benchmarks/runCase.ts, first_order_step).
% Writes ../../golden/thermal_rc.csv (time,dT) and thermal_rc.meta.json.
%
% STATUS: analytic reference only. This builder has NOT been run (no golden exists yet, Simscape licence required): the block
% parameter names of the Foundation library are mapped below by name and must be confirmed on the first licensed run (the
% builder stops with a clear error instead of guessing a different mapping).
mdl = 'thermal_rc_sscm';
if bdIsLoaded(mdl), close_system(mdl, 0); end
new_system(mdl); open_system(mdl);

P.src  = 'fl_lib/Thermal/Thermal Sources/Ideal Temperature Source';
P.cond = 'fl_lib/Thermal/Thermal Elements/Conductive Heat Transfer';
P.mass = 'fl_lib/Thermal/Thermal Elements/Thermal Mass';
P.sens = 'fl_lib/Thermal/Thermal Sensors/Ideal Temperature Sensor';
P.ref  = 'fl_lib/Thermal/Thermal Elements/Thermal Reference';
P.s2ps = 'nesl_utility/Simulink-PS Converter';
P.cfg  = 'nesl_utility/Solver Configuration';
P.psc  = 'nesl_utility/PS-Simulink Converter';

add_block('simulink/Sources/Constant', [mdl '/Thot']); set_param([mdl '/Thot'], 'Value', '353.15');
add_block('simulink/Sources/Constant', [mdl '/Tamb']); set_param([mdl '/Tamb'], 'Value', '293.15');
add_block(P.s2ps, [mdl '/S2PS_hot']);
add_block(P.s2ps, [mdl '/S2PS_amb']);
add_block(P.src,  [mdl '/Hot']);
add_block(P.src,  [mdl '/Amb']);
add_block(P.cond, [mdl '/Link']);  setp([mdl '/Link'], {'area'}, '2', 'm^2');   % conductance k = kappa A / D = 2 W/K with kappa = 1 W/(K m), D = 1 m
add_block(P.mass, [mdl '/Mass']);  setp([mdl '/Mass'], {'th_mass', 'mass'}, '100', 'J/K');
add_block(P.sens, [mdl '/Sensor']);
add_block(P.ref,  [mdl '/TRef']);
add_block(P.cfg,  [mdl '/Solver']);
add_block(P.psc,  [mdl '/PSS']);
add_block('simulink/Sinks/Out1', [mdl '/dT']);

h = @(b) get_param([mdl '/' b], 'PortHandles');
SH = h('S2PS_hot'); SA = h('S2PS_amb'); H = h('Hot'); A = h('Amb'); L = h('Link'); M = h('Mass'); N = h('Sensor'); R = h('TRef'); C = h('Solver');
add_line(mdl, get_param([mdl '/Thot'], 'PortHandles').Outport(1), SH.Inport(1));
add_line(mdl, get_param([mdl '/Tamb'], 'PortHandles').Outport(1), SA.Inport(1));
add_line(mdl, SH.RConn(1), H.LConn(1));  add_line(mdl, H.RConn(1), R.LConn(1));
add_line(mdl, SA.RConn(1), A.LConn(1));  add_line(mdl, A.RConn(1), R.LConn(1));
add_line(mdl, H.LConn(2), L.LConn(1));   % hot node (port A of the source) into the link
add_line(mdl, L.RConn(1), M.LConn(1));
add_line(mdl, N.LConn(1), M.LConn(1));   add_line(mdl, N.RConn(1), A.LConn(2));
add_line(mdl, C.RConn(1), R.LConn(1));
add_line(mdl, N.RConn(2), get_param([mdl '/PSS'], 'PortHandles').LConn(1));
add_line(mdl, get_param([mdl '/PSS'], 'PortHandles').Outport(1), get_param([mdl '/dT'], 'PortHandles').Inport(1));

tgrid = 0:0.05:150;
setp([mdl '/Mass'], {'T_init', 'T', 'temp_init'}, '293.15', 'K');   % initial temperature T0
set_param(mdl, 'Solver', 'daessc', 'StopTime', '150', 'MaxStep', '0.05', ...
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
writetable(T, fullfile(gdir, 'thermal_rc.csv'));

vv = ver; names = {vv.Name};
meta = struct('case', 'thermal_rc', 'matlab', version, ...
    'simscape', vv(strcmp(names, 'Simscape')).Version, ...
    'solver', 'daessc', 'relTol', 1e-6, 'absTol', 1e-8, ...
    'stopTime', 150, 'outputTimes', '0:0.05:150', ...
    'date', char(datetime('now', 'Format', 'yyyy-MM-dd''T''HH:mm:ss')));
fid = fopen(fullfile(gdir, 'thermal_rc.meta.json'), 'w');
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
error('build_thermal_rc:param', 'Block %s has none of the parameters {%s}; map them on the first licensed run.', blk, strjoin(candidates, ', '));
end
