import type { HelpTopic } from './help/helpTypes';
import { ADDITIONAL_HELP_TOPICS, HELP_TOPIC_CORRECTIONS } from './help/moduleTopics';
import { HELP_FEATURE_TOPICS } from './help/helpFeatures';
import { HMI_HELP_TOPICS } from './help/hmiTopics';
import { LEGACY_TOPIC_CORRECTIONS } from './help/legacyTopicCorrections';
import { attachHelpDiagrams } from './help/helpDiagrams';
import { attachReferenceTopics } from './help/referenceTopics';
import { getHelpInspectorSchemas } from './help/helpFeatures';
export const adia_architecture_diagram = new URL('./assets/adia_architecture_diagram_1778580699379.png', import.meta.url).href;
export const adia_vlab_simulation = new URL('./assets/adia_vlab_simulation_1778580716413.png', import.meta.url).href;
export const adia_doe_analysis = new URL('./assets/adia_doe_analysis_1778580732166.png', import.meta.url).href;
export const air_fryer_sysml = new URL('./assets/air_fryer_sysml_diagram_1778581647915.png', import.meta.url).href;
export const state_machine_guide_diagram = new URL('./assets/state_machine_guide_diagram.png', import.meta.url).href;
export const state_machine_simulation_diagram = new URL('./assets/state_machine_simulation_diagram.png', import.meta.url).href;
export const hil_architecture_diagram = new URL('./assets/hil_architecture_diagram.png', import.meta.url).href;
export const entropy_opm_architecture_diagram = new URL('./assets/entropy_opm_architecture_diagram.svg', import.meta.url).href;

/** Stable legacy keys now resolve to reviewed chapters; obsolete copy is removed. */
const reviewedTopics: Record<string,HelpTopic> = {...LEGACY_TOPIC_CORRECTIONS,...HELP_TOPIC_CORRECTIONS,...ADDITIONAL_HELP_TOPICS};
const legacyTopicOrder = [
  "software-architecture",
  "getting-started",
  "architecture-guide",
  "entropy-opm",
  "air-fryer-sysml",
  "state-machine-fundamentals",
  "state-machine-transitions",
  "state-machine-simulation",
  "state-machine-tutorial",
  "vlab-fundamentals",
  "vlab-physics",
  "vlab-fluid-dynamics",
  "vlab-blocks-reference",
  "motor-models",
  "vfd-control",
  "xbridges-ref",
  "hil-fundamentals",
  "hil-configuration",
  "hil-dashboard",
  "hil-code-generation",
  "doe-discovery",
  "code-generation",
  "industrial-automation",
  "learning-labs",
  "robot-vacuum-digital-twin"
];
export const HELP_DATA: Record<string,HelpTopic> = Object.fromEntries(legacyTopicOrder.map(id=>[id,reviewedTopics[id]]));
Object.assign(HELP_DATA,ADDITIONAL_HELP_TOPICS,HELP_FEATURE_TOPICS,HMI_HELP_TOPICS);
attachHelpDiagrams(HELP_DATA);
attachReferenceTopics(HELP_DATA, getHelpInspectorSchemas());
