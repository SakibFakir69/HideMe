// On web the module is absent and `requireOptionalNativeModule` returns null;
// callers fall back to the pure-JS PBKDF2 implementation.
export { default, isNativePbkdf2Available, nativePbkdf2 } from './src/VaultCrypto';
