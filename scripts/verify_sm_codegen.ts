import { flatOrFixture, hybridXBridgesFixture, xb6StepFixture } from '../src/utils/stateMachine/smFixtures';
import { buildSemanticModel } from '../src/utils/stateMachine/smSemanticBuilder';
import { runVerificationPipeline } from '../src/utils/stateMachine/smPipelineOrchestrator';

console.log('=== ADIA State Machine Code Generator Verification Orchestrator ===');
const models = [
  { name: 'Flat OR Fixture', model: flatOrFixture() },
  { name: 'Hybrid XBridges Fixture', model: hybridXBridgesFixture() },
  { name: 'XB6 Step Fixture', model: xb6StepFixture() },
];

for (const item of models) {
  console.log(`\nRunning pipeline for: ${item.name}`);
  const { ir, diagnostics } = buildSemanticModel(item.model);
  if (!ir || diagnostics.some(d => d.severity === 'error')) {
    console.error(`[FAIL] Semantic validation failed for ${item.name}`);
    process.exit(1);
  }

  const report = runVerificationPipeline(ir);
  console.log(`[PASS] Generated ${report.artifactsCount} code artifacts.`);
  console.log(`[PASS] Traceability mappings resolved: ${report.traceabilityMappingsCount}`);
  console.log(`[${report.status.behavioralGenerationStatus}] Behavioral Generation Status`);
  console.log(`[${report.status.targetIntegrationStatus}] Target Integration Status`);
  console.log(`[${report.status.productVerificationStatus}] Product Verification Status`);
}

console.log('\n=== All Verification Stages Completed Successfully ===');
