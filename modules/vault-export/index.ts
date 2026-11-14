// On web (and in a build without the native module) the module is absent and
// `requireOptionalNativeModule` returns null; callers fall back to the share
// sheet, which can save to the Files app on iOS.
export { default, isSaveAsAvailable, saveAs } from './src/VaultExport';
