// ==========================================================
//  DigitalShopMm Telegram Bot
//  Admin Panel + User Panel + MongoDB Wallet System
// ==========================================================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// ---------- ENV ----------
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_ID = Number(process.env.ADMIN_ID);
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME || 'nostalg14';
const CHANNEL_LINK = process.env.CHANNEL_LINK || 'https://t.me/your_channel';
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !MONGO_URI || !ADMIN_ID) {
  console.error('BOT_TOKEN, MONGO_URI, ADMIN_ID တွေကို .env ထဲမှာ ဖြည့်ပါ');
  process.exit(1);
}

// ---------- PREMIUM EMOJI IDs ----------
// Note: Telegram Bot API မှာ keyboard button label ထဲကို custom/premium
// emoji entity ထည့်လို့မရပါ (Telethon လို user-account library မှာသာ ရ)။
// ဒါကြောင့် button label တွေမှာ ဒီ emoji ID တွေရဲ့ ပုံမှန် unicode
// အနက်ကို ပြပေးထားပြီး၊ /start message စာသားထဲမှာတော့ tg-emoji
// entity အနေနဲ့ premium emoji အစစ်ပြပေးထားပါတယ် (parse_mode: HTML).
const EMOTE = {
  WELCOME: '6260170796790980056',       // 🍬 welcome line
  WALLET: '5328098344495490329',        // 💳 wallet balance line
  PRODUCTS: '5359805631320571519',      // ▪️
  MY_ORDERS: '5258011929993026890',     // 📦
  ACCOUNT: '5323289282499064033',       // 👤
  BALANCE: '5404359483155570991',       // 👛
  JOIN_CHANNEL: '6113870986484913105',  // 👋
  LANGUAGE: '5879585266426973039',      // 🌐
  REDEEM_CODE: '5359664288241829619',   // 🎁

  // ---- Products flow ----
  SELECT_PRODUCT: '4900189275326252171', // 🖤 Select a product:
  SVC_TELEGRAM: '6257974552379270658',   // 📱 Telegram
  SVC_TELEGRAMM: '5472239203590888751',  // 📩 Telegramm
  FLAG_MM: '6260246207826759565',        // 🇲🇲 +95
  FLAG_CO: '5294111658396895748',        // 🇨🇴 +57
  FLAG_US: '5987769694407368809',        // 🇺🇸 +1
  CHOOSE_FLAG: '6159042351537853617',    // ➡️ CHOOSE YOUR Flag
  TYPE_LABEL: '5298877105000439431',     // 🏷 Type:
  PRICE_LABEL: '6039495948353146588',    // 🔖 Price:
  INSTOCK_LABEL: '5323289282499064033',  // 📦 In stock:
  PAGE_LABEL: '5197219609970758159',     // 📝 Page x of y
  TAP_FLAG: '5231102735817918643',       // 👇 Tap a flag below to continue.

  // ---- Pre-purchase confirmation card ----
  BEFORE_BUY: '5864114012542736772',     // 🔥 BEFORE YOU BUY
  NEW_FLAG: '6158968370726179617',       // 🏷 New flag
  RESTRICTIONS: '5420323339723881652',   // ⚠️ restrictions
  BUY_NEW_FLAG: '5296369303661067030',   // 🔒 Buy new flag
  GET_FLAG_HAPPY: '6114069998089539705', // ✅ (reused for: "make happy" line, Accept & Buy button, success alert)
  CHANGE_FLAG: '5352587852880302091',    // ✈️ U can change new flag
  PRODUCT_DISCLAIMER: '6114141543654757519', // 📌 PRODUCT DISCLAIMER
  READ_DISCLAIMER: '5769482310915199790',    // 📢 Read Disclaimer (button)
  BACK: '6257789602497572109',           // ⬅️ Back (button)

  // ---- Deposit / Top-up flow ----
  DEPOSIT: '5222040745665379997',        // 💚 ငွေဖြည့်ရန်
  MIN_AMOUNT: '5864114012542736772',     // 🔥 minimum amount notice
  KPAY_ICON: '6201684659458280710',      // 💵 KPAY -
  WAVE_ICON: '6057728063049830775',      // 🆗 WAVE Pay -
  PARTY: '5226791576495216962',          // 🤩 screenshot pyo pay ba
  ENTER_AMOUNT: '5987643272045010909',   // ➡️ amount ရိုက်ထည့်ပါ
  MAX_NOTICE: '5226645496067542621',     // 🙋‍♀️ Maximum notice
  SUBMITTED: '5201691993775818138',      // 🛫 submitted to admin
  DEPOSIT_SUCCESS: '5253527915416539991', // 🤟 successful
  GET_OTP: '6217723016529316157',
};

// ---- Products / Countries data (placeholder - DB ချိတ်ပြီးမှ dynamic လုပ်နိုင်) ----
const SERVICES = {
  telegram: { label: 'Buy Telegram Accounts', emoteId: EMOTE.SVC_TELEGRAM },
  telegramm: { label: 'Buy Telegram Comments', emoteId: EMOTE.SVC_TELEGRAMM },
};

const COUNTRIES = [
  { code: 'mm', flag: '🇲🇲', dial: '+95', name: 'Myanmar', emoteId: EMOTE.FLAG_MM, labelSuffix: ' Account    .' },
  { code: 'co', flag: '🇨🇴', dial: '+57', name: 'Colombia', emoteId: EMOTE.FLAG_CO, labelSuffix: ' Account    .' },
  { code: 'us', flag: '🇺🇸', dial: '+1', name: 'UnitedState', emoteId: EMOTE.FLAG_US, labelSuffix: ' Account  .' },
];

// Price per country group (Ks) — button label ထဲမှာလည်း ဒီနေရာကနေ ရွေးပြသွားမှာပါ
const PRICES = { mm: 2000, co: 1700, us: 1500 };
const NUMBERS_PER_PAGE = 5;

// ---------- DB CONNECT ----------
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// ---------- SCHEMAS ----------
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true, index: true },
  username: String,
  firstName: String,
  balance: { type: Number, default: 0 },
  language: { type: String, default: 'mm' },
  orders: [
    {
      orderId: String,
      productName: String,
      phoneNumber: String,
      sessionText: String,
      amount: Number,
      status: { type: String, default: 'pending' },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model('User', userSchema);

// ---- Phone Number (account inventory) schema ----
const phoneNumberSchema = new mongoose.Schema({
  number: { type: String, required: true }, // e.g. +95xxxxxxxxx
  service: { type: String, required: true }, // telegram | telegramm
  countryCode: { type: String, required: true }, // mm | co | us
  price: { type: Number, required: true },
  sessionText: { type: String, required: true },
  status: { type: String, default: 'available' }, // available | sold
  createdAt: { type: Date, default: Date.now },
});
const PhoneNumber = mongoose.model('PhoneNumber', phoneNumberSchema);

// ---- Payment method settings (singleton doc, admin-editable) ----
const paymentSettingsSchema = new mongoose.Schema({
  kbzNumber: { type: String, default: '09784214387' },
  kbzName: { type: String, default: 'Mg Wai Yan Tun' },
  waveNumber: { type: String, default: '09792310926' },
  waveName: { type: String, default: 'Min Oak Soe' },
});
const PaymentSettings = mongoose.model('PaymentSettings', paymentSettingsSchema);

async function getPaymentSettings() {
  let settings = await PaymentSettings.findOne();
  if (!settings) settings = await PaymentSettings.create({});
  return settings;
}

// ---- Deposit / top-up request schema ----
const depositRequestSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  method: { type: String, required: true }, // kbz | wave
  amountRequested: { type: Number, required: true },
  screenshotFileId: { type: String, required: true },
  status: { type: String, default: 'pending' }, // pending | confirmed | cancelled
  adminChatId: Number,
  adminMessageId: Number,
  createdAt: { type: Date, default: Date.now },
});
const DepositRequest = mongoose.model('DepositRequest', depositRequestSchema);

// ---------- HELPERS ----------
async function getOrCreateUser(from) {
  let user = await User.findOne({ telegramId: from.id });
  if (!user) {
    user = await User.create({
      telegramId: from.id,
      username: from.username || '',
      firstName: from.first_name || '',
    });
  }
  return user;
}

function fmtKs(n) {
  return `${Number(n || 0).toLocaleString('en-US')} Ks`;
}

// ---------- KEYBOARD (matches the reference screenshot layout,
// cascaded one step as requested) ----------
function mainMenuKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: 'Products', icon_custom_emoji_id: EMOTE.PRODUCTS }],
        [
          { text: 'My Orders', icon_custom_emoji_id: EMOTE.MY_ORDERS },
          { text: 'Account', icon_custom_emoji_id: EMOTE.ACCOUNT }
        ],
        [
          { text: 'Balance', icon_custom_emoji_id: EMOTE.BALANCE },
          { text: 'Join Channel', icon_custom_emoji_id: EMOTE.JOIN_CHANNEL }
        ],
        [
          { text: 'Language', icon_custom_emoji_id: EMOTE.LANGUAGE },
          { text: 'Redeem Code', icon_custom_emoji_id: EMOTE.REDEEM_CODE }
        ],
      ],
      resize_keyboard: true,
      is_persistent: true,
    },
  };
}

// ---------- PRODUCTS FLOW KEYBOARDS ----------
// Note: inline button label ထဲမှာလည်း custom/premium emoji entity
// ထည့်လို့မရတာ Bot API limitation အတူတူပါပဲ (Reply keyboard အတွက်
// ရှင်းထားသလိုပါပဲ) — ဒါကြောင့် button label တွေမှာ ပုံမှန် unicode
// flag/emoji ပဲ သုံးထားပြီး၊ edit လုပ်တဲ့ message text ထဲမှာတော့
// premium emoji ID တွေကို tg-emoji entity နဲ့ ပြထားပါတယ်။
function serviceSelectKeyboard() {
  return {
    inline_keyboard: [
      [{ text: SERVICES.telegram.label, callback_data: 'svc:telegram', icon_custom_emoji_id: SERVICES.telegram.emoteId }],
      [{ text: SERVICES.telegramm.label, callback_data: 'svc:telegramm', icon_custom_emoji_id: SERVICES.telegramm.emoteId }],
    ],
  };
}

function countrySelectKeyboard(serviceKey) {
  return {
    inline_keyboard: COUNTRIES.map((c) => [
      {
        text: `${c.dial} ${c.name}${c.labelSuffix} ${PRICES[c.code]}ks`,
        callback_data: `country:${serviceKey}:${c.code}`,
        icon_custom_emoji_id: c.emoteId,
      },
    ]),
  };
}

// Product card + phone-number BUTTONS, paginated NUMBERS_PER_PAGE at a time.
// totalPages is fully dynamic — derived from however many numbers admin
// has added for that service+country group (Math.ceil(total / 5)).
async function buildProductCard(serviceKey, country, requestedPage) {
  const filter = { service: serviceKey, countryCode: country.code, status: 'available' };
  const total = await PhoneNumber.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / NUMBERS_PER_PAGE));
  const page = Math.min(Math.max(1, requestedPage || 1), totalPages);
  const numbers = await PhoneNumber.find(filter)
    .sort({ createdAt: 1 })
    .skip((page - 1) * NUMBERS_PER_PAGE)
    .limit(NUMBERS_PER_PAGE);

  const price = PRICES[country.code] || 0;

  // Label column ကို width တူအောင် pad ထားလို့ colon တွေ တန်းတူ ကျချိန်ညှိပါ
  const padLabel = (label) => label.padEnd(10, ' ');

  const text =
    `<tg-emoji emoji-id="${EMOTE.CHOOSE_FLAG}">➡️</tg-emoji>CHOOSE YOUR TELEGRAM ACCOUNT\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `<tg-emoji emoji-id="${EMOTE.TYPE_LABEL}">🏷</tg-emoji> <b>${padLabel('Type')}:</b> ${country.flag}Account\n\n` +
    `🛍️ <b>${padLabel('Product')}:</b> Telegram Account\n\n` +
    `<tg-emoji emoji-id="${EMOTE.PRICE_LABEL}">🔖</tg-emoji> <b>${padLabel('Price')}:</b> ${fmtKs(price)}\n\n` +
    `<tg-emoji emoji-id="${EMOTE.INSTOCK_LABEL}">📦</tg-emoji> <b>${padLabel('In stock')}:</b> ${total} accounts\n\n` +
    `<tg-emoji emoji-id="${EMOTE.PAGE_LABEL}">📝</tg-emoji> Page ${page} of ${totalPages}\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `<tg-emoji emoji-id="${EMOTE.TAP_FLAG}">👇</tg-emoji><b>Tap a phone number below to continue.</b>`;

  // Each available number becomes its own button; Back/Next row goes
  // underneath the number buttons (only shown when relevant).
  // callback_data carries service/country/page so the purchase flow can
  // return the user to exactly this page afterwards.
  const rows = numbers.length
    ? numbers.map((n) => [
        {
          text: `${n.number}`,
          callback_data: `num:${n._id}:${serviceKey}:${country.code}:${page}`,
          icon_custom_emoji_id: country.emoteId,
        },
      ])
    : [[{ text: 'လက်ရှိ Number မရှိသေးပါ', callback_data: 'noop' }]];

  const navRow = [];
  if (page > 1) navRow.push({ text: 'Back', callback_data: `page:${serviceKey}:${country.code}:${page - 1}`, icon_custom_emoji_id: EMOTE.BACK });
  if (page < totalPages) navRow.push({ text: 'Next', callback_data: `page:${serviceKey}:${country.code}:${page + 1}`, icon_custom_emoji_id: EMOTE.CHOOSE_FLAG });
  if (navRow.length) rows.push(navRow);

  return { text, keyboard: { inline_keyboard: rows } };
}

// Pre-purchase confirmation card ("BEFORE YOU BUY")
function buildPrePurchaseCard(phoneDoc, country, serviceKey, page) {
  const text =
    `<tg-emoji emoji-id="${EMOTE.BEFORE_BUY}">🔥</tg-emoji>BEFORE YOU BUY\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `<tg-emoji emoji-id="${EMOTE.INSTOCK_LABEL}">📦</tg-emoji> Telegram ${country.name} Account\n\n` +
    `<tg-emoji emoji-id="${EMOTE.NEW_FLAG}">🏷</tg-emoji> New account\n\n` +
    `${country.flag} ${phoneDoc.number}\n` +
    `<tg-emoji emoji-id="${EMOTE.PRICE_LABEL}">🔖</tg-emoji> :${fmtKs(phoneDoc.price)}\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `<tg-emoji emoji-id="${EMOTE.RESTRICTIONS}">⚠️</tg-emoji> Telegram restrictions are outside our control.\n\n` +
    `<tg-emoji emoji-id="${EMOTE.BUY_NEW_FLAG}">🔒</tg-emoji> Request new login OTPs while the Bot remains connected.\n\n` +
    `<tg-emoji emoji-id="${EMOTE.GET_FLAG_HAPPY}">✅</tg-emoji> Once you successfully log in, the account is under your control.\n\n` +
    `<tg-emoji emoji-id="${EMOTE.CHANGE_FLAG}">✈️</tg-emoji> Change the email and 2FA immediately.\n\n` +
    `Tap “Accept & Buy” to continue.\n\n` +
    `<tg-emoji emoji-id="${EMOTE.PRODUCT_DISCLAIMER}">📌</tg-emoji> PRODUCT DISCLAIMER\n` +
    `Open the linked Telegram channel post and read it before confirming.`;

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Read Disclaimer', url: CHANNEL_LINK, icon_custom_emoji_id: EMOTE.READ_DISCLAIMER }],
      [{ text: 'Accept & Buy', callback_data: `accept:${phoneDoc._id}:${serviceKey}:${country.code}:${page}`, icon_custom_emoji_id: EMOTE.GET_FLAG_HAPPY }],
      [{ text: 'Back', callback_data: `back:${serviceKey}:${country.code}:${page}`, icon_custom_emoji_id: EMOTE.BACK }],
    ],
  };
  return { text, keyboard };
}

// ---------- ADMIN COMMAND LIST ----------
// Admin-only commands. If a non-admin user sends any of these,
// the bot stays completely silent (no reply at all).
const ADMIN_COMMANDS = [
  '/addbalance',
  '/removebalance',
  '/setbalance',
  '/stats',
  '/broadcast',
  '/users',
  '/admin',
  '/addnumber',
  '/cancel',
  '/editkbznumber',
  '/editkbzname',
  '/editwavenumber',
  '/editwavename',
];

function isAdminCommand(text) {
  if (!text) return false;
  const cmd = text.trim().split(/\s+/)[0].toLowerCase();
  return ADMIN_COMMANDS.some((c) => cmd === c || cmd.startsWith(c + '@'));
}

// ==========================================================
//  BOT INIT
// ==========================================================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
bot.on('polling_error', (err) => console.error('Polling error:', err.message));

// ---------- CHAT MENU BUTTON (attach icon ဘေးက icon) ----------
// User က session clear ပြီး ပြန်ဝင်လာရင် /start ကို ကိုယ်တိုင်ရိုက်စရာမလိုဘဲ
// text box ဘေး (attach 📎 icon ဘေး) ကလေး icon ကိုနှိပ်ရုံနဲ့ command list
// (/start, /menu) ပေါ်လာပြီး main menu ကို ချက်ချင်းပြန်ခေါ်နိုင်အောင် သတ်မှတ်ခြင်း
bot.setMyCommands([
  { command: 'start', description: '🍬 Main Menu ပြန်ဖွင့်ရန်' },
  { command: 'menu', description: '📋 Main Menu ပြန်ဖွင့်ရန်' },
]).catch((err) => console.error('setMyCommands error:', err.message));

bot.setChatMenuButton({ menu_button: { type: 'commands' } }).catch((err) =>
  console.error('setChatMenuButton error:', err.message)
);

// In-memory conversation state for the admin's multi-step /addnumber flow.
// (Single admin, so a simple Map keyed by admin id is enough.)
const adminState = new Map();

// ---------- GLOBAL ADMIN GATE ----------
// This runs for every message. If the text matches an admin-only
// command and sender is NOT the admin -> silently drop (no reply).
bot.on('message', async (msg) => {
  const text = msg.text || '';
  if (isAdminCommand(text) && msg.from.id !== ADMIN_ID) {
    // user သာသုံးရင် ဘာမှ လုံးဝ ပြန်မပို့ဘူး
    return;
  }
});

// ==========================================================
//  /start
// ==========================================================
bot.onText(/^\/start$/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await getOrCreateUser(msg.from);

  const welcomeText =
    `<tg-emoji emoji-id="${EMOTE.WELCOME}">🍬</tg-emoji><b>DigitalShopMm မှ ကြိုဆိုပါတယ်</b>\n\n` +
    `🛍Digital Products နှင့် Services များကို ငွေဖြည့်သွင်းပြီး လိုချင်သည့် ပစ္စည်းကို တိုက်ရိုက် လျှင်မြန်စွာဝယ်ယူနိုင်ပါသည်🛍\n\n` +
    `<tg-emoji emoji-id="${EMOTE.WALLET}">💳</tg-emoji>Wallet Balance: ${fmtKs(user.balance)}`;

  await bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'HTML',
    ...mainMenuKeyboard(),
  });
});

// /menu -> text box ဘေးက menu icon ကနေရော၊ ရိုက်ရိုက်ပို့ပို့ /start အတိုင်းပဲ
// main menu ကို ချက်ချင်းပြန်ဖွင့်ပေးမယ် (session clear ဖြစ်နေလည်း /start
// ကို ကိုယ်တိုင်ရိုက်စရာမလို)
bot.onText(/^\/menu$/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await getOrCreateUser(msg.from);

  const welcomeText =
    `<tg-emoji emoji-id="${EMOTE.WELCOME}">🍬</tg-emoji><b>DigitalShopMm မှ ကြိုဆိုပါတယ်</b>\n\n` +
    `🛍Digital Products နှင့် Services များကို ငွေဖြည့်သွင်းပြီး လိုချင်သည့် ပစ္စည်းကို တိုက်ရိုက် လျှင်မြန်စွာဝယ်ယူနိုင်ပါသည်🛍\n\n` +
    `<tg-emoji emoji-id="${EMOTE.WALLET}">💳</tg-emoji>Wallet Balance: ${fmtKs(user.balance)}`;

  await bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'HTML',
    ...mainMenuKeyboard(),
  });
});

// ==========================================================
//  USER MENU HANDLERS (Reply Keyboard button presses)
// ==========================================================
bot.onText(/^Products$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.SELECT_PRODUCT}">🖤</tg-emoji><b>Select a product:</b>`,
    { parse_mode: 'HTML', reply_markup: serviceSelectKeyboard() }
  );
});

// ---------- CALLBACK QUERY (inline button taps inside Products flow) ----------
bot.on('callback_query', async (query) => {
  const data = query.data || '';
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  try {
    if (data === 'opendeposit') {
      // Balance စာသားအောက်က 💚 ငွေဖြည့်ရန် 💚 inline button ကိုနှိပ်ရင် ငွေဖြည့်နည်းလမ်း ရွေးခိုင်းမယ်
      await bot.sendMessage(chatId, 'ငွေဖြည့်ရန် နည်းလမ်းရွေးချယ်ပါ 👇', {
        reply_markup: depositMethodKeyboard(),
      });
      await bot.answerCallbackQuery(query.id);
      return;
    } else if (data.startsWith('deposit:')) {
      // KBZ Pay / Wave Pay ရွေးလိုက်ရင် - account info ပြပြီး screenshot တောင်း
      const method = data.split(':')[1]; // kbz | wave
      const text = await paymentInfoText(method);
      await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML' });
      userDepositState.set(query.from.id, { step: 'awaiting_screenshot', method });
      await bot.answerCallbackQuery(query.id);
      return;
    } else if (data.startsWith('svc:')) {
      // Step 1 -> Step 2: service ရွေးပြီးရင် country/flag buttons အဖြစ်ပြောင်း
      const serviceKey = data.split(':')[1];
      await bot.editMessageReplyMarkup(countrySelectKeyboard(serviceKey), {
        chat_id: chatId,
        message_id: messageId,
      });
    } else if (data.startsWith('country:')) {
      // Step 2 -> Step 3: country ရွေးပြီးရင် product card + number list (page 1) ပြ
      const [, serviceKey, countryCode] = data.split(':');
      const country = COUNTRIES.find((c) => c.code === countryCode);
      const { text, keyboard } = await buildProductCard(serviceKey, country, 1);
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else if (data.startsWith('page:')) {
      // Next / Back pagination inside a country's number list
      const [, serviceKey, countryCode, pageStr] = data.split(':');
      const country = COUNTRIES.find((c) => c.code === countryCode);
      const { text, keyboard } = await buildProductCard(serviceKey, country, Number(pageStr));
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else if (data.startsWith('num:')) {
      // Step 3 -> Step 4: user tapped one specific phone-number button
      // -> show the "BEFORE YOU BUY" confirmation card.
      const [, id, serviceKey, countryCode, pageStr] = data.split(':');
      const phoneDoc = await PhoneNumber.findById(id);
      const country = COUNTRIES.find((c) => c.code === countryCode);
      if (!phoneDoc || phoneDoc.status !== 'available') {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ ဒီ Number ကို ရနိုင်တော့မည် မဟုတ်ပါ (ရောင်းပြီးသား ဖြစ်နိုင်ပါတယ်)။',
          show_alert: true,
        });
        // list ကို refresh ပြန်ပြ (sold ဖြစ်သွားပြီဆိုရင် list ထဲက ပျောက်သွားအောင်)
        const { text, keyboard } = await buildProductCard(serviceKey, country, Number(pageStr));
        await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: keyboard });
        return;
      }
      const { text, keyboard } = buildPrePurchaseCard(phoneDoc, country, serviceKey, Number(pageStr));
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else if (data.startsWith('back:')) {
      // Back button on the "BEFORE YOU BUY" card -> return to the number list
      const [, serviceKey, countryCode, pageStr] = data.split(':');
      const country = COUNTRIES.find((c) => c.code === countryCode);
      const { text, keyboard } = await buildProductCard(serviceKey, country, Number(pageStr));
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else if (data.startsWith('accept:')) {
      // Purchase confirmed -> deduct balance, mark number sold, record order
      const [, id, serviceKey, countryCode, pageStr] = data.split(':');
      const country = COUNTRIES.find((c) => c.code === countryCode);
      const phoneDoc = await PhoneNumber.findById(id);

      if (!phoneDoc || phoneDoc.status !== 'available') {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ ဒီ Number ကို ရောင်းပြီးသား ဖြစ်နေပါပြီ။',
          show_alert: true,
        });
        const { text, keyboard } = await buildProductCard(serviceKey, country, Number(pageStr));
        await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: keyboard });
        return;
      }

      const user = await getOrCreateUser(query.from);
      if (user.balance < phoneDoc.price) {
        await bot.answerCallbackQuery(query.id, {
          text: `❌ Balance မလုံလောက်ပါ။ လက်ရှိလက်ကျန်: ${fmtKs(user.balance)}, လိုအပ်သည်: ${fmtKs(phoneDoc.price)}`,
          show_alert: true,
        });
        return;
      }

      // Deduct balance + mark sold (best-effort atomicity: guard on status
      // still 'available' so two simultaneous buyers can't double-spend it)
      const stillAvailable = await PhoneNumber.findOneAndUpdate(
        { _id: phoneDoc._id, status: 'available' },
        { status: 'sold' },
        { new: true }
      );
      if (!stillAvailable) {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ တစ်ဦးဦးက ရွေးသွားပြီးသား ဖြစ်နေပါတယ်။',
          show_alert: true,
        });
        const { text, keyboard } = await buildProductCard(serviceKey, country, Number(pageStr));
        await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: keyboard });
        return;
      }

      const orderId = crypto.randomBytes(4).toString('hex');
      // Atomic balance deduction
      const updatedUser = await User.findOneAndUpdate(
        { telegramId: query.from.id, balance: { $gte: phoneDoc.price } },
        { 
          $inc: { balance: -phoneDoc.price },
          $push: { 
            orders: {
              orderId: orderId,
              productName: `${country.flag}${country.dial} ${country.name} flag`,
              phoneNumber: phoneDoc.number,
              sessionText: phoneDoc.sessionText,
              amount: phoneDoc.price,
              status: 'completed',
              createdAt: new Date()
            }
          }
        },
        { new: true }
      );

      if (!updatedUser) {
        // This shouldn't happen if the earlier balance check passed, 
        // but good for safety in case of concurrent buys.
        await PhoneNumber.findOneAndUpdate({ _id: phoneDoc._id }, { status: 'available' });
        return bot.answerCallbackQuery(query.id, { text: '❌ Balance မလုံလောက်ပါ သို့မဟုတ် Error ဖြစ်ပွားခဲ့သည်။', show_alert: true });
      }

      await bot.answerCallbackQuery(query.id, {
        text: '🎉 Purchase successful!',
        show_alert: false,
      });

      const successText = 
        `<tg-emoji emoji-id="${EMOTE.GET_FLAG_HAPPY}">✅</tg-emoji> <b>Purchase successful!</b>\n` +
        `Order: <code>#${orderId}</code>\n` +
        `Product: Account\n` +
        `Total: ${fmtKs(phoneDoc.price)}\n` +
        `Balance: ${fmtKs(updatedUser.balance)}\n` +
        `Phone: <code>${phoneDoc.number}</code>\n` +
        `2FA: <code>12345678@Nn</code>\n\n` +
        `<blockquote>Start Telegram login with this phone, then tap Get OTP. The bot checks for about 20 seconds and delivers one code</blockquote>\n\n` +
        `<blockquote>ယခု နံပါတ်နှင့် အကောင့်ဝင်ပါ ထို့နောက် get otpနိပ်၍ otp ရယူပါ ထို့နောက်botမှပေးသည့်otp codeအားရိုက်ထည့်ပါ\n` +
        `2step pswအား 2FAတွင်ပေးထားသည်</blockquote>`;

      await bot.editMessageText(successText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Get OTP', callback_data: `getotp:${orderId}`, icon_custom_emoji_id: EMOTE.GET_OTP }],
          ],
        },
      });
      return;
    } else if (data.startsWith('getotp:') || data.startsWith('resend:')) {
      const orderId = data.split(':')[1];
      const user = await getOrCreateUser(query.from);
      const order = user.orders.find(o => o.orderId === orderId);

      if (!order) {
        return bot.answerCallbackQuery(query.id, { text: '❌ Order မတွေ့ပါ။', show_alert: true });
      }

      await bot.answerCallbackQuery(query.id, { text: 'Checking OTP... ခဏစောင့်ပါ' });

      try {
        const { stdout } = await execPromise(`python3 otp_fetcher.py "${order.sessionText}"`);
        const result = JSON.parse(stdout);

        if (result.error) {
          await bot.sendMessage(chatId, `❌ Error: ${result.error}\n\nOTP မရရှိသေးပါ။ Telegram တွင် OTP ပို့ထားခြင်း ရှိမရှိ စစ်ဆေးပြီး Resend ကို နှိပ်ပါ။`);
        } else {
          const otpMatch = result.text.match(/\d{5,6}/);
          const otpCode = otpMatch ? otpMatch[0] : result.text;
          
          const otpText = `💰 <b>OTP Code:</b> <code>${otpCode}</code>\n` +
                          `🔒 <b>2step password:</b> <code>12345678@Nn</code>\n\n` +
                          `✅ <b>Successfully Login</b>`;

          await bot.sendMessage(chatId, otpText, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Copy OTP', copy_text: { text: otpCode } },
                  { text: 'Copy 2FA', copy_text: { text: '12345678@Nn' } }
                ],
                [{ text: 'Resend', callback_data: `resend:${orderId}`, icon_custom_emoji_id: EMOTE.GET_OTP }]
              ]
            }
          });
        }
      } catch (err) {
        console.error('OTP Fetch Error:', err);
        await bot.sendMessage(chatId, '❌ OTP စစ်ဆေးရာတွင် အမှားအယွင်းရှိနေပါသည်။ ခဏနေမှ ပြန်ကြိုးစားပါ။');
      }
      return;
    } else if (data.startsWith('copy:')) {
      const [, type, content] = data.split(':');
      await bot.answerCallbackQuery(query.id, { text: `Copied ${type}: ${content}`, show_alert: false });
      // Note: Real clipboard copy requires user interaction or specific client support.
      // We send it as a message or just answer the callback.
      return;
    } else if (data.startsWith('confirm:')) {
      // Admin confirms a deposit -> credit user's wallet with requested amount
      if (query.from.id !== ADMIN_ID) return void (await bot.answerCallbackQuery(query.id));
      const depositId = data.split(':')[1];
      const deposit = await DepositRequest.findById(depositId);
      if (!deposit || deposit.status !== 'pending') {
        await bot.answerCallbackQuery(query.id, { text: '❌ ဒီ Deposit ကို လုပ်ဆောင်ပြီးသား ဖြစ်နေပါတယ်။', show_alert: true });
        return;
      }
      const depositUser = await getOrCreateUser({ id: deposit.userId });
      depositUser.balance += deposit.amountRequested;
      await depositUser.save();
      deposit.status = 'confirmed';
      await deposit.save();

      await bot
        .sendMessage(
          deposit.userId,
          `သွင်းငွေ ${fmtKs(deposit.amountRequested)} အောင်မြင်သည်<tg-emoji emoji-id="${EMOTE.DEPOSIT_SUCCESS}">🤟</tg-emoji>`,
          { parse_mode: 'HTML' }
        )
        .catch(() => {});

      await bot
        .editMessageCaption(`✅ Confirmed — ${fmtKs(deposit.amountRequested)} credited to user ${deposit.userId}.`, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        })
        .catch((e) => console.error('editCaption error:', e.message));
      await bot.answerCallbackQuery(query.id, { text: '✅ Confirmed' });
      return;
    } else if (data.startsWith('editamt:')) {
      if (query.from.id !== ADMIN_ID) return void (await bot.answerCallbackQuery(query.id));
      const depositId = data.split(':')[1];
      adminState.set(ADMIN_ID, { step: 'awaiting_edit_amount', depositId });
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId, '💰 ဖြည့်ပေးမည့် Amount အသစ်ကို ရိုက်ထည့်ပါ (ဂဏန်းသာ)။');
      return;
    } else if (data.startsWith('cancelreply:')) {
      if (query.from.id !== ADMIN_ID) return void (await bot.answerCallbackQuery(query.id));
      const depositId = data.split(':')[1];
      adminState.set(ADMIN_ID, { step: 'awaiting_cancel_reason', depositId });
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId, '❌ Cancel ရတဲ့ အကြောင်းရင်းကို ရိုက်ပို့ပါ (user ဆီ ဒီအတိုင်း ပို့ပါမယ်)။');
      return;
    } else if (data.startsWith('editamtreply:')) {
      if (query.from.id !== ADMIN_ID) return void (await bot.answerCallbackQuery(query.id));
      const depositId = data.split(':')[1];
      adminState.set(ADMIN_ID, { step: 'awaiting_editreply_amount', depositId });
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId, '💰 ဖြည့်ပေးမည့် Amount အသစ်ကို ရိုက်ထည့်ပါ (ဂဏန်းသာ)။');
      return;
    } else if (data === 'noop') {
      await bot.answerCallbackQuery(query.id);
      return;
    }
    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error('callback_query error:', err.message);
    bot.answerCallbackQuery(query.id).catch(() => {});
  }
});

bot.onText(/^My Orders$/, async (msg) => {
  const user = await getOrCreateUser(msg.from);
  if (!user.orders.length) {
    return bot.sendMessage(
      msg.chat.id,
      `<tg-emoji emoji-id="${EMOTE.MY_ORDERS}">📦</tg-emoji><b>My Orders</b>\n\nသင့်မှာ Order မရှိသေးပါ။`,
      { parse_mode: 'HTML' }
    );
  }
  const list = user.orders
    .map(
      (o, i) =>
        `${i + 1}. ${o.productName} - ${fmtKs(o.amount)} [${o.status}]`
    )
    .join('\n');
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.MY_ORDERS}">📦</tg-emoji><b>My Orders</b>\n\n${list}`,
    { parse_mode: 'HTML' }
  );
});

bot.onText(/^Account$/, async (msg) => {
  const user = await getOrCreateUser(msg.from);
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.ACCOUNT}">👤</tg-emoji><b>Account</b>\n\n` +
      `ID: ${user.telegramId}\n` +
      `Username: @${user.username || '-'}\n` +
      `Balance: ${fmtKs(user.balance)}\n` +
      `Language: ${user.language}\n` +
      `Joined: ${user.createdAt.toDateString()}`,
    { parse_mode: 'HTML' }
  );
});

bot.onText(/^Balance$/, async (msg) => {
  const user = await getOrCreateUser(msg.from);
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.BALANCE}">👛</tg-emoji><b>Wallet Balance</b>\n\n` +
      `လက်ရှိ လက်ကျန်ငွေ: ${fmtKs(user.balance)}`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '💚 ငွေဖြည့်ရန် 💚', callback_data: 'opendeposit' }]],
      },
    }
  );
});

bot.onText(/^Join Channel$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.JOIN_CHANNEL}">👋</tg-emoji><b>Join our Channel</b>\n\n${CHANNEL_LINK}`,
    { parse_mode: 'HTML' }
  );
});

bot.onText(/^Language$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.LANGUAGE}">🌐</tg-emoji><b>Language</b>\n\nMyanmar (mm) / English (en) - ရွေးချယ်ရန် logic ကို လိုအပ်သလို ထပ်ထည့်နိုင်ပါတယ်။`,
    { parse_mode: 'HTML' }
  );
});

bot.onText(/^Redeem Code$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.REDEEM_CODE}">🎁</tg-emoji><b>Redeem Code</b>\n\nသင့်ရဲ့ Redeem Code ကို ပို့ပါ။`,
    { parse_mode: 'HTML' }
  );
});

// ==========================================================
//  DEPOSIT / TOP-UP FLOW (KBZ Pay / Wave Pay)
// ==========================================================

// Per-user conversation state while they're submitting a deposit
// (awaiting screenshot -> awaiting amount). Keyed by telegram user id.
const userDepositState = new Map();

function depositMethodKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'KBZ Pay ဖြင့်ငွေသွင်းမည်', callback_data: 'deposit:kbz' }],
      [{ text: 'Wave Pay ဖြင့်ငွေသွင်းမည်', callback_data: 'deposit:wave' }],
    ],
  };
}

async function paymentInfoText(method) {
  const settings = await getPaymentSettings();
  const line =
    method === 'kbz'
      ? `<tg-emoji emoji-id="${EMOTE.KPAY_ICON}">💵</tg-emoji> KPAY- ${settings.kbzNumber}`
      : `<tg-emoji emoji-id="${EMOTE.WAVE_ICON}">🆗</tg-emoji>WAVE Pay - ${settings.waveNumber}`;
  const name = method === 'kbz' ? settings.kbzName : settings.waveName;

  return (
    `<tg-emoji emoji-id="${EMOTE.MIN_AMOUNT}">🔥</tg-emoji>အနည်းဆုံး 1500 ကျပ်မှစဖြည့်ပါ\n\n` +
    `${line}\n` +
    `<tg-emoji emoji-id="${EMOTE.WELCOME}">🍬</tg-emoji>name - ${name}\n\n` +
    `ဆီသို့ ငွေလွဲပြီး screenshot ပို့ပေးပါ<tg-emoji emoji-id="${EMOTE.PARTY}">🤩</tg-emoji>`
  );
}

bot.onText(/^💚 ငွေဖြည့်ရန် 💚$/, async (msg) => {
  await bot.sendMessage(msg.chat.id, 'ငွေဖြည့်ရန် နည်းလမ်းရွေးချယ်ပါ 👇', {
    reply_markup: depositMethodKeyboard(),
  });
});

// ==========================================================
//  ADMIN COMMANDS  (only run if msg.from.id === ADMIN_ID,
//  the global gate above already blocked non-admins)
// ==========================================================

// /addbalance <telegramId> <amount>
bot.onText(/^\/addbalance (\d+) (\d+)$/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const [, targetId, amount] = match;
  const user = await User.findOneAndUpdate(
    { telegramId: Number(targetId) },
    { $inc: { balance: Number(amount) } },
    { new: true, upsert: true }
  );
  await bot.sendMessage(
    msg.chat.id,
    `✅ User ${targetId} ကို ${fmtKs(amount)} ထည့်ပေးလိုက်ပါပြီ။ လက်ရှိလက်ကျန်: ${fmtKs(user.balance)}`
  );
  // အသိပေးစာ user ဆီပို့မယ်
  bot
    .sendMessage(
      Number(targetId),
      `💳 သင့် Wallet ထဲကို ${fmtKs(amount)} ဖြည့်ပေးလိုက်ပါပြီ။ လက်ရှိလက်ကျန်: ${fmtKs(user.balance)}`
    )
    .catch(() => {});
});

// /removebalance <telegramId> <amount>
bot.onText(/^\/removebalance (\d+) (\d+)$/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const [, targetId, amount] = match;
  const user = await User.findOneAndUpdate(
    { telegramId: Number(targetId) },
    { $inc: { balance: -Number(amount) } },
    { new: true }
  );
  if (!user) return bot.sendMessage(msg.chat.id, '❌ User မတွေ့ပါ။');
  await bot.sendMessage(
    msg.chat.id,
    `✅ User ${targetId} ဆီကနေ ${fmtKs(amount)} နှုတ်လိုက်ပါပြီ။ လက်ရှိလက်ကျန်: ${fmtKs(user.balance)}`
  );
});

// /setbalance <telegramId> <amount>
bot.onText(/^\/setbalance (\d+) (\d+)$/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const [, targetId, amount] = match;
  const user = await User.findOneAndUpdate(
    { telegramId: Number(targetId) },
    { balance: Number(amount) },
    { new: true, upsert: true }
  );
  await bot.sendMessage(
    msg.chat.id,
    `✅ User ${targetId} ရဲ့ balance ကို ${fmtKs(user.balance)} အဖြစ် သတ်မှတ်လိုက်ပါပြီ။`
  );
});

// /stats
bot.onText(/^\/stats$/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  const totalUsers = await User.countDocuments();
  const agg = await User.aggregate([
    { $group: { _id: null, totalBalance: { $sum: '$balance' } } },
  ]);
  const totalBalance = agg[0]?.totalBalance || 0;
  await bot.sendMessage(
    msg.chat.id,
    `📊 Bot Stats\n\nTotal Users: ${totalUsers}\nTotal Wallet Balance (all users): ${fmtKs(totalBalance)}`
  );
});

// /users  (list latest 20)
bot.onText(/^\/users$/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  const users = await User.find().sort({ createdAt: -1 }).limit(20);
  const list = users
    .map((u) => `${u.telegramId} | @${u.username || '-'} | ${fmtKs(u.balance)}`)
    .join('\n');
  await bot.sendMessage(msg.chat.id, `👥 Latest Users\n\n${list || 'No users yet.'}`);
});

// /broadcast <message>
bot.onText(/^\/broadcast ([\s\S]+)$/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const text = match[1];
  const users = await User.find();
  let sent = 0;
  for (const u of users) {
    try {
      await bot.sendMessage(u.telegramId, text);
      sent++;
    } catch (e) {
      /* user blocked bot etc - skip */
    }
  }
  await bot.sendMessage(msg.chat.id, `✅ Broadcast ပို့ပြီးပါပြီ (${sent}/${users.length}).`);
});

// /admin - help menu for admin
bot.onText(/^\/admin$/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  await bot.sendMessage(
    msg.chat.id,
    `🔑 Admin Commands\n\n` +
      `/addbalance <id> <amount>\n` +
      `/removebalance <id> <amount>\n` +
      `/setbalance <id> <amount>\n` +
      `/addnumber\n` +
      `/editkbznumber <number>\n` +
      `/editkbzname <name>\n` +
      `/editwavenumber <number>\n` +
      `/editwavename <name>\n` +
      `/stats\n` +
      `/users\n` +
      `/broadcast <message>\n` +
      `/cancel — running flow ကို ရပ်တန့်ရန်`
  );
});

// /cancel - abort whatever multi-step flow admin is currently in
bot.onText(/^\/cancel$/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  if (adminState.has(ADMIN_ID)) {
    adminState.delete(ADMIN_ID);
    await bot.sendMessage(msg.chat.id, '❌ လက်ရှိ လုပ်ဆောင်နေမှုကို ရပ်လိုက်ပါပြီ။');
  } else {
    await bot.sendMessage(msg.chat.id, 'ရပ်စရာ လုပ်ဆောင်ချက် မရှိပါ။');
  }
});

// ==========================================================
//  /addnumber  (admin multi-step flow)
//  Step 1: ask for phone number  -> detect country + price
//  Step 2: ask for session (txt file OR plain text)
//          -> save PhoneNumber doc, auto-slot into its country group
// ==========================================================
bot.onText(/^\/addnumber$/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  adminState.set(ADMIN_ID, { step: 'awaiting_phone' });
  await bot.sendMessage(
    msg.chat.id,
    '📞 ထည့်မည့် Phone Number ကို ပို့ပါ (ဥပမာ - +95xxxxxxxxx)\n\nရပ်ချင်ရင် /cancel ရိုက်ပါ။'
  );
});

// ==========================================================
//  Payment info edit commands (KBZ Pay / Wave Pay number & name)
// ==========================================================
bot.onText(/^\/editkbznumber (.+)$/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const settings = await getPaymentSettings();
  settings.kbzNumber = match[1].trim();
  await settings.save();
  await bot.sendMessage(msg.chat.id, `✅ KBZ Pay Number ကို ${settings.kbzNumber} အဖြစ် ပြင်ပြီးပါပြီ။`);
});

bot.onText(/^\/editkbzname (.+)$/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const settings = await getPaymentSettings();
  settings.kbzName = match[1].trim();
  await settings.save();
  await bot.sendMessage(msg.chat.id, `✅ KBZ Pay Name ကို ${settings.kbzName} အဖြစ် ပြင်ပြီးပါပြီ။`);
});

bot.onText(/^\/editwavenumber (.+)$/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const settings = await getPaymentSettings();
  settings.waveNumber = match[1].trim();
  await settings.save();
  await bot.sendMessage(msg.chat.id, `✅ Wave Pay Number ကို ${settings.waveNumber} အဖြစ် ပြင်ပြီးပါပြီ။`);
});

bot.onText(/^\/editwavename (.+)$/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const settings = await getPaymentSettings();
  settings.waveName = match[1].trim();
  await settings.save();
  await bot.sendMessage(msg.chat.id, `✅ Wave Pay Name ကို ${settings.waveName} အဖြစ် ပြင်ပြီးပါပြီ။`);
});

// Generic listener that drives the /addnumber conversation. Only ever
// acts on messages from ADMIN_ID while a flow is in progress, and only
// on messages that are NOT one of the admin slash-commands themselves
// (so /cancel etc. keep working normally via their own handlers).
bot.on('message', async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  const state = adminState.get(ADMIN_ID);
  if (!state) return;
  if (msg.text && msg.text.startsWith('/')) return; // let slash commands run their own handler

  if (state.step === 'awaiting_phone') {
    const phone = (msg.text || '').trim();
    const country = COUNTRIES.find((c) => phone.startsWith(c.dial));
    if (!country) {
      return bot.sendMessage(
        msg.chat.id,
        `❌ ဒီ Phone Number ရဲ့ နိုင်ငံကုဒ်ကို မသိပါ (${COUNTRIES.map((c) => c.dial).join(', ')} တွေပဲ လက်ရှိထောက်ပံ့ထားပါတယ်)။ ပြန်ပို့ပါ။`
      );
    }
    adminState.set(ADMIN_ID, {
      step: 'awaiting_session',
      phone,
      countryCode: country.code,
      price: PRICES[country.code] || 0,
    });
    return bot.sendMessage(
      msg.chat.id,
      `✅ ${country.flag}${phone} ကို ${country.flag}${country.dial} ${country.name} Account (${fmtKs(
        PRICES[country.code] || 0
      )}) အုပ်စုထဲ ထည့်ပါမယ်။\n\n📄 ယခု Session ကို ပို့ပါ — .txt file အနေနဲ့ upload လုပ်လည်းရ / စာသားအနေနဲ့ တိုက်ရိုက်ရိုက်ပို့လည်း ရပါတယ်။`
    );
  }

  if (state.step === 'awaiting_session') {
    let sessionText = null;

    if (msg.document) {
      try {
        const fileLink = await bot.getFileLink(msg.document.file_id);
        const res = await fetch(fileLink);
        sessionText = await res.text();
      } catch (err) {
        console.error('session file download error:', err.message);
        return bot.sendMessage(msg.chat.id, '❌ File download မအောင်မြင်ပါ။ ပြန်ကြိုးစားပါ။');
      }
    } else if (msg.text) {
      sessionText = msg.text.trim();
    }

    if (!sessionText) {
      return bot.sendMessage(msg.chat.id, '❌ Session file (.txt) သို့မဟုတ် စာသားအနေနဲ့ ပို့ပါ။');
    }

    await PhoneNumber.create({
      number: state.phone,
      service: 'telegram', // default group; admin service ရွေးချယ်ခွင့် ထပ်လိုအပ်ရင် flow ထဲ ထပ်ထည့်နိုင်ပါတယ်
      countryCode: state.countryCode,
      price: state.price,
      sessionText,
    });

    const country = COUNTRIES.find((c) => c.code === state.countryCode);
    adminState.delete(ADMIN_ID);
    return bot.sendMessage(
      msg.chat.id,
      `✅ ${country.flag}${state.phone} ကို session နဲ့အတူ ${country.flag}${country.dial} ${country.name} Account အုပ်စုထဲ ထည့်ပြီးပါပြီ။`
    );
  }

  if (state.step === 'awaiting_edit_amount' || state.step === 'awaiting_editreply_amount') {
    const amountText = (msg.text || '').trim();
    if (!/^[0-9]+$/.test(amountText)) {
      return bot.sendMessage(msg.chat.id, '❌ ဂဏန်းသာ ရိုက်ထည့်ပါ။');
    }
    const amount = Number(amountText);
    const deposit = await DepositRequest.findById(state.depositId);
    if (!deposit || deposit.status !== 'pending') {
      adminState.delete(ADMIN_ID);
      return bot.sendMessage(msg.chat.id, '❌ ဒီ Deposit ကို လုပ်ဆောင်ပြီးသား ဖြစ်နေပါတယ်။');
    }

    if (state.step === 'awaiting_edit_amount') {
      // Edit Amount only -> credit immediately with the admin-specified amount
      deposit.amountRequested = amount;
      deposit.status = 'confirmed';
      await deposit.save();
      const depositUser = await getOrCreateUser({ id: deposit.userId });
      depositUser.balance += amount;
      await depositUser.save();
      adminState.delete(ADMIN_ID);

      await bot
        .sendMessage(
          deposit.userId,
          `သွင်းငွေ ${fmtKs(amount)} အောင်မြင်သည်<tg-emoji emoji-id="${EMOTE.DEPOSIT_SUCCESS}">🤟</tg-emoji>`,
          { parse_mode: 'HTML' }
        )
        .catch(() => {});
      if (deposit.adminChatId && deposit.adminMessageId) {
        await bot
          .editMessageCaption(`✅ Confirmed (edited) — ${fmtKs(amount)} credited to user ${deposit.userId}.`, {
            chat_id: deposit.adminChatId,
            message_id: deposit.adminMessageId,
            reply_markup: { inline_keyboard: [] },
          })
          .catch(() => {});
      }
      return bot.sendMessage(msg.chat.id, `✅ User ${deposit.userId} ဆီ ${fmtKs(amount)} ဖြည့်ပေးလိုက်ပါပြီ။`);
    }

    // Edit Amount & Reply -> store the amount, now ask for the custom reply message
    adminState.set(ADMIN_ID, { step: 'awaiting_editreply_message', depositId: state.depositId, amount });
    return bot.sendMessage(msg.chat.id, '✏️ User ဆီ ပို့ချင်တဲ့ Reply စာသားကို ရိုက်ပို့ပါ။');
  }

  if (state.step === 'awaiting_editreply_message') {
    const replyText = msg.text || '';
    if (!replyText.trim()) return bot.sendMessage(msg.chat.id, '❌ Reply စာသား ရိုက်ပို့ပါ။');

    const deposit = await DepositRequest.findById(state.depositId);
    adminState.delete(ADMIN_ID);
    if (!deposit || deposit.status !== 'pending') {
      return bot.sendMessage(msg.chat.id, '❌ ဒီ Deposit ကို လုပ်ဆောင်ပြီးသား ဖြစ်နေပါတယ်။');
    }

    deposit.amountRequested = state.amount;
    deposit.status = 'confirmed';
    await deposit.save();
    const depositUser = await getOrCreateUser({ id: deposit.userId });
    depositUser.balance += state.amount;
    await depositUser.save();

    await bot.sendMessage(deposit.userId, replyText).catch(() => {});
    if (deposit.adminChatId && deposit.adminMessageId) {
      await bot
        .editMessageCaption(
          `✅ Confirmed (edited + replied) — ${fmtKs(state.amount)} credited to user ${deposit.userId}.`,
          { chat_id: deposit.adminChatId, message_id: deposit.adminMessageId, reply_markup: { inline_keyboard: [] } }
        )
        .catch(() => {});
    }
    return bot.sendMessage(msg.chat.id, `✅ ပြီးပါပြီ — User ${deposit.userId} ဆီ ${fmtKs(state.amount)} ဖြည့်ပြီး Reply ပါ ပို့ပြီးပါပြီ။`);
  }

  if (state.step === 'awaiting_cancel_reason') {
    const reason = msg.text || '';
    if (!reason.trim()) return bot.sendMessage(msg.chat.id, '❌ Cancel အကြောင်းရင်း ရိုက်ပို့ပါ။');

    const deposit = await DepositRequest.findById(state.depositId);
    adminState.delete(ADMIN_ID);
    if (!deposit || deposit.status !== 'pending') {
      return bot.sendMessage(msg.chat.id, '❌ ဒီ Deposit ကို လုပ်ဆောင်ပြီးသား ဖြစ်နေပါတယ်။');
    }
    deposit.status = 'cancelled';
    await deposit.save();

    await bot
      .sendMessage(
        deposit.userId,
        `ငွေဖြည့်သွင်းခြင်း မအောင်မြင်ပါ\nမအောင်မြင်ရသည့်အကြောင်းအရင်း : ${reason}`
      )
      .catch(() => {});
    if (deposit.adminChatId && deposit.adminMessageId) {
      await bot
        .editMessageCaption(`❌ Cancelled — reason: ${reason}`, {
          chat_id: deposit.adminChatId,
          message_id: deposit.adminMessageId,
          reply_markup: { inline_keyboard: [] },
        })
        .catch(() => {});
    }
    return bot.sendMessage(msg.chat.id, `❌ User ${deposit.userId} ရဲ့ Deposit ကို Cancel လုပ်ပြီး အကြောင်းကြားပြီးပါပြီ။`);
  }
});

// ==========================================================
//  USER-SIDE DEPOSIT SUBMISSION (screenshot -> amount -> notify admin)
// ==========================================================
bot.on('message', async (msg) => {
  const state = userDepositState.get(msg.from.id);
  if (!state) return;

  if (state.step === 'awaiting_screenshot') {
    if (!msg.photo || !msg.photo.length) {
      return bot.sendMessage(msg.chat.id, '📸 ငွေလွှဲ Screenshot (ပုံ) ကို ပို့ပေးပါ။');
    }
    const fileId = msg.photo[msg.photo.length - 1].file_id; // largest size
    userDepositState.set(msg.from.id, { step: 'awaiting_amount', method: state.method, fileId });
    await bot.sendMessage(
      msg.chat.id,
      `<tg-emoji emoji-id="${EMOTE.ENTER_AMOUNT}">➡️</tg-emoji>မိမိဖြည့်သွင်းထားသည့် ငွေamount အားရိုက်ထည့်ပါ`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (state.step === 'awaiting_amount') {
    const raw = (msg.text || '').trim();

    // မြန်မာဂဏန်း (၀-၉) တွေ ပါနေရင် English ဂဏန်းသာ ရိုက်ခိုင်း
    if (/[\u1040-\u1049]/.test(raw)) {
      return bot.sendMessage(msg.chat.id, 'English Number သာ ရိုက်ပေးပါ။ (ဥပမာ - 5000)');
    }
    // ဂဏန်းအပြင် စာလုံးတခြား ပါရင် reject + input အလွန်ရှည်ရင်လည်း (bot crash/abuse
    // ကာကွယ်ရန်) reject
    if (!/^[0-9]+$/.test(raw) || raw.length > 9) {
      return bot.sendMessage(msg.chat.id, '🔢 ဂဏန်း (number) သာ ရိုက်ထည့်ပါ။');
    }

    const amount = Number(raw);
    if (amount > 100000) {
      return bot.sendMessage(
        msg.chat.id,
        `<tg-emoji emoji-id="${EMOTE.MAX_NOTICE}">🙋‍♀️</tg-emoji>Maximum ထည့်ရှိနိုင်သောပမာဏမှာ ၁သိန်း ကျပ်သာ ဖြစ်ပါသည်၊၊`,
        { parse_mode: 'HTML' }
      );
    }
    if (amount <= 0) {
      return bot.sendMessage(msg.chat.id, '🔢 မှန်ကန်တဲ့ ပမာဏကို ရိုက်ထည့်ပါ။');
    }

    const deposit = await DepositRequest.create({
      userId: msg.from.id,
      method: state.method,
      amountRequested: amount,
      screenshotFileId: state.fileId,
    });
    userDepositState.delete(msg.from.id);

    await bot.sendMessage(
      msg.chat.id,
      `သွင်းငွေ ${fmtKs(amount)} အား adminထံသို့ တင်ပြပေးထားပါတယ်။ မကြာမှီ adminမှ ငွေဖြည့်ပေးသွားမည်<tg-emoji emoji-id="${EMOTE.SUBMITTED}">🛫</tg-emoji>`,
      { parse_mode: 'HTML' }
    );

    // admin ဆီ notification ပို့ (screenshot + action buttons)
    const caption =
      `🧾 Deposit Request\n\n` +
      `User ID: ${msg.from.id}\n` +
      `Username: @${msg.from.username || '-'}\n` +
      `Method: ${state.method.toUpperCase()}\n` +
      `Amount: ${fmtKs(amount)}`;
    try {
      const sent = await bot.sendPhoto(ADMIN_ID, state.fileId, {
        caption,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Confirm', callback_data: `confirm:${deposit._id}` },
              { text: '✏️ Edit Amount', callback_data: `editamt:${deposit._id}` },
            ],
            [
              { text: '❌ Cancel & Reply', callback_data: `cancelreply:${deposit._id}` },
              { text: '✏️ Edit Amount & Reply', callback_data: `editamtreply:${deposit._id}` },
            ],
          ],
        },
      });
      deposit.adminChatId = sent.chat.id;
      deposit.adminMessageId = sent.message_id;
      await deposit.save();
    } catch (err) {
      console.error('admin deposit notify error:', err.message);
    }
  }
});

// ==========================================================
//  EXPRESS SERVER (Render free web-service requires an open
//  port for its health check — polling bot doesn't bind one
//  on its own, so we add a tiny server here)
// ==========================================================
const app = express();
app.get('/', (req, res) => res.send('DigitalShopMm Bot is running ✅'));
app.listen(PORT, () => console.log(`🌐 Health server listening on port ${PORT}`));

console.log('🤖 Bot started (polling mode)...');
