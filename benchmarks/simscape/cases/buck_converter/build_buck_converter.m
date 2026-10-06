function build_buck_converter()
% Buck converter (CCM): 24 V DC source -> Foundation Switch (PWM carrier compare) -> inductor 2 mH, freewheeling diode,
% 2 mF output capacitor, 1 Ohm load. Duty D = 0.5, fs = 2 kHz. Foundation blocks only.
% Writes ../../golden/buck_converter.csv (time,v_out) and buck_converter.meta.json.
%
% NOT YET RUN: authored without a MATLAB licence (WP-12b). Before generating the golden, confirm the block paths and the
% parameter names with  find_system('fl_lib','Name','Switch')  and  get(..., 'DialogParameters').
% Until the golden exists the case is checked against the averaged closed form (case.json "analytic").
mdl = 'buck_converter_sscm';
if bdIsLoaded(mdl), close_system(mdl, 0); end
new_system(mdl); open_system(mdl);

P.src = 'fl_lib/Electrical/Electrical Sources/DC Voltage Source';
P.sw  = 'fl_lib/Electrical/Electrical Elements/Switch';
P.dio = 'fl_lib/Electrical/Electrical Elements/Diode';
P.ind = 'fl_lib/Electrical/Electrical Elements/Inductor';
P.cap = 'fl_lib/Electrical/Electrical Elements/Capacitor';
P.res = 'fl_lib/Electrical/Electrical Elements/Resistor';
P.ref = 'fl_lib/Electrical/Electrical Elements/Electrical Reference';
P.vs  = 'fl_lib/Electrical/Electrical Sensors/Voltage Sensor';
P.cfg = 'nesl_utility/Solver Configuration';
P.psc = 'nesl_utility/PS-Simulink Converter';
P.spc = 'nesl_utility/Simulink-PS Converter';

add_block(P.src, [mdl '/Vin']);  set_param([mdl '/Vin'], 'v0', '24', 'v0_unit', 'V');
add_block(P.sw,  [mdl '/SW']);   set_param([mdl '/SW'], 'Ron', '0.001', 'Ron_unit', 'Ohm', 'Goff', '1e-6', 'Goff_unit', '1/Ohm', 'Vth', '0', 'Vth_unit', 'V');
add_block(P.dio, [mdl '/D']);    set_param([mdl '/D'], 'Vf', '0', 'Vf_unit', 'V', 'Ron', '0.001', 'Ron_unit', 'Ohm', 'Goff', '1e-6', 'Goff_unit', '1/Ohm');
add_block(P.ind, [mdl '/L']);    set_param([mdl '/L'], 'l', '2e-3', 'l_unit', 'H');
add_block(P.cap, [mdl '/C']);    set_param([mdl '/C'], 'c', '2e-3', 'c_unit', 'F');
add_block(P.res, [mdl '/R']);    set_param([mdl '/R'], 'R', '1', 'R_unit', 'Ohm');
add_block(P.ref, [mdl '/GND']);
add_block(P.vs,  [mdl '/VSense']);
add_block(P.cfg, [mdl '/Solver']);
add_block(P.psc, [mdl '/PSS']);
add_block(P.spc, [mdl '/SPS']);
add_block('simulink/Sources/Sine Wave', [mdl '/Carrier']);   % unit sine at fs: sin > cos(pi D) for a fraction D of the period
set_param([mdl '/Carrier'], 'Amplitude', '1', 'Frequency', '2*pi*2000');
add_block('simulink/Sinks/Out1', [mdl '/v_out']);
% duty D = 0.5 -> threshold cos(pi/2) = 0: the Switch closes while the carrier is positive

h = @(b) get_param([mdl '/' b], 'PortHandles');
Vin = h('Vin'); SW = h('SW'); D = h('D'); L = h('L'); C = h('C'); R = h('R'); G = h('GND'); S = h('VSense'); K = h('Solver'); PS = h('PSS'); SP = h('SPS'); CA = h('Carrier');
add_line(mdl, Vin.LConn(1), SW.LConn(1));   % + terminal -> switch
add_line(mdl, SW.RConn(1),  D.RConn(1));    % switch node -> diode cathode
add_line(mdl, SW.RConn(1),  L.LConn(1));
add_line(mdl, D.LConn(1),   G.LConn(1));    % diode anode -> ground
add_line(mdl, L.RConn(1),   R.LConn(1));
add_line(mdl, R.LConn(1),   C.LConn(1));
add_line(mdl, C.RConn(1),   G.LConn(1));
add_line(mdl, R.RConn(1),   G.LConn(1));
add_line(mdl, Vin.RConn(1), G.LConn(1));
add_line(mdl, K.RConn(1),   G.LConn(1));
add_line(mdl, S.LConn(1),   R.LConn(1));
add_line(mdl, S.LConn(2),   G.LConn(1));
add_line(mdl, CA.Outport(1), SP.Inport(1));
add_line(mdl, SP.RConn(1),  SW.LConn(2));   % control port of the switch
add_line(mdl, S.RConn(1),   PS.LConn(1));
add_line(mdl, PS.Outport(1), get_param([mdl '/v_out'], 'PortHandles').Inport(1));

tgrid = 0:4.9e-5:0.03;
set_param(mdl, 'Solver', 'daessc', 'StopTime', '0.03', 'RelTol', '1e-6', 'AbsTol', '1e-8', 'MaxStep', '1e-6', ...
    'OutputOption', 'SpecifiedOutputTimes', 'OutputTimes', 'tgrid_bench', ...
    'SaveOutput', 'on', 'OutputSaveName', 'yout', 'SaveFormat', 'Dataset');
assignin('base', 'tgrid_bench', tgrid);
set_param(mdl, 'ReturnWorkspaceOutputs', 'on');
out = sim(mdl);
y = out.yout{1}.Values;
t = y.Time(:); v = y.Data(:);
v_out = interp1(t, v, tgrid(:), 'linear', 'extrap');

here = fileparts(mfilename('fullpath'));
gdir = fullfile(here, '..', '..', 'golden');
if ~exist(gdir, 'dir'), mkdir(gdir); end
T = table(tgrid(:), v_out, 'VariableNames', {'time', 'v_out'});
writetable(T, fullfile(gdir, 'buck_converter.csv'));

vv = ver; names = {vv.Name};
meta = struct('case', 'buck_converter', 'matlab', version, ...
    'simscape', vv(strcmp(names, 'Simscape')).Version, ...
    'solver', 'daessc', 'relTol', 1e-6, 'absTol', 1e-8, ...
    'stopTime', 0.03, 'outputTimes', '0:4.9e-5:0.03', ...
    'date', char(datetime('now', 'Format', 'yyyy-MM-dd''T''HH:mm:ss')));
fid = fopen(fullfile(gdir, 'buck_converter.meta.json'), 'w');
fwrite(fid, jsonencode(meta, 'PrettyPrint', true)); fclose(fid);
close_system(mdl, 0);
end

