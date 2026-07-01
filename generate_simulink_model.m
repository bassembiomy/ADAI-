% generate_simulink_model.m
% Programs Simulink API to create the 'vacuum_cleaner_twin.slx' model,
% organizing the navigation and autonomous blocks library category.

function generate_simulink_model()
    try
        modelName = 'vacuum_cleaner_twin';
        
        % If model is already open, close it without saving
        if bdIsLoaded(modelName)
            close_system(modelName, 0);
        end
        
        % Create new Simulink model
        fprintf('Creating new Simulink system: %s.slx...\n', modelName);
        new_system(modelName);
        open_system(modelName);
        
        % 1. Create a Library Subsystem containing all Navigation & Autonomous blocks
        libPath = [modelName '/Navigation_and_Autonomous_Library'];
        add_block('built-in/SubSystem', libPath);
        set_param(libPath, 'Position', [100, 100, 450, 450]);
        
        % Get layout parameters
        x = 50; y = 50; w = 150; h = 60; y_spacing = 100;
        
        %% BLOCK 1: Boustrophedon Sweep Planner (FR-ROOM-01, FR-SWEEP-01)
        blk1 = [libPath '/Boustrophedon_Sweep'];
        add_block('built-in/SubSystem', blk1);
        set_param(blk1, 'Position', [x, y, x+w, y+h]);
        add_block('built-in/Inport', [blk1 '/room_mask'], 'Position', [20, 20, 40, 40]);
        add_block('built-in/Inport', [blk1 '/robot_radius'], 'Position', [20, 60, 40, 80]);
        add_block('built-in/Outport', [blk1 '/sweep_waypoints'], 'Position', [300, 40, 320, 60]);
        
        %% BLOCK 2: Boundary Erosion (FR-ROOM-02)
        y = y + y_spacing;
        blk2 = [libPath '/Boundary_Erosion'];
        add_block('built-in/SubSystem', blk2);
        set_param(blk2, 'Position', [x, y, x+w, y+h]);
        add_block('built-in/Inport', [blk2 '/grid_mask'], 'Position', [20, 20, 40, 40]);
        add_block('built-in/Inport', [blk2 '/erosion_radius'], 'Position', [20, 60, 40, 80]);
        add_block('built-in/Outport', [blk2 '/eroded_mask'], 'Position', [300, 40, 320, 60]);
        
        %% BLOCK 3: Door Tracker (FR-DOOR-01, FR-DOOR-03)
        y = y + y_spacing;
        blk3 = [libPath '/Door_Tracker'];
        add_block('built-in/SubSystem', blk3);
        set_param(blk3, 'Position', [x, y, x+w, y+h]);
        add_block('built-in/Inport', [blk3 '/zone_map'], 'Position', [20, 20, 40, 40]);
        add_block('built-in/Inport', [blk3 '/occ_grid'], 'Position', [20, 60, 40, 80]);
        add_block('built-in/Outport', [blk3 '/detected_exits'], 'Position', [300, 30, 320, 50]);
        add_block('built-in/Outport', [blk3 '/entry_exit_log'], 'Position', [300, 70, 320, 90]);
        
        %% BLOCK 4: Door Crossing (FR-DOOR-02)
        y = y + y_spacing;
        blk4 = [libPath '/Door_Crossing_Detector'];
        add_block('built-in/SubSystem', blk4);
        set_param(blk4, 'Position', [x, y, x+w, y+h]);
        add_block('built-in/Inport', [blk4 '/pose'], 'Position', [20, 20, 40, 40]);
        add_block('built-in/Inport', [blk4 '/doorway_pos'], 'Position', [20, 60, 40, 80]);
        add_block('built-in/Outport', [blk4 '/crossed_flag'], 'Position', [300, 40, 320, 60]);
        
        %% BLOCK 5: Continuous Energy Monitor (FR-BAT-01, FR-BAT-03)
        x = x + w + 100; y = 50;
        blk5 = [libPath '/Continuous_Energy_Monitor'];
        add_block('built-in/SubSystem', blk5);
        set_param(blk5, 'Position', [x, y, x+w, y+h]);
        add_block('built-in/Inport', [blk5 '/battery_level'], 'Position', [20, 15, 40, 35]);
        add_block('built-in/Inport', [blk5 '/topo_path_energy'], 'Position', [20, 50, 40, 70]);
        add_block('built-in/Outport', [blk5 '/return_trigger'], 'Position', [300, 30, 320, 50]);
        
        %% BLOCK 6: Topology Path Planner (FR-BAT-02)
        y = y + y_spacing;
        blk6 = [libPath '/Topology_Path_Planner'];
        add_block('built-in/SubSystem', blk6);
        set_param(blk6, 'Position', [x, y, x+w, y+h]);
        add_block('built-in/Inport', [blk6 '/topo_graph'], 'Position', [20, 15, 40, 35]);
        add_block('built-in/Inport', [blk6 '/current_room'], 'Position', [20, 50, 40, 70]);
        add_block('built-in/Outport', [blk6 '/room_sequence'], 'Position', [300, 30, 320, 50]);
        add_block('built-in/Outport', [blk6 '/exit_hopping_seq'], 'Position', [300, 70, 320, 90]);
        
        %% BLOCK 7: Wall-Respecting A* Planner (FR-RETURN-01, FR-RETURN-02)
        y = y + y_spacing;
        blk7 = [libPath '/A_Star_Planner_Fallback'];
        add_block('built-in/SubSystem', blk7);
        set_param(blk7, 'Position', [x, y, x+w, y+h]);
        add_block('built-in/Inport', [blk7 '/start_goal'], 'Position', [20, 15, 40, 35]);
        add_block('built-in/Inport', [blk7 '/inflated_grid'], 'Position', [20, 50, 40, 70]);
        add_block('built-in/Outport', [blk7 '/safe_path'], 'Position', [300, 40, 320, 60]);
        
        % Save model to disk
        save_system(modelName);
        close_system(modelName);
        fprintf('Successfully exported %s.slx!\n', modelName);
        
    catch ME
        fprintf('Error generating Simulink model: %s\n', ME.message);
    end
end
