function build_mass_spring_damper()
% Force step on a mass with a spring and a damper to the translational reference (WP-13).
%   m x'' + b x' + k x = F,  x(0) = x'(0) = 0
% Parameters: F = 10 N, m = 2 kg, k = 800 N/m, b = 16 N*s/m (zeta = b / (2 sqrt(k m)) = 0.2, wn = 20 rad/s).
% Analytic: x(t) = (F/k) [1 - exp(-zeta wn t) (cos wd t + zeta/sqrt(1-zeta^2) sin wd t)] (see simscape_benchmarks/runCase.ts).
% Writes ../../golden/mass_spring_damper.csv (time,x) and mass_spring_damper.meta.json.
%
% STATUS: analytic reference only. This builder has NOT been run (no golden exists yet, Simscape licence required): the block
% parameter names of the Foundation library are mapped below by name and must be confirmed on the first licensed run (the
% builder stops with a clear error instead of guessing a different mapping).
mdl = 'mass_spring_damper_sscm';
if bdIsLoaded(mdl), close_system(mdl, 0); end
new_system(mdl); open_system(mdl);

P.fs  = 'fl_lib/Mechanical/Translational Sources/Ideal Force Source';
P.ms  = 'fl_lib/Mechanical/Translational Elements/Mass';
P.sp  = 'fl_lib/Mechanical/Translational Elements/Translational Spring';
P.dp  = 'fl_lib/Mechanical/Translational Elements/Translational Damper';
P.ref = 'fl_lib/Mechanical/Translational Elements/Mechanical Translational Reference';
P.sens= 'fl_lib/Mechanical/Mechanical Sensors/Ideal Translational Motion Sensor';
P.src = 'nesl_utility/Simulink-PS Converter';
P.cfg = 'nesl_utility/Solver Configuration';
P.psc = 'nesl_utility/PS-Simulink Converter';

add_block('simulink/Sources/Constant', [mdl '/Fcmd']); set_param([mdl '/Fcmd'], 'Value', '10');
add_block(P.src, [mdl '/S2PS']);
add_block(P.fs,  [mdl '/FS']);
add_block(P.ms,  [mdl '/Mass']);   setp([mdl '/Mass'], {'mass'}, '2', 'kg');
add_block(P.sp,  [mdl '/Spring']); setp([mdl '/Spring'], {'spr_rate', 'k'}, '800', 'N/m');
add_block(P.dp,  [mdl '/Damper']); setp([mdl '/Damper'], {'D', 'damping'}, '16', 'N/(m/s)');
add_block(P.ref, [mdl '/TRef']);
add_block(P.sens,[mdl '/Sensor']);
add_block(P.cfg, [mdl '/Solver']);
add_block(P.psc, [mdl '/PSS']);
add_block('simulink/Sinks/Out1', [mdl '/x']);

h = @(b) get_param([mdl '/' b], 'PortHandles');
S = h('S2PS'); F = h('FS'); M = h('Mass'); K = h('Spring'); D = h('Damper'); R = h('TRef'); N = h('Sensor'); C = h('Solver');
add_line(mdl, get_param([mdl '/Fcmd'], 'PortHandles').Outport(1), S.Inport(1));
add_line(mdl, S.RConn(1), F.LConn(1));      % force command
add_line(mdl, F.RConn(1), M.LConn(1));      % the source delivers its force into the mass node (port C side)
add_line(mdl, F.LConn(2), R.LConn(1));
add_line(mdl, K.LConn(1), M.LConn(1));  add_line(mdl, K.RConn(1), R.LConn(1));
add_line(mdl, D.LConn(1), M.LConn(1));  add_line(mdl, D.RConn(1), R.LConn(1));
add_line(mdl, N.LConn(1), M.LConn(1));  add_line(mdl, N.LConn(2), R.LConn(1));
add_line(mdl, C.RConn(1), R.LConn(1));
add_line(mdl, N.RConn(2), get_param([mdl '/PSS'], 'PortHandles').LConn(1));   % P output (position)
add_line(mdl, get_param([mdl '/PSS'], 'PortHandles').Outport(1), get_param([mdl '/x'], 'PortHandles').Inport(1));

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
x = interp1(t, v, tgrid(:), 'linear', 'extrap');

here = fileparts(mfilename('fullpath'));
gdir = fullfile(here, '..', '..', 'golden');
if ~exist(gdir, 'dir'), mkdir(gdir); end
T = table(tgrid(:), x, 'VariableNames', {'time', 'x'});
writetable(T, fullfile(gdir, 'mass_spring_damper.csv'));

vv = ver; names = {vv.Name};
meta = struct('case', 'mass_spring_damper', 'matlab', version, ...
    'simscape', vv(strcmp(names, 'Simscape')).Version, ...
    'solver', 'daessc', 'relTol', 1e-6, 'absTol', 1e-8, ...
    'stopTime', 1.0, 'outputTimes', '0:0.001:1.0', ...
    'date', char(datetime('now', 'Format', 'yyyy-MM-dd''T''HH:mm:ss')));
fid = fopen(fullfile(gdir, 'mass_spring_damper.meta.json'), 'w');
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
error('build_mass_spring_damper:param', 'Block %s has none of the parameters {%s}; map them on the first licensed run.', blk, strjoin(candidates, ', '));
end
