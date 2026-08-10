// ==========================================================
//  DigitalShopMm Telegram Bot
//  Admin Panel + User Panel + MongoDB Wallet System
// ==========================================================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');

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
};

// ---- Products / Countries data (placeholder - DB ချိတ်ပြီးမှ dynamic လုပ်နိုင်) ----
const SERVICES = {
  telegram: { label: '📱 Telegram', emoteId: EMOTE.SVC_TELEGRAM },
  telegramm: { label: '📩 Telegramm', emoteId: EMOTE.SVC_TELEGRAMM },
};

const COUNTRIES = [
  { code: 'mm', flag: '🇲🇲', dial: '+95', name: 'Myanmar', emoteId: EMOTE.FLAG_MM },
  { code: 'co', flag: '🇨🇴', dial: '+57', name: 'Colombia', emoteId: EMOTE.FLAG_CO },
  { code: 'us', flag: '🇺🇸', dial: '+1', name: 'UnitedState', emoteId: EMOTE.FLAG_US },
];

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

// ---------- HELPERS ----------
async function getOrCreateUser(msg) {
  const from = msg.from;
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
        text: `${c.flag}${c.dial} ${c.name}`,
        callback_data: `country:${serviceKey}:${c.code}`,
      },
    ]),
  };
}

function productCardText(country) {
  return (
    `<tg-emoji emoji-id="${EMOTE.CHOOSE_FLAG}">➡️</tg-emoji>CHOOSE YOUR Flag\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `<tg-emoji emoji-id="${EMOTE.TYPE_LABEL}">🏷</tg-emoji><b>Type:</b> ${country.flag}\n` +
    `🛍️<b>Product:</b> test\n` +
    `<tg-emoji emoji-id="${EMOTE.PRICE_LABEL}">🔖</tg-emoji><b>Price:</b> test\n` +
    `<tg-emoji emoji-id="${EMOTE.INSTOCK_LABEL}">📦</tg-emoji><b>In stock:</b> test\n` +
    `<tg-emoji emoji-id="${EMOTE.PAGE_LABEL}">📝</tg-emoji>Page 1 of 3\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `<tg-emoji emoji-id="${EMOTE.TAP_FLAG}">👇</tg-emoji><b>Tap a flag below to continue.</b>`
  );
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
  const user = await getOrCreateUser(msg);

  const welcomeText =
    `<tg-emoji emoji-id="${EMOTE.WELCOME}">🍬</tg-emoji><b>DigitalShopMm မှ ကြိုဆိုပါတယ်</b>\n` +
    `🛍Digital Products နှင့် Services များကို ငွေဖြည့်သွင်းပြီး လိုချင်သည့် ပစ္စည်းကို တိုက်ရိုက် လျှင်မြန်စွာဝယ်ယူနိုင်ပါသည်🛍\n\n` +
    `Support » @${SUPPORT_USERNAME}\n\n` +
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
      // Step 2 -> Step 3: country ရွေးပြီးရင် product card ပြပြီး flag
      // button တွေကိုပဲ ပြန်ထားမယ် (ဆက်ရွေးလို့ရအောင်)
      const [, serviceKey, countryCode] = data.split(':');
      const country = COUNTRIES.find((c) => c.code === countryCode);
      await bot.editMessageText(productCardText(country), {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: countrySelectKeyboard(serviceKey),
      });
    }
    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error('callback_query error:', err.message);
    bot.answerCallbackQuery(query.id).catch(() => {});
  }
});

bot.onText(/^📦 My Orders$/, async (msg) => {
  const user = await getOrCreateUser(msg);
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
  const user = await getOrCreateUser(msg);
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
  const user = await getOrCreateUser(msg);
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
      `/stats\n` +
      `/users\n` +
      `/broadcast <message>`
  );
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
