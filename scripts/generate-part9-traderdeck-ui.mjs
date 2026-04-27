/**
 * One-off generator: writes scripts/i18n-part9-traderdeck-ui.mjs
 * Run: node scripts/generate-part9-traderdeck-ui.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { macroGenRows } from './i18n-part9-macro-gen-fragment.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {[string, string, string, string, string, string, string, string, string, string, string][]} */
const T = [
  // --- Market Outlook section titles ---
  ['traderDeck.outlook.sectionAuraMarketRegime', 'Aura Market Regime', 'Aura 市场体制', 'Aura बाज़ार व्यवस्था', 'Régimen de mercado Aura', 'Régime de marché Aura', 'نظام السوق Aura', 'Aura বাজার রেজিম', 'Regime de mercado Aura', 'Рыночный режим Aura', 'Aura مارکیٹ نظام'],
  ['traderDeck.outlook.sectionSessionContext', 'Session Context', '会话背景', 'सत्र संदर्भ', 'Contexto de sesión', 'Contexte de séance', 'سياق الجلسة', 'সেশন প্রেক্ষাপট', 'Contexto da sessão', 'Контекст сессии', 'سیشن سیاق'],
  ['traderDeck.outlook.sectionKeyDrivers', 'Key Market Drivers', '关键市场驱动', 'मुख्य बाज़ार चालक', 'Impulsores clave', 'Moteurs du marché', 'محركات السوق الرئيسية', 'প্রধান বাজার চালক', 'Principais drivers', 'Ключевые драйверы', 'اہم مارکیٹ محرکات'],
  ['traderDeck.outlook.sectionMarketStructureMap', 'Market Structure Map', '市场结构图', 'बाज़ार संरचना मानचित्र', 'Mapa de estructura', 'Carte de structure', 'خريطة البنية', 'বাজার কাঠামো মানচিত্র', 'Mapa de estrutura', 'Карта структуры', 'مارکیٹ ڈھانچہ نقشہ'],
  ['traderDeck.outlook.sectionCrossAssetSignals', 'Cross-Asset Signals', '跨资产信号', 'क्रॉस-एसेट संकेत', 'Señales multiactivo', 'Signaux multi-actifs', 'إشارات متعددة الأصول', 'ক্রস-অ্যাসেট সংকেত', 'Sinais multiativos', 'Кросс-активные сигналы', 'کراس-اثاثہ سگنل'],
  ['traderDeck.outlook.sectionInstrumentSnapshots', 'Instrument Snapshots', '品种快照', 'इंस्ट्रूमेंट स्नैपशॉट', 'Instantáneas', 'Instantanés', 'لقطات الأدوات', 'ইন্সট্রুমেন্ট স্ন্যাপশট', 'Instantâneos', 'Снимки по инструментам', 'آلات کی جھلکیاں'],
  ['traderDeck.outlook.sectionMarketImplications', 'Market Implications', '市场含义', 'बाज़ार निहितार्थ', 'Implicaciones', 'Implications', 'الآثار', 'বাজার প্রভাব', 'Implicações', 'Импликации', 'مارکیٹ مضمرات'],
  ['traderDeck.outlook.sectionTraderFocus', 'Trader Focus', '交易者焦点', 'ट्रेडर फोकस', 'Enfoque del trader', 'Focus trader', 'تركيز المتداول', 'ট্রেডার ফোকাস', 'Foco do trader', 'Фокус трейдера', 'تاجر کی توجہ'],
  ['traderDeck.outlook.sectionAuraMarketPulse', 'Aura Market Pulse', 'Aura 市场脉搏', 'Aura बाज़ार नाड़ी', 'Pulso de mercado Aura', 'Pouls du marché Aura', 'نبض السوق Aura', 'Aura বাজার পাল্স', 'Pulso Aura', 'Пульс рынка Aura', 'Aura مارکیٹ نبض'],
  ['traderDeck.outlook.sectionMarketRiskEngine', 'Market Risk Engine', '市场风险引擎', 'बाज़ार जोखिम इंजन', 'Motor de riesgo', 'Moteur de risque', 'محرك المخاطر', 'ঝুঁকি ইঞ্জিন', 'Motor de risco', 'Движок рисков', 'خطر انجن'],
  ['traderDeck.outlook.sectionTradeExpressionMatrix', 'Trade Expression Matrix', '交易表达矩阵', 'ट्रेड अभिव्यक्ति मैट्रिक्स', 'Matriz de expresión', 'Matrice d’expression', 'مصفوفة التعبير', 'ট্রেড এক্সপ্রেশন ম্যাট্রিক্স', 'Matriz de expressão', 'Матрица выражения', 'تجارتی اظہار میٹرکس'],
  ['traderDeck.outlook.tradeMatrixExpression', 'Expression', '表达方式', 'अभिव्यक्ति', 'Expresión', 'Mise en œuvre', 'التعبير', 'প্রকাশ', 'Expressão', 'Выражение', 'اظہار'],
  ['traderDeck.outlook.tradeMatrixWhy', 'Why', '原因', 'क्यों', 'Por qué', 'Pourquoi', 'لماذا', 'কেন', 'Por quê', 'Почему', 'کیوں'],

  ['traderDeck.outlook.wordMixedOnly', 'Mixed', '混合', 'मिश्र', 'Mixto', 'Mixte', 'مختلط', 'মিশ্র', 'Misto', 'Смешанный', 'مخلوط'],
  ['traderDeck.outlook.derivSentimentGlue', ' · sentiment {{s}}', ' · 情绪 {{s}}', ' · भावना {{s}}', ' · sentimiento {{s}}', ' · orientation {{s}}', ' · المشاعر {{s}}', ' · অনুভূতি {{s}}', ' · sentimento {{s}}', ' · настроение {{s}}', ' · جذبات {{s}}'],

  ['traderDeck.outlook.structureTrendState', 'Trend State', '趋势状态', 'ट्रेंड स्थिति', 'Estado de tendencia', 'État de tendance', 'حالة الاتجاه', 'ট্রেন্ড অবস্থা', 'Estado da tendência', 'Состояние тренда', 'رجحان کی حالت'],
  ['traderDeck.outlook.structureVolatilityRegime', 'Volatility Regime', '波动制度', 'अस्थिरता व्यवस्था', 'Régimen de volatilidad', 'Régime de volatilité', 'نظام التقلب', 'অস্থিরতা রেজিম', 'Regime de volatilidade', 'Режим волатильности', 'اتار چڑھاؤ نظام'],
  ['traderDeck.outlook.structureLiquidityCondition', 'Liquidity Condition', '流动性状况', 'तरलता स्थिति', 'Liquidez', 'Liquidité', 'السيولة', 'লিকুইডিটি', 'Liquidez', 'Ликвидность', 'سیالیت کی حالت'],
  ['traderDeck.outlook.structureCorrelationRegime', 'Correlation Regime', '相关性制度', 'सहसंबंध व्यवस्था', 'Correlación', 'Corrélation', 'الارتباط', 'সহসংযোগ', 'Correlação', 'Корреляция', 'باہمی تعلق'],
  ['traderDeck.outlook.structureMarketBreadth', 'Market Breadth', '市场广度', 'बाज़ार चौड़ाई', 'Amplitud', 'Largeur du marché', 'اتساع السوق', 'বাজার প্রস্থ', 'Amplitude', 'Ширина рынка', 'مارکیٹ وسعت'],
  ['traderDeck.outlook.structurePositioningPressure', 'Positioning Pressure', '头寸压力', 'स्थिति दबाव', 'Presión de posición', 'Pression de positionnement', 'ضغط المراكز', 'অবস্থান চাপ', 'Pressão de posição', 'Давление позиций', 'پوزیشن دباؤ'],
  ['traderDeck.outlook.structureInsight', 'Structure Insight', '结构洞察', 'संरचना अंतर्दृष्टि', 'Insight estructural', 'Lecture structurelle', 'رؤية البنية', 'কাঠামো অন্তর্দৃষ্টি', 'Insight estrutural', 'Инсайт структуры', 'ڈھانچے کی بصیرت'],
  ['traderDeck.outlook.structureWhatThisMeans', 'What This Means', '这意味着', 'इसका अर्थ', 'Qué implica', 'Ce que cela signifie', 'ماذا يعني', 'এর অর্থ', 'O que significa', 'Что это значит', 'اس کا مطلب'],
  ['traderDeck.outlook.structureWatchFor', 'Watch For', '关注', 'ध्यान दें', 'Vigilar', 'À surveiller', 'راقب', 'দেখুন', 'Observar', 'Следить за', 'دیکھیں'],

  ['traderDeck.outlook.kickerScenario', 'Scenario', '情景', 'परिदृश्य', 'Escenario', 'Scénario', 'السيناريو', 'দৃশ্য', 'Cenário', 'Сценарий', 'منظرنامہ'],
  ['traderDeck.outlook.kickerKeyTheme', 'Key theme', '关键主题', 'मुख्य विषय', 'Tema clave', 'Thème clé', 'الموضوع الرئيسي', 'মূল থিম', 'Tema principal', 'Ключевая тема', 'اہم موضوع'],
  ['traderDeck.outlook.kickerActionable', 'Actionable', '可执行', 'कार्रवाई योग्य', 'Accionable', 'Actionnable', 'قابل للتنفيذ', 'কার্যকর', 'Acionável', 'Практично', 'عمل پذیر'],

  ['traderDeck.outlook.instrumentStructure', 'Structure', '结构', 'संरचना', 'Estructura', 'Structure marché', 'البنية', 'গঠন', 'Estrutura', 'Структура', 'ساخت'],
  ['traderDeck.outlook.instrumentKeyLevel', 'Key level', '关键位', 'मुख्य स्तर', 'Nivel clave', 'Niveau clé', 'المستوى الرئيسي', 'মূল স্তর', 'Nível-chave', 'Ключевой уровень', 'اہم سطح'],

  ['traderDeck.outlook.emptyChanges', 'No themes recorded. Use Edit to add.', '尚无主题。请使用编辑添加。', 'कोई थीम नहीं। जोड़ने के लिए संपादन करें।', 'Sin temas. Use Editar.', 'Aucun thème. Modifiez pour ajouter.', 'لا توجد مواضيع. عدّل للإضافة.', 'থিম নেই। সম্পাদনা করুন।', 'Sem temas. Edite para adicionar.', 'Нет тем. Добавьте в правке.', 'کوئی تھیم نہیں۔ ترمیم سے شامل کریں۔'],
  ['traderDeck.outlook.emptyFocus', 'No focus items. Use Edit to add.', '尚无焦点。请使用编辑添加。', 'कोई फोकस नहीं। संपादन से जोड़ें।', 'Sin focos. Edite.', 'Aucun focus. Modifiez.', 'لا عناصر تركيز. عدّل.', 'ফোকাস নেই। সম্পাদনা।', 'Sem focos. Edite.', 'Нет фокусов. Правка.', 'فوکس نہیں۔ ترمیم۔'],

  ['traderDeck.outlook.editAria', 'Edit content', '编辑内容', 'सामग्री संपादित करें', 'Editar contenido', 'Modifier le contenu', 'تحرير المحتوى', 'বিষয়বস্তু সম্পাদনা', 'Editar conteúdo', 'Редактировать', 'مواد میں ترمیم'],
  ['traderDeck.outlook.editButton', 'Edit', '编辑', 'संपादित करें', 'Editar', 'Modifier', 'تحرير', 'সম্পাদনা', 'Editar', 'Правка', 'ترمیم'],
  ['traderDeck.outlook.editPlaceholderDriver', 'Driver name', '驱动名称', 'ड्राइवर नाम', 'Nombre del impulsor', 'Nom du moteur', 'اسم المحرك', 'ড্রাইভারের নাম', 'Nome do driver', 'Название драйвера', 'ڈرائیور نام'],
  ['traderDeck.outlook.editPlaceholderAsset', 'Asset', '资产', 'एसेट', 'Activo', 'Actif', 'أصل', 'সম্পদ', 'Ativo', 'Актив', 'اثاثہ'],
  ['traderDeck.outlook.editPlaceholderSignal', 'Signal', '信号', 'सिग्नल', 'Señal', 'Indicateur', 'إشارة', 'সংকেত', 'Sinal', 'Сигнал', 'سگنل'],
  ['traderDeck.outlook.editPlaceholderTheme', 'Theme', '主题', 'थीम', 'Tema', 'Thème', 'الموضوع', 'থিম', 'Tema', 'Тема', 'تھیم'],
  ['traderDeck.outlook.editPlaceholderFocus', 'Focus item', '焦点项', 'फोकस आइटम', 'Elemento de foco', 'Élément de focus', 'عنصر التركيز', 'ফোকাস আইটেম', 'Item de foco', 'Фокус', 'فوکس شے'],
  ['traderDeck.outlook.editPlaceholderRisk', 'Risk factor', '风险因子', 'जोखिम कारक', 'Factor de riesgo', 'Facteur de risque', 'عامل المخاطر', 'ঝুঁকি ফ্যাক্টর', 'Fator de risco', 'Фактор риска', 'خطر عنصر'],
  ['traderDeck.outlook.editAddDriver', '+ Add driver', '+ 添加驱动', '+ ड्राइवर जोड़ें', '+ Añadir impulsor', '+ Ajouter un moteur', '+ إضافة محرك', '+ ড্রাইভার', '+ Adicionar driver', '+ Драйвер', '+ ڈرائیور'],
  ['traderDeck.outlook.editAddSignal', '+ Add signal', '+ 添加信号', '+ सिग्नल जोड़ें', '+ Añadir señal', '+ Ajouter un signal', '+ إشارة', '+ সংকেত', '+ Adicionar sinal', '+ Сигнал', '+ سگنل'],
  ['traderDeck.outlook.editAdd', '+ Add', '+ 添加', '+ जोड़ें', '+ Añadir', '+ Ajouter', '+ إضافة', '+ যোগ', '+ Adicionar', '+ Добавить', '+ شامل'],
  ['traderDeck.outlook.editImpactSuffix', '{{dir}} Impact', '{{dir}} 影响', '{{dir}} प्रभाव', 'Impacto {{dir}}', 'Impact {{dir}}', 'تأثير {{dir}}', '{{dir}} প্রভাব', 'Impacto {{dir}}', 'Влияние {{dir}}', '{{dir}} اثر'],
  ['traderDeck.outlook.editScoreRange', 'Score (0–100)', '分数（0–100）', 'स्कोर (0–100)', 'Puntuación (0–100)', 'Note (0–100)', 'النتيجة (0–100)', 'স্কোর (০–১০০)', 'Pontuação (0–100)', 'Оценка (0–100)', 'سکور (0–100)'],
  ['traderDeck.outlook.editLabelField', 'Label', '标签', 'लेबल', 'Etiqueta', 'Libellé', 'التسمية', 'লেবেল', 'Rótulo', 'Метка', 'لیبل'],
  ['traderDeck.outlook.editAriaRemove', 'Remove', '移除', 'हटाएँ', 'Quitar', 'Retirer', 'إزالة', 'সরান', 'Remover', 'Удалить', 'ہٹائیں'],
  ['traderDeck.outlook.editAriaDirection', 'Direction', '方向', 'दिशा', 'Dirección', 'Sens', 'الاتجاه', 'দিক', 'Direção', 'Направление', 'سمت'],

  ['traderDeck.outlook.sessionFallbackDeskPulse', 'Desk pulse', '桌面脉搏', 'डेस्क नाड़ी', 'Pulso del escritorio', 'Pouls du bureau', 'نبض المكتب', 'ডেস্ক পাল্স', 'Pulso da mesa', 'Пульс стола', 'ڈیسک نبض'],
  ['traderDeck.outlook.sessionFallbackLeadDriver', 'Lead driver', '主导驱动', 'प्रमुख चालक', 'Impulsor principal', 'Moteur principal', 'المحرك الرئيسي', 'প্রধান চালক', 'Driver principal', 'Ведущий драйвер', 'Lead ڈرائیور'],
  ['traderDeck.outlook.sessionFallbackCrossAsset', 'Cross-asset', '跨资产', 'क्रॉस-एसेट', 'Multiactivo', 'Multi-actifs', 'متعدد الأصول', 'ক্রস-অ্যাসেট', 'Multiativos', 'Кросс-актив', 'کراس-اثاثہ'],

  ['traderDeck.outlook.wordMixedRegime', 'Mixed regime', '混合体制', 'मिश्र व्यवस्था', 'Régimen mixto', 'Régime mixte', 'نظام مختلط', 'মিশ্র রেজিম', 'Regime misto', 'Смешанный режим', 'مخلوط نظام'],
  ['traderDeck.outlook.wordLeadDriver', 'Lead driver', '主导驱动', 'प्रमुख चालक', 'Impulsor principal', 'Moteur principal', 'المحرك الرئيسي', 'প্রধান চালক', 'Driver principal', 'Ведущий драйвер', 'Lead ڈرائیور'],
  ['traderDeck.outlook.wordCrossAsset', 'Cross-asset', '跨资产', 'क्रॉस-एसेट', 'Multiactivo', 'Multi-actifs', 'متعدد الأصول', 'ক্রস-অ্যাসেট', 'Multiativos', 'Кросс-актив', 'کراس-اثاثہ'],
  ['traderDeck.outlook.wordMarket', 'Market', '市场', 'बाज़ार', 'Mercado', 'Marché', 'السوق', 'বাজার', 'Mercado', 'Рынок', 'بازار'],

  ['traderDeck.outlook.implPrefixRiskDesk', 'Risk desk: {{level}} · score {{score}}/100', '风控台：{{level}} · 分数 {{score}}/100', 'जोखिम डेस्क: {{level}} · स्कोर {{score}}/100', 'Mesa de riesgo: {{level}} · {{score}}/100', 'Desk risques : {{level}} · score {{score}}/100', 'مكتب المخاطر: {{level}} · {{score}}/100', 'ঝুঁকি ডেস্ক: {{level}} · {{score}}/100', 'Mesa de risco: {{level}} · {{score}}/100', 'Риск-деск: {{level}} · {{score}}/100', 'خطر ڈیسک: {{level}} · {{score}}/100'],
  ['traderDeck.outlook.implPrefixVolRegime', 'Vol regime: {{state}}', '波动制度：{{state}}', 'वोल व्यवस्था: {{state}}', 'Régimen vol: {{state}}', 'Régime vol : {{state}}', 'نظام التقلب: {{state}}', 'ভোল রেজিম: {{state}}', 'Regime vol: {{state}}', 'Режим волат.: {{state}}', 'اتار نظام: {{state}}'],
  ['traderDeck.outlook.implPrefixLinkage', 'Linkage: {{text}}', '联动：{{text}}', 'लिंकेज: {{text}}', 'Enlace: {{text}}', 'Liaison : {{text}}', 'الربط: {{text}}', 'লিংকেজ: {{text}}', 'Vínculo: {{text}}', 'Связка: {{text}}', 'ربط: {{text}}'],
  ['traderDeck.outlook.implPrefixNextWindow', 'Next window: {{text}}', '下一窗口：{{text}}', 'अगली खिड़की: {{text}}', 'Próxima ventana: {{text}}', 'Fenêtre suivante : {{text}}', 'النافذة التالية: {{text}}', 'পরবর্তী উইন্ডো: {{text}}', 'Próxima janela: {{text}}', 'След. окно: {{text}}', 'اگلا ونڈو: {{text}}'],
  ['traderDeck.outlook.implPrefixTape', 'Tape:', '盘口：', 'टेप:', 'Cinta:', 'Carnet :', 'الشريط:', 'টেপ:', 'Fita:', 'Лента:', 'ٹیپ:'],
  ['traderDeck.outlook.implPrefixDeskLean', 'Desk lean:', '桌面倾向：', 'डेस्क झुकाव:', 'Sesgo del escritorio:', 'Biais du bureau :', 'ميل المكتب:', 'ডেস্ক ঝোঁক:', 'Inclinação da mesa:', 'Уклон стола:', 'ڈیسک جھکاؤ:'],
  ['traderDeck.outlook.implPrefixWatch', 'Watch · {{text}}', '关注 · {{text}}', 'ध्यान · {{text}}', 'Vigilar · {{text}}', 'Surveiller · {{text}}', 'راقب · {{text}}', 'দেখুন · {{text}}', 'Observar · {{text}}', 'Следить · {{text}}', 'دیکھیں · {{text}}'],

  ['traderDeck.outlook.derivConditionMarketRegime', 'Market regime: {{reg}}{{bias}}', '市场体制：{{reg}}{{bias}}', 'बाज़ार व्यवस्था: {{reg}}{{bias}}', 'Régimen: {{reg}}{{bias}}', 'Régime marché : {{reg}}{{bias}}', 'نظام السوق: {{reg}}{{bias}}', 'বাজার রেজিম: {{reg}}{{bias}}', 'Regime: {{reg}}{{bias}}', 'Режим рынка: {{reg}}{{bias}}', 'مارکیٹ نظام: {{reg}}{{bias}}'],
  ['traderDeck.outlook.derivThenLeadership', 'Leadership, breadth, and liquidity windows decide whether the narrative holds.', '领导力、广度与流动性窗口决定叙事是否成立。', 'नेतृत्व, चौड़ाई और तरलता की खिड़कियाँ तय करती हैं कि कथा टिकेगी या नहीं।', 'Liderazgo y liquidez deciden la narrativa.', 'Leadership et liquidité décident.', 'القيادة والسيولة تحددان السرد.', 'নেতৃত্ব ও তারল্য সিদ্ধান্ত নেয়।', 'Liderança e liquidez decidem.', 'Лидерство и ликвидность решают.', 'قیادت اور سیالیت فیصلہ کرتی ہیں۔'],
  ['traderDeck.outlook.derivImplSecondary', 'Secondary driver: {{name}} ({{impact}}).', '次要驱动：{{name}}（{{impact}}）。', 'द्वितीयक चालक: {{name}} ({{impact}})।', 'Impulsor secundario: {{name}} ({{impact}}).', 'Moteur secondaire : {{name}} ({{impact}}).', 'محرك ثانوي: {{name}} ({{impact}}).', 'গৌণ চালক: {{name}} ({{impact}})।', 'Driver secundário: {{name}} ({{impact}}).', 'Вторичный драйвер: {{name}} ({{impact}}).', 'ثانوی محرک: {{name}} ({{impact}})۔'],
  ['traderDeck.outlook.derivImplCorrelations', 'Correlations often tighten when macro headlines align across regions.', '宏观标题在各地区一致时，相关性往往会收紧。', 'जब मैक्रो शीर्षक क्षेत्रों में मेल खाते हैं तो सहसंबंध अक्सर कस जाते हैं。', 'Las correlaciones se tensan con titulares alineados.', 'Les corrélations se resserrent si les titres s’alignent.', 'تزداد الارتباطات عند توافق العناوين.', 'শিরোনাম মিললে সহসংযোগ কঠিন হয়।', 'Correlações apertam com manchetes alinhadas.', 'Корреляции усиливаются при согласованных заголовках.', 'سرخیاں میل کھائیں تو تعلق مضبوط ہوتا ہے۔'],
  ['traderDeck.outlook.derivConditionTape', 'Tape theme: {{hook}}', '盘口主题：{{hook}}', 'टेप थीम: {{hook}}', 'Tema de cinta: {{hook}}', 'Thème carnet : {{hook}}', 'موضوع الشريط: {{hook}}', 'টেপ থিম: {{hook}}', 'Tema da fita: {{hook}}', 'Тема ленты: {{hook}}', 'ٹیپ تھیم: {{hook}}'],
  ['traderDeck.outlook.derivThenCalendar', 'Calendar spacing and overlap sessions shape follow-through.', '日历间距与重叠时段影响后续走势。', 'कैलेंडर अंतराल और ओवरलैप सत्र फॉलो-थ्रू आकार देते हैं।', 'El calendario y solapes marcan el seguimiento.', 'Calendrier et chevauchement orientent la suite.', 'التداخل في الجلسات يشكل المتابعة.', 'ক্যালেন্ডার ও ওভারল্যাপ অনুসরণ গঠন করে।', 'Calendário e sobreposição moldam o follow.', 'Календарь и пересечения сессий задают продолжение.', 'کیلنڈر اور اوورلیپ سیشن اثر ڈالتے ہیں۔'],
  ['traderDeck.outlook.derivImplWatchSleeves', 'Watch sleeves: {{assets}}.', '关注板块：{{assets}}。', 'स्लीव देखें: {{assets}}।', 'Vigilar segmentos: {{assets}}.', 'Surveiller les segments : {{assets}}.', 'راقب الشرائح: {{assets}}.', 'স্লিভ দেখুন: {{assets}}।', 'Observar segmentos: {{assets}}.', 'Следить за сегментами: {{assets}}.', 'سلیوز دیکھیں: {{assets}}۔'],
  ['traderDeck.outlook.derivImplConfirmBreadth', 'Confirm with breadth and volatility regime.', '用广度与波动制度确认。', 'चौड़ाई और अस्थिरता व्यवस्था से पुष्टि करें।', 'Confirmar con amplitud y volatilidad.', 'Confirmer avec ampleur et volatilité.', 'أكد بالاتساع ونظام التقلب।', 'প্রস্থ ও অস্থিরতা দিয়ে নিশ্চিত করুন।', 'Confirmar com amplitude e vol.', 'Подтвердить шириной и волатильностью.', 'وسعت اور اتار سے تصدیق۔'],

  ['traderDeck.outlook.timelineLabelWeek', 'Week', '周', 'सप्ताह', 'Semana', 'Semaine', 'أسبوع', 'সপ্তাহ', 'Semana', 'Неделя', 'ہفتہ'],
  ['traderDeck.outlook.timelineLabelSession', 'Session', '时段', 'सत्र', 'Sesión', 'Séance', 'جلسة', 'সেশন', 'Sessão', 'Сессия', 'سیشن'],
  ['traderDeck.outlook.assetTagYields', 'Yields', '收益率', 'प्रतिफल', 'Rendimientos', 'Rendements', 'العوائد', 'ইয়িল্ড', 'Rendimentos', 'Доходности', 'پیداوار'],
  ['traderDeck.outlook.assetTagFx', 'FX', '外汇', 'विदेशी मुद्रा', 'Divisas', 'Devises', 'فوركس', 'ফরেক্স', 'Câmbio', 'Форекс', 'زر مبادلہ'],
  ['traderDeck.outlook.assetTagGold', 'Gold', '黄金', 'सोना', 'Oro', 'Or', 'الذهب', 'সোনা', 'Ouro', 'Золото', 'سونا'],
  ['traderDeck.outlook.assetTagEquities', 'Equities', '股票', 'इक्विटी', 'Rentas', 'Actions', 'الأسهم', 'ইকুইটি', 'Ações', 'Акции', ' حصص'],
  ['traderDeck.outlook.assetTagCrossAsset', 'Cross-asset', '跨资产', 'क्रॉस-एसेट', 'Multiactivo', 'Multi-actifs', 'متعدد الأصول', 'ক্রস-অ্যাসেট', 'Multiativos', 'Кросс-актив', 'کراس-اثاثہ'],

  ['traderDeck.outlook.instrumentFbCrossAsset', 'Cross-asset', '跨资产', 'क्रॉस-एसेट', 'Multiactivo', 'Multi-actifs', 'متعدد الأصول', 'ক্রস-অ্যাসেট', 'Multiativos', 'Кросс-актив', 'کراس-اثاثہ'],
  ['traderDeck.outlook.instrumentFbPosture', '{{dir}} posture versus the prior session', '相对上一时段的{{dir}}姿态', 'पिछले सत्र के मुकाबले {{dir}} मुद्रा', 'Postura {{dir}} vs sesión previa', 'Posture {{dir}} vs séance', 'وضعية {{dir}} مقابل الجلسة', 'আগের সেশনের তুলনায় {{dir}}', 'Postura {{dir}} vs sessão', 'Позиция {{dir}} к прошлой', '{{dir}} پچھلے سیشن سے'],
  ['traderDeck.outlook.instrumentFbNote', 'Cross-asset read synthesized from desk signals.', '由桌面信号合成的跨资产解读。', 'डेस्क सिग्नल से संश्लेषित क्रॉस-एसेट पठन।', 'Lectura multiactivo sintetizada.', 'Lecture multi-actifs synthétisée.', 'قراءة متعددة الأصول.', 'ডেস্ক সিগনাল থেকে সংশ্লেষ।', 'Leitura sintetizada dos sinais.', 'Сводка по сигналам стола.', 'ڈیسک سگنلز سے مرکب پڑھنا۔'],

  ['traderDeck.outlook.why0', 'USD rebalancing resets short-term positioning; FX pairs need a new driver.', '美元再平衡重置短期头寸；外汇对需要新驱动。', 'USD संतुलन से स्थिति रीसेट; नया चालक चाहिए।', 'Reequilibrio USD reinicia posiciones.', 'Rééquilibrage USD réinitialise.', 'إعادة توازن الدولار تعيد التموضع.', 'USD পুনরায় ভারসাম্য।', 'Rebalanceamento USD.', 'Перебалансировка USD.', 'USD دوبارہ توازن۔'],
  ['traderDeck.outlook.why1', 'Gold vs real yields keeps macro sensitivity visible across assets.', '黄金对实际收益率保持宏观敏感性。', 'सोना बनाम वास्तविक प्रतिफल संवेदनशीलता दिखाता है।', 'Oro vs rendimientos reales.', 'Or vs rendements réels.', 'الذهب مقابل العوائد الحقيقية.', 'সোনা বনাম সুদ।', 'Ouro vs juros reais.', 'Золото и реальные доходности.', 'سونا بمقابل حقیقی پیداوار۔'],
  ['traderDeck.outlook.why2', 'Oil moves feed inflation expectations and second-order rates impact.', '油价牵动通胀预期与利率的二次影响。', 'तेल की चाल से मुद्रास्फीति अपेक्षाएँ जुड़ती हैं।', 'El petróleo alimenta expectativas.', 'Le pétrole nourrit l’inflation.', 'النفط يغذي التضخم.', 'তেল মুদ্রাস্ফীতি প্রভাবিত করে।', 'Petróleo alimenta inflação.', 'Нефть влияет на инфляцию.', 'تیل افراط زر پر اثر۔'],
  ['traderDeck.outlook.why3', 'Geopolitical premium lifts volatility and weakens correlation stability.', '地缘溢价抬高波动并削弱相关性稳定。', 'भू-राजनीतिक प्रीमियम अस्थिरता बढ़ाता है।', 'Prima geopolítica eleva volatilidad.', 'Prime géopolitique hausse volatilité.', 'الجيوسياسية ترفع التقلب.', 'ভূরাজনৈতিক প্রিমিয়াম।', 'Prêmio geopolítico.', 'Геопремия повышает волатильность.', 'جغرافیائی پریمیم۔'],

  ['traderDeck.calendar.prevDay', 'Previous day', '上一天', 'पिछला दिन', 'Día anterior', 'Jour précédent', 'اليوم السابق', 'আগের দিন', 'Dia anterior', 'Предыдущий день', 'پچھلا دن'],
  ['traderDeck.calendar.nextDay', 'Next day', '下一天', 'अगला दिन', 'Día siguiente', 'Jour suivant', 'اليوم التالي', 'পরের দিন', 'Próximo dia', 'Следующий день', 'اگلا دن'],
  ['traderDeck.calendar.prevWeek', 'Previous week', '上一周', 'पिछला सप्ताह', 'Semana anterior', 'Semaine précédente', 'الأسبوع السابق', 'আগের সপ্তাহ', 'Semana anterior', 'Предыдущая неделя', 'پچھلا ہفتہ'],
  ['traderDeck.calendar.nextWeek', 'Next week', '下一周', 'अगला सप्ताह', 'Semana siguiente', 'Semaine suivante', 'الأسبوع التالي', 'পরের সপ্তাহ', 'Próxima semana', 'Следующая неделя', 'اگلا ہفتہ'],
  ['traderDeck.calendar.chooseDate', 'Choose date', '选择日期', 'तारीख चुनें', 'Elegir fecha', 'Choisir la date', 'اختر التاريخ', 'তারিখ বেছে নিন', 'Escolher data', 'Выбрать дату', 'تاریخ منتخب'],
  ['traderDeck.calendar.chooseDateWeekly', 'Choose a day (week view follows that day)', '选择日期（周视图随该日）', 'दिन चुनें (सप्ताह उसी के अनुसार)', 'Elegir día (la semana sigue)', 'Choisir un jour (semaine suit)', 'اختر يومًا (الأسبوع يتبع)', 'দিন বাছুন (সপ্তাহ অনুসরণ)', 'Escolher dia (semana segue)', 'Выберите день (неделя следует)', 'دن چنیں (ہفتہ اس کے مطابق)'],
  ['traderDeck.calendar.groupAriaDate', 'Date: {{label}}', '日期：{{label}}', 'तारीख: {{label}}', 'Fecha: {{label}}', 'Date : {{label}}', 'التاريخ: {{label}}', 'তারিখ: {{label}}', 'Data: {{label}}', 'Дата: {{label}}', 'تاریخ: {{label}}'],
  ['traderDeck.calendar.groupAriaWeek', 'Week: {{label}}', '周：{{label}}', 'सप्ताह: {{label}}', 'Semana: {{label}}', 'Semaine : {{label}}', 'الأسبوع: {{label}}', 'সপ্তাহ: {{label}}', 'Semana: {{label}}', 'Неделя: {{label}}', 'ہفتہ: {{label}}'],
  ['traderDeck.worldClocksAria', 'World clocks', '世界时钟', 'विश्व घड़ियाँ', 'Relojes mundiales', 'Horloges mondiales', 'ساعات العالم', 'বিশ্ব ঘড়ি', 'Relógios mundiais', 'Мировые часы', 'عالمی گھڑیاں'],

  ['traderDeck.eta.minutesOnly', '{{m}}m', '{{m}}分', '{{m}}मि', '{{m}} min', '{{m}} min', '{{m}}د', '{{m}}মি', '{{m}} min', '{{m}}м', '{{m}}م'],
  ['traderDeck.eta.lessThanMinute', '<1m', '<1分', '<१ मि', '<1 min', '<1 min', '<1د', '<১মি', '<1 min', '<1м', '<۱م'],
  ['traderDeck.eta.hoursMinutes', '{{h}}h {{m}}m', '{{h}}时{{m}}分', '{{h}}घ {{m}}मि', '{{h}} h {{m}} min', '{{h}}h {{m}}min', '{{h}}س {{m}}د', '{{h}}ঘ {{m}}মি', '{{h}} h {{m}} min', '{{h}}ч {{m}}м', '{{h}}گھ {{m}}م'],
  ['traderDeck.eta.daysHours', '{{d}}d {{h}}h', '{{d}}天{{h}}时', '{{d}}दि {{h}}घ', '{{d}} d {{h}} h', '{{d}}j {{h}}h', '{{d}}ي {{h}}س', '{{d}}দি {{h}}ঘ', '{{d}} d {{h}} h', '{{d}}д {{h}}ч', '{{d}}دن {{h}}گھ'],
  ['traderDeck.eta.emDash', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—'],

  ['traderDeck.city.sydney', 'Sydney', '悉尼', 'सिडनी', 'Sídney', 'Sydney', 'سيدني', 'সিডনি', 'Sydney', 'Сидней', 'سڈنی'],
  ['traderDeck.city.tokyo', 'Tokyo', '东京', 'टोक्यो', 'Tokio', 'Tokyo', 'طوكيو', 'টোকিও', 'Tóquio', 'Токио', 'ٹوکیو'],
  ['traderDeck.city.london', 'London', '伦敦', 'लंदन', 'Londres', 'Londres', 'لندن', 'লন্ডন', 'Londres', 'Лондон', 'لندن'],
  ['traderDeck.city.newYork', 'New York', '纽约', 'न्यूयॉर्क', 'Nueva York', 'New York', 'نيويورك', 'নিউ ইয়র্ক', 'Nova York', 'Нью-Йорк', 'نیویارک'],
  ['traderDeck.city.dubai', 'Dubai', '迪拜', 'दुबई', 'Dubái', 'Dubaï', 'دبي', 'দুবাই', 'Dubai', 'Дубай', 'دبئی'],

  ['traderDeck.regime.currentRegime', 'Regime', '体制', 'व्यवस्था', 'Régimen', 'Régime', 'النظام', 'রেজিম', 'Modo', 'Режим', 'نظام'],
  ['traderDeck.regime.bias', 'Bias', '偏向', 'झुकाव', 'Sesgo', 'Biais', 'الانحياز', 'পক্ষপাত', 'Viés', 'Смещение', 'جھکاؤ'],
  ['traderDeck.regime.primaryDriver', 'Primary Driver', '主驱动', 'प्राथमिक चालक', 'Impulsor primario', 'Moteur principal', 'المحرك الأساسي', 'প্রাথমিক চালক', 'Driver primário', 'Основной драйвер', 'بنیادی محرک'],
  ['traderDeck.regime.secondaryDriver', 'Secondary Driver', '次驱动', 'द्वितीयक चालक', 'Impulsor secundario', 'Moteur secondaire', 'محرك ثانوي', 'গৌণ চালক', 'Driver secundário', 'Вторичный драйвер', 'ثانوی محرک'],
  ['traderDeck.regime.marketSentiment', 'Global Sentiment', '全球市场情绪', 'वैश्विक भावना', 'Sentimiento global', 'Sentiment global', 'المشاعر العالمية', 'বৈশ্বিক অনুভূতি', 'Sentimento global', 'Глобальные настроения', 'عالمی جذبات'],
  ['traderDeck.regime.tradeEnvironment', 'Trade Environment', '交易环境', 'ट्रेड वातावरण', 'Entorno de trading', 'Environnement de trading', 'بيئة التداول', 'ট্রেড পরিবেশ', 'Ambiente de trade', 'Торговая среда', 'تجارتی ماحول'],
  ['traderDeck.regime.biasStrength', 'Bias strength', '偏向强度', 'झुकाव की ताकत', 'Fuerza del sesgo', 'Force du biais', 'قوة الانحياز', 'পক্ষপাত শক্তি', 'Força do viés', 'Сила смещения', 'جھکاؤ کی قوت'],
  ['traderDeck.regime.convictionClarity', 'Conviction / clarity', '信念/清晰度', 'दृढ़ता / स्पष्टता', 'Convicción / claridad', 'Conviction / clarté', 'الاقتناع / الوضوح', 'আস্থা / স্পষ্টতা', 'Convicção / clareza', 'Убеждённость / ясность', 'یقین / وضاحت'],
  ['traderDeck.regime.regimeScore', 'Regime score', '体制分数', 'व्यवस्था स्कोर', 'Puntuación de régimen', 'Score de régime', 'درجة النظام', 'রেজিম স্কোর', 'Pontuação do regime', 'Оценка режима', 'نظام سکور'],
  ['traderDeck.regime.regimeBiasLabel', 'Structural bias', '结构性偏向', 'संरचनात्मक झुकाव', 'Sesgo estructural', 'Biais structurel', 'انحياز هيكلي', 'কাঠামোগত পক্ষপাত', 'Viés estrutural', 'Структурное смещение', 'ساختی جھکاؤ'],
  ['traderDeck.regime.trendState', 'Trend state', '趋势状态', 'ट्रेंड स्थिति', 'Estado de tendencia', 'État de tendance', 'حالة الاتجاه', 'ট্রেন্ড অবস্থা', 'Estado da tendência', 'Состояние тренда', 'رجحان کی حالت'],
  ['traderDeck.regime.volatilityRegime', 'Volatility regime', '波动制度', 'अस्थिरता व्यवस्था', 'Régimen de volatilidad', 'Régime de volatilité', 'نظام التقلب', 'অস্থিরতা রেজিম', 'Regime de volatilidade', 'Режим волатильности', 'اتار نظام'],
  ['traderDeck.regime.liquidityCondition', 'Liquidity', '流动性', 'तरलता', 'Liquidez', 'Liquidité', 'السيولة', 'তারল্য', 'Liquidez', 'Ликвидность', 'سیالیت'],
  ['traderDeck.regime.convictionLevel', 'Conviction', '信念', 'दृढ़ता', 'Convicción', 'Certitude', 'الاقتناع', 'আস্থা', 'Convicção', 'Убеждённость', 'یقین'],

  ['traderDeck.driver.empty', 'No driver data', '无驱动数据', 'कोई ड्राइवर डेटा नहीं', 'Sin datos de impulsores', 'Aucune donnée moteur', 'لا بيانات محركات', 'ড্রাইভার ডেটা নেই', 'Sem dados de drivers', 'Нет данных драйверов', 'ڈرائیور ڈیٹا نہیں'],
  ['traderDeck.driver.impactHigh', 'High impact', '高影响', 'उच्च प्रभाव', 'Alto impacto', 'Impact élevé', 'تأثير عالٍ', 'উচ্চ প্রভাব', 'Alto impacto', 'Высокое влияние', 'زیادہ اثر'],
  ['traderDeck.driver.impactMedium', 'Medium impact', '中影响', 'मध्यम प्रभाव', 'Impacto medio', 'Impact moyen', 'تأثير متوسط', 'মাঝারি প্রভাব', 'Impacto médio', 'Среднее влияние', 'درمیانہ اثر'],
  ['traderDeck.driver.impactLow', 'Low impact', '低影响', 'कम प्रभाव', 'Bajo impacto', 'Faible impact', 'تأثير منخفض', 'কম প্রভাব', 'Baixo impacto', 'Низкое влияние', 'کم اثر'],
  ['traderDeck.driver.impactGeneric', '{{impact}} impact', '{{impact}} 影响', '{{impact}} प्रभाव', 'Impacto {{impact}}', 'Impact {{impact}}', 'تأثير {{impact}}', '{{impact}} প্রভাব', 'Impacto {{impact}}', 'Влияние {{impact}}', '{{impact}} اثر'],
  ['traderDeck.driver.affectedAssetsAria', 'Affected assets', '受影响资产', 'प्रभावित एसेट', 'Activos afectados', 'Actifs affectés', 'الأصول المتأثرة', 'প্রভাবিত সম্পদ', 'Ativos afetados', 'Затронутые активы', 'متاثر اثاثے'],
  ['traderDeck.driver.impactField', 'Impact', '影响', 'प्रभाव', 'Impacto', 'Incidence', 'التأثير', 'প্রভাব', 'Grau de impacto', 'Влияние', 'اثر'],

  ['traderDeck.direction.up', 'Up', '上', 'ऊपर', 'Arriba', 'Hausse', 'صعود', 'উপর', 'Alta', 'Вверх', 'اوپر'],
  ['traderDeck.direction.down', 'Down', '下', 'नीचे', 'Abajo', 'Baisse', 'هبوط', 'নিচে', 'Baixa', 'Вниз', 'نیچے'],
  ['traderDeck.direction.neutral', 'Neutral', '中性', 'तटस्थ', 'Neutro', 'Neutre', 'محايد', 'নিরপেক্ষ', 'Neutro', 'Нейтрально', 'غیر جانبدار'],

  ['traderDeck.sessionState.range_bound', 'Range-bound', '区间震荡', 'रेंज-बाउंड', 'Rango', 'Range', 'نطاق محدود', 'রেঞ্জ-বাউন্ড', 'Lateral', 'В диапазоне', 'رینج میں'],
  ['traderDeck.sessionState.expansion_likely', 'Expansion likely', '扩张可能', 'विस्तार संभव', 'Expansión probable', 'Expansion probable', 'توسع محتمل', 'প্রসারণ সম্ভব', 'Expansão provável', 'Вероятно расширение', 'پھیلاؤ ممکن'],
  ['traderDeck.sessionState.trend_continuation', 'Trend continuation', '趋势延续', 'ट्रेंड जारी', 'Continuación', 'Poursuite de tendance', 'استمرار الاتجاه', 'ট্রেন্ড অব্যাহত', 'Continuação', 'Продолжение тренда', 'رجحان جاری'],
  ['traderDeck.sessionState.reversal_risk', 'Reversal risk', '反转风险', 'उलटफेर जोखिम', 'Riesgo de reversión', 'Risque de retournement', 'خطر الانعكاس', 'উল্টানোর ঝুঁকি', 'Risco de reversão', 'Риск разворота', 'الٹنے کا خطرہ'],
  ['traderDeck.sessionState.compressed', 'Compressed', '压缩', 'संकुचित', 'Comprimido', 'Compressé', 'مضغوط', 'সংকুচিত', 'Comprimido', 'Сжато', 'دباؤ'],
  ['traderDeck.sessionState.choppy', 'Choppy', '震荡', 'अस्थिर', 'Errático', 'Haché', 'متذبذب', 'অস্থির', 'Oscilante', 'Рваный', 'اٹھل پٹھل'],
  ['traderDeck.sessionState.event_sensitive', 'Event-sensitive', '事件敏感', 'घटना-संवेदी', 'Sensible a eventos', 'Sensible aux événements', 'حساس للأحداث', 'ইভেন্ট-সংবেদী', 'Sensível a eventos', 'Чувствителен к событиям', 'واقعہ حساس'],
  ['traderDeck.sessionState.liquidity_build', 'Liquidity build', '流动性积聚', 'तरलता निर्माण', 'Acumulación de liquidez', 'Accumulation de liquidité', 'تراكم السيولة', 'তারল্য গঠন', 'Construção de liquidez', 'Накопление ликвидности', 'سیالیت جمع'],
  ['traderDeck.sessionState.inactive', 'Inactive', '不活跃', 'निष्क्रिय', 'Inactivo', 'Inactif', 'غير نشط', 'নিষ্ক্রিয়', 'Inativo', 'Неактивно', 'غیر فعال'],

  ['traderDeck.sessionShort.asia', 'Asia', '亚洲', 'एशिया', 'Asia-Pacífico', 'Asie', 'آسيا', 'এশিয়া', 'Ásia-Pacífico', 'Азия', 'ایشیا'],
  ['traderDeck.sessionShort.london', 'London', '伦敦', 'लंदन', 'Londres', 'Londres', 'لندن', 'লন্ডন', 'Londres', 'Лондон', 'لندن'],
  ['traderDeck.sessionShort.new_york', 'New York', '纽约', 'न्यूयॉर्क', 'Nueva York', 'New York', 'نيويورك', 'নিউ ইয়র্ক', 'Nova York', 'Нью-Йорк', 'نیویارک'],
  ['traderDeck.sessionShort.overlap', 'Overlap', '重叠', 'ओवरलैप', 'Solape', 'Chevauchement', 'تداخل', 'ওভারল্যাপ', 'Sobreposição', 'Перекрытие', 'اوورلیپ'],
  ['traderDeck.sessionShort.closed', 'Closed', '休市', 'बंद', 'Cerrado', 'Fermé', 'مغلق', 'বন্ধ', 'Fechado', 'Закрыто', 'بند'],

  ['traderDeck.freshness.justNow', 'Updated just now', '刚刚更新', 'अभी अपडेट', 'Actualizado ahora', 'Mis à jour à l’instant', 'تم التحديث الآن', 'এইমাত্র আপডেট', 'Atualizado agora', 'Обновлено только что', 'ابھی اپ ڈیٹ'],
  ['traderDeck.freshness.minutesAgo', 'Updated {{m}}m ago', '{{m}} 分钟前更新', '{{m}} मि पहले अपडेट', 'Hace {{m}} min', 'Il y a {{m}} min', 'منذ {{m}} د', '{{m}} মি আগে', 'Há {{m}} min', '{{m}} мин назад', '{{m}} منٹ پہلے'],
  ['traderDeck.freshness.hoursAgo', 'Updated {{h}}h ago', '{{h}} 小时前更新', '{{h}} घं पहले अपडेट', 'Hace {{h}} h', 'Il y a {{h}} h', 'منذ {{h}} س', '{{h}} ঘ আগে', 'Há {{h}} h', '{{h}} ч назад', '{{h}} گھ پہلے'],
  ['traderDeck.freshness.dateStamp', 'Updated {{date}}', '更新于 {{date}}', '{{date}} को अपडेट', 'Actualizado {{date}}', 'Mis à jour {{date}}', 'تم التحديث {{date}}', '{{date}} আপডেট', 'Atualizado {{date}}', 'Обновлено {{date}}', '{{date}} اپ ڈیٹ'],

  ['traderDeck.sessionContext.asia', 'Asia', '亚洲', 'एशिया', 'Asia-Pacífico', 'Asie', 'آسيا', 'এশিয়া', 'Ásia-Pacífico', 'Азия', 'ایشیا'],
  ['traderDeck.sessionContext.london', 'London', '伦敦', 'लंदन', 'Londres', 'Londres', 'لندن', 'লন্ডন', 'Londres', 'Лондон', 'لندن'],
  ['traderDeck.sessionContext.newYork', 'New York', '纽约', 'न्यूयॉर्क', 'Nueva York', 'New York', 'نيويورك', 'নিউ ইয়র্ক', 'Nova York', 'Нью-Йорк', 'نیویارک'],
  ['traderDeck.sessionContext.volatility', 'Volatility', '波动率', 'अस्थिरता', 'Volatilidad', 'Volatilité', 'التقلب', 'অস্থিরতা', 'Volatilidade', 'Волатильность', 'اتار چڑھاؤ'],
  ['traderDeck.sessionContext.levels', 'Levels', '价位', 'स्तर', 'Niveles', 'Niveaux', 'المستويات', 'স্তর', 'Níveis', 'Уровни', 'سطح'],
  ['traderDeck.sessionContext.activeWindow', 'Active window:', '活跃窗口：', 'सक्रिय खिड़की:', 'Ventana activa:', 'Fenêtre active :', 'النافذة النشطة:', 'সক্রিয় উইন্ডো:', 'Janela ativa:', 'Активное окно:', 'فعال ونڈو:'],

  ['traderDeck.macro.title', 'Macro timing & inflection window', '宏观时机与拐点窗口', 'मैक्रो समय और मोड़ खिड़की', 'Macro e inflexión', 'Macrochronisation et point d’inflexion', 'التوقيت الكلي ونافذة الانعطاف', 'ম্যাক্রো সময় ও ইনফ্লেকশন', 'Macro e inflexão', 'Макро-сроки и перелом', 'میکرو وقت اور موڑ'],
  ['traderDeck.macro.updated', 'Updated', '更新', 'अपडेट', 'Actualizado', 'Mis à jour', 'تم التحديث', 'আপডেট', 'Atualizado', 'Обновлено', 'اپ ڈیٹ'],
  ['traderDeck.macro.aria', 'Macro timing and inflection window', '宏观时机与拐点', 'मैक्रो समय और मोड़', 'Macro e inflexión', 'Macro et inflexion', 'التوقيت والانعطاف', 'ম্যাক্রো সময়', 'Macro e inflexão', 'Макро и перелом', 'میکرو وقت'],
  ['traderDeck.macro.activeWindow', 'Active window', '活跃窗口', 'सक्रिय खिड़की', 'Ventana activa', 'Fenêtre active', 'النافذة النشطة', 'সক্রিয় উইন্ডো', 'Janela ativa', 'Активное окно', 'فعال ونڈو'],
  ['traderDeck.macro.inflection', 'Inflection', '拐点', 'मोड़', 'Inflexión', 'Inflexion', 'انعطاف', 'ইনফ্লেকশন', 'Inflexão', 'Перелом', 'موڑ'],
  ['traderDeck.macro.marketState', 'Market state', '市场状态', 'बाज़ार स्थिति', 'Estado del mercado', 'État du marché', 'حالة السوق', 'বাজার অবস্থা', 'Estado do mercado', 'Состояние рынка', 'مارکیٹ کی حالت'],
  ['traderDeck.macro.abbrVol', 'Vol', '波', 'वोल', 'Vol.', 'Vol.', 'تقلب', 'ভোল', 'Vol.', 'Вол', 'وال'],
  ['traderDeck.macro.abbrVolTitle', 'Volatility regime', '波动制度', 'अस्थिरता व्यवस्था', 'Régimen de volatilidad', 'Régime de volatilité', 'نظام التقلب', 'অস্থিরতা রেজিম', 'Regime de volatilidade', 'Режим волатильности', 'اتار نظام'],
  ['traderDeck.macro.abbrLiq', 'Liq', '流', 'तरल', 'Liq.', 'Liq.', 'سيولة', 'লিক', 'Liq.', 'Лик', 'لیک'],
  ['traderDeck.macro.abbrLiqTitle', 'Liquidity', '流动性', 'तरलता', 'Liquidez', 'Liquidité', 'السيولة', 'তারল্য', 'Liquidez', 'Ликвидность', 'سیالیت'],
  ['traderDeck.macro.abbrCorr', 'Corr', '相', 'सहसं', 'Corr.', 'Corr.', 'ارتباط', 'কর', 'Corr.', 'Корр', 'کور'],
  ['traderDeck.macro.abbrCorrTitle', 'Correlation', '相关性', 'सहसंबंध', 'Correlación', 'Corrélation', 'الارتباط', 'সহসংযোগ', 'Correlação', 'Корреляция', 'باہمی تعلق'],
  ['traderDeck.macro.abbrPos', 'Pos', '仓', 'स्थिति', 'Pos.', 'Pos.', 'المراكز', 'পজ', 'Pos.', 'Поз', 'پوز'],
  ['traderDeck.macro.abbrPosTitle', 'Positioning', '头寸', 'स्थितिकरण', 'Posicionamiento', 'Positionnement', 'المراكز', 'অবস্থান', 'Posicionamento', 'Позиционирование', 'پوزیشننگ'],
  ['traderDeck.macro.catalystMap', 'Catalyst map', '催化剂图', 'उत्प्रेरक मानचित्र', 'Mapa de catalizadores', 'Carte des catalyseurs', 'خريطة المحفزات', 'ক্যাটালিস্ট মানচিত্র', 'Mapa de catalisadores', 'Карта катализаторов', 'کیٹالیسٹ نقشہ'],
  ['traderDeck.macro.expectedPath', 'Expected path', '预期路径', 'अपेक्षित मार्ग', 'Ruta esperada', 'Chemin attendu', 'المسار المتوقع', 'প্রত্যাশিত পথ', 'Caminho esperado', 'Ожидаемый путь', 'متوقع راستہ'],
  ['traderDeck.macro.base', 'Base', '基准', 'आधार', 'Referencia', 'Réf.', 'الأساس', 'ভিত্তি', 'Referência', 'База', 'بنیاد'],
  ['traderDeck.macro.ifTriggered', 'If triggered', '若触发', 'यदि ट्रिगर', 'Si se activa', 'Si déclenché', 'عند التفعيل', 'ট্রিগার হলে', 'Se acionado', 'При срабатывании', 'ٹریگر پر'],
  ['traderDeck.macro.failureMode', 'Failure mode', '失败模式', 'विफलता मोड', 'Modo de fallo', 'Mode d’échec', 'وضع الفشل', 'ব্যর্থতা মোড', 'Modo de falha', 'Режим отказа', 'ناکامی موڈ'],
  ['traderDeck.macro.conditions', 'Conditions', '条件', 'शर्तें', 'Condiciones', 'Paramètres', 'الشروط', 'শর্ত', 'Condições', 'Условия', 'شرائط'],
  ['traderDeck.macro.breakout', 'Breakout', '突破', 'ब्रेकआउट', 'Ruptura', 'Percée', 'اختراق', 'ব্রেকআউট', 'Rompedouro', 'Пробой', 'بریک آؤٹ'],
  ['traderDeck.macro.meanRev', 'Mean rev', '均值回归', 'मीन रिवर्जन', 'Reversión media', 'Retour à la moyenne', 'العودة للمتوسط', 'গড় প্রত্যাবর্তন', 'Reversão à média', 'Возврат к среднему', 'اوسط واپسی'],
  ['traderDeck.macro.noTrade', 'No trade', '不交易', 'कोई ट्रेड नहीं', 'Sin operar', 'Pas de trade', 'لا تداول', 'ট্রেড নেই', 'Sem trade', 'Без сделки', 'کوئی ٹریڈ نہیں'],
  ['traderDeck.macro.executionContext', 'Execution context', '执行背景', 'निष्पादन संदर्भ', 'Contexto de ejecución', 'Contexte d’exécution', 'سياق التنفيذ', 'কার্যকর প্রেক্ষাপট', 'Contexto de execução', 'Контекст исполнения', 'عملدرآمد سیاق'],
  ['traderDeck.macro.riskFraming', 'Risk framing', '风险框架', 'जोखिम फ्रेमिंग', 'Encuadre de riesgo', 'Cadrage du risque', 'تأطير المخاطر', 'ঝুঁকি ফ্রেমিং', 'Enquadramento de risco', 'Фрейминг риска', 'خطر فریم'],
  ['traderDeck.macro.traderEdge', 'Trader timing edge', '交易者时机优势', 'ट्रेडर समय बढ़त', 'Ventaja de timing', 'Avantage de timing', 'أفضلية التوقيت', 'ট্রেডার টাইমিং সুবিধা', 'Vantagem de timing', 'Преимущество по таймингу', 'تاجر وقت فائدہ'],

  ['traderDeck.pulse.axisRiskOff', 'Risk off', '避险', 'जोखिम बंद', 'Aversión al riesgo', 'Défensif', 'نفور من المخاطر', 'ঝুঁকি এড়', 'Aversão a risco', 'Негатив к риску', 'خطر سے بچنا'],
  ['traderDeck.pulse.axisRiskOn', 'Risk on', '风险偏好', 'जोखिम चालू', 'Apetito de riesgo', 'Offensif', 'شهية للمخاطر', 'ঝুঁকি গ্রহণ', 'Apetite a risco', 'Позитив к риску', 'خطر قبول'],
  ['traderDeck.pulse.aria', 'Market pulse {{label}}, score {{score}}', '市场脉搏 {{label}}，分数 {{score}}', 'बाज़ार नाड़ी {{label}}, स्कोर {{score}}', 'Pulso {{label}}, {{score}}', 'Pouls {{label}}, {{score}}', 'نبض {{label}}، {{score}}', 'পাল্স {{label}}, {{score}}', 'Pulso {{label}}, {{score}}', 'Пульс {{label}}, {{score}}', 'نبض {{label}}، {{score}}'],
  ['traderDeck.pulse.state', 'State', '状态', 'स्थिति', 'Estado', 'État', 'الحالة', 'অবস্থা', 'Estado', 'Состояние', 'حالت'],
  ['traderDeck.pulse.volatility', 'Volatility', '波动率', 'अस्थिरता', 'Volatilidad', 'Volatilité', 'التقلب', 'অস্থিরতা', 'Volatilidade', 'Волатильность', 'اتار چڑھاؤ'],
  ['traderDeck.pulse.regime', 'Regime', '体制', 'व्यवस्था', 'Régimen', 'Régime', 'النظام', 'রেজিম', 'Modo', 'Режим', 'نظام'],
  ['traderDeck.pulse.clarity', 'Clarity', '清晰度', 'स्पष्टता', 'Claridad', 'Clarté', 'الوضوح', 'স্পষ্টতা', 'Clareza', 'Ясность', 'وضاحت'],
  ['traderDeck.pulse.topDrivers', 'Top drivers', '主要驱动', 'शीर्ष चालक', 'Principales impulsores', 'Principaux moteurs', 'أبرز المحركات', 'শীর্ষ চালক', 'Principais drivers', 'Топ драйверы', 'اہم محرکات'],
  ['traderDeck.pulse.recentShift', 'Recent shift', '近期变化', 'हाल की बदलाव', 'Cambio reciente', 'Changement récent', 'تحول حديث', 'সাম্প্রতিক পরিবর্তন', 'Mudança recente', 'Недавний сдвиг', 'حالیہ تبدیلی'],
  ['traderDeck.pulse.whatShiftTape', 'What could shift the tape', '什么可能改变盘面', 'टेप क्या बदल सकता है', 'Qué puede mover la cinta', 'Ce qui peut bouger le carnet', 'ما الذي يحرك الشريط', 'টেপ কী সরাতে পারে', 'O que pode mover a fita', 'Что может сдвинуть ленту', 'ٹیپ کیا بدل سکتا ہے'],
  ['traderDeck.pulse.confidence', 'Confidence', '信心', 'विश्वास', 'Confianza', 'Confiance', 'الثقة', 'আত্মবিশ্বাস', 'Confiança', 'Уверенность', 'اعتماد'],
  ['traderDeck.pulse.riskTone', 'Risk tone', '风险基调', 'जोखिम स्वर', 'Tono de riesgo', 'Ton de risque', 'نبرة المخاطر', 'ঝুঁকি সুর', 'Tom de risco', 'Тон риска', 'خطر لہجہ'],
  ['traderDeck.pulse.posture', 'Posture', '姿态', 'मुद्रा', 'Postura', 'Positionnement', 'الموقف', 'ভঙ্গি', 'Postura', 'Поза', 'انداز'],
  ['traderDeck.pulse.deskContext', 'Desk context:', '桌面背景：', 'डेस्क संदर्भ:', 'Contexto del escritorio:', 'Contexte du bureau :', 'سياق المكتب:', 'ডেস্ক প্রেক্ষাপট:', 'Contexto da mesa:', 'Контекст стола:', 'ڈیسک سیاق:'],
  ['traderDeck.pulse.volElevated', 'Elevated', '偏高', 'उच्च', 'Elevado', 'Élevé', 'مرتفع', 'উচ্চ', 'Elevado', 'Повышенная', 'بلند'],
  ['traderDeck.pulse.volLow', 'Low', '偏低', 'कम', 'Bajo', 'Faible', 'منخفض', 'কম', 'Baixo', 'Низкая', 'کم'],
  ['traderDeck.pulse.volModerate', 'Moderate', '中等', 'मध्यम', 'Moderado', 'Modéré', 'معتدل', 'মাঝারি', 'Moderado', 'Умеренная', 'درمیانہ'],
  ['traderDeck.pulse.clarityDefined', 'Defined', '明确', 'स्पष्ट', 'Definido', 'Défini', 'واضح', 'স্পষ্ট', 'Definido', 'Определённая', 'واضح'],
  ['traderDeck.pulse.clarityMixed', 'Mixed', '混合', 'मिश्र', 'Mixto', 'Mixte', 'مختلط', 'মিশ্র', 'Misto', 'Смешанная', 'مخلوط'],
  ['traderDeck.pulse.riskOnTone', 'Risk-on', '风险偏好开', 'जोखिम-चालू', 'Apetito de riesgo', 'Appétit pour le risque', 'مخاطرة', 'রিস্ক-অন', 'Apetite por risco', 'Риск-он', 'ریسک آن'],
  ['traderDeck.pulse.riskOffTone', 'Risk-off', '风险偏好关', 'जोखिम-बंद', 'Aversión al riesgo', 'Défiance vis-à-vis du risque', 'تجنب مخاطر', 'রিস্ক-অফ', 'Aversão ao risco', 'Риск-офф', 'ریسک آف'],
  ['traderDeck.pulse.riskBalanced', 'Balanced', '平衡', 'संतुलित', 'Equilibrado', 'Équilibré', 'متوازن', 'সুষম', 'Equilibrado', 'Сбалансированный', 'متوازن'],
  ['traderDeck.pulse.postureLeanTrend', 'Lean with trend', '顺势倾斜', 'ट्रेंड के साथ झुकाव', 'Seguir la tendencia', 'S’aligner sur la tendance', 'ميل مع الاتجاه', 'ট্রেন্ডের সাথে', 'Acompanhar tendência', 'С трендом', 'رجحان کے ساتھ'],
  ['traderDeck.pulse.postureDefensive', 'Defensive', '防御', 'रक्षात्मक', 'Defensivo', 'Défensif', 'دفاعي', 'রক্ষণাত্মক', 'Defensivo', 'Оборонительная', 'دفاعی'],
  ['traderDeck.pulse.postureSelective', 'Selective', '选择性', 'चयनात्मक', 'Selectivo', 'Sélectif', 'انتقائي', 'নির্বাচনী', 'Seletivo', 'Избирательная', 'منتخب'],
  ['traderDeck.pulse.outlookVolElevated', 'Elevated pulse vs baseline', '相对基线偏高的脉搏', 'आधार रेखा से ऊँची नाड़ी', 'Pulso elevado vs base', 'Pouls élevé vs base', 'نبض مرتفع مقارنة بالأساس', 'বেসলাইনের তুলনায় উচ্চ', 'Pulso elevado vs base', 'Повышенный пульс к базе', 'بنیاد سے بلند نبض'],
  ['traderDeck.pulse.outlookVolSubdued', 'Subdued pulse vs baseline', '相对基线偏低的脉搏', 'आधार से कम नाड़ी', 'Pulso contenido vs base', 'Pouls contenu vs base', 'نبض مهدور', 'বেসলাইনের তুলনায় কম', 'Pulso contido vs base', 'Сдержанный пульс', 'بنیاد سے ہلکی نبض'],
  ['traderDeck.pulse.outlookVolBalanced', 'Balanced pulse vs baseline', '相对基线平衡的脉搏', 'संतुलित नाड़ी', 'Pulso equilibrado', 'Pouls équilibré', 'نبض متوازن', 'সুষম পাল্স', 'Pulso equilibrado', 'Сбалансированный пульс', 'متوازن نبض'],
];

const T_ALL = [...T, ...macroGenRows];

const LANG_KEYS = ['en', 'zh-CN', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur'];
const rows = T_ALL.map((arr) => {
  const [k, ...vals] = arr;
  const o = { k };
  LANG_KEYS.forEach((lk, i) => {
    o[lk] = vals[i];
  });
  return o;
});

const out = `/** Trader Deck Market Outlook UI + calendar + session — merged by build-i18n-locales.mjs */
/** @typedef {{ k: string, en: string, 'zh-CN': string, hi: string, es: string, fr: string, ar: string, bn: string, pt: string, ru: string, ur: string }} Row */
/** @type {Row[]} */
/* eslint-disable max-len */
export const rows = ${JSON.stringify(rows, null, 2)};
`;
fs.writeFileSync(path.join(__dirname, 'i18n-part9-traderdeck-ui.mjs'), out, 'utf8');
console.log('Wrote', rows.length, 'rows to i18n-part9-traderdeck-ui.mjs');
