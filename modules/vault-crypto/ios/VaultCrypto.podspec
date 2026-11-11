Pod::Spec.new do |s|
  s.name           = 'VaultCrypto'
  s.version        = '0.1.0'
  s.summary        = 'Native PBKDF2 for the HideMe vault'
  s.description    = 'Native PBKDF2-HMAC-SHA256 for the HideMe vault PIN.'
  s.license        = 'MIT'
  s.author         = 'HideMe'
  s.homepage       = 'https://github.com/sakibfakir/hideme'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4',
  }
  s.swift_version  = '6.0'
  s.source         = { git: 'https://github.com/sakibfakir/hideme' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
