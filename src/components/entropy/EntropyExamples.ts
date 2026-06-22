export interface OpmExample {
  name: string;
  description: string;
  oplText: string;
}

export const OPM_EXAMPLES: Record<string, OpmExample> = {
  smartHome: {
    name: "Smart Home System",
    description: "Models an automated home environment where temperature sensors trigger heating unit state transitions.",
    oplText: `Object Home_System consists of Temperature_Sensor and Heating_Unit.
Object Temperature_Sensor is physical.
Object Heating_Unit is physical.
Object Heater_Power_State has states Off, On.
Process Monitor_Temperature.
Process Toggle_Heating.
User executes Toggle_Heating.
Temperature_Sensor executes Monitor_Temperature.
Monitor_Temperature triggers Toggle_Heating.
Toggle_Heating changes Heater_Power_State from Off to On.`
  },
  cruiseControl: {
    name: "Automotive Cruise Control",
    description: "Models an automobile cruise control loop measuring vehicle speed and regulating engine controller state.",
    oplText: `Object Cruise_Control_System consists of Speed_Sensor and Engine_Controller.
Object Speed_Sensor is physical.
Object Engine_Controller is physical.
Object Cruise_Active_State has states Inactive, Active.
Process Measure_Speed.
Process Regulate_Throttle.
Driver executes Regulate_Throttle.
Speed_Sensor executes Measure_Speed.
Measure_Speed triggers Regulate_Throttle.
Regulate_Throttle changes Cruise_Active_State from Inactive to Active.`
  },
  smartAirFryer: {
    name: "Smart Air Fryer System",
    description: "Models a connected kitchen appliance that regulates cooking state via thermal and mechanical enablers.",
    oplText: `Object Air_Fryer_System consists of Thermocouple_Sensor and Heating_Element.
Object Thermocouple_Sensor is physical.
Object Heating_Element is physical.
Object Fan_Motor is physical.
Object Cook_State has states Standby, Cooking, Completed.
Process Monitor_Heat.
Process Run_Cooking_Cycle.
Thermocouple_Sensor executes Monitor_Heat.
Monitor_Heat triggers Run_Cooking_Cycle.
Run_Cooking_Cycle changes Cook_State from Standby to Cooking.`
  }
};
