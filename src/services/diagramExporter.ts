// src/services/diagramExporter.ts
import html2canvas from 'html2canvas';
import type { AdiaExportItem, AdiaExportType } from '../types/threeDX_types';

/**
 * Captures an HTML element by its DOM selector and returns a base64 encoded PNG AdiaExportItem.
 */
export async function captureElementAsPng(
  selector: string,
  type: AdiaExportType,
  label: string,
  defaultFileName: string
): Promise<AdiaExportItem> {
  const element = document.querySelector(selector);
  if (!element) {
    return {
      type,
      fileName: defaultFileName,
      label,
      content: '',
      mimeType: 'image/png',
      encoding: 'base64',
      available: false,
    };
  }

  try {
    // Hide controls or interactive overlays if needed during capture
    const canvas = await html2canvas(element as HTMLElement, {
      backgroundColor: '#0c0c10',
      scale: 2, // Retain high-res quality
      logging: false,
      useCORS: true,
      ignoreElements: (el) => {
        // Ignore React Flow control buttons or zoom overlays
        return el.classList.contains('react-flow__controls') || el.classList.contains('react-flow__minimap');
      }
    });

    const dataUrl = canvas.toDataURL('image/png');
    const base64Content = dataUrl.split(',')[1]; // Strip "data:image/png;base64," header

    return {
      type,
      fileName: defaultFileName,
      label,
      content: base64Content,
      mimeType: 'image/png',
      encoding: 'base64',
      available: true,
    };
  } catch (err) {
    console.error(`Failed to capture diagram ${type}:`, err);
    return {
      type,
      fileName: defaultFileName,
      label,
      content: '',
      mimeType: 'image/png',
      encoding: 'base64',
      available: false,
    };
  }
}

/**
 * Serializes raw JSON content to an export item.
 */
export function exportJsonItem(
  type: AdiaExportType,
  label: string,
  fileName: string,
  contentObj: unknown
): AdiaExportItem {
  try {
    const jsonStr = JSON.stringify(contentObj, null, 2);
    // Convert string to base64
    const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
    return {
      type,
      fileName,
      label,
      content: b64,
      mimeType: 'application/json',
      encoding: 'base64',
      available: true,
    };
  } catch (err) {
    console.error(`Failed to export JSON ${type}:`, err);
    return {
      type,
      fileName,
      label,
      content: '',
      mimeType: 'application/json',
      encoding: 'base64',
      available: false,
    };
  }
}
