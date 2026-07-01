%% ===================================================================
%%  INDUSTRIAL AUTONOMOUS ROBOT VACUUM — Production v7.0 (Upgraded)
%%  Architecture: 4-Layer (Plant / Perception / Planning / Control)
%%
%%  Upgraded Features:
%%  [x] Any-Angle Path Planning (Theta* Algorithm)
%%  [x] Dynamic Obstacle Clustering & Kalman Filter Tracking
%%  [x] Space-Time Dynamic Window Approach (ST-DWA)
%%  [x] Utility-Driven Frontier Exploration with Information Gain
%%  [x] Interactive 3D Cinematic Cameras (Orbit / Chase / Top-Down)
%%  [x] Glowing Cleaning Trails & 3D Dirt Sweeping Mechanics
%%  [x] Advanced Dashboard HUD Stats Panel
%% ===================================================================
function robot_vacuum_3d_v7()
    clearvars; close all; clc;
    rng(42);

    %% ── SIMULATION PARAMETERS ──────────────────────────────────────────
    SIM.dt         = 0.05;
    SIM.total_time = 400;
    SIM.steps      = round(SIM.total_time / SIM.dt);
    SIM.random_env = true;

    %% ── ENVIRONMENT ────────────────────────────────────────────────────
    if SIM.random_env
        ENV = generate_random_environment();
    else
        ENV = build_fixed_environment();
    end
    ENV.total_time = SIM.total_time;

    %% ── ROBOT STATE ────────────────────────────────────────────────────
    ROB.pose     = ENV.robot_start;
    ROB.dock_pos = ENV.dock_pos;
    ROB.v        = 0;
    ROB.omega    = 0;
    ROB.radius   = 0.3;
    ROB.height   = 0.15;

    %% ── MEMORY ─────────────────────────────────────────────────────────
    MEM = init_memory(ROB.pose, ROB.dock_pos);

    %% ── 3D VISUALISATION ───────────────────────────────────────────────
    % Seed dirt particles in the environment before rendering
    ENV.dirt_pts = seed_dirt_particles(ENV, MEM.grid_x, MEM.grid_y);
    ENV.initial_dirt_count = size(ENV.dirt_pts, 1);
    
    VIZ = init_fast_visualization(ENV, MEM, ROB);

    %% ═══════════════════════════════════════════════════════════════════
    %% MAIN LOOP
    %% ═══════════════════════════════════════════════════════════════════
    for step = 1:SIM.steps
        t = step * SIM.dt;

        [SENS, ENV]              = plant_layer(ROB.pose, ENV, t, SIM.dt);
        MEM                      = perception_layer(SENS, MEM, SIM.dt);
        MEM                      = planning_layer(MEM, SENS, t, SIM.dt);
        [ROB.v, ROB.omega, MEM]  = control_layer(MEM, SENS, SIM.dt);
        ROB.pose                 = integrate_pose(ROB.pose, ROB.v, ROB.omega, SIM.dt);

        %% ── Render Throttling ──────────────────────────────────────
        if mod(step, 2) == 0
            if ishandle(VIZ.fig)
                VIZ = update_fast_viz(VIZ, ROB, SENS, MEM, ENV, t);
            else
                fprintf('Window closed at t=%.1fs\n', t);
                break;
            end
        end
    end
end

%% ===================================================================
%% ENVIRONMENT GENERATORS
%% ===================================================================
function ENV = build_fixed_environment()
    ENV.walls = [
        -6,-6,  6,-6;   6,-6,  6, 6;   6, 6, -6, 6;  -6, 6,-6,-6;
        -6, 2, -2, 2;   2,-2,  2, 4;  -3,-3,  1,-3;   3,-2, 6,-2
    ];
    ENV.point_obs  = [0,0; -4,0; 4,1];
    
    % Dynamic Obstacle 1
    ENV.dyn_start  = [1.5, 0.5];
    ENV.dyn_pos    = ENV.dyn_start;
    ENV.dyn_vel    = 0.4;
    
    % Dynamic Obstacle 2
    ENV.dyn2_start = [-2.0, -1.0];
    ENV.dyn2_pos   = ENV.dyn2_start;
    ENV.dyn2_vel   = 0.5;
    
    ENV.obs_radius = 0.4;
    ENV.wall_h     = 1.5;
    ENV.floor_z    = 0.0;
    ENV.robot_start = [-5.1; -5.1; deg2rad(90)];
    ENV.dock_pos    = [-5.1; -5.1];
end

function ENV = generate_random_environment()
    ENV.wall_h     = 1.5;
    ENV.floor_z    = 0.0;
    ENV.obs_radius = 0.4;
    ENV.dyn_vel    = 0.4;

    walls = [
        -6,-6,  6,-6;   6,-6,  6, 6;   6, 6, -6, 6;  -6, 6,-6,-6
    ];

    n_internal = randi([3, 6]);
    for i = 1:n_internal
        cx = -3 + rand()*6;
        cy = -3 + rand()*6;
        len = 1.5 + rand()*3;
        if cx > -5 && cx < -4 && cy > -5 && cy < -4
            cx = cx + 2;
        end
        if rand() > 0.5
            walls = [walls; cx, cy, cx+len, cy];
        else
            walls = [walls; cx, cy, cx, cy+len];
        end
    end
    ENV.walls = walls;

    n_pts = randi([3, 6]);
    pts = zeros(n_pts, 2);
    for i = 1:n_pts
        pts(i,:) = [-3+rand()*6, -3+rand()*6];
    end
    ENV.point_obs = pts;

    % Dynamic Obstacle 1
    ENV.dyn_start = [-1.5+rand()*3, -1.5+rand()*3];
    ENV.dyn_pos   = ENV.dyn_start;

    % Dynamic Obstacle 2
    ENV.dyn2_start = [2.0 - rand()*4, -2.0 + rand()*4];
    ENV.dyn2_pos   = ENV.dyn2_start;
    ENV.dyn2_vel   = 0.35 + rand()*0.25;

    ENV.robot_start = [-5.1; -5.1; deg2rad(90)];
    ENV.dock_pos    = [-5.1; -5.1];
end

%% ===================================================================
%% SEED DIRT PARTICLES
%% ===================================================================
function dirt_pts = seed_dirt_particles(ENV, gx, gy)
    dirt_pts = [];
    for i = 1:2:length(gy)
        for j = 1:2:length(gx)
            x = gx(j); y = gy(i);
            
            % Check if too close to walls
            safe = true;
            for w = 1:size(ENV.walls, 1)
                d = dist_point_to_segment(x, y, ENV.walls(w,1), ENV.walls(w,2), ENV.walls(w,3), ENV.walls(w,4));
                if d < 0.45
                    safe = false; break;
                end
            end
            if ~safe, continue; end
            
            % Check if too close to point obstacles
            for p = 1:size(ENV.point_obs, 1)
                d = norm([x - ENV.point_obs(p,1), y - ENV.point_obs(p,2)]);
                if d < 0.5
                    safe = false; break;
                end
            end
            if ~safe, continue; end
            
            % Check if too close to dock station
            if norm([x - ENV.dock_pos(1), y - ENV.dock_pos(2)]) < 0.7
                continue;
            end
            
            dirt_pts = [dirt_pts; x, y];
        end
    end
end

%% ===================================================================
%% MEMORY INITIALISATION
%% ===================================================================
function MEM = init_memory(init_pose, dock_pos)
    MEM.est_pose  = init_pose + [0.05; -0.05; deg2rad(2)];
    MEM.P         = diag([0.2, 0.2, 0.08]);
    MEM.dock_pos  = dock_pos;
    MEM.grid_res  = 0.25;
    MEM.grid_x    = -6:MEM.grid_res:6;
    MEM.grid_y    = -6:MEM.grid_res:6;
    nx = length(MEM.grid_x); ny = length(MEM.grid_y);
    MEM.nx = nx; MEM.ny = ny;
    MEM.occ_grid  = zeros(ny, nx);
    MEM.cov_grid  = zeros(ny, nx);
    MEM.zone_grid = zeros(ny, nx);
    MEM.robot_r   = 0.3;
    MEM.bt_state      = 'COVERAGE';
    MEM.cov_state     = 'BOUSTROPHEDON_SWEEP';
    MEM.astar_path    = [];
    MEM.path_idx      = 1;
    MEM.lookahead     = 1.0;
    MEM.recovery_state    = 'NONE';
    MEM.recovery_timer    = 0;
    MEM.recovery_attempts = 0;
    MEM.stuck_counter     = 0;
    MEM.last_pose         = MEM.est_pose(1:2);
    MEM.rotation_dir      = 1;
    MEM.wall_follow_timer = 0;
    MEM.zoning_done       = false;
    MEM.loop_closure_done = false;
    MEM.last_v = 0;
    MEM.last_w = 0;
    MEM.scan_ref          = [];
    MEM.scan_ref_pose     = [];
    MEM.lc_cooldown       = 0;
    MEM.dock_phase = 'PATH_FOLLOW';
    MEM.current_frontier = [];
    MEM.frontier_replan_t = 0;
    MEM.no_frontier_count = 0;
    MEM.oscillation_counter = 0;
    MEM.last_frontiers = [];
    
    % --- Core Requirements Additions ---
    MEM.battery           = 1.0;   % 100% capacity
    MEM.energy_per_meter  = 0.005; % energy consumed per meter of travel
    MEM.safety_margin     = 0.05;  % 5% battery margin (FR-BAT-03)
    MEM.room_entry_exit   = cell(30, 1); % FR-DOOR-01 Entry tracking (door used to enter room)
    MEM.detected_exits    = {};    % detected doorways (FR-DOOR-03)
    MEM.topo_graph        = [];    % adjacency matrix of rooms
    MEM.current_room      = 0;     % active room ID
    
    MEM.sweep_waypoints   = [];    % boustrophedon sweep waypoints
    MEM.sweep_idx         = 1;     % current sweep waypoint index
    MEM.swept_rooms       = [];    % completed rooms tracker
    MEM.transit_room      = 0;     % target room in room transition state
    MEM.transit_exit      = [];    % target exit position for transit
    MEM.exits_sequence    = [];    % ordered list of exits for return (FR-RETURN-02)
    MEM.exits_seq_idx     = 1;     % current index in exits_sequence
    
    % Upgraded Perception memory state
    MEM.tracked_obs = []; 
end

%% ===================================================================
%% LAYER 1 — PLANT PHYSICS & SENSING
%% ===================================================================
function [SENS, ENV] = plant_layer(true_pose, ENV, t, dt)
    % Update Dynamic Obstacle 1 Trajectory
    ENV.dyn_pos(1) = ENV.dyn_start(1) + 3.5*sin(ENV.dyn_vel * t * dt);
    ENV.dyn_pos(2) = ENV.dyn_start(2) + 1.2*cos(ENV.dyn_vel * t * dt);

    % Update Dynamic Obstacle 2 Trajectory
    if isfield(ENV, 'dyn2_pos')
        ENV.dyn2_pos(1) = ENV.dyn2_start(1) + 2.0*cos(ENV.dyn2_vel * t * dt);
        ENV.dyn2_pos(2) = ENV.dyn2_start(2) + 2.5*sin(ENV.dyn2_vel * t * dt);
    end

    px = true_pose(1); py = true_pose(2); pth = true_pose(3);

    % Sweep & collect dirt particles in proximity of the vacuum bumper
    if isfield(ENV, 'dirt_pts') && ~isempty(ENV.dirt_pts)
        dists_to_dirt = sqrt((ENV.dirt_pts(:,1) - px).^2 + (ENV.dirt_pts(:,2) - py).^2);
        cleaned_mask = dists_to_dirt < 0.42; % sweeping radius
        ENV.dirt_pts(cleaned_mask, :) = [];
    end

    angles  = deg2rad(-180:4:179);
    max_r   = 6.0;
    n_rays  = length(angles);
    ranges  = max_r * ones(1, n_rays);

    for i = 1:n_rays
        ang = pth + angles(i);
        dx  = cos(ang); dy = sin(ang);
        x2  = px + max_r*dx; y2 = py + max_r*dy;
        for w = 1:size(ENV.walls,1)
            t_hit = ray_segment_intersect(px,py,x2,y2, ...
                ENV.walls(w,1),ENV.walls(w,2),ENV.walls(w,3),ENV.walls(w,4));
            if ~isnan(t_hit) && t_hit*max_r < ranges(i)
                ranges(i) = t_hit*max_r;
            end
        end
        for p = 1:size(ENV.point_obs,1)
            d = ray_circle_intersect(px,py,dx,dy, ...
                ENV.point_obs(p,1),ENV.point_obs(p,2),0.3);
            if d > 0 && d < ranges(i), ranges(i) = d; end
        end
        
        % Check intersection with Dynamic Obstacle 1
        d_dyn = ray_circle_intersect(px,py,dx,dy, ...
            ENV.dyn_pos(1),ENV.dyn_pos(2),ENV.obs_radius);
        if d_dyn > 0 && d_dyn < ranges(i), ranges(i) = d_dyn; end
        
        % Check intersection with Dynamic Obstacle 2
        if isfield(ENV, 'dyn2_pos')
            d_dyn2 = ray_circle_intersect(px,py,dx,dy, ...
                ENV.dyn2_pos(1),ENV.dyn2_pos(2),ENV.obs_radius);
            if d_dyn2 > 0 && d_dyn2 < ranges(i), ranges(i) = d_dyn2; end
        end
    end

    ranges = ranges + 0.01*randn(1,n_rays);
    ranges = max(0.05, ranges);

    hit_mask = ranges < (max_r - 0.1);
    hit_ang  = pth + angles(hit_mask);
    SENS.lidar_pts = [px + ranges(hit_mask).*cos(hit_ang); ...
                      py + ranges(hit_mask).*sin(hit_ang)]';

    front_mask        = abs(angles) <= deg2rad(45);
    SENS.min_front    = min(ranges(front_mask));
    SENS.min_360      = min(ranges);
    [~, min_i]        = min(ranges);
    SENS.escape_dir   = sign(angdiff(pth + angles(min_i), pth) + 1e-6);
    noise             = [0.03*randn; 0.03*randn; 0.005*randn];
    SENS.meas_pose    = true_pose + noise;
    SENS.dock_pos     = ENV.dock_pos;
    SENS.dyn_obs_pos  = ENV.dyn_pos;
    SENS.true_pose    = true_pose;
    SENS.all_ranges   = ranges;
    SENS.all_angles   = angles;
end

function t_param = ray_segment_intersect(x1,y1,x2,y2,x3,y3,x4,y4)
    den = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
    t_param = nan;
    if abs(den) < 1e-10, return; end
    tp = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / den;
    up = -((x1-x2)*(y1-y3) - (y1-y2)*(x1-x3)) / den;
    if tp>=0 && tp<=1 && up>=0 && up<=1, t_param = tp; end
end

function d = ray_circle_intersect(px,py,dx,dy,cx,cy,r)
    d = inf;
    fx = px-cx; fy = py-cy;
    a  = dx^2+dy^2; b = 2*(fx*dx+fy*dy); c = fx^2+fy^2-r^2;
    disc = b^2-4*a*c;
    if disc < 0, return; end
    t1 = (-b-sqrt(disc))/(2*a);
    if t1 > 0.01, d = t1; end
end

%% ===================================================================
%% LAYER 2 — PERCEPTION (SLAM & DATMO)
%% ===================================================================
function MEM = perception_layer(SENS, MEM, dt)
    %% ── 1. Update Dynamic Obstacle Tracks (DATMO) ──────────────────
    MEM = track_dynamic_obstacles(SENS, MEM, dt);

    %% ── 2. Filter LiDAR Points (Remove Dynamic Outliers) ───────────
    static_pts = SENS.lidar_pts;
    if ~isempty(static_pts) && ~isempty(MEM.tracked_obs)
        is_dyn_pt = false(size(static_pts, 1), 1);
        for o = 1:length(MEM.tracked_obs)
            obs = MEM.tracked_obs(o);
            if obs.is_dynamic
                d_pts = sqrt((static_pts(:,1) - obs.state(1)).^2 + (static_pts(:,2) - obs.state(2)).^2);
                is_dyn_pt = is_dyn_pt | (d_pts < 0.65);
            end
        end
        static_pts(is_dyn_pt, :) = [];
    end

    %% ── 3. EKF Localization Prediction & Update ────────────────────
    v = MEM.last_v; w = MEM.last_w; th = MEM.est_pose(3);
    pred = MEM.est_pose + [v*cos(th)*dt; v*sin(th)*dt; w*dt];
    F = [1,0,-v*sin(th)*dt; 0,1,v*cos(th)*dt; 0,0,1];
    Q = diag([0.005,0.005,0.002]);
    P_pred = F*MEM.P*F' + Q;

    H = eye(3);
    R = diag([0.03,0.03,0.005]);
    S_innov = H*P_pred*H' + R;

    % Matrix Singularity Protection
    if rcond(S_innov) < 1e-10
        S_innov = S_innov + eye(3) * 1e-6;
    end

    K = P_pred * H' / S_innov;

    innov = SENS.meas_pose - pred;
    innov(3) = atan2(sin(innov(3)), cos(innov(3)));
    MEM.est_pose = pred + K*innov;
    MEM.est_pose(3) = atan2(sin(MEM.est_pose(3)), cos(MEM.est_pose(3)));

    % Covariance update
    MEM.P = (eye(3) - K*H) * P_pred;
    MEM.P = (MEM.P + MEM.P') / 2;  
    for diag_i = 1:3
        if MEM.P(diag_i,diag_i) < 1e-8
            MEM.P(diag_i,diag_i) = 1e-8;  
        end
    end

    %% ── 4. Loop Closure via ICP SVD (Using Static Points) ──────────
    MEM.lc_cooldown = max(0, MEM.lc_cooldown - dt);
    if ~isempty(static_pts) && size(static_pts,1) >= 10
        dist_to_dock = norm(MEM.est_pose(1:2) - SENS.dock_pos);
        near_dock = dist_to_dock < 2.5; 

        if isempty(MEM.scan_ref) && near_dock
            MEM.scan_ref      = static_pts;
            MEM.scan_ref_pose = MEM.est_pose;
        elseif ~isempty(MEM.scan_ref) && near_dock && MEM.lc_cooldown <= 0
            [delta_pose, icp_score] = icp_svd(static_pts, MEM.scan_ref);
            if icp_score < 0.15 && norm(delta_pose(1:2)) < 0.5
                alpha = 0.4;
                MEM.est_pose = MEM.est_pose + alpha*delta_pose;
                MEM.est_pose(3) = atan2(sin(MEM.est_pose(3)), cos(MEM.est_pose(3)));
                MEM.P = MEM.P * (1 - alpha*0.5);
                MEM.P = (MEM.P + MEM.P') / 2;
                MEM.loop_closure_done = true;
                MEM.lc_cooldown = 20.0;
            end
        end
    end

    %% ── 5. Vectorized Static Occupancy Grid Mapping ───────────────
    if ~isempty(static_pts) && size(static_pts,1) >= 3
        nx = MEM.nx; ny = MEM.ny;
        pts_x = static_pts(:,1);
        pts_y = static_pts(:,2);
        gx = MEM.grid_x;
        gy = MEM.grid_y;

        [~, cols_idx] = min(abs(pts_x - gx), [], 2);  
        [~, rows_idx] = min(abs(pts_y - gy), [], 2);  

        valid = rows_idx >= 1 & rows_idx <= ny & cols_idx >= 1 & cols_idx <= nx;

        if any(valid)
            lin_idx = sub2ind([ny, nx], rows_idx(valid), cols_idx(valid));
            MEM.occ_grid(lin_idx) = 1;
            if ~MEM.zoning_done
                MEM.zone_grid(lin_idx) = 1;
            end
        end
    end

    %% ── 6. Mark Visited Cells as Covered ──────────────────────────
    cr = nearest_idx(MEM.grid_y, MEM.est_pose(2));
    cc = nearest_idx(MEM.grid_x, MEM.est_pose(1));
    for dr = -2:2
        for dc = -2:2
            r = cr + dr; c = cc + dc;
            if in_bounds(r,c,MEM.occ_grid) && MEM.occ_grid(r,c)==0
                dist = sqrt((MEM.grid_x(c)-MEM.est_pose(1))^2 + ...
                            (MEM.grid_y(r)-MEM.est_pose(2))^2);
                if dist < 0.6
                    MEM.cov_grid(r,c) = 1;
                end
            end
        end
    end

    %% ── 7. Room Partitioning (Zoning) ──────────────────────────────
    if ~MEM.zoning_done && any(MEM.occ_grid(:)==1)
        if sum(MEM.occ_grid(:)) / numel(MEM.occ_grid) > 0.05
            MEM.zone_grid = partition_rooms(MEM.occ_grid);
            MEM.zoning_done = true;
            
            % Initial exit detection and topo graph building once zoning is completed
            MEM.detected_exits = detect_room_exits(MEM);
            MEM.topo_graph = build_topo_graph(MEM);
        end
    end
    
    % Periodically update exits and topological graph during mapping
    if MEM.zoning_done && mod(round(10*SENS.meas_pose(1)), 15) == 0 && mod(round(10*SENS.meas_pose(2)), 15) == 0
        MEM.detected_exits = detect_room_exits(MEM);
        MEM.topo_graph = build_topo_graph(MEM);
    end

    % ── 8. Battery Depletion & Tracker ──
    displacement = norm(MEM.est_pose(1:2) - MEM.last_pose);
    MEM.battery = max(0.0, MEM.battery - MEM.energy_per_meter * displacement);
    MEM.last_pose = MEM.est_pose(1:2);
    
    % ── 9. Current Room Tracking ──
    curr_r = nearest_idx(MEM.grid_y, MEM.est_pose(2));
    curr_c = nearest_idx(MEM.grid_x, MEM.est_pose(1));
    if in_bounds(curr_r, curr_c, MEM.zone_grid)
        z_val = MEM.zone_grid(curr_r, curr_c);
        if z_val > 1
            MEM.current_room = z_val;
        end
    end
end

%% ===================================================================
%% DYNAMIC OBSTACLE KALMAN FILTER TRACKER (DATMO)
%% ===================================================================
function MEM = track_dynamic_obstacles(SENS, MEM, dt)
    pts = SENS.lidar_pts;
    if isempty(pts)
        % Predict existing tracks forward
        for o = 1:length(MEM.tracked_obs)
            MEM.tracked_obs(o).state = predict_state(MEM.tracked_obs(o).state, dt);
            MEM.tracked_obs(o).lost_counter = MEM.tracked_obs(o).lost_counter + 1;
        end
        % Filter out lost tracks
        MEM.tracked_obs([MEM.tracked_obs.lost_counter] > 10) = [];
        return;
    end

    % 1. Cluster Lidar Points
    clusters = cluster_lidar_pts(pts, 0.65);
    centroids = [];
    for c = 1:length(clusters)
        centroids = [centroids; mean(clusters{c}, 1)];
    end

    % 2. Kalman Filter Track Propagation
    F = [1 0 dt 0; 0 1 0 dt; 0 0 1 0; 0 0 0 1];
    Q = diag([0.005, 0.005, 0.05, 0.05]) * dt;
    H = [1 0 0 0; 0 1 0 0];
    R = diag([0.02, 0.02]);

    n_tracks = length(MEM.tracked_obs);
    n_centroids = size(centroids, 1);

    % Predict current tracks
    for o = 1:n_tracks
        MEM.tracked_obs(o).state = F * MEM.tracked_obs(o).state;
        MEM.tracked_obs(o).P = F * MEM.tracked_obs(o).P * F' + Q;
    end

    associated = false(n_centroids, 1);
    track_matched = false(n_tracks, 1);

    % 3. Greedy Nearest-Neighbor Data Association
    for o = 1:n_tracks
        if n_centroids == 0, break; end
        pred_pos = MEM.tracked_obs(o).state(1:2);
        dists = sqrt((centroids(:,1) - pred_pos(1)).^2 + (centroids(:,2) - pred_pos(2)).^2);
        [min_d, min_idx] = min(dists);
        if min_d < 1.0 && ~associated(min_idx)
            % Kalman Update
            z = centroids(min_idx, :)';
            y = z - H * MEM.tracked_obs(o).state;
            S_cov = H * MEM.tracked_obs(o).P * H' + R;
            K = MEM.tracked_obs(o).P * H' / S_cov;
            MEM.tracked_obs(o).state = MEM.tracked_obs(o).state + K * y;
            MEM.tracked_obs(o).P = (eye(4) - K*H) * MEM.tracked_obs(o).P;
            MEM.tracked_obs(o).lost_counter = 0;
            
            % Speed check to trigger dynamic tracking flag
            speed = norm(MEM.tracked_obs(o).state(3:4));
            if speed > 0.12
                MEM.tracked_obs(o).dynamic_frames = MEM.tracked_obs(o).dynamic_frames + 1;
            else
                MEM.tracked_obs(o).dynamic_frames = max(0, MEM.tracked_obs(o).dynamic_frames - 1);
            end
            if MEM.tracked_obs(o).dynamic_frames > 8
                MEM.tracked_obs(o).is_dynamic = true;
            end
            
            associated(min_idx) = true;
            track_matched(o) = true;
        end
    end

    % Mark missed tracks
    for o = 1:n_tracks
        if ~track_matched(o)
            MEM.tracked_obs(o).lost_counter = MEM.tracked_obs(o).lost_counter + 1;
        end
    end

    % 4. Track Management: Spawn new tracks
    for c = 1:n_centroids
        if ~associated(c)
            cp = centroids(c, :);
            dist_to_rob = norm(cp - MEM.est_pose(1:2)');
            dist_to_dock = norm(cp - MEM.dock_pos');
            % Avoid spawning tracks on robot or charging dock
            if dist_to_rob > 0.85 && dist_to_dock > 0.85
                new_obs = struct();
                new_obs.id = length(MEM.tracked_obs) + 1;
                new_obs.state = [cp(1); cp(2); 0; 0];
                new_obs.P = diag([0.5, 0.5, 1.0, 1.0]);
                new_obs.lost_counter = 0;
                new_obs.dynamic_frames = 0;
                new_obs.is_dynamic = false;
                MEM.tracked_obs = [MEM.tracked_obs; new_obs];
            end
        end
    end

    % Remove tracks lost for too long
    if ~isempty(MEM.tracked_obs)
        MEM.tracked_obs([MEM.tracked_obs.lost_counter] > 10) = [];
    end
end

function st = predict_state(state, dt)
    st = state;
    st(1) = st(1) + st(3)*dt;
    st(2) = st(2) + st(4)*dt;
end

function clusters = cluster_lidar_pts(pts, max_dist)
    N = size(pts, 1);
    visited = false(N, 1);
    clusters = {};
    for i = 1:N
        if visited(i), continue; end
        idx = [i];
        visited(i) = true;
        k = 1;
        while k <= length(idx)
            curr = idx(k);
            dists = sqrt((pts(:,1) - pts(curr,1)).^2 + (pts(:,2) - pts(curr,2)).^2);
            neighbors = find(dists < max_dist & ~visited);
            visited(neighbors) = true;
            idx = [idx; neighbors];
            k = k + 1;
        end
        if length(idx) >= 3 % Filter out tiny clusters/sensor noise
            clusters{end+1} = pts(idx, :);
        end
    end
end

%% ── True ICP using SVD ────────────────────────────────────────────
function [delta_pose, score] = icp_svd(pts_curr, pts_ref)
    delta_pose = zeros(3,1); score = inf;
    if size(pts_curr,1)<8 || size(pts_ref,1)<8, return; end
    try
        n = min(60, min(size(pts_curr,1), size(pts_ref,1)));
        c = pts_curr(round(linspace(1,size(pts_curr,1),n)),:);
        r = pts_ref( round(linspace(1,size(pts_ref,1), n)),:);

        mc = mean(c,1); mr = mean(r,1);
        C = c - mc; Rm = r - mr;

        H = C' * Rm;
        [U,~,V] = svd(H);
        d = det(V*U') < 0;
        S = eye(2); if d, S(2,2) = -1; end
        Rot = V * S * U';

        trans = mr' - Rot * mc';

        aligned = (Rot * c')' + trans';
        total_err = 0;
        for i = 1:size(aligned,1)
            [mn,~] = min(sum((r - aligned(i,:)).^2,2));
            total_err = total_err + mn;
        end
        score = sqrt(total_err/size(aligned,1));

        theta = atan2(Rot(2,1), Rot(1,1));
        delta_pose = [trans(1); trans(2); theta];
    catch
        score = inf; delta_pose = zeros(3,1);
    end
end

function zoned = partition_rooms(occ_grid)
    % Robust BFS-based custom partitioner (pure-math fallback, no Image Processing Toolbox needed)
    [rows, cols] = size(occ_grid);
    zoned = zeros(rows, cols);
    visited = occ_grid == 1; % occupied cells/walls are marked visited
    zone_id = 2;
    
    for r = 1:rows
        for c = 1:cols
            if ~visited(r,c)
                % Start BFS/Flood Fill
                queue = zeros(rows*cols, 2);
                queue(1, :) = [r, c];
                visited(r, c) = true;
                head = 1;
                tail = 1;
                
                while head <= tail
                    curr = queue(head, :);
                    head = head + 1;
                    cr = curr(1); cc = curr(2);
                    zoned(cr, cc) = zone_id;
                    
                    % Check 4-neighbors
                    neighbors = [cr-1, cc; cr+1, cc; cr, cc-1; cr, cc+1];
                    for n_idx = 1:4
                        nr = neighbors(n_idx, 1);
                        nc = neighbors(n_idx, 2);
                        if nr >= 1 && nr <= rows && nc >= 1 && nc <= cols
                            if ~visited(nr, nc)
                                visited(nr, nc) = true;
                                tail = tail + 1;
                                queue(tail, :) = [nr, nc];
                            end
                        end
                    end
                end
                zone_id = zone_id + 1;
            end
        end
    end
    zoned(occ_grid == 1) = 1;
end

function zoned = fallback_partition(free_space, occ_grid)
    zoned = zeros(size(occ_grid));
    [r, c] = find(free_space);
    if isempty(r), zoned = occ_grid; return; end
    mid_r = round((min(r) + max(r))/2);
    mid_c = round((min(c) + max(c))/2);
    for i = 1:size(occ_grid,1)
        for j = 1:size(occ_grid,2)
            if free_space(i,j)
                if i < mid_r && j < mid_c,      zoned(i,j) = 2;
                elseif i >= mid_r && j < mid_c, zoned(i,j) = 3;
                elseif i < mid_r && j >= mid_c, zoned(i,j) = 4;
                else                             zoned(i,j) = 5;
                end
            end
        end
    end
end


%% LAYER 3 — PLANNING
%% ===================================================================
function MEM = planning_layer(MEM, SENS, t, dt)
    pose_delta = norm(MEM.est_pose(1:2) - MEM.last_pose);
    if pose_delta > 0.05
        MEM.stuck_counter = 0;
        % Note: MEM.last_pose is updated at the end of perception_layer for battery tracking
        MEM.oscillation_counter = max(0, MEM.oscillation_counter - 1);
    else
        MEM.stuck_counter = MEM.stuck_counter + 1;
    end
    stuck_secs = MEM.stuck_counter * dt;

    % Continuous Energy Budget Check (FR-BAT-01, FR-BAT-03)
    [E_required, path_rooms, exits_seq] = compute_return_energy(MEM);
    if strcmp(MEM.bt_state, 'COVERAGE') && (MEM.battery - E_required < MEM.safety_margin)
        MEM.bt_state = 'RETURN_DOCK';
        MEM.dock_phase = 'PATH_FOLLOW';
        MEM.astar_path = []; MEM.path_idx = 1;
        MEM.stuck_counter = 0; MEM.recovery_state = 'NONE';
        
        % Plan door-hopping returns sequentially (FR-RETURN-02, FR-BAT-02)
        MEM.exits_sequence = exits_seq;
        MEM.exits_seq_idx = 1;
        if ~isempty(exits_seq)
            first_target = exits_seq(1, :);
        else
            first_target = MEM.dock_pos';
        end
        MEM.astar_path = astar_planner_fallback(MEM.est_pose(1:2), first_target', ...
            MEM.grid_x, MEM.grid_y, MEM.occ_grid, MEM.robot_r, MEM.grid_res);
        MEM.path_idx = 1;
        
        fprintf('[BT] Preemptive battery return triggered! E_req=%.3f, Batt=%.3f\n', E_required, MEM.battery);
    end

    switch MEM.bt_state
        case 'COVERAGE'
            MEM = coverage_planning(MEM, SENS, t, dt, stuck_secs);
        case 'RETURN_DOCK'
            MEM = bt_return_dock(MEM, SENS, dt, stuck_secs);
        case 'DOCKED'
            % terminal
    end
end

function MEM = coverage_planning(MEM, SENS, t, dt, stuck_secs)
    % Fall back to frontier seek if room partitioning is not complete yet
    if ~MEM.zoning_done
        MEM = frontier_seek_coverage(MEM, SENS, t, dt, stuck_secs);
        return;
    end

    curr_room = MEM.current_room;

    % If we need new waypoints or completed current sweep waypoints
    if isempty(MEM.sweep_waypoints)
        if curr_room > 1 && ~ismember(curr_room, MEM.swept_rooms)
            % Generate boustrophedon sweep lines for current room (FR-ROOM-01, FR-SWEEP-01, FR-ROOM-02)
            wps = generate_boustrophedon_waypoints(curr_room, MEM);
            if isempty(wps)
                MEM.swept_rooms = [MEM.swept_rooms; curr_room];
                MEM = plan_next_room_transition(MEM);
            else
                MEM.sweep_waypoints = wps;
                MEM.sweep_idx = 1;
                MEM.cov_state = 'BOUSTROPHEDON_SWEEP';
                MEM.astar_path = astar_planner_fallback(MEM.est_pose(1:2), wps(1, :)', ...
                    MEM.grid_x, MEM.grid_y, MEM.occ_grid, MEM.robot_r, MEM.grid_res);
                MEM.path_idx = 1;
            end
        else
            % Already swept or invalid current room, choose next room
            MEM = plan_next_room_transition(MEM);
        end
    end

    % Execution
    switch MEM.cov_state
        case 'BOUSTROPHEDON_SWEEP'
            wp_target = MEM.sweep_waypoints(MEM.sweep_idx, :)';
            dist_to_wp = norm(MEM.est_pose(1:2) - wp_target);

            if dist_to_wp < 0.4
                MEM.sweep_idx = MEM.sweep_idx + 1;
                if MEM.sweep_idx > size(MEM.sweep_waypoints, 1)
                    fprintf('[BT] Room %d sweep complete!\n', curr_room);
                    MEM.swept_rooms = [MEM.swept_rooms; curr_room];
                    MEM.sweep_waypoints = [];
                    MEM = plan_next_room_transition(MEM);
                else
                    next_wp = MEM.sweep_waypoints(MEM.sweep_idx, :)';
                    % LOS check to bypass standard A* planner when sweep lines are clear
                    if grid_los_clear(nearest_idx(MEM.grid_y, MEM.est_pose(2)), nearest_idx(MEM.grid_x, MEM.est_pose(1)), ...
                                      nearest_idx(MEM.grid_y, next_wp(2)), nearest_idx(MEM.grid_x, next_wp(1)), ...
                                      inflate_grid(MEM.occ_grid, MEM.robot_r + 0.05, MEM.grid_res))
                        MEM.astar_path = [MEM.est_pose(1:2)'; next_wp'];
                    else
                        MEM.astar_path = astar_planner_fallback(MEM.est_pose(1:2), next_wp, ...
                            MEM.grid_x, MEM.grid_y, MEM.occ_grid, MEM.robot_r, MEM.grid_res);
                    end
                    MEM.path_idx = 1;
                end
            elseif isempty(MEM.astar_path) || MEM.path_idx > size(MEM.astar_path, 1)
                MEM.astar_path = astar_planner_fallback(MEM.est_pose(1:2), wp_target, ...
                    MEM.grid_x, MEM.grid_y, MEM.occ_grid, MEM.robot_r, MEM.grid_res);
                MEM.path_idx = 1;
            end

        case 'ROOM_TRANSITION'
            % Check physical door crossing into the target room (FR-DOOR-02)
            if MEM.current_room == MEM.transit_room
                fprintf('[BT] Crossed door into target Room %d!\n', MEM.transit_room);
                % Record entry door/exit in MEM (FR-DOOR-01)
                MEM.room_entry_exit{MEM.transit_room} = MEM.transit_exit;
                MEM.cov_state = 'BOUSTROPHEDON_SWEEP';
                MEM.transit_room = 0;
                MEM.transit_exit = [];
                
                % Start sweeping target room
                wps = generate_boustrophedon_waypoints(MEM.current_room, MEM);
                if isempty(wps)
                    MEM.swept_rooms = [MEM.swept_rooms; MEM.current_room];
                    MEM = plan_next_room_transition(MEM);
                else
                    MEM.sweep_waypoints = wps;
                    MEM.sweep_idx = 1;
                    MEM.astar_path = astar_planner_fallback(MEM.est_pose(1:2), wps(1, :)', ...
                        MEM.grid_x, MEM.grid_y, MEM.occ_grid, MEM.robot_r, MEM.grid_res);
                    MEM.path_idx = 1;
                end
            else
                % Still driving towards target transition door
                if isempty(MEM.astar_path) || MEM.path_idx > size(MEM.astar_path, 1)
                    MEM.astar_path = astar_planner_fallback(MEM.est_pose(1:2), MEM.transit_exit', ...
                        MEM.grid_x, MEM.grid_y, MEM.occ_grid, MEM.robot_r, MEM.grid_res);
                    MEM.path_idx = 1;
                end
            end
    end

    %% Stuck Recovery
    if stuck_secs > 3.0
        switch MEM.recovery_state
            case 'NONE'
                MEM.recovery_state='REPLAN';
                MEM.recovery_attempts = MEM.recovery_attempts+1;
                MEM.stuck_counter=0;
                MEM.astar_path = [];
                fprintf('[Recovery] L1: Replan #%d\n', MEM.recovery_attempts);
            case 'REPLAN'
                MEM.recovery_state='ROTATE';
                MEM.recovery_timer=0; MEM.stuck_counter=0;
                MEM.rotation_dir = SENS.escape_dir;
                if MEM.rotation_dir==0, MEM.rotation_dir=1; end
                fprintf('[Recovery] L2: Rotate\n');
            case 'ROTATE'
                MEM.recovery_timer = MEM.recovery_timer + dt;
                if MEM.recovery_timer > 1.5
                    MEM.recovery_state='BUG_ALGORITHM';
                    MEM.wall_follow_timer=0; MEM.stuck_counter=0;
                    fprintf('[Recovery] L3: Bug Algorithm\n');
                end
            case 'BUG_ALGORITHM'
                MEM.wall_follow_timer = MEM.wall_follow_timer + dt;
                if MEM.wall_follow_timer > 6.0
                    MEM.recovery_state='NONE';
                    MEM.stuck_counter=0;
                    MEM.oscillation_counter = 0;
                    fprintf('[Recovery] Bug complete\n');
                end
        end
    end
end

function MEM = frontier_seek_coverage(MEM, SENS, t, dt, stuck_secs)
    % Original utility frontier seek logic used before zoning is complete
    MEM.frontier_replan_t = MEM.frontier_replan_t + dt;
    need_new_frontier = isempty(MEM.current_frontier) || ...
        norm(MEM.est_pose(1:2) - MEM.current_frontier) < 0.5 || ...
        MEM.frontier_replan_t > 15.0 || ...
        MEM.oscillation_counter > 3;

    if need_new_frontier
        if ~isempty(MEM.current_frontier)
            MEM.last_frontiers = [MEM.last_frontiers; MEM.current_frontier];
            if size(MEM.last_frontiers,1) > 5
                MEM.last_frontiers = MEM.last_frontiers(end-4:end,:);
            end
        end

        frontier = detect_frontiers_vectorized(MEM.occ_grid, MEM.cov_grid, MEM.zone_grid, ...
                                               MEM.grid_x, MEM.grid_y, MEM.est_pose);

        if isempty(frontier)
            MEM.no_frontier_count = MEM.no_frontier_count + 1;
            if MEM.no_frontier_count < 5
                frontier = find_uncovered_free(MEM.occ_grid, MEM.cov_grid, ...
                                               MEM.grid_x, MEM.grid_y, MEM.est_pose(1:2));
            end
            if isempty(frontier)
                MEM.bt_state = 'RETURN_DOCK';
                MEM.dock_phase = 'PATH_FOLLOW';
                MEM.astar_path = []; MEM.path_idx = 1;
                fprintf('[BT] Coverage complete -> RETURN_DOCK\n');
                return;
            end
        else
            MEM.no_frontier_count = 0;
        end

        MEM.current_frontier = frontier;
        MEM.frontier_replan_t = 0;

        MEM.astar_path = astar_planner_fallback(MEM.est_pose(1:2), frontier, ...
            MEM.grid_x, MEM.grid_y, MEM.occ_grid, MEM.robot_r, MEM.grid_res);
        MEM.path_idx = 1;
        MEM.cov_state = 'FRONTIER_SEEK';
    end
    
    if stuck_secs > 3.0
        switch MEM.recovery_state
            case 'NONE'
                MEM.recovery_state='REPLAN';
                MEM.recovery_attempts = MEM.recovery_attempts+1;
                MEM.stuck_counter=0;
                MEM.current_frontier = [];
            case 'REPLAN'
                MEM.recovery_state='ROTATE';
                MEM.recovery_timer=0; MEM.stuck_counter=0;
                MEM.rotation_dir = SENS.escape_dir;
                if MEM.rotation_dir==0, MEM.rotation_dir=1; end
            case 'ROTATE'
                MEM.recovery_timer = MEM.recovery_timer + dt;
                if MEM.recovery_timer > 1.5
                    MEM.recovery_state='BUG_ALGORITHM';
                    MEM.wall_follow_timer=0; MEM.stuck_counter=0;
                end
            case 'BUG_ALGORITHM'
                MEM.wall_follow_timer = MEM.wall_follow_timer + dt;
                if MEM.wall_follow_timer > 6.0
                    MEM.recovery_state='NONE';
                    MEM.stuck_counter=0;
                    MEM.current_frontier = [];
                    MEM.oscillation_counter = 0;
                end
        end
    end
end

%% ── UTILITY-DRIVEN VECTORIZED FRONTIER EXPLORATION ──────────────────
function frontier = detect_frontiers_vectorized(occ_grid, cov_grid, zone_grid, gx, gy, est_pose)
    [rows, cols] = size(occ_grid);

    % Find free and uncovered cells
    free_uncovered = (occ_grid == 0) & (cov_grid == 0);

    % Kernel convolution to find cells adjacent to covered (explored) cells
    kernel = [1 1 1; 1 0 1; 1 1 1];
    adj_to_covered = conv2(double(cov_grid), kernel, 'same') > 0;

    % Frontier cells = free, uncovered, and adjacent to visited space
    frontier_mask = free_uncovered & adj_to_covered;
    
    % Filter out cells too close to walls to ensure planning safety
    adj_to_wall = conv2(double(occ_grid), kernel, 'same') > 0;
    frontier_mask = frontier_mask & ~adj_to_wall;
    
    [fr, fc] = find(frontier_mask);

    if isempty(fr)
        frontier = [];
        return;
    end

    fx = gx(fc);
    fy = gy(fr);
    pose_x = est_pose(1);
    pose_y = est_pose(2);
    pose_th = est_pose(3);

    % Identify current room zone of the robot
    rob_r = nearest_idx(gy, pose_y);
    rob_c = nearest_idx(gx, pose_x);
    if in_bounds(rob_r, rob_c, zone_grid)
        current_zone = zone_grid(rob_r, rob_c);
    else
        current_zone = 0;
    end

    n_frontiers = length(fr);
    scores = zeros(n_frontiers, 1);

    % Compute straight distances and rotation angles in vectors
    dists = sqrt((fx - pose_x).^2 + (fy - pose_y).^2);
    angles_to = atan2(fy - pose_y, fx - pose_x);
    rot_costs = abs(atan2(sin(angles_to - pose_th), cos(angles_to - pose_th)));

    % Information Gain and Zone Consistency loops
    for i = 1:n_frontiers
        r = fr(i); c = fc(i);
        
        % Information Gain: count unknown/free cells in 5x5 window
        r_min = max(1, r-2); r_max = min(rows, r+2);
        c_min = max(1, c-2); c_max = min(cols, c+2);
        info_gain = sum(sum(occ_grid(r_min:r_max, c_min:c_max) == 0 & ...
                            cov_grid(r_min:r_max, c_min:c_max) == 0));
        
        % Zone consistency bonus (Encourages finishing one room first)
        f_zone = zone_grid(r, c);
        zone_bonus = 0;
        if f_zone == current_zone && current_zone > 1
            zone_bonus = 2.8; 
        end
        
        dist_penalty = dists(i);
        if dists(i) < 0.6
            dist_penalty = dist_penalty + 4.0; % avoid micro-replanning loops
        end
        
        % Utility score calculation
        utility = info_gain * 0.15 - dist_penalty * 0.7 - rot_costs(i) * 0.4 + zone_bonus;
        scores(i) = -utility; % Minimized score corresponds to maximized utility
    end

    [~, best] = min(scores);
    frontier = [fx(best), fy(best)];
end

function target = find_uncovered_free(occ_grid, cov_grid, gx, gy, pose)
    free_uncovered = (occ_grid == 0) & (cov_grid == 0);
    [fr, fc] = find(free_uncovered);

    if isempty(fr)
        target = [];
        return;
    end

    fx = gx(fc); fy = gy(fr);
    dists = sqrt((fx - pose(1)).^2 + (fy - pose(2)).^2);
    [~, best] = min(dists);
    target = [fx(best), fy(best)];
end

%% ── Return to dock behavior tree ──────────────────────────────────
function MEM = bt_return_dock(MEM, SENS, dt, stuck_secs)
    dist_dock = norm(MEM.est_pose(1:2) - MEM.dock_pos);
    if dist_dock < 0.12
        MEM.bt_state='DOCKED'; MEM.dock_phase='DOCKED';
        fprintf('[BT] DOCKED!\n'); return;
    end
    if dist_dock < 0.7
        MEM.dock_phase='FINAL_APPROACH'; MEM.recovery_state='NONE';
        MEM.astar_path = [MEM.est_pose(1:2)'; MEM.dock_pos'];
        MEM.path_idx = 1;
        return;
    end
    
    % Check if we need to plan the next door hop segment (FR-RETURN-02)
    if isempty(MEM.astar_path) || MEM.path_idx > size(MEM.astar_path, 1)
        if ~isempty(MEM.exits_sequence) && MEM.exits_seq_idx <= size(MEM.exits_sequence, 1)
            target_pt = MEM.exits_sequence(MEM.exits_seq_idx, :);
            dist_to_door = norm(MEM.est_pose(1:2) - target_pt');
            
            % If close to current target door, hop to next
            if dist_to_door < 0.5
                MEM.exits_seq_idx = MEM.exits_seq_idx + 1;
                if MEM.exits_seq_idx <= size(MEM.exits_sequence, 1)
                    target_pt = MEM.exits_sequence(MEM.exits_seq_idx, :);
                else
                    target_pt = MEM.dock_pos';
                end
            end
            
            fprintf('[BT] Return path: planning segment to door %d at [%.2f, %.2f]\n', ...
                MEM.exits_seq_idx, target_pt(1), target_pt(2));
            MEM.astar_path = astar_planner_fallback(MEM.est_pose(1:2), target_pt', ...
                MEM.grid_x, MEM.grid_y, MEM.occ_grid, MEM.robot_r, MEM.grid_res);
            MEM.path_idx = 1;
        else
            % Direct path to dock (final room segment)
            MEM.astar_path = astar_planner_fallback(MEM.est_pose(1:2), MEM.dock_pos, ...
                MEM.grid_x, MEM.grid_y, MEM.occ_grid, MEM.robot_r, MEM.grid_res);
            MEM.path_idx = 1;
        end
    end
    
    switch MEM.recovery_state
        case 'NONE'
            if stuck_secs > 3.0
                MEM.recovery_state='REPLAN'; MEM.recovery_attempts=MEM.recovery_attempts+1;
                MEM.stuck_counter=0;
                MEM.astar_path = []; % Trigger replan on next loop
            end
        case 'REPLAN'
            if stuck_secs > 3.0
                MEM.recovery_state='ROTATE'; MEM.recovery_timer=0; MEM.stuck_counter=0;
                MEM.rotation_dir = SENS.escape_dir;
                if MEM.rotation_dir==0, MEM.rotation_dir=1; end
            end
        case 'ROTATE'
            MEM.recovery_timer = MEM.recovery_timer + dt;
            if MEM.recovery_timer > 1.5
                MEM.recovery_state='BUG_ALGORITHM'; MEM.wall_follow_timer=0; MEM.stuck_counter=0;
            end
        case 'BUG_ALGORITHM'
            MEM.wall_follow_timer = MEM.wall_follow_timer + dt;
            if MEM.wall_follow_timer > 6.0
                MEM.recovery_state='NONE'; MEM.stuck_counter=0;
                MEM.wall_follow_timer=0;
                MEM.astar_path = [];
            end
    end
end

%% ===================================================================
%% LAYER 4 — CONTROL
%% ===================================================================
function [cmd_v, cmd_omega, MEM] = control_layer(MEM, SENS, dt)
    switch MEM.bt_state
        case 'COVERAGE',    [cmd_v,cmd_omega,MEM] = coverage_controller(MEM,SENS,dt);
        case 'RETURN_DOCK', [cmd_v,cmd_omega,MEM] = dock_controller(MEM,SENS,dt);
        case 'DOCKED',       cmd_v=0; cmd_omega=0;
        otherwise,           cmd_v=0; cmd_omega=0;
    end
    cmd_v     = clamp(cmd_v,    -0.18, 0.38);
    cmd_omega = clamp(cmd_omega,-3.8,  3.8);
    MEM.last_v = cmd_v; MEM.last_w = cmd_omega;
end

function [cmd_v, cmd_omega, MEM] = coverage_controller(MEM, SENS, dt)
    cmd_v=0; cmd_omega=0;

    switch MEM.recovery_state
        case 'ROTATE'
            cmd_v=0; cmd_omega=3.2*MEM.rotation_dir; return;
        case 'BUG_ALGORITHM'
            [cmd_v, cmd_omega] = bug_algorithm(SENS);
            return;
    end

    if isempty(MEM.astar_path) || size(MEM.astar_path,1)<2
        cmd_v=0; cmd_omega=0.3; return;
    end

    while MEM.path_idx < size(MEM.astar_path,1) && ...
          norm(MEM.est_pose(1:2) - MEM.astar_path(MEM.path_idx,:)') < 0.4
        MEM.path_idx = MEM.path_idx + 1;
    end

    target = MEM.astar_path(end,:)';
    for i = MEM.path_idx:size(MEM.astar_path,1)
        if norm(MEM.est_pose(1:2)-MEM.astar_path(i,:)') >= MEM.lookahead
            target = MEM.astar_path(i,:)'; break;
        end
    end

    heading_err = angdiff_vec(MEM.est_pose, target);

    if SENS.min_360 < 0.35
        cmd_v=-0.08; cmd_omega=1.8*SENS.escape_dir; return;
    end
    if abs(heading_err) > deg2rad(60)
        cmd_v=0; cmd_omega=3.5*heading_err; return;
    end

    safe_r = MEM.robot_r + 0.2;

    % Space-Time DWA Planner (using prediction tracks of obstacles)
    [dwa_v,dwa_w,dwa_ok] = dwa_planner(MEM.est_pose, target, ...
        MEM.tracked_obs, 0.4, MEM.grid_x, MEM.grid_y, ...
        MEM.occ_grid, safe_r, MEM.grid_res);

    if dwa_ok
        cmd_v=dwa_v; cmd_omega=dwa_w;
    else
        if SENS.min_front > 0.5
            cmd_v=-0.10; cmd_omega=1.8*SENS.escape_dir;
        else
            cmd_v=0; cmd_omega=3.0*heading_err;
        end
    end
end

function [cmd_v, cmd_omega] = bug_algorithm(SENS)
    angles = SENS.all_angles;
    ranges = SENS.all_ranges;
    target_dist = 0.5;

    right_mask = abs(angles + pi/2) < deg2rad(40);
    if any(right_mask)
        right_dist = min(ranges(right_mask));
    else
        right_dist = 2.0;
    end

    front_dist = SENS.min_front;

    cmd_v = 0.22;
    if front_dist < 0.4
        cmd_v = 0.05;
        cmd_omega = 3.0;
    elseif right_dist < target_dist - 0.2
        cmd_omega = 1.5;
    elseif right_dist > target_dist + 0.2
        cmd_omega = -1.5;
    else
        cmd_omega = 0;
    end
end

function [cmd_v, cmd_omega, MEM] = dock_controller(MEM, SENS, dt)
    cmd_v=0; cmd_omega=0;
    switch MEM.dock_phase
        case 'DOCKED', return;
        case 'FINAL_APPROACH'
            heading_err = angdiff_vec(MEM.est_pose, SENS.dock_pos);
            if SENS.min_360 < 0.35
                cmd_v=-0.08; cmd_omega=1.2*SENS.escape_dir; return;
            end
            if abs(heading_err) > deg2rad(15)
                cmd_v=0.02; cmd_omega=3.0*heading_err;
            else
                cmd_v=0.14; cmd_omega=1.2*heading_err;
            end
        case 'PATH_FOLLOW'
            [cmd_v,cmd_omega,MEM] = path_follow_controller(MEM,SENS,dt);
    end
end

function [cmd_v, cmd_omega, MEM] = path_follow_controller(MEM, SENS, dt)
    cmd_v=0; cmd_omega=0;
    switch MEM.recovery_state
        case 'ROTATE', cmd_v=0; cmd_omega=3.2*MEM.rotation_dir; return;
        case 'BUG_ALGORITHM'
            [cmd_v, cmd_omega] = bug_algorithm(SENS); return;
    end
    if isempty(MEM.astar_path) || size(MEM.astar_path,1)<2
        cmd_v=0; cmd_omega=0.3; return;
    end
    if MEM.path_idx < size(MEM.astar_path,1)-1
        p1 = MEM.astar_path(max(1,MEM.path_idx-1),:);
        p2 = MEM.astar_path(MEM.path_idx,:);
        p3 = MEM.astar_path(min(end,MEM.path_idx+1),:);
        v1=p2-p1; v2=p3-p2;
        curvature = min(abs(atan2(v2(2),v2(1))-atan2(v1(2),v1(1))), pi);
        MEM.lookahead = max(0.5, 1.2 - 0.5*(curvature/pi));
    end
    while MEM.path_idx < size(MEM.astar_path,1) && ...
          norm(MEM.est_pose(1:2) - MEM.astar_path(MEM.path_idx,:)') < 0.4
        MEM.path_idx = MEM.path_idx + 1;
    end
    target = MEM.astar_path(end,:)';
    for i = MEM.path_idx:size(MEM.astar_path,1)
        if norm(MEM.est_pose(1:2)-MEM.astar_path(i,:)') >= MEM.lookahead
            target = MEM.astar_path(i,:)'; break;
        end
    end
    heading_err = angdiff_vec(MEM.est_pose, target);
    if SENS.min_360 < 0.35
        cmd_v=-0.08; cmd_omega=1.8*SENS.escape_dir; return;
    end
    if abs(heading_err) > deg2rad(60)
        cmd_v=0; cmd_omega=3.5*heading_err; return;
    end

    safe_r = MEM.robot_r + 0.2;

    % Space-Time DWA Planner (using prediction tracks of obstacles)
    [dwa_v,dwa_w,dwa_ok] = dwa_planner(MEM.est_pose, target, ...
        MEM.tracked_obs, 0.4, MEM.grid_x, MEM.grid_y, ...
        MEM.occ_grid, safe_r, MEM.grid_res);
    if dwa_ok
        cmd_v=dwa_v; cmd_omega=dwa_w;
    else
        if SENS.min_front > 0.5
            cmd_v=-0.10; cmd_omega=1.8*SENS.escape_dir;
        else
            cmd_v=0; cmd_omega=3.0*heading_err;
        end
    end
end

%% ===================================================================
%% SPACE-TIME DWA PLANNER
%% ===================================================================
function [best_v,best_w,success] = dwa_planner(pose,target,tracked_obs,dyn_r,gx,gy,grid,safe_r,grid_res)
    best_v=0; best_w=0; success=false;
    v_s = 0.08:0.04:0.32;
    w_s = -2.5:0.25:2.5;
    [VG, WG] = meshgrid(v_s, w_s);
    VG = VG(:); WG = WG(:);
    N = length(VG);

    rows = length(gy); cols = length(gx);

    SX = repmat(pose(1), N, 1);
    SY = repmat(pose(2), N, 1);
    STH = repmat(pose(3), N, 1);
    SAFE = true(N, 1);
    MIN_CL = inf(N, 1);

    % Rollout 6 prediction steps
    for step = 1:6
        t_lookahead = step * 0.08;
        SX = SX + VG .* cos(STH) * 0.08;
        SY = SY + VG .* sin(STH) * 0.08;
        STH = STH + WG * 0.08;

        % Space-Time Collision Checking: Compare robot's rollout coordinate
        % with time-matched dynamic obstacle trajectory predictions
        if ~isempty(tracked_obs)
            for o = 1:length(tracked_obs)
                obs = tracked_obs(o);
                pred_obs_x = obs.state(1) + obs.state(3) * t_lookahead;
                pred_obs_y = obs.state(2) + obs.state(4) * t_lookahead;
                
                D_DYN = sqrt((SX - pred_obs_x).^2 + (SY - pred_obs_y).^2);
                SAFE = SAFE & (D_DYN > dyn_r + safe_r + 0.15);
                MIN_CL = min(MIN_CL, D_DYN - dyn_r);
            end
        end

        % Vectorized static grid collision
        diff_x = abs(SX - gx);
        diff_y = abs(SY - gy);
        [~, C_idx] = min(diff_x, [], 2);
        [~, R_idx] = min(diff_y, [], 2);

        for k = 1:N
            if ~SAFE(k), continue; end
            r = R_idx(k); c = C_idx(k);

            if r<1 || r>rows || c<1 || c>cols
                SAFE(k) = false;
                continue;
            end

            r_lo = max(1, r-1); r_hi = min(rows, r+1);
            c_lo = max(1, c-1); c_hi = min(cols, c+1);

            sub = grid(r_lo:r_hi, c_lo:c_hi);
            if any(sub(:) == 1)
                SAFE(k) = false;
            else
                for dr = r_lo:r_hi
                    for dc = c_lo:c_hi
                        if grid(dr,dc)==1
                            d = sqrt((SX(k)-gx(dc))^2 + (SY(k)-gy(dr))^2);
                            MIN_CL(k) = min(MIN_CL(k), d);
                        end
                    end
                end
            end
        end
    end

    TARGET_TH = atan2(target(2) - SY, target(1) - SX);
    H_SCORE = cos(atan2(sin(TARGET_TH - STH), cos(TARGET_TH - STH)));

    SCORE = 2.8 .* H_SCORE + 1.5 .* min(MIN_CL, 3.0) + 0.5 .* VG;
    SCORE(~SAFE) = -inf;

    [max_score, max_idx] = max(SCORE);
    if max_score > -inf
        best_v = VG(max_idx); best_w = WG(max_idx);
        success = true;
    end
end

%% ===================================================================
%% THETA* PATH PLANNER (ANY-ANGLE A*)
%% ===================================================================
function path = astar_planner(start,goal,gx,gy,grid,robot_r,grid_res)
    [rows,cols] = size(grid);
    inflated = inflate_grid(grid, robot_r+0.05, grid_res);
    si = pose_to_grid_idx(start,gx,gy,rows,cols);
    gi = pose_to_grid_idx(goal, gx,gy,rows,cols);
    if inflated(gi(1),gi(2))==1, gi=nearest_free(gi,inflated,rows,cols); end
    if inflated(si(1),si(2))==1, si=nearest_free(si,inflated,rows,cols); end

    g_cost=inf(rows,cols); g_cost(si(1),si(2))=0;
    par_r=zeros(rows,cols,'int16'); par_c=zeros(rows,cols,'int16');
    
    % Initialize start node's parent as itself
    par_r(si(1),si(2)) = int16(si(1));
    par_c(si(1),si(2)) = int16(si(2));
    
    h_start=sqrt(double(si(1)-gi(1))^2+double(si(2)-gi(2))^2);
    heap=[h_start, double(si(1)), double(si(2))];
    closed=false(rows,cols);
    moves=[-1,0;1,0;0,-1;0,1;-1,-1;-1,1;1,-1;1,1];
    found=false; iter=0;

    while ~isempty(heap) && iter<12000
        iter=iter+1;
        [~,idx]=min(heap(:,1)); cur=heap(idx,:); heap(idx,:)=[];
        cr=cur(2); cc=cur(3);
        if closed(cr,cc), continue; end
        closed(cr,cc)=true;
        if cr==gi(1) && cc==gi(2), found=true; break; end
        
        pr = double(par_r(cr,cc));
        pc = double(par_c(cr,cc));
        
        for m=1:8
            nr=cr+moves(m,1); nc=cc+moves(m,2);
            if nr<1||nr>rows||nc<1||nc>cols, continue; end
            if closed(nr,nc)||inflated(nr,nc)==1, continue; end
            if m>4 && (inflated(cr,nc)==1||inflated(nr,cc)==1), continue; end
            
            % Theta* Line-of-sight Check
            if grid_los_clear(pr, pc, nr, nc, inflated)
                % Any-Angle path: bypass current node and link directly from parent
                tg = g_cost(pr, pc) + sqrt(double(nr-pr)^2 + double(nc-pc)^2);
                if tg < g_cost(nr, nc)
                    g_cost(nr, nc) = tg;
                    par_r(nr, nc) = int16(pr);
                    par_c(nr, nc) = int16(pc);
                    f = tg + sqrt(double(nr-gi(1))^2 + double(nc-gi(2))^2);
                    heap = [heap; f, double(nr), double(nc)];
                end
            else
                % Standard A* expansion
                tg = g_cost(cr, cc) + sqrt(double(nr-cr)^2 + double(nc-cc)^2);
                if tg < g_cost(nr, nc)
                    g_cost(nr, nc) = tg;
                    par_r(nr, nc) = int16(cr);
                    par_c(nr, nc) = int16(cc);
                    f = tg + sqrt(double(nr-gi(1))^2 + double(nc-gi(2))^2);
                    heap = [heap; f, double(nr), double(nc)];
                end
            end
        end
    end

    if found
        raw=[]; r=gi(1); c=gi(2); cnt=0;
        while ~(r==si(1)&&c==si(2)) && cnt<rows*cols
            cnt=cnt+1; raw=[raw; gx(c),gy(r)];
            pr=par_r(r,c); pc=par_c(r,c);
            if pr==0&&pc==0, break; end
            r=double(pr); c=double(pc);
        end
        raw=[raw; gx(si(2)),gy(si(1))];
        path=flipud(raw);
        path=shortcut_path(path,inflated,gx,gy,grid_res);
    else
        n=max(4,ceil(norm(start-goal)/1.2));
        path=[linspace(start(1),goal(1),n)', linspace(start(2),goal(2),n)'];
    end
end

function ok = grid_los_clear(r1, c1, r2, c2, inflated)
    dist = sqrt((r2-r1)^2 + (c2-c1)^2);
    n = ceil(dist * 1.5);
    ok = true;
    [rows, cols] = size(inflated);
    for s = linspace(0, 1, max(n, 2))
        r = round(r1 + s * (r2 - r1));
        c = round(c1 + s * (c2 - c1));
        if r >= 1 && r <= rows && c >= 1 && c <= cols
            if inflated(r, c) == 1
                ok = false;
                return;
            end
        else
            ok = false;
            return;
        end
    end
end

function short=shortcut_path(path,inflated,gx,gy,grid_res)
    if size(path,1)<=3, short=path; return; end
    short=path(1,:); i=1;
    while i<size(path,1)
        j=size(path,1);
        while j>i+1
            if los_clear(path(i,:),path(j,:),inflated,gx,gy,grid_res), break; end
            j=j-1;
        end
        short=[short; path(j,:)]; i=j;
    end
end

function ok=los_clear(p1,p2,inflated,gx,gy,grid_res)
    n=ceil(norm(p2-p1)/(grid_res*0.5)); ok=true;
    [rows,cols]=size(inflated);
    for s=linspace(0,1,max(n,2))
        pt=p1+s*(p2-p1);
        c=nearest_idx(gx,pt(1)); r=nearest_idx(gy,pt(2));
        if r>=1&&r<=rows&&c>=1&&c<=cols&&inflated(r,c)==1, ok=false; return; end
    end
end

function inflated=inflate_grid(grid,radius,grid_res)
    n=ceil(radius/grid_res);
    [ii,jj]=meshgrid(-n:n,-n:n);
    kernel=double(sqrt((ii*grid_res).^2+(jj*grid_res).^2)<=radius+0.02);
    inflated=double(conv2(double(grid),kernel,'same')>0);
end

%% ===================================================================
%% INTERACTIVE 3D/2D VISUALISATION
%% ===================================================================
function VIZ = init_fast_visualization(ENV, MEM, ROB)
    VIZ.fig = figure('Name','Industrial SLAM v7.0 — Advanced Robot Dashboard', ...
        'NumberTitle','off','Color',[0.04 0.04 0.06], ...
        'Position',[100 100 1450 820]);

    % Define subplots with specialized dashboard positions
    VIZ.ax3d = subplot('Position',[0.22 0.05 0.42 0.90],'Parent',VIZ.fig);
    hold(VIZ.ax3d,'on'); grid(VIZ.ax3d,'on');
    set(VIZ.ax3d,'Color',[0.06 0.06 0.08], ...
        'GridColor',[0.18 0.18 0.22],'GridAlpha',0.25, ...
        'XColor',[0.5 0.5 0.6],'YColor',[0.5 0.5 0.6],'ZColor',[0.5 0.5 0.6], ...
        'BoxStyle','full','Projection','perspective');
    xlim(VIZ.ax3d,[-7 7]); ylim(VIZ.ax3d,[-7 7]); zlim(VIZ.ax3d,[0 2]);
    view(VIZ.ax3d, -45, 35);
    lighting(VIZ.ax3d,'gouraud');
    light(VIZ.ax3d,'Position',[5 5 8],'Style','infinite','Color',[1 1 0.95]);

    VIZ.ax2d = subplot('Position',[0.67 0.05 0.30 0.90],'Parent',VIZ.fig);
    hold(VIZ.ax2d,'on'); grid(VIZ.ax2d,'on'); axis(VIZ.ax2d,'equal');
    set(VIZ.ax2d,'Color',[0.08 0.08 0.10], ...
        'GridColor',[0.18 0.18 0.22],'GridAlpha',0.2, ...
        'XColor',[0.5 0.5 0.6],'YColor',[0.5 0.5 0.6]);
    xlim(VIZ.ax2d,[-7 7]); ylim(VIZ.ax2d,[-7 7]);

    % Setup colormaps for floor & mapping subplots
    % 3D View: dark gray floor (0) and glowing clean neon trail (1)
    colormap(VIZ.ax3d, [0.07 0.07 0.10; 0.0 0.75 0.95]);
    clim(VIZ.ax3d, [0 1]);
    
    % 2D View: zone indexing
    colormap(VIZ.ax2d, parula(7));
    clim(VIZ.ax2d,[0 6]);

    % Draw Floor in 3D (CData mapped to cov_grid for cleaning trails)
    VIZ.h_floor3d = draw_fast_floor(VIZ.ax3d, MEM.grid_x, MEM.grid_y, MEM.cov_grid);
    
    % Draw environment structural models
    draw_fast_walls(VIZ.ax3d, ENV.walls, ENV.wall_h);
    draw_fast_pillars(VIZ.ax3d, ENV.point_obs, 0.3, ENV.wall_h);
    draw_fast_dock(VIZ.ax3d, ROB.dock_pos);

    % Draw 2D structural maps
    for w = 1:size(ENV.walls,1)
        plot(VIZ.ax2d,[ENV.walls(w,1),ENV.walls(w,3)], ...
                      [ENV.walls(w,2),ENV.walls(w,4)],'w-','LineWidth',2);
    end
    plot(VIZ.ax2d,ROB.dock_pos(1),ROB.dock_pos(2),'g^','MarkerSize',12,'MarkerFaceColor','g');

    VIZ.h_map2d = imagesc(VIZ.ax2d, MEM.grid_x, MEM.grid_y, MEM.zone_grid);
    set(VIZ.ax2d,'YDir','normal');

    % Spawning dirt particles in both viewports
    if ~isempty(ENV.dirt_pts)
        VIZ.h_dirt3d = scatter3(VIZ.ax3d, ENV.dirt_pts(:,1), ENV.dirt_pts(:,2), ...
            0.02 * ones(size(ENV.dirt_pts, 1), 1), 16, [0.85 0.7 0.2], 'filled', 'MarkerFaceAlpha', 0.8);
        VIZ.h_dirt2d = plot(VIZ.ax2d, ENV.dirt_pts(:,1), ENV.dirt_pts(:,2), ...
            'o', 'MarkerSize', 4, 'MarkerFaceColor', [0.85 0.7 0.2], 'MarkerEdgeColor', 'none');
    else
        VIZ.h_dirt3d = scatter3(VIZ.ax3d, [], [], [], 'filled');
        VIZ.h_dirt2d = plot(VIZ.ax2d, [], []);
    end

    % Detailed Robot Mesh Setup
    [rx,ry,rz] = create_robot_mesh(ENV.robot_start(1), ENV.robot_start(2), ENV.robot_start(3), ROB.radius, ROB.height);
    VIZ.h_rob_chassis = surf(VIZ.ax3d, rx, ry, rz, ...
        'FaceColor',[0.25 0.25 0.28],'EdgeColor',[0.4 0.4 0.45],'FaceAlpha',0.95);
        
    [tx,ty,tz] = create_cylinder_mesh(ENV.robot_start(1), ENV.robot_start(2), ROB.radius*0.28, ROB.height*0.35, ROB.height);
    VIZ.h_rob_turret = surf(VIZ.ax3d, tx, ty, tz, ...
        'FaceColor',[0.12 0.12 0.15],'EdgeColor','none','FaceAlpha',0.9);
        
    [lx,ly,lz] = create_cylinder_mesh(ENV.robot_start(1), ENV.robot_start(2), ROB.radius*0.75, 0.02, ROB.height*0.8);
    VIZ.h_rob_led = surf(VIZ.ax3d, lx, ly, lz, ...
        'FaceColor',[0 0.6 1.0],'EdgeColor','none','FaceAlpha',0.9);

    VIZ.h_dir3d = plot3(VIZ.ax3d, ...
        [ENV.robot_start(1), ENV.robot_start(1)+0.5*cos(ENV.robot_start(3))], ...
        [ENV.robot_start(2), ENV.robot_start(2)+0.5*sin(ENV.robot_start(3))], ...
        [ROB.height+0.05, ROB.height+0.05], ...
        'r-','LineWidth',3);

    % Dynamic Obstacle 1 Drone setup
    [VIZ.bx, VIZ.by, VIZ.bz] = sphere(12);
    VIZ.bx = VIZ.bx * 0.35; VIZ.by = VIZ.by * 0.35; VIZ.bz = VIZ.bz * 0.25;
    VIZ.h_dyn3d_body = surf(VIZ.ax3d, VIZ.bx, VIZ.by, VIZ.bz, ...
        'FaceColor',[0.0 0.8 0.9],'EdgeColor','none','FaceAlpha',0.8);
    VIZ.h_dyn3d_arms = plot3(VIZ.ax3d, [0 0], [0 0], [0 0], 'Color', [0.4 0.4 0.45], 'LineWidth', 2);
    VIZ.h_dyn2d = plot(VIZ.ax2d,0,0,'co','MarkerSize',10,'MarkerFaceColor',[0 0.8 0.9]);

    % Dynamic Obstacle 2 Drone setup
    if isfield(ENV, 'dyn2_pos')
        VIZ.h_dyn2_body = surf(VIZ.ax3d, VIZ.bx, VIZ.by, VIZ.bz, ...
            'FaceColor',[0.9 0.4 0.1],'EdgeColor','none','FaceAlpha',0.8);
        VIZ.h_dyn2_arms = plot3(VIZ.ax3d, [0 0], [0 0], [0 0], 'Color', [0.4 0.4 0.45], 'LineWidth', 2);
        VIZ.h_dyn2d_obs = plot(VIZ.ax2d, 0, 0, 'ro', 'MarkerSize', 10, 'MarkerFaceColor', [0.9 0.4 0.1]);
    else
        VIZ.h_dyn2_body = [];
        VIZ.h_dyn2_arms = [];
        VIZ.h_dyn2d_obs = [];
    end

    % 3D Lidar Laser Ray Beams
    VIZ.h_laser_rays = [];
    for r_idx = 1:8
        VIZ.h_laser_rays(r_idx) = plot3(VIZ.ax3d, [0 0], [0 0], [0 0], ...
            'Color', [1.0 0.3 0.3], 'LineWidth', 1.0);
    end

    VIZ.h_lid3d = scatter3(VIZ.ax3d,0,0,0,8,[1 0.9 0],'filled','MarkerFaceAlpha',0.65);
    VIZ.h_lid2d = plot(VIZ.ax2d,0,0,'y.','MarkerSize',6);

    % Path visualization
    VIZ.h_tp3d = animatedline(VIZ.ax3d,'Color',[0.2 0.6 1.0],'LineWidth',2);
    VIZ.h_ep3d = animatedline(VIZ.ax3d,'Color',[0.2 1.0 0.4],'LineStyle','--','LineWidth',1.2);
    VIZ.h_tp2d = animatedline(VIZ.ax2d,'Color',[0.2 0.6 1.0],'LineWidth',1.8);
    VIZ.h_ep2d = animatedline(VIZ.ax2d,'Color',[0.2 1.0 0.4],'LineStyle','--','LineWidth',1.2);
    VIZ.h_path3d = plot3(VIZ.ax3d,nan,nan,nan,'c-.','LineWidth',2);
    VIZ.h_path2d = plot(VIZ.ax2d,nan,nan,'c-.','LineWidth',1.8);
    VIZ.h_frontier = plot(VIZ.ax2d,nan,nan,'r*','MarkerSize',12,'MarkerFaceColor','r');

    % Sidebar HUD stats panel
    VIZ.h_status = annotation(VIZ.fig,'textbox',[0.01 0.02 0.20 0.96], ...
        'String','Initializing Stats...','Color','w','FontSize',9,'FontName','Courier New', ...
        'BackgroundColor',[0.05 0.05 0.08],'FaceAlpha',0.9,'EdgeColor',[0.18 0.18 0.22], ...
        'LineWidth',1.5);

    % Set default interactive camera mode data
    ud.camera_mode = 'orbit';
    ud.orbit_angle = -45;
    set(VIZ.fig, 'UserData', ud);
    set(VIZ.fig, 'WindowKeyPressFcn', @camera_key_callback);

    VIZ.camera_mode = 'orbit'; % cache mode
    drawnow;
end

function h_floor = draw_fast_floor(ax, gx, gy, cov_grid)
    h_floor = surf(ax, gx, gy, zeros(size(cov_grid)), ...
        'FaceColor','texturemap','CData',cov_grid, ...
        'EdgeColor',[0.15 0.15 0.18], ...
        'EdgeAlpha',0.12,'FaceAlpha',0.95,'LineWidth',0.5);
end

function draw_fast_walls(ax, walls, h)
    wall_color = [0.45 0.45 0.50];
    for w = 1:size(walls,1)
        x1=walls(w,1); y1=walls(w,2); x2=walls(w,3); y2=walls(w,4);
        vx = [x1 x2 x2 x1]; vy = [y1 y1 y2 y2]; vz = [0 0 0 0];
        patch(ax,'XData',vx,'YData',vy,'ZData',[vz; vz+h], ...
            'FaceColor',wall_color,'EdgeColor',[0.6 0.6 0.65], ...
            'LineWidth',1.0,'FaceAlpha',0.85);
    end
end

function draw_fast_pillars(ax, obs, r, h)
    if isempty(obs), return; end
    [cx,cy,cz] = cylinder(r, 12);
    for p = 1:size(obs,1)
        surf(ax, cx+obs(p,1), cy+obs(p,2), cz*h, ...
            'FaceColor',[0.65 0.15 0.65],'EdgeColor','none','FaceAlpha',0.85);
    end
end

function draw_fast_dock(ax, dock_pos)
    [dx,dy] = meshgrid(dock_pos(1)-0.4:0.1:dock_pos(1)+0.4, ...
                        dock_pos(2)-0.4:0.1:dock_pos(2)+0.4);
    dz = 0.03*ones(size(dx));
    surf(ax,dx,dy,dz,'FaceColor',[0.1 0.7 0.1],'EdgeColor','none','FaceAlpha',0.85);
end

function [rx,ry,rz] = create_robot_mesh(cx,cy,th, r, h)
    n = 16;
    ang = linspace(0,2*pi,n);
    rx = r*cos(ang); ry = r*sin(ang);
    rx = [rx;rx]; ry = [ry;ry];
    rz = [zeros(1,n); h*ones(1,n)];
    rot = [cos(th) -sin(th); sin(th) cos(th)];
    tmp = rot * [rx(:)'; ry(:)'];
    rx = reshape(tmp(1,:), size(rx)) + cx;
    ry = reshape(tmp(2,:), size(ry)) + cy;
end

function [cx_m, cy_m, cz_m] = create_cylinder_mesh(cx, cy, r, h_cyl, z_offset)
    n = 12;
    ang = linspace(0,2*pi,n);
    cx_m = r*cos(ang); cy_m = r*sin(ang);
    cx_m = [cx_m; cx_m] + cx;
    cy_m = [cy_m; cy_m] + cy;
    cz_m = [zeros(1,n); h_cyl*ones(1,n)] + z_offset;
end

%% ===================================================================
%% VISUALISATION UPDATE
%% ===================================================================
function VIZ = update_fast_viz(VIZ, ROB, SENS, MEM, ENV, t)
    px=ROB.pose(1); py=ROB.pose(2); pth=ROB.pose(3);
    h=ROB.height; r=ROB.radius;

    % 1. Update cleaning trail (CData texturemap update)
    set(VIZ.h_floor3d, 'CData', MEM.cov_grid);

    % 2. Update robot meshes
    [rx,ry,rz] = create_robot_mesh(px,py,pth, r, h);
    set(VIZ.h_rob_chassis,'XData',rx,'YData',ry,'ZData',rz);
    
    % Spinning Turret
    turret_th = pth + 8*t; % Rotating lidar turret effect
    [tx,ty,tz] = create_cylinder_mesh(px + 0.05*cos(turret_th), py + 0.05*sin(turret_th), r*0.28, h*0.35, h);
    set(VIZ.h_rob_turret,'XData',tx,'YData',ty,'ZData',tz);
    
    % Status LED Position
    [lx,ly,lz] = create_cylinder_mesh(px, py, r*0.75, 0.02, h*0.8);
    set(VIZ.h_rob_led,'XData',lx,'YData',ly,'ZData',lz);
    
    % LED Color Switch based on active state
    if ~strcmp(MEM.recovery_state, 'NONE')
        led_color = [1.0 0.1 0.1]; % Red (stuck recovery)
    elseif strcmp(MEM.bt_state, 'RETURN_DOCK')
        led_color = [0.95 0.7 0.0]; % Amber (returning)
    elseif strcmp(MEM.bt_state, 'DOCKED')
        led_color = [0.1 0.9 0.1]; % Green (docked)
    else
        led_color = [0.0 0.6 1.0]; % Blue (normal sweep)
    end
    set(VIZ.h_rob_led, 'FaceColor', led_color);

    set(VIZ.h_dir3d, ...
        'XData',[px, px+0.5*cos(pth)], ...
        'YData',[py, py+0.5*sin(pth)], ...
        'ZData',[h+0.05, h+0.05]);

    % 3. Update dynamic drones
    hover_z1 = 0.5 + 0.08 * sin(6 * t);
    set(VIZ.h_dyn3d_body, ...
        'XData', VIZ.bx + ENV.dyn_pos(1), ...
        'YData', VIZ.by + ENV.dyn_pos(2), ...
        'ZData', VIZ.bz + hover_z1);
        
    arm_l = 0.45;
    dx1 = arm_l * cos(12 * t);
    dy1 = arm_l * sin(12 * t);
    set(VIZ.h_dyn3d_arms, ...
        'XData', [ENV.dyn_pos(1) - dx1, ENV.dyn_pos(1) + dx1, nan, ENV.dyn_pos(1) - dy1, ENV.dyn_pos(1) + dy1], ...
        'YData', [ENV.dyn_pos(2) - dy1, ENV.dyn_pos(2) + dy1, nan, ENV.dyn_pos(2) + dx1, ENV.dyn_pos(2) - dx1], ...
        'ZData', [hover_z1, hover_z1, nan, hover_z1, hover_z1]);
        
    set(VIZ.h_dyn2d,'XData',ENV.dyn_pos(1),'YData',ENV.dyn_pos(2));

    % Drone 2 update
    if isfield(ENV, 'dyn2_pos') && ~isempty(VIZ.h_dyn2_body)
        hover_z2 = 0.55 + 0.06 * cos(5 * t);
        set(VIZ.h_dyn2_body, ...
            'XData', VIZ.bx + ENV.dyn2_pos(1), ...
            'YData', VIZ.by + ENV.dyn2_pos(2), ...
            'ZData', VIZ.bz + hover_z2);
            
        dx2 = arm_l * cos(-15 * t);
        dy2 = arm_l * sin(-15 * t);
        set(VIZ.h_dyn2_arms, ...
            'XData', [ENV.dyn2_pos(1) - dx2, ENV.dyn2_pos(1) + dx2, nan, ENV.dyn2_pos(1) - dy2, ENV.dyn2_pos(1) + dy2], ...
            'YData', [ENV.dyn2_pos(2) - dy2, ENV.dyn2_pos(2) + dy2, nan, ENV.dyn2_pos(2) + dx2, ENV.dyn2_pos(2) - dx2], ...
            'ZData', [hover_z2, hover_z2, nan, hover_z2, hover_z2]);
            
        set(VIZ.h_dyn2d_obs,'XData',ENV.dyn2_pos(1),'YData',ENV.dyn2_pos(2));
    end

    % 4. Update dirt particles
    if isfield(ENV, 'dirt_pts') && ~isempty(ENV.dirt_pts)
        set(VIZ.h_dirt3d, 'XData', ENV.dirt_pts(:,1), 'YData', ENV.dirt_pts(:,2), ...
            'ZData', 0.02*ones(size(ENV.dirt_pts, 1), 1));
        set(VIZ.h_dirt2d, 'XData', ENV.dirt_pts(:,1), 'YData', ENV.dirt_pts(:,2));
    else
        set(VIZ.h_dirt3d, 'XData', [], 'YData', [], 'ZData', []);
        set(VIZ.h_dirt2d, 'XData', [], 'YData', []);
    end

    % 5. Update LiDAR beam lines & points
    if ~isempty(SENS.lidar_pts)
        lx = SENS.lidar_pts(:,1);
        ly = SENS.lidar_pts(:,2);
        lz = 0.05 * ones(size(lx));
        set(VIZ.h_lid3d,'XData',lx,'YData',ly,'ZData',lz);
        set(VIZ.h_lid2d,'XData',lx,'YData',ly);
        
        n_pts = size(SENS.lidar_pts, 1);
        step_pts = max(1, floor(n_pts / 8));
        for r_idx = 1:8
            pt_idx = min(n_pts, (r_idx-1)*step_pts + 1);
            set(VIZ.h_laser_rays(r_idx), ...
                'XData', [px, SENS.lidar_pts(pt_idx, 1)], ...
                'YData', [py, SENS.lidar_pts(pt_idx, 2)], ...
                'ZData', [h, 0.05]);
        end
    end

    % 6. Update paths and tracks
    z_path = 0.08;
    addpoints(VIZ.h_tp3d, px, py, z_path);
    addpoints(VIZ.h_ep3d, MEM.est_pose(1), MEM.est_pose(2), z_path+0.02);
    addpoints(VIZ.h_tp2d, px, py);
    addpoints(VIZ.h_ep2d, MEM.est_pose(1), MEM.est_pose(2));

    if ~isempty(MEM.astar_path) && size(MEM.astar_path,1)>1
        np = size(MEM.astar_path,1);
        pz = linspace(z_path, z_path, np);
        set(VIZ.h_path3d,'XData',MEM.astar_path(:,1), ...
                          'YData',MEM.astar_path(:,2),'ZData',pz');
        set(VIZ.h_path2d,'XData',MEM.astar_path(:,1),'YData',MEM.astar_path(:,2));
    else
        set(VIZ.h_path3d,'XData',nan,'YData',nan,'ZData',nan);
        set(VIZ.h_path2d,'XData',nan,'YData',nan);
    end

    if ~isempty(MEM.current_frontier)
        set(VIZ.h_frontier,'XData',MEM.current_frontier(1), ...
            'YData',MEM.current_frontier(2));
    else
        set(VIZ.h_frontier,'XData',nan,'YData',nan);
    end

    set(VIZ.h_map2d,'CData',MEM.zone_grid);

    % 7. Update camera modes based on figure UserData
    ud = get(VIZ.fig, 'UserData');
    if isempty(ud)
        camera_mode = 'orbit';
        orbit_angle = -45;
    else
        camera_mode = ud.camera_mode;
        orbit_angle = ud.orbit_angle;
    end
    VIZ.camera_mode = camera_mode; % update cache

    if strcmp(camera_mode, 'orbit')
        orbit_angle = orbit_angle + 0.15; 
        if ~isempty(ud)
            ud.orbit_angle = orbit_angle;
            set(VIZ.fig, 'UserData', ud);
        end
        cam_d = 8.5;
        cam_x = px + cam_d * cosd(orbit_angle);
        cam_y = py + cam_d * sind(orbit_angle);
        cam_z = 3.5;
        set(VIZ.ax3d, 'CameraPosition', [cam_x, cam_y, cam_z], ...
                      'CameraTarget', [px, py, 0.25], ...
                      'CameraUpVector', [0 0 1]);
    elseif strcmp(camera_mode, 'chase')
        cam_d = 2.8;
        cam_x = px - cam_d * cos(pth);
        cam_y = py - cam_d * sin(pth);
        cam_z = h + 0.8;
        set(VIZ.ax3d, 'CameraPosition', [cam_x, cam_y, cam_z], ...
                      'CameraTarget', [px + 2.0*cos(pth), py + 2.0*sin(pth), 0.25], ...
                      'CameraUpVector', [0 0 1]);
    elseif strcmp(camera_mode, 'top_down')
        set(VIZ.ax3d, 'CameraPosition', [0, 0, 15], ...
                      'CameraTarget', [0, 0, 0], ...
                      'CameraUpVector', [0 1 0]);
    end

    % 8. Update HUD Statistics panel string
    initial_dirt = ENV.initial_dirt_count;
    current_dirt = size(ENV.dirt_pts, 1);
    cleaned_count = initial_dirt - current_dirt;
    if initial_dirt > 0
        clean_pct = 100 * cleaned_count / initial_dirt;
    else
        clean_pct = 0;
    end
    
    battery_pct = max(0.0, 100.0 * MEM.battery);
    ekf_error = norm(ROB.pose(1:2) - MEM.est_pose(1:2));
    
    if MEM.loop_closure_done
        lc_str = 'CLOSED';
    else
        lc_str = 'PENDING';
    end
    
    status_str = sprintf([ ...
        '========================================\n' ...
        '       INDUSTRIAL CLEANING SLAM v7.0     \n' ...
        '========================================\n\n' ...
        '  [SYSTEM STATUS]\n' ...
        '  Time Elapsed  : %6.1f / %.1f sec\n' ...
        '  Battery Level : %5.1f %%\n' ...
        '  Mission State : %s\n' ...
        '  Recovery State: %s\n\n' ...
        '  [PERCEPTION & SLAM]\n' ...
        '  EKF Pose X    : %+6.2f m\n' ...
        '  EKF Pose Y    : %+6.2f m\n' ...
        '  EKF Heading   : %+6.1f deg\n' ...
        '  Est. Error    : %6.3f m\n' ...
        '  Loop Closure  : %s\n' ...
        '  Tracked Obs   : %d\n\n' ...
        '  [CLEANING METRICS]\n' ...
        '  Total Dirt    : %4d points\n' ...
        '  Cleaned Dirt  : %4d points\n' ...
        '  Coverage Score: %5.1f %%\n\n' ...
        '  [CAMERA VIEWMODE]\n' ...
        '  Active Mode   : %s\n' ...
        '  ----------------------------------------\n' ...
        '  Hotkeys:\n' ...
        '   [1] Cinematic Orbit Mode\n' ...
        '   [2] Robot-Chase Follow Mode\n' ...
        '   [3] Top-Down SLAM Map View\n' ...
        '========================================' ...
    ], t, ENV.total_time, battery_pct, MEM.bt_state, MEM.recovery_state, ...
       MEM.est_pose(1), MEM.est_pose(2), rad2deg(MEM.est_pose(3)), ekf_error, ...
       lc_str, ...
       length(MEM.tracked_obs), initial_dirt, cleaned_count, clean_pct, ...
       upper(camera_mode));

    set(VIZ.h_status, 'String', status_str);
    drawnow limitrate;
end

%% ===================================================================
%% CAMERA SWITCH KEYBOARD CALLBACK
%% ===================================================================
function camera_key_callback(src, event)
    ud = get(src, 'UserData');
    if isempty(ud), return; end
    switch event.Key
        case {'1', 'numpad1'}
            ud.camera_mode = 'orbit';
            fprintf('[Camera] Switched to Cinematic Orbit Mode\n');
        case {'2', 'numpad2'}
            ud.camera_mode = 'chase';
            fprintf('[Camera] Switched to Chase Follow Mode\n');
        case {'3', 'numpad3'}
            ud.camera_mode = 'top_down';
            fprintf('[Camera] Switched to Top-Down SLAM Mode\n');
    end
    set(src, 'UserData', ud);
end

%% ===================================================================
%% UTILITY FUNCTIONS
%% ===================================================================
function pose = integrate_pose(pose, v, omega, dt)
    pose(1) = pose(1) + v*cos(pose(3))*dt;
    pose(2) = pose(2) + v*sin(pose(3))*dt;
    pose(3) = atan2(sin(pose(3)+omega*dt), cos(pose(3)+omega*dt));
end

function idx = pose_to_grid_idx(pos, gx, gy, rows, cols)
    c = nearest_idx(gx, pos(1)); r = nearest_idx(gy, pos(2));
    idx = [clamp(r,1,rows), clamp(c,1,cols)];
end

function idx = nearest_idx(vec, val)
    [~,idx] = min(abs(vec-val));
end

function ok = in_bounds(r, c, grid)
    [rows,cols] = size(grid);
    ok = r>=1 && r<=rows && c>=1 && c<=cols;
end

function idx = nearest_free(center, grid, rows, cols)
    for rad = 1:max(rows,cols)
        for dr = -rad:rad
            for dc = -rad:rad
                if abs(dr)==rad || abs(dc)==rad
                    r=center(1)+dr; c=center(2)+dc;
                    if r>=1&&r<=rows&&c>=1&&c<=cols&&grid(r,c)==0
                        idx=[r,c]; return;
                    end
                end
            end
        end
    end
    idx=center;
end

function a = angdiff_vec(pose, target)
    th = atan2(target(2)-pose(2), target(1)-pose(1));
    a  = atan2(sin(th-pose(3)), cos(th-pose(3)));
end

function v = clamp(v, lo, hi)
    v = max(lo, min(hi, v));
end

function d = dist_point_to_segment(px, py, x1, y1, x2, y2)
    dx = x2 - x1; dy = y2 - y1;
    l2 = dx^2 + dy^2;
    if l2 == 0
        d = norm([px - x1, py - y1]); return;
    end
    t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = max(0, min(1, t));
    proj_x = x1 + t * dx;
    proj_y = y1 + t * dy;
    d = norm([px - proj_x, py - proj_y]);
end

function d = angdiff(a, b)
    d = atan2(sin(a - b), cos(a - b));
end


%% ===================================================================
%% NAVIGATION LIBRARY
%% ===================================================================

function path = astar_planner_fallback(start, goal, gx, gy, grid, robot_r, grid_res)
    % Standard Theta* Planner
    path = astar_planner(start, goal, gx, gy, grid, robot_r, grid_res);
    
    % Verify that planned path is valid and does not cross walls (FR-RETURN-01)
    if path_crosses_walls(path, grid, gx, gy)
        % Constrained A* fallback with 50% reduced inflation
        reduced_r = robot_r * 0.5;
        path = astar_planner(start, goal, gx, gy, grid, reduced_r, grid_res);
        
        if path_crosses_walls(path, grid, gx, gy)
            % Emergency fallback: minimal inflation
            path = astar_planner(start, goal, gx, gy, grid, 0.05, grid_res);
        end
    end
end

function crosses = path_crosses_walls(path, grid, gx, gy)
    crosses = false;
    if size(path, 1) < 2, return; end
    [rows, cols] = size(grid);
    for i = 1:(size(path, 1)-1)
        p1 = path(i, :);
        p2 = path(i+1, :);
        % Check if segment line hits any wall in grid
        n_steps = ceil(norm(p2 - p1) / 0.1);
        for s = linspace(0, 1, max(n_steps, 2))
            pt = p1 + s * (p2 - p1);
            r = nearest_idx(gy, pt(2));
            c = nearest_idx(gx, pt(1));
            if r >= 1 && r <= rows && c >= 1 && c <= cols
                if grid(r, c) == 1
                    crosses = true;
                    return;
                end
            end
        end
    end
end

function eroded = custom_imerode(mask, radius, res)
    % Morphological erosion using circular structuring element via 2D convolution
    n = ceil(radius / res);
    [x, y] = meshgrid(-n:n, -n:n);
    kernel = (x.^2 + y.^2) <= n^2;
    conv_val = conv2(double(mask), double(kernel), 'same');
    eroded = conv_val >= (sum(kernel(:)) - 0.1);
end

function dilated = custom_dilate(mask, radius, res)
    % Morphological dilation using circular structuring element via 2D convolution
    n = ceil(radius / res);
    [x, y] = meshgrid(-n:n, -n:n);
    kernel = (x.^2 + y.^2) <= n^2;
    conv_val = conv2(double(mask), double(kernel), 'same');
    dilated = conv_val > 0.1;
end

function wps = generate_boustrophedon_waypoints(room_id, MEM)
    % FR-ROOM-01, FR-ROOM-02, FR-SWEEP-01
    room_mask = (MEM.zone_grid == room_id);
    if ~any(room_mask(:)), wps = []; return; end
    
    % Erode room mask by robot radius (FR-ROOM-02)
    eroded_room = custom_imerode(room_mask, MEM.robot_r, MEM.grid_res);
    
    % Enforce safety radius from obstacles (0.05m additional safety margin)
    safety_radius = MEM.robot_r + 0.05;
    inflated_occ = custom_dilate(MEM.occ_grid > 0, safety_radius, MEM.grid_res);
    valid_area = eroded_room & ~inflated_occ;
    
    % Fallback if constraints too tight
    if ~any(valid_area(:))
        valid_area = eroded_room;
    end
    if ~any(valid_area(:))
        wps = []; return;
    end
    
    [rows_idx, ~] = find(valid_area);
    r_min = min(rows_idx); r_max = max(rows_idx);
    
    % Sweep spacing of ~1.8 * robot radius
    spacing_m = 1.8 * MEM.robot_r;
    spacing_cells = max(1, round(spacing_m / MEM.grid_res));
    
    wps = [];
    dir_flag = 1; % 1 = Left-to-Right, -1 = Right-to-Left
    
    for r = r_min:spacing_cells:r_max
        cols_in_row = find(valid_area(r, :));
        if isempty(cols_in_row), continue; end
        
        % Group contiguous columns to handle non-convex boundaries
        segments = {};
        start_c = cols_in_row(1);
        for idx = 2:length(cols_in_row)
            if cols_in_row(idx) > cols_in_row(idx-1) + 1
                segments{end+1} = [start_c, cols_in_row(idx-1)];
                start_c = cols_in_row(idx);
            end
        end
        segments{end+1} = [start_c, cols_in_row(end)];
        
        row_wps = [];
        for s_idx = 1:length(segments)
            seg = segments{s_idx};
            x_start = MEM.grid_x(seg(1));
            x_end = MEM.grid_x(seg(2));
            y_val = MEM.grid_y(r);
            
            if dir_flag == 1
                row_wps = [row_wps; x_start, y_val; x_end, y_val];
            else
                row_wps = [row_wps; x_end, y_val; x_start, y_val];
            end
        end
        
        if dir_flag == -1
            row_wps = flipud(row_wps);
        end
        wps = [wps; row_wps];
        dir_flag = -dir_flag;
    end
end

function exits = detect_room_exits(MEM)
    % FR-DOOR-03 Width Validation (doorway width must span >= 1.0 * robot diameter)
    [rows, cols] = size(MEM.zone_grid);
    exits = {};
    num_rooms = max(MEM.zone_grid(:));
    if num_rooms < 2, return; end
    
    for zoneA = 2:num_rooms
        for zoneB = (zoneA+1):num_rooms
            % Find boundary cells
            boundary = [];
            for r = 2:(rows-1)
                for c = 2:(cols-1)
                    if MEM.zone_grid(r,c) == zoneA && MEM.occ_grid(r,c) == 0
                        neighbors = [r-1, c; r+1, c; r, c-1; r, c+1];
                        for n = 1:4
                            nr = neighbors(n,1); nc = neighbors(n,2);
                            if MEM.zone_grid(nr,nc) == zoneB && MEM.occ_grid(nr,nc) == 0
                                boundary = [boundary; r, c];
                                break;
                            end
                        end
                    end
                end
            end
            
            if isempty(boundary), continue; end
            
            % Cluster contiguous points
            visited = false(size(boundary, 1), 1);
            for i = 1:size(boundary, 1)
                if visited(i), continue; end
                
                cluster = boundary(i, :);
                visited(i) = true;
                head = 1; tail = 1;
                while head <= tail
                    curr = cluster(head, :);
                    head = head + 1;
                    for j = 1:size(boundary, 1)
                        if ~visited(j)
                            if norm(boundary(j, :) - curr) <= 2.0
                                visited(j) = true;
                                tail = tail + 1;
                                cluster = [cluster; boundary(j, :)];
                            end
                        end
                    end
                end
                
                % Compute diameter of the exit cluster
                if size(cluster, 1) >= 2
                    max_d = 0;
                    for u = 1:size(cluster, 1)
                        for v = u:size(cluster, 1)
                            d_val = norm(cluster(u,:) - cluster(v,:));
                            if d_val > max_d
                                max_d = d_val;
                            end
                        end
                    end
                    
                    % door width = (max_d + 1) * resolution
                    width = (max_d + 1) * MEM.grid_res;
                    
                    % FR-DOOR-03 Validation: width >= 2 * robot_r (0.6 m)
                    if width >= 2.0 * MEM.robot_r
                        center_cell = mean(cluster, 1);
                        center_pos = [MEM.grid_x(round(center_cell(2))), MEM.grid_y(round(center_cell(1)))];
                        
                        exit_struct = struct();
                        exit_struct.roomA = zoneA;
                        exit_struct.roomB = zoneB;
                        exit_struct.pos = center_pos;
                        exit_struct.width = width;
                        
                        exits{end+1} = exit_struct;
                    end
                end
            end
        end
    end
end

function G = build_topo_graph(MEM)
    % FR-BAT-02
    num_rooms = max(MEM.zone_grid(:));
    G = zeros(num_rooms, num_rooms);
    if num_rooms < 2, return; end
    
    for i = 1:length(MEM.detected_exits)
        e = MEM.detected_exits{i};
        G(e.roomA, e.roomB) = 1;
        G(e.roomB, e.roomA) = 1;
    end
end

function path_rooms = find_topological_path(topo_graph, start_room, end_room)
    num_nodes = size(topo_graph, 1);
    if start_room == end_room || start_room > num_nodes || end_room > num_nodes
        path_rooms = [start_room];
        return;
    end
    
    visited = false(num_nodes, 1);
    parent = zeros(num_nodes, 1);
    queue = [start_room];
    visited(start_room) = true;
    head = 1; tail = 1;
    found = false;
    
    while head <= tail
        curr = queue(head);
        head = head + 1;
        if curr == end_room
            found = true;
            break;
        end
        
        neighbors = find(topo_graph(curr, :) == 1);
        for i = 1:length(neighbors)
            n = neighbors(i);
            if ~visited(n)
                visited(n) = true;
                parent(n) = curr;
                tail = tail + 1;
                queue(tail) = n;
            end
        end
    end
    
    if found
        path_rooms = [];
        curr = end_room;
        while curr ~= start_room
            path_rooms = [curr, path_rooms];
            curr = parent(curr);
        end
        path_rooms = [start_room, path_rooms];
    else
        path_rooms = [start_room, end_room];
    end
end

function exits_seq = get_exits_sequence(detected_exits, path_rooms)
    exits_seq = [];
    if length(path_rooms) < 2, return; end
    for i = 1:(length(path_rooms)-1)
        r_from = path_rooms(i);
        r_to = path_rooms(i+1);
        
        for j = 1:length(detected_exits)
            e = detected_exits{j};
            if (e.roomA == r_from && e.roomB == r_to) || (e.roomA == r_to && e.roomB == r_from)
                exits_seq = [exits_seq; e.pos];
                break;
            end
        end
    end
end

function [E_required, path_rooms, exits_seq] = compute_return_energy(MEM)
    % FR-BAT-01
    curr_r = nearest_idx(MEM.grid_y, MEM.est_pose(2));
    curr_c = nearest_idx(MEM.grid_x, MEM.est_pose(1));
    current_room = MEM.zone_grid(curr_r, curr_c);
    
    dock_r = nearest_idx(MEM.grid_y, MEM.dock_pos(2));
    dock_c = nearest_idx(MEM.grid_x, MEM.dock_pos(1));
    dock_room = MEM.zone_grid(dock_r, dock_c);
    
    if ~MEM.zoning_done || current_room < 2 || dock_room < 2
        dist = norm(MEM.est_pose(1:2) - MEM.dock_pos);
        E_required = dist * MEM.energy_per_meter;
        path_rooms = [];
        exits_seq = [];
        return;
    end
    
    path_rooms = find_topological_path(MEM.topo_graph, current_room, dock_room);
    exits_seq = get_exits_sequence(MEM.detected_exits, path_rooms);
    
    E_required = 0;
    current_pt = MEM.est_pose(1:2)';
    
    % Sum up sequential segments through room doorways
    if ~isempty(exits_seq)
        for i = 1:size(exits_seq, 1)
            next_pt = exits_seq(i, :);
            E_required = E_required + norm(current_pt - next_pt) * MEM.energy_per_meter;
            current_pt = next_pt;
        end
    end
    
    % Final leg to the charging dock
    E_required = E_required + norm(current_pt - MEM.dock_pos') * MEM.energy_per_meter;
    
    % Add 1.25 multiplier to account for non-straight line maneuvers/obstacles
    E_required = E_required * 1.25;
end

function MEM = plan_door_hop_return(MEM, path_rooms, exits_seq)
    % FR-RETURN-02 Ordered exit hopping return path plan
    MEM.exits_sequence = exits_seq;
    MEM.exits_seq_idx = 1;
    
    if ~isempty(exits_seq)
        target = exits_seq(1, :);
    else
        target = MEM.dock_pos';
    end
    
    MEM.astar_path = astar_planner_fallback(MEM.est_pose(1:2), target', ...
        MEM.grid_x, MEM.grid_y, MEM.occ_grid, MEM.robot_r, MEM.grid_res);
    MEM.path_idx = 1;
end

function MEM = plan_next_room_transition(MEM)
    % Find adjacent room which is not yet swept
    num_rooms = max(MEM.zone_grid(:));
    if num_rooms < 2
        MEM.bt_state = 'RETURN_DOCK';
        return;
    end
    
    unswept = [];
    for r_id = 2:num_rooms
        if ~ismember(r_id, MEM.swept_rooms)
            unswept = [unswept; r_id];
        end
    end
    
    if isempty(unswept)
        fprintf('[BT] All rooms swept successfully! Returning to dock.\n');
        MEM.bt_state = 'RETURN_DOCK';
        MEM.dock_phase = 'PATH_FOLLOW';
        return;
    end
    
    % Find the closest unswept room via topological path
    best_target = unswept(1);
    min_hops = inf;
    best_exits = [];
    
    for idx = 1:length(unswept)
        target = unswept(idx);
        path_rooms = find_topological_path(MEM.topo_graph, MEM.current_room, target);
        if length(path_rooms) < min_hops
            min_hops = length(path_rooms);
            best_target = target;
            best_exits = get_exits_sequence(MEM.detected_exits, path_rooms);
        end
    end
    
    MEM.transit_room = best_target;
    MEM.cov_state = 'ROOM_TRANSITION';
    if ~isempty(best_exits)
        MEM.transit_exit = best_exits(1, :);
    else
        % Fallback centroid target
        [tr, tc] = find(MEM.zone_grid == best_target);
        MEM.transit_exit = [MEM.grid_x(round(mean(tc))), MEM.grid_y(round(mean(tr)))];
    end
    
    fprintf('[BT] Transitioning Room %d -> Room %d via door at [%.2f, %.2f]\n', ...
        MEM.current_room, MEM.transit_room, MEM.transit_exit(1), MEM.transit_exit(2));
    
    MEM.astar_path = astar_planner_fallback(MEM.est_pose(1:2), MEM.transit_exit', ...
        MEM.grid_x, MEM.grid_y, MEM.occ_grid, MEM.robot_r, MEM.grid_res);
    MEM.path_idx = 1;
end

function ok = grid_los_clear(r1, c1, r2, c2, inflated)
    dist = sqrt((r2-r1)^2 + (c2-c1)^2);
    n = ceil(dist * 1.5);
    ok = true;
    [rows, cols] = size(inflated);
    for s = linspace(0, 1, max(n, 2))
        r = round(r1 + s * (r2 - r1));
        c = round(c1 + s * (c2 - c1));
        if r >= 1 && r <= rows && c >= 1 && c <= cols
            if inflated(r, c) == 1
                ok = false;
                return;
            end
        else
            ok = false;
            return;
        end
    end
end


