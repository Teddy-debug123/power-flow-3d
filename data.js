/* POWER//FLOW — 计算机供电拓扑数据
 * 说明：数值为现代桌面平台常见量级，用于原理演示，不代表某一具体型号。
 */
window.POWER_DATA = (() => {
  const categories = {
    grid:      { name: '市电输入与保护', en: 'AC INPUT & PROTECTION', color: '#ff9e64', order: 1 },
    primary:   { name: 'PSU 一次侧',     en: 'PRIMARY SIDE',            color: '#ff6b6b', order: 2 },
    secondary: { name: 'PSU 二次侧与输出', en: 'SECONDARY & OUTPUT',     color: '#ffd166', order: 3 },
    delivery:  { name: '主板供电与接口', en: 'DELIVERY & CONNECTORS',    color: '#7dd3fc', order: 4 },
    vrm:       { name: 'VRM 电压调节',   en: 'VOLTAGE REGULATION',       color: '#5ef2d6', order: 5 },
    compute:   { name: '计算与负载',     en: 'COMPUTE & LOADS',          color: '#c4a7ff', order: 6 },
    platform:  { name: '平台辅助电路',   en: 'PLATFORM & AUX',           color: '#a8b8c8', order: 7 }
  };

  const stages = [
    {
      id: 0, code: 'S0', short: '待机', name: '5VSB 待机', en: 'STANDBY',
      duration: 0, power: 1.8, temp: 27, fan: 0, debug: '--',
      caption: '市电已接入，辅助电源持续输出 5VSB；主轨与计算单元全部关闭。',
      targets: { v12: 0, v5: 0, v33: 0, vcore: 0, vsoc: 0, vddr: 0 }
    },
    {
      id: 1, code: 'S1', short: '触发', name: 'PS_ON# 唤醒', en: 'PS_ON ASSERT',
      duration: 2.2, power: 26, temp: 28, fan: 620, debug: '00',
      caption: '按下电源键，PS_ON# 被拉低。PFC 母线升压、LLC 软启动，浪涌被抑制。',
      targets: { v12: 2.1, v5: 1.2, v33: 0.6, vcore: 0, vsoc: 0, vddr: 0 }
    },
    {
      id: 2, code: 'S2', short: '主轨', name: '主轨建立 / PWR_OK', en: 'RAILS UP',
      duration: 2.4, power: 68, temp: 31, fan: 980, debug: '15',
      caption: '+12V、+5V、+3.3V 完成软启动；PWR_OK 置高，主板获准上电。',
      targets: { v12: 12.04, v5: 5.02, v33: 3.31, vcore: 0, vsoc: 0, vddr: 0 }
    },
    {
      id: 3, code: 'S3', short: 'VRM', name: 'VRM 依次启机', en: 'VRM SEQUENCE',
      duration: 2.3, power: 112, temp: 35, fan: 1260, debug: '3A',
      caption: 'VRM 控制器按序开启 8 相 DrMOS，VCORE 爬升，CPU 复位释放。',
      targets: { v12: 12.03, v5: 5.02, v33: 3.30, vcore: 1.18, vsoc: 1.05, vddr: 1.10 }
    },
    {
      id: 4, code: 'S4', short: '自检', name: '训练与 POST', en: 'TRAIN & POST',
      duration: 2.8, power: 168, temp: 40, fan: 1480, debug: 'A0',
      caption: 'DDR5 链路训练、PCIe 5.0 协商、NVMe 枚举，显卡与显示输出初始化。',
      targets: { v12: 12.02, v5: 5.01, v33: 3.30, vcore: 1.21, vsoc: 1.06, vddr: 1.11 }
    },
    {
      id: 5, code: 'S5', short: '在线', name: '系统在线', en: 'SYSTEM ONLINE',
      duration: 2.6, power: 86, temp: 44, fan: 1120, debug: 'AA',
      caption: 'POST 通过，操作系统接管。供电进入动态调节，风扇曲线与遥测上线。',
      targets: { v12: 12.05, v5: 5.02, v33: 3.31, vcore: 1.16, vsoc: 1.05, vddr: 1.10 }
    }
  ];

  const components = [
    /* ── 01 市电输入与保护 ───────────────────────────── */
    {
      id: 'ac-mains', cat: 'grid', name: '市电输入', en: 'AC MAINS', code: 'AC-01',
      tag: 'AC 230V', rail: 'AC', voltage: '230 V / 50 Hz', zone: '机箱外部',
      role: '整套供电链的能量起点。',
      detail: '墙插提供的 220–240V 交流电先进入电源。交流电没有正负极性，但存在火线、零线与保护地；保护地只承担安全泄放，不参与功率传输。',
      specs: [['输入范围', '100–240 V AC'], ['频率', '50 / 60 Hz'], ['典型电流', '6–10 A @ 230 V'], ['安全等级', 'I 类 · 接地']],
      related: ['ac-inlet', 'emi', 'bridge'], stage: 0
    },
    {
      id: 'ac-inlet', cat: 'grid', name: '交流输入接口', en: 'IEC C14 / C20 INLET', code: 'AC-02',
      tag: 'IEC', rail: 'AC', voltage: '250 VAC / 10–16 A', zone: 'PSU 后部',
      role: '可拆卸市电与电源本体的机械/电气入口。',
      detail: '常见 C14（10A）或 C20（16A）接口，内部同时连接火线、零线和保护地。高端电源会在入口处加入防尘、防误触及屏蔽结构，降低接触电阻与辐射。',
      specs: [['标准', 'IEC 60320'], ['触点', 'L / N / PE'], ['耐压', '≥ 1.5 kV'], ['插拔寿命', '≥ 5,000 次']],
      related: ['ac-mains', 'fuse', 'mov'], stage: 0
    },
    {
      id: 'fuse', cat: 'grid', name: '保险丝', en: 'FUSE', code: 'AC-03',
      tag: 'SAFETY', rail: 'AC', voltage: '250 VAC', zone: 'PSU 一次侧入口',
      role: '最后一道过流切断防线。',
      detail: '通常为延时型（T 型）玻璃或陶瓷保险丝，允许开机浪涌通过，但在短路或严重过载时熔断。它保护的首先不是电源本身，而是上游线路与人身安全。',
      specs: [['类型', 'T 型慢熔'], ['额定值', '6.3–12 A'], ['分断能力', '≥ 100 A'], ['位置', 'L 线串联']],
      related: ['ac-inlet', 'mov', 'ntc-relay'], stage: 0
    },
    {
      id: 'mov', cat: 'grid', name: '压敏电阻', en: 'MOV / VARISTOR', code: 'AC-04',
      tag: 'CLAMP', rail: 'AC', voltage: '275 VAC', zone: 'PSU 一次侧入口',
      role: '吸收雷击与电网浪涌，钳位瞬态过压。',
      detail: '金属氧化物压敏电阻在正常电压下呈高阻，遇到千伏级浪涌时迅速导通，把能量泄放到地。它不能替代保险丝，浪涌后性能会退化，因此常与温度保护或保险丝配合。',
      specs: [['压敏电压', '≈ 390–430 V'], ['连续电压', '275 VAC'], ['响应时间', '< 25 ns'], ['能量吸收', '数十至数百焦耳']],
      related: ['fuse', 'emi', 'bridge'], stage: 0
    },
    {
      id: 'ntc-relay', cat: 'grid', name: 'NTC 与继电器', en: 'NTC + RELAY', code: 'AC-05',
      tag: 'INRUSH', rail: 'AC', voltage: '230 VAC', zone: 'PSU 一次侧入口',
      role: '限制开机浪涌，随后旁路以降低损耗。',
      detail: '冷态 NTC 电阻较大，可把大电容充电瞬间的浪涌电流限制在安全范围；继电器在母线建立后闭合，把 NTC 短路，避免工作时持续发热。高端方案也会用可控硅或专用浪涌抑制器。',
      specs: [['冷态电阻', '5–20 Ω'], ['稳态电流', '6–12 A'], ['旁路方式', '继电器触点'], ['动作延时', '0.3–1 s']],
      related: ['fuse', 'bridge', 'bulk-cap'], stage: 1
    },
    {
      id: 'emi', cat: 'grid', name: 'EMI 滤波器', en: 'EMI FILTER', code: 'AC-06',
      tag: 'X/Y + CMC', rail: 'AC', voltage: '250 VAC', zone: 'PSU 一次侧入口',
      role: '阻止开关噪声进出电源。',
      detail: '由 X 电容（跨接 L-N，抑制差模）、Y 电容（L/N 对地，抑制共模）和共模电感组成。它既要通过 CISPR 32 / EN 55032 传导发射测试，也要保证漏电流与安规间距。',
      specs: [['X 电容', '0.22–1 µF / X2'], ['Y 电容', '1–4.7 nF / Y1'], ['共模电感', '数 mH'], ['插入损耗', '> 40 dB @ 150 kHz–30 MHz']],
      related: ['ac-inlet', 'bridge', 'pfc-inductor'], stage: 0
    },

    /* ── 02 PSU 一次侧 ───────────────────────────────── */
    {
      id: 'bridge', cat: 'primary', name: '整流桥', en: 'BRIDGE RECTIFIER', code: 'P1-01',
      tag: 'AC → DC', rail: 'HV', voltage: '≈ 325 V DC', zone: 'PSU 一次侧',
      role: '把交流电整流为脉动直流。',
      detail: '四只二极管组成全桥，将 230V 交流整流为约 325V 的脉动直流。整流桥的导通损耗直接进入热设计，因此大功率电源常把桥与 PFC 器件共用散热器。',
      specs: [['拓扑', '全桥 · 4 二极管'], ['反向耐压', '600–800 V'], ['平均电流', '8–15 A'], ['峰值浪涌', '> 200 A']],
      related: ['emi', 'pfc-inductor', 'bulk-cap'], stage: 1
    },
    {
      id: 'pfc-ctrl', cat: 'primary', name: 'PFC 控制器', en: 'PFC CONTROLLER', code: 'P1-02',
      tag: 'CTRL', rail: 'HV', voltage: '12–20 V 供电', zone: 'PSU 一次侧控制板',
      role: '让输入电流跟随输入电压，校正功率因数。',
      detail: '控制器采样输入电压、电感电流与母线电压，用平均电流模式生成 PWM，驱动 PFC MOSFET。目标是把功率因数提升到 0.95 以上，同时稳定 390V 左右的母线，供后续 LLC 使用。',
      specs: [['控制方式', 'CCM / 平均电流'], ['开关频率', '65–250 kHz'], ['母线目标', '390–400 V'], ['保护', 'OVP / OCP / OTP']],
      related: ['pfc-mos', 'pfc-inductor', 'bulk-cap'], stage: 1
    },
    {
      id: 'pfc-mos', cat: 'primary', name: 'PFC 功率 MOSFET', en: 'PFC MOSFET', code: 'P1-03',
      tag: 'Si / SiC', rail: 'HV', voltage: '600–650 V', zone: 'PSU 一次侧散热器',
      role: '高频斩波，把电感储能送入高压母线。',
      detail: '在 PFC 电感电流连续模式下高速开关，承担全部输入功率。低压降、低栅极电荷的超级结 MOSFET 可降低导通与开关损耗；图腾柱 PFC 则使用更多开关管实现更高效率。',
      specs: [['耐压', '600–650 V'], ['导通电阻', '0.1–0.3 Ω'], ['封装', 'TO-247 / TO-220'], ['驱动', '12–18 V']],
      related: ['pfc-ctrl', 'pfc-inductor', 'pfc-diode'], stage: 1
    },
    {
      id: 'pfc-inductor', cat: 'primary', name: 'PFC 升压电感', en: 'PFC BOOST INDUCTOR', code: 'P1-04',
      tag: 'STORAGE', rail: 'HV', voltage: '390 V', zone: 'PSU 一次侧',
      role: '储能、平滑电流，是升压变换的核心磁性元件。',
      detail: 'PFC 电感在 MOSFET 导通时储能，关断时与输入叠加向母线释放能量。磁芯材料、绕线窗口与饱和电流决定效率与体积；它也是电源重量和低频噪声的重要来源。',
      specs: [['电感量', '200–600 µH'], ['饱和电流', '> 10 A'], ['磁芯', '铁氧体 / 粉芯'], ['绕线', '多股漆包线']],
      related: ['pfc-mos', 'pfc-diode', 'bridge'], stage: 1
    },
    {
      id: 'pfc-diode', cat: 'primary', name: 'PFC 升压二极管', en: 'PFC BOOST DIODE', code: 'P1-05',
      tag: 'SiC', rail: 'HV', voltage: '650 V', zone: 'PSU 一次侧散热器',
      role: '只允许能量流向母线，阻断反向电流。',
      detail: '传统方案使用快恢复二极管；高效率电源改用 SiC 肖特基二极管，几乎没有反向恢复损耗。它必须在 MOSFET 关断瞬间承受高 dv/dt 与全部母线电压。',
      specs: [['类型', 'SiC Schottky'], ['耐压', '650 V'], ['平均电流', '8–16 A'], ['反向恢复', '≈ 0']],
      related: ['pfc-mos', 'bulk-cap', 'pfc-inductor'], stage: 1
    },
    {
      id: 'bulk-cap', cat: 'primary', name: '高压大电容', en: 'BULK CAPACITOR', code: 'P1-06',
      tag: 'HOLD-UP', rail: 'HV', voltage: '390–400 V', zone: 'PSU 一次侧',
      role: '稳定母线并提供断电保持时间。',
      detail: '这只 400V 电解电容储存足够能量，让电源在输入掉电后仍能维持输出 16–20ms，满足 ATX 保持时间要求。它也是开机浪涌的主要来源，需要软启动与 NTC 保护。',
      specs: [['容量', '330–1,000 µF'], ['耐压', '400 / 450 V'], ['保持时间', '≥ 16 ms'], ['纹波电流', '数安培']],
      related: ['bridge', 'llc-mos', 'ntc-relay'], stage: 1
    },
    {
      id: 'llc-ctrl', cat: 'primary', name: 'LLC 谐振控制器', en: 'LLC CONTROLLER', code: 'P1-07',
      tag: 'CTRL', rail: 'HV', voltage: '12–20 V 供电', zone: 'PSU 一次侧控制板',
      role: '控制半桥开关频率，稳定输出电压。',
      detail: 'LLC 控制器通过调节半桥开关频率改变谐振腔增益，实现零电压开通（ZVS）与低开关损耗。它同时处理软启动、死区、过流与轻载突发模式。',
      specs: [['拓扑', '半桥 LLC'], ['频率范围', '70–150 kHz'], ['反馈', '光耦 / 隔离'], ['保护', 'OCP / OVP / OTP']],
      related: ['llc-mos', 'resonant', 'transformer'], stage: 1
    },
    {
      id: 'llc-mos', cat: 'primary', name: '一次侧半桥 MOSFET', en: 'PRIMARY HALF-BRIDGE', code: 'P1-08',
      tag: 'ZVS', rail: 'HV', voltage: '600–650 V', zone: 'PSU 一次侧散热器',
      role: '把 390V 母线斩波为高频方波送入谐振腔。',
      detail: '两只 MOSFET 交替导通，配合谐振电感与电容实现软开关。相比硬开关拓扑，LLC 的开关损耗显著更低，是现代高能效 ATX 电源的主流一次侧结构。',
      specs: [['拓扑', '半桥 · 2 管'], ['耐压', '600–650 V'], ['死区', '100–300 ns'], ['效率贡献', 'ZVS 降低开关损耗']],
      related: ['llc-ctrl', 'resonant', 'transformer'], stage: 1
    },
    {
      id: 'resonant', cat: 'primary', name: '谐振电感与电容', en: 'LLC RESONANT TANK', code: 'P1-09',
      tag: 'TANK', rail: 'HV', voltage: '谐振腔', zone: 'PSU 一次侧',
      role: '与变压器励磁电感共同决定 LLC 增益曲线。',
      detail: '谐振电感 Lr、谐振电容 Cr 与变压器励磁电感 Lm 组成谐振网络。通过改变开关频率，让变换器在增益曲线的感性区工作，实现 ZVS 与输出电压调节。',
      specs: [['Lr', '数十 µH'], ['Cr', 'nF 级'], ['谐振频率', '80–120 kHz'], ['工作区', '感性区 · ZVS']],
      related: ['llc-mos', 'transformer', 'llc-ctrl'], stage: 1
    },
    {
      id: 'transformer', cat: 'primary', name: '高频变压器', en: 'HF TRANSFORMER', code: 'P1-10',
      tag: 'ISOLATION', rail: 'HV → LV', voltage: '3 kV 隔离', zone: 'PSU 中部',
      role: '电压变换与电气隔离的核心。',
      detail: '高频变压器把一次侧 390V 方波耦合到二次侧，按匝比降压，同时提供加强绝缘。它让输出地与市电地隔离，是人身安全的关键屏障，也是电源体积和效率的核心。',
      specs: [['拓扑', 'LLC 谐振变压器'], ['开关频率', '80–150 kHz'], ['隔离耐压', '3,000–4,000 VAC'], ['匝比', '约 16:1–20:1']],
      related: ['llc-mos', 'sr-mos', 'resonant'], stage: 1
    },

    /* ── 03 PSU 二次侧与输出 ─────────────────────────── */
    {
      id: 'sr-mos', cat: 'secondary', name: '同步整流 MOSFET', en: 'SYNC RECTIFIER', code: 'P2-01',
      tag: 'SR', rail: '+12V', voltage: '30–80 V', zone: 'PSU 二次侧散热器',
      role: '用低导通电阻 MOSFET 取代二极管整流。',
      detail: '二次侧交流电压需要整流为直流。同步整流用 MOSFET 的沟道代替肖特基二极管，导通压降从 0.4V 降到几十毫伏，大幅降低大电流输出时的损耗。',
      specs: [['耐压', '30–80 V'], ['导通电阻', '1–5 mΩ'], ['拓扑', '全桥 / 中心抽头'], ['驱动', 'SR 控制器']],
      related: ['transformer', 'output-choke', 'output-cap'], stage: 2
    },
    {
      id: 'output-choke', cat: 'secondary', name: '输出滤波电感', en: 'OUTPUT CHOKE', code: 'P2-02',
      tag: 'FILTER', rail: '+12V', voltage: '12 V', zone: 'PSU 二次侧',
      role: '平滑整流后的脉冲电流，抑制纹波。',
      detail: '与输出电容组成 LC 低通滤波器，把高频方波整流后的脉动电流变为平滑直流。现代电源常用环形或封闭式电感，低直流电阻与高饱和电流同样重要。',
      specs: [['电感量', '1–10 µH'], ['饱和电流', '30–80 A'], ['直流电阻', 'mΩ 级'], ['磁芯', '铁粉 / 铁硅铝']],
      related: ['sr-mos', 'output-cap', 'supervisor'], stage: 2
    },
    {
      id: 'output-cap', cat: 'secondary', name: '输出固态电容', en: 'OUTPUT CAPACITOR BANK', code: 'P2-03',
      tag: 'LOW ESR', rail: '+12V', voltage: '16 V', zone: 'PSU 输出端',
      role: '吸收纹波瞬态，维持输出稳定。',
      detail: '多颗低 ESR 固态/电解电容并联，降低等效串联电阻与纹波电压，并应对 CPU/GPU 的毫秒级负载跳变。电容寿命与温度强相关，是电源长期可靠性的关键。',
      specs: [['类型', '固态 / 电解'], ['容量', '数千 µF 等效'], ['ESR', '毫欧级'], ['寿命', '5,000–10,000 h']],
      related: ['output-choke', 'supervisor', 'atx24'], stage: 2
    },
    {
      id: 'opto', cat: 'secondary', name: '光耦反馈', en: 'OPTOCOUPLER', code: 'P2-04',
      tag: 'ISOLATED FB', rail: 'FB', voltage: '3–5 V', zone: '跨越一/二次侧',
      role: '把二次侧误差跨隔离栅送回一次侧。',
      detail: '输出分压与基准比较后驱动光耦 LED，光敏三极管在一次侧镜像出误差信号。这样既能精确稳压，又保持一次侧与二次侧的高压隔离。',
      specs: [['类型', '线性光耦'], ['隔离电压', '3,750–5,000 V'], ['CTR', '50–300%'], ['带宽', '数十 kHz']],
      related: ['supervisor', 'llc-ctrl', 'output-cap'], stage: 2
    },
    {
      id: 'supervisor', cat: 'secondary', name: '电源监控与保护 IC', en: 'SUPERVISOR / PROTECTION', code: 'P2-05',
      tag: 'OCP/OVP', rail: 'AUX', voltage: '3.3–12 V', zone: 'PSU 二次侧控制板',
      role: '监视电压、电流、温度并执行保护。',
      detail: '它负责输出过压/欠压、过流、短路与过温保护，并生成 PWR_OK（PG）信号。保护动作必须足够快，避免故障扩大；同时要避开正常开机与负载跳变造成的误触发。',
      specs: [['监控轨', '+12V / +5V / +3.3V'], ['PWR_OK 延时', '100–500 ms'], ['保护', 'OVP / UVP / OCP / SCP / OTP'], ['接口', 'PS_ON# / PWR_OK']],
      related: ['opto', 'atx24', 'output-cap'], stage: 2
    },
    {
      id: 'standby', cat: 'secondary', name: '5VSB 辅助电源', en: '5V STANDBY RAIL', code: 'P2-06',
      tag: 'ALWAYS ON', rail: '+5VSB', voltage: '5.0 V / 2.5 A', zone: 'PSU 二次侧',
      role: '主电源关闭时仍持续工作的独立反激电源。',
      detail: '只要插着市电，5VSB 就为开机电路、USB 充电、网络唤醒和主板待机逻辑供电。它通常是一套独立的小功率反激变换器，待机功耗可低至 0.1–0.3W。',
      specs: [['拓扑', '反激'], ['输出', '5 V / 2.5–3 A'], ['待机功耗', '< 0.3 W'], ['负载', '开机逻辑 / USB / WoL']],
      related: ['atx24', 'power-button', 'ldo'], stage: 0
    },
    {
      id: 'psu-fan', cat: 'secondary', name: 'PSU 风扇', en: 'PSU FAN', code: 'P2-07',
      tag: 'THERMAL', rail: '+12V', voltage: '12 V / PWM', zone: 'PSU 顶部',
      role: '把一次侧与二次侧热量排出机箱。',
      detail: '现代电源多使用 120/135mm 液压轴承风扇，并由温度曲线控制转速。高负载时风扇加速；低负载时进入停转或极低速模式，以兼顾静音与寿命。',
      specs: [['尺寸', '120 / 135 mm'], ['轴承', 'FDB / 液压'], ['控制', 'PWM 温控'], ['寿命', '50,000–100,000 h']],
      related: ['supervisor', 'output-cap', 'transformer'], stage: 2
    },

    /* ── 04 主板供电与接口 ───────────────────────────── */
    {
      id: 'atx24', cat: 'delivery', name: 'ATX 24-pin 主供电', en: 'ATX 24-PIN', code: 'D-01',
      tag: '24 PIN', rail: '+12V / +5V / +3.3V / 5VSB', voltage: '多轨', zone: '主板右缘 · 图示左缘',
      role: '向主板输送全部低压主轨与待机轨。',
      detail: '24-pin 中包含 +12V、+5V、+3.3V、-12V、+5VSB、PS_ON#、PWR_OK 与大量地线。现代电源的 5V/3.3V 多由 12V 经 DC-DC 生成，因此 12V 引脚数量与接触电阻尤为关键。',
      specs: [['针数', '24 pin'], ['主轨', '+12 / +5 / +3.3 / -12 / +5VSB'], ['单针额定', '6–9 A'], ['信号', 'PS_ON# / PWR_OK']],
      related: ['standby', 'supervisor', 'buck'], stage: 2
    },
    {
      id: 'eps8', cat: 'delivery', name: 'EPS 8-pin CPU 供电', en: 'EPS 8-PIN', code: 'D-02',
      tag: '12V CPU', rail: '+12V', voltage: '12 V / 300–400 W', zone: '主板上缘 · 图示左缘',
      role: '为 CPU VRM 提供专用 12V 输入。',
      detail: 'EPS 8-pin（4+4）专供 CPU VRM，避免与显卡争夺 24-pin 的有限电流。高端主板会提供双 8-pin 接口，以分摊数百瓦 CPU 负载并降低接触电阻。',
      specs: [['针数', '8 pin (4+4)'], ['电压', '12 V'], ['电流', '每针 8–12 A'], ['典型功率', '300–400 W']],
      related: ['vrm-ctrl', 'drmos', 'vrm-choke'], stage: 2
    },
    {
      id: 'hpwr', cat: 'delivery', name: '12V-2x6 显卡供电', en: '12V-2×6 / 12VHPWR', code: 'D-03',
      tag: '600 W', rail: '+12V', voltage: '12 V / 600 W', zone: '显卡尾部',
      role: '为高功耗 GPU 提供大电流 12V。',
      detail: '16-pin 接口包含 12 个供电针与 4 个侧带信号针，最高 600W。12V-2x6 改进了插针与感测针结构，降低接触不良与过热风险；插头必须完全插入并留出线缆弯曲空间。',
      specs: [['针数', '16 (12+4)'], ['最大功率', '600 W'], ['单针电流', '≈ 9.2 A'], ['感测', '4 根 sideband']],
      related: ['gpu-vrm', 'gpu', 'output-cap'], stage: 3
    },
    {
      id: 'sata-power', cat: 'delivery', name: 'SATA / 外设供电', en: 'SATA POWER', code: 'D-04',
      tag: '5V / 12V', rail: '+5V / +12V', voltage: '5 V / 12 V', zone: 'PSU 输出 · 外设',
      role: '为 SSD、机械硬盘、风扇与灯带供电。',
      detail: 'SATA 供电提供 3.3V、5V、12V 三组电压；2.5 英寸 SSD 主要使用 5V，3.5 英寸硬盘同时使用 5V 与 12V。外设线缆应避免过载与劣质转接。',
      specs: [['电压', '+3.3 / +5 / +12 V'], ['单口电流', '1.5–3 A'], ['接口', '15 pin'], ['常见负载', 'SSD / HDD / 风扇']],
      related: ['nvme', 'fan-rgb', 'output-cap'], stage: 3
    },
    {
      id: 'buck', cat: 'delivery', name: '3.3V / 5V DC-DC', en: 'BUCK CONVERTERS', code: 'D-05',
      tag: 'DC-DC', rail: '+3.3V / +5V', voltage: '3.3 V / 5 V', zone: '主板边缘',
      role: '把 12V 降压为 USB、芯片组、M.2 等所需的低压轨。',
      detail: '现代主板大量使用同步 Buck 从 12V 生成 5V、3.3V、1.8V、1.05V 等。相比线性稳压，Buck 效率可达 90% 以上，但会带来开关噪声，需要电感与去耦电容配合。',
      specs: [['拓扑', '同步 Buck'], ['开关频率', '300 kHz–2 MHz'], ['效率', '> 90%'], ['输出', '5 V / 3.3 V / 1.8 V']],
      related: ['atx24', 'ldo', 'nvme'], stage: 2
    },
    {
      id: 'ldo', cat: 'delivery', name: 'LDO 线性稳压器', en: 'LDO REGULATOR', code: 'D-06',
      tag: 'LOW NOISE', rail: '+3.3V', voltage: '3.3 V / 1.8 V', zone: '主板待机区',
      role: '为敏感模拟/待机电路提供低噪声电压。',
      detail: 'LDO 以压差消耗功率换取极低输出噪声与快速瞬态响应，常用于 RTC、时钟、音频与待机逻辑。它效率不高，因此只适合小电流负载。',
      specs: [['类型', '低压差线性'], ['压差', '100–300 mV'], ['噪声', 'µVrms 级'], ['负载', 'RTC / 时钟 / 音频']],
      related: ['standby', 'bios', 'clock'], stage: 0
    },

    /* ── 05 VRM ─────────────────────────────────────── */
    {
      id: 'vrm-ctrl', cat: 'vrm', name: 'VRM 控制器', en: 'VRM CONTROLLER', code: 'V-01',
      tag: 'MULTI-PHASE', rail: '+12V → VCORE', voltage: '0.6–1.4 V', zone: 'CPU 左侧',
      role: '调度多相 Buck，精确调节 CPU 核心电压。',
      detail: '控制器接收 CPU 的 SVID/AVFS 请求，按相序驱动 DrMOS，并通过电流/温度遥测实现动态均流与保护。多相交错还能降低输入/输出纹波。',
      specs: [['相数', '8+2 / 12+2 等'], ['控制', 'SVID / PWM'], ['开关频率', '400–800 kHz'], ['遥测', 'IMON / TMON']],
      related: ['drmos', 'vrm-choke', 'cpu'], stage: 3
    },
    {
      id: 'drmos', cat: 'vrm', name: 'DrMOS 智能功率级', en: 'DrMOS POWER STAGE', code: 'V-02',
      tag: 'POWER STAGE', rail: '+12V → VCORE', voltage: '12 V 输入', zone: 'CPU 左侧',
      role: '把 12V 高频斩波为 CPU 所需的低压大电流。',
      detail: 'DrMOS 把上下桥 MOSFET 与驱动器集成在一个封装中，缩短栅极回路、降低寄生电感。8 相并联可在数百安培负载下分摊电流与热量，并支持快速瞬态响应。',
      specs: [['输入', '12 V'], ['输出', '0.6–1.4 V'], ['单相电流', '60–110 A'], ['集成', 'HS/LS + Driver']],
      related: ['vrm-ctrl', 'vrm-choke', 'vrm-cap'], stage: 3
    },
    {
      id: 'vrm-choke', cat: 'vrm', name: '合金电感', en: 'VRM CHOKE', code: 'V-03',
      tag: 'ENERGY STORAGE', rail: 'VCORE', voltage: '0.6–1.4 V', zone: 'CPU 左侧',
      role: '每相储能与滤波，决定瞬态电流能力。',
      detail: '每相 DrMOS 后都有一颗大电流电感。高饱和电流、低直流电阻和低磁芯损耗是关键；一体成型合金电感还能降低高频啸叫与体积。',
      specs: [['电感量', '0.1–0.5 µH'], ['饱和电流', '80–120 A'], ['DCR', '0.2–0.5 mΩ'], ['结构', '一体成型合金']],
      related: ['drmos', 'vrm-cap', 'vrm-ctrl'], stage: 3
    },
    {
      id: 'vrm-cap', cat: 'vrm', name: 'VRM 固态电容', en: 'VRM CAPACITOR BANK', code: 'V-04',
      tag: 'LOW ESL', rail: 'VCORE', voltage: '2.5–6.3 V', zone: 'CPU 左侧',
      role: '吸收每相开关纹波，稳定核心电压。',
      detail: '靠近 CPU 的陶瓷/固态电容负责高频去耦，降低供电阻抗与电压跌落。CPU 插槽背面的电容与 PCB 电源层共同构成完整的供电网络。',
      specs: [['类型', 'MLCC / 固态'], ['容量', '数百 µF 等效'], ['ESR', '亚毫欧级'], ['布局', '紧邻插槽与电感']],
      related: ['vrm-choke', 'drmos', 'cpu'], stage: 3
    },
    {
      id: 'sensors', cat: 'vrm', name: '电压/电流/温度传感', en: 'SENSE & TELEMETRY', code: 'V-05',
      tag: 'SENSE', rail: 'AUX', voltage: '1–3.3 V', zone: 'VRM / PSU 控制区',
      role: '为稳压、保护与风扇控制提供实时反馈。',
      detail: '分流电阻、霍尔/电感 DCR 采样与热敏电阻把电流和温度转换为电压信号。控制器据此均流、限流并调节风扇；现代平台还可通过 PMBus/I²C 提供遥测。',
      specs: [['电流采样', '分流 / DCR'], ['温度', 'NTC 10 kΩ'], ['接口', 'I²C / PMBus'], ['精度', '±1–3%']],
      related: ['vrm-ctrl', 'supervisor', 'psu-fan'], stage: 3
    },

    /* ── 06 计算与负载 ───────────────────────────────── */
    {
      id: 'cpu-socket', cat: 'compute', name: 'CPU 插座与触点', en: 'CPU SOCKET / LGA', code: 'C-01',
      tag: 'LGA', rail: 'VCORE / VSOC', voltage: '0.6–1.4 V', zone: '主板中央',
      role: '把数百安培核心电流送入 CPU，同时连接高速信号。',
      detail: 'LGA 触点同时承担电源、地、DDR、PCIe、SVID 等数百条连接。低接触电阻与均匀的电源/地针脚布局对高电流 CPU 至关重要；安装压力与针脚清洁直接影响稳定性。',
      specs: [['封装', 'LGA 1700 / 1851 / AM5'], ['触点', '1,000+'], ['电源针', '数百'], ['插入力', '约 30–50 kgf']],
      related: ['cpu', 'vrm-cap', 'drmos'], stage: 3
    },
    {
      id: 'cpu', cat: 'compute', name: 'CPU 核心', en: 'CPU CORE COMPLEX', code: 'C-02',
      tag: 'COMPUTE', rail: 'VCORE', voltage: '0.6–1.4 V', zone: '主板中央',
      role: '最终把电能转化为计算与开关活动。',
      detail: 'CPU 内部的 P 核、E 核、缓存与 Ring/Infinity Fabric 由多组独立电源域供电。SVID/AVFS 根据负载、温度与工艺体实时请求电压，VRM 必须在微秒级跟上负载跳变。',
      specs: [['核心电压', '0.6–1.4 V'], ['峰值电流', '200–500 A'], ['电源域', 'Core / SoC / GT'], ['调节', 'SVID / AVFS']],
      related: ['cpu-socket', 'vrm-ctrl', 'drmos'], stage: 3
    },
    {
      id: 'ddr5', cat: 'compute', name: 'DDR5 内存与 PMIC', en: 'DDR5 DIMM / PMIC', code: 'C-03',
      tag: 'DDR5', rail: 'VDD 1.1V / VPP 1.8V', voltage: '1.1 V / 1.8 V', zone: 'CPU 右侧',
      role: '为内存颗粒与高速 I/O 提供多路低噪声电源。',
      detail: 'DDR5 把 PMIC 搬到内存条上，从主板 5V 生成 VDD、VDDQ、VPP 等电压。内存训练阶段会反复调整时序与电压裕量；供电纹波会直接压缩超频与稳定性空间。',
      specs: [['VDD', '1.10 V'], ['VPP', '1.80 V'], ['PMIC', '板载多路 Buck'], ['速率', '4,800–8,000+ MT/s']],
      related: ['buck', 'cpu', 'vrm-ctrl'], stage: 4
    },
    {
      id: 'gpu', cat: 'compute', name: 'GPU 与显存', en: 'GPU / VRAM', code: 'C-04',
      tag: 'GRAPHICS', rail: '12V → 0.8–1.1V', voltage: '0.8–1.1 V', zone: 'PCIe 插槽',
      role: '整机最大的瞬时负载之一。',
      detail: 'GPU 核心与显存由多相 VRM 供电，负载可在微秒级从数十瓦跳到数百瓦。12V-2x6、PCIe 插槽与 GPU VRM 共同承担电流；瞬态响应不足会造成掉压、黑屏或降频。',
      specs: [['核心电压', '0.8–1.1 V'], ['显存电压', '1.2–1.35 V'], ['峰值功率', '150–600 W'], ['供电', 'PCIe + 12V-2x6']],
      related: ['gpu-vrm', 'hpwr', 'pch'], stage: 4
    },
    {
      id: 'gpu-vrm', cat: 'compute', name: 'GPU VRM', en: 'GPU VRM', code: 'C-05',
      tag: 'MULTI-RAIL', rail: '+12V', voltage: '0.8–1.35 V', zone: '显卡 PCB',
      role: '把 12V 转换为 GPU 核心与显存电压。',
      detail: '显卡通常使用 8–20 相核心供电与独立显存供电，控制器根据 GPU 的电压请求快速调节。高电流下，电感、DrMOS 与 PCB 铜箔的损耗决定显卡的供电温度与超频上限。',
      specs: [['核心相数', '8–20 相'], ['显存供电', '独立 2–4 相'], ['输入', '12 V'], ['遥测', 'IMON / 温度']],
      related: ['gpu', 'hpwr', 'drmos'], stage: 4
    },
    {
      id: 'pch', cat: 'compute', name: '芯片组 PCH', en: 'CHIPSET / PCH', code: 'C-06',
      tag: 'PLATFORM', rail: '1.05V / 3.3V', voltage: '0.9–1.05 V', zone: '主板右下',
      role: '管理 PCIe、USB、SATA 与低速 I/O。',
      detail: 'PCH 负责外设扩展与平台管理，功耗通常低于 CPU/GPU，但仍需要独立低压轨与散热。它通过 DMI/PCIe 与 CPU 相连，并控制多路时钟与复位。',
      specs: [['核心电压', '0.9–1.05 V'], ['接口', 'PCIe / USB / SATA'], ['TDP', '6–15 W'], ['散热', '无风扇 / 小散热片']],
      related: ['buck', 'nvme', 'io'], stage: 4
    },
    {
      id: 'nvme', cat: 'compute', name: 'NVMe SSD', en: 'NVMe M.2 SSD', code: 'C-07',
      tag: 'M.2', rail: '+3.3V', voltage: '3.3 V / 2.5 A', zone: '主板 M.2 插槽',
      role: '把电能转化为高速存储访问与缓存写入。',
      detail: 'M.2 NVMe SSD 从主板 3.3V 取电，内部再生成 1.8V、1.2V、0.9V 等。PCIe 5.0 SSD 功耗可达 10W 以上，需要散热片；供电噪声与掉电保护会影响数据完整性。',
      specs: [['接口', 'PCIe 4.0 / 5.0 x4'], ['电压', '3.3 V'], ['功耗', '5–14 W'], ['尺寸', 'M.2 2280']],
      related: ['buck', 'pch', 'sata-power'], stage: 4
    },
    {
      id: 'debug', cat: 'platform', name: 'POST 诊断显示', en: 'DEBUG LED / POST CODE', code: 'P-01',
      tag: 'POST', rail: '+3.3VSB', voltage: '3.3 V', zone: '主板边缘',
      role: '把启动阶段与故障定位可视化。',
      detail: '四位 POST 码或一组 Debug LED 在启动时显示当前初始化阶段；不同厂商的代码含义不同。它依赖待机 3.3V 供电，因此断电后仍可保留部分指示。',
      specs: [['显示', '2 位 / 4 位七段码'], ['供电', '3.3VSB'], ['接口', 'LPC / eSPI'], ['用途', 'POST / 故障诊断']],
      related: ['bios', 'standby', 'pch'], stage: 3
    },

    /* ── 07 平台辅助 ─────────────────────────────────── */
    {
      id: 'bios', cat: 'platform', name: 'BIOS / SPI Flash', en: 'SPI NOR FLASH', code: 'P-02',
      tag: 'FIRMWARE', rail: '+3.3V', voltage: '3.3 V', zone: '主板左下',
      role: '存放启动固件与平台初始化代码。',
      detail: 'SPI NOR Flash 保存 UEFI 固件、ME/PSP 与配置数据。上电后 CPU 从固定地址取指，完成内存训练与设备枚举；双 BIOS 设计可在主固件损坏时恢复。',
      specs: [['容量', '16–32 MB'], ['接口', 'SPI / QSPI'], ['电压', '3.3 V'], ['特性', '双 BIOS / 回滚']],
      related: ['cmos', 'clock', 'debug'], stage: 3
    },
    {
      id: 'cmos', cat: 'platform', name: 'CMOS 电池', en: 'CMOS BATTERY', code: 'P-03',
      tag: 'CR2032', rail: 'VBAT', voltage: '3.0 V', zone: '主板左下',
      role: '在主电源断开时维持 RTC 与配置存储。',
      detail: 'CR2032 通过二极管或电源切换电路为 RTC 和 CMOS 供电。它不参与主功率传输，但电池耗尽会导致时间丢失、启动配置重置，部分平台还会拒绝启动。',
      specs: [['型号', 'CR2032'], ['电压', '3.0 V'], ['容量', '≈ 220 mAh'], ['负载', 'RTC / CMOS']],
      related: ['bios', 'ldo', 'clock'], stage: 0
    },
    {
      id: 'clock', cat: 'platform', name: '时钟发生器 / 晶振', en: 'CLOCK GENERATOR', code: 'P-04',
      tag: 'CLOCK', rail: '+3.3V', voltage: '3.3 V', zone: '主板中央',
      role: '为 CPU、PCIe、USB 等提供基准时钟。',
      detail: '25MHz 或 100MHz 基准经 PLL 倍频/分配，生成 PCIe、USB、SATA 与 CPU 所需时钟。时钟抖动会直接影响高速链路误码率，因此供电与布局需要低噪声。',
      specs: [['基准', '25 / 100 MHz'], ['输出', '多路差分'], ['抖动', 'fs 级'], ['接口', 'HCSL / LVDS']],
      related: ['ldo', 'pch', 'io'], stage: 3
    },
    {
      id: 'fan-rgb', cat: 'platform', name: '风扇与 ARGB 控制', en: 'FAN / ARGB HEADER', code: 'P-05',
      tag: '12V / 5V', rail: '+12V / +5V', voltage: '12 V PWM / 5 V ARGB', zone: '主板边缘',
      role: '把供电与控制信号送到机箱风扇与灯效。',
      detail: '4-pin 风扇接口提供 12V、地、转速反馈与 25kHz PWM；3-pin ARGB 使用 5V、数据与地。风扇与灯带电流应计入主板接口预算，避免过载或烧毁接头。',
      specs: [['风扇', '12 V / 1–2 A'], ['PWM', '25 kHz'], ['ARGB', '5 V / 3 A'], ['反馈', 'TACH']],
      related: ['sata-power', 'buck', 'psu-fan'], stage: 5
    },
    {
      id: 'io', cat: 'platform', name: 'I/O 与网络供电', en: 'USB / LAN / AUDIO POWER', code: 'P-06',
      tag: 'I/O', rail: '+5V / +3.3V', voltage: '5 V / 3.3 V', zone: '主板后窗',
      role: '为 USB、网卡、音频与显示接口提供电源。',
      detail: 'USB 端口需要 5V 限流与 ESD 保护，网卡与音频编解码器使用低噪声 3.3V/1.8V。待机 USB 充电由 5VSB 供电，因此关机后仍能工作；雷击浪涌保护对这些外部接口尤其重要。',
      specs: [['USB', '5 V / 0.9–3 A'], ['LAN', '1.8 / 3.3 V'], ['音频', '3.3 V / ±5 V'], ['保护', 'ESD / 限流']],
      related: ['pch', 'buck', 'standby'], stage: 5
    },
    {
      id: 'power-button', cat: 'platform', name: '电源按钮与待机逻辑', en: 'POWER BUTTON / STANDBY', code: 'P-07',
      tag: 'PS_ON#', rail: '+5VSB', voltage: '3.3 VSB', zone: '主板边缘',
      role: '把一次按键变成整机上电时序。',
      detail: '按下按钮只会短暂拉低 PWR_BTN#，由南桥/PCH 的待机逻辑去拉低 PS_ON#。长按强制断电由硬件计时器完成；因此轻触与长按是两条不同的信号路径。',
      specs: [['待机电压', '3.3VSB / 5VSB'], ['信号', 'PWR_BTN# / PS_ON#'], ['去抖', '数十毫秒'], ['强制关机', '长按 4–6 s']],
      related: ['standby', 'supervisor', 'atx24'], stage: 0
    }
  ];

  const railMeta = {
    ac:   { label: 'AC 市电', color: '#ff9e64', unit: 'V', digits: 0 },
    hv:   { label: 'PFC 母线', color: '#ff6b6b', unit: 'V', digits: 0 },
    vsb:  { label: '+5VSB', color: '#b58cff', unit: 'V', digits: 2 },
    v12:  { label: '+12V', color: '#ffd166', unit: 'V', digits: 2 },
    v5:   { label: '+5V', color: '#ff7b72', unit: 'V', digits: 2 },
    v33:  { label: '+3.3V', color: '#ff9e64', unit: 'V', digits: 2 },
    vcore:{ label: 'VCORE', color: '#5ef2d6', unit: 'V', digits: 3 },
    vsoc: { label: 'VSOC', color: '#8bd7ff', unit: 'V', digits: 2 },
    vddr: { label: 'VDD', color: '#c4a7ff', unit: 'V', digits: 2 }
  };

  return { categories, stages, components, railMeta };
})();
