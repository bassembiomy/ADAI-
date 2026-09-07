export interface OpmExample {
  name: string;
  description: string;
  oplText: string;
}

export const OPM_EXAMPLES: Record<string, OpmExample> = {
  smartHome: {
    name: "Smart Home System",
    description: "ISO 19450 standard smart home model: an occupant triggers heating when temperature monitoring detects cold conditions, altering the physical heating unit state from Off to Heating.",
    oplText: `Object Home_System consists of Temperature_Sensor and Heating_Unit.
Object Home_System is physical.
Object Temperature_Sensor is physical.
Object Heating_Unit is physical.
Object Occupant is physical.
Object Heating_Unit has states Off, Heating.
Process Monitor_Temperature.
Process Toggle_Heating.
Occupant executes Toggle_Heating.
Temperature_Sensor executes Monitor_Temperature.
Monitor_Temperature triggers Toggle_Heating.
Toggle_Heating changes Heating_Unit from Off to Heating.`
  },
  cruiseControl: {
    name: "Automotive Cruise Control",
    description: "ISO 19450 standard automotive cruise control: driver regulates throttle according to vehicle speed measurements, altering the engine controller state from Inactive to Active.",
    oplText: `Object Cruise_Control_System consists of Speed_Sensor and Engine_Controller.
Object Cruise_Control_System is physical.
Object Speed_Sensor is physical.
Object Engine_Controller is physical.
Object Driver is physical.
Object Engine_Controller has states Inactive, Active.
Process Measure_Speed.
Process Regulate_Throttle.
Driver executes Regulate_Throttle.
Speed_Sensor executes Measure_Speed.
Measure_Speed triggers Regulate_Throttle.
Regulate_Throttle changes Engine_Controller from Inactive to Active.`
  },
  smartAirFryer: {
    name: "Professional Steam Air Fryer",
    description: "ISO 19450 dual-heating steam air fryer: user interface, thermal chamber, steam subsystem, NTC sensors, and actuator state management with automatic safety shutdown.",
    oplText: `Object Steam_Air_Fryer consists of User_Interface, Thermal_Chamber, and Steam_Subsystem.
Object User_Interface consists of Power_Button and Chamber_Display.
Object Thermal_Chamber consists of Convection_Fan, Air_Heater, and NTC_Sensor.
Object Steam_Subsystem consists of Water_Reservoir, Water_Pump, and Steam_Generator.
Object Steam_Air_Fryer is physical.
Object User_Interface is physical.
Object Thermal_Chamber is physical.
Object Steam_Subsystem is physical.
Object Power_Button is physical.
Object Convection_Fan is physical.
Object Air_Heater is physical.
Object Steam_Generator is physical.
Object Water_Pump is physical.
Object NTC_Sensor is physical.
Object Water_Reservoir is physical.
Object Power_Button has states Off, On.
Object Menu_Mode has states Manual_Mode, Auto_Menu.
Object Auto_Program has states Fries_Prog, Chicken_Prog, Bake_Prog.
Object Operation_Status has states Idle, Cooking, Paused.
Object NTC_Sensor has states Cold_Temp, Cooking_Temp, Overheat_Temp.
Object Water_Reservoir has states Water_Low, Water_Ok.
Object Convection_Fan has states Fan_Off, Fan_On.
Object Air_Heater has states Heater_Off, Heater_On.
Object Steam_Generator has states Steam_Off, Steam_On.
Object Water_Pump has states Pump_Off, Pump_On.
Object Chamber_Display has states Disp_Off, Disp_Ready, Disp_Heat, Disp_Steam, Disp_Done.
Process Power_On.
Process Select_Mode.
Process Choose_Program.
Process Press_Start.
Process Control_Actuators.
Process Safety_Shutdown.
Power_On changes Power_Button from Off to On.
Select_Mode changes Menu_Mode from Manual_Mode to Auto_Menu.
Choose_Program changes Auto_Program from Fries_Prog to Chicken_Prog.
Press_Start changes Operation_Status from Idle to Cooking.
Operation_Status in state Cooking conditions Control_Actuators.
Menu_Mode in state Auto_Menu conditions Control_Actuators.
Water_Reservoir in state Water_Ok conditions Control_Actuators.
Control_Actuators changes Convection_Fan from Fan_Off to Fan_On.
Control_Actuators changes Air_Heater from Heater_Off to Heater_On.
Control_Actuators changes Water_Pump from Pump_Off to Pump_On.
Control_Actuators changes Steam_Generator from Steam_Off to Steam_On.
Control_Actuators changes Chamber_Display from Disp_Ready to Disp_Steam.
NTC_Sensor in state Cooking_Temp triggers Control_Actuators.
NTC_Sensor in state Overheat_Temp triggers Safety_Shutdown.
Safety_Shutdown changes Operation_Status from Cooking to Idle.
Safety_Shutdown changes Power_Button from On to Off.`
  }
};

