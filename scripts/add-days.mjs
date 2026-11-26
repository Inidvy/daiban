// Adds Days 6–30 (five everyday places after the noodle shop) to content/: words, patterns, days with
// levels and 代班 shifts, and a sample script per day. Re-running it replaces what it added before.
// Run: node scripts/add-days.mjs
import { readFileSync, writeFileSync } from 'node:fs';
// Rule count as the game scores it (src/script.ts), so the sample earns its third star.
import { countRules, parseScript } from '../src/script.ts';
import { segment } from '../src/content.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../content/${f}`, import.meta.url), 'utf8'));
const write = (f, data) => writeFileSync(new URL(`../content/${f}`, import.meta.url), JSON.stringify(data, null, 2) + '\n');

// ---------- words ----------
// [hanzi, pinyin, en, extra]
const W = [
  // measure words
  ['斤', 'jīn', 'jin (half a kilo)', { slot: '量词' }],
  ['盒', 'hé', 'box', { slot: '量词' }],
  ['间', 'jiān', 'measure word for rooms', { slot: '量词' }],
  // goods
  ['苹果', 'píngguǒ', 'apples', { slot: '东西', price: 8, measure: '斤' }],
  ['香蕉', 'xiāngjiāo', 'bananas', { slot: '东西', price: 6, measure: '斤' }],
  ['西瓜', 'xīguā', 'watermelon', { slot: '东西', price: 20, measure: '个' }],
  ['葡萄', 'pútao', 'grapes', { slot: '东西', price: 15, measure: '斤' }],
  ['橙子', 'chéngzi', 'oranges', { slot: '东西', price: 7, measure: '斤' }],
  ['草莓', 'cǎoméi', 'strawberries', { slot: '东西', price: 25, measure: '盒' }],
  ['咖啡', 'kāfēi', 'coffee', { slot: '东西', price: 20, measure: '杯' }],
  ['奶茶', 'nǎichá', 'milk tea', { slot: '东西', price: 15, measure: '杯' }],
  ['果汁', 'guǒzhī', 'juice', { slot: '东西', price: 12, measure: '杯' }],
  ['蛋糕', 'dàngāo', 'cake', { slot: '东西', price: 18, measure: '个' }],
  ['水', 'shuǐ', 'water', { slot: '东西', price: 3, measure: '瓶' }],
  ['单人间', 'dānrénjiān', 'single room', { slot: '东西', price: 200, measure: '间' }],
  ['双人间', 'shuāngrénjiān', 'double room', { slot: '东西', price: 300, measure: '间' }],
  ['早饭', 'zǎofàn', 'breakfast', { slot: '东西', price: 30, measure: '份' }],
  ['感冒药', 'gǎnmàoyào', 'cold medicine', { slot: '东西', price: 25, measure: '盒' }],
  ['创可贴', 'chuàngkětiē', 'plasters', { slot: '东西', price: 10, measure: '盒' }],
  ['口罩', 'kǒuzhào', 'face masks', { slot: '东西', price: 2, measure: '个' }],
  // places (taxi destinations)
  ['机场', 'jīchǎng', 'the airport', { slot: '地方' }],
  ['火车站', 'huǒchēzhàn', 'the train station', { slot: '地方' }],
  ['大学', 'dàxué', 'the university', { slot: '地方' }],
  ['医院', 'yīyuàn', 'the hospital', { slot: '地方' }],
  ['酒店', 'jiǔdiàn', 'the hotel', { slot: '地方' }],
  ['公园', 'gōngyuán', 'the park', { slot: '地方' }],
  // everything else in the new sentences
  ['水果店', 'shuǐguǒdiàn', 'fruit shop'], ['咖啡馆', 'kāfēiguǎn', 'café'], ['出租车', 'chūzūchē', 'taxi'], ['药店', 'yàodiàn', 'pharmacy'],
  ['新鲜', 'xīnxiān', 'fresh'], ['很', 'hěn', 'very'], ['甜', 'tián', 'sweet'], ['贵', 'guì', 'expensive'], ['便宜', 'piányi', 'cheap'],
  ['一点', 'yìdiǎn', 'a bit'], ['一点儿', 'yìdiǎnr', 'a little'], ['吧', 'ba', '(suggestion particle: …, OK?)'], ['好吧', 'hǎo ba', 'OK then'],
  ['可以', 'kěyǐ', 'can, may'], ['尝', 'cháng', 'to taste'], ['一下', 'yíxià', 'a moment, once'], ['尝尝', 'chángchang', 'have a taste'],
  ['袋子', 'dàizi', 'bag'], ['给', 'gěi', 'to give; for'], ['今天', 'jīntiān', 'today'], ['好', 'hǎo', 'good; very'], ['热', 'rè', 'hot'],
  ['是啊', 'shì a', 'yes indeed'], ['忙', 'máng', 'busy'], ['明天', 'míngtiān', 'tomorrow'], ['开', 'kāi', 'to open; to drive'],
  ['点', 'diǎn', "o'clock"], ['再见', 'zàijiàn', 'goodbye'], ['慢走', 'màn zǒu', 'take care (to someone leaving)'],
  ['讲价', 'jiǎngjià', 'to bargain'], ['聊天', 'liáotiān', 'to chat'], ['见', 'jiàn', 'to see, to meet'],
  ['大杯', 'dà bēi', 'large (cup)'], ['冰', 'bīng', 'ice, iced'], ['你好', 'nǐ hǎo', 'hello'], ['欢迎光临', 'huānyíng guānglín', 'welcome (to the shop)'],
  ['叫', 'jiào', 'to be called; to call'], ['什么', 'shénme', 'what'], ['名字', 'míngzi', 'name'], ['小代', 'Xiǎo Dài', 'Xiao Dai (the robot)'],
  ['哪国人', 'nǎ guó rén', 'which nationality'], ['中国人', 'Zhōngguó rén', 'Chinese (person)'], ['会', 'huì', 'can (a skill)'],
  ['英语', 'Yīngyǔ', 'English'], ['学生', 'xuésheng', 'student'], ['在', 'zài', 'at, in'], ['工作', 'gōngzuò', 'to work; job'],
  ['几', 'jǐ', 'how many, which'], ['下班', 'xiàbān', 'to finish work'], ['周末', 'zhōumò', 'weekend'], ['一起', 'yìqǐ', 'together'],
  ['喝', 'hē', 'to drink'], ['好啊', 'hǎo a', 'sure!'], ['微信', 'Wēixìn', 'WeChat'], ['扫', 'sǎo', 'to scan'], ['认识', 'rènshi', 'to get to know'],
  ['去', 'qù', 'to go'], ['哪儿', 'nǎr', 'where'], ['师傅', 'shīfu', 'driver, master (polite)'], ['远', 'yuǎn', 'far'],
  ['多长时间', 'duō cháng shíjiān', 'how long (time)'], ['分钟', 'fēnzhōng', 'minute'], ['前面', 'qiánmiàn', 'ahead, in front'],
  ['左转', 'zuǒ zhuǎn', 'turn left'], ['右转', 'yòu zhuǎn', 'turn right'], ['停', 'tíng', 'to stop'], ['到了', 'dào le', "we're here, arrived"],
  ['慢', 'màn', 'slow'], ['空调', 'kōngtiáo', 'air conditioning'], ['停车', 'tíngchē', 'to stop the car'], ['左', 'zuǒ', 'left'], ['右', 'yòu', 'right'],
  ['订', 'dìng', 'to book'], ['房间', 'fángjiān', 'room'], ['看', 'kàn', 'to look'], ['护照', 'hùzhào', 'passport'], ['楼', 'lóu', 'floor'],
  ['到', 'dào', 'to; until; arrive'], ['坏', 'huài', 'broken, bad'], ['对不起', 'duìbuqǐ', 'sorry'], ['马上', 'mǎshàng', 'right away'],
  ['看看', 'kànkan', 'have a look'], ['热水', 'rè shuǐ', 'hot water'], ['条', 'tiáo', 'measure word for long things'], ['毛巾', 'máojīn', 'towel'],
  ['送', 'sòng', 'to bring, deliver'], ['附近', 'fùjìn', 'nearby'], ['饭馆', 'fànguǎn', 'restaurant'], ['出门', 'chūmén', 'go out the door'],
  ['退房', 'tuìfáng', 'to check out'], ['房卡', 'fángkǎ', 'room card'], ['帮', 'bāng', 'to help'], ['等', 'děng', 'to wait'], ['服务', 'fúwù', 'service'],
  ['感冒', 'gǎnmào', 'a cold; to catch a cold'], ['发烧', 'fāshāo', 'to have a fever'], ['头疼', 'tóu téng', 'headache'], ['休息', 'xiūxi', 'to rest'],
  ['这个', 'zhège', 'this'], ['药', 'yào', 'medicine'], ['次', 'cì', 'times'], ['片', 'piàn', 'tablet, slice'], ['饭前', 'fàn qián', 'before meals'],
  ['饭后', 'fàn hòu', 'after meals'], ['肚子', 'dùzi', 'belly, stomach'], ['疼', 'téng', 'to hurt'], ['咳嗽', 'késou', 'to cough'],
  ['有空', 'yǒu kòng', 'to be free'], ['我们', 'wǒmen', 'we'], ['下午', 'xiàwǔ', 'afternoon'], ['中文', 'Zhōngwén', 'Chinese (language)'],
  ['哪里哪里', 'nǎli nǎli', 'not at all (modest reply to praise)'], ['祝', 'zhù', 'to wish'], ['一切', 'yíqiè', 'everything'], ['顺利', 'shùnlì', 'smooth, going well'],
  ['也', 'yě', 'also'], ['舒服', 'shūfu', 'comfortable, well'], ['约', 'yuē', 'to arrange (to meet)'], ['时间', 'shíjiān', 'time'], ['毕业', 'bìyè', 'to graduate'],
  ['吃药', 'chī yào', 'to take medicine'], ['问题', 'wèntí', 'problem, question'],
];

// ---------- places and days ----------
// Each exchange: [id, customer text, pinyin, en, reply id, reply text, pinyin, en]. A reply id seen before is reused.
const PLACES = [
  {
    place: 'fruit', group: '买水果', goods: ['苹果', '香蕉', '西瓜', '葡萄', '橙子', '草莓'],
    days: [
      { title: '水果店 Fruit shop', twist: 'A new shop! Fruit is sold by the 斤 (jīn, half a kilo). Your noodle rules for ordering and paying work here too: start a new script.', menu: 3, soldOut: [], vip: '李奶奶 (Grandma Li)',
        ex: [['f_fresh_q', '新鲜吗？', 'xīnxiān ma?', 'Is it fresh?', 'f_fresh', '很新鲜。', 'hěn xīnxiān.', 'Very fresh.'],
             ['f_sweet_q', '甜不甜？', 'tián bu tián?', 'Is it sweet?', 'f_sweet', '很甜。', 'hěn tián.', 'Very sweet.']] },
      { title: '讲价 Bargaining', twist: 'Customers haggle. Stay friendly and give a little.', menu: 4, soldOut: ['西瓜'], vip: '张经理 (Manager Zhang)',
        ex: [['f_expensive', '太贵了！', 'tài guì le!', 'Too expensive!', 'f_cheap', '不贵，很便宜。', 'bú guì, hěn piányi.', "It's not expensive, it's cheap."],
             ['f_discount_q', '便宜一点吧。', 'piányi yìdiǎn ba.', 'A bit cheaper, please.', 'f_discount', '好吧，便宜一点。', 'hǎo ba, piányi yìdiǎn.', 'OK, a bit cheaper.']] },
      { title: '尝一下 Try it', twist: 'Customers want to taste first and need a bag.', menu: 5, soldOut: ['香蕉'], vip: '小陈 (Xiao Chen)',
        ex: [['f_taste_q', '可以尝一下吗？', 'kěyǐ cháng yíxià ma?', 'Can I try one?', 'f_taste', '可以，尝尝吧。', 'kěyǐ, chángchang ba.', 'Sure, have a taste.'],
             ['f_bag_q', '有袋子吗？', 'yǒu dàizi ma?', 'Do you have a bag?', 'f_bag', '有，给你。', 'yǒu, gěi nǐ.', 'Yes, here you go.']] },
      { title: '聊天 Small talk', twist: 'Regulars chat about the weather and your day.', menu: 6, soldOut: ['葡萄'], vip: '王老师 (Teacher Wang)',
        ex: [['f_hot', '今天好热啊！', 'jīntiān hǎo rè a!', "It's so hot today!", 'f_hot_reply', '是啊，太热了。', 'shì a, tài rè le.', 'Yes, far too hot.'],
             ['f_busy_q', '你忙吗？', 'nǐ máng ma?', 'Are you busy?', 'f_busy', '不忙。', 'bù máng.', 'Not busy.']] },
      { title: '明天见 See you tomorrow', twist: 'Opening hours and goodbyes. Everything from this week comes back.', menu: 6, soldOut: ['草莓'], vip: '李奶奶 (Grandma Li)',
        ex: [['f_open_q', '明天开门吗？', 'míngtiān kāimén ma?', 'Are you open tomorrow?', 'f_open', '开，早上八点开门。', 'kāi, zǎoshang bā diǎn kāimén.', 'Yes, we open at 8 am.'],
             ['f_bye', '再见！', 'zàijiàn!', 'Goodbye!', 'f_bye_reply', '再见，慢走！', 'zàijiàn, màn zǒu!', 'Bye, take care!']] },
    ],
  },
  {
    place: 'cafe', group: '认识人', goods: ['咖啡', '奶茶', '果汁', '茶', '蛋糕', '水'],
    days: [
      { title: '咖啡馆 Café', twist: 'A new café, a new script. Drinks come by the 杯 (cup). Customers say how they want them.', menu: 3, soldOut: [], vip: '小陈 (Xiao Chen)',
        ex: [['c_large', '要大杯的。', 'yào dà bēi de.', 'A large one.', 'c_large_ok', '好的，大杯。', 'hǎode, dà bēi.', 'OK, large.'],
             ['c_iced', '要冰的。', 'yào bīng de.', 'Iced, please.', 'c_iced_ok', '好的，冰的。', 'hǎode, bīng de.', 'OK, iced.']] },
      { title: '认识你 Meeting people', twist: 'Customers say hello and ask your name. The robot is called 小代 (Xiǎo Dài).', menu: 4, soldOut: ['茶'], vip: '王老师 (Teacher Wang)',
        ex: [['c_hello', '你好！', 'nǐ hǎo!', 'Hello!', 'c_hello_reply', '你好！欢迎光临！', 'nǐ hǎo! huānyíng guānglín!', 'Hello! Welcome!'],
             ['c_name_q', '你叫什么名字？', 'nǐ jiào shénme míngzi?', "What's your name?", 'c_name', '我叫小代。', 'wǒ jiào Xiǎo Dài.', "I'm Xiao Dai."]] },
      { title: '哪国人 Where are you from?', twist: 'Where people are from, and what languages they speak.', menu: 5, soldOut: ['果汁'], vip: '张经理 (Manager Zhang)',
        ex: [['c_country_q', '你是哪国人？', 'nǐ shì nǎ guó rén?', 'Where are you from?', 'c_country', '我是中国人。', 'wǒ shì Zhōngguó rén.', "I'm Chinese."],
             ['c_english_q', '你会说英语吗？', 'nǐ huì shuō Yīngyǔ ma?', 'Do you speak English?', 'c_english', '会一点儿。', 'huì yìdiǎnr.', 'A little.']] },
      { title: '工作 Work and study', twist: 'Customers ask about your job and your hours.', menu: 6, soldOut: ['奶茶'], vip: '李奶奶 (Grandma Li)',
        ex: [['c_student_q', '你是学生吗？', 'nǐ shì xuésheng ma?', 'Are you a student?', 'c_student', '不是，我在这儿工作。', 'bú shì, wǒ zài zhèr gōngzuò.', 'No, I work here.'],
             ['c_off_q', '你几点下班？', 'nǐ jǐ diǎn xiàbān?', 'When do you finish work?', 'c_off', '晚上六点下班。', 'wǎnshang liù diǎn xiàbān.', 'At 6 in the evening.']] },
      { title: '周末 Weekend plans', twist: 'Regulars want to meet up. Everything from this week comes back.', menu: 6, soldOut: ['蛋糕'], vip: '小陈 (Xiao Chen)',
        ex: [['c_weekend', '周末一起喝咖啡吧！', 'zhōumò yìqǐ hē kāfēi ba!', "Let's have coffee this weekend!", 'c_weekend_reply', '好啊！', 'hǎo a!', 'Sure!'],
             ['c_wechat_q', '你的微信是多少？', 'nǐ de Wēixìn shì duōshao?', "What's your WeChat?", 'c_wechat', '我扫你吧。', 'wǒ sǎo nǐ ba.', "I'll scan yours."]] },
    ],
  },
  {
    place: 'taxi', group: '坐车', goods: [], places: ['机场', '火车站', '大学', '医院', '酒店', '公园'],
    days: [
      { title: '出租车 Taxi', twist: 'Now you drive a taxi. Passengers order nothing: they tell you where to go. [地方] is a new slot for places.', menu: 3, vip: '张经理 (Manager Zhang)',
        ex: [['t_go', '我去 [地方]。', 'wǒ qù [地方].', "I'm going to [地方].", 't_go_ok', '好的，去 [地方]。', 'hǎode, qù [地方].', 'OK, to [地方].'],
             ['t_hello', '师傅，你好！', 'shīfu, nǐ hǎo!', 'Hello, driver!', 't_where', '你好！去哪儿？', 'nǐ hǎo! qù nǎr?', 'Hello! Where to?']] },
      { title: '远吗 Is it far?', twist: 'Passengers ask how far and how long.', menu: 4, vip: '王老师 (Teacher Wang)',
        ex: [['t_far_q', '远吗？', 'yuǎn ma?', 'Is it far?', 't_far', '不远。', 'bù yuǎn.', 'Not far.'],
             ['t_time_q', '要多长时间？', 'yào duō cháng shíjiān?', 'How long will it take?', 't_time', '二十分钟。', 'èrshí fēnzhōng.', 'Twenty minutes.']] },
      { title: '左转右转 Directions', twist: 'Passengers give directions on the way.', menu: 5, vip: '小陈 (Xiao Chen)',
        ex: [['t_left', '前面左转。', 'qiánmiàn zuǒ zhuǎn.', 'Turn left ahead.', 't_left_ok', '好的，左转。', 'hǎode, zuǒ zhuǎn.', 'OK, left.'],
             ['t_right', '前面右转。', 'qiánmiàn yòu zhuǎn.', 'Turn right ahead.', 't_right_ok', '好的，右转。', 'hǎode, yòu zhuǎn.', 'OK, right.']] },
      { title: '停车 Stopping', twist: 'Where to stop, and nervous passengers.', menu: 6, vip: '李奶奶 (Grandma Li)',
        ex: [['t_stop', '在这儿停吧。', 'zài zhèr tíng ba.', 'Stop here, please.', 't_stop_ok', '好的，到了。', 'hǎode, dào le.', "OK, we're here."],
             ['t_slow', '开慢一点儿！', 'kāi màn yìdiǎnr!', 'Drive a bit slower!', 't_slow_ok', '好的，慢一点儿。', 'hǎode, màn yìdiǎnr.', 'OK, slower.']] },
      { title: '到了 Arriving', twist: 'Are we there yet? Everything from this week comes back.', menu: 6, vip: '张经理 (Manager Zhang)',
        ex: [['t_there_q', '到了吗？', 'dào le ma?', 'Are we there yet?', 't_almost', '快到了。', 'kuài dào le.', 'Almost there.'],
             ['t_ac_q', '可以开空调吗？', 'kěyǐ kāi kōngtiáo ma?', 'Can you turn on the AC?', 't_ac', '可以。', 'kěyǐ.', 'Sure.']] },
    ],
  },
  {
    place: 'hotel', group: '住酒店', goods: ['单人间', '双人间', '早饭'],
    days: [
      { title: '酒店 Hotel check-in', twist: 'You run a hotel front desk. Rooms come by the 间 (jiān).', menu: 2, soldOut: [], vip: '王老师 (Teacher Wang)',
        ex: [['h_booked', '我订了房间。', 'wǒ dìng le fángjiān.', 'I booked a room.', 'h_passport', '请给我看一下护照。', 'qǐng gěi wǒ kàn yíxià hùzhào.', 'Please show me your passport.'],
             ['h_floor_q', '几楼？', 'jǐ lóu?', 'Which floor?', 'h_floor', '五楼。', 'wǔ lóu.', 'The fifth floor.']] },
      { title: '早饭 Breakfast', twist: 'Guests ask about breakfast.', menu: 3, soldOut: [], vip: '小陈 (Xiao Chen)',
        ex: [['h_breakfast_q', '早饭几点？', 'zǎofàn jǐ diǎn?', 'What time is breakfast?', 'h_breakfast', '早上七点到九点。', 'zǎoshang qī diǎn dào jiǔ diǎn.', 'From 7 to 9 am.'],
             ['h_where_q', '早饭在哪儿？', 'zǎofàn zài nǎr?', 'Where is breakfast?', 'h_where', '在二楼。', 'zài èr lóu.', 'On the second floor.']] },
      { title: '坏了 Problems', twist: 'Things break. Say sorry and go and look.', menu: 3, soldOut: ['单人间'], vip: '李奶奶 (Grandma Li)',
        ex: [['h_ac', '空调坏了。', 'kōngtiáo huài le.', 'The AC is broken.', 'h_fix', '对不起，我马上去看看。', 'duìbuqǐ, wǒ mǎshàng qù kànkan.', "Sorry, I'll come and look right away."],
             ['h_water', '没有热水。', 'méiyǒu rè shuǐ.', "There's no hot water.", 'h_fix']] },
      { title: '服务 Service', twist: 'Guests need things and ask for tips nearby.', menu: 3, soldOut: ['双人间'], vip: '张经理 (Manager Zhang)',
        ex: [['h_towel_q', '可以多给我一条毛巾吗？', 'kěyǐ duō gěi wǒ yì tiáo máojīn ma?', 'Could I have an extra towel?', 'h_towel', '可以，马上给您送。', 'kěyǐ, mǎshàng gěi nín sòng.', "Sure, I'll bring it right away."],
             ['h_food_q', '附近有饭馆吗？', 'fùjìn yǒu fànguǎn ma?', 'Is there a restaurant nearby?', 'h_food', '有，出门右转。', 'yǒu, chūmén yòu zhuǎn.', 'Yes, turn right out the door.']] },
      { title: '退房 Check-out', twist: 'Guests leave. Everything from this week comes back.', menu: 3, soldOut: ['单人间'], vip: '小陈 (Xiao Chen)',
        ex: [['h_checkout', '我要退房。', 'wǒ yào tuìfáng.', "I'd like to check out.", 'h_card', '好的，请给我房卡。', 'hǎode, qǐng gěi wǒ fángkǎ.', 'OK, the room card please.'],
             ['h_taxi_q', '可以帮我叫出租车吗？', 'kěyǐ bāng wǒ jiào chūzūchē ma?', 'Can you call me a taxi?', 'h_wait', '可以，请等一下。', 'kěyǐ, qǐng děng yíxià.', 'Sure, please wait a moment.']] },
    ],
  },
  {
    place: 'pharmacy', group: '看病', goods: ['感冒药', '创可贴', '口罩', '水'],
    days: [
      { title: '药店 Pharmacy', twist: 'Last place: a pharmacy. People tell you what hurts.', menu: 2, soldOut: [], vip: '李奶奶 (Grandma Li)',
        ex: [['m_cold', '我感冒了。', 'wǒ gǎnmào le.', 'I have a cold.', 'm_fever_q', '你发烧吗？', 'nǐ fāshāo ma?', 'Do you have a fever?'],
             ['m_head', '我头疼。', 'wǒ tóu téng.', 'I have a headache.', 'm_rest', '多喝水，多休息。', 'duō hē shuǐ, duō xiūxi.', 'Drink lots of water and rest.']] },
      { title: '吃药 Taking medicine', twist: 'How and when to take medicine.', menu: 3, soldOut: [], vip: '王老师 (Teacher Wang)',
        ex: [['m_how_q', '这个药怎么吃？', 'zhège yào zěnme chī?', 'How do I take this medicine?', 'm_how', '一天三次，一次两片。', 'yì tiān sān cì, yí cì liǎng piàn.', 'Three times a day, two tablets each time.'],
             ['m_meal_q', '饭前吃还是饭后吃？', 'fàn qián chī háishi fàn hòu chī?', 'Before or after meals?', 'm_meal', '饭后吃。', 'fàn hòu chī.', 'After meals.']] },
      { title: '不舒服 Feeling ill', twist: 'More aches, more advice.', menu: 4, soldOut: ['口罩'], vip: '张经理 (Manager Zhang)',
        ex: [['m_stomach', '我肚子疼。', 'wǒ dùzi téng.', 'My stomach hurts.', 'm_ate_q', '你吃什么了？', 'nǐ chī shénme le?', 'What did you eat?'],
             ['m_cough', '我咳嗽。', 'wǒ késou.', "I'm coughing.", 'm_hot_water', '多喝热水。', 'duō hē rè shuǐ.', 'Drink lots of hot water.']] },
      { title: '约时间 Making plans', twist: 'A friend drops by to make plans.', menu: 4, soldOut: ['创可贴'], vip: '小陈 (Xiao Chen)',
        ex: [['m_free_q', '明天你有空吗？', 'míngtiān nǐ yǒu kòng ma?', 'Are you free tomorrow?', 'm_free', '有空。', 'yǒu kòng.', "I'm free."],
             ['m_meet_q', '我们几点见？', 'wǒmen jǐ diǎn jiàn?', 'What time shall we meet?', 'm_meet', '下午三点吧。', 'xiàwǔ sān diǎn ba.', "Let's say 3 pm."]] },
      { title: '毕业 Graduation', twist: 'Day 30! Everyone you met comes back to say goodbye.', menu: 4, soldOut: ['感冒药'], vip: '王老师 (Teacher Wang)',
        ex: [['m_good', '你的中文很好！', 'nǐ de Zhōngwén hěn hǎo!', 'Your Chinese is very good!', 'm_modest', '哪里哪里，谢谢！', 'nǎli nǎli, xièxie!', 'Not at all, thank you!'],
             ['m_luck', '祝你一切顺利！', 'zhù nǐ yíqiè shùnlì!', 'All the best!', 'm_you_too', '谢谢，你也是！', 'xièxie, nǐ yě shì!', 'Thanks, you too!']] },
    ],
  },
];

// ---------- build ----------
const words = read('words.json');
const patterns = read('patterns.json');
const days = read('days.json');
const FIRST_NEW = 6;

const added = new Set();
for (const [hanzi, pinyin, en, extra = {}] of W) {
  if (added.has(hanzi)) throw new Error(`word listed twice: ${hanzi}`);
  added.add(hanzi);
}
const keptWords = words.filter((w) => !(w.addedBy === 'add-days' || (added.has(w.hanzi) && w.day >= FIRST_NEW)));
const have = new Set(keptWords.map((w) => w.hanzi));
const keptPatterns = patterns.filter((p) => p.day < FIRST_NEW);
const keptDays = days.filter((d) => d.day < FIRST_NEW);

const newDays = [];
const newPatterns = [];
const firstDayOfWord = new Map();
const fill = (t, slot) => t.replace(/\[地方\]/g, slot ?? '机场');
let n = FIRST_NEW;
for (const place of PLACES) {
  const placeExchanges = [];
  for (const [i, spec] of place.days.entries()) {
    const day = n++;
    const dayPatterns = [];
    for (const [id, text, pinyin, en, replyId, rText, rPinyin, rEn] of spec.ex) {
      if (rText && !newPatterns.some((p) => p.id === replyId)) {
        newPatterns.push({ id: replyId, template: rText.replace(/\[地方\]/g, '[地方]'), pinyin: rPinyin, en: rEn, day, group: place.group, speaker: 'bot' });
        dayPatterns.push(replyId);
      }
      newPatterns.push({ id, template: text, pinyin, en, day, group: place.group, speaker: 'customer', reply: [replyId] });
      dayPatterns.unshift(id);
      placeExchanges.push({ id, text, en, replyId });
    }
    const menu = place.goods.length ? place.goods.slice(0, spec.menu) : place.places.slice(0, spec.menu);
    for (const g of menu) if (!firstDayOfWord.has(g)) firstDayOfWord.set(g, day);
    // Two levels add one exchange each (question + answer), the third is the busy peak.
    const [a, b] = spec.ex;
    const pair = (e) => [e[0], ...(e[5] && dayPatterns.includes(e[4]) ? [e[4]] : [])];
    // Level title: the new line without punctuation; a slot reads as "…".
    const titleOf = (e) => `${e[1].replace(/[。！？]/g, '').replace(/\s*\[地方\]/g, '…')} ${e[3].replace(/\s*\[地方\]\.?/, '…')}`;
    const levels = [
      { title: titleOf(a), newPatterns: pair(a), customers: 4, maxQty: 2, heat: 0.2 },
      { title: titleOf(b), newPatterns: pair(b), customers: 6, maxQty: 3, heat: 0.5 },
      { title: i === 4 ? '最后的高峰 Final rush' : '高峰 Peak', newPatterns: [], customers: i === 4 ? 12 : 9, maxQty: 5, heat: 1 },
    ];
    const vipTurns = [a, b].map((e) => {
      const replyText = e[5] ?? newPatterns.find((p) => p.id === e[4]).template;
      const replyEn = e[7] ?? newPatterns.find((p) => p.id === e[4]).en;
      const where = place.places?.[i % place.places.length];
      return {
        says: fill(e[1], where).replace(/\s+/g, ''),
        en: e[3].replace('[地方]', where ? W.find((w) => w[0] === where)[2] : ''),
        expect: [e[4]],
        model: fill(replyText, where).replace(/\s+/g, ''),
        modelEn: replyEn.replace('[地方]', where ? W.find((w) => w[0] === where)[2] : ''),
      };
    });
    vipTurns.push({ says: '谢谢！', en: 'Thank you!', expect: ['p_welcome'], model: '不客气。', modelEn: "You're welcome." });
    newDays.push({
      day,
      place: place.place,
      title: spec.title,
      twist: spec.twist,
      newPatterns: dayPatterns,
      menu,
      soldOut: spec.soldOut ?? [],
      maxQty: 5,
      customerTypes: ['student', 'office', 'grandma', 'tourist'],
      starThresholds: [0.6, 0.8, 0.95],
      targetRules: 0, // set from the sample script below
      sampleScript: `scripts/day${day}.txt`,
      vip: { name: spec.vip, situation: 'A regular who wants to talk to you, not the robot.', turns: vipTurns },
      levels,
    });
    // Sample script: shop rules (if the place sells anything), then one rule per question so far.
    const lines = ['客人说 → 听'];
    if (place.goods.length) {
      const stock = (then) => ['    如果 有 [东西]', `        就 ${then}`, '    不然', '        就 说 "没有了"'];
      lines.push('如果 听到 "有 [东西] 吗"', ...stock('说 "有"'));
      lines.push('如果 听到 "我要 [数量][量词][东西]"', ...stock('给 [数量][量词][东西]'));
      lines.push('如果 听到 "来 [数量][量词][东西]"', ...stock('给 [数量][量词][东西]'));
      lines.push('如果 听到 "多少钱"', '    就 说 "一共 [价钱]"');
    }
    lines.push('如果 听到 "扫码"', '    就 收钱 扫码', '如果 听到 "现金"', '    就 收钱 现金');
    for (const e of placeExchanges) {
      const reply = newPatterns.find((p) => p.id === e.replyId).template;
      lines.push(`如果 听到 "${e.text}"`, `    就 说 "${reply}"`);
    }
    lines.push('如果 听到 "谢谢"', '    就 说 "不客气"');
    const script = lines.join('\n') + '\n';
    writeFileSync(new URL(`../content/scripts/day${day}.txt`, import.meta.url), script);
    newDays.at(-1).targetRules = countRules(parseScript(script).body);
  }
}

const outWords = [...keptWords];
for (const [hanzi, pinyin, en, extra = {}] of W) {
  if (have.has(hanzi)) continue;
  outWords.push({ hanzi, pinyin, en, day: firstDayOfWord.get(hanzi) ?? 0, ...extra });
}
// A word belongs to the first day whose sentences use it (for the day's word overview).
for (const p of [...newPatterns].sort((a, b) => a.day - b.day)) {
  for (const t of segment(p.template, outWords)) {
    const w = t.word && outWords.find((x) => x.hanzi === t.word.hanzi && added.has(x.hanzi));
    if (w && w.day === 0) w.day = p.day;
  }
}
write('words.json', outWords);
write('patterns.json', [...keptPatterns, ...newPatterns]);
write('days.json', [...keptDays, ...newDays]);
console.log(`days ${keptDays.length + newDays.length}, patterns +${newPatterns.length}, words ${outWords.length}`);
