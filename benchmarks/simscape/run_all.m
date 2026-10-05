% Regenerates every golden under benchmarks/simscape/golden by running
% each cases/*/build_*.m. Requires MATLAB + Simscape (Foundation library).
here = fileparts(mfilename('fullpath'));
cases = dir(fullfile(here, 'cases', '*'));
cases = cases([cases.isdir] & ~startsWith({cases.name}, '.'));
for k = 1:numel(cases)
    cdir = fullfile(here, 'cases', cases(k).name);
    builders = dir(fullfile(cdir, 'build_*.m'));
    for j = 1:numel(builders)
        [~, fn] = fileparts(builders(j).name);
        fprintf('== %s ==\n', cases(k).name);
        old = cd(cdir);
        cleanup = onCleanup(@() cd(old));
        feval(fn);
        clear cleanup; cd(old);
    end
end
fprintf('run_all: done\n');
