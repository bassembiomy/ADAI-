function build_tank_drain()
% Tank draining through a laminar resistance to a reservoir (WP-17), Simscape Isothermal Liquid.
%   C dp/dt = -(p - p_atm)/R,  p(0) = P0   ->   p(t) - p_atm = (P0 - p_atm) exp(-t/(R C)),  tau = R C = 10 s
% Tank: Constant Volume Chamber (IL) of volume V, liquid bulk modulus beta -> hydraulic capacitance C = V/beta, V = 1e-5 * beta [m^3] chosen
% so that C = 1e-5 kg/Pa in V-Lab's mass units for a fluid of density rho_ref (C_mass = V rho/beta; set rho/beta so it equals 1e-5 kg/Pa).
% Resistance: Pipe (IL) / Local Resistance with a laminar Hagen-Poiseuille resistance R = 1e6 Pa s/kg. Reservoir: Reservoir (IL) at 101325 Pa,
% initial tank pressure 151325 Pa. The recorded signal is the drained pressure dp = P0 - p(t) = 5e4 (1 - exp(-t/10)) Pa.
% Analytic: see simscape_benchmarks/runCase.ts, first_order_step (final 5e4, tau 10).
% Writes ../../golden/tank_drain.csv (time,dp_drained) and tank_drain.meta.json.
%
% STATUS: analytic reference only. This builder has NOT been run (no golden exists yet, Simscape licence required): the block parameter
% names of the Isothermal Liquid library are mapped by name and must be confirmed on the first licensed run (the builder stops with a clear
% error instead of guessing a different mapping).
mdl = 'tank_drain_sscm';
if bdIsLoaded(mdl), close_system(mdl, 0); end
new_system(mdl); open_system(mdl);

P.tank = 'fl_lib/Isothermal Liquid/Elements/Constant Volume Chamber (IL)';
P.pipe = 'fl_lib/Isothermal Liquid/Elements/Pipe (IL)';
P.res  = 'fl_lib/Isothermal Liquid/Elements/Reservoir (IL)';
P.sens = 'fl_lib/Isothermal Liquid/Sensors/Pressure Sensor (IL)';
P.liq  = 'fl_lib/Isothermal Liquid/Utilities/Isothermal Liquid Properties (IL)';
P.cfg  = 'nesl_utility/Solver Configuration';
P.psc  = 'nesl_utility/PS-Simulink Converter';

add_block(P.tank, [mdl '/Tank']);
add_block(P.pipe, [mdl '/Pipe']);
add_block(P.res,  [mdl '/Reservoir']);
add_block(P.sens, [mdl '/Sensor']);
add_block(P.liq,  [mdl '/Liquid']);
add_block(P.cfg,  [mdl '/Solver']);
add_block(P.psc,  [mdl '/PSS']);
add_block('simulink/Sources/Constant', [mdl '/P0']); set_param([mdl '/P0'], 'Value', '151325');
add_block('simulink/Math Operations/Sum', [mdl '/Diff']); set_param([mdl '/Diff'], 'Inputs', '+-');
add_block('simulink/Sinks/Out1', [mdl '/dp_drained']);

setp([mdl '/Tank'], {'pressure_start', 'p_init', 'initial_pressure'}, '151325', 'Pa');
setp([mdl '/Pipe'], {'laminar_resistance', 'R_lam', 'hydraulic_resistance'}, '1e6', 'Pa/(kg/s)');
setp([mdl '/Reservoir'], {'reservoir_pressure', 'p_reservoir'}, '101325', 'Pa');
% tank capacitance C = V rho / beta = 1e-5 kg/Pa: with water (rho = 998, beta = 2e9 Pa) V = 1e-5 beta / rho = 20.04 m^3
setp([mdl '/Tank'], {'volume', 'V'}, '20.04', 'm^3');

h = @(b) get_param([mdl '/' b], 'PortHandles');
T = h('Tank'); R = h('Pipe'); S = h('Reservoir'); N = h('Sensor'); L = h('Liquid'); C = h('Solver'); Q = h('PSS');
add_line(mdl, T.LConn(1), R.LConn(1));
add_line(mdl, R.RConn(1), S.LConn(1));
add_line(mdl, T.LConn(1), N.LConn(1));
add_line(mdl, L.RConn(1), T.LConn(1));
add_line(mdl, C.RConn(1), T.LConn(1));
add_line(mdl, N.RConn(1), Q.LConn(1));
add_line(mdl, get_param([mdl '/P0'], 'PortHandles').Outport(1), get_param([mdl '/Diff'], 'PortHandles').Inport(1));
add_line(mdl, Q.Outport(1), get_param([mdl '/Diff'], 'PortHandles').Inport(2));
add_line(mdl, get_param([mdl '/Diff'], 'PortHandles').Outport(1), get_param([mdl '/dp_drained'], 'PortHandles').Inport(1));

tgrid = 0:0.05:40;
set_param(mdl, 'Solver', 'daessc', 'StopTime', '40', 'MaxStep', '0.05', ...
    'RelTol', '1e-6', 'AbsTol', '1e-8', ...
    'OutputOption', 'SpecifiedOutputTimes', 'OutputTimes', 'tgrid_bench', ...
    'SaveOutput', 'on', 'OutputSaveName', 'yout', 'SaveFormat', 'Dataset');
assignin('base', 'tgrid_bench', tgrid);
set_param(mdl, 'ReturnWorkspaceOutputs', 'on');
out = sim(mdl);
y = out.yout{1}.Values;
t = y.Time(:); v = y.Data(:);
dp = interp1(t, v, tgrid(:), 'linear', 'extrap');

here = fileparts(mfilename('fullpath'));
gdir = fullfile(here, '..', '..', 'golden');
if ~exist(gdir, 'dir'), mkdir(gdir); end
Tb = table(tgrid(:), dp, 'VariableNames', {'time', 'dp_drained'});
writetable(Tb, fullfile(gdir, 'tank_drain.csv'));

vv = ver; names = {vv.Name};
meta = struct('case', 'tank_drain', 'matlab', version, ...
    'simscape', vv(strcmp(names, 'Simscape')).Version, ...
    'solver', 'daessc', 'relTol', 1e-6, 'absTol', 1e-8, ...
    'stopTime', 40, 'outputTimes', '0:0.05:40', ...
    'date', char(datetime('now', 'Format', 'yyyy-MM-dd''T''HH:mm:ss')));
fid = fopen(fullfile(gdir, 'tank_drain.meta.json'), 'w');
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
error('build_tank_drain:param', 'Block %s has none of the parameters {%s}; map them on the first licensed run.', blk, strjoin(candidates, ', '));
end
