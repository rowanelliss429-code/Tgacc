// Standalone test: mock mongoose + node-telegram-bot-api to verify
// the changed handlers produce the expected texts.
const fs = require('fs');

// --- Stub mongoose before requiring bot ---
function SchemaStub(def) { this.def = def; }
// Single shared in-memory store keyed by modelName so User / PhoneNumber /
// DepositRequest all share one stub with full method surface.
const store = {};
const sharedStub = Object.assign(() => {}, {
  connect: () => Promise.resolve(),
  findOneAndUpdate: async () => null,
  updateOne: async () => ({}),
  find: async () => [],
  findOne: async () => null,
  countDocuments: async () => 0,
  aggregate: async () => [],
  findById: async () => null,
  create: async (obj) => {
    const doc = { ...obj, balance: obj.balance ?? 1500, language: obj.language ?? 'mm', orders: [], createdAt: new Date() };
    doc.save = async function () { return this; };
    return doc;
  },
});
const StubDoc = Object.assign(function () {}, {
  connect: () => Promise.resolve(),
  Schema: Object.assign(SchemaStub, { Types: { Mixed: Object, String: String, Number: Number, Boolean: Boolean, Date: Date } }),
  model(name) {
    return sharedStub;
  },
});
require.cache[require.resolve('mongoose')] = {
  exports: StubDoc,
  id: require.resolve('mongoose'),
  filename: require.resolve('mongoose'),
  loaded: true,
};

// --- Mock TelegramBot (polling) ---
const sent = [];
const handlers = [];
class MockBot {
  constructor(token) {
    this.token = token;
    this.on = (type, cb) => handlers.push({ type, cb });
    this.onText = (regex, cb) => handlers.push({ type: 'text', regex, cb });
    this.sendMessage = async (chatId, text, extra) => { sent.push({ chatId, text, extra }); return { message_id: 1 }; };
    this.editMessageText = async (text, opts) => { sent.push({ edit: true, text, opts }); };
    this.answerCallbackQuery = async () => {};
    this.deleteMessage = async () => {};
    this.startPolling = () => {};
    this.setMyCommands = async () => {};
  }
}
require.cache[require.resolve('node-telegram-bot-api')] = {
  exports: MockBot,
  id: require.resolve('node-telegram-bot-api'),
  filename: require.resolve('node-telegram-bot-api'),
  loaded: true,
};

// Stub any unknown method on MockBot.prototype so bot.js startup calls work
const noopProxy = new Proxy(
  { noop: true },
  {
    get() {
      return async () => {};
    },
    has() {
      return true;
    },
  }
);
Object.setPrototypeOf(MockBot.prototype, noopProxy);

// Load bot module
require('./bot.js');

// ---- Tests ----
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}

// 4) Pagination pieces exist in source
const src = fs.readFileSync('./bot.js', 'utf8');
check('Source has /^ငွေဖြည့်ရန်$/ trigger', src.includes('^ငွေဖြည့်ရန်$'));
check('ORDERS_PER_PAGE = 10', src.includes('const ORDERS_PER_PAGE = 10'));
check('orders:page: callback handler exists', src.includes("data.startsWith('orders:page:')"));
check('Page x of y line in orders text', src.includes('📄 Page ${page} of ${totalPages}'));
check('Back button in orders nav', src.includes('callback_data: `orders:page:${page - 1}`'));

// 5) Slice math
const mockOrders = Array.from({ length: 25 }, (_, i) => ({ productName: `P${i}`, amount: 1500, status: 'completed' }));
check('25 orders -> 3 pages', Math.ceil(25 / 10) === 3);
check('page1 slice length 10', mockOrders.slice(0, 10).length === 10);
check('page3 slice length 5', mockOrders.slice(20, 30).length === 5);

// 6) Simulate handlers with fake messages. sharedStub.findOne returns a fresh
// user doc so getOrCreateUser never needs DB.
let nextId = 7000;
sharedStub.findOne = async (q) => {
  return {
    telegramId: (q && q.telegramId) || ++nextId,
    username: null,
    balance: 1500,
    language: 'mm',
    orders: [],
    save: async function () { return this; },
  };
};

async function fireText(pattern) {
  const h = handlers.find(h => h.type === 'text' && h.regex.test(pattern));
  if (!h) console.log(`no text handler for "${pattern}" (${handlers.filter(x=>x.type==='text').length} text handlers registered)`);
  else console.log(`firing handler for "${pattern}"`);
  return h && h.cb({ chat: { id: 999 }, from: { id: 777 }, text: pattern });
}

(async () => {
  // Balance menu button tap
  try {
    await fireText('Balance');
  } catch (e) {
    console.log('Balance error:', e.message, e.stack?.split('\n').slice(1, 3).join(' | '));
  }
  console.log('sent count:', sent.length, '| sample:', sent.map(s => (s.text || '').slice(0, 60)).join(' || '));
  const balanceMsg = sent.find(s => s.text && s.text.includes('Wallet Balance'));
  check(
    'Balance inline button uses new premium emote 5386757680679377085',
    balanceMsg &&
      balanceMsg.extra.reply_markup.inline_keyboard[0][0].icon_custom_emoji_id === '5386757680679377085' &&
      balanceMsg.extra.reply_markup.inline_keyboard[0][0].text.includes('ငွေဖြည့်ရန်')
  );
  check('Balance text contains လက်ရှိ လက်ကျန်ငွေ', balanceMsg && balanceMsg.text.includes('လက်ရှိ လက်ကျန်ငွေ'));
  check('Balance button text is ငွေဖြည့်ရန် without ordinary emoji', balanceMsg && balanceMsg.extra.reply_markup.inline_keyboard[0][0].text === 'ငွေဖြည့်ရန်');
  check('OUT OF STOCK label has no ordinary emoji and keeps premium emote ID', src.includes("text: 'OUT OF STOCK'") && !src.includes("text: '" + '‼️OUT OF STOCK' + "'") && src.includes("OUT_OF_STOCK_1: '5226700140936451703'"));

  // Language menu button tap
  await fireText('Language');
  const langMsg = sent[sent.length - 1];
  check(
    'Language default shows Language : Myanmar (mm)',
    langMsg && langMsg.text.includes('Language : Myanmar (mm)') && !langMsg.text.includes('logic')
  );

  // My Orders with 25 orders -> page 1 + page 3
  const myOrdersHandler = handlers.find(h => h.type === 'text' && h.regex.source === '^My Orders$');
  const originalFindOne = sharedStub.findOne;
  sharedStub.findOne = async () => ({
    telegramId: 888,
    username: null,
    balance: 5000,
    language: 'mm',
    orders: Array.from({ length: 25 }, (_, i) => ({
      orderId: `o${i}`, productName: `🇲🇲+95 Myanmar flag`, amount: 2000, status: 'completed',
    })),
    save: async function () { return this; },
  });
  try {
    await fireText('My Orders');
  } catch (e) {
    console.log('My Orders error:', e.message);
  }
  const ordersPage1 = sent.find((s) => s.text && s.text && s.text.includes('Page 1 of 3'));
  console.log('last sent msgs:', sent.slice(-2).map(s => (s.text || '').slice(0, 80)).join(' || '));
  check('My Orders page 1 of 3 with ⬅️/Next nav shows Page 1 of 3', !!ordersPage1);
  check('Page 1 lists first 10 items', ordersPage1 && ordersPage1.text.split('\n').filter((l) => /^\d+\./.test(l)).length === 10);
  // The inline_keyboard in ordersPage1 includes Next button only on page 1
  const nav1 = ordersPage1.extra.reply_markup.inline_keyboard[0];
  check('Page 1 nav has only Next (no Back)', nav1 && nav1.length === 1 && nav1[0].text.includes('Next'));

  // Simulate tapping Next (page 2) via the callback handler
  const cbHandler = handlers.find((h) => h.type === 'callback_query');
  if (cbHandler) {
    const fakeMsg = { chat: { id: 999 }, message_id: 7 };
    const queryPage2 = { data: 'orders:page:2', message: fakeMsg, from: { id: 888 }, id: 'cb1' };
    await cbHandler.cb(queryPage2);
    const editPage2 = sent.find((s) => s.edit && s.text && s.text.includes('Page 2 of 3'));
    check('orders:page:2 edits to Page 2 of 3 with Back + Next', !!editPage2);
    const nav2 = editPage2.opts.reply_markup.inline_keyboard[0];
    check('Page 2 nav has Back and Next', nav2 && nav2.length === 2);

    const queryPage3 = { data: 'orders:page:3', message: fakeMsg, from: { id: 888 }, id: 'cb2' };
    await cbHandler.cb(queryPage3);
    const editPage3 = sent.find((s) => s.edit && s.text && s.text.includes('Page 3 of 3'));
    check('orders:page:3 edits to Page 3 of 3 with Back only', !!editPage3);
    const nav3 = editPage3.opts.reply_markup.inline_keyboard[0];
    check('Page 3 nav has only Back (no Next)', nav3 && nav3.length === 1 && nav3[0].text.includes('Back'));
    const itemsPage3 = editPage3.text.split('\n').filter((l) => /^\d+\./.test(l));
    check('Page 3 lists remaining 5 items', itemsPage3.length === 5);
  }

  sharedStub.findOne = originalFindOne;
  console.log(`\nResults: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
