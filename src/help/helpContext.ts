import { useEffect, useRef } from 'react';
import { findHelpFeature } from './helpFeatures';
import { resolveModuleHelp } from './helpNavigation';

const sysmlModes = new Set(['bdd', 'ibd', 'requirements', 'rtm', 'package', 'useCase', 'activity', 'sequence', 'parametric']);
const controlSelector = '[data-help-feature],[data-help-topic],button,input,select,textarea,[role="menuitem"],[role="button"],[role="checkbox"]';

export function useContextualHelp(mode: string, openHelp: (topicId: string, sectionId?: string) => void) {
  const hovered = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onPointerOver = (event: PointerEvent) => { hovered.current = event.target instanceof Element ? event.target.closest<HTMLElement>(controlSelector) : null; };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F1') return;
      event.preventDefault(); event.stopImmediatePropagation();
      const focus = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>(controlSelector) : null;
      const control = focus ?? hovered.current;
      const explicit = control?.closest<HTMLElement>('[data-help-topic],[data-help-feature]');
      if (explicit?.dataset.helpTopic) { openHelp(explicit.dataset.helpTopic, explicit.dataset.helpSection); return; }
      const feature = findHelpFeature({
        featureId: explicit?.dataset.helpFeature,
        label: control?.getAttribute('aria-label') ?? control?.getAttribute('title') ?? control?.textContent ?? undefined,
        sourcePath: control?.closest<HTMLElement>('[data-help-source]')?.dataset.helpSource,
        module: control?.closest<HTMLElement>('[data-help-module]')?.dataset.helpModule ?? (sysmlModes.has(mode) ? 'sysml' : mode),
      });
      openHelp(feature?.topicId ?? resolveModuleHelp(mode), feature?.sectionId);
    };
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerover', onPointerOver);
    return () => { window.removeEventListener('keydown', onKeyDown, true); document.removeEventListener('pointerover', onPointerOver); };
  }, [mode, openHelp]);
}
