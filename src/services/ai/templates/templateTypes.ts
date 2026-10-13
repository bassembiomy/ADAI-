export interface TemplateQuestion {
  key: string;
  question: string;
  recommendedDefault?: string;
  rationale: string;
  options?: string[];
  isCritical?: boolean;
}

export interface RecommendedBlockRole {
  role: string;
  preferredBlockId: string;
  category: string;
  domain: string;
  rationale: string;
}

export interface TemplateValidationCriterion {
  id: string;
  description: string;
  metric: string;
  operator: '==' | '!=' | '<' | '<=' | '>' | '>=';
  targetValue: string | number | boolean;
  unit?: string;
}

export interface EngineeringSystemTemplate {
  id: string;
  name: string;
  targetDomain: 'vlab' | 'xbridges' | 'sysml';
  triggerKeywords: string[];
  description: string;
  requiredQuestions: TemplateQuestion[];
  defaultAssumptions: Array<{ key: string; value: string | number | boolean; rationale: string }>;
  recommendedRoles: RecommendedBlockRole[];
  validationCriteria: TemplateValidationCriterion[];
}
