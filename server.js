'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_MODE = process.env.PUBLIC_MODE === '1' || process.env.PUBLIC_MODE === 'true';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const DB_VERSION = 2;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CATEGORIES = new Set(['餐饮', '房租', '医药', '交通', '学习', '生活', '其他']);
const CITIES = ['上海', '北京', '广州', '深圳', '杭州', '成都', '武汉', '南京', '西安', '其他'];
const CITY_SET = new Set(CITIES);
const BANNED_WORDS = ['做爱', '性交', '性爱', '操你', '傻逼', '傻b', '妈的', '卖淫', '约炮', '裸聊', 'fuck']; 
const PHONE_PATTERN = /(?:1[3-9]\d{9}|(?:\+?86[-\s]?)?1[3-9]\d{9})/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const RICH_SEEDS = [
  { id: 'rich-01', name: '沈砚', hue: 158 },
  { id: 'rich-02', name: '顾屿', hue: 24 },
  { id: 'rich-03', name: '陈默', hue: 210 },
  { id: 'rich-04', name: '江照', hue: 42 },
  { id: 'rich-05', name: '周予安', hue: 278 },
  { id: 'rich-06', name: '陆时', hue: 194 },
  { id: 'rich-07', name: '许惑', hue: 336 },
  { id: 'rich-08', name: '白露', hue: 96 },
  { id: 'rich-09', name: '宋清和', hue: 142 },
  { id: 'rich-10', name: '梁宵', hue: 18 },
  { id: 'rich-11', name: '温言', hue: 302 },
  { id: 'rich-12', name: '赵屿', hue: 176 },
];

const COMMONER_SEEDS = [
  { id: 'commoner-01', name: '林小满', hue: 32, city: '上海' },
  { id: 'commoner-02', name: '阿柚', hue: 12, city: '杭州' },
  { id: 'commoner-03', name: '陈拾', hue: 204, city: '北京' },
  { id: 'commoner-04', name: '苏禾', hue: 86, city: '成都' },
  { id: 'commoner-05', name: '何夕', hue: 340, city: '深圳' },
  { id: 'commoner-06', name: '周舟', hue: 194, city: '广州' },
  { id: 'commoner-07', name: '夏栀', hue: 48, city: '南京' },
  { id: 'commoner-08', name: '小北', hue: 222, city: '武汉' },
  { id: 'commoner-09', name: '许星', hue: 300, city: '西安' },
  { id: 'commoner-10', name: '王姨', hue: 22, city: '上海' },
  { id: 'commoner-11', name: '程一', hue: 164, city: '杭州' },
  { id: 'commoner-12', name: '黎安', hue: 258, city: '北京' },
  { id: 'commoner-13', name: '宁宁', hue: 354, city: '成都' },
  { id: 'commoner-14', name: '江野', hue: 132, city: '深圳' },
  { id: 'commoner-15', name: '陶子', hue: 72, city: '广州' },
];

const UNPAID_SEEDS = [
  { owner: 0, category: '医药', amount: 268, title: '给妈妈换一副老花镜', note: '她总说还能看清，但穿针的时候要把手举得很远。' },
  { owner: 1, category: '生活', amount: 219, title: '给猫换一袋处方粮', note: '它叫年糕，最近胃口不太好。' },
  { owner: 2, category: '交通', amount: 245, title: '回家的那张高铁票', note: '三个月没回去了，想赶在降温前看看奶奶。' },
  { owner: 3, category: '学习', amount: 399, title: '夜校插画课的报名费', note: '白天上班，晚上想试着画点什么。' },
  { owner: 4, category: '餐饮', amount: 68, title: '请自己吃一顿生日面', note: '今年也想认真过生日。' },
  { owner: 5, category: '生活', amount: 120, title: '修好陪了我五年的自行车', note: '链条断了，修好还能再骑很久。' },
  { owner: 6, category: '医药', amount: 460, title: '牙科复诊的费用', note: '拖了两个月，终于约上了号。' },
  { owner: 7, category: '学习', amount: 186, title: '三门课的考研资料', note: '图书馆的座位已经排到下周了。' },
  { owner: 8, category: '餐饮', amount: 32, title: '加班后的那碗热汤面', note: '今天赶上了末班地铁，想吃点热的。' },
  { owner: 9, category: '房租', amount: 800, title: '这个月还差一点的房租', note: '小面馆这个月生意淡，先补上房租。' },
  { owner: 10, category: '生活', amount: 189, title: '给女儿买一盏护眼灯', note: '她总趴在桌上写作业。' },
  { owner: 11, category: '交通', amount: 150, title: '一张通勤月卡', note: '换了新工作，地铁要坐十四站。' },
  { owner: 12, category: '医药', amount: 320, title: '配一副新的近视眼镜', note: '上一副戴了六年，镜片花得厉害。' },
  { owner: 13, category: '学习', amount: 158, title: '一套水彩颜料', note: '想把这学期旁听的课画完。' },
  { owner: 14, category: '其他', amount: 640, title: '补交漏掉的社保', note: '换工作的时候断了一个月，想补上。' },
  { owner: 1, category: '生活', amount: 129, title: '给旧手机换一块电池', note: '还能用，不想这么早换掉。' },
  { owner: 3, category: '餐饮', amount: 49, title: '一周的早餐', note: '早起十分钟，给自己煮个鸡蛋。' },
  { owner: 0, category: '学习', amount: 96, title: '一本绝版的旧书', note: '在二手书店找了很久。' },
];

const PAID_SEEDS = [
  { payer: 0, owner: 9, category: '房租', amount: 1200, title: '小面馆这个月的房租', note: '把这个月撑过去，秋天想上新菜单。', message: '新菜单给我留一碗。' },
  { payer: 0, owner: 14, category: '医药', amount: 860, title: '爸爸的降压药和复查', note: '这个月的药费和复查一起。', message: '祝叔叔检查顺利。' },
  { payer: 0, owner: 5, category: '学习', amount: 620, title: '最后一学期的教材', note: '清单很长，但快毕业了。', message: '毕业快乐。' },
  { payer: 0, owner: 7, category: '餐饮', amount: 60, title: '今天的午饭', note: '忙到两点才想起没吃饭。', message: '记得加个蛋。' },
  { payer: 3, owner: 6, category: '房租', amount: 980, title: '搬家后的第一笔房租', note: '新房间有一扇朝东的窗。', message: '新家会有好天气。' },
  { payer: 3, owner: 9, category: '医药', amount: 680, title: '给老伴配一副助听器', note: '他总把电视开得很大声。', message: '希望他听见你叫他吃饭。' },
  { payer: 2, owner: 10, category: '生活', amount: 800, title: '给女儿报的游泳课', note: '她一直想学，正好暑假有班。', message: '夏天还长。' },
  { payer: 2, owner: 11, category: '交通', amount: 520, title: '春节回家的往返车票', note: '今年想早点回去。', message: '早点回家。' },
  { payer: 1, owner: 4, category: '医药', amount: 640, title: '奶奶的护膝和理疗', note: '下雨天她膝盖疼得厉害。', message: '愿她走路不再疼。' },
  { payer: 1, owner: 13, category: '学习', amount: 340, title: '买了想了很久的画板', note: '想认真画完一组画。', message: '画完记得给自己看。' },
  { payer: 4, owner: 12, category: '生活', amount: 520, title: '换掉漏水的旧洗衣机', note: '修了两次，还是漏。', message: '这个月不用再手洗了。' },
  { payer: 4, owner: 8, category: '餐饮', amount: 240, title: '请同事们喝的一次咖啡', note: '项目结束，想谢谢大家。', message: '工作再忙，也要喝热的。' },
  { payer: 5, owner: 3, category: '学习', amount: 360, title: '报名了周末的陶艺课', note: '想给家里做一只歪歪的杯子。', message: '捏坏了也没关系。' },
  { payer: 5, owner: 1, category: '生活', amount: 180, title: '给年糕买的新猫爬架', note: '旧纸箱已经被它抓烂了。', message: '替年糕谢谢它的人类。' },
  { payer: 6, owner: 0, category: '医药', amount: 300, title: '妈妈的体检套餐', note: '劝了很久，她终于答应了。', message: '身体最重要。' },
  { payer: 6, owner: 2, category: '餐饮', amount: 80, title: '一顿想了很久的火锅', note: '发工资前最后的念想。', message: '辣锅还是鸳鸯？' },
  { payer: 7, owner: 14, category: '其他', amount: 300, title: '补交的医保', note: '不想让保障断掉。', message: '安心一点。' },
  { payer: 8, owner: 5, category: '交通', amount: 240, title: '去外地看演出的火车票', note: '喜欢了十年的乐队。', message: '替我听一首现场。' },
  { payer: 9, owner: 6, category: '餐饮', amount: 188, title: '和朋友的一顿晚饭', note: '好久没见了，想好好聊一次。', message: '希望你今晚笑得很大声。' },
  { payer: 10, owner: 7, category: '学习', amount: 120, title: '一本二手的专业书', note: '扉页上有上一个人的笔记。', message: '书里也许有上一个人的答案。' },
];

const SEED_THANKS = {
  0: '谢谢你，新菜单真的上了。下次来，给你留靠窗的位置。',
  1: '爸爸的复查结果很好。那天的雨很大，但心里是亮的。',
  3: '那碗面很热。今天也没有那么难了。',
  8: '奶奶说，替她谢谢你。她现在已经能自己下楼晒太阳了。',
  10: '新洗衣机很好用。终于不用在冬天手洗床单了。',
  14: '体检报告一切正常。谢谢你替我劝动了她。',
  17: '演出很好。我在现场替你听完了最后一首。',
};

function weekStart(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.getTime();
}

function weekKey(ts = Date.now()) {
  const d = new Date(weekStart(ts));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMD(ts) {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatFullDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function snapshotRangeLabel(start, end) {
  return `${formatMD(start)} — ${formatMD(end - 1)}`;
}

function buildDemoSnapshots(now = Date.now()) {
  const currentStart = weekStart(now);
  const samples = [
    {
      offset: 1,
      amounts: [2360, 1880, 1540, 1260, 980, 760, 620, 480, 360, 280],
      counts: [4, 3, 3, 2, 2, 2, 2, 1, 1, 1],
      extraBills: 3,
      extraAmount: 210,
    },
    {
      offset: 2,
      amounts: [2880, 2210, 1830, 1470, 1120, 890, 700, 540, 410, 320],
      counts: [5, 3, 3, 3, 2, 2, 2, 2, 1, 1],
      extraBills: 4,
      extraAmount: 320,
    },
  ];

  return samples.map((sample) => {
    const start = currentStart - sample.offset * WEEK_MS;
    const end = start + WEEK_MS;
    const entries = RICH_SEEDS.slice(0, 10).map((rich, index) => ({
      rank: index + 1,
      userId: rich.id,
      name: rich.name,
      hue: rich.hue,
      amount: sample.amounts[index],
      billCount: sample.counts[index],
    }));
    return {
      weekKey: weekKey(start),
      start,
      end,
      rangeLabel: snapshotRangeLabel(start, end),
      entries,
      stats: {
        paidAmount: sample.amounts.reduce((sum, amount) => sum + amount, 0) + sample.extraAmount,
        paidBills: sample.counts.reduce((sum, count) => sum + count, 0) + sample.extraBills,
        richParticipants: entries.length + 1,
        top10Total: sample.amounts.reduce((sum, amount) => sum + amount, 0),
      },
    };
  });
}

function buildSnapshotForRange(start, end) {
  const totals = new Map();
  for (const bill of db.bills) {
    if (bill.status !== 'paid' || !bill.paidBy) continue;
    if (bill.paidAt < start || bill.paidAt >= end) continue;
    const payer = userById(bill.paidBy);
    if (!payer || payer.role !== 'rich') continue;
    const current = totals.get(payer.id) || { user: payer, amount: 0, billCount: 0 };
    current.amount += bill.amount;
    current.billCount += 1;
    totals.set(payer.id, current);
  }

  const entries = Array.from(totals.values())
    .sort((a, b) => b.amount - a.amount || b.billCount - a.billCount || a.user.name.localeCompare(b.user.name, 'zh-CN'))
    .map((entry, index) => ({
      rank: index + 1,
      userId: entry.user.id,
      name: entry.user.name,
      hue: hueOf(entry.user),
      amount: Math.round(entry.amount * 100) / 100,
      billCount: entry.billCount,
    }));
  const paidBills = db.bills.filter((bill) => bill.status === 'paid' && bill.paidAt >= start && bill.paidAt < end);
  const paidAmount = paidBills.reduce((sum, bill) => sum + bill.amount, 0);
  const topTen = entries.slice(0, 10);

  return {
    weekKey: weekKey(start),
    start,
    end,
    rangeLabel: snapshotRangeLabel(start, end),
    entries: topTen,
    stats: {
      paidAmount: Math.round(paidAmount * 100) / 100,
      paidBills: paidBills.length,
      richParticipants: entries.length,
      top10Total: Math.round(topTen.reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100,
    },
  };
}

function captureSnapshot(start, end) {
  if (!db.snapshots) db.snapshots = [];
  const key = weekKey(start);
  if (db.snapshots.some((snapshot) => snapshot.weekKey === key)) return false;
  const snapshot = buildSnapshotForRange(start, end);
  if (!snapshot.entries.length) return false;
  db.snapshots.push(snapshot);
  db.snapshots.sort((a, b) => a.start - b.start);
  return true;
}

function migrateDb() {
  let changed = false;
  if (!Array.isArray(db.reports)) {
    db.reports = [];
    changed = true;
  }
  if (!Array.isArray(db.snapshots) || db.snapshots.length === 0) {
    db.snapshots = buildDemoSnapshots();
    changed = true;
  }
  if (!db.version || db.version < DB_VERSION) {
    db.version = DB_VERSION;
    changed = true;
  }

  const commonerCity = new Map(COMMONER_SEEDS.map((user) => [user.id, user.city]));
  const seedThanks = {
    'bill-p-001': SEED_THANKS[0],
    'bill-p-005': SEED_THANKS[4],
    'bill-p-009': SEED_THANKS[8],
    'bill-p-015': SEED_THANKS[14],
  };

  for (const user of db.users) {
    if (user.role === 'commoner' && !user.city) {
      user.city = commonerCity.get(user.id) || '其他';
      changed = true;
    }
  }

  for (const bill of db.bills) {
    if (!bill.city) {
      const owner = userById(bill.ownerId);
      bill.city = owner?.city || commonerCity.get(bill.ownerId) || '其他';
      changed = true;
    }
    if (typeof bill.anonymous !== 'boolean') {
      bill.anonymous = false;
      changed = true;
    }
    if (typeof bill.hidden !== 'boolean') {
      bill.hidden = false;
      changed = true;
    }
    if (typeof bill.thanks !== 'string') {
      bill.thanks = bill.seed && seedThanks[bill.id] ? seedThanks[bill.id] : '';
      bill.thanksAt = bill.thanks ? (bill.paidAt || Date.now()) + 2 * 60 * 60 * 1000 : null;
      changed = true;
    }
    if (bill.thanksAt === undefined) {
      bill.thanksAt = null;
      changed = true;
    }
  }

  if (changed) saveDb();
}

function buildSeed(now = Date.now()) {
  const start = weekStart(now);
  const end = start + WEEK_MS;
  const elapsed = Math.max(now - start, 60_000);
  const users = [];
  const bills = [];

  for (const [index, rich] of RICH_SEEDS.entries()) {
    users.push({
      id: rich.id,
      name: rich.name,
      role: 'rich',
      hue: rich.hue,
      seed: true,
      createdAt: start - (180 + index * 3) * 24 * 60 * 60 * 1000,
    });
  }

  for (const [index, commoner] of COMMONER_SEEDS.entries()) {
    users.push({
      id: commoner.id,
      name: commoner.name,
      role: 'commoner',
      hue: commoner.hue,
      city: commoner.city,
      seed: true,
      createdAt: start - (120 + index * 2) * 24 * 60 * 60 * 1000,
    });
  }

  UNPAID_SEEDS.forEach((item, index) => {
    const owner = COMMONER_SEEDS[item.owner];
    bills.push({
      id: `bill-u-${String(index + 1).padStart(3, '0')}`,
      code: `YG-${1041 + index}`,
      ownerId: owner.id,
      category: item.category,
      title: item.title,
      amount: item.amount,
      note: item.note,
      city: owner.city,
      anonymous: index === 4 || index === 13,
      status: 'pending',
      seed: true,
      hidden: false,
      createdAt: now - (index + 1) * 4.2 * 60 * 60 * 1000,
      paidBy: null,
      paidAt: null,
      paidMessage: '',
      thanks: '',
      thanksAt: null,
    });
  });

  PAID_SEEDS.forEach((item, index) => {
    const owner = COMMONER_SEEDS[item.owner];
    const payer = RICH_SEEDS[item.payer];
    const paidAt = Math.floor(start + elapsed * (0.1 + (index / Math.max(PAID_SEEDS.length - 1, 1)) * 0.78));
    bills.push({
      id: `bill-p-${String(index + 1).padStart(3, '0')}`,
      code: `YG-${1101 + index}`,
      ownerId: owner.id,
      category: item.category,
      title: item.title,
      amount: item.amount,
      note: item.note,
      city: owner.city,
      anonymous: index === 7 || index === 16,
      status: 'paid',
      seed: true,
      hidden: false,
      createdAt: paidAt - 5 * 60 * 60 * 1000,
      paidBy: payer.id,
      paidAt,
      paidMessage: item.message,
      thanks: SEED_THANKS[index] || '',
      thanksAt: SEED_THANKS[index] ? paidAt + 2 * 60 * 60 * 1000 : null,
    });
  });

  return {
    version: DB_VERSION,
    createdAt: now,
    demoWeek: weekKey(now),
    users,
    bills,
    reports: [],
    snapshots: buildDemoSnapshots(now),
  };
}

let db = null;
const sessions = new Map();
const sseClients = new Set();

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function saveDb() {
  ensureDataDir();
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, DB_FILE);
  } catch (error) {
    fs.copyFileSync(tmp, DB_FILE);
    fs.unlinkSync(tmp);
  }
}

function loadDb() {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    db = buildSeed();
    saveDb();
    return;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!parsed || ![1, DB_VERSION].includes(parsed.version) || !Array.isArray(parsed.users) || !Array.isArray(parsed.bills)) {
      throw new Error('Unsupported database shape');
    }
    db = parsed;
    migrateDb();
  } catch (error) {
    const backup = path.join(DATA_DIR, `db.backup-${Date.now()}.json`);
    try {
      fs.copyFileSync(DB_FILE, backup);
    } catch (_) {
      // Ignore backup failures; a fresh seed is still better than a dead app.
    }
    console.warn(`[yuguang] database reset: ${error.message}`);
    db = buildSeed();
    saveDb();
  }
}

function ensureDemoWeek() {
  const current = weekKey();
  if (db.demoWeek === current) return false;

  const start = weekStart();
  const previousStart = start - WEEK_MS;
  captureSnapshot(previousStart, previousStart + WEEK_MS);
  const elapsed = Math.max(Date.now() - start, 60_000);
  const seededPaid = db.bills.filter((bill) => bill.seed && bill.status === 'paid');
  seededPaid.forEach((bill, index) => {
    bill.paidAt = Math.floor(start + elapsed * (0.1 + (index / Math.max(seededPaid.length - 1, 1)) * 0.78));
    bill.createdAt = bill.paidAt - 5 * 60 * 60 * 1000;
  });

  const seededPending = db.bills.filter((bill) => bill.seed && bill.status === 'pending');
  seededPending.forEach((bill, index) => {
    bill.createdAt = Date.now() - (index + 1) * 4.2 * 60 * 60 * 1000;
  });

  db.demoWeek = current;
  saveDb();
  return true;
}

function userById(id) {
  return db.users.find((user) => user.id === id) || null;
}

function publicSelf(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    hue: user.hue,
    city: user.city || '其他',
    createdAt: user.createdAt,
    seed: Boolean(user.seed),
  };
}

function maskName(name) {
  if (!name) return '一位陌生人';
  return `${Array.from(name)[0]}**`;
}

function hueOf(user) {
  return Number.isFinite(user?.hue) ? user.hue : 32;
}

function richestEntries() {
  const start = weekStart();
  const end = start + WEEK_MS;
  const totals = new Map();

  for (const bill of db.bills) {
    if (bill.status !== 'paid' || !bill.paidBy) continue;
    if (bill.paidAt < start || bill.paidAt >= end) continue;
    const payer = userById(bill.paidBy);
    if (!payer || payer.role !== 'rich') continue;
    const current = totals.get(payer.id) || { user: payer, amount: 0, billCount: 0 };
    current.amount += bill.amount;
    current.billCount += 1;
    totals.set(payer.id, current);
  }

  return Array.from(totals.values())
    .sort((a, b) => b.amount - a.amount || b.billCount - a.billCount || a.user.name.localeCompare(b.user.name, 'zh-CN'))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function publicRankEntry(entry, me) {
  return {
    rank: entry.rank,
    id: entry.user.id,
    name: entry.user.name,
    hue: hueOf(entry.user),
    amount: Math.round(entry.amount * 100) / 100,
    billCount: entry.billCount,
    isMe: entry.user.id === me.id,
  };
}

function billForRich(bill) {
  const owner = userById(bill.ownerId);
  return {
    id: bill.id,
    code: bill.code,
    category: bill.category,
    title: bill.title,
    amount: bill.amount,
    note: bill.note,
    city: bill.city || '其他',
    anonymous: Boolean(bill.anonymous),
    createdAt: bill.createdAt,
    owner: {
      name: bill.anonymous ? '匿名平民' : maskName(owner?.name),
      hue: hueOf(owner),
    },
  };
}

function billForOwner(bill) {
  const payer = bill.paidBy ? userById(bill.paidBy) : null;
  return {
    id: bill.id,
    code: bill.code,
    category: bill.category,
    title: bill.title,
    amount: bill.amount,
    note: bill.note,
    city: bill.city || '其他',
    anonymous: Boolean(bill.anonymous),
    hidden: Boolean(bill.hidden),
    status: bill.status,
    createdAt: bill.createdAt,
    paidAt: bill.paidAt,
    paidMessage: bill.paidMessage || '',
    thanks: bill.thanks || '',
    thanksAt: bill.thanksAt || null,
    payer: payer ? { name: maskName(payer.name), hue: hueOf(payer) } : null,
  };
}

function billForPayment(bill) {
  const owner = userById(bill.ownerId);
  return {
    id: bill.id,
    code: bill.code,
    category: bill.category,
    title: bill.title,
    amount: bill.amount,
    city: bill.city || '其他',
    anonymous: Boolean(bill.anonymous),
    owner: {
      name: bill.anonymous ? '匿名平民' : maskName(owner?.name),
      hue: hueOf(owner),
    },
    paidAt: bill.paidAt,
    thanks: bill.thanks || '',
    thanksAt: bill.thanksAt || null,
  };
}

function buildState(me) {
  const changed = ensureDemoWeek();
  if (changed) broadcast();

  const start = weekStart();
  const end = start + WEEK_MS;
  const now = Date.now();
  const allPaidWeek = db.bills.filter((bill) => bill.status === 'paid' && bill.paidAt >= start && bill.paidAt < end);
  const allPending = db.bills.filter((bill) => bill.status === 'pending' && !bill.hidden);
  const entries = richestEntries();
  const topTen = entries.slice(0, 10);
  const myEntry = me.role === 'rich' ? entries.find((entry) => entry.user.id === me.id) : null;
  const tenth = entries[9] || null;

  let myPosition = null;
  if (me.role === 'rich') {
    const previous = myEntry && myEntry.rank > 1 ? entries[myEntry.rank - 2] : null;
    myPosition = {
      rank: myEntry ? myEntry.rank : null,
      amount: Math.round((myEntry?.amount || 0) * 100) / 100,
      billCount: myEntry?.billCount || 0,
      gapToNext: previous ? Math.max(0, Math.round((previous.amount - myEntry.amount) * 100) / 100) : null,
      gapToTop10: !myEntry && tenth ? Math.max(0, Math.round((tenth.amount - 0) * 100) / 100) : null,
      totalRanked: entries.length,
    };
  }

  const myBills = me.role === 'commoner'
    ? db.bills
      .filter((bill) => bill.ownerId === me.id && bill.status !== 'cancelled')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(billForOwner)
    : [];

  const myPayments = me.role === 'rich'
    ? allPaidWeek
      .filter((bill) => bill.paidBy === me.id)
      .sort((a, b) => b.paidAt - a.paidAt)
      .map(billForPayment)
    : [];

  const myPending = me.role === 'commoner'
    ? myBills.filter((bill) => bill.status === 'pending' && !bill.hidden)
    : [];
  const myReceived = me.role === 'commoner'
    ? myBills.filter((bill) => bill.status === 'paid')
    : [];

  const pendingForRich = me.role === 'rich'
    ? allPending
      .filter((bill) => {
        const owner = userById(bill.ownerId);
        return owner?.role === 'commoner' && owner.id !== me.id;
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(billForRich)
    : [];

  const paidAmountWeek = allPaidWeek.reduce((sum, bill) => sum + bill.amount, 0);

  return {
    serverNow: now,
    publicMode: PUBLIC_MODE,
    me: publicSelf(me),
    week: {
      key: weekKey(),
      start,
      end,
      rangeLabel: `${formatMD(start)} — ${formatMD(end - 1)}`,
      fullLabel: `${formatFullDate(start)} — ${formatFullDate(end - 1)}`,
    },
    stats: {
      pendingBills: allPending.length,
      pendingAmount: Math.round(allPending.reduce((sum, bill) => sum + bill.amount, 0) * 100) / 100,
      paidBillsWeek: allPaidWeek.length,
      paidAmountWeek: Math.round(paidAmountWeek * 100) / 100,
      richParticipants: entries.length,
      richTotal: db.users.filter((user) => user.role === 'rich').length,
      top10Total: Math.round(topTen.reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100,
      myPendingCount: myPending.length,
      myPendingAmount: Math.round(myPending.reduce((sum, bill) => sum + bill.amount, 0) * 100) / 100,
      myReceivedCount: myReceived.length,
      myReceivedAmount: Math.round(myReceived.reduce((sum, bill) => sum + bill.amount, 0) * 100) / 100,
    },
    leaderboard: topTen.map((entry) => publicRankEntry(entry, me)),
    myPosition,
    myBills,
    myPayments,
    pending: pendingForRich,
    history: (db.snapshots || [])
      .slice()
      .sort((a, b) => b.start - a.start)
      .slice(0, 6),
  };
}

function requireAdmin(req) {
  if (!ADMIN_TOKEN) throw new HttpError(403, '审核后台未配置 ADMIN_TOKEN');
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) throw new HttpError(401, '审核口令不正确');
}

function adminBillSummary(bill) {
  const owner = userById(bill.ownerId);
  const openReports = (db.reports || []).filter((report) => report.billId === bill.id && report.status === 'open').length;
  return {
    id: bill.id,
    code: bill.code,
    title: bill.title,
    amount: bill.amount,
    category: bill.category,
    city: bill.city || '其他',
    status: bill.status,
    hidden: Boolean(bill.hidden),
    hiddenReason: bill.hiddenReason || '',
    ownerName: owner?.name || '未知',
    ownerMasked: maskName(owner?.name),
    createdAt: bill.createdAt,
    paidAt: bill.paidAt,
    openReports,
  };
}

function buildAdminState() {
  const reports = (db.reports || [])
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((report) => {
      const bill = db.bills.find((item) => item.id === report.billId);
      const reporter = userById(report.reporterId);
      return {
        ...report,
        bill: bill ? adminBillSummary(bill) : null,
        reporterName: reporter?.name || '未知用户',
      };
    });

  return {
    serverNow: Date.now(),
    stats: {
      openReports: reports.filter((report) => report.status === 'open').length,
      hiddenBills: db.bills.filter((bill) => bill.hidden).length,
      pendingBills: db.bills.filter((bill) => bill.status === 'pending').length,
      totalBills: db.bills.length,
    },
    reports: reports.slice(0, 80),
    hiddenBills: db.bills
      .filter((bill) => bill.hidden)
      .sort((a, b) => (b.hiddenAt || 0) - (a.hiddenAt || 0))
      .map(adminBillSummary),
    recentResolved: reports
      .filter((report) => report.status !== 'open')
      .slice(0, 20),
  };
}

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch (_) {
      cookies[key] = value;
    }
  }
  return cookies;
}

function sessionUser(req) {
  const token = parseCookies(req.headers.cookie || '')['yg_sid'];
  if (!token) return null;
  const userId = sessions.get(token);
  if (!userId) return null;
  const user = userById(userId);
  if (!user) {
    sessions.delete(token);
    return null;
  }
  return user;
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `yg_sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'yg_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readJson(req, limit = 32768) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, '请求内容过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (_) {
        reject(new HttpError(400, '请求格式不正确'));
      }
    });
    req.on('error', reject);
  });
}

function cleanText(value, maxLength) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanNote(value, maxLength) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function contentIssue(...values) {
  const text = values.join(' ').toLowerCase();
  if (BANNED_WORDS.some((word) => text.includes(word))) {
    return '内容包含不适词，请修改后再发布';
  }
  if (PHONE_PATTERN.test(text)) {
    return '请勿在公开账单里填写手机号';
  }
  return '';
}

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  if (amount < 1 || amount > 50000) return null;
  return Math.round(amount * 100) / 100;
}

function makeCode() {
  return `YG-${Date.now().toString(36).slice(-4).toUpperCase()}${crypto.randomInt(10, 99)}`;
}

function broadcast() {
  const payload = `event: update\ndata: ${Date.now()}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

function attachSession(res, user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, user.id);
  setSessionCookie(res, token);
}

async function handleApi(req, res, url) {
  const method = req.method;
  const pathname = url.pathname;

  if (method === 'GET' && pathname === '/api/public') {
    ensureDemoWeek();
    const start = weekStart();
    const end = start + WEEK_MS;
    const paid = db.bills.filter((bill) => bill.status === 'paid' && bill.paidAt >= start && bill.paidAt < end);
    return sendJson(res, 200, {
      week: {
        rangeLabel: `${formatMD(start)} — ${formatMD(end - 1)}`,
        end,
      },
      paidBillsWeek: paid.length,
      paidAmountWeek: Math.round(paid.reduce((sum, bill) => sum + bill.amount, 0) * 100) / 100,
      richParticipants: richestEntries().length,
    });
  }

  if (method === 'POST' && pathname === '/api/login') {
    const body = await readJson(req);
    const name = cleanText(body.name, 10);
    const role = body.role;
    if (Array.from(name).length < 2) throw new HttpError(400, '称呼至少需要 2 个字');
    if (role !== 'rich' && role !== 'commoner') throw new HttpError(400, '请选择一个身份');

    let user = db.users.find((item) => !item.seed && item.name === name && item.role === role);
    if (!user) {
      user = {
        id: crypto.randomUUID(),
        name,
        role,
        hue: crypto.randomInt(0, 360),
        city: '其他',
        seed: false,
        createdAt: Date.now(),
      };
      db.users.push(user);
      saveDb();
      broadcast();
    }

    attachSession(res, user);
    return sendJson(res, 200, { user: publicSelf(user) });
  }

  if (method === 'POST' && pathname === '/api/login/demo') {
    const body = await readJson(req);
    const role = body.role === 'commoner' ? 'commoner' : 'rich';
    const preferredId = role === 'rich' ? 'rich-02' : 'commoner-01';
    const user = userById(preferredId) || db.users.find((item) => item.seed && item.role === role);
    if (!user) throw new HttpError(404, '演示账号不可用');
    attachSession(res, user);
    return sendJson(res, 200, { user: publicSelf(user) });
  }

  if (method === 'POST' && pathname === '/api/logout') {
    const token = parseCookies(req.headers.cookie || '')['yg_sid'];
    if (token) sessions.delete(token);
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  if (method === 'GET' && pathname === '/api/admin/state') {
    requireAdmin(req);
    return sendJson(res, 200, buildAdminState());
  }

  const adminReportMatch = pathname.match(/^\/api\/admin\/reports\/([^/]+)$/);
  if (method === 'POST' && adminReportMatch) {
    requireAdmin(req);
    const report = (db.reports || []).find((item) => item.id === decodeURIComponent(adminReportMatch[1]));
    if (!report) throw new HttpError(404, '举报不存在');
    if (report.status !== 'open') throw new HttpError(409, '这条举报已经处理过了');
    const body = await readJson(req);
    const action = body.action === 'hide' ? 'hide' : 'dismiss';
    const bill = db.bills.find((item) => item.id === report.billId);
    const now = Date.now();

    report.status = action === 'hide' ? 'resolved' : 'dismissed';
    report.resolvedAt = now;
    report.resolvedBy = 'admin';
    report.resolution = action;

    if (bill && action === 'hide') {
      bill.hidden = true;
      bill.hiddenAt = now;
      bill.hiddenReason = '管理员根据举报隐藏';
      for (const other of db.reports) {
        if (other.billId === bill.id && other.status === 'open') {
          other.status = 'resolved';
          other.resolvedAt = now;
          other.resolvedBy = 'admin';
          other.resolution = 'hide';
        }
      }
    } else if (bill && action === 'dismiss') {
      const remaining = db.reports.filter((item) => item.billId === bill.id && item.status === 'open').length;
      if (bill.hidden && bill.hiddenReason === '收到 3 条举报，自动进入审核' && remaining === 0) {
        bill.hidden = false;
        bill.hiddenAt = null;
        bill.hiddenReason = '';
      }
    }

    saveDb();
    broadcast();
    return sendJson(res, 200, buildAdminState());
  }

  const adminBillMatch = pathname.match(/^\/api\/admin\/bills\/([^/]+)\/visibility$/);
  if (method === 'POST' && adminBillMatch) {
    requireAdmin(req);
    const bill = db.bills.find((item) => item.id === decodeURIComponent(adminBillMatch[1]));
    if (!bill) throw new HttpError(404, '账单不存在');
    const body = await readJson(req);
    bill.hidden = Boolean(body.hidden);
    bill.hiddenAt = bill.hidden ? Date.now() : null;
    bill.hiddenReason = bill.hidden ? cleanText(body.reason, 60) || '管理员隐藏' : '';
    saveDb();
    broadcast();
    return sendJson(res, 200, buildAdminState());
  }

  const adminBillDeleteMatch = pathname.match(/^\/api\/admin\/bills\/([^/]+)$/);
  if (method === 'DELETE' && adminBillDeleteMatch) {
    requireAdmin(req);
    const billId = decodeURIComponent(adminBillDeleteMatch[1]);
    const bill = db.bills.find((item) => item.id === billId);
    if (!bill) throw new HttpError(404, '账单不存在');
    db.bills = db.bills.filter((item) => item.id !== billId);
    db.reports = (db.reports || []).filter((report) => report.billId !== billId);
    saveDb();
    broadcast();
    return sendJson(res, 200, buildAdminState());
  }

  const me = sessionUser(req);

  if (method === 'GET' && pathname === '/api/state') {
    if (!me) throw new HttpError(401, '请先登录');
    return sendJson(res, 200, buildState(me));
  }

  if (method === 'POST' && pathname === '/api/bills') {
    if (!me) throw new HttpError(401, '请先登录');
    if (me.role !== 'commoner') throw new HttpError(403, '只有平民身份可以发布账单');

    const body = await readJson(req);
    const category = cleanText(body.category, 4);
    const title = cleanText(body.title, 30);
    const note = cleanNote(body.note, 120);
    const city = CITY_SET.has(cleanText(body.city, 4)) ? cleanText(body.city, 4) : '其他';
    const anonymous = Boolean(body.anonymous);
    const amount = parseAmount(body.amount);
    const pendingCount = db.bills.filter((bill) => bill.ownerId === me.id && bill.status === 'pending').length;

    if (!CATEGORIES.has(category)) throw new HttpError(400, '请选择账单分类');
    if (Array.from(title).length < 2) throw new HttpError(400, '请写下这张账单的名字');
    if (amount === null) throw new HttpError(400, '金额需要在 1 到 50,000 元之间');
    if (pendingCount >= 3) throw new HttpError(400, '最多同时保留 3 张待结清账单');
    const issue = contentIssue(title, note);
    if (issue) throw new HttpError(400, issue);

    const bill = {
      id: crypto.randomUUID(),
      code: makeCode(),
      ownerId: me.id,
      category,
      title,
      amount,
      note,
      city,
      anonymous,
      status: 'pending',
      seed: false,
      hidden: false,
      createdAt: Date.now(),
      paidBy: null,
      paidAt: null,
      paidMessage: '',
      thanks: '',
      thanksAt: null,
    };
    db.bills.unshift(bill);
    saveDb();
    broadcast();
    return sendJson(res, 201, { bill: billForOwner(bill) });
  }

  const deleteMatch = pathname.match(/^\/api\/bills\/([^/]+)$/);
  if (method === 'DELETE' && deleteMatch) {
    if (!me) throw new HttpError(401, '请先登录');
    const bill = db.bills.find((item) => item.id === decodeURIComponent(deleteMatch[1]));
    if (!bill) throw new HttpError(404, '账单不存在');
    if (bill.ownerId !== me.id) throw new HttpError(403, '只能撤回自己的账单');
    if (bill.status !== 'pending') throw new HttpError(409, '这张账单已经结清，无法撤回');
    db.bills = db.bills.filter((item) => item.id !== bill.id);
    saveDb();
    broadcast();
    return sendJson(res, 200, { ok: true });
  }

  const payMatch = pathname.match(/^\/api\/bills\/([^/]+)\/pay$/);
  if (method === 'POST' && payMatch) {
    if (!me) throw new HttpError(401, '请先登录');
    if (me.role !== 'rich') throw new HttpError(403, '只有富人身份可以支付账单');
    const bill = db.bills.find((item) => item.id === decodeURIComponent(payMatch[1]));
    if (!bill) throw new HttpError(404, '账单不存在');
    if (bill.hidden) throw new HttpError(409, '这张账单正在审核中');
    if (bill.status !== 'pending') throw new HttpError(409, '这张账单已经被别人接住了');
    const owner = userById(bill.ownerId);
    if (!owner || owner.role !== 'commoner') throw new HttpError(400, '这张账单暂时无法支付');
    if (bill.ownerId === me.id) throw new HttpError(400, '不能支付自己的账单');

    const body = await readJson(req);
    const message = cleanText(body.message, 40);
    const before = richestEntries();
    const beforeRank = before.find((entry) => entry.user.id === me.id)?.rank || null;

    bill.status = 'paid';
    bill.paidBy = me.id;
    bill.paidAt = Date.now();
    bill.paidMessage = message;
    bill.seed = false;
    saveDb();
    broadcast();

    const after = richestEntries();
    const afterEntry = after.find((entry) => entry.user.id === me.id);
    const afterRank = afterEntry?.rank || null;

    return sendJson(res, 200, {
      ok: true,
      payment: {
        bill: billForPayment(bill),
        amount: bill.amount,
        rankBefore: beforeRank,
        rankAfter: afterRank,
        spentThisWeek: Math.round((afterEntry?.amount || 0) * 100) / 100,
        billCountThisWeek: afterEntry?.billCount || 0,
      },
    });
  }

  const thanksMatch = pathname.match(/^\/api\/bills\/([^/]+)\/thanks$/);
  if (method === 'POST' && thanksMatch) {
    if (!me) throw new HttpError(401, '请先登录');
    const bill = db.bills.find((item) => item.id === decodeURIComponent(thanksMatch[1]));
    if (!bill) throw new HttpError(404, '账单不存在');
    if (bill.ownerId !== me.id) throw new HttpError(403, '只能给自己的账单写回信');
    if (bill.status !== 'paid') throw new HttpError(409, '账单结清后才能写回信');
    if (bill.thanks) throw new HttpError(409, '这封回信已经寄出了');

    const body = await readJson(req);
    const message = cleanText(body.message, 80);
    if (Array.from(message).length < 2) throw new HttpError(400, '写一句至少 2 个字的谢谢吧');

    bill.thanks = message;
    bill.thanksAt = Date.now();
    saveDb();
    broadcast();
    return sendJson(res, 200, { bill: billForOwner(bill) });
  }

  const reportMatch = pathname.match(/^\/api\/bills\/([^/]+)\/report$/);
  if (method === 'POST' && reportMatch) {
    if (!me) throw new HttpError(401, '请先登录');
    const bill = db.bills.find((item) => item.id === decodeURIComponent(reportMatch[1]));
    if (!bill) throw new HttpError(404, '账单不存在');
    if (bill.ownerId === me.id) throw new HttpError(400, '不能举报自己的账单');
    if (bill.status !== 'pending') throw new HttpError(409, '这张账单已经结清，无法举报');
    if (db.reports.some((report) => report.billId === bill.id && report.reporterId === me.id && report.status === 'open')) {
      throw new HttpError(409, '你已经举报过这张账单了');
    }

    const body = await readJson(req);
    const reason = cleanText(body.reason, 60);
    if (Array.from(reason).length < 2) throw new HttpError(400, '请选择或填写举报原因');

    db.reports.push({
      id: crypto.randomUUID(),
      billId: bill.id,
      reporterId: me.id,
      reason,
      status: 'open',
      createdAt: Date.now(),
      resolvedAt: null,
      resolvedBy: null,
    });

    const openCount = db.reports.filter((report) => report.billId === bill.id && report.status === 'open').length;
    let autoHidden = false;
    if (openCount >= 3 && !bill.hidden) {
      bill.hidden = true;
      bill.hiddenAt = Date.now();
      bill.hiddenReason = '收到 3 条举报，自动进入审核';
      autoHidden = true;
    }
    saveDb();
    broadcast();
    return sendJson(res, 200, { ok: true, openCount, autoHidden });
  }

  if (method === 'POST' && pathname === '/api/reset-demo') {
    if (PUBLIC_MODE) throw new HttpError(403, '公开体验模式已关闭数据重置');
    sessions.clear();
    db = buildSeed();
    saveDb();
    broadcast();
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  if (method === 'GET' && pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    res.write('event: ready\ndata: connected\n\n');
    sseClients.add(res);
    const heartbeat = setInterval(() => {
      try {
        res.write(': keep-alive\n\n');
      } catch (_) {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 20_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
    return;
  }

  throw new HttpError(404, '接口不存在');
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendError(res, 405, 'Method not allowed');
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_) {
    return sendError(res, 400, 'Bad request');
  }

  const relative = decoded === '/' ? '/index.html' : decoded === '/admin' ? '/admin.html' : decoded;
  const filePath = path.resolve(PUBLIC_DIR, `.${relative}`);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    return sendError(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stats.size,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    };
    if (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.webmanifest') {
      headers['Cache-Control'] = 'no-cache';
    } else {
      headers['Cache-Control'] = 'public, max-age=300';
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    if (res.headersSent) {
      try {
        res.end();
      } catch (_) {
        // Nothing else to do.
      }
      return;
    }
    if (error instanceof HttpError) {
      sendError(res, error.status, error.message);
    } else {
      console.error('[yuguang] unhandled error', error);
      sendError(res, 500, '服务器开小差了，请稍后再试');
    }
  }
});

loadDb();
ensureDemoWeek();

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  予光 YUGUANG');
  console.log(`  Local:  http://${HOST}:${PORT}`);
  console.log(`  Data:   ${DB_FILE}`);
  console.log('');
});

function shutdown() {
  try {
    saveDb();
  } catch (_) {
    // Ignore.
  }
  for (const client of sseClients) {
    try {
      client.end();
    } catch (_) {
      // Ignore.
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
