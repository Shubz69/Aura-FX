/**
 * Generates scripts/i18n-part7.mjs — run: node scripts/gen-i18n-part7.mjs
 * Final Community UI: modals, banners, welcome/placeholder bodies, context menu.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LANGS = ['en', 'zh-CN', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur'];

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

const W1 = `🎉 Welcome to Aura Terminal™ Network! 🎉

Welcome to the most elite trading and wealth-building community on the planet! We're thrilled to have you join us on this incredible journey toward financial freedom and generational wealth.

## 📋 COMMUNITY RULES

1. Respect & Professionalism
   ⬢ Treat all members with respect and professionalism
   ⬢ No harassment, discrimination, or personal attacks
   ⬢ Maintain a positive and constructive environment

2. Trading & Investment Discussions
   ⬢ Share knowledge and insights, not financial advice
   ⬢ All trades are at your own risk - we are not financial advisors
   ⬢ Use proper risk management and never trade more than you can afford to lose`;

const W2 = `3. Content & Privacy
   ⬢ Keep conversations relevant to trading, wealth-building, and course topics
   ⬢ Do not share personal financial information (account numbers, passwords, etc.)
   ⬢ Respect intellectual property - do not share copyrighted course materials

4. Spam & Promotion
   ⬢ No spam, self-promotion, or affiliate links without permission
   ⬢ Do not promote other trading services or products
   ⬢ Keep discussions focused on learning and community growth

5. Course Access
   ⬢ Course-specific channels are for enrolled members only
   ⬢ Share insights and ask questions related to your enrolled courses
   ⬢ Complete courses in order for maximum learning effectiveness

6. Community Support
   ⬢ Help fellow members when you can
   ⬢ Ask questions - we're all here to learn and grow together
   ⬢ Report any issues or concerns to staff members

7. Platform Usage
   ⬢ Use appropriate language and avoid profanity
   ⬢ Keep messages clear and concise
   ⬢ Use channels for their intended purposes`;

const W3 = `## 🚀 GETTING STARTED

1. Complete your profile - Add your bio
2. Explore channels - Check out different course and trading channels
3. Join discussions - Start participating in conversations
4. Enroll in courses - Begin your wealth-building journey
5. Earn XP - Level up by being active in the community

## 💎 PREMIUM BENEFITS

Premium members get access to:
⬢ Exclusive VIP channels and content
⬢ Premium trading signals and insights
⬢ Advanced course materials
⬢ Priority support from our team
⬢ Elite trader discussions

## ⚡ QUICK TIPS

⬢ Earn XP by sending messages, sharing files, and being active
⬢ Level up to unlock new channels and features
⬢ Check the announcements channel regularly for updates
⬢ Connect with other traders in the general chat channels

Remember: Success in trading comes from discipline, education, and consistent action. We're here to support you every step of the way!

Click the ✅ below to acknowledge you've read and agree to follow these rules, and unlock access to all channels.

Let's build generational wealth together! 💰🚀`;

const rows = [];

rows.push(
  seed(
    'community.welcome.part1',
    W1,
    '🎉 欢迎加入 Aura Terminal™ 社区！🎉\n\n欢迎加入全球精英交易与财富社群。请遵守社区准则，尊重他人，理性交流。\n\n## 📋 社区准则（节选）\n\n1. 尊重与专业\n   ⬢ 礼貌沟通，禁止骚扰与歧视\n2. 交易讨论\n   ⬢ 分享知识不构成投资建议；交易风险自负',
    '🎉 Aura Terminal™ नेटवर्क में आपका स्वागत! 🎉\n\nसम्मानजनक व्यवहार रखें। यहां दी गई जानकारी वित्तीय सलाह नहीं है; जोखिम आपका है।',
    '¡Bienvenido a Aura Terminal™! Respeta a todos. Lo compartido no es asesoramiento financiero; opera bajo tu propio riesgo.',
    'Bienvenue sur Aura Terminal™ ! Soyez respectueux. Rien ici ne constitue un conseil financier ; vous tradez à vos risques.',
    'مرحبًا بك في Aura Terminal™. كن محترمًا. المحتوى ليس نصيحة مالية؛ تداولك على مسؤوليتك.',
    'Aura Terminal™-এ স্বাগতম। শ্রদ্ধাশীল থাকুন। এখানকার তথ্য আর্থিক পরামর্শ নয়; ঝুঁকি আপনার।',
    'Bem-vindo à Aura Terminal™. Seja respeitoso. Nada aqui é aconselhamento financeiro; risco seu.',
    'Добро пожаловать в Aura Terminal™. Уважайте участников. Это не финансовая рекомендация; риск на вас.',
    'Aura Terminal™ میں خوش آمدید۔ احترام رکھیں۔ یہاں کی باتیں مالی مشورہ نہیں؛ خطرہ آپ کا ہے۔'
  ),
  seed(
    'community.welcome.part2',
    W2,
    '3. 内容与隐私\n   ⬢ 话题围绕交易与课程；勿泄露账号密码等隐私\n4. 垃圾信息与推广\n   ⬢ 未经许可不得刷屏、推广或附联盟链接\n5–7. 课程与支持、平台使用\n   ⬢ 按课程规则参与；保持频道用途清晰',
    'गोपनीयता बनाए रखें। स्पैम न करें। कोर्स नियमों का पालन करें।',
    'Privacidad y sin spam. Respeta los canales y cursos.',
    'Respectez la vie privée, pas de spam, suivez les règles des cours.',
    'الخصوصية، لا إزعاج، التزام قنوات الدورات.',
    'গোপনীয়তা, স্প্যাম নয়, কোর্স নিয়ম মানুন।',
    'Privacidade, sem spam, siga as regras.',
    'Конфиденциальность, без спама, правила курсов.',
    'رازداری، بغیر اسپام، کورس کے قواعد۔'
  ),
  seed(
    'community.welcome.part3',
    W3,
    '## 🚀 入门\n完成资料、探索频道、参与讨论、选课学习、赚取 XP。\n## 💎 会员权益\n高级会员可享专属频道与支持。\n## ⚡ 提示\n积极互动可升级。请点击下方 ✅ 表示已阅读并同意规则以解锁频道。',
    'प्रोफ़ाइल पूरा करें, चैनल देखें, XP कमाएँ। नियम स्वीकार के लिए ✅ दबाएँ।',
    'Completa tu perfil, explora canales, gana XP. Pulsa ✅ para aceptar las reglas.',
    'Complétez votre profil, explorez, gagnez de l’XP. Cliquez sur ✅ pour accepter.',
    'أكمل ملفك، استكشف القنوات، اضغط ✅ للموافقة على القواعد.',
    'প্রোফাইল সম্পূর্ণ করুন, চ্যানেল দেখুন, ✅ চাপুন।',
    'Complete o perfil, explore, toque ✅ para aceitar.',
    'Заполните профиль, изучите каналы, нажмите ✅.',
    'پروفائل مکمل کریں، ✅ سے قواعد قبول کریں۔'
  )
);

const ANN = `📢 **ANNOUNCEMENTS**

Important updates and news from AURA TERMINAL™ will appear here.

Check back regularly for:
⬢ New features and platform updates
⬢ Trading insights and market analysis
⬢ Community events and challenges
⬢ Course updates and new content`;

rows.push(
  seed(
    'community.announcements.placeholderBody',
    ANN,
    '📢 **公告**\n\nAURA TERMINAL™ 的重要更新将发布于此。\n\n请定期查看：\n⬢ 新功能与平台更新\n⬢ 交易观点与市场分析\n⬢ 社区活动与挑战\n⬢ 课程与新内容',
    '📢 **घोषणाएँ**\n\nमहत्वपूर्ण अपडेट यहाँ दिखेंगे। नियमित रूप से देखें।',
    '📢 **ANUNCIOS**\n\nLas novedades de AURA TERMINAL™ aparecerán aquí. Vuelve pronto.',
    '📢 **ANNONCES**\n\nLes nouvelles importantes apparaîtront ici.',
    '📢 **إعلانات**\n\nستظهر التحديثات المهمة هنا.',
    '📢 **ঘোষণা**\n\nগুরুত্বপূর্ণ আপডেট এখানে থাকবে।',
    '📢 **AVISOS**\n\nNovidades da AURA TERMINAL™ aparecerão aqui.',
    '📢 **ОБЪЯВЛЕНИЯ**\n\nВажные обновления появятся здесь.',
    '📢 **اعلانات**\n\nاہم اپ ڈیٹس یہاں آئیں گی۔'
  )
);

const LV = `🏆 **LEVEL-UP CELEBRATIONS**

When members level up by earning XP, their achievements will be celebrated here!

Earn XP by:
⬢ Sending messages in the community
⬢ Sharing files and insights
⬢ Helping other members
⬢ Participating in discussions`;

rows.push(
  seed(
    'community.levels.placeholderBody',
    LV,
    '🏆 **等级庆祝**\n成员升级时将在此展示！\n通过发消息、分享文件、互助与讨论赚取 XP。',
    '🏆 **लेवल-अप उत्सव**\n\nXP कमाकर लेवल अप करने पर उपलब्धियाँ यहाँ दिखेंगी।\n\nXP कमाएँ:\n⬢ समुदाय में संदेश भेजकर\n⬢ फ़ाइलें और इनसाइट साझा करके\n⬢ सदस्यों की मदद करके\n⬢ चर्चाओं में भाग लेकर',
    '🏆 **CELEBRACIONES DE SUBIDA DE NIVEL**\n\nCuando suban de nivel con XP, ¡se celebrará aquí!\n\nGana XP:\n⬢ Enviando mensajes\n⬢ Compartiendo archivos\n⬢ Ayudando a otros\n⬢ Participando en debates',
    '🏆 **PASSAGES DE NIVEAU**\n\nLes succès apparaîtront ici.\n\nGagnez de l’XP :\n⬢ Messages\n⬢ Fichiers et idées\n⬢ Aider les membres\n⬢ Discussions',
    '🏆 **احتفالات الصعود**\n\nستُعرض الإنجازات هنا عند ترقية المستوى.\n\nاكسب XP:\n⬢ بإرسال الرسائل\n⬢ بمشاركة الملفات\n⬢ بمساعدة الأعضاء\n⬢ بالمشاركة في النقاشات',
    '🏆 **লেভেল-আপ উদযাপন**\n\nXP অর্জন করে লেভেল আপ হলে অর্জন এখানে দেখাবে।\n\nXP অর্জন:\n⬢ বার্তা পাঠিয়ে\n⬢ ফাইল ও ইনসাইট শেয়ার করে\n⬢ সদস্যদের সাহায্য করে\n⬢ আলোচনায় অংশ নিয়ে',
    '🏆 **COMEMORAÇÕES DE LEVEL**\n\nConquistas aparecerão aqui ao subir de nível com XP.\n\nGanhe XP:\n⬢ Enviando mensagens\n⬢ Compartilhando arquivos\n⬢ Ajudando membros\n⬢ Participando',
    '🏆 **ПОВЫШЕНИЯ УРОВНЯ**\n\nДостижения появятся здесь.\n\nЗарабатывайте XP:\n⬢ Сообщениями\n⬢ Файлами и идеями\n⬢ Помощью участникам\n⬢ В обсуждениях',
    '🏆 **لیول اپ جشن**\n\nXP سے لیول اپ پر کامیابیاں یہاں دکھائی جائیں گی۔\n\nXP کمائیں:\n⬢ پیغامات بھیج کر\n⬢ فائلیں شیئر کر کے\n⬢ مدد کر کے\n⬢ بحث میں حصہ لے کر'
  )
);

rows.push(
  seed('community.rules.ackRead', "I've read and agree to the rules", '我已阅读并同意遵守规则', 'मैंने नियम पढ़े और सहमति दी', 'He leído y acepto las reglas', "J'ai lu et j'accepte les règles", 'قرأتُ القواعد وأوافق', 'আমি নিয়ম পড়েছি এবং সম্মত', 'Li e concordo com as regras', 'Я прочитал(а) правила и согласен(на)', 'میں نے قواعد پڑھے اور متفق ہوں'),
  seed('community.profile.levelLabel', 'Level {{level}}', '等级 {{level}}', 'स्तर {{level}}', 'Nivel {{level}}', 'Niveau {{level}}', 'المستوى {{level}}', 'লেভেল {{level}}', 'Nível {{level}}', 'Уровень {{level}}', 'لیول {{level}}'),
  seed('community.journal.quickTitle', 'Quick Journal', '快速日记', 'त्वरित जर्नल', 'Diario rápido', 'Journal rapide', 'دفتر يوميات سريع', 'দ্রুত জার্নাল', 'Diário rápido', 'Быстрый дневник', 'فوری جرنل'),
  seed('community.editChannel.title', 'Edit Channel', '编辑频道', 'चैनल संपादित करें', 'Editar canal', 'Modifier le canal', 'تعديل القناة', 'চ্যানেল সম্পাদনা', 'Editar canal', 'Изменить канал', 'چینل میں ترمیم'),
  seed('community.editChannel.channelName', 'Channel Name', '频道名称', 'चैनल का नाम', 'Nombre del canal', 'Nom du canal', 'اسم القناة', 'চ্যানেলের নাম', 'Nome do canal', 'Название канала', 'چینل کا نام'),
  seed('community.editChannel.description', 'Description', '描述', 'विवरण', 'Descripción', 'Description', 'الوصف', 'বিবরণ', 'Descrição', 'Описание', 'تفصیل'),
  seed('community.editChannel.category', 'Category', '分类', 'श्रेणी', 'Categoría', 'Catégorie', 'الفئة', 'ক্যাটাগরি', 'Categoria', 'Категория', 'زمرہ'),
  seed('community.editChannel.accessLevel', 'Access Level', '访问级别', 'पहुँच स्तर', 'Nivel de acceso', "Niveau d'accès", 'مستوى الوصول', 'অ্যাক্সেস স্তর', 'Nível de acesso', 'Уровень доступа', 'رسائی کی سطح'),
  seed('community.editChannel.permissionType', 'Permission Type', '权限类型', 'अनुमति प्रकार', 'Tipo de permiso', 'Type d’autorisation', 'نوع الإذن', 'অনুমতির ধরন', 'Tipo de permissão', 'Тип разрешений', 'اجازت کی قسم'),
  seed('community.editChannel.permissionHelp', 'This controls whether users with access can text or just view the channel', '控制有权限的用户是可发消息还是仅可查看频道。', 'यह नियंत्रित करता है कि उपयोगकर्ता टेक्स्ट कर सकें या केवल देखें।', 'Controla si los usuarios pueden escribir o solo ver.', 'Contrôle si les utilisateurs peuvent écrire ou seulement voir.', 'يحدد ما إذا كان بإمكان المستخدمين الكتابة أو المشاهدة فقط.', 'লিখতে পারবে নাকি শুধু দেখবে তা নিয়ন্ত্রণ করে।', 'Define se usuários podem escrever ou só ver.', 'Определяет, могут ли писать или только смотреть.', 'لکھ سکتے ہیں یا صرف دیکھ سکتے ہیں۔'),
  seed('community.editChannel.catGeneral', 'General', '综合', 'सामान्य', 'General', 'Général', 'عام', 'সাধারণ', 'Geral', 'Общее', 'عمومی'),
  seed('community.editChannel.catForums', 'Forums', '论坛', 'फ़ोरम', 'Foros', 'Forums', 'منتديات', 'ফোরাম', 'Fóruns', 'Форумы', 'فورمز'),
  seed('community.editChannel.catPremium', 'Premium', '高级', 'प्रीमियम', 'Premium', 'Premium', 'بريميوم', 'প্রিমিয়াম', 'Premium', 'Премиум', 'پریمیم'),
  seed('community.editChannel.catA7fx', 'A7FX', 'A7FX', 'A7FX', 'A7FX', 'A7FX', 'A7FX', 'A7FX', 'A7FX', 'A7FX', 'A7FX'),
  seed('community.editChannel.catAnnouncements', 'Announcements', '公告', 'घोषणाएँ', 'Anuncios', 'Annonces', 'إعلانات', 'ঘোষণা', 'Avisos', 'Объявления', 'اعلانات'),
  seed('community.editChannel.catStaff', 'Staff', '工作人员', 'स्टाफ', 'Personal', 'Équipe', 'الطاقم', 'স্টাফ', 'Equipe', 'Персонал', 'اسٹاف'),
  seed('community.editChannel.catSupport', 'Support', '支持', 'सहायता', 'Soporte', 'Assistance', 'الدعم', 'সাপোর্ট', 'Suporte', 'Поддержка', 'سپورٹ'),
  seed('community.editChannel.permReadWrite', 'Read & Write - Users can text in channel', '读与写 — 用户可在频道内发消息', 'पढ़ें और लिखें — चैनल में टेक्स्ट', 'Lectura y escritura — pueden escribir', 'Lecture et écriture — peuvent écrire', 'قراءة وكتابة — يمكنهم الكتابة', 'পঠন ও লেখা — লিখতে পারবে', 'Leitura e escrita — podem escrever', 'Чтение и запись — могут писать', 'پڑھنا لکھنا — لکھ سکتے ہیں'),
  seed('community.editChannel.permReadOnly', 'Read Only - Users can only see channel (cannot text)', '只读 — 用户仅可查看（不可发消息）', 'केवल पढ़ें — टेक्स्ट नहीं', 'Solo lectura — no pueden escribir', 'Lecture seule — pas d’écriture', 'قراءة فقط — لا كتابة', 'শুধু পঠন — লিখতে পারবে না', 'Somente leitura — sem escrever', 'Только чтение — без записи', 'صرف پڑھیں — نہیں لکھ سکتے'),
  seed('community.editChannel.saveChanges', 'Save Changes', '保存更改', 'परिवर्तन सहेजें', 'Guardar cambios', 'Enregistrer', 'حفظ التغييرات', 'পরিবর্তন সংরক্ষণ', 'Salvar alterações', 'Сохранить изменения', 'تبدیلیاں محفوظ'),
  seed('community.editCategory.title', 'Edit Category', '编辑分类', 'श्रेणी संपादित करें', 'Editar categoría', 'Modifier la catégorie', 'تعديل الفئة', 'ক্যাটাগরি সম্পাদনা', 'Editar categoria', 'Изменить категорию', 'زمرہ میں ترمیم'),
  seed('community.editCategory.nameLabel', 'Category Name', '分类名称', 'श्रेणी का नाम', 'Nombre de categoría', 'Nom de la catégorie', 'اسم الفئة', 'ক্যাটাগরির নাম', 'Nome da categoria', 'Название категории', 'زمرے کا نام'),
  seed('community.editCategory.placeholder', 'Enter category name', '输入分类名称', 'श्रेणी का नाम दर्ज करें', 'Introduce el nombre', 'Saisissez le nom', 'أدخل اسم الفئة', 'ক্যাটাগরির নাম লিখুন', 'Digite o nome', 'Введите название', 'زمرے کا نام درج کریں'),
  seed('community.subModal.title', 'Choose Your Subscription Plan', '选择订阅方案', 'अपनी सदस्यता योजना चुनें', 'Elige tu plan', 'Choisissez votre abonnement', 'اختر خطة الاشتراك', 'সাবস্ক্রিপশন প্ল্যান বেছে নিন', 'Escolha seu plano', 'Выберите план подписки', 'سبسکرپشن پلان منتخب کریں'),
  seed('community.subModal.channelRequiresLead', '💡 This channel requires:', '💡 此频道需要：', '💡 इस चैनल के लिए:', '💡 Este canal requiere:', '💡 Ce canal nécessite :', '💡 هذه القناة تتطلب:', '💡 এই চ্যানেলের জন্য:', '💡 Este canal requer:', '💡 Для канала нужно:', '💡 اس چینل کے لیے:'),
  seed('community.subModal.planPremiumName', 'Aura FX Premium (£99/month)', 'Aura FX 高级（£99/月）', 'Aura FX Premium (£99/माह)', 'Aura FX Premium (99 £/mes)', 'Aura FX Premium (99 £/mois)', 'Aura FX Premium (99 £/شهر)', 'Aura FX Premium (£99/মাস)', 'Aura FX Premium (£99/mês)', 'Aura FX Premium (£99/мес)', 'Aura FX Premium (£99/ماہ)'),
  seed('community.subModal.planA7fxName', 'A7FX Elite (£250/month)', 'A7FX 精英（£250/月）', 'A7FX Elite (£250/माह)', 'A7FX Elite (250 £/mes)', 'A7FX Elite (250 £/mois)', 'A7FX Elite (250 £/شهر)', 'A7FX Elite (£250/মাস)', 'A7FX Elite (£250/mês)', 'A7FX Elite (£250/мес)', 'A7FX Elite (£250/ماہ)'),
  seed('community.subModal.planFreeTitle', 'Free Monthly', '免费月度', 'मासिक मुफ़्त', 'Gratis mensual', 'Gratuit mensuel', 'مجاني شهري', 'মাসিক ফ্রি', 'Grátis mensal', 'Бесплатно в месяц', 'مفت ماہانہ'),
  seed('community.subModal.perMonth', 'per month', '每月', 'प्रति माह', 'al mes', 'par mois', 'شهريًا', 'প্রতি মাসে', 'por mês', 'в месяц', 'فی ماہ'),
  seed('community.subModal.freeFeat1', '✅ General, welcome & announcements', '✅ 综合、欢迎与公告频道', '✅ सामान्य, स्वागत और घोषणाएँ', '✅ General, bienvenida y anuncios', '✅ Général, accueil et annonces', '✅ عام وترحيب وإعلانات', '✅ সাধারণ, স্বাগতম ও ঘোষণা', '✅ Geral, boas-vindas e avisos', '✅ Общее, приветствие и объявления', '✅ عمومی، خوش آمدید، اعلانات'),
  seed('community.subModal.freeFeat2', '✅ No payment required', '✅ 无需付款', '✅ भुगतान नहीं', '✅ Sin pago', '✅ Sans paiement', '✅ دون دفع', '✅ পেমেন্ট লাগে না', '✅ Sem pagamento', '✅ Без оплаты', '✅ ادائیگی نہیں'),
  seed('community.subModal.freeFeat3', '✅ Instant access to community', '✅ 即时访问社区', '✅ तुरंत समुदाय पहुँच', '✅ Acceso instantáneo', '✅ Accès instantané', '✅ وصول فوري', '✅ তাৎক্ষণিক অ্যাক্সেস', '✅ Acesso imediato', '✅ Мгновенный доступ', '✅ فوری رسائی'),
  seed('community.subModal.activating', 'Activating...', '开通中...', 'सक्रिय हो रहा...', 'Activando...', 'Activation...', 'جارٍ التفعيل...', 'সক্রিয় হচ্ছে...', 'Ativando...', 'Активация...', 'فعال ہو رہا...'),
  seed('community.subModal.getFreeMonthly', 'Get Free Monthly', '获取免费月度', 'मुफ़्त मासिक लें', 'Obtener gratis', 'Obtenir gratuit', 'احصل على المجاني', 'ফ্রি মাসিক নিন', 'Obter grátis', 'Получить бесплатно', 'مفت ماہانہ حاصل کریں'),
  seed('community.subModal.badgeRequired', 'REQUIRED', '必选', 'आवश्यक', 'OBLIGATORIO', 'OBLIGATOIRE', 'مطلوب', 'প্রয়োজন', 'OBRIGATÓRIO', 'ОБЯЗАТЕЛЬНО', 'لازمی'),
  seed('community.subModal.badgeElite', 'ELITE', '精英', 'एलीट', 'ÉLITE', 'ÉLITE', 'نخبة', 'এলিট', 'ELITE', 'ЭЛИТА', 'ایلیٹ'),
  seed('community.subModal.premiumCardTitle', 'Aura FX', 'Aura FX', 'Aura FX', 'Aura FX', 'Aura FX', 'Aura FX', 'Aura FX', 'Aura FX', 'Aura FX', 'Aura FX'),
  seed('community.subModal.premiumFeat1', '✅ Access to premium channels', '✅ 高级频道访问', '✅ प्रीमियम चैनल', '✅ Canales premium', '✅ Canaux premium', '✅ قنوات بريميوم', '✅ প্রিমিয়াম চ্যানেল', '✅ Canais premium', '✅ Премиум-каналы', '✅ پریمیم چینلز'),
  seed('community.subModal.premiumFeat2', '✅ Market analysis', '✅ 市场分析', '✅ बाज़ार विश्लेषण', '✅ Análisis de mercado', '✅ Analyse de marché', '✅ تحليل السوق', '✅ বাজার বিশ্লেষণ', '✅ Análise de mercado', '✅ Анализ рынка', '✅ مارکیٹ تجزیہ'),
  seed('community.subModal.premiumFeat3', '✅ Community access', '✅ 社区访问', '✅ समुदाय पहुँच', '✅ Acceso a la comunidad', '✅ Accès communauté', '✅ وصول للمجتمع', '✅ কমিউনিটি অ্যাক্সেস', '✅ Acesso à comunidade', '✅ Доступ к сообществу', '✅ کمیونٹی رسائی'),
  seed('community.subModal.premiumFeat4', '✅ Weekly Briefs', '✅ 每周简报', '✅ साप्ताहिक ब्रीफ', '✅ Resúmenes semanales', '✅ Briefs hebdo', '✅ ملخصات أسبوعية', '✅ সাপ্তাহিক ব্রিফ', '✅ Briefs semanais', '✅ Еженедельные брифы', '✅ ہفتہ وار بریف'),
  seed('community.subModal.premiumFeat5', '✅ Premium AURA AI', '✅ 高级 AURA AI', '✅ प्रीमियम AURA AI', '✅ AURA AI premium', '✅ AURA AI premium', '✅ AURA AI المميز', '✅ প্রিমিয়াম AURA AI', '✅ AURA AI premium', '✅ Премиум AURA AI', '✅ پریمیم AURA AI'),
  seed('community.subModal.selectAura', 'Select Aura FX', '选择 Aura FX', 'Aura FX चुनें', 'Elegir Aura FX', 'Choisir Aura FX', 'اختر Aura FX', 'Aura FX বেছে নিন', 'Selecionar Aura FX', 'Выбрать Aura FX', 'Aura FX منتخب'),
  seed('community.subModal.eliteCardTitle', 'A7FX Elite', 'A7FX 精英', 'A7FX Elite', 'A7FX Elite', 'A7FX Elite', 'A7FX Elite', 'A7FX Elite', 'A7FX Elite', 'A7FX Elite', 'A7FX Elite'),
  seed('community.subModal.eliteFeat1', '✅ Everything in Aura FX', '✅ 包含 Aura FX 全部权益', '✅ Aura FX में सब कुछ', '✅ Todo en Aura FX', '✅ Tout dans Aura FX', '✅ كل مزايا Aura FX', '✅ Aura FX-এর সব', '✅ Tudo do Aura FX', '✅ Всё из Aura FX', '✅ Aura FX کی تمام سہولتیں'),
  seed('community.subModal.eliteFeat2', '✅ Elite-only channels', '✅ 精英专属频道', '✅ केवल एलीट चैनल', '✅ Canales solo élite', '✅ Canaux élite', '✅ قنوات للنخبة', '✅ শুধু এলিট চ্যানেল', '✅ Canais só elite', '✅ Каналы только для элиты', '✅ صرف ایلیٹ چینل'),
  seed('community.subModal.eliteFeat3', '✅ Direct founder access', '✅ 创始人直连', '✅ संस्थापक तक पहुँच', '✅ Acceso al fundador', '✅ Accès fondateur', '✅ وصول للمؤسس', '✅ প্রতিষ্ঠাতা অ্যাক্সেস', '✅ Acesso ao fundador', '✅ Доступ к основателю', '✅ بانی تک رسائی'),
  seed('community.subModal.eliteFeat4', '✅ Daily Briefs', '✅ 每日简报', '✅ दैनिक ब्रीफ', '✅ Resúmenes diarios', '✅ Briefs quotidiens', '✅ ملخصات يومية', '✅ দৈনিক ব্রিফ', '✅ Briefs diários', '✅ Ежедневные брифы', '✅ روزانہ بریف'),
  seed('community.subModal.eliteFeat5', '✅ Weekly Briefs', '✅ 每周简报', '✅ साप्ताहिक ब्रीफ', '✅ Resúmenes semanales', '✅ Briefs hebdo', '✅ ملخصات أسبوعية', '✅ সাপ্তাহিক ব্রিফ', '✅ Briefs semanais', '✅ Еженедельные брифы', '✅ ہفتہ وار بریف'),
  seed('community.subModal.eliteFeat6', '✅ Premium AURA AI', '✅ 高级 AURA AI', '✅ प्रीमियम AURA AI', '✅ AURA AI premium', '✅ AURA AI premium', '✅ AURA AI المميز', '✅ প্রিমিয়াম AURA AI', '✅ AURA AI premium', '✅ Премиум AURA AI', '✅ پریمیم AURA AI'),
  seed('community.subModal.selectA7fx', 'Select A7FX Elite', '选择 A7FX 精英', 'A7FX Elite चुनें', 'Elegir A7FX Elite', 'Choisir A7FX Elite', 'اختر A7FX Elite', 'A7FX Elite বেছে নিন', 'Selecionar A7FX Elite', 'Выбрать A7FX Elite', 'A7FX Elite منتخب'),
  seed('community.subModal.footerNote', 'Cancel anytime ⬢ No hidden fees ⬢ Switch plans anytime', '随时取消 ⬢ 无隐藏费用 ⬢ 可随时更换方案', 'कभी रद्द करें ⬢ कोई छिपी फीस नहीं ⬢ प्लान बदलें', 'Cancela cuando quieras ⬢ Sin cargos ocultos ⬢ Cambia de plan', 'Annulez quand vous voulez ⬢ Pas de frais cachés ⬢ Changez de plan', 'إلغاء في أي وقت ⬢ بدون رسوم خفية ⬢ غيّر الخطة', 'যেকোনো সময় বাতিল ⬢ গোপন ফি নেই ⬢ প্লান বদলান', 'Cancele quando quiser ⬢ Sem taxas ocultas ⬢ Troque de plano', 'Отмена в любой момент ⬢ Без скрытых платежей ⬢ Смена плана', 'کسی بھی وقت منسوخ ⬢ کوئی چھپی فیس نہیں ⬢ پلان بدلیں'),
  seed('community.banner.paymentFailedTitle', '⚠️ Payment Failed - Access Restricted', '⚠️ 支付失败 — 访问受限', '⚠️ भुगतान विफल — पहुँच सीमित', '⚠️ Pago fallido — acceso restringido', '⚠️ Paiement échoué — accès limité', '⚠️ فشل الدفع — وصول مقيد', '⚠️ পেমেন্ট ব্যর্থ — অ্যাক্সেস সীমিত', '⚠️ Pagamento falhou — acesso restrito', '⚠️ Платёж не прошёл — доступ ограничен', '⚠️ ادائیگی ناکام — رسائی محدود'),
  seed('community.banner.paymentFailedDefault', 'Your payment has failed. Please update your payment method to continue using the community.', '支付失败。请更新付款方式以继续使用社区。', 'भुगतान विफल। जारी रखने के लिए विधि अपडेट करें।', 'El pago falló. Actualiza tu método de pago.', 'Le paiement a échoué. Mettez à jour votre moyen de paiement.', 'فشل الدفع. حدّث طريقة الدفع.', 'পেমেন্ট ব্যর্থ। পদ্ধতি আপডেট করুন।', 'Pagamento falhou. Atualize o método.', 'Платёж не прошёл. Обновите способ оплаты.', 'ادائیگی ناکام۔ طریقہ اپ ڈیٹ کریں۔'),
  seed('community.banner.updatePayment', 'UPDATE PAYMENT', '更新付款', 'भुगतान अपडेट', 'ACTUALIZAR PAGO', 'METTRE À JOUR LE PAIEMENT', 'تحديث الدفع', 'পেমেন্ট আপডেট', 'ATUALIZAR PAGAMENTO', 'ОБНОВИТЬ ОПЛАТУ', 'ادائیگی اپ ڈیٹ'),
  seed('community.banner.contactSupportBtn', 'CONTACT SUPPORT', '联系支持', 'सहायता से संपर्क', 'CONTACTAR SOPORTE', 'CONTACTER LE SUPPORT', 'اتصل بالدعم', 'সাপোর্ট যোগাযোগ', 'CONTATAR SUPORTE', 'СВЯЗАТЬСЯ С ПОДДЕРЖКОЙ', 'سپورٹ سے رابطہ'),
  seed('community.banner.subscribeTitle', 'Subscribe to Access Full Community', '订阅以解锁完整社区', 'पूर्ण समुदाय के लिए सदस्यता', 'Suscríbete para acceder', 'Abonnez-vous pour accéder', 'اشترك للوصول الكامل', 'সম্পূর্ণ কমিউনিটির জন্য সাবস্ক্রাইব', 'Assine para acessar tudo', 'Подпишитесь для полного доступа', 'مکمل کمیونٹی کے لیے سبسکرائب'),
  seed('community.banner.subscribeSubtitle', 'Subscribe to access the community - Free monthly, Premium (£99/month), or Elite (£250/month)', '订阅后可访问社区：免费月度、高级（£99/月）或精英（£250/月）', 'मुफ़्त, प्रीमियम (£99/माह), या एलीट (£250/माह)', 'Gratis, Premium (99 £/mes) o Élite (250 £/mes)', 'Gratuit, Premium (99 £/mois) ou Élite (250 £/mois)', 'مجاني أو بريميوم (99 £) أو نخبة (250 £)', 'ফ্রি, প্রিমিয়াম (£৯৯) বা এলিট (£২৫০)', 'Grátis, Premium (£99) ou Elite (£250)', 'Бесплатно, Premium (£99) или Elite (£250)', 'مفت، پریمیم (£۹۹) یا ایلیٹ (£۲۵۰)'),
  seed('community.banner.choosePlan', 'CHOOSE PLAN', '选择方案', 'योजना चुनें', 'ELEGIR PLAN', 'CHOISIR UN PLAN', 'اختر الخطة', 'প্ল্যান বেছে নিন', 'ESCOLHER PLANO', 'ВЫБРАТЬ ПЛАН', 'پلان منتخب'),
  seed('community.overlay.subscribeTitle', 'Subscribe to Access Community', '订阅以访问社区', 'समुदाय तक पहुँच के लिए सदस्यता', 'Suscríbete para la comunidad', 'Abonnez-vous à la communauté', 'اشترك للوصول للمجتمع', 'কমিউনিটি অ্যাক্সেসের জন্য', 'Assine para acessar', 'Подпишитесь для доступа', 'کمیونٹی تک رسائی کے لیے'),
  seed('community.overlay.subscribeBody', 'To access the community, you need to subscribe. Click here to subscribe and get 3 months free, then just £99/month.', '要访问社区，您需要订阅。点击订阅可享优惠（具体以结账页为准）。', 'समुदाय के लिए सदस्यता आवश्यक। सदस्यता लें।', 'Necesitas suscribirte para acceder. Pulsa para continuar.', 'Un abonnement est requis. Cliquez pour continuer.', 'يلزم الاشتراك للوصول. انقر للمتابعة.', 'অ্যাক্সেসের জন্য সাবস্ক্রিপশন লাগবে। ক্লিক করুন।', 'É necessário assinar. Clique para continuar.', 'Нужна подписка. Нажмите, чтобы продолжить.', 'رسائی کے لیے سبسکرپشن درکار۔ کلک کریں۔'),
  seed('community.overlay.subscribeNow', 'Subscribe Now', '立即订阅', 'अभी सदस्यता लें', 'Suscribirse ahora', "S'abonner", 'اشترك الآن', 'এখন সাবস্ক্রাইব', 'Assinar agora', 'Подписаться сейчас', 'ابھی سبسکرائب'),
  seed('community.overlay.alreadyPaid', "I've Already Paid - Contact Support", '我已付款 — 联系支持', 'मैंने भुगतान किया — सहायता', 'Ya pagué — contactar soporte', 'Déjà payé — contacter le support', 'دفعت — اتصل بالدعم', 'পে করেছি — সাপোর্ট', 'Já paguei — suporte', 'Уже оплатил(а) — поддержка', 'ادا کر چکا — سپورٹ'),
  seed('community.accessModal.title', 'Subscription Required', '需要订阅', 'सदस्यता आवश्यक', 'Suscripción requise', 'Abonnement requis', 'يلزم الاشتراك', 'সাবস্ক্রিপশন প্রয়োজন', 'Assinatura necessária', 'Требуется подписка', 'سبسکرپشن ضروری'),
  seed('community.accessModal.bodyPremium', 'This channel requires an Aura FX Premium subscription (£99/month) to access.', '访问此频道需要 Aura FX 高级订阅（£99/月）。', 'इस चैनल के लिए Aura FX Premium (£99/माह) चाहिए।', 'Este canal requiere Aura FX Premium (99 £/mes).', 'Ce canal nécessite Aura FX Premium (99 £/mois).', 'يتطلب Aura FX Premium (99 £/شهر).', 'এই চ্যানেলের জন্য Aura FX Premium (£৯৯/মাস)।', 'Este canal exige Aura FX Premium (£99/mês).', 'Нужна подписка Aura FX Premium (£99/мес).', 'اس چینل کے لیے Aura FX Premium (£۹۹/ماہ)۔'),
  seed('community.accessModal.bodyA7fx', 'This channel requires an A7FX Elite subscription (£250/month) to access.', '访问此频道需要 A7FX 精英订阅（£250/月）。', 'इस चैनल के लिए A7FX Elite (£250/माह) चाहिए।', 'Este canal requiere A7FX Elite (250 £/mes).', 'Ce canal nécessite A7FX Elite (250 £/mois).', 'يتطلب A7FX Elite (250 £/شهر).', 'এই চ্যানেলের জন্য A7FX Elite (£২৫০/মাস)।', 'Este canal exige A7FX Elite (£250/mês).', 'Нужна подписка A7FX Elite (£250/мес).', 'اس چینل کے لیے A7FX Elite (£۲۵۰/ماہ)۔'),
  seed('community.accessModal.statusFree', 'Your Status: Free User', '您的状态：免费用户', 'स्थिति: मुफ़्त उपयोगकर्ता', 'Tu estado: usuario gratuito', 'Statut : utilisateur gratuit', 'حالتك: مستخدم مجاني', 'অবস্থা: ফ্রি ব্যবহারকারী', 'Seu status: usuário gratuito', 'Статус: бесплатный пользователь', 'حالت: مفت صارف'),
  seed('community.accessModal.statusPremium', 'Your Status: Premium User', '您的状态：高级会员', 'स्थिति: प्रीमियम', 'Estado: Premium', 'Statut : Premium', 'حالتك: بريميوم', 'অবস্থা: প্রিমিয়াম', 'Status: Premium', 'Статус: Premium', 'حالت: پریمیم'),
  seed('community.accessModal.statusElite', 'Your Status: A7FX Elite User', '您的状态：A7FX 精英用户', 'स्थिति: A7FX Elite', 'Estado: A7FX Elite', 'Statut : A7FX Elite', 'حالتك: A7FX Elite', 'অবস্থা: A7FX Elite', 'Status: A7FX Elite', 'Статус: A7FX Elite', 'حالت: A7FX Elite'),
  seed('community.accessModal.upgradePremium', 'Upgrade to Premium to unlock this channel and access exclusive trading content.', '升级到高级以解锁此频道并获取独家交易内容。', 'प्रीमियम में अपग्रेड करें।', 'Mejora a Premium para desbloquear.', 'Passez à Premium pour débloquer.', 'رقِّي إلى بريميوم لفتح القناة.', 'প্রিমিয়ামে আপগ্রেড করুন।', 'Faça upgrade para Premium.', 'Оформите Premium, чтобы открыть.', 'پریمیم پر اپ گریڈ کریں۔'),
  seed('community.accessModal.upgradeElite', 'Upgrade to A7FX Elite to unlock this channel and access the most exclusive trading content and signals.', '升级到 A7FX 精英以解锁此频道及独家内容与信号。', 'A7FX Elite में अपग्रेड करें।', 'Mejora a A7FX Elite para desbloquear.', 'Passez à A7FX Elite.', 'رقِّي إلى A7FX Elite.', 'A7FX Elite-এ আপগ্রেড।', 'Faça upgrade para A7FX Elite.', 'Оформите A7FX Elite.', 'A7FX Elite پر اپ گریڈ۔'),
  seed('community.accessModal.premiumToElite', 'This channel requires A7FX Elite. Upgrade from Premium to Elite to access the most exclusive content.', '此频道需要 A7FX 精英。请从高级升级到精英。', 'A7FX Elite चाहिए। प्रीमियम से अपग्रेड करें।', 'Requiere A7FX Elite. Mejora desde Premium.', 'A7FX Elite requis. Passez depuis Premium.', 'يتطلب A7FX Elite. ترقية من بريميوم.', 'A7FX Elite লাগবে। প্রিমিয়াম থেকে আপগ্রেড।', 'Exige A7FX Elite. Faça upgrade do Premium.', 'Нужен A7FX Elite. Переход с Premium.', 'A7FX Elite درکار۔ پریمیم سے اپ گریڈ۔'),
  seed('community.accessModal.inactiveSub', 'Your subscription may be inactive or expired. Please check your subscription status or renew to access this channel.', '您的订阅可能未激活或已过期。请检查订阅状态或续费。', 'आपकी सदस्यता निष्क्रिय हो सकती है। नवीकरण करें।', 'Tu suscripción puede estar inactiva. Renueva.', 'Votre abonnement est peut-être expiré. Renouvelez.', 'قد يكون اشتراكك غير نشط. جدّد.', 'সাবস্ক্রিপশন নিষ্ক্রিয় হতে পারে। নবায়ন করুন।', 'Sua assinatura pode estar inativa. Renove.', 'Подписка неактивна. Продлите.', 'سبسکرپشن غیر فعال ہو سکتی ہے۔ تجدید کریں۔'),
  seed('community.accessModal.subscribeBtn', 'Subscribe Now', '立即订阅', 'अभी सदस्यता लें', 'Suscribirse ahora', "S'abonner", 'اشترك الآن', 'এখন সাবস্ক্রাইব', 'Assinar agora', 'Подписаться', 'سبسکرائب'),
  seed('community.accessBlock.requires', 'This channel requires {{plan}} ({{price}}) to access.', '访问此频道需要 {{plan}}（{{price}}）。', 'इस चैनल के लिए {{plan}} ({{price}}) चाहिए।', 'Este canal requiere {{plan}} ({{price}}).', 'Ce canal nécessite {{plan}} ({{price}}).', 'يتطلب {{plan}} ({{price}}).', 'এই চ্যানেলের জন্য {{plan}} ({{price}})।', 'Este canal requer {{plan}} ({{price}}).', 'Нужны {{plan}} ({{price}}).', 'اس چینل کے لیے {{plan}} ({{price}})۔'),
  seed('community.accessBlock.subscribeWithPrice', 'Subscribe Now - {{price}}', '立即订阅 - {{price}}', 'अभी सदस्यता - {{price}}', 'Suscribirse ahora - {{price}}', "S'abonner - {{price}}", 'اشترك الآن - {{price}}', 'এখন সাবস্ক্রাইব - {{price}}', 'Assinar agora - {{price}}', 'Подписаться - {{price}}', 'سبسکرائب - {{price}}'),
  seed('community.planName.premium', 'Aura FX Premium', 'Aura FX 高级', 'Aura FX Premium', 'Aura FX Premium', 'Aura FX Premium', 'Aura FX Premium', 'Aura FX Premium', 'Aura FX Premium', 'Aura FX Premium', 'Aura FX Premium'),
  seed('community.planName.a7fx', 'A7FX Elite', 'A7FX 精英', 'A7FX Elite', 'A7FX Elite', 'A7FX Elite', 'A7FX Elite', 'A7FX Elite', 'A7FX Elite', 'A7FX Elite', 'A7FX Elite'),
  seed('community.price.premium', '£99/month', '£99/月', '£99/माह', '99 £/mes', '99 £/mois', '99 £/شهر', '£৯৯/মাস', '£99/mês', '£99/мес', '£۹۹/ماہ'),
  seed('community.price.a7fx', '£250/month', '£250/月', '£250/माह', '250 £/mes', '250 £/mois', '250 £/شهر', '£২৫০/মাস', '£250/mês', '£250/мес', '£۲۵۰/ماہ'),
  seed('community.context.edit', 'Edit', '编辑', 'संपादित', 'Editar', 'Modifier', 'تعديل', 'সম্পাদনা', 'Editar', 'Изменить', 'ترمیم'),
  seed('community.context.reply', 'Reply', '回复', 'उत्तर', 'Responder', 'Répondre', 'رد', 'উত্তর', 'Responder', 'Ответить', 'جواب'),
  seed('community.context.addReaction', 'Add Reaction', '添加表情回应', 'प्रतिक्रिया जोड़ें', 'Añadir reacción', 'Ajouter une réaction', 'إضافة تفاعل', 'রিয়াকশন যোগ', 'Adicionar reação', 'Добавить реакцию', 'ری ایکشن'),
  seed('community.context.copyText', 'Copy message text', '复制消息文本', 'संदेश टेक्स्ट कॉपी', 'Copiar texto', 'Copier le texte', 'نسخ نص الرسالة', 'বার্তার টেক্সট কপি', 'Copiar texto', 'Копировать текст', 'متن کاپی'),
  seed('community.file.unknownName', 'Unknown', '未知', 'अज्ञात', 'Desconocido', 'Inconnu', 'غير معروف', 'অজানা', 'Desconhecido', 'Неизвестно', 'نامعلوم'),
  seed('community.mention.slugFallback', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user'),
  seed('community.file.unknownFile', 'Unknown file', '未知文件', 'अज्ञात फ़ाइल', 'Archivo desconocido', 'Fichier inconnu', 'ملف غير معروف', 'অজানা ফাইল', 'Arquivo desconhecido', 'Неизвестный файл', 'نامعلوم فائل'),
  seed('community.channelContext.editChannel', 'Edit Channel', '编辑频道', 'चैनल संपादित करें', 'Editar canal', 'Modifier le canal', 'تعديل القناة', 'চ্যানেল সম্পাদনা', 'Editar canal', 'Изменить канал', 'چینل میں ترمیم'),
  seed('community.channelContext.deleteChannel', 'Delete Channel', '删除频道', 'चैनल हटाएँ', 'Eliminar canal', 'Supprimer le canal', 'حذف القناة', 'চ্যানেল মুছুন', 'Excluir canal', 'Удалить канал', 'چینل حذف'),
  seed('community.categoryContext.editCategory', 'Edit Category', '编辑分类', 'श्रेणी संपादित करें', 'Editar categoría', 'Modifier la catégorie', 'تعديل الفئة', 'ক্যাটাগরি সম্পাদনা', 'Editar categoria', 'Изменить категорию', 'زمرہ میں ترمیم'),
  seed('community.categoryContext.deleteCategory', 'Delete Category', '删除分类', 'श्रेणी हटाएँ', 'Eliminar categoría', 'Supprimer la catégorie', 'حذف الفئة', 'ক্যাটাগরি মুছুন', 'Excluir categoria', 'Удалить категорию', 'زمرہ حذف'),
  seed('community.notify.mentionTitle', 'You were mentioned in #{{channel}}', '您在 #{{channel}} 中被提及', 'आपको #{{channel}} में मेंशन किया गया', 'Te mencionaron en #{{channel}}', 'Vous avez été mentionné dans #{{channel}}', 'تمت الإشارة إليك في #{{channel}}', 'আপনাকে #{{channel}}-এ উল্লেখ করা হয়েছে', 'Você foi mencionado em #{{channel}}', 'Вас упомянули в #{{channel}}', 'آپ کا #{{channel}} میں ذکر ہوا'),
  seed('community.notify.messageTitle', 'New message in #{{channel}}', '#{{channel}} 中的新消息', '#{{channel}} में नया संदेश', 'Nuevo mensaje en #{{channel}}', 'Nouveau message dans #{{channel}}', 'رسالة جديدة في #{{channel}}', '#{{channel}}-এ নতুন বার্তা', 'Nova mensagem em #{{channel}}', 'Новое сообщение в #{{channel}}', '#{{channel}} میں نیا پیغام'),
  seed('community.notify.senderFallback', 'Someone', '某人', 'कोई', 'Alguien', 'Quelqu’un', 'شخص ما', 'কেউ', 'Alguém', 'Кто-то', 'کوئی'),
  seed('community.notify.unnamedChannel', 'a channel', '某个频道', 'एक चैनल', 'un canal', 'un canal', 'قناة', 'একটি চ্যানেল', 'um canal', 'канал', 'ایک چینل')
);

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n');
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

const outPath = path.join(__dirname, 'i18n-part7.mjs');
fs.writeFileSync(outPath, header + rows.map(rowToStr).join('\n') + footer, 'utf8');
console.log('Wrote', outPath, 'rows:', rows.length);
