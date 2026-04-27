/**
 * One-off generator: writes i18n-part5.mjs + i18n-part6.mjs from compact EN seeds + translation maps.
 * Run: node scripts/gen-signup-community-i18n.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LANGS = ['en', 'zh-CN', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur'];

/** @type {Record<string, Record<string, string>>} */
const T = {
  'zh-CN': {},
  hi: {},
  es: {},
  fr: {},
  ar: {},
  bn: {},
  pt: {},
  ru: {},
  ur: {},
};

function seed(key, en, z, h, e, f, a, b, p, r, u) {
  const row = { k: key, en };
  row['zh-CN'] = z;
  row.hi = h;
  row.es = e;
  row.fr = f;
  row.ar = a;
  row.bn = b;
  row.pt = p;
  row.ru = r;
  row.ur = u;
  return row;
}

const rows = [];

// --- signUp ---
rows.push(
  seed('signUp.usernameLabel', 'Username', '用户名', 'उपयोगकर्ता नाम', 'Usuario', "Nom d'utilisateur", 'اسم المستخدم', 'ইউজারনেম', 'Nome de usuário', 'Имя пользователя', 'صارف نام'),
  seed('signUp.usernamePlaceholder', 'e.g. trader2024', '例如 trader2024', 'जैसे trader2024', 'ej. trader2024', 'ex. trader2024', 'مثال trader2024', 'যেমন trader2024', 'ex. trader2024', 'напр. trader2024', 'مثلاً trader2024'),
  seed('signUp.fullNameLabel', 'Full Name', '姓名', 'पूरा नाम', 'Nombre completo', 'Nom complet', 'الاسم الكامل', 'পূর্ণ নাম', 'Nome completo', 'Полное имя', 'مکمل نام'),
  seed('signUp.fullNamePlaceholder', 'Enter your full name', '输入您的全名', 'अपना पूरा नाम दर्ज करें', 'Escribe tu nombre completo', 'Saisissez votre nom complet', 'أدخل اسمك الكامل', 'পূর্ণ নাম লিখুন', 'Digite seu nome completo', 'Введите полное имя', 'مکمل نام درج کریں'),
  seed('signUp.emailLabel', 'Email Address', '电子邮箱', 'ईमेल पता', 'Correo electrónico', 'Adresse e-mail', 'البريد الإلكتروني', 'ইমেইল ঠিকানা', 'E-mail', 'Адрес почты', 'ای میل'),
  seed('signUp.emailPlaceholder', 'Enter your email', '输入邮箱', 'अपना ईमेल दर्ज करें', 'Introduce tu correo', 'Saisissez votre e-mail', 'أدخل بريدك', 'ইমেইল লিখুন', 'Digite seu e-mail', 'Введите почту', 'ای میل درج کریں'),
  seed('signUp.phoneLabel', 'Phone Number (any country)', '手机号（任意国家）', 'फ़ोन (कोई भी देश)', 'Teléfono (cualquier país)', 'Téléphone (tout pays)', 'رقم الهاتف (أي دولة)', 'ফোন (যেকোনো দেশ)', 'Telefone (qualquer país)', 'Телефон (любая страна)', 'فون (کوئی بھی ملک)'),
  seed('signUp.phonePlaceholder', 'e.g. +44 7700 900000 or +1 555 123 4567', '例如 +44 7700 900000 或 +1 555 123 4567', 'जैसे +44... या +1...', 'ej. +44... o +1...', 'ex. +44... ou +1...', 'مثال +44 أو +1', 'যেমন +44 বা +1', 'ex. +44 ou +1', 'напр. +44 или +1', '+44 یا +1'),
  seed('signUp.referralLabel', 'Referral Code (optional)', '推荐码（可选）', 'रेफ़रल कोड (वैकल्पिक)', 'Código de referido (opcional)', 'Code de parrainage (facultatif)', 'رمز الإحالة (اختياري)', 'রেফারেল (ঐচ্ছিক)', 'Código de indicação (opcional)', 'Реферальный код (необяз.)', 'ریفرل کوڈ (اختیاری)'),
  seed('signUp.referralPlaceholder', 'e.g. AURA-XXXXXXXX or AT-000123', '例如 AURA-XXXXXXXX 或 AT-000123', 'जैसे AURA-... या AT-...', 'ej. AURA-... o AT-...', 'ex. AURA-... ou AT-...', 'مثال AURA- أو AT-', 'যেমন AURA বা AT', 'ex. AURA ou AT', 'напр. AURA или AT', 'مثلاً AURA یا AT'),
  seed('signUp.passwordLabel', 'Password', '密码', 'पासवर्ड', 'Contraseña', 'Mot de passe', 'كلمة المرور', 'পাসওয়ার্ড', 'Senha', 'Пароль', 'پاس ورڈ'),
  seed('signUp.passwordPlaceholder', 'Create a password', '创建密码', 'पासवर्ड बनाएँ', 'Crea una contraseña', 'Créez un mot de passe', 'أنشئ كلمة مرور', 'পাসওয়ার্ড তৈরি', 'Crie uma senha', 'Создайте пароль', 'پاس ورڈ بنائیں'),
  seed('signUp.confirmPasswordLabel', 'Confirm Password', '确认密码', 'पासवर्ड की पुष्टि', 'Confirmar contraseña', 'Confirmer le mot de passe', 'تأكيد كلمة المرور', 'পাসওয়ার্ড নিশ্চিত', 'Confirmar senha', 'Подтвердите пароль', 'پاس ورڈ کی تصدیق'),
  seed('signUp.confirmPasswordPlaceholder', 'Confirm your password', '再次输入密码', 'पासवर्ड पुष्टि करें', 'Confirma tu contraseña', 'Confirmez le mot de passe', 'أكد كلمة المرور', 'পাসওয়ার্ড নিশ্চিত করুন', 'Confirme a senha', 'Подтвердите пароль', 'پاس ورڈ تصدیق کریں'),
  seed('signUp.codesStepHint', 'Enter the 6-digit codes sent to your email and phone', '请输入发送到邮箱和手机的 6 位验证码', 'ईमेल और फ़ोन पर भेजे 6 अंकों के कोड दर्ज करें', 'Introduce los códigos de 6 dígitos enviados a tu correo y teléfono', 'Saisissez les codes à 6 chiffres envoyés par e-mail et SMS', 'أدخل الرموز المكوّنة من 6 أرقام المرسلة إلى بريدك وهاتفك', 'ইমেইল ও ফোনে পাঠানো ৬ সংখ্যার কোড লিখুন', 'Digite os códigos de 6 dígitos enviados ao e-mail e telefone', 'Введите 6-значные коды из письма и SMS', 'ای میل اور فون پر بھیجے گئے 6 ہندسوں کے کوڈ'),
  seed('signUp.emailCodeLabel', 'Email code (sent to {{email}})', '邮箱验证码（发送至 {{email}}）', 'ईमेल कोड ({{email}} पर)', 'Código de correo (enviado a {{email}})', 'Code e-mail (envoyé à {{email}})', 'رمز البريد (أُرسل إلى {{email}})', 'ইমেইল কোড ({{email}})', 'Código do e-mail (enviado para {{email}})', 'Код из письма (на {{email}})', 'ای میل کوڈ ({{email}})'),
  seed('signUp.phoneCodeLabel', 'Phone code (sent to {{phone}})', '手机验证码（发送至 {{phone}}）', 'फ़ोन कोड ({{phone}} पर)', 'Código SMS (enviado a {{phone}})', 'Code SMS (envoyé au {{phone}})', 'رمز الهاتف (أُرسل إلى {{phone}})', 'ফোন কোড ({{phone}})', 'Código SMS (enviado para {{phone}})', 'Код SMS (на {{phone}})', 'فون کوڈ ({{phone}})'),
  seed('signUp.codePlaceholder', '6-digit code', '6 位验证码', '6 अंकों का कोड', 'Código de 6 dígitos', 'Code à 6 chiffres', 'رمز من 6 أرقام', '৬ সংখ্যার কোড', 'Código de 6 dígitos', '6-значный код', '6 ہندسوں کا کوڈ'),
  seed('signUp.resendEmailCode', 'Resend email code', '重发邮箱验证码', 'ईमेल कोड फिर भेजें', 'Reenviar código por correo', "Renvoyer le code e-mail", 'إعادة إرسال رمز البريد', 'ইমেইল কোড পুনরায়', 'Reenviar código do e-mail', 'Отправить код снова', 'ای میل کوڈ دوبارہ'),
  seed('signUp.resendPhoneCode', 'Resend phone code', '重发手机验证码', 'फ़ोन कोड फिर भेजें', 'Reenviar código SMS', 'Renvoyer le code SMS', 'إعادة إرسال رمز الهاتف', 'ফোন কোড পুনরায়', 'Reenviar código SMS', 'Отправить SMS-код снова', 'فون کوڈ دوبارہ'),
  seed('signUp.errUsernameMin', 'Username must be at least 3 characters.', '用户名至少 3 个字符。', 'उपयोगकर्ता नाम कम से कम 3 अक्षर।', 'El usuario debe tener al menos 3 caracteres.', "Le nom d'utilisateur doit avoir au moins 3 caractères.", 'يجب أن يكون اسم المستخدم 3 أحرف على الأقل।', 'ইউজারনেম কমপক্ষে ৩ অক্ষর।', 'O usuário deve ter pelo menos 3 caracteres.', 'Имя пользователя не короче 3 символов.', 'صارف نام کم از کم 3 حروف۔'),
  seed('signUp.errUsernameChars', 'Username can only contain letters, numbers, hyphens, and underscores.', '用户名只能包含字母、数字、连字符和下划线。', 'उपनाम में केवल अक्षर, अंक, हाइफ़न और अंडरस्कोर।', 'Solo letras, números, guiones y guiones bajos.', 'Lettres, chiffres, tirets et underscores uniquement.', 'أحرف وأرقام وشرطة سفلية فقط।', 'শুধু অক্ষর, সংখ্যা, হাইফেন ও আন্ডারস্কোর।', 'Apenas letras, números, hífens e sublinhados.', 'Только буквы, цифры, дефис и подчёркивание.', 'صرف حروف، اعداد، ہائفن اور انڈر سکور۔'),
  seed('signUp.errFullName', 'Full name is required.', '需要填写姓名。', 'पूरा नाम आवश्यक है।', 'El nombre completo es obligatorio.', 'Le nom complet est requis.', 'الاسم الكامل مطلوب।', 'পূর্ণ নাম প্রয়োজন।', 'Nome completo obrigatório.', 'Требуется полное имя.', 'مکمل نام ضروری ہے۔'),
  seed('signUp.errEmail', 'Valid email is required.', '需要有效的邮箱。', 'वैध ईमेल आवश्यक।', 'Se requiere un correo válido.', 'Un e-mail valide est requis.', 'بريد صالح مطلوب।', 'বৈধ ইমেইল লাগবে।', 'E-mail válido obrigatório.', 'Нужен действительный e-mail.', 'درست ای میل چاہیے۔'),
  seed('signUp.errPhone', 'Valid phone number is required (10+ digits).', '需要有效手机号（10 位以上数字）。', 'वैध फ़ोन (10+ अंक) आवश्यक।', 'Se requiere un teléfono válido (10+ dígitos).', 'Téléphone valide requis (10+ chiffres).', 'رقم هاتف صالح (10+ أرقام).', 'বৈধ ফোন (১০+ সংখ্যা).', 'Telefone válido (10+ dígitos).', 'Нужен телефон (10+ цифр).', 'درست فون (10+ ہندسے)۔'),
  seed('signUp.errPasswordLen', 'Password must be at least 6 characters.', '密码至少 6 个字符。', 'पासवर्ड कम से कम 6 अक्षर।', 'La contraseña debe tener al menos 6 caracteres.', 'Le mot de passe doit contenir au moins 6 caractères.', 'كلمة المرور 6 أحرف على الأقل.', 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষর।', 'Senha com pelo menos 6 caracteres.', 'Пароль не короче 6 символов.', 'پاس ورڈ کم از کم 6 حروف۔'),
  seed('signUp.errPasswordMatch', 'Passwords do not match.', '两次密码不一致。', 'पासवर्ड मेल नहीं खाते।', 'Las contraseñas no coinciden.', 'Les mots de passe ne correspondent pas.', 'كلمتا المرور غير متطابقتين।', 'পাসওয়ার্ড মিলছে না।', 'As senhas não coincidem.', 'Пароли не совпадают.', 'پاس ورڈ میل نہیں کھاتے۔'),
  seed('signUp.errSendEmail', 'Failed to send verification email. Please try again.', '发送验证邮件失败，请重试。', 'सत्यापन ईमेल नहीं भेजा जा सका।', 'No se pudo enviar el correo de verificación.', "Échec de l'envoi de l'e-mail.", 'فشل إرسال بريد التحقق.', 'যাচাইকরণ ইমেইল পাঠাতে ব্যর্থ।', 'Falha ao enviar e-mail de verificação.', 'Не удалось отправить письмо.', 'تصدیقی ای میل ناکام۔'),
  seed('signUp.errPhoneSend', 'Could not send phone code. If an email code was already sent, check your inbox—you can fix your mobile number and tap Send verification codes again.', '无法发送手机验证码。若邮箱验证码已发出，请查收邮件；您可修正手机号后再次点击发送验证码。', 'फ़ोन कोड नहीं भेजा जा सका। यदि ईमेल कोड भेज दिया गया है, तो इनबॉक्स देखें—नंबर ठीक कर फिर भेजें।', 'No se pudo enviar el SMS. Si ya hay un código por correo, revisa la bandeja—corrige el móvil y vuelve a enviar.', "Impossible d'envoyer le SMS. Si un code e-mail a été envoyé, vérifiez la boîte—corrigez le mobile et renvoyez.", 'تعذر إرسال رمز الهاتف. إن وُجد رمز بالبريد، راجع الصندوق—صحح الرقم وأعد الإرسال.', 'ফোন কোড পাঠানো যায়নি। ইমেইল কোড গেলে ইনবক্স দেখুন—নম্বর ঠিক করে আবার পাঠান।', 'Não foi possível enviar SMS. Se o e-mail já foi enviado, verifique a caixa—corrija o celular e envie novamente.', 'Не удалось отправить SMS. Если код на почте — проверьте ящик, исправьте номер и отправьте снова.', 'فون کوڈ نہیں بھیجا گیا۔ ای میل کوڈ ہو تو ان باکس دیکھیں—نمبر درست کر کے دوبارہ بھیجیں۔'),
  seed('signUp.errCodesException', 'Failed to send verification.', '发送验证失败。', 'सत्यापन भेजने में विफल।', 'Error al enviar la verificación.', 'Échec de l’envoi de la vérification.', 'فشل إرسال التحقق.', 'যাচাই পাঠাতে ব্যর্থ।', 'Falha ao enviar verificação.', 'Не удалось отправить проверку.', 'تصدیق بھیجنے میں ناکامی۔'),
  seed('signUp.errEmailUnavailable', 'Email service is temporarily unavailable. Please try again later.', '邮件服务暂时不可用，请稍后重试。', 'ईमेल सेवा अस्थायी रूप से उपलब्ध नहीं।', 'El servicio de correo no está disponible temporalmente.', 'Service e-mail temporairement indisponible.', 'خدمة البريد غير متاحة مؤقتًا.', 'ইমেইল সেবা সাময়িকভাবে বন্ধ।', 'Serviço de e-mail temporariamente indisponível.', 'Почтовый сервис временно недоступен.', 'ای میل سروس عارضی طور پر دستیاب نہیں۔'),
  seed('signUp.errEmailCodeSuffix', ' If an email code was already sent, check your inbox—you can fix your mobile number and tap Send verification codes again.', ' 若邮箱验证码已发出，请查收邮件；可修正手机号后再次点击发送验证码。', ' यदि ईमेल कोड भेजा गया है, तो इनबॉक्स देखें—नंबर ठीक कर फिर भेजें।', ' Si ya hay un código por correo, revisa la bandeja—corrige el móvil y vuelve a enviar.', " Si un code e-mail a été envoyé, vérifiez la boîte—corrigez le mobile et renvoyez.", ' إن وُجد رمز بالبريد، راجع الصندوق—صحح الرقم وأعد الإرسال.', ' ইমেইল কোড গেলে ইনবক্স দেখুন—নম্বর ঠিক করে আবার।', ' Se o código por e-mail foi enviado, verifique a caixa—corrija o celular e envie novamente.', ' Если код на почте — проверьте ящик, исправьте номер и отправьте снова.', ' اگر ای میل کوڈ بھیجا گیا ہو تو ان باکس دیکھیں—نمبر درست کریں۔'),
  seed('signUp.errEmailCodeLen', 'Please enter the 6-digit code from your email.', '请输入邮箱收到的 6 位验证码。', 'कृपया ईमेल से 6 अंकों का कोड दर्ज करें।', 'Introduce el código de 6 dígitos del correo.', 'Saisissez le code à 6 chiffres reçu par e-mail.', 'أدخل الرمز المكوّن من 6 أرقام من بريدك.', 'ইমেইলের ৬ সংখ্যার কোড লিখুন।', 'Digite o código de 6 dígitos do e-mail.', 'Введите 6-значный код из письма.', 'ای میل کا 6 ہندسوں کا کوڈ درج کریں۔'),
  seed('signUp.errPhoneCodeLen', 'Please enter the 6-digit code from your phone.', '请输入手机收到的 6 位验证码。', 'कृपया फ़ोन से 6 अंकों का कोड दर्ज करें।', 'Introduce el código de 6 dígitos del teléfono.', 'Saisissez le code à 6 chiffres reçu par SMS.', 'أدخل الرمز المكوّن من 6 أرقام من هاتفك.', 'ফোনের ৬ সংখ্যার কোড লিখুন।', 'Digite o código de 6 dígitos do telefone.', 'Введите 6-значный код из SMS.', 'فون کا 6 ہندسوں کا کوڈ درج کریں۔'),
  seed('signUp.errVerifyEmail', 'Invalid or expired email code. Please check and try again.', '邮箱验证码无效或已过期，请检查后重试。', 'अमान्य या समाप्त ईमेल कोड।', 'Código de correo inválido o caducado.', 'Code e-mail invalide ou expiré.', 'رمز البريد غير صالح أو منتهٍ.', 'ইমেইল কোড অবৈধ বা মেয়াদ শেষ।', 'Código de e-mail inválido ou expirado.', 'Неверный или просроченный код из письма.', 'ای میل کوڈ غلط یا ختم۔'),
  seed('signUp.errVerifyPhone', 'Invalid or expired phone code.', '手机验证码无效或已过期。', 'अमान्य या समाप्त फ़ोन कोड।', 'Código de teléfono inválido o caducado.', 'Code SMS invalide ou expiré.', 'رمز الهاتف غير صالح أو منتهٍ.', 'ফোন কোড অবৈধ।', 'Código SMS inválido ou expirado.', 'Неверный или просроченный SMS-код.', 'فون کوڈ غلط یا ختم۔'),
  seed('signUp.successCodesSent', 'Codes sent! Enter the 6-digit codes from your email and phone.', '验证码已发送！请输入邮箱和手机收到的 6 位码。', 'कोड भेजे गए! ईमेल और फ़ोन से 6 अंक दर्ज करें।', '¡Códigos enviados! Introduce los de 6 dígitos.', 'Codes envoyés ! Saisissez les codes à 6 chiffres.', 'أُرسلت الرموز! أدخل الرموز من البريد والهاتف.', 'কোড পাঠানো হয়েছে! ৬ সংখ্যা লিখুন।', 'Códigos enviados! Digite os de 6 dígitos.', 'Коды отправлены! Введите 6-значные коды.', 'کوڈز بھیج دیے! 6 ہندسوں کے کوڈ درج کریں۔'),
  seed('signUp.successAccount', 'Account created! Redirecting…', '账户已创建！正在跳转…', 'खाता बन गया! पुनर्निर्देशित…', '¡Cuenta creada! Redirigiendo…', 'Compte créé ! Redirection…', 'تم إنشاء الحساب! جارٍ التحويل…', 'অ্যাকাউন্ট তৈরি! রিডাইরেক্ট…', 'Conta criada! Redirecionando…', 'Аккаунт создан! Перенаправление…', 'اکاؤنٹ بن گیا! ری ڈائریکٹ…'),
  seed('signUp.errFinishSignup', 'Could not finish sign-up. If your SMS code was already used once, tap Resend phone code, then try Verify again.', '无法完成注册。若短信验证码已用过一次，请点击重发手机验证码后再试。', 'साइन-अप पूरा नहीं हो सका। यदि SMS कोड एक बार उपयोग हो चुका है, तो फिर से भेजें।', 'No se pudo completar el registro. Si el SMS ya se usó, reenvía y verifica de nuevo.', "Impossible de terminer l'inscription. Si le SMS a déjà été utilisé, renvoyez puis vérifiez.", 'تعذر إكمال التسجيل. إن استُخدم رمز SMS مرة، أعد الإرسال ثم تحقق.', 'সাইনআপ শেষ করা যায়নি। এসএমএস একবার ব্যবহৃত হলে পুনরায় পাঠিয়ে যাচাই করুন।', 'Não foi possível concluir. Se o SMS já foi usado, reenvie e verifique.', 'Не удалось завершить регистрацию. Если SMS-код уже использован — запросите снова.', 'سائن اپ مکمل نہیں ہوا۔ SMS ایک بار استعمال ہو تو دوبارہ بھیجیں۔'),
  seed('signUp.errResend', 'Failed to resend code.', '重发失败。', 'पुनः भेजने में विफल।', 'No se pudo reenviar.', 'Échec du renvoi.', 'فشل إعادة الإرسال.', 'পুনরায় পাঠাতে ব্যর্থ।', 'Falha ao reenviar.', 'Не удалось отправить повторно.', 'دوبارہ بھیجنا ناکام۔'),
  seed('signUp.successResendPhone', 'Code resent to your phone.', '验证码已重新发送到您的手机。', 'कोड फिर से फ़ोन पर भेजा गया।', 'Código reenviado a tu teléfono.', 'Code renvoyé sur votre téléphone.', 'أُعيد إرسال الرمز إلى هاتفك.', 'কোড আবার ফোনে পাঠানো হয়েছে।', 'Código reenviado para o telefone.', 'Код отправлен на телефон повторно.', 'کوڈ دوبارہ فون پر بھیج دیا گیا۔'),
  seed('signUp.successResendEmail', 'Code resent to your email.', '验证码已重新发送到您的邮箱。', 'कोड फिर से ईमेल पर भेजा गया।', 'Código reenviado a tu correo.', 'Code renvoyé à votre e-mail.', 'أُعيد إرسال الرمز إلى بريدك.', 'কোড আবার ইমেইলে পাঠানো হয়েছে।', 'Código reenviado para o e-mail.', 'Код отправлен на почту повторно.', 'کوڈ دوبارہ ای میل بھیج دیا گیا۔'),
  seed('signUp.traderPassportDefaultCaption', 'My Trader Passport (Aura FX)', '我的交易者护照（Aura FX）', 'मेरा ट्रेडर पासपोर्ट (Aura FX)', 'Mi Trader Passport (Aura FX)', 'Mon Trader Passport (Aura FX)', 'جواز المتداول الخاص بي (Aura FX)', 'আমার ট্রেডার পাসপোর্ট (Aura FX)', 'Meu Trader Passport (Aura FX)', 'Мой Trader Passport (Aura FX)', 'میرا ٹریڈر پاسپورٹ (Aura FX)')
);

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function rowToStr(row) {
  const parts = LANGS.map((lng) => `${lng === 'zh-CN' ? "'zh-CN'" : lng}: '${esc(row[lng])}'`);
  return `  { k: '${esc(row.k)}', ${parts.join(', ')} },`;
}

const header = `/** @typedef {{ k: string, en: string, 'zh-CN': string, hi: string, es: string, fr: string, ar: string, bn: string, pt: string, ru: string, ur: string }} Row */
/** @type {Row[]} */
/* eslint-disable max-len */
export const rows = [
`;

const footer = `
];
`;

fs.writeFileSync(path.join(__dirname, 'i18n-part5.mjs'), header + rows.map(rowToStr).join('\n') + footer, 'utf8');
console.log('Wrote i18n-part5.mjs with', rows.length, 'rows (signUp only). Append community rows manually or extend this script.');
