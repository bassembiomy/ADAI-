import type { BlockHelpEntry } from '../types';
import { FLUID_MA } from './vlabC/fluidMA';
import { APPLIANCES } from './vlabC/appliances';
import { UTILITIES } from './vlabC/utilities';
import { FLUID_STEAM } from './vlabC/fluidSteam';
import { ISOTHERMAL } from './vlabC/isothermal';

/**
 * V-Lab block help, partition C: Fluid (moist air), Consumer Appliances, Microwave & Cooking,
 * Utilities, Fluid / Steam, DOE Models and Isothermal Liquid.
 */
export const VLAB_HELP_C: Record<string, BlockHelpEntry> = {
  ...FLUID_MA,
  ...APPLIANCES,
  ...UTILITIES,
  ...FLUID_STEAM,
  ...ISOTHERMAL,
};
