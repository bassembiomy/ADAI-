### States (activityIndex order)

| # | state id | C enum | parent state | layer | activeSlot | depth | entry | during | exit |
|---|---|---|---|---|---|---|---|---|---|
| 0 | heater | `SM_ST_HEATER` | — | root | 0 | 0 | "heat_cycles = 0U;" | "heat_cycles = heat_cycles + 1U;" | "" |
| 1 | standby | `SM_ST_STANDBY` | heater | heater_children | 1 | 1 | "duty_cmd = 0U;" | "" | "" |
| 2 | warming | `SM_ST_WARMING` | heater | heater_children | 1 | 1 | "duty_cmd = 250U;" | "" | "duty_cmd = 0U;" |
| 3 | pwm_bank | `SM_ST_PWM_BANK` | warming | warming_regions | -1 | 2 | "" | "" | "" |
| 4 | pwm_low | `SM_ST_PWM_LOW` | pwm_bank | pwm_children | 2 | 3 | "" | "duty_cmd = duty_cmd + 1U;" | "" |
| 5 | pwm_high | `SM_ST_PWM_HIGH` | pwm_bank | pwm_children | 2 | 3 | "" | "duty_cmd = duty_cmd + 5U;" | "" |
| 6 | fan_bank | `SM_ST_FAN_BANK` | warming | warming_regions | -1 | 2 | "" | "" | "" |
| 7 | fan_low | `SM_ST_FAN_LOW` | fan_bank | fan_children | 3 | 3 | "" | "" | "" |
| 8 | fan_high | `SM_ST_FAN_HIGH` | fan_bank | fan_children | 3 | 3 | "" | "" | "" |
| 9 | overheat | `SM_ST_OVERHEAT` | — | root | 0 | 0 | "duty_cmd = 0U;" | "" | "" |

Active-slot count: **4**

### Layers

| layer | decomposition | parent state | children | activeSlot | default entry |
|---|---|---|---|---|---|
| root | OR | (root) | heater, overheat | 0 | heater (state) |
| heater_children | OR | heater | standby, warming | 1 | standby (state) |
| warming_regions | AND | warming | pwm_bank, fan_bank | none | — (—) |
| pwm_children | OR | pwm_bank | pwm_low, pwm_high | 2 | pwm_low (state) |
| fan_children | OR | fan_bank | fan_low, fan_high | 3 | fan_low (state) |

### Junctions

| junction | kind | owning layer |
|---|---|---|
| heater_history | deep-history | heater_children |

### Transitions (lowered)

| transition | source | destination | kind | trigger | guard | exit set | entry set | routes |
|---|---|---|---|---|---|---|---|---|
| begin_warmup | standby (state) | warming (state) | outer/external | condition | `start_cmd` | standby | warming | [begin_warmup → state:warming] |
| pwm_step_up | pwm_low (state) | pwm_high (state) | outer/external | after afterTicks=20 @200ms | `(none)` | pwm_low | pwm_high | [pwm_step_up → state:pwm_high] |
| fan_step_up | fan_low (state) | fan_high (state) | outer/external | condition | `start_cmd` | fan_low | fan_high | [fan_step_up → state:fan_high] |
| resume_heater | overheat (state) | heater_history (junction) | outer/external | condition | `stop_cmd` | overheat | heater | [resume_heater → history:heater_history] |
| trip_overheat | heater (state) | overheat (state) | outer/external | condition | `over_temperature` | heater | overheat | [trip_overheat → state:overheat] |
