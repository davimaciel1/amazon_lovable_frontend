require('dotenv').config();
const { ImageValidatorService } = require('../dist/services/image-validator.service');

(async () => {
  try {
    const svc = ImageValidatorService.getInstance();
    const res = await svc.validateAndFixAll();
    console.log('Validation result:', res);
  } catch (e) {
    console.error('Image validator run error:', e?.message || e);
    process.exit(1);
  }
})();

