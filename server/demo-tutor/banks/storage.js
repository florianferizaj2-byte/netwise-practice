import { E, K, T, question as Q, pack } from "../authoring.js";
const W = (text, type, title, reason, hint) => [
  text,
  type,
  title,
  reason,
  hint,
];
const own = (id) => ({ title: "考匠已审核课程 · 存储系统", path: id });
function capacityQ(id, addressBits, wordBits) {
  const units = 2 ** addressBits,
    bytes = (units * wordBits) / 8;
  return Q(
    id,
    `存储器有${addressBits}根地址线，每个可寻址单元存${wordBits}位。所有地址都使用时，总容量是多少字节？`,
    bytes + "字节",
    `共有2^${addressBits}=${units}个单元，每单元${wordBits / 8}字节，总计${bytes}字节。`,
    [
      W(
        units * wordBits + "字节",
        "capacity-bits-as-bytes",
        "把位数直接写成字节数",
        `总位数是${units * wordBits}位，需要除8才是字节。`,
        "1字节=8位，先统一单位。",
      ),
      W(
        (addressBits * wordBits) / 8 + "字节",
        "capacity-lines-as-units",
        "把地址线数当成单元数",
        `${addressBits}根二进制地址线能区分2^${addressBits}种地址，不是${addressBits}种。`,
        "地址组合数是2的地址位数次方。",
      ),
      W(
        bytes / 2 + "字节",
        "capacity-address-sign",
        "把地址最高位误当符号位",
        "地址线所有位都参与寻址，不需要像有符号整数那样保留最高位作符号。",
        "容量计算使用全部地址组合。",
      ),
    ],
  );
}
function raidQ(id, level, n, size) {
  const methods = { 5: (n - 1) * size, 6: (n - 2) * size, 10: (n * size) / 2 };
  const right = methods[level];
  return Q(
    id,
    `${n}块等容量${size}TB磁盘组成RAID ${level}。${level === 10 ? "按两盘镜像组组织，" : ""}忽略格式化、元数据和备用盘，可用容量是多少？`,
    right + "TB",
    `RAID ${level}可用容量=${level === 10 ? "N×S/2" : level === 5 ? "(N−1)×S" : "(N−2)×S"}=${right}TB。校验空间或镜像副本不能同时计为用户数据。`,
    [
      W(
        n * size + "TB",
        "raid-raw-capacity",
        "把原始总容量当成可用容量",
        `原始${n * size}TB包含冗余数据，实际用户可用仅${right}TB。`,
        "先扣除冗余，再乘单盘容量。",
      ),
      ...[5, 6, 10]
        .filter((l) => l !== level)
        .map((l) =>
          W(
            methods[l] + "TB",
            "raid-capacity-as-" + l,
            `套用了RAID ${l}的容量公式`,
            `此值套用了RAID ${l}表达式，题目指定RAID ${level}。${l === 10 && n % 2 ? "两盘镜像组模型还需要偶数块盘，当前盘数也不满足该组织条件。" : ""}`,
            "先确认阵列级别及组织方式。",
          ),
        ),
    ],
  );
}
export const memoryRaid = pack(
  "network-engineer:01.03.02",
  "内存、磁盘与RAID",
  [
    {
      id: "storage-capacity",
      title: "容量与编址单位",
      foundation:
        "地址用于区分单元。一个地址究竟对应字节还是更宽的字，必须看题设，不能只看到地址线就默认字节。",
      takeaway:
        "容量=2^地址位数×每单元位数；位换字节除8。按字节寻址时每地址才恰好对应1字节。",
      cards: [
        E("storage-capacity-explain", "先算地址数量，再算每个地址的容量", [
          "例：11根地址线区分2048个地址，每地址32位，容量2048×4=8192字节。",
          "题目若给“1024个单元、每单元8位”，直接1024×8=8192位=1024字节，不再把1024当地址线数求幂。",
        ]),
      ],
      questions: [
        capacityQ("storage-capacity-check", 12, 8),
        capacityQ("storage-capacity-v1", 10, 16),
        capacityQ("storage-capacity-v2", 8, 32),
      ],
    },
    {
      id: "storage-dram",
      title: "DRAM、SRAM与刷新",
      foundation:
        "本段讨论常规易失性DRAM和SRAM。名字里的“静态”描述保持状态的电路方式，不表示断电后永久保存。",
      takeaway:
        "DRAM电容存储需刷新，通常密度高成本低；SRAM无需DRAM式刷新，通常更快更贵；两者常规实现都易失。",
      cards: [
        T("storage-dram-table", "两种存储芯片", [
          ["DRAM", "电容存储，需周期刷新，常用于主存"],
          ["SRAM", "锁存电路保持，通电时不需DRAM式刷新，常用于Cache"],
        ]),
        E("storage-dram-explain", "刷新与断电保存是两件事", [
          "DRAM电荷会泄漏，因此需要周期刷新。SRAM通电时依靠电路保持状态，通常延迟更低，但面积和单位容量成本较高。",
          "两者在常规实现中断电都会丢失内容。要长期保存数据，使用持久化介质或另行设计掉电保护。",
        ]),
      ],
      questions: [
        Q(
          "storage-dram-check",
          "常规DRAM用作大容量主存，为什么必须周期刷新？",
          "电容电荷会泄漏，需要恢复存储状态",
          "DRAM用电容表示位，电荷随时间泄漏，刷新用于保持信息。",
          [
            W(
              "刷新是为了让数据断电后永久保存",
              "dram-refresh-persistent",
              "把刷新误当非易失机制",
              "刷新依赖供电，不能使DRAM变成永久介质。",
              "分清通电保持与断电保留。",
            ),
            W(
              "每次刷新都必须把全部数据写入磁盘",
              "dram-refresh-disk",
              "把芯片刷新当成磁盘备份",
              "刷新在存储器内部保持电荷，不是给全部内存做磁盘副本。",
              "刷新是芯片级保持机制。",
            ),
            W(
              "SRAM也必须用完全相同的电容刷新周期",
              "dram-sram-refresh",
              "混淆了SRAM保持电路",
              "常规SRAM使用锁存结构，不需要DRAM式周期刷新。",
              "比较两类存储单元的结构。",
            ),
          ],
        ),
        Q(
          "storage-dram-v1",
          "没有电池或掉电保护的常规DRAM与SRAM，断电后哪项正确？",
          "两者都不能保证保留原数据",
          "常规DRAM与SRAM均为易失性存储。SRAM的静态不代表非易失。",
          [
            W(
              "SRAM永久保存，DRAM丢失",
              "sram-static-persistent",
              "把静态当成永久保存",
              "静态指通电保持电路，无供电不能保证保持状态。",
              "判断是否易失，不按名字猜。",
            ),
            W(
              "DRAM保存，SRAM丢失，因为DRAM有刷新",
              "dram-refresh-poweroff",
              "断电后刷新无法继续",
              "刷新不能在失去供电后仍维护数据。",
              "刷新依赖通电。",
            ),
            W(
              "是否丢失只取决于容量，大容量RAM一定非易失",
              "ram-capacity-persistent",
              "把容量当保持机制",
              "容量大小不决定易失性，普通DRAM与SRAM都依赖供电。",
              "看存储单元机制及掉电保护。",
            ),
          ],
        ),
        Q(
          "storage-dram-v2",
          "与常规DRAM相比，SRAM常被用来实现CPU Cache，通常因为哪项特性？",
          "访问延迟较低，但密度与成本存在取舍",
          "SRAM通常更快，但每位电路更复杂，密度较低、成本较高。",
          [
            W(
              "SRAM一定比DRAM容量更大且更便宜",
              "sram-cost-density",
              "把速度优势等同于所有指标优势",
              "速度、密度和成本需要取舍，不能同时一概认为更大更便宜。",
              "分别比较速度、密度和成本。",
            ),
            W(
              "SRAM无需供电，适合掉电保存",
              "sram-no-power",
              "忽略了易失性与供电条件",
              "常规SRAM需供电维持状态。",
              "无需周期刷新不等于无需电源。",
            ),
            W(
              "DRAM不能存任何二进制数据",
              "dram-cannot-store",
              "误解了两者共同的存储能力",
              "DRAM和SRAM都能存二进制数据，区别在保持机制和性能。",
              "区别功能与实现方式。",
            ),
          ],
        ),
      ],
    },
    {
      id: "storage-raid-capacity",
      title: "RAID可用容量",
      foundation:
        "本课所有磁盘等容量、无额外热备盘。RAID冗余是副本或校验信息，不能作为额外的用户数据空间。",
      takeaway:
        "等容量盘：RAID5约(N−1)S，RAID6约(N−2)S，两盘镜像组RAID10约NS/2。",
      cards: [
        T("storage-raid-table", "先辨组织方式", [
          ["RAID5", "分布式单校验，约一盘容量用于冗余，容忍任意一盘故障"],
          ["RAID6", "双校验，约两盘容量用于冗余，容忍任意两盘故障"],
          ["RAID10", "先镜像后条带，两盘镜像组可用约一半"],
        ]),
        E("storage-raid-capacity-explain", "公式针对明确条件", [
          "例：8块1TB盘做RAID5约7TB可用；做RAID6约6TB；做两盘镜像组RAID10约4TB。",
          "实际容量还受格式化、元数据、盘容量差异、热备盘和实现限制影响。计算题按题目明确的简化条件计算。",
        ]),
      ],
      questions: [
        raidQ("storage-raid-capacity-check", 5, 5, 2),
        raidQ("storage-raid-capacity-v1", 6, 6, 2),
        raidQ("storage-raid-capacity-v2", 10, 6, 2),
      ],
    },
    {
      id: "storage-raid-faults",
      title: "故障位置与备份边界",
      foundation:
        "RAID10能否承受多盘故障，不只看坏了几盘，还要看每个镜像组是否至少保留一个有效副本。",
      takeaway:
        "RAID10同一镜像组两盘都坏会失去该组数据；不同组各坏一盘仍可工作。RAID冗余不能替代独立备份。",
      cards: [
        E("storage-raid-faults-explain", "按镜像组逐个检查", [
          "设镜像组(A1,A2)、(B1,B2)。A1与B1故障时，A2、B2仍各保留一个副本，阵列可继续访问。A1与A2都故障时，A组没有副本，不能保证数据完整。",
          "误删或勒索加密通常会同步影响在线阵列中的数据。冗余解决成员盘失效问题，历史恢复、离线副本与站点灾难需要另行备份设计。",
        ]),
      ],
      questions: [
        Q(
          "storage-raid-faults-check",
          "RAID10镜像组(A1,A2)、(B1,B2)、(C1,C2)。只有A1与C1故障，其他盘健康，哪项正确？",
          "每个镜像组仍有副本，阵列可继续访问",
          "A2、B1/B2、C2保留了各镜像组的数据。",
          [
            W(
              "一定不可用，因为坏了两盘",
              "raid10-count-only",
              "只数故障盘，没检查镜像组",
              "两盘分属不同组，各组仍有副本。",
              "检查每组是否至少一盘存活。",
            ),
            W(
              "由此可证明任意两盘故障都安全",
              "raid10-any-two",
              "把一次安全组合当任意保证",
              "若A1和A2同时坏，A组副本全部丢失。",
              "位置决定组合是否可容忍。",
            ),
            W(
              "只有坏在同一组才会安全",
              "raid10-pair-reverse",
              "把镜像组规则弄反",
              "同组两副本都坏恰好是不安全的情况。",
              "保护来自同组另一副本仍存活。",
            ),
          ],
        ),
        Q(
          "storage-raid-faults-v1",
          "同样的RAID10中，A1与A2同时故障，其他盘健康，应判断为什么？",
          "A组全部副本丢失，不能保证阵列数据完整",
          "条带跨镜像组使用，A组副本全部失效会失去该组数据。",
          [
            W(
              "安全，因为其他四块盘总容量足够",
              "raid10-capacity-as-copy",
              "用容量代替数据副本",
              "其他组不是A组的镜像，空余容量不会自动还原A组数据。",
              "找具体数据副本在哪里。",
            ),
            W(
              "任何RAID10都能容忍任意两盘故障",
              "raid10-universal-two",
              "误把RAID6的任意双盘能力套过来",
              "RAID10多盘容错取决于镜像组位置，不是任意两盘都能承受。",
              "阵列级别和镜像分组一起检查。",
            ),
            W(
              "只会失去冗余校验，不影响数据",
              "raid10-as-parity",
              "把镜像当成分布式校验",
              "本题是镜像组，A组两份数据副本都丢失。",
              "先看镜像还是校验组织。",
            ),
          ],
        ),
        Q(
          "storage-raid-faults-v2",
          "在线RAID6阵列中的文件被用户误删。没有快照或备份，能否仅靠双校验保证恢复删除前版本？",
          "不能，需独立的历史保护或备份机制",
          "RAID校验用于成员盘失效的重建，不会自动保存每次逻辑修改的历史版本。",
          [
            W(
              "能，RAID6相当于两份离线备份",
              "raid-as-backup",
              "把校验冗余当离线历史副本",
              "两份校验不是两份离线历史文件；误删是逻辑修改。",
              "区分成员盘容错与历史版本恢复。",
            ),
            W(
              "能，拔掉任意两块盘就会还原旧文件",
              "raid-unplug-restore",
              "用硬件故障触发不成立的历史恢复",
              "重建仍针对当前逻辑数据，不是回到删除前状态。",
              "不能把重建当版本回滚。",
            ),
            W(
              "RAID提供加密认证，所以删不掉文件",
              "raid-as-security",
              "把阵列组织当访问控制",
              "RAID本身不代替权限、认证或防误删策略。",
              "把可用性、权限和备份分开设计。",
            ),
          ],
        ),
      ],
    },
  ],
  [
    own("network-engineer:01.03.02"),
    {
      title: "IBM · RAID级别与容量",
      url: "https://www.ibm.com/docs/en/power9/0009-ESS?topic=da-raid-level-summary",
    },
    {
      title: "IBM · RAID10镜像组故障条件",
      url: "https://www.redbooks.ibm.com/redbooks/pdfs/sg248501.pdf",
    },
  ],
  "219ae083c82ad9b28b4c",
);

export const hierarchy = pack(
  "network-engineer:01.03.03",
  "存储介质性能比较",
  [
    {
      id: "hierarchy-tradeoffs",
      title: "速度、容量与单位成本",
      foundation:
        "以下讨论常见通用计算机的典型存储层次，是设计取舍，不是对任意设备型号性能作绝对排名。",
      takeaway:
        "典型层次为寄存器、Cache、主存、磁盘；靠近CPU通常更快更小、单位容量成本更高。",
      cards: [
        T("hierarchy-table", "建立四层的典型印象", [
          ["寄存器", "CPU直接运算使用，容量很小、延迟低"],
          ["Cache", "保留块副本，比主存通常更快更小"],
          ["主存", "运行时工作空间，通常比磁盘快"],
          ["SSD/HDD", "较大持久存储，访问延迟通常高于主存"],
        ]),
        E("hierarchy-tradeoffs-explain", "一项更快不表示所有指标更好", [
          "典型层次用小而快的存储承接热点、大而便宜的存储承接大量数据。单位容量成本与总采购价格不是同一个指标。",
          "具体性能还受型号、访问模式、并发、缓存命中和带宽限制影响，不用简单层次替代实际测量。",
        ]),
      ],
      questions: [
        Q(
          "hierarchy-tradeoffs-check",
          "常见存储层次中，按典型访问延迟从低到高排列，哪项合理？",
          "寄存器 → Cache → 主存 → 磁盘",
          "典型层次中越靠近CPU，访问延迟越低。",
          [
            W(
              "磁盘 → 主存 → Cache → 寄存器",
              "hierarchy-reverse",
              "速度方向反了",
              "这是把典型延迟层次颠倒了。",
              "先从CPU直接运算使用的寄存器开始。",
            ),
            W(
              "Cache一定比主存慢，因为它更小",
              "hierarchy-size-speed",
              "把容量小等同于慢",
              "Cache小是面积和成本取舍，通常比主存低延迟。",
              "速度与容量分别判断。",
            ),
            W(
              "四者延迟总是完全相同",
              "hierarchy-no-latency",
              "忽略了层次存在的性能差异",
              "存储层次正是为了利用不同延迟、容量和成本特征。",
              "分别看每层实现与位置。",
            ),
          ],
        ),
        Q(
          "hierarchy-tradeoffs-v1",
          "同类通用系统中，CPU Cache相对主存通常有什么取舍？",
          "更低延迟、更小容量、较高单位容量成本",
          "更快的芯片结构与靠近CPU的实现受面积成本限制。",
          [
            W(
              "更大容量、更低成本，而且永远更快",
              "hierarchy-all-better",
              "把一个优势扩展成全部优势",
              "低延迟不代表容量与成本也都更优。",
              "把三个指标逐个比较。",
            ),
            W(
              "比主存更慢，所以只是备份",
              "hierarchy-cache-backup",
              "误解了Cache的加速作用",
              "Cache用于减少等待，不是独立历史备份。",
              "从低延迟和热点副本理解Cache。",
            ),
            W(
              "小容量意味着断电也一定保存",
              "hierarchy-size-persistence",
              "容量与持久性没有这个因果关系",
              "常规CPU Cache易失，大小不决定掉电保存能力。",
              "速度、容量与易失性是不同维度。",
            ),
          ],
        ),
        Q(
          "hierarchy-tradeoffs-v2",
          "为什么一般不把全部大容量持久数据都放进CPU寄存器？",
          "寄存器容量和实现成本受限，且不是持久化介质",
          "寄存器面向指令直接访问的小规模操作数，不代替大容量持久存储。",
          [
            W(
              "寄存器速度最慢",
              "hierarchy-register-slow",
              "把寄存器的延迟特征反过来",
              "寄存器典型延迟低，限制在规模、成本和用途。",
              "区分快与能承载任意容量。",
            ),
            W(
              "扩大寄存器到磁盘级容量不会增加任何面积与成本",
              "hierarchy-register-scale",
              "忽略了规模代价",
              "低延迟实现受到芯片面积、端口和成本限制，不能无代价扩大到持久存储规模。",
              "同时评估延迟、容量与实现成本。",
            ),
            W(
              "只要容量大，就不需要掉电保存",
              "hierarchy-capacity-retention",
              "忽略了持久数据的保存条件",
              "持久保存需要介质或保护机制，不由容量大小决定。",
              "先问数据是否需要跨断电保留。",
            ),
          ],
        ),
      ],
    },
    {
      id: "hierarchy-persistent",
      title: "运行空间与长期保存",
      foundation:
        "本段按普通无掉电保护的DRAM主存、SRAM缓存与寄存器，以及正常持久化的SSD/HDD来讨论。",
      takeaway:
        "常规寄存器、Cache和DRAM主存易失；SSD/HDD可持久保存，但需成功写入并保证完整性，仍要备份。",
      cards: [
        E("hierarchy-persistent-explain", "运行中存在不等于已经保存", [
          "只把修改留在RAM中，突然断电后不能保证保留。长期文件应写到持久介质，并按应用需要完成写入同步。",
          "SSD/HDD非易失不等于永不损坏；介质故障、写入未完成、误删仍可造成数据丢失。持久性与备份是不同问题。",
        ]),
      ],
      questions: [
        Q(
          "hierarchy-persistent-check",
          "未保存的编辑内容只在普通DRAM主存中，突然断电且无掉电保护，哪项合理？",
          "不能保证保留，RAM不代替持久保存",
          "常规DRAM需供电保持信息；内容仅在RAM不等于写入磁盘。",
          [
            W(
              "一定完整保留，因为RAM速度快",
              "hierarchy-speed-retention",
              "用速度推出掉电保存",
              "速度不改变易失性。",
              "先判断是否写入持久介质。",
            ),
            W(
              "Cache会自动成为离线备份",
              "hierarchy-cache-history",
              "把缓存副本当持久备份",
              "Cache通常也易失，且不是版本化离线副本。",
              "缓存加速与备份分别考虑。",
            ),
            W(
              "只要内存容量大就不会丢",
              "hierarchy-large-retains",
              "把容量当保存保障",
              "容量大不提供掉电保护。",
              "看保持机制，不看容量数值。",
            ),
          ],
        ),
        Q(
          "hierarchy-persistent-v1",
          "需要跨正常关机长期保存文件，应主要使用哪类介质？",
          "SSD/HDD等持久介质，并完成所需写入",
          "持久介质可以跨掉电保留成功写入的数据。",
          [
            W(
              "CPU寄存器，因为离CPU近",
              "hierarchy-close-retention",
              "把近CPU当非易失",
              "寄存器是易失工作状态。",
              "选择持久介质，不按距离选择。",
            ),
            W(
              "只保存在普通Cache，不落盘",
              "hierarchy-cache-only",
              "遗漏了持久化步骤",
              "常规Cache不能跨失去供电保证保存。",
              "确认写入了持久层。",
            ),
            W(
              "只要程序窗口仍开着，不需要保存",
              "hierarchy-window-save",
              "把程序运行当数据持久化",
              "运行状态可能只在内存，关机后消失。",
              "应用操作成功与保存完成要分清。",
            ),
          ],
        ),
        Q(
          "hierarchy-persistent-v2",
          "文件已成功写入SSD，为什么仍需备份？",
          "非易失不防所有故障、误删或历史修改",
          "持久介质也可能损坏或被错误修改，备份提供独立恢复路径。",
          [
            W(
              "SSD每次掉电都必然清空",
              "hierarchy-ssd-volatile",
              "误把SSD当普通RAM",
              "SSD通常非易失；备份是因为仍有其他损失风险。",
              "非易失与永不丢数据是两回事。",
            ),
            W(
              "有SSD就能恢复任意过去版本",
              "hierarchy-ssd-history",
              "把介质持久性当版本记录",
              "持久介质本身不自动保留所有历史版本。",
              "历史恢复需要快照或备份设计。",
            ),
            W(
              "只要磁盘用了RAID就不需防误删的独立备份",
              "hierarchy-raid-history",
              "把盘容错等同于历史恢复",
              "RAID不自动保留所有误删前版本，独立备份仍有不同的恢复作用。",
              "区分在线容错与历史恢复。",
            ),
          ],
        ),
      ],
    },
    {
      id: "hierarchy-miss",
      title: "缓存未命中不等于磁盘访问",
      foundation:
        "Cache miss是缓存没有对应块；缺页是虚拟内存映射所需页面未驻留或其他页异常，属于不同层次。",
      takeaway:
        "缓存未命中通常查更低层Cache或主存，不必读磁盘；有磁盘后备的非驻留页调入才可能产生磁盘I/O。",
      cards: [
        E("hierarchy-miss-explain", "不要把两种“没找到”合在一起", [
          "CPU L1 Cache未命中，可继续查L2/L3或DRAM。数据若已在主存，不需要为这次未命中读SSD。",
          "合法访问一个有磁盘后备且未驻留的虚拟页，操作系统可能触发调页I/O。缺页也可能按需分配零页等，不是每次都一定读盘。",
        ]),
      ],
      questions: [
        Q(
          "hierarchy-miss-check",
          "CPU缓存没有某数据块，但对应页已在DRAM主存，是否必然需要访问磁盘？",
          "不需要，缓存可从较低层Cache或主存取块",
          "页面已驻留，Cache miss本身不要求磁盘I/O。",
          [
            W(
              "每次Cache miss都必须读盘",
              "cache-miss-disk",
              "把缓存缺失等同于页面不驻留",
              "块未在Cache不表示页未在主存。",
              "分别检查Cache与主存驻留。",
            ),
            W(
              "每次缓存未命中都必须由OS重建页表",
              "cache-miss-pagetable",
              "把缓存块缺失当地址映射失效",
              "页面已驻留且映射有效时，缓存可以取块，不需因为每次miss重建页表。",
              "缓存块位置与虚拟页映射分开。",
            ),
            W(
              "Cache未命中说明对应文件在磁盘上不存在",
              "cache-miss-file",
              "从缓存状态推断文件是否存在",
              "该块未在缓存不能说明文件是否存在，更不能否定主存已驻留的题设。",
              "按层次读取条件，不跳到文件存在性。",
            ),
          ],
        ),
        Q(
          "hierarchy-miss-v1",
          "以下哪项区分正确？",
          "Cache miss由缓存层处理；页不驻留的缺页可能需要操作系统调页",
          "两者处于不同层次，缓存未命中通常不直接触发磁盘调页。",
          [
            W(
              "Cache miss与缺页是同一个事件",
              "cache-page-same",
              "把两个层次合并了",
              "缓存管理和虚拟页驻留管理不同。",
              "区分缓存块和虚拟页。",
            ),
            W(
              "所有缺页都必定从磁盘读入",
              "page-fault-always-disk",
              "忽略了缺页的多种原因",
              "按需零页等可不读磁盘，权限异常也不能当普通调入。",
              "根据页的后备来源与异常原因判断。",
            ),
            W(
              "L1未命中就证明所有Cache都未命中",
              "l1-all-cache-miss",
              "从一级结果推出全部层次结果",
              "L2/L3仍可能持有该块。",
              "逐级检查，不跳过下一级。",
            ),
          ],
        ),
        Q(
          "hierarchy-miss-v2",
          "合法访问一个尚未驻留、内容保存在磁盘后备文件中的虚拟页，通常需要什么？",
          "操作系统调入所需页面，可能产生磁盘I/O",
          "题设明确非驻留且有磁盘后备，需取回对应内容后继续访问。",
          [
            W(
              "只清空TLB就能恢复原页内容",
              "page-tlb-recover",
              "映射缓存不包含页面完整内容",
              "TLB保存地址转换信息，清空它不能还原磁盘后备页面的数据。",
              "分清地址映射与数据内容。",
            ),
            W(
              "调页后原访问的页内偏移必须随机改变",
              "page-offset-changed",
              "调页不应改变访问的页内位置",
              "页内偏移指定原操作数在页中的位置，装入页面不应把它随机改到另一个内容。",
              "页面映射改变不等于页内偏移改变。",
            ),
            W(
              "无需调入，直接把磁盘块编号当普通DRAM地址访问",
              "page-disk-as-ram",
              "把后备磁盘地址当主存地址",
              "普通CPU访存不能用磁盘块编号代替DRAM页映射，需先取得所需内容。",
              "完成调页和有效映射后重试。",
            ),
          ],
        ),
      ],
    },
  ],
  [
    own("network-engineer:01.03.03"),
    {
      title: "Cornell CS3410 · Cache与主存层次",
      url: "https://www.cs.cornell.edu/courses/cs3410/2026sp/notes/caches.html",
    },
  ],
  "ff76910287947d101608",
);
