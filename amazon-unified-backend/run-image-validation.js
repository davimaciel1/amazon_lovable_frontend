// Runs weekly image validation to replace placeholders using order_items images where possible
require('ts-node/register/transpile-only');
const { imageValidator } = require('./src/services/image-validator.service');

(async () => {
  try {
    console.log('🔎 Starting weekly image validation & fix...');
    const result = await imageValidator.validateAndFixAll();
    console.log('✅ Validation complete:', result);
    process.exit(0);
  } catch (e) {
    console.error('❌ Validation failed:', e?.message || e);
    process.exit(1);
  }
})();

