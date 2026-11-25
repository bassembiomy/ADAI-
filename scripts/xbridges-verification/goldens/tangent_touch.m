function tangent_touch()
% TANGENT_TOUCH  Golden runner for XBV-419 / XBV-420: is a zero-crossing that TOUCHES zero (no sign change) an event?
%
%   WHY THIS EXISTS
%   ADIA's X-Bridges engine locates zero crossings only where the crossing function changes sign. u = (t-1)^2 touches zero
%   at t = 1 and is positive on both sides, so under batch solvers nothing happens there, while the live path (which the
%   canvas evaluates on a grid that contains t = 1) switches. Two findings depend on which behaviour Simulink has:
%     XBV-419: Relay, switchOn 0.25, switchOff 0, on u = (t-1)^2.  ADIA batch: the relay never switches off.
%              An oracle that treats the touch as an event gives an off time of t = 1 and a different integral (0.5).
%     XBV-420: Dead Zone [-1, 0] on the same u under ode23tb.  ADIA's batch errs by 2.55e-4 where ode23 / ode45 are exact.
%   This script answers the question from MATLAB and exports the answer, so the decision is made against numbers and not
%   against a reading of the documentation.
%
%   WHAT IT RUNS
%   Three models, each from code (no .slx is committed), four solvers -- ode23, ode45, ode23tb (variable step) and ode4 with a
%   fixed 0.01 s step -- and zero-crossing detection on and off:
%       relayOff : u = (t-1)^2,        Relay switchOn 0.25 / switchOff 0, output 1 while on  (XBV-419; a touch of the
%                  switch-OFF point at t = 1)
%       relayOn  : u = 0.25 - (t-1)^2, Relay switchOn 0.25 / switchOff 0, output 1 while on  (the symmetric case: a touch of
%                  the switch-ON point at t = 1, approached from below)
%       deadzone : u = (t-1)^2,        Dead Zone [-1, 0]                                    (XBV-420; a touch of the upper limit)
%   and for each combination:
%       set_param(model, 'ZeroCrossControl', 'UseLocalSettings')   + per-block 'ZeroCross' 'on'   -> <solver>_zcon.csv
%       set_param(model, 'ZeroCrossControl', 'DisableAll')                                          -> <solver>_zcoff.csv
%   The block set is the identical graph in the MATLAB Function, only the detection state differs, so a difference between
%   the two files is attributable to zero-crossing detection alone.
%
%   HOW TO RUN
%       matlab -batch "run('scripts/xbridges-verification/goldens/tangent_touch.m')"
%   or from the MATLAB editor, with the current folder at the repository root (or anywhere: the output folder is derived
%   from this file's own location).
%
%   ENVIRONMENT (fill in from the machine that produced the CSVs; the test reads it back out of the file header)
%       MATLAB       : R2024b (23.2.0)          [update the two literals below if another release is used]
%       Simulink     : 24.2
%       Computer     : x86-64, Windows 11        (glibc/Apple Silicon differences do not matter, but record it)
%
%   SOLVER SETTINGS (identical for both models)
%       start 0 s, stop 4 s.
%       ode23 / ode45 / ode23tb : variable step, MaxStep 0.01 s so that every solver visits t = 1 and its neighbourhood
%                                 with a comparable resolution, RelTol 1e-3 and AbsTol 1e-6 (Simulink defaults: RelTol
%                                 'auto' resolves to 1e-3, AbsTol 'auto' to 1e-6), InitialStep 'auto'.
%       ode4                    : fixed step 0.01 s, start 0, stop 4 (the grid contains t = 1 exactly, which is the case the
%                                 batch path gets "wrong" today -- the CSVs show whether Simulink agrees with the canvas).
%       Zero-crossing detection : 'UseLocalSettings' (Relay and Dead Zone default to 'on') vs 'DisableAll'.
%       Relay block             : Switch on point 0.25, Switch off point 0, Output when on 1, Output when off 0,
%                                 Input processing 'Elements as channels (sample based)', Zero-cross 'on'.
%       Dead Zone block         : Lower limit -1, Upper limit 0, Zero-cross 'on'.
%       NOTE: the Dead Zone upper limit 0 is what makes the case a touch -- the function u - 0 = (t-1)^2 is >= 0 and only
%       equals 0 at t = 1, so the block output is u for all t != 1 and 0 at t = 1, and the event (if any) is a touch.
%
%   OUTPUT
%       docs/xbridges-verification/goldens/tangent_touch_<relayOff|relayOn|deadzone>_<solver>_<zcon|zcoff>.csv
%       columns: t, y   (y = the block output; the relay takes values 0 / 1, the dead zone takes the input minus the limits)
%       plus a companion .meta.json per model+solver with the block parameters, the solver settings that were actually in
%       force (read back with get_param after the run) and the MATLAB/Simulink versions -- so the CSV can never be separated
%       from the configuration that produced it.
%       A run summary table is printed and written to tangent_touch_summary.txt: the switch time of the relay (the first t
%       where the output leaves 1), the integral of the dead-zone output over [0, 4], and whether any solver produced a
%       sample at exactly t = 1.
%
%   SAFETY
%       The models are built in memory (new_system, never saved), closed and discarded afterwards, so no .slx appears in the
%       working folder. Nothing is written outside docs/xbridges-verification/goldens/. Re-running overwrites the CSVs.

  % The script lives at scripts/xbridges-verification/goldens/tangent_touch.m; the CSVs belong with the other verification
  % evidence, so walk up three levels to the repository root and write into docs/xbridges-verification/goldens/.
  here = fileparts(mfilename('fullpath'));
  repoRoot = fileparts(fileparts(fileparts(here)));
  outDir = fullfile(repoRoot, 'docs', 'xbridges-verification', 'goldens');
  if ~exist(outDir, 'dir'); mkdir(outDir); end

  matlabVersion = 'R2024b (23.2.0)';      % <-- keep in sync with the header above
  simulinkVersion = '24.2';

  stopTime = 4;
  fixedStep = 0.01;

  summary = {};
  summary{end+1} = sprintf('tangent_touch goldens -- MATLAB %s, Simulink %s', matlabVersion, simulinkVersion);
  summary{end+1} = sprintf('%-10s %-8s %-6s %-22s %-12s %s', 'model', 'solver', 'zc', 'switch time / integral', 'sample at t=1', 'file');

  models = {'relayOff', 'relayOn', 'deadzone'};
  solvers = {'ode23', 'ode45', 'ode23tb', 'ode4'};
  zcStates = {'zcon', 'zcoff'};

  for mi = 1:numel(models)
    model = models{mi};
    for si = 1:numel(solvers)
      solver = solvers{si};
      % The variable-step solvers need MaxStep small enough to come near t = 1; the fixed-step one is exact by construction.
      if strcmp(solver, 'ode4')
        cfg = struct('Solver', 'ode4', 'FixedStep', num2str(fixedStep), 'StartTime', '0', 'StopTime', num2str(stopTime));
      else
        cfg = struct('Solver', solver, 'MaxStep', '0.01', 'RelTol', '1e-3', 'AbsTol', '1e-6', ...
                     'StartTime', '0', 'StopTime', num2str(stopTime));
        if strcmp(solver, 'ode23tb')
          % Simulink's stiff solver has its own knobs; keep the defaults and only fix the maximum step, so the comparison is
          % "Simulink's ode23tb at default tolerances", which is exactly the configuration XBV-420 was measured in.
          cfg.MaxStep = '0.01';
        end
      end
      for zi = 1:numel(zcStates)
        zc = zcStates{zi};
        [t, y, meta] = runOne(model, cfg, zc, fixedStep, simulinkVersion, matlabVersion);
        base = sprintf('tangent_touch_%s_%s_%s', model, solver, zc);
        csvPath = fullfile(outDir, [base '.csv']);
        %%.17g so the file is a lossless record of the doubles (no %.6f rounding surprises in the test).
        fid = fopen(csvPath, 'w');
        if fid < 0; error('tangent_touch: cannot write %s', csvPath); end
        fprintf(fid, 't,y\n');
        for k = 1:numel(t)
          fprintf(fid, '%.17g,%.17g\n', t(k), y(k));
        end
        fclose(fid);
        writeMeta(fullfile(outDir, [base '.meta.json']), meta);

        value = describe(model, t, y);
        atOne = any(abs(t - 1) < 1e-12);
        summary{end+1} = sprintf('%-10s %-8s %-6s %-22s %-12s %s', model, solver, zc, value, ternary(atOne, 'yes', 'no'), [base '.csv']);
      end
    end
  end

  summaryPath = fullfile(outDir, 'tangent_touch_summary.txt');
  fid = fopen(summaryPath, 'w');
  fprintf(fid, '%s\n', summary{:});
  fclose(fid);
  fprintf('%s\n', summary{:});
  fprintf('\nWritten to %s\n', outDir);
end

% ---------------------------------------------------------------------------------------------------------------------
function [t, y, meta] = runOne(model, cfg, zc, fixedStep, simulinkVersion, matlabVersion)
  modelName = sprintf('xb_tangent_%s', model);

  % Load an empty model from code: no .slx is committed, so the repository has nothing binary in it.
  new_system(modelName);
  load_system(modelName);
  guard = onCleanup(@() closeAndDelete(modelName)); %#ok<NASGU>  (the destructor runs at function exit)

  add_block('simulink/Sources/Clock', [modelName '/t'], 'Position', [30 100 60 130]);
  % u = (t - 1)^2 through Fcn, which is exactly the ADIA expression.
  add_block('simulink/User-Defined Functions/Fcn', [modelName '/u'], 'Position', [110 95 160 135], 'Expr', '(u(1)-1)^2');
  % The block output is recorded as a timeseries: its own time vector is the grid the solver actually produced, which is
  % the only honest time base for "did the solver stop at t = 1?".
  add_block('simulink/Sinks/To Workspace', [modelName '/y'], 'Position', [420 90 470 140], ...
            'VariableName', 'golden_y', 'SaveFormat', 'Timeseries', 'MaxDataPoints', 'inf', 'SampleTime', '-1');

  if strcmp(model, 'relayOn') || strcmp(model, 'relayOff')
    % XBV-419 is the switch-OFF point: switchOn 0.25, switchOff 0, output 1 while on. u = (t-1)^2 starts at 1 > 0.25, so the
    % relay is ON, and the question is whether the touch of switchOff at t = 1 switches it OFF.
    % The symmetric question is a touch of the SWITCH-ON point (u enters from below and only reaches 0.25 at t = 1):
    % u = 0.25 - (t-1)^2, switchOn 0.25, switchOff 0, output 1 while on -- added because a Relay that only reacts to sign
    % changes would miss that one too, and the two answers should agree.
    if strcmp(model, 'relayOn')
      setFcnExpr(modelName, '0.25 - (u(1)-1)^2');
    end
    add_block('simulink/Discontinuities/Relay', [modelName '/d'], 'Position', [230 90 280 140], ...
              'OnSwitchValue', '0.25', 'OffSwitchValue', '0', 'OnOutputValue', '1', 'OffOutputValue', '0', ...
              'InputProcessing', 'Element-wise');
  else
    add_block('simulink/Discontinuities/Dead Zone', [modelName '/d'], 'Position', [230 90 280 140], ...
              'LowerLimit', '-1', 'UpperLimit', '0');
  end
  if strcmp(zc, 'zcon')
    set_param([modelName '/d'], 'ZeroCross', 'on');
    set_param(modelName, 'ZeroCrossControl', 'UseLocalSettings');
  else
    set_param([modelName '/d'], 'ZeroCross', 'off');
    set_param(modelName, 'ZeroCrossControl', 'DisableAll');
  end

  add_line(modelName, 't/1', 'u/1');
  add_line(modelName, 'u/1', 'd/1');
  add_line(modelName, 'd/1', 'y/1');

  % Solver configuration (applied after the blocks so nothing can reset it).
  fields = fieldnames(cfg);
  for f = 1:numel(fields)
    set_param(modelName, fields{f}, cfg.(fields{f}));
  end
  set_param(modelName, 'StopTime', cfg.StopTime);
  set_param(modelName, 'SaveTime', 'on', 'SaveOutput', 'on', 'SignalLogging', 'off');
  set_param(modelName, 'ReturnWorkspaceOutputs', 'on');

  % The output of the discontinuity block is what we record; the Clock trace gives the sample grid.
  warnings = {};
  try
    simOut = sim(modelName, 'CaptureErrors', 'on');
    [t, y] = readOutput(simOut);
  catch err
    % Never fail silently: a solver that cannot run this model is itself a result and must be visible in the CSVs.
    warnings{end+1} = sprintf('sim failed: %s', err.message);
    t = zeros(0, 1);
    y = zeros(0, 1);
  end

  % Read back what was actually in force, so the meta file cannot drift from the configuration that produced the CSV.
  meta = struct();
  meta.model = model;
  meta.matlabVersion = matlabVersion;
  meta.simulinkVersion = simulinkVersion;
  meta.zeroCrossing = zc;
  meta.zeroCrossControl = get_param(modelName, 'ZeroCrossControl');
  meta.solver = get_param(modelName, 'Solver');
  meta.fixedStep = get_param(modelName, 'FixedStep');
  meta.maxStep = get_param(modelName, 'MaxStep');
  meta.relTol = get_param(modelName, 'RelTol');
  meta.absTol = get_param(modelName, 'AbsTol');
  meta.startTime = get_param(modelName, 'StartTime');
  meta.stopTime = get_param(modelName, 'StopTime');
  meta.blockZeroCross = get_param([modelName '/d'], 'ZeroCross');
  if strcmp(model, 'relay')
    meta.onSwitchValue = get_param([modelName '/d'], 'OnSwitchValue');
    meta.offSwitchValue = get_param([modelName '/d'], 'OffSwitchValue');
  else
    meta.lowerLimit = get_param([modelName '/d'], 'LowerLimit');
    meta.upperLimit = get_param([modelName '/d'], 'UpperLimit');
  end
  meta.samples = numel(t);
  meta.warnings = warnings;
  meta.computer = computer();
end

function [t, y] = readOutput(simOut)
  if isstruct(simOut)
    ts = simOut.golden_y;
  else
    ts = simOut.get('golden_y');
  end
  if isa(ts, 'timeseries')
    t = ts.Time(:);
    y = squeeze(ts.Data);
    y = y(:);
  else
    % SaveFormat fallbacks, so an older release still produces a usable pair
    t = ts.time(:);
    if isstruct(ts) && isfield(ts, 'signals'); y = ts.signals.values(:); else; y = ts.data(:); end
  end
end

function value = describe(model, t, y)
  if isempty(t)
    value = 'NO SAMPLES';
    return;
  end
  if strcmp(model, 'relayOff') || strcmp(model, 'relayOn')
    % relayOff: output is 1 (on) from t = 0; the switch we are asking about turns it to 0 at the touch t = 1.
    % relayOn : output is 0 (off) from t = 0; the switch we are asking about turns it to 1 at the touch t = 1.
    % 'never' means the touch was not an event for this solver; a number means it was.
    want = ternary(strcmp(model, 'relayOff'), 1, 0);
    idx = find(y ~= want, 1, 'first');
    if isempty(idx); value = 'switch: never'; else; value = sprintf('switch: %.6f', t(idx)); end
  else
    % Trapezoid over the samples; the same integral the ADIA acceptance uses for the dead-zone error.
    if numel(t) < 2; value = 'integral: n/a'; else; value = sprintf('integral: %.10f', trapz(t, y)); end
  end
end

function writeMeta(path, meta)
  fid = fopen(path, 'w');
  if fid < 0; error('tangent_touch: cannot write %s', path); end
  fprintf(fid, '{\n');
  keys = fieldnames(meta);
  for k = 1:numel(keys)
    v = meta.(keys{k});
    if iscell(v)
      inside = strjoin(cellfun(@(s) ['"' escape(s) '"'], v, 'UniformOutput', false), ', ');
      fprintf(fid, '  "%s": [%s]%s\n', keys{k}, inside, ternary(k < numel(keys), ',', ''));
    elseif isnumeric(v)
      fprintf(fid, '  "%s": %s%s\n', keys{k}, num2str(v), ternary(k < numel(keys), ',', ''));
    else
      fprintf(fid, '  "%s": "%s"%s\n', keys{k}, escape(v), ternary(k < numel(keys), ',', ''));
    end
  end
  fprintf(fid, '}\n');
  fclose(fid);
end

function s = escape(s)
  s = strrep(char(s), '"', '\"');
end

function setFcnExpr(modelName, expr)
  set_param([modelName '/u'], 'Expr', expr);
end

function r = ternary(cond, a, b)
  if cond; r = a; else; r = b; end
end

function closeAndDelete(modelName)
  try
    if bdIsLoaded(modelName); close_system(modelName, 0); end
  catch
  end
  try
    if exist([modelName '.slx'], 'file'); delete([modelName '.slx']); end
  catch
  end
end
