% verify_nav_library.m
% Simple unit tests to verify the custom Navigation Library functions.

function verify_nav_library()
    try
        fprintf('Starting Navigation Library Unit Tests...\n');
        
        % 1. Create dummy MEM structure
        MEM.grid_res = 0.25;
        MEM.grid_x = -5:MEM.grid_res:5;
        MEM.grid_y = -5:MEM.grid_res:5;
        nx = length(MEM.grid_x);
        ny = length(MEM.grid_y);
        MEM.occ_grid = zeros(ny, nx);
        MEM.zone_grid = zeros(ny, nx);
        MEM.robot_r = 0.3;
        MEM.battery = 1.0;
        MEM.energy_per_meter = 0.005;
        MEM.safety_margin = 0.05;
        MEM.est_pose = [0; 0; 0];
        MEM.dock_pos = [-4; -4];
        MEM.swept_rooms = [];
        MEM.detected_exits = {};
        MEM.topo_graph = [];
        MEM.zoning_done = true;
        
        % Seed rooms
        % Let's split the grid into Room 2 (left) and Room 3 (right)
        % Separated by a wall at x = 0 (column index round(nx/2)) with a door
        mid_col = round(nx/2);
        MEM.occ_grid(:, mid_col) = 1;
        % Add door at row index round(ny/2) with width = 4 cells (1.0 meter)
        door_start = round(ny/2) - 2;
        door_end = round(ny/2) + 2;
        MEM.occ_grid(door_start:door_end, mid_col) = 0;
        
        % Set zones
        for r = 1:ny
            for c = 1:nx
                if MEM.occ_grid(r, c) == 0
                    if c < mid_col
                        MEM.zone_grid(r, c) = 2;
                    else
                        MEM.zone_grid(r, c) = 3;
                    end
                else
                    MEM.zone_grid(r, c) = 1;
                end
            end
        end
        
        % Test custom_imerode and custom_dilate
        fprintf('Testing Custom Erosion & Dilation...\n');
        mask = zeros(5, 5); mask(2:4, 2:4) = 1;
        eroded = custom_imerode(mask, 0.25, 0.25);
        assert(eroded(3,3) == 1, 'Erosion center should be 1');
        assert(sum(eroded(:)) < sum(mask(:)), 'Erosion should shrink the mask');
        
        % Test door/exit detection
        fprintf('Testing Door/Exit Detection (FR-DOOR-03)...\n');
        exits = detect_room_exits(MEM);
        assert(~isempty(exits), 'Exit should be detected');
        fprintf('Found %d exits. Width of first exit: %.2f m\n', length(exits), exits{1}.width);
        assert(exits{1}.width >= 0.6, 'Exit width should be valid');
        
        MEM.detected_exits = exits;
        
        % Test topo graph build
        fprintf('Testing Topological Graph Build (FR-BAT-02)...\n');
        G = build_topo_graph(MEM);
        assert(G(2, 3) == 1, 'Room 2 and 3 should be adjacent');
        MEM.topo_graph = G;
        
        % Test energy calculation
        fprintf('Testing Continuous Energy Budget (FR-BAT-01)...\n');
        [E_req, path_rooms, exits_seq] = compute_return_energy(MEM);
        fprintf('E_req to return: %.4f, Battery: %.2f\n', E_req, MEM.battery);
        assert(E_req > 0, 'Return energy should be positive');
        
        % Test Boustrophedon waypoint generation
        fprintf('Testing Boustrophedon Waypoints (FR-ROOM-01, FR-SWEEP-01)...\n');
        wps = generate_boustrophedon_waypoints(2, MEM);
        assert(~isempty(wps), 'Waypoints should be generated');
        fprintf('Generated %d sweep waypoints for Room 2.\n', size(wps, 1));
        
        fprintf('All Navigation Library Unit Tests PASSED successfully!\n');
    catch ME
        fprintf('Test Failure: %s\n', ME.message);
        exit(1);
    end
end

function eroded = custom_imerode(mask, radius, res)
    n = ceil(radius / res);
    [x, y] = meshgrid(-n:n, -n:n);
    kernel = (x.^2 + y.^2) <= n^2;
    conv_val = conv2(double(mask), double(kernel), 'same');
    eroded = conv_val >= (sum(kernel(:)) - 0.1);
end

function dilated = custom_dilate(mask, radius, res)
    n = ceil(radius / res);
    [x, y] = meshgrid(-n:n, -n:n);
    kernel = (x.^2 + y.^2) <= n^2;
    conv_val = conv2(double(mask), double(kernel), 'same');
    dilated = conv_val > 0.1;
end

function wps = generate_boustrophedon_waypoints(room_id, MEM)
    room_mask = (MEM.zone_grid == room_id);
    if ~any(room_mask(:)), wps = []; return; end
    
    eroded_room = custom_imerode(room_mask, MEM.robot_r, MEM.grid_res);
    safety_radius = MEM.robot_r + 0.05;
    inflated_occ = custom_dilate(MEM.occ_grid > 0, safety_radius, MEM.grid_res);
    valid_area = eroded_room & ~inflated_occ;
    
    if ~any(valid_area(:))
        valid_area = eroded_room;
    end
    if ~any(valid_area(:))
        wps = []; return;
    end
    
    [rows_idx, ~] = find(valid_area);
    r_min = min(rows_idx); r_max = max(rows_idx);
    
    spacing_m = 1.8 * MEM.robot_r;
    spacing_cells = max(1, round(spacing_m / MEM.grid_res));
    
    wps = [];
    dir_flag = 1; 
    
    for r = r_min:spacing_cells:r_max
        cols_in_row = find(valid_area(r, :));
        if isempty(cols_in_row), continue; end
        
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
    [rows, cols] = size(MEM.zone_grid);
    exits = {};
    num_rooms = max(MEM.zone_grid(:));
    if num_rooms < 2, return; end
    
    for zoneA = 2:num_rooms
        for zoneB = (zoneA+1):num_rooms
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
                    
                    width = (max_d + 1) * MEM.grid_res;
                    
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
    
    if ~isempty(exits_seq)
        for i = 1:size(exits_seq, 1)
            next_pt = exits_seq(i, :);
            E_required = E_required + norm(current_pt - next_pt) * MEM.energy_per_meter;
            current_pt = next_pt;
        end
    end
    
    E_required = E_required + norm(current_pt - MEM.dock_pos') * MEM.energy_per_meter;
    E_required = E_required * 1.25;
end

function idx = nearest_idx(vec, val)
    [~,idx] = min(abs(vec-val));
end

function ok = in_bounds(r, c, grid)
    [rows,cols] = size(grid);
    ok = r>=1 && r<=rows && c>=1 && c<=cols;
end
