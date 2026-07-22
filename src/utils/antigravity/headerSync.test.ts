import { describe, it, expect } from 'vitest';
import { synchronizeHeaders } from './headerSync';

describe('headerSync - RETURN_TYPE_SANITY & HEADER_SYNC Protocols', () => {
  it('should synchronize function prototypes between header and source', () => {
    const header = `void SM_Init(ADIA_Instance_t instance);`;
    const source = `void SM_Init(ADIA_Instance_t* instance) { instance->current_state = 0U; }`;

    const res = synchronizeHeaders(header, source);
    expect(res.header).toContain('void SM_Init(ADIA_Instance_t* instance);');
  });

  it('should change struct return type to const SM_Data_t* when returning NULL', () => {
    const header = `SM_Data_t SM_GetData(ADIA_Instance_t* instance);`;
    const source = `SM_Data_t SM_GetData(ADIA_Instance_t* instance) { return NULL; }`;

    const res = synchronizeHeaders(header, source);
    expect(res.header).toContain('const SM_Data_t* SM_GetData(ADIA_Instance_t* instance);');
    expect(res.source).toContain('const SM_Data_t* SM_GetData(ADIA_Instance_t* instance)');
  });
});
