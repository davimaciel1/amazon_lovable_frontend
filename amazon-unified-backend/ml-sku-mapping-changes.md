# ML SKU Mapping Corrections

## Changes Required

Based on the analysis, the following SKU mapping correction is needed:

### IPAS01 - Critical Change Required ❗

- **Current (Incorrect)**: `MLB5677833500`
- **Corrected**: `MLBU3406999311` ✅
- **Product**: Arame de Solda MIG Tubular 0.8mm 1kg IPPAX
- **Issue**: The current mapping points to the wrong product

### IPAS04 - No Change Needed ✅

- **Current**: `MLB5321963088`
- **Status**: Correct ✅
- **Product**: Arame de Solda MIG Tubular 0.9mm 1kg IPPAX

### IPP-PV-02 - No Change Needed ✅

- **Current**: `MLB5308377982`
- **Status**: Correct ✅
- **Product**: Chapa Perfurada PVC Vazada

## Implementation Steps

1. Update the `ML_SKU_MAPPING` object in `src/routes/images.routes.ts`
2. Change IPAS01 mapping from `MLB5677833500` to `MLBU3406999311`
3. Test the image proxy to ensure correct images are served
4. Verify the new URL returns the expected product image

## Files to Update

- `amazon-unified-backend/src/routes/images.routes.ts`

## Verification

After implementing the changes:
1. Test URL: `/app/product-images/SVBBUzAx.jpg`
2. Should return the image from: `MLBU3406999311`
3. Verify it matches the correct IPAS01 product (0.8mm welding wire)