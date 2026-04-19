const unPress = require('./unPress');
const treasuryPress = require('./treasuryPress');
const federalReserve = require('./federalReserve');
const ecbPress = require('./ecbPress');
const whitehouseBriefing = require('./whitehouseBriefing');
const usStatePress = require('./usStatePress');
const natoNews = require('./natoNews');
const boeNews = require('./boeNews');
const eiaNews = require('./eiaNews');
const ieaNews = require('./ieaNews');
const ukFcdoNews = require('./ukFcdoNews');
const ukOfsiNews = require('./ukOfsiNews');
const euCouncilPress = require('./euCouncilPress');
const bojPress = require('./bojPress');
const snbPress = require('./snbPress');
const rbaMedia = require('./rbaMedia');
const secPress = require('./secPress');
const cftcPress = require('./cftcPress');
const faaNewsroom = require('./faaNewsroom');
const imoMedia = require('./imoMedia');
const bankOfCanadaPress = require('./bankOfCanadaPress');
const nasdaqTraderNotices = require('./nasdaqTraderNotices');
const cmeGroupPress = require('./cmeGroupPress');
const opecPress = require('./opecPress');
const usDhsNews = require('./usDhsNews');
const usUstrPress = require('./usUstrPress');
const usDoeNewsroom = require('./usDoeNewsroom');
const finraNewsReleases = require('./finraNewsReleases');
const australiaDfatNews = require('./australiaDfatNews');
const afdbNews = require('./afdbNews');
const easaNewsroom = require('./easaNewsroom');
const ukCaaNews = require('./ukCaaNews');
const canadaTransportNews = require('./canadaTransportNews');
const wtoNews = require('./wtoNews');
const openskyLive = require('./openskyLive');
const datalasticAisLive = require('./datalasticAisLive');
const dvidsNewsRss = require('./dvidsNewsRss');
const ukModRss = require('./ukModRss');
const gCaptainRss = require('./gCaptainRss');
const { EXTENSION_CATEGORIES } = require('../officialSourceExtension');

const ADAPTERS = [
  unPress,
  treasuryPress,
  federalReserve,
  ecbPress,
  whitehouseBriefing,
  usStatePress,
  natoNews,
  boeNews,
  eiaNews,
  ieaNews,
  ukFcdoNews,
  ukOfsiNews,
  euCouncilPress,
  bojPress,
  snbPress,
  rbaMedia,
  secPress,
  cftcPress,
  faaNewsroom,
  imoMedia,
  bankOfCanadaPress,
  nasdaqTraderNotices,
  cmeGroupPress,
  opecPress,
  usDhsNews,
  usUstrPress,
  usDoeNewsroom,
  finraNewsReleases,
  australiaDfatNews,
  afdbNews,
  easaNewsroom,
  ukCaaNews,
  canadaTransportNews,
  wtoNews,
  openskyLive,
  datalasticAisLive,
  dvidsNewsRss,
  ukModRss,
  gCaptainRss,
];

module.exports = { ADAPTERS, EXTENSION_CATEGORIES };
