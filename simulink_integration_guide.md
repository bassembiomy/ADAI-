# Autonomous Vacuum Cleaner — Simulink Integration Reference

This guide provides the mathematical model definitions and Simulink block mappings for integrating the Autonomous Vacuum Cleaner Digital Twin upgraded functional blocks into Simulink.

---

## 1. Reference Architecture Mapping

The navigation and planning system is mapped to Simulink subsystems as follows:

| Physical Module / Algorithmic Concept | Simulink Block Mapping | Toolbox Prerequisite |
| :--- | :--- | :--- |
| **Boustrophedon Sweep Planner** | Custom MATLAB Function block | Simulink Coder (optional) |
| **Boundary Erosion & Dilation** | Custom MATLAB Function / 2D Conv block | Image Processing Toolbox (or custom convolution) |
| **Doorway & Exit Tracker** | Stateflow Chart / MATLAB Function | Sensor Fusion / Navigation Toolbox |
| **Continuous Energy Monitor** | MATLAB Function / Bus Creator | Simulink Base |
| **Topology Path Planner** | Stateflow Chart / Dijkstra Block | Navigation Toolbox |
| **A\* Waypoint Planner** | Path Planner block / Custom S-Function | Navigation Toolbox |

---

## 2. Mathematical Models for Custom Blocks

### BLOCK 1: Boustrophedon Sweep Planner
* **Description**: Generates lawn-mower sweep waypoints within a room boundary mask.
* **Inputs**:
  - `room_mask`: `[Ny x Nx]` binary matrix
  - `robot_radius`: `double` (m)
* **Outputs**:
  - `sweep_waypoints`: `[M x 2]` matrix of coordinates `(x, y)`
* **Mathematical Model**:
  $$\Delta y = 1.8 \cdot r_{robot}$$
  For each row $y_i$ in the eroded room bounding box:
  $$x_{\text{start}}, x_{\text{end}} = \text{find\_boundary}(M_{\text{eroded}}, y_i)$$
  $$\mathbf{w}_i = \begin{cases} 
  [x_{\text{start}}, y_i] \to [x_{\text{end}}, y_i] & \text{if } i \text{ is odd} \\
  [x_{\text{end}}, y_i] \to [x_{\text{start}}, y_i] & \text{if } i \text{ is even} 
  \end{cases}$$

---

### BLOCK 2: Room Mask Erosion
* **Description**: Erodes a binary grid using a circular structuring element to ensure the robot never collides with walls.
* **Inputs**:
  - `grid_mask`: `[Ny x Nx]` binary matrix (1 = inside room/free space, 0 = wall/obstacle)
  - `radius`: `double` (erosion radius in meters)
* **Outputs**:
  - `eroded_mask`: `[Ny x Nx]` binary matrix
* **Mathematical Model**:
  $$\mathbf{K}(u,v) = \begin{cases} 1 & \text{if } u^2 + v^2 \le \left(\frac{r}{\Delta g}\right)^2 \\ 0 & \text{otherwise} \end{cases}$$
  $$C(y,x) = \sum_{u,v} M_{\text{grid}}(y+u, x+v) \cdot \mathbf{K}(u,v)$$
  $$M_{\text{eroded}}(y,x) = \begin{cases} 1 & \text{if } C(y,x) \ge \sum \mathbf{K} \\ 0 & \text{otherwise} \end{cases}$$

---

### BLOCK 3: Doorway & Exit Tracker
* **Description**: Detects exits (doorways) connecting different room partitions and validates their widths.
* **Inputs**:
  - `zone_map`: `[Ny x Nx]` matrix of room IDs (integers $> 1$)
  - `occ_grid`: `[Ny x Nx]` occupancy grid (0 = free, 1 = occupied)
* **Outputs**:
  - `detected_exits`: Bus containing coordinates and connectivity of exits
  - `entry_exit_log`: List of traversed doorways
* **Mathematical Model**:
  For room zones $A$ and $B$:
  $$\mathbf{B}_{A,B} = \{ (y,x) \mid \text{zone}(y,x) == A \text{ and } \exists \text{ 4-neighbor } (y',x') \text{ where } \text{zone}(y',x') == B \}$$
  Contiguous clusters in $\mathbf{B}_{A,B}$ where $\text{occ\_grid} == 0$ represent potential doorways.
  $$\text{width} = (\text{cluster\_diameter} + 1) \cdot \Delta g$$
  $$\text{exit\_valid} = \begin{cases} 1 & \text{if } \text{width} \ge 2.0 \cdot r_{robot} \\ 0 & \text{otherwise} \end{cases}$$

---

### BLOCK 4: Door Crossing Detector
* **Description**: Evaluates when the robot has physically crossed a doorway boundaries.
* **Inputs**:
  - `pose`: `[x; y; theta]` (3x1 vector)
  - `doorway_pos`: `[x, y]` (exit midpoint)
* **Outputs**:
  - `crossed`: `boolean`
* **Mathematical Model**:
  $$\text{robot\_zone} = \text{zone\_map}(\text{round}(y_{pose}/\Delta g), \text{round}(x_{pose}/\Delta g))$$
  $$\text{crossed} = \begin{cases} \text{true} & \text{if } \text{robot\_zone} == \text{target\_room} \\ \text{false} & \text{otherwise} \end{cases}$$

---

### BLOCK 5: Continuous Energy Monitor
* **Description**: Compares battery capacity against estimated topological return path requirements.
* **Inputs**:
  - `battery_level`: `double` ($0 \dots 1$)
  - `topo_path_energy`: `double` (calculated required return energy)
* **Outputs**:
  - `return_trigger`: `boolean`
* **Mathematical Model**:
  $$E_{\text{req}} = 1.25 \cdot \left( \sum_{i=1}^{K-1} \|\mathbf{d}_i - \mathbf{d}_{i+1}\| + \|\mathbf{p}_{\text{robot}} - \mathbf{d}_1\| + \|\mathbf{d}_K - \mathbf{p}_{\text{dock}}\| \right) \cdot \alpha_E$$
  $$\text{trigger} = \begin{cases} 1 & \text{if } E_{\text{battery}} - E_{\text{req}} < E_{\text{safety\_margin}} \\ 0 & \text{otherwise} \end{cases}$$

---

## 3. Programmatic Model Generation

The program [generate_simulink_model.m](file:///g:/adia%20project/generate_simulink_model.m) creates the [vacuum_cleaner_twin.slx](file:///g:/adia%20project/vacuum_cleaner_twin.slx) Simulink model using the following API sequence:

1. **System Initialization**:
   ```matlab
   new_system('vacuum_cleaner_twin');
   ```
2. **Subsystem Building**:
   ```matlab
   add_block('built-in/SubSystem', 'vacuum_cleaner_twin/Navigation_and_Autonomous_Library');
   ```
3. **Block Creation & Positioning**:
   ```matlab
   add_block('built-in/SubSystem', 'vacuum_cleaner_twin/Navigation_and_Autonomous_Library/Boustrophedon_Sweep');
   set_param(blk, 'Position', [x, y, x+w, y+h]);
   ```
4. **Port Configuration**:
   ```matlab
   add_block('built-in/Inport', [blk '/room_mask']);
   add_block('built-in/Outport', [blk '/sweep_waypoints']);
   ```
5. **Model Save & Export**:
   ```matlab
   save_system('vacuum_cleaner_twin');
   ```
