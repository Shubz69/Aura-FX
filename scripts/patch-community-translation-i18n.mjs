/**
 * One-off: set profile + community.translation strings for all locales (non-English native).
 * Run: node scripts/patch-community-translation-i18n.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'src', 'i18n', 'locales');

const T = {
  es: {
    communityAutoTranslate: 'Traducir automáticamente los mensajes de la comunidad',
    communityAutoTranslateHint:
      'Si está activado, los mensajes de otros se muestran en el idioma del sitio cuando sea posible.',
    loading: 'Traduciendo…',
    translatedFrom: 'Traducido del {{language}}',
    showOriginal: 'Ver original',
    showTranslation: 'Ver traducción',
  },
  fr: {
    communityAutoTranslate: 'Traduire automatiquement les messages de la communauté',
    communityAutoTranslateHint:
      'Si activé, les messages des autres s’affichent dans la langue du site lorsque c’est possible.',
    loading: 'Traduction…',
    translatedFrom: 'Traduit depuis l’{{language}}',
    showOriginal: 'Afficher l’original',
    showTranslation: 'Afficher la traduction',
  },
  'zh-CN': {
    communityAutoTranslate: '自动翻译社区消息',
    communityAutoTranslateHint: '开启后，在可行时以您选择的网站语言显示他人的消息。',
    loading: '正在翻译…',
    translatedFrom: '翻译自{{language}}',
    showOriginal: '显示原文',
    showTranslation: '显示译文',
  },
  hi: {
    communityAutoTranslate: 'सामुदायिक संदेशों का स्वचालित अनुवाद',
    communityAutoTranslateHint:
      'चालू रहने पर, दूसरों के संदेश जहाँ संभव हो आपकी वेबसाइट भाषा में दिखेंगे।',
    loading: 'अनुवाद हो रहा है…',
    translatedFrom: '{{language}} से अनुवादित',
    showOriginal: 'मूल दिखाएँ',
    showTranslation: 'अनुवाद दिखाएँ',
  },
  ar: {
    communityAutoTranslate: 'ترجمة رسائل المجتمع تلقائيًا',
    communityAutoTranslateHint: 'عند التفعيل، تظهر رسائل الآخرين بلغة الموقع عندما يكون ذلك ممكنًا.',
    loading: 'جارٍ الترجمة…',
    translatedFrom: 'مترجم من {{language}}',
    showOriginal: 'عرض الأصل',
    showTranslation: 'عرض الترجمة',
  },
  bn: {
    communityAutoTranslate: 'কমিউনিটি বার্তা স্বয়ংক্রিয় অনুবাদ করুন',
    communityAutoTranslateHint: 'চালু থাকলে, সম্ভব হলে অন্যদের বার্তা আপনার ওয়েবসাইটের ভাষায় দেখাবে।',
    loading: 'অনুবাদ হচ্ছে…',
    translatedFrom: '{{language}} থেকে অনূদিত',
    showOriginal: 'মূল দেখান',
    showTranslation: 'অনুবাদ দেখান',
  },
  pt: {
    communityAutoTranslate: 'Traduzir automaticamente as mensagens da comunidade',
    communityAutoTranslateHint:
      'Quando ativado, as mensagens de outras pessoas aparecem no idioma do site sempre que possível.',
    loading: 'A traduzir…',
    translatedFrom: 'Traduzido de {{language}}',
    showOriginal: 'Ver original',
    showTranslation: 'Ver tradução',
  },
  ru: {
    communityAutoTranslate: 'Автоматически переводить сообщения сообщества',
    communityAutoTranslateHint:
      'Если включено, сообщения других пользователей отображаются на языке сайта, когда это возможно.',
    loading: 'Перевод…',
    translatedFrom: 'Переведено с {{language}}',
    showOriginal: 'Показать оригинал',
    showTranslation: 'Показать перевод',
  },
  ur: {
    communityAutoTranslate: 'کمیونٹی کے پیغامات خودکار ترجمہ',
    communityAutoTranslateHint: 'جب آن ہو، دوسروں کے پیغام ممکن ہو تو آپ کی ویب سائٹ کی زبان میں دکھائے جاتے ہیں۔',
    loading: 'ترجمہ ہو رہا ہے…',
    translatedFrom: '{{language}} سے ترجمہ شدہ',
    showOriginal: 'اصل دکھائیں',
    showTranslation: 'ترجمہ دکھائیں',
  },
};

for (const [code, tr] of Object.entries(T)) {
  const fp = path.join(root, code, 'common.json');
  const tree = JSON.parse(fs.readFileSync(fp, 'utf8'));
  if (!tree.profile) tree.profile = {};
  tree.profile.communityAutoTranslate = tr.communityAutoTranslate;
  tree.profile.communityAutoTranslateHint = tr.communityAutoTranslateHint;
  if (!tree.community) tree.community = {};
  if (!tree.community.translation) tree.community.translation = {};
  tree.community.translation.loading = tr.loading;
  tree.community.translation.translatedFrom = tr.translatedFrom;
  tree.community.translation.showOriginal = tr.showOriginal;
  tree.community.translation.showTranslation = tr.showTranslation;
  fs.writeFileSync(fp, `${JSON.stringify(tree, null, 2)}\n`);
  console.log('updated', code);
}
