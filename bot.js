// ==========================================================
//  DigitalShopMm Telegram Bot
//  Admin Panel + User Panel + MongoDB Wallet System
// ==========================================================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');

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
};

// ---- Products / Countries data (placeholder - DB ချိတ်ပြီးမှ dynamic လုပ်နိုင်) ----
const SERVICES = {
  telegram: { label: '📱 Telegram', emoteId: EMOTE.SVC_TELEGRAM },
  telegramm: { label: '📩 Telegramm', emoteId: EMOTE.SVC_TELEGRAMM },
};

const COUNTRIES = [
  { code: 'mm', flag: '🇲🇲', dial: '+95', name: 'Myanmar', emoteId: EMOTE.FLAG_MM, labelSuffix: ' Account' },
  { code: 'co', flag: '🇨🇴', dial: '+57', name: 'Colombia', emoteId: EMOTE.FLAG_CO, labelSuffix: '' },
  { code: 'us', flag: '🇺🇸', dial: '+1', name: 'UnitedState', emoteId: EMOTE.FLAG_US, labelSuffix: '' },
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
      productName: String,
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
        ['▪️ Products'],
        ['📦 My Orders', '👤 Account'],
        ['👛 Balance', '👋 Join Channel'],
        ['🌐 Language', '🎁 Redeem Code'],
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
      [{ text: SERVICES.telegram.label, callback_data: 'svc:telegram' }],
      [{ text: SERVICES.telegramm.label, callback_data: 'svc:telegramm' }],
    ],
  };
}

function countrySelectKeyboard(serviceKey) {
  return {
    inline_keyboard: COUNTRIES.map((c) => [
      {
        text: `${c.flag}${c.dial} ${c.name}${c.labelSuffix} . ${PRICES[c.code]}ks`,
        callback_data: `country:${serviceKey}:${c.code}`,
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

  const text =
    `<tg-emoji emoji-id="${EMOTE.CHOOSE_FLAG}">➡️</tg-emoji>CHOOSE YOUR Flag\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `<tg-emoji emoji-id="${EMOTE.TYPE_LABEL}">🏷</tg-emoji><b>Type:</b> ${country.flag}\n` +
    `🛍️<b>Product:</b> ${country.flag}${country.dial} ${country.name} Account\n` +
    `<tg-emoji emoji-id="${EMOTE.PRICE_LABEL}">🔖</tg-emoji><b>Price:</b> ${fmtKs(price)}\n` +
    `<tg-emoji emoji-id="${EMOTE.INSTOCK_LABEL}">📦</tg-emoji><b>In stock:</b> ${total}\n` +
    `<tg-emoji emoji-id="${EMOTE.PAGE_LABEL}">📝</tg-emoji>Page ${page} of ${totalPages}\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `<tg-emoji emoji-id="${EMOTE.TAP_FLAG}">👇</tg-emoji><b>Choose a number below to continue.</b>`;

  // Each available number becomes its own button; Back/Next row goes
  // underneath the number buttons (only shown when relevant).
  // callback_data carries service/country/page so the purchase flow can
  // return the user to exactly this page afterwards.
  const rows = numbers.length
    ? numbers.map((n) => [
        { text: `${country.flag}${n.number}`, callback_data: `num:${n._id}:${serviceKey}:${country.code}:${page}` },
      ])
    : [[{ text: 'လက်ရှိ Number မရှိသေးပါ', callback_data: 'noop' }]];

  const navRow = [];
  if (page > 1) navRow.push({ text: '⬅️ Back', callback_data: `page:${serviceKey}:${country.code}:${page - 1}` });
  if (page < totalPages) navRow.push({ text: 'Next ➡️', callback_data: `page:${serviceKey}:${country.code}:${page + 1}` });
  if (navRow.length) rows.push(navRow);

  return { text, keyboard: { inline_keyboard: rows } };
}

// Pre-purchase confirmation card ("BEFORE YOU BUY")
function buildPrePurchaseCard(phoneDoc, country, serviceKey, page) {
  const text =
    `<tg-emoji emoji-id="${EMOTE.BEFORE_BUY}">🔥</tg-emoji>BEFORE YOU BUY\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `<tg-emoji emoji-id="${EMOTE.INSTOCK_LABEL}">📦</tg-emoji>Telegram ${country.name} flag\n` +
    `<tg-emoji emoji-id="${EMOTE.NEW_FLAG}">🏷</tg-emoji>New flag\n` +
    `${country.flag} ${country.dial}\n` +
    `<tg-emoji emoji-id="${EMOTE.PRICE_LABEL}">🔖</tg-emoji>: ${fmtKs(phoneDoc.price)}\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `<tg-emoji emoji-id="${EMOTE.RESTRICTIONS}">⚠️</tg-emoji> restrictions .\n` +
    `<tg-emoji emoji-id="${EMOTE.BUY_NEW_FLAG}">🔒</tg-emoji> Buy new flag.\n` +
    `<tg-emoji emoji-id="${EMOTE.GET_FLAG_HAPPY}">✅</tg-emoji> Once get new flag, make happy\n` +
    `<tg-emoji emoji-id="${EMOTE.CHANGE_FLAG}">✈️</tg-emoji> U can change new flag.\n` +
    `Tap "Accept & Buy" to continue.\n\n` +
    `<tg-emoji emoji-id="${EMOTE.PRODUCT_DISCLAIMER}">📌</tg-emoji> PRODUCT DISCLAIMER\n` +
    `Open the linked Telegram channel post and read it before confirming.`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📢 Read Disclaimer', url: CHANNEL_LINK }],
      [{ text: '✅ Accept & Buy', callback_data: `accept:${phoneDoc._id}:${serviceKey}:${country.code}:${page}` }],
      [{ text: '⬅️ Back', callback_data: `back:${serviceKey}:${country.code}:${page}` }],
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

// ==========================================================
//  USER MENU HANDLERS (Reply Keyboard button presses)
// ==========================================================
bot.onText(/^▪️ Products$/, async (msg) => {
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
    if (data.startsWith('svc:')) {
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
      user.balance -= phoneDoc.price;
      user.orders.push({
        productName: `${country.flag}${country.dial} ${country.name} flag (${orderId})`,
        amount: phoneDoc.price,
        status: 'completed',
      });
      await user.save();

      await bot.answerCallbackQuery(query.id, {
        text: '🎉 Great, you got this flag!',
        show_alert: true,
      });

      // Purchase ပြီးရင် number list (updated stock/page) ကို ပြန်ပြ
      const { text, keyboard } = await buildProductCard(serviceKey, country, Number(pageStr));
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
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

bot.onText(/^📦 My Orders$/, async (msg) => {
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

bot.onText(/^👤 Account$/, async (msg) => {
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

bot.onText(/^👛 Balance$/, async (msg) => {
  const user = await getOrCreateUser(msg.from);
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.BALANCE}">👛</tg-emoji><b>Wallet Balance</b>\n\n` +
      `လက်ရှိ လက်ကျန်ငွေ: ${fmtKs(user.balance)}\n\n` +
      `ငွေဖြည့်ရန် Support: @${SUPPORT_USERNAME} ကို ဆက်သွယ်ပါ။`,
    { parse_mode: 'HTML' }
  );
});

bot.onText(/^👋 Join Channel$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.JOIN_CHANNEL}">👋</tg-emoji><b>Join our Channel</b>\n\n${CHANNEL_LINK}`,
    { parse_mode: 'HTML' }
  );
});

bot.onText(/^🌐 Language$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.LANGUAGE}">🌐</tg-emoji><b>Language</b>\n\nMyanmar (mm) / English (en) - ရွေးချယ်ရန် logic ကို လိုအပ်သလို ထပ်ထည့်နိုင်ပါတယ်။`,
    { parse_mode: 'HTML' }
  );
});

bot.onText(/^🎁 Redeem Code$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.REDEEM_CODE}">🎁</tg-emoji><b>Redeem Code</b>\n\nသင့်ရဲ့ Redeem Code ကို ပို့ပါ။`,
    { parse_mode: 'HTML' }
  );
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
