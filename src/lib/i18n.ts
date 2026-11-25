import * as Localization from 'expo-localization';
import { Platform } from 'react-native';

/**
 * Dependency-light i18n: flat string dictionaries with an English fallback.
 *
 * The language comes from the device locale; a persisted override can be
 * added later (settings row) without changing the call sites — `t()` is a
 * plain function so it also works outside React (ads, alerts, stores).
 *
 * Arabic ships as LTR text for now: enabling full RTL flips every layout and
 * needs its own audit pass (I18nManager.allowRTL + per-screen checks).
 */

export type Lang = 'en' | 'es' | 'hi' | 'pt' | 'ar';

const SUPPORTED: Lang[] = ['en', 'es', 'hi', 'pt', 'ar'];

function detectLang(): Lang {
  try {
    const locales = Localization.getLocales();
    const code = locales[0]?.languageCode?.toLowerCase();
    return code && (SUPPORTED as string[]).includes(code) ? (code as Lang) : 'en';
  } catch {
    return 'en';
  }
}

let lang: Lang = detectLang();

/** Current UI language (device locale, English fallback). */
export function getLang(): Lang {
  return lang;
}

/** The dictionaries. `en` is complete; others may fall back per key. */
const DICTS: Record<Lang, Record<string, string>> = {
  en: {
    // onboarding
    'onboarding.skip': 'Skip',
    'onboarding.p1.title': 'A calculator, nothing more',
    'onboarding.p1.body':
      'It really is one — add, subtract, divide. Nobody glancing at your screen sees a vault.',
    'onboarding.p2.title': 'Your code opens the vault',
    'onboarding.p2.body':
      'Type your secret code into the calculator to reveal an encrypted vault for photos, videos and documents. Everything stays on this device.',
    'onboarding.p3.title': 'There is no password reset',
    'onboarding.p3.body':
      'Files are encrypted with a key only your code can open. Lose the code and the files are unrecoverable — write it down somewhere safe.',
    'onboarding.cta.next': 'Continue',
    'onboarding.cta.finish': 'Set up my code',
    'onboarding.hint.swipe': 'Swipe or tap continue.',
    'onboarding.hint.finish': 'Takes about a minute.',
    'onboarding.demo.unlock': 'Vault unlocked',
    'onboarding.demo.aria': 'Demo: typing the code on the calculator opens the vault',
    'onboarding.page.aria': 'Go to page {page}',

    // setup
    'setup.title': 'Vault setup',
    'setup.alreadySet': 'A secret code is already configured.',
    'setup.securing': 'Securing your code…',
    'setup.prompt.entry': 'Choose your secret code',
    'setup.prompt.confirm': 'Re-enter to confirm',
    'setup.range': '({min}-{max} digits)',
    'setup.count': '{count} of at least {min} digits',
    'setup.action.confirm': 'Confirm',
    'setup.action.set': 'Set',
    'setup.biometric': 'Also unlock with {biometric}',
    'setup.warning':
      'Choose something memorable. If you lose this code, your files cannot be recovered.',
    'setup.openCalculator': 'Open calculator',
    'setup.error.short': 'Use at least {min} digits — {remaining} to go.',
    'setup.error.mismatch': 'Codes did not match — enter it once more.',
    'setup.error.slow':
      'Securing took too long. If you are on an emulator, try a physical device; otherwise retry.',
    'setup.error.save': 'Could not save the code.',

    // unlock success
    'welcome.badge': 'End-to-end encrypted on this device',
    'welcome.title': 'Welcome back!',
    'welcome.body': 'Your vault is now unlocked. Everything stays encrypted on this device.',
    'welcome.tip': 'The vault locks again when the app goes to the background.',
    'welcome.cta': 'Continue',
    'welcome.premium': 'Go Premium',

    // calculator gate
    'calc.locked': 'Locked · {time}',
    'calc.working': 'Working',
    'calc.error': 'Error',
    'calc.biometricPrompt': 'Unlock',

    // import
    'import.title': 'Import Files',
    'import.subtitle': 'Bring your files into HideMe',
    'import.back': 'Back',
    'import.media.title': 'Photos & Videos',
    'import.media.subtitle': 'From your photo library',
    'import.camera.title': 'Take a photo',
    'import.camera.subtitle': 'With the camera',
    'import.audio.title': 'Audio',
    'import.audio.subtitle': 'MP3, WAV, M4A, etc.',
    'import.document.title': 'Documents',
    'import.document.subtitle': 'PDF, DOCX, XLSX, TXT, etc.',
    'import.other.title': 'Other files',
    'import.other.subtitle': 'Any file type',
    'import.note':
      'Everything is encrypted on this device before it is added — nothing is uploaded.',
  },

  es: {
    'onboarding.skip': 'Omitir',
    'onboarding.p1.title': 'Una calculadora, nada más',
    'onboarding.p1.body':
      'De verdad lo es — suma, resta, divide. Nadie que mire tu pantalla ve una bóveda.',
    'onboarding.p2.title': 'Tu código abre la bóveda',
    'onboarding.p2.body':
      'Escribe tu código secreto en la calculadora para revelar una bóveda cifrada de fotos, videos y documentos. Todo se queda en este dispositivo.',
    'onboarding.p3.title': 'No hay restablecimiento de contraseña',
    'onboarding.p3.body':
      'Los archivos se cifran con una clave que solo tu código puede abrir. Si pierdes el código, no hay recuperación — anótalo en un lugar seguro.',
    'onboarding.cta.next': 'Continuar',
    'onboarding.cta.finish': 'Configurar mi código',
    'onboarding.hint.swipe': 'Desliza o toca continuar.',
    'onboarding.hint.finish': 'Toma alrededor de un minuto.',
    'onboarding.demo.unlock': 'Bóveda abierta',
    'onboarding.demo.aria': 'Demo: escribir el código en la calculadora abre la bóveda',
    'onboarding.page.aria': 'Ir a la página {page}',

    'setup.title': 'Configuración de la bóveda',
    'setup.alreadySet': 'Ya hay un código secreto configurado.',
    'setup.securing': 'Protegiendo tu código…',
    'setup.prompt.entry': 'Elige tu código secreto',
    'setup.prompt.confirm': 'Escríbelo otra vez para confirmar',
    'setup.range': '({min}-{max} dígitos)',
    'setup.count': '{count} de al menos {min} dígitos',
    'setup.action.confirm': 'Confirmar',
    'setup.action.set': 'Fijar',
    'setup.biometric': 'También desbloquear con {biometric}',
    'setup.warning':
      'Elige algo que recuerdes. Si pierdes este código, tus archivos no se pueden recuperar.',
    'setup.openCalculator': 'Abrir calculadora',
    'setup.error.short': 'Usa al menos {min} dígitos — faltan {remaining}.',
    'setup.error.mismatch': 'Los códigos no coinciden — escríbelo una vez más.',
    'setup.error.slow':
      'La protección tardó demasiado. Si estás en un emulador, prueba en un dispositivo físico; si no, reintenta.',
    'setup.error.save': 'No se pudo guardar el código.',

    'welcome.badge': 'Cifrado de extremo a extremo en este dispositivo',
    'welcome.title': '¡Bienvenido de nuevo!',
    'welcome.body': 'Tu bóveda está abierta. Todo se mantiene cifrado en este dispositivo.',
    'welcome.tip': 'La bóveda se vuelve a bloquear cuando la app pasa a segundo plano.',
    'welcome.cta': 'Continuar',
    'welcome.premium': 'Hazte Premium',

    'calc.locked': 'Bloqueada · {time}',
    'calc.working': 'Trabajando',
    'calc.error': 'Error',
    'calc.biometricPrompt': 'Desbloquear',

    'import.title': 'Importar archivos',
    'import.subtitle': 'Trae tus archivos a HideMe',
    'import.back': 'Atrás',
    'import.media.title': 'Fotos y videos',
    'import.media.subtitle': 'De tu galería',
    'import.camera.title': 'Tomar una foto',
    'import.camera.subtitle': 'Con la cámara',
    'import.audio.title': 'Audio',
    'import.audio.subtitle': 'MP3, WAV, M4A, etc.',
    'import.document.title': 'Documentos',
    'import.document.subtitle': 'PDF, DOCX, XLSX, TXT, etc.',
    'import.other.title': 'Otros archivos',
    'import.other.subtitle': 'Cualquier tipo de archivo',
    'import.note':
      'Todo se cifra en este dispositivo antes de agregarse — nada se sube a internet.',
  },

  hi: {
    'onboarding.skip': 'छोड़ें',
    'onboarding.p1.title': 'एक कैलकुलेटर, बस इतना ही',
    'onboarding.p1.body':
      'यह सच में एक कैलकुलेटर है — जोड़, घटा, भाग। आपकी स्क्रीन देखने वाले को वॉल्ट नहीं दिखेगा।',
    'onboarding.p2.title': 'आपका कोड वॉल्ट खोलता है',
    'onboarding.p2.body':
      'कैलकुलेटर में अपना सीक्रेट कोड टाइप करें — फ़ोटो, वीडियो और दस्तावेज़ों का एन्क्रिप्टेड वॉल्ट खुलेगा। सब कुछ इसी डिवाइस पर रहता है।',
    'onboarding.p3.title': 'पासवर्ड रीसेट नहीं होता',
    'onboarding.p3.body':
      'फ़ाइलें उस कुंजी से एन्क्रिप्ट हैं जो केवल आपका कोड खोल सकता है। कोड खो गया तो फ़ाइलें वापस नहीं मिलेंगी — इसे सुरक्षित जगह लिख लें।',
    'onboarding.cta.next': 'जारी रखें',
    'onboarding.cta.finish': 'मेरा कोड सेट करें',
    'onboarding.hint.swipe': 'स्वाइप करें या जारी रखें दबाएँ।',
    'onboarding.hint.finish': 'लगभग एक मिनट लगेगा।',
    'onboarding.demo.unlock': 'वॉल्ट अनलॉक है',
    'onboarding.demo.aria': 'डेमो: कैलकुलेटर में कोड टाइप करने से वॉल्ट खुलता है',
    'onboarding.page.aria': 'पेज {page} पर जाएँ',

    'setup.title': 'वॉल्ट सेटअप',
    'setup.alreadySet': 'एक सीक्रेट कोड पहले से सेट है।',
    'setup.securing': 'आपका कोड सुरक्षित हो रहा है…',
    'setup.prompt.entry': 'अपना सीक्रेट कोड चुनें',
    'setup.prompt.confirm': 'पुष्टि के लिए दोबारा लिखें',
    'setup.range': '({min}-{max} अंक)',
    'setup.count': 'कम से कम {min} अंकों में {count}',
    'setup.action.confirm': 'पुष्टि करें',
    'setup.action.set': 'सेट करें',
    'setup.biometric': '{biometric} से भी अनलॉक करें',
    'setup.warning':
      'कुछ याद रखने लायक चुनें। यह कोड खो गया तो फ़ाइलें रिकवर नहीं होंगी।',
    'setup.openCalculator': 'कैलकुलेटर खोलें',
    'setup.error.short': 'कम से कम {min} अंक डालें — {remaining} बाकी।',
    'setup.error.mismatch': 'कोड मेल नहीं खाए — एक बार और लिखें।',
    'setup.error.slow':
      'सुरक्षित करने में बहुत समय लगा। एमुलेटर पर हैं तो असली डिवाइस आज़माएँ; वरना फिर कोशिश करें।',
    'setup.error.save': 'कोड सेव नहीं हो सका।',

    'welcome.badge': 'इस डिवाइस पर एंड-टू-एंड एन्क्रिप्टेड',
    'welcome.title': 'फिर से स्वागत है!',
    'welcome.body': 'आपका वॉल्ट अनलॉक है। सब कुछ इसी डिवाइस पर एन्क्रिप्टेड रहता है।',
    'welcome.tip': 'ऐप बैकग्राउंड में जाते ही वॉल्ट फिर लॉक हो जाता है।',
    'welcome.cta': 'जारी रखें',
    'welcome.premium': 'प्रीमियम लें',

    'calc.locked': 'लॉक · {time}',
    'calc.working': 'काम हो रहा है',
    'calc.error': 'त्रुटि',
    'calc.biometricPrompt': 'अनलॉक',

    'import.title': 'फ़ाइलें इम्पोर्ट करें',
    'import.subtitle': 'अपनी फ़ाइलें HideMe में लाएँ',
    'import.back': 'वापस',
    'import.media.title': 'फ़ोटो और वीडियो',
    'import.media.subtitle': 'आपकी गैलरी से',
    'import.camera.title': 'फ़ोटो लें',
    'import.camera.subtitle': 'कैमरे से',
    'import.audio.title': 'ऑडियो',
    'import.audio.subtitle': 'MP3, WAV, M4A, आदि।',
    'import.document.title': 'दस्तावेज़',
    'import.document.subtitle': 'PDF, DOCX, XLSX, TXT, आदि।',
    'import.other.title': 'अन्य फ़ाइलें',
    'import.other.subtitle': 'कोई भी फ़ाइल',
    'import.note':
      'जोड़ने से पहले सब कुछ इसी डिवाइस पर एन्क्रिप्ट होता है — कुछ भी अपलोड नहीं होता।',
  },

  pt: {
    'onboarding.skip': 'Pular',
    'onboarding.p1.title': 'Uma calculadora, nada mais',
    'onboarding.p1.body':
      'É de verdade — soma, subtrai, divide. Ninguém que olhe sua tela vê um cofre.',
    'onboarding.p2.title': 'Seu código abre o cofre',
    'onboarding.p2.body':
      'Digite seu código secreto na calculadora para revelar um cofre criptografado de fotos, vídeos e documentos. Tudo fica neste aparelho.',
    'onboarding.p3.title': 'Não existe redefinição de senha',
    'onboarding.p3.body':
      'Os arquivos são criptografados com uma chave que só o seu código abre. Perdeu o código, perdeu os arquivos — anote em um lugar seguro.',
    'onboarding.cta.next': 'Continuar',
    'onboarding.cta.finish': 'Configurar meu código',
    'onboarding.hint.swipe': 'Deslize ou toque em continuar.',
    'onboarding.hint.finish': 'Leva cerca de um minuto.',
    'onboarding.demo.unlock': 'Cofre aberto',
    'onboarding.demo.aria': 'Demonstração: digitar o código na calculadora abre o cofre',
    'onboarding.page.aria': 'Ir para a página {page}',

    'setup.title': 'Configuração do cofre',
    'setup.alreadySet': 'Já existe um código secreto configurado.',
    'setup.securing': 'Protegendo seu código…',
    'setup.prompt.entry': 'Escolha seu código secreto',
    'setup.prompt.confirm': 'Digite de novo para confirmar',
    'setup.range': '({min}-{max} dígitos)',
    'setup.count': '{count} de pelo menos {min} dígitos',
    'setup.action.confirm': 'Confirmar',
    'setup.action.set': 'Definir',
    'setup.biometric': 'Também desbloquear com {biometric}',
    'setup.warning':
      'Escolha algo memorável. Se perder este código, os arquivos não podem ser recuperados.',
    'setup.openCalculator': 'Abrir calculadora',
    'setup.error.short': 'Use pelo menos {min} dígitos — faltam {remaining}.',
    'setup.error.mismatch': 'Os códigos não batem — digite mais uma vez.',
    'setup.error.slow':
      'A proteção demorou demais. Em um emulador, teste em um aparelho físico; senão, tente de novo.',
    'setup.error.save': 'Não foi possível salvar o código.',

    'welcome.badge': 'Criptografia de ponta a ponta neste aparelho',
    'welcome.title': 'Bem-vindo de volta!',
    'welcome.body': 'Seu cofre está aberto. Tudo continua criptografado neste aparelho.',
    'welcome.tip': 'O cofre volta a travar quando o app vai para o segundo plano.',
    'welcome.cta': 'Continuar',
    'welcome.premium': 'Assinar Premium',

    'calc.locked': 'Travado · {time}',
    'calc.working': 'Trabalhando',
    'calc.error': 'Erro',
    'calc.biometricPrompt': 'Desbloquear',

    'import.title': 'Importar arquivos',
    'import.subtitle': 'Traga seus arquivos para o HideMe',
    'import.back': 'Voltar',
    'import.media.title': 'Fotos e vídeos',
    'import.media.subtitle': 'Da sua galeria',
    'import.camera.title': 'Tirar uma foto',
    'import.camera.subtitle': 'Com a câmera',
    'import.audio.title': 'Áudio',
    'import.audio.subtitle': 'MP3, WAV, M4A, etc.',
    'import.document.title': 'Documentos',
    'import.document.subtitle': 'PDF, DOCX, XLSX, TXT, etc.',
    'import.other.title': 'Outros arquivos',
    'import.other.subtitle': 'Qualquer tipo de arquivo',
    'import.note':
      'Tudo é criptografado neste aparelho antes de ser adicionado — nada é enviado para a internet.',
  },

  ar: {
    'onboarding.skip': 'تخطي',
    'onboarding.p1.title': 'آلة حاسبة، لا شيء أكثر',
    'onboarding.p1.body':
      'إنها كذلك حقًا — جمع وطرح وقسمة. لن يرى أحد يلقي نظرة على شاشتك خزنةً.',
    'onboarding.p2.title': 'رمزك يفتح الخزنة',
    'onboarding.p2.body':
      'اكتب رمزك السري في الآلة الحاسبة لتظهر خزنة مشفّرة للصور والفيديوهات والمستندات. كل شيء يبقى على هذا الجهاز.',
    'onboarding.p3.title': 'لا توجد إعادة تعيين لكلمة المرور',
    'onboarding.p3.body':
      'الملفات مشفّرة بمفتاح لا يفتحه إلا رمزك. إن فقدت الرمز فلا استعادة — دوّنه في مكان آمن.',
    'onboarding.cta.next': 'متابعة',
    'onboarding.cta.finish': 'إعداد رمزي',
    'onboarding.hint.swipe': 'اسحب أو اضغط متابعة.',
    'onboarding.hint.finish': 'يستغرق نحو دقيقة.',
    'onboarding.demo.unlock': 'تم فتح الخزنة',
    'onboarding.demo.aria': 'تجربة: كتابة الرمز في الآلة الحاسبة يفتح الخزنة',
    'onboarding.page.aria': 'الانتقال إلى الصفحة {page}',

    'setup.title': 'إعداد الخزنة',
    'setup.alreadySet': 'رمز سري مهيأ مسبقًا.',
    'setup.securing': 'جارٍ تأمين رمزك…',
    'setup.prompt.entry': 'اختر رمزك السري',
    'setup.prompt.confirm': 'أعد الإدخال للتأكيد',
    'setup.range': '({min}-{max} أرقام)',
    'setup.count': '{count} من {min} أرقام على الأقل',
    'setup.action.confirm': 'تأكيد',
    'setup.action.set': 'تعيين',
    'setup.biometric': 'فتح أيضًا باستخدام {biometric}',
    'setup.warning':
      'اختر شيئًا يسهل تذكره. إن فقدت هذا الرمز فلا يمكن استرجاع ملفاتك.',
    'setup.openCalculator': 'فتح الآلة الحاسبة',
    'setup.error.short': 'استخدم {min} أرقامًا على الأقل — بقي {remaining}.',
    'setup.error.mismatch': 'الرمزان غير متطابقين — أدخله مرة أخرى.',
    'setup.error.slow':
      'استغرق التأمين وقتًا طويلًا. إن كنت على محاكي فجرّب جهازًا حقيقيًا، وإلا فأعد المحاولة.',
    'setup.error.save': 'تعذّر حفظ الرمز.',

    'welcome.badge': 'مشفّر من الطرف إلى الطرف على هذا الجهاز',
    'welcome.title': 'مرحبًا بعودتك!',
    'welcome.body': 'خزنتك مفتوحة الآن. يبقى كل شيء مشفّرًا على هذا الجهاز.',
    'welcome.tip': 'تُقفل الخزنة مجددًا عندما ينتقل التطبيق إلى الخلفية.',
    'welcome.cta': 'متابعة',
    'welcome.premium': 'الترقية إلى Premium',

    'calc.locked': 'مقفلة · {time}',
    'calc.working': 'جارٍ العمل',
    'calc.error': 'خطأ',
    'calc.biometricPrompt': 'فتح',

    'import.title': 'استيراد الملفات',
    'import.subtitle': 'أحضر ملفاتك إلى HideMe',
    'import.back': 'رجوع',
    'import.media.title': 'الصور والفيديوهات',
    'import.media.subtitle': 'من مكتبة الصور',
    'import.camera.title': 'التقاط صورة',
    'import.camera.subtitle': 'بالكاميرا',
    'import.audio.title': 'صوت',
    'import.audio.subtitle': 'MP3 وWAV وM4A وغيرها.',
    'import.document.title': 'مستندات',
    'import.document.subtitle': 'PDF وDOCX وXLSX وTXT وغيرها.',
    'import.other.title': 'ملفات أخرى',
    'import.other.subtitle': 'أي نوع ملف',
    'import.note':
      'يُشفَّر كل شيء على هذا الجهاز قبل إضافته — لا يُرفع أي شيء إلى الإنترنت.',
  },
};

/** Translate `key`; missing keys fall back to English, then the key itself. */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = DICTS[lang];
  let value = dict[key] ?? DICTS.en[key] ?? key;
  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${name}\\}`, 'g'), String(replacement));
    }
  }
  return value;
}

/** The biometric noun, in-app (Face ID vs fingerprint). */
export function biometricLabel(): string {
  return Platform.OS === 'ios' ? 'Face ID' : 'fingerprint';
}

// Test hook — production code never changes the language after boot.
export function setLangForTesting(next: Lang): void {
  lang = next;
}
