/** @module omega-target/utils */

// MV3 CSP: Native Promise (Bluebird uses new Function())
// Note: Cannot re-export global 'Promise', so consumers use it directly
export const NativePromise = Promise;
