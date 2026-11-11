// `requireOptionalNativeModule` returns null in Expo Go / web / older builds,
// so the UI can explain that the feature needs a development build instead of
// crashing on a missing native module.
export {
  default,
  getActiveAppIcon,
  isAppIconNative,
  setActiveAppIcon,
  type DisguiseIcon,
} from './src/AppIcon';
