export interface ValidationResult {
  isValid: boolean;
  errorTitle?: string;
  errors: string[];
  detectedType?: string;
  sanitizedData?: any;
}

export function validateImportedJson(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (data === null || data === undefined) {
    return {
      isValid: false,
      errorTitle: 'Empty JSON File',
      errors: ['The selected file is empty or null.']
    };
  }

  if (typeof data !== 'object' || Array.isArray(data)) {
    return {
      isValid: false,
      errorTitle: 'Invalid Root Structure',
      errors: [`JSON root must be an Object '{}' (found ${Array.isArray(data) ? 'Array' : typeof data}).`]
    };
  }

  const obj = data as Record<string, any>;

  // Check array properties
  const arrayFields = [
    'states', 'junctions', 'transitions', 'layers', 'variables',
    'blocks', 'relationships', 'parts', 'connectors', 'interfaceRealizations',
    'hmiComponents', 'vlabNodes', 'vlabEdges', 'globalXBridgesNodes',
    'globalXBridgesEdges', 'entropyNodes', 'entropyEdges', 'workspaceFiles', 'openTabs'
  ];

  for (const field of arrayFields) {
    if (field in obj && obj[field] !== undefined && !Array.isArray(obj[field])) {
      errors.push(`Field '${field}' must be an array (found ${typeof obj[field]}).`);
    }
  }

  // Validate Node Entities if arrays exist
  if (Array.isArray(obj.states)) {
    obj.states.forEach((st: any, idx: number) => {
      if (!st || typeof st !== 'object') {
        errors.push(`states[${idx}] must be a valid object.`);
      } else if (!st.id || (typeof st.id !== 'string' && typeof st.id !== 'number')) {
        errors.push(`states[${idx}] missing required string/number 'id'.`);
      } else if (st.position) {
        if (typeof st.position.x === 'number' && (Number.isNaN(st.position.x) || !Number.isFinite(st.position.x))) {
          errors.push(`states[${idx}] position.x is invalid number.`);
        }
        if (typeof st.position.y === 'number' && (Number.isNaN(st.position.y) || !Number.isFinite(st.position.y))) {
          errors.push(`states[${idx}] position.y is invalid number.`);
        }
      }
    });
  }

  if (Array.isArray(obj.blocks)) {
    obj.blocks.forEach((blk: any, idx: number) => {
      if (!blk || typeof blk !== 'object') {
        errors.push(`blocks[${idx}] must be a valid object.`);
      } else if (!blk.id) {
        errors.push(`blocks[${idx}] missing required 'id'.`);
      }
    });
  }

  if (Array.isArray(obj.vlabNodes)) {
    obj.vlabNodes.forEach((nd: any, idx: number) => {
      if (!nd || typeof nd !== 'object') {
        errors.push(`vlabNodes[${idx}] must be a valid object.`);
      } else if (nd.x !== undefined && (!Number.isFinite(nd.x) || Number.isNaN(nd.x))) {
        errors.push(`vlabNodes[${idx}] contains invalid coordinate 'x'.`);
      }
    });
  }

  // Validate DOE suite structure if present
  if (obj.doe !== undefined) {
    if (typeof obj.doe !== 'object' || obj.doe === null || Array.isArray(obj.doe)) {
      errors.push("Field 'doe' must be an object.");
    } else {
      if (obj.doe.headers !== undefined && !Array.isArray(obj.doe.headers)) {
        errors.push("Field 'doe.headers' must be an array.");
      }
      if (obj.doe.data !== undefined && !Array.isArray(obj.doe.data)) {
        errors.push("Field 'doe.data' must be an array.");
      }
    }
  }

  // Detect Type
  let detectedType = 'project';
  if (obj.globalXBridgesNodes || obj.globalXBridgesEdges) detectedType = 'xbridges';
  else if (obj.vlabNodes || obj.vlabEdges) detectedType = 'vlab';
  else if (obj.states || obj.junctions || obj.transitions) detectedType = 'statemachine';
  else if (obj.entropyNodes || obj.entropyEdges) detectedType = 'entropy';
  else if (obj.hmiComponents) detectedType = 'hmi';
  else if (obj.headers || obj.activeModel || obj.deploymentModel || (obj.schemaVersion === 1 && (obj.modelType || obj.rsm || obj.gmdh || obj.taguchi))) detectedType = 'doe';
  else if (obj.target || obj.clockSpeed) detectedType = 'hil';
  else if (obj.parts || obj.connectors) detectedType = 'ibd';
  else if (obj.blocks) {
    const hasReq = obj.blocks.some((b: any) => b && b.stereotype === 'requirement');
    detectedType = hasReq ? 'requirements' : 'bdd';
  }

  // Final check: if no recognizeable keys at all
  const hasRecognizedKeys = Boolean(
    obj.projectName || obj.workspaceFiles || obj.openTabs ||
    arrayFields.some(f => f in obj) || obj.doe || obj.hilConfig ||
    obj.headers || obj.activeModel || obj.deploymentModel ||
    (obj.schemaVersion && obj.modelType)
  );

  if (!hasRecognizedKeys) {
    errors.push('Unrecognized File Format: JSON file does not contain valid ADIA project or module structures.');
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errorTitle: 'Corrupted File Structure',
      errors,
      detectedType
    };
  }

  return {
    isValid: true,
    errors: [],
    detectedType,
    sanitizedData: obj
  };
}
