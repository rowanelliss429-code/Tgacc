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
};

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
    `<tg-emoji emoji-id="${EMOTE.PRODUCTS}">▪️</tg-emoji><b>Products</b>\n\nလက်ရှိ ရောင်းချနေသော Digital Products များကို ဒီနေရာမှာ စာရင်းပြပေးမှာဖြစ်ပါတယ်။ (Product list ကို database ထဲက dynamic ဆွဲပြရန် ထပ်ဆောင်း logic လိုအပ်ပါသေးတယ်)`,
    { parse_mode: 'HTML' }
  );
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
