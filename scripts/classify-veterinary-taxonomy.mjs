import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bankDir = path.join(root, "server/question-banks/veterinary-practitioner");
const questionDir = path.join(bankDir, "questions");
const manifestPath = path.join(bankDir, "manifest.json");
const reportPath = path.join(bankDir, "reports/taxonomy-classification.json");

const subjects = [
  "基础科目",
  "预防科目",
  "临床科目",
  "综合科目",
];

const spec = {
  "兽医法律法规和职业道德": [
    ["法规：执业资格与机构管理", ["执业兽医师", "执业助理兽医师", "执业注册", "动物诊疗机构", "执业备案", "执业活动" ]],
    ["法规：动物防疫与疫情处置", ["动物防疫法", "重大动物疫情", "一类动物疫病", "疫区", "封锁", "扑杀", "动物疫情" ]],
    ["法规：检疫与监督管理", ["动物检疫", "检疫证明", "检疫申报", "监督机构", "农业农村主管部门", "产地检疫", "屠宰检疫" ]],
    ["法规：兽药与处方管理", ["兽药管理", "兽药经营", "处方药", "处方笺", "兽药残留", "假兽药", "劣兽药" ]],
    ["法规：职业道德与法律责任", ["职业道德", "法律责任", "行政处罚", "吊销", "违法行为", "保密义务" ]],
    ["法规：综合与未细分", []],
  ],
  "动物解剖学、组织学与胚胎学": [
    ["解剖：细胞与组织", ["细胞膜", "细胞器", "上皮组织", "结缔组织", "软骨组织", "骨组织", "肌组织", "神经组织", "组织学" ]],
    ["解剖：骨骼与肌肉", ["骨骼", "骨骼肌", "肌肉", "关节", "脊柱", "椎骨", "肌腱", "韧带", "蹄", "角" ]],
    ["解剖：消化系统", ["口腔", "食管", "瘤胃", "网胃", "瓣胃", "皱胃", "胃肠", "小肠", "大肠", "胰腺", "肝脏" ]],
    ["解剖：呼吸与循环系统", ["心脏", "心房", "心室", "血管", "动脉", "静脉", "肺", "气管", "支气管", "淋巴结", "淋巴管" ]],
    ["解剖：泌尿与生殖系统", ["肾脏", "肾单位", "输尿管", "膀胱", "尿道", "卵巢", "子宫", "睾丸", "输精管", "胎盘" ]],
    ["解剖：神经与感觉器官", ["脑", "脊髓", "神经", "神经节", "眼球", "视网膜", "耳", "听觉", "嗅觉", "皮肤" ]],
    ["解剖：胚胎发育", ["胚胎", "胚层", "受精卵", "胚胎发育", "胎膜", "胎盘类型", "胎儿" ]],
    ["解剖：综合与未细分", []],
  ],
  "动物生理学": [
    ["生理：血液与循环", ["凝血", "血液", "血红蛋白", "心动周期", "心电图", "心律失常", "血压", "心输出量", "循环" ]],
    ["生理：呼吸", ["呼吸中枢", "吸气", "呼气", "肺泡", "气体交换", "氧解离", "通气", "呼吸调节" ]],
    ["生理：消化与吸收", ["消化", "瘤胃", "反刍", "胃液", "胰液", "胆汁", "小肠吸收", "葡萄糖吸收", "胃肠运动", "唾液" ]],
    ["生理：泌尿与体液平衡", ["肾小球", "肾小管", "尿液", "排尿", "肾小球滤过", "渗透压", "酸碱平衡", "抗利尿激素" ]],
    ["生理：神经与感觉", ["反射", "突触", "动作电位", "神经递质", "神经中枢", "感觉器官", "兴奋性", "细胞膜电位", "静息电位", "钠钾泵", "膜内", "膜外" ]],
    ["生理：内分泌与生殖", ["内分泌", "激素", "甲状腺", "肾上腺", "胰岛素", "发情周期", "排卵", "泌乳" ]],
    ["生理：体温与能量代谢", ["体温", "散热", "产热", "基础代谢", "能量代谢", "体温调节" ]],
    ["生理：综合与未细分", []],
  ],
  "动物生物化学": [
    ["生化：蛋白质与酶", ["蛋白质", "氨基酸", "酶", "酶活性", "蛋白质变性", "肽键" ]],
    ["生化：糖代谢", ["糖酵解", "糖原", "糖异生", "葡萄糖", "糖代谢", "乳酸", "血糖" ]],
    ["生化：脂类代谢", ["脂肪酸", "脂肪动员", "脂肪水解", "脂代谢", "胆固醇", "甘油三酯", "酮体" ]],
    ["生化：核酸与遗传信息", ["DNA", "RNA", "核酸", "复制", "转录", "翻译", "遗传密码", "核苷酸" ]],
    ["生化：维生素与辅酶", ["维生素", "辅酶", "辅基", "脂溶性维生素", "水溶性维生素" ]],
    ["生化：生物氧化与能量", ["三羧酸", "氧化磷酸化", "ATP", "呼吸链", "电子传递", "生物氧化" ]],
    ["生化：细胞膜与物质转运", ["细胞膜", "生物膜", "膜脂", "过膜转运", "跨膜转运", "渗透压", "内环境稳态", "离子转运", "尿素循环", "胆红素" ]],
    ["生化：综合与未细分", []],
  ],
  "动物病理学": [
    ["病理：细胞损伤与适应", ["变性", "坏死", "凋亡", "萎缩", "肥大", "增生", "化生", "细胞损伤" ]],
    ["病理：循环障碍", ["充血", "淤血", "出血", "血栓", "栓塞", "梗死", "水肿", "休克", "微循环" ]],
    ["病理：炎症与修复", ["炎症", "炎性", "肉芽组织", "创伤愈合", "修复", "再生", "纤维化" ]],
    ["病理：肿瘤", ["肿瘤", "癌", "肉瘤", "转移", "良性肿瘤", "恶性肿瘤" ]],
    ["病理：疾病概论与全身病变", ["发热", "疾病发展", "潜伏期", "前驱期", "转归", "病程", "全身症状", "疾病的概念", "脓毒败血症", "临床死亡", "中毒时", "疾病过程" ]],
    ["病理：器官系统病理", ["心力衰竭细胞", "肺水肿", "肝硬化", "肾小管", "脾脏", "病理变化", "剖检病变" ]],
    ["病理：综合与未细分", []],
  ],
  "兽医药理学": [
    ["药理：药物作用与药动学", ["药物作用", "药效学", "药动学", "半衰期", "生物利用度", "首过效应", "受体", "药物在体内", "生物转化", "主动转运", "血浆蛋白结合", "细胞膜" ]],
    ["药理：抗菌与抗病毒药", ["抗菌药", "抗生素", "磺胺", "青霉素", "四环素", "氟喹诺酮", "抗病毒药" ]],
    ["药理：抗寄生虫药", ["驱虫药", "抗寄生虫", "蠕虫", "球虫药", "螨病", "蠕形螨" ]],
    ["药理：麻醉与镇痛药", ["麻醉药", "麻醉", "镇静", "镇痛", "局麻", "全身麻醉" ]],
    ["药理：系统用药", ["强心", "利尿", "平喘", "止吐", "泻药", "子宫收缩", "解热镇痛" ]],
    ["药理：不良反应与中毒", ["不良反应", "毒性", "中毒", "解毒", "毒副作用", "配伍禁忌" ]],
    ["药理：合理用药与给药", ["给药", "剂量", "疗程", "休药期", "用药", "处方", "内服", "注射", "钙、磷代谢", "熏蒸消毒" ]],
    ["药理：综合与未细分", []],
  ],
  "基础综合题": [["基础综合：综合与未细分", []]],
  "兽医微生物学与免疫学": [
    ["微免：细菌与支原体", ["细菌", "革兰", "菌落", "芽孢", "荚膜", "支原体", "培养基", "细菌结构" ]],
    ["微免：病毒", ["病毒", "囊膜", "病毒核酸", "病毒粒子", "血凝", "干扰素", "病毒感染" ]],
    ["微免：真菌与其他病原", ["真菌", "衣原体", "螺旋体", "立克次体", "朊病毒" ]],
    ["微免：免疫基础", ["抗原", "抗体", "补体", "免疫应答", "细胞免疫", "体液免疫", "变态反应" ]],
    ["微免：疫苗与免疫接种", ["疫苗", "免疫接种", "弱毒活疫苗", "灭活疫苗", "免疫程序", "抗血清" ]],
    ["微免：病原检测与消毒灭菌", ["培养", "染色", "凝集试验", "中和试验", "灭菌", "消毒", "选择培养基" ]],
    ["微免：综合与未细分", []],
  ],
  "兽医传染病学": [
    ["传染病：猪与反刍动物疫病", ["猪瘟", "蓝耳", "伪狂犬", "猪细小", "口蹄疫", "牛结核", "布鲁氏菌", "小反刍兽疫", "牛病毒性腹泻", "牛流行热", "牛白血病", "牛传染性鼻气管炎", "羊痘", "羊快疫", "羔羊痢疾", "猪丹毒", "猪肺疫", "猪链球菌病", "仔猪梭菌性肠炎", "猪传染性胃肠炎", "猪流行性腹泻", "猪圆环病毒", "牛结节性皮肤病" ]],
    ["传染病：禽类疫病", ["新城疫", "禽流感", "鸡传染性", "鸭瘟", "鸭病毒性", "马立克", "产蛋下降", "鸭传染性浆膜炎", "貂病毒性肠炎", "马鼻疽", "鸡传染性喉气管炎", "禽白血病", "鸡传染性法氏囊病", "禽腺病毒" ]],
    ["传染病：犬猫疫病", ["犬瘟热", "犬细小", "狂犬病", "猫瘟", "猫传染性腹膜炎", "猫白血病" ]],
    ["传染病：其他动物疫病", ["兔瘟", "马传染性", "水生动物", "鱼类病毒", "蜜蜂", "貂病毒性肠炎", "马鼻疽", "蚕病" ]],
    ["传染病：流行病学与传播", ["流行病学", "传播途径", "传染源", "潜伏期", "感染率", "发病率", "死亡率" ]],
    ["传染病：免疫预防与控制", ["隔离", "封锁", "扑杀", "无害化处理", "免疫程序", "疫苗接种", "疫情报告" ]],
    ["传染病：综合与未细分", []],
  ],
  "兽医寄生虫学": [
    ["寄生虫：原虫与球虫", ["原虫", "球虫", "弓形虫", "焦虫", "巴贝斯虫", "锥虫", "梨形虫" ]],
    ["寄生虫：线虫", ["线虫", "蛔虫", "钩虫", "旋毛虫", "肺线虫", "丝虫", "虫卵" ]],
    ["寄生虫：吸虫与绦虫", ["吸虫", "绦虫", "棘球蚴", "囊尾蚴", "肝片吸虫", "姜片吸虫" ]],
    ["寄生虫：节肢动物与体表寄生虫", ["疥螨", "螨", "蜱", "蚤", "虱", "蝇蛆", "节肢动物" ]],
    ["寄生虫：生活史与宿主", ["中间宿主", "终末宿主", "保虫宿主", "生活史", "感染性幼虫", "感染阶段" ]],
    ["寄生虫：诊断与防治", ["驱虫", "粪便检查", "虫卵检查", "压片法", "剖检", "防控措施", "寄生虫病诊断" ]],
    ["寄生虫：综合与未细分", []],
  ],
  "兽医公共卫生学": [
    ["公卫：人兽共患病", ["人兽共患", "炭疽", "布鲁氏菌病", "结核病", "旋毛虫病", "弓形虫病", "狂犬病" ]],
    ["公卫：动物性食品安全", ["食品安全", "肉品", "屠宰", "胴体", "病害肉", "食物中毒", "食品卫生" ]],
    ["公卫：检疫与卫生监督", ["检疫", "卫生监督", "屠宰检验", "动物产品", "出入境" ]],
    ["公卫：兽药残留与毒物", ["兽药残留", "休药期", "甲基汞", "致畸", "毒物", "残留限量" ]],
    ["公卫：消毒与环境卫生", ["消毒", "带猪消毒", "无害化", "污水", "粪便处理", "环境卫生", "生物安全" ]],
    ["公卫：综合与未细分", []],
  ],
  "预防综合题": [["预防综合：综合与未细分", []]],
  "兽医临床诊断学": [
    ["诊断：临床检查与一般症状", ["正常体温", "体温范围", "体温", "脉搏", "呼吸数", "营养状况", "视诊", "触诊", "叩诊", "听诊", "临床检查", "昏迷", "对外界刺激", "痒感", "可视黏膜", "体态异常", "行为异常", "姿势", "发热时" ]],
    ["诊断：实验室检验", ["血常规", "血液学检查", "尿沉渣", "尿道炎时", "尿常规", "粪便检查", "生化检查", "心肌损害", "配血试验", "实验室检验" ]],
    ["诊断：影像与器械检查", ["X线", "超声", "B超", "心电图", "内窥镜", "影像学", "放射学", "扫查位置", "脾脏" ]],
    ["诊断：系统检查与定位", ["神经反射", "心律不齐", "心脏听诊", "肺部听诊", "腹部触诊", "瘤胃蠕动", "眼科检查", "少尿" ]],
    ["诊断：鉴别诊断与临床推理", ["鉴别诊断", "确诊", "诊断依据", "最可能的诊断", "诊断方法" ]],
    ["诊断：综合与未细分", []],
  ],
  "兽医内科学": [
    ["内科：消化系统疾病", ["瘤胃积食", "瘤胃臌气", "泡沫性瘤胃", "胃肠炎", "胃炎", "肠炎", "腹泻", "便秘", "前胃弛缓", "消化系统", "肠扭转", "食管阻塞" ]],
    ["内科：呼吸系统疾病", ["支气管炎", "肺炎", "肺气肿", "胸膜炎", "呼吸系统", "咳嗽", "呼吸困难" ]],
    ["内科：心血管与血液疾病", ["心力衰竭", "心内膜炎", "心包炎", "贫血", "血液病", "心血管" ]],
    ["内科：泌尿系统疾病", ["肾炎", "肾病", "尿道炎", "膀胱炎", "膀胱尿道结石", "泌尿系统", "尿毒症", "少尿" ]],
    ["内科：神经与运动系统疾病", ["脑炎", "脑膜炎", "脊髓炎", "神经系统", "瘫痪", "癫痫", "运动障碍", "脊髓" ]],
    ["内科：代谢与营养疾病", ["酮病", "佝偻病", "骨软症", "低血糖", "营养代谢", "维生素缺乏", "矿物质缺乏" ]],
    ["内科：中毒与环境病", ["中毒", "毒物", "农药", "霉菌毒素", "热射病", "日射病" ]],
    ["内科：皮肤与其他系统疾病", ["皮炎", "湿疹", "皮肤病", "乳房炎", "眼病", "耳病" ]],
    ["内科：综合与未细分", []],
  ],
  "兽医外科与手术学": [
    ["外科：无菌术与围手术期", ["无菌", "消毒", "灭菌", "手术准备", "术前", "术后护理", "手术器械" ]],
    ["外科：麻醉与保定", ["麻醉", "全身麻醉", "局部麻醉", "保定", "麻醉药" ]],
    ["外科：创伤与伤口处理", ["创伤", "清创", "缝合", "创口", "引流", "绷带", "止血", "愈合", "蜂窝织炎", "外科感染", "病原微生物感染" ]],
    ["外科：骨关节与运动器官", ["骨折", "脱臼", "关节", "骨骼", "跛行", "蹄病", "肌腱" ]],
    ["外科：疝与腹部手术", ["疝", "剖腹", "肠梗阻", "肠扭转", "腹腔", "瘤胃切开" ]],
    ["外科：眼耳与其他专科手术", ["角膜", "眼球", "白内障", "耳道", "鼻腔", "截肢", "去势" ]],
    ["外科：肿瘤与外科疾病", ["肿瘤", "脓肿", "囊肿", "肿块", "坏疽" ]],
    ["外科：综合与未细分", []],
  ],
  "兽医产科学": [
    ["产科：生殖生理与繁殖管理", ["发情周期", "发情持续", "发情时", "接受交配", "有性欲", "排卵", "配种", "授精", "繁殖", "精液", "多次性发情", "卵子受精" ]],
    ["产科：妊娠与胎儿发育", ["妊娠期", "妊娠诊断", "胎儿", "胎盘", "妊娠" ]],
    ["产科：分娩与难产处理", ["分娩", "难产", "助产", "产道", "胎位", "胎势", "牵引" ]],
    ["产科：产后疾病与护理", ["胎衣不下", "产后", "子宫复旧", "子宫脱出", "阴道脱出" ]],
    ["产科：乳房与泌乳", ["乳房炎", "乳腺炎", "泌乳", "乳汁", "干奶" ]],
    ["产科：不孕与生殖疾病", ["不孕", "流产", "子宫内膜炎", "卵巢囊肿", "繁殖障碍" ]],
    ["产科：综合与未细分", []],
  ],
  "中兽医学": [
    ["中兽医：基础理论与阴阳五行", ["阴阳", "五行", "脏腑", "气血", "经络", "藏象", "六腑", "奇恒之腑", "君主之官", "病理传变" ]],
    ["中兽医：辨证与诊法", ["辨证", "证候", "脉象", "舌诊", "四诊", "八纲" ]],
    ["中兽医：中药性能与功效", ["中药", "药性", "四气", "五味", "归经", "功效", "润下", "补血活血", "黄连", "郁金", "金银花", "平肝息风" ]],
    ["中兽医：方剂与临床应用", ["方剂", "汤", "散", "方组成", "加减", "配伍" ]],
    ["中兽医：针灸与外治", ["针灸", "穴位", "针刺", "艾灸", "经穴" ]],
    ["中兽医：综合与未细分", []],
  ],
  "临床综合题": [["临床综合：综合与未细分", []]],
  "猪病": [
    ["猪病：传染病", ["猪瘟", "蓝耳", "伪狂犬", "猪细小", "圆环病毒", "口蹄疫", "猪丹毒", "猪肺疫" ]],
    ["猪病：寄生虫病", ["猪蛔虫", "旋毛虫", "猪囊虫", "猪球虫", "疥螨" ]],
    ["猪病：消化与呼吸疾病", ["仔猪黄白痢", "腹泻", "胃肠炎", "肺炎", "咳嗽", "呼吸困难" ]],
    ["猪病：繁殖与产科疾病", ["母猪", "仔猪", "流产", "繁殖障碍", "子宫炎", "乳房炎", "产后" ]],
    ["猪病：饲养管理与综合防控", ["猪场", "生猪", "饲养管理", "免疫程序", "消毒", "生物安全" ]],
    ["猪病：综合与未细分", []],
  ],
  "禽病": [
    ["禽病：病毒性传染病", ["新城疫", "禽流感", "传染性支气管炎", "传染性法氏囊", "马立克", "鸭瘟" ]],
    ["禽病：细菌与支原体病", ["大肠杆菌病", "鸡白痢", "禽霍乱", "沙门氏菌", "支原体病" ]],
    ["禽病：寄生虫与真菌病", ["球虫病", "组织滴虫", "曲霉菌", "寄生虫病" ]],
    ["禽病：营养与代谢疾病", ["产蛋下降", "蛋壳", "维生素缺乏", "痛风", "腹水症" ]],
    ["禽病：饲养管理与综合防控", ["鸡舍", "禽舍", "雏鸡", "蛋鸡", "肉鸡", "免疫程序", "通风" ]],
    ["禽病：综合与未细分", []],
  ],
  "牛羊病": [
    ["牛羊病：传染病", ["口蹄疫", "布鲁氏菌", "结核", "小反刍兽疫", "牛流行热", "牛病毒性腹泻" ]],
    ["牛羊病：寄生虫病", ["肝片吸虫", "焦虫病", "巴贝斯虫", "牛皮蝇", "羊疥螨" ]],
    ["牛羊病：消化与呼吸疾病", ["瘤胃积食", "前胃弛缓", "皱胃", "肺炎", "支气管炎", "胃肠炎" ]],
    ["牛羊病：代谢与营养疾病", ["酮病", "乳热症", "低镁血症", "骨软症", "佝偻病" ]],
    ["牛羊病：繁殖与乳房疾病", ["难产", "胎衣不下", "乳房炎", "奶牛", "羔羊", "犊牛" ]],
    ["牛羊病：饲养管理与综合防控", ["奶牛场", "牛场", "羊场", "放牧", "反刍动物", "饲养管理" ]],
    ["牛羊病：综合与未细分", []],
  ],
  "犬猫病": [
    ["犬猫病：传染病", ["犬瘟热", "犬细小", "狂犬病", "猫瘟", "猫传染性腹膜炎", "猫白血病", "猫杯状病毒" ]],
    ["犬猫病：寄生虫与皮肤病", ["蠕形螨", "疥螨", "跳蚤", "蜱", "犬皮肤", "猫皮肤" ]],
    ["犬猫病：消化与呼吸疾病", ["犬肠炎", "猫肠炎", "支气管炎", "肺炎", "呕吐", "腹泻" ]],
    ["犬猫病：心肾与内分泌疾病", ["心脏病", "肾衰竭", "肾病", "糖尿病", "甲状腺", "泌尿" ]],
    ["犬猫病：外科与繁殖疾病", ["骨折", "缝合", "子宫蓄脓", "难产", "去势", "绝育" ]],
    ["犬猫病：饲养管理与综合防控", ["宠物", "犬舍", "猫舍", "免疫接种", "驱虫", "营养" ]],
    ["犬猫病：综合与未细分", []],
  ],
  "其他动物病": [
    ["其他动物病：马与兔疾病", ["马属", "马传染性", "兔瘟", "兔球虫", "家兔" ]],
    ["其他动物病：水生动物疾病", ["水生动物", "鱼类", "鱼病", "虾", "鳖", "水产" ]],
    ["其他动物病：特种与实验动物疾病", ["骆驼", "鹿", "狐", "貂", "蜂", "实验动物" ]],
    ["其他动物病：综合与未细分", []],
  ],
  "综合病例题": [["综合病例：跨学科病例整合", []]],
};

let syllabusPoints;
let manifest;
function loadManifest() {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  syllabusPoints = Object.fromEntries(
    manifest.syllabus.modules.map((module) => [module.name, module.knowledgePoints]),
  );
}
loadManifest();

const modules = subjects.map((name, moduleIndex) => {
  const sections = Object.entries(spec)
    .filter(([section]) => {
      const syllabusModule = manifestSyllabusModule(section);
      return syllabusModule === name;
    })
    .map(([sectionName, points], sectionIndex) => ({
      name: sectionName,
      order: sectionIndex + 1,
      knowledgePoints: points.map(([pointName]) => ({
        code: `${moduleIndex + 1}-${sectionIndex + 1}-${points.findIndex((x) => x[0] === pointName) + 1}`,
        name: pointName,
        order: points.findIndex((x) => x[0] === pointName) + 1,
        scope: `题干、选项或解析主要考查${pointName.replace(/^[^：]+：/, "")}相关知识。`,
      })),
    }));
  return { name, order: moduleIndex + 1, sections };
});

function manifestSyllabusModule(section) {
  for (const [module, knowledgePoints] of Object.entries(syllabusPoints))
    if (knowledgePoints.includes(section)) return module;
  throw new Error(`未找到大纲科目映射：${section}`);
}

function atomicWrite(file, content) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content, "utf8");
  fs.renameSync(temporary, file);
}

async function captureRuntimeChapters() {
  const savedTaxonomy = manifest.taxonomy;
  delete manifest.taxonomy;
  atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  try {
    const loaderUrl = new URL(`../server/question-banks/loader.js?taxonomy-audit=${Date.now()}`, import.meta.url);
    const { bundledQuestions } = await import(loaderUrl.href);
    return new Map(bundledQuestions().map((question) => [question.id, question.chapter]));
  } finally {
    if (savedTaxonomy === undefined) delete manifest.taxonomy;
    else manifest.taxonomy = savedTaxonomy;
    atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

function listJson(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const current = path.join(directory, entry.name);
    return entry.isDirectory()
      ? listJson(current)
      : entry.name.endsWith(".json") ? [current] : [];
  });
}

function classify(text, leaves) {
  let winner = leaves[leaves.length - 1];
  let winningScore = 0;
  for (const [name, terms] of leaves.slice(0, -1)) {
    const score = terms.reduce((total, term) => {
      const matches = text.split(term.toLowerCase()).length - 1;
      return total + Math.min(matches, 3) * Math.max(1, term.length);
    }, 0);
    if (score > winningScore) {
      winner = [name, terms];
      winningScore = score;
    }
  }
  return { name: winner[0], score: winningScore, fallback: winningScore === 0 };
}

const taxonomy = { schemaVersion: 1, modules };
const taxonomyNames = new Set();
for (const module of modules) {
  for (const section of module.sections) {
    for (const point of section.knowledgePoints) {
      if (taxonomyNames.has(point.name)) throw new Error(`三级分类名称重复：${point.name}`);
      taxonomyNames.add(point.name);
    }
  }
}

const counts = new Map();
const fallbackCounts = new Map();
const fallbackExamples = new Map();
const runtimeChapterById = await captureRuntimeChapters();
let total = 0;
const files = listJson(questionDir).sort();
const apply = process.argv.includes("--apply");
for (const file of files) {
  const questions = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(questions)) throw new Error(`题目文件顶层必须是数组：${file}`);
  for (const question of questions) {
    const runtimeChapter = runtimeChapterById.get(question.id) || question.chapter;
    let sectionName = question.knowledgeSection || question.knowledgePoint;
    if (!question.id || !subjects.includes(runtimeChapter) || !spec[sectionName]) {
      throw new Error(`题目分类字段不在当前目录中：${question.id || file} / ${runtimeChapter} / ${sectionName}`);
    }
    if (manifestSyllabusModule(sectionName) !== runtimeChapter) {
      sectionName = syllabusPoints[runtimeChapter].find((point) => /综合题|综合病例题/.test(point));
      if (!sectionName) throw new Error(`找不到运行科目的综合分类：${question.id} / ${runtimeChapter}`);
    }
    const text = [
      question.question,
      question.analysis,
      question.sharedStem,
      ...Object.values(question.options || {}),
      ...(question.tags || []),
      question.knowledgeSection || question.knowledgePoint,
    ].join(" ").toLowerCase();
    const moduleSections = Object.keys(spec).filter((section) =>
      manifestSyllabusModule(section) === runtimeChapter,
    );
    const isBroadSection = ["基础综合题", "预防综合题", "临床综合题"].includes(sectionName);
    if (isBroadSection) {
      const candidates = moduleSections.filter((section) => !["基础综合题", "预防综合题", "临床综合题"].includes(section));
      const routed = candidates
        .map((section) => ({ section, score: classify(text, spec[section]).score }))
        .sort((a, b) => b.score - a.score)[0];
      if (routed?.score >= 4) sectionName = routed.section;
    }
    const leaves = spec[sectionName];
    const result = classify(text, leaves);
    question.chapter = runtimeChapter;
    question.knowledgeSection = sectionName;
    question.knowledgePoint = result.name;
    const key = `${runtimeChapter} / ${sectionName} / ${result.name}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    if (result.fallback) {
      fallbackCounts.set(key, (fallbackCounts.get(key) || 0) + 1);
      const examples = fallbackExamples.get(key) || [];
      if (examples.length < 8) examples.push(question.question);
      fallbackExamples.set(key, examples);
    }
    total += 1;
  }
  if (apply) atomicWrite(file, `${JSON.stringify(questions, null, 2)}\n`);
}

if (apply) {
  const questionCounts = new Map();
  for (const [key, count] of counts) questionCounts.set(key, count);
  for (const module of taxonomy.modules) {
    for (const section of module.sections) {
      for (const point of section.knowledgePoints) {
        point.questionCount = questionCounts.get(`${module.name} / ${section.name} / ${point.name}`) || 0;
      }
    }
  }
  manifest.taxonomy = taxonomy;
  atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const report = {
  schemaVersion: 1,
  certificateId: "veterinary-practitioner",
  method: "现有模块与学科标签保留；按题干、解析、选项和来源章节关键词归入三级考点；未命中明确词项的题目进入对应综合兜底项。",
  total,
  files: files.length,
  fallbackQuestionCount: [...fallbackCounts.values()].reduce((sum, count) => sum + count, 0),
  fallback: Object.fromEntries(fallbackCounts),
  fallbackExamples: Object.fromEntries(fallbackExamples),
  distribution: Object.fromEntries(counts),
};
if (apply) atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const summary = {
  mode: apply ? "applied" : "dry-run",
  total,
  files: files.length,
  moduleCount: modules.length,
  sectionCount: modules.reduce((sum, module) => sum + module.sections.length, 0),
  pointCount: taxonomyNames.size,
  fallbackQuestionCount: report.fallbackQuestionCount,
  fallback: report.fallback,
  reportPath: apply ? reportPath : undefined,
  taxonomy: modules.map((module) => ({
    name: module.name,
    sections: module.sections.map((section) => ({ name: section.name, points: section.knowledgePoints.length })),
  })),
};
if (process.argv.includes("--details")) {
  summary.fallbackExamples = report.fallbackExamples;
  summary.distribution = report.distribution;
}
console.log(JSON.stringify(summary, null, 2));
