function far_root_loop()
% FAR_ROOT_LOOP  Golden runner for XBV-436: does Simulink itself solve  y = c + y -/+ k y^2  from a zero start, far roots?
%
%   WHY THIS EXISTS
%   ADIA's algebraic-loop solver starts from y = 0. The loop y = c + y - k y^2 has the residual g(y) = k y^2 - c, and at y = 0
%   g'(y) = 0, so a Newton step from zero is undefined. XBV-436 asks ADIA to converge for roots sqrt(c/k) up to 1e10 from
%   that start. Simulink's algebraic loop solver also starts from 0 unless the user supplies an initial guess (IC block /
%   signal initial value), so before the target is fixed, Simulink decides whether it is something Simulink itself does.
%   This script records, per case, whether Simulink converges from zero, with which error identifier it fails when it does
%   not, and what a start at 0.9 x root does (the start sensitivity).
%
%   WHAT IT RUNS
%   The 12 cases of xbEngineB.test.ts describe 'e' (c and k are copied from CASES there, not invented):
%       root 1e3  : c = 1,    k = 1e-6        root 1e7 : c = 1, k = 1e-14      root 1e8 : c = 1, k = 1e-16
%       root 3.16e8: c = 1e-3, k = 1e-20      root 1e9 : c = 1, k = 1e-18      root 1e10: c = 1, k = 1e-20
%   in two wirings of the same equation, exactly as ADIA wires it (ckLoop):
%       minus : Constant c -> Sum '++-' (in1 = c, in2 = Sum output, in3 = Gain(+k) of Product(y, y))
%       plus  : Constant c -> Sum '+++' (in1 = c, in2 = Sum output, in3 = Gain(-k) of Product(y, y))
%   Every case x wiring is run with AlgebraicLoopSolver 'TrustRegion' and 'LineSearch' (the two options Simulink offers),
%   from a zero start, and once more with an IC block holding 0.9 x root on the fed-back signal.
%
%   HOW TO RUN
%       matlab -batch "run('scripts/xbridges-verification/goldens/far_root_loop.m')"
%
%   ENVIRONMENT (update the literals below if another release is used)
%       MATLAB R2024b (23.2.0), Simulink 24.2.
%
%   SETTINGS: Solver ode45 (variable step), StartTime 0, StopTime 0 (one sample, the loop solved at t = 0),
%       AlgebraicLoopMsg 'none' (no warning/error just because a loop exists), AlgebraicLoopSolver per file.
%       The values actually in force are read back with get_param and written to the .meta.json and the CSV header.
%
%   OUTPUT  docs/xbridges-verification/goldens/far_root_loop_<TrustRegion|LineSearch>.csv  (+ .meta.json)
%       Lines starting with '#' are the header (versions, settings). Then the column row:
%         case_id    root_<root with 3 significant digits>_<minus|plus>_<zero|guess>
%         root       sqrt(c/k), the closed-form positive root
%         c, k       the loop constants
%         wiring     minus | plus
%         start      zero (no initial guess) | guess (IC block, 0.9 x root)
%         guess      the initial guess used (0 for start = zero)
%         status     ok | fail   (fail = sim threw an MSLException)
%         error_id   ME.identifier when status = fail, else empty
%         error_msg  ME.message when status = fail, else empty (double-quoted CSV field, quotes doubled, newlines -> space)
%         y          the loop signal (Sum output) at t = 0 when status = ok, else empty
%
%   SAFETY  Models are built in memory (new_system, never saved) and closed afterwards; no .slx is written.

  here = fileparts(mfilename('fullpath'));
  repoRoot = fileparts(fileparts(fileparts(here)));
  outDir = fullfile(repoRoot, 'docs', 'xbridges-verification', 'goldens');
  if ~exist(outDir, 'dir'); mkdir(outDir); end

  matlabVersion = 'R2024b (23.2.0)';
  simulinkVersion = '24.2';

  % root, c, k -- copied from CASES in src/engine/xbridges/verification/xbEngineB.test.ts (describe 'e').
  cases = [ ...
    1e3,  1,    1e-6; ...
    1e7,  1,    1e-14; ...
    1e8,  1,    1e-16; ...
    sqrt(1e-3 / 1e-20), 1e-3, 1e-20; ...
    1e9,  1,    1e-18; ...
    1e10, 1,    1e-20];
  wirings = {'minus', 'plus'};
  solvers = {'TrustRegion', 'LineSearch'};

  for si = 1:numel(solvers)
    solver = solvers{si};
    rows = {};
    meta = struct();
    for ci = 1:size(cases, 1)
      root = cases(ci, 1); c = cases(ci, 2); k = cases(ci, 3);
      for wi = 1:numel(wirings)
        wiring = wirings{wi};
        for start = {'zero', 'guess'}
          st = start{1};
          if strcmp(st, 'guess'); guess = 0.9 * root; else; guess = 0; end
          [status, errId, errMsg, y, meta] = runOne(solver, c, k, wiring, st, guess, matlabVersion, simulinkVersion);
          caseId = sprintf('root_%.3g_%s_%s', root, wiring, st);
          rows{end+1} = sprintf('%s,%.17g,%.17g,%.17g,%s,%s,%.17g,%s,%s,%s,%s', caseId, root, c, k, wiring, st, guess, ...
                                status, csvField(errId), csvField(errMsg), yText(status, y)); %#ok<AGROW>
          fprintf('%-28s %-11s %-4s %s\n', caseId, solver, status, errId);
        end
      end
    end

    base = sprintf('far_root_loop_%s', solver);
    fid = fopen(fullfile(outDir, [base '.csv']), 'w');
    if fid < 0; error('far_root_loop: cannot write %s', base); end
    fprintf(fid, '# far_root_loop golden for XBV-436 -- MATLAB %s, Simulink %s\n', matlabVersion, simulinkVersion);
    fprintf(fid, '# AlgebraicLoopSolver=%s AlgebraicLoopMsg=%s Solver=%s StartTime=%s StopTime=%s computer=%s\n', ...
            meta.algebraicLoopSolver, meta.algebraicLoopMsg, meta.solver, meta.startTime, meta.stopTime, meta.computer);
    fprintf(fid, '# start=zero: no initial guess; start=guess: IC block with 0.9 x root on the fed-back Sum output\n');
    fprintf(fid, 'case_id,root,c,k,wiring,start,guess,status,error_id,error_msg,y\n');
    fprintf(fid, '%s\n', rows{:});
    fclose(fid);
    writeMeta(fullfile(outDir, [base '.meta.json']), meta);
  end
  fprintf('\nWritten to %s\n', outDir);
end

% ---------------------------------------------------------------------------------------------------------------------
function [status, errId, errMsg, y, meta] = runOne(solver, c, k, wiring, start, guess, matlabVersion, simulinkVersion)
  modelName = 'xb_far_root_loop';
  if bdIsLoaded(modelName); close_system(modelName, 0); end
  new_system(modelName);
  load_system(modelName);
  guard = onCleanup(@() closeAndDelete(modelName)); %#ok<NASGU>

  if strcmp(wiring, 'minus'); signs = '++-'; gain = k; else; signs = '+++'; gain = -k; end
  add_block('simulink/Sources/Constant', [modelName '/one'], 'Value', sprintf('%.17g', c));
  add_block('simulink/Math Operations/Sum', [modelName '/s'], 'Inputs', signs);
  add_block('simulink/Math Operations/Product', [modelName '/p'], 'Inputs', '**');
  add_block('simulink/Math Operations/Gain', [modelName '/gk'], 'Gain', sprintf('%.17g', gain));
  add_block('simulink/Sinks/To Workspace', [modelName '/y'], 'VariableName', 'golden_y', 'SaveFormat', 'Array', ...
            'MaxDataPoints', 'inf', 'SampleTime', '-1');

  add_line(modelName, 'one/1', 's/1');
  if strcmp(start, 'guess')
    % IC block on the fed-back branch: Simulink uses it as the initial guess of the algebraic loop solver.
    add_block('simulink/Signal Attributes/IC', [modelName '/ic'], 'Value', sprintf('%.17g', guess));
    add_line(modelName, 's/1', 'ic/1');
    add_line(modelName, 'ic/1', 's/2');
  else
    add_line(modelName, 's/1', 's/2');
  end
  add_line(modelName, 's/1', 'p/1');
  add_line(modelName, 's/1', 'p/2');
  add_line(modelName, 'p/1', 'gk/1');
  add_line(modelName, 'gk/1', 's/3');
  add_line(modelName, 's/1', 'y/1');

  set_param(modelName, 'SolverType', 'Variable-step', 'Solver', 'ode45', 'StartTime', '0', 'StopTime', '0');
  set_param(modelName, 'AlgebraicLoopSolver', solver, 'AlgebraicLoopMsg', 'none');
  set_param(modelName, 'ReturnWorkspaceOutputs', 'on');

  status = 'ok'; errId = ''; errMsg = ''; y = NaN;
  try
    simOut = sim(modelName);
    v = simOut.get('golden_y');
    y = v(end);
  catch ME
    % A solver that cannot run this model is itself a result and is recorded, never hidden.
    status = 'fail';
    errId = ME.identifier;
    errMsg = ME.message;
  end

  meta = struct();
  meta.matlabVersion = matlabVersion;
  meta.simulinkVersion = simulinkVersion;
  meta.algebraicLoopSolver = get_param(modelName, 'AlgebraicLoopSolver');
  meta.algebraicLoopMsg = get_param(modelName, 'AlgebraicLoopMsg');
  meta.solver = get_param(modelName, 'Solver');
  meta.startTime = get_param(modelName, 'StartTime');
  meta.stopTime = get_param(modelName, 'StopTime');
  meta.sumInputs = get_param([modelName '/s'], 'Inputs');
  meta.gain = get_param([modelName '/gk'], 'Gain');
  meta.computer = computer();
end

function s = yText(status, y)
  if strcmp(status, 'ok'); s = sprintf('%.17g', y); else; s = ''; end
end

function s = csvField(text)
  if isempty(text); s = ''; return; end
  text = regexprep(char(text), '[\r\n]+', ' ');
  s = ['"' strrep(text, '"', '""') '"'];
end

function writeMeta(path, meta)
  fid = fopen(path, 'w');
  if fid < 0; error('far_root_loop: cannot write %s', path); end
  fprintf(fid, '{\n');
  keys = fieldnames(meta);
  for i = 1:numel(keys)
    v = strrep(char(meta.(keys{i})), '"', '\"');
    if i < numel(keys); sep = ','; else; sep = ''; end
    fprintf(fid, '  "%s": "%s"%s\n', keys{i}, v, sep);
  end
  fprintf(fid, '}\n');
  fclose(fid);
end

function closeAndDelete(modelName)
  try
    if bdIsLoaded(modelName); close_system(modelName, 0); end
  catch
  end
end
