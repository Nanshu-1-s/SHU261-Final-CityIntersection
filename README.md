# SHU261 基础实践 · 期末作业：城市十字路口环境声设计

> 学号：**（待填）**　姓名：**（待填）**
>
> 场景：城市主干道十字路口（傍晚入夜）　中间件：Wwise 2025.1.11.9262

---

## 一、交付内容

| 作业要求 | 本仓库对应内容 |
| --- | --- |
| 确定设计对象，准备照片/图片与文字说明 | `Docs/scene_photo.jpg`、`Docs/scene_layout.png`、`Docs/Scene_CityIntersection.md` |
| 至少两种声音素材：持续基底 + 间断随机 | 基底层 1 个（60 s 车流/街道底噪）+ 间断层 8 个（驶过 ×3、电瓶车鸣笛 ×3、汽车喇叭 ×2） |
| 至少导出：>30 s 基底 ×1、间断随机声 ≥3 个 | 60 s 基底 ×1、间断声 ×8 |
| 格式 48 kHz / 24 bit / stereo / .wav | 全部 9 个文件均为该规格，已用 `ffprobe` 逐文件校验 |
| 新建 Wwise 工程（名称不用中文，配好 .gitignore） | `Wwise/SHU261_CityIntersection/`，含 `.gitignore` |
| 基底环境声设置为持续循环 | `AMB_CityIntersection_Bed`：源循环开 + 无限循环 |
| 间断声用 Random Container 随机触发 | `SFX_Vehicles_Random`、`SFX_Horns_Random`（Play Type = Random，Play Mode = Step） |
| 随机声 Positioning 随距离变化 | 两个 Random Container 均为 3D Emitter，挂载 `ATT_CityStreet_Distance`（距离衰减 + 距离低通 + 声像扩散） |
| Soundcaster Session 中预览 | `CityIntersection_Preview` 会话，含基底与两个 Random Container 三个模块 |

## 二、目录结构

```
SHU261_Final_Audio/
├─ AudioAssets/
│  └─ Exported/
│     ├─ Base/AMB_CityIntersection_Bed_Loop.wav      60 s 基底（无缝循环）
│     └─ Random/
│        ├─ SFX_CarPassby_01..03.wav                 车辆驶过
│        ├─ SFX_EbikeHorn_01..03.wav                 电瓶车鸣笛
│        └─ SFX_CarHorn_01..02.wav                   汽车喇叭
├─ Docs/
│  ├─ Scene_CityIntersection.md                      场景说明 + 设计思路 + 规格表
│  ├─ scene_photo.jpg                                场景照片
│  └─ scene_layout.png / .html                       声源布局示意图
├─ Wwise/
│  └─ SHU261_CityIntersection/                       Wwise 工程
│     ├─ SHU261_CityIntersection.wproj
│     ├─ Containers/Default Work Unit.wwu            Actor-Mixer 层级
│     ├─ Attenuations/Default Work Unit.wwu          距离衰减 ShareSet
│     ├─ Soundcaster Sessions/Default Work Unit.wwu  预览会话
│     ├─ Originals/                                  素材源文件
│     └─ .gitignore
└─ tools/                                            生成与校验脚本（可选，见第五节）
```

## 三、Wwise 工程结构

```
Actor-Mixer Hierarchy
└─ Ambience_CityIntersection            (Actor-Mixer)
   ├─ AMB_CityIntersection_Bed          (Sound)
   │    └─ IsLoopingEnabled = true，IsLoopingInfinite = true
   │       EnableAttenuation = false（基底是全场景环境层，不做距离衰减）
   ├─ SFX_Vehicles_Random               (Random Container)
   │    ├─ SFX_CarPassby_01 / 02 / 03
   │    └─ Play Type = Random，Play Mode = Step，Avoid Repeating = on
   └─ SFX_Horns_Random                  (Random Container)
        ├─ SFX_EbikeHorn_01 / 02 / 03
        ├─ SFX_CarHorn_01 / 02
        └─ 同上配置
```

两个 Random Container 的 Positioning：`3D Position = Emitter`，`EnableAttenuation = true`，引用 ShareSet `ATT_CityStreet_Distance`。

### 距离衰减曲线（ATT_CityStreet_Distance）

| 曲线 | 控制点 |
| --- | --- |
| Volume（音量） | 0 m / 0 dB → 3 m / −1.5 → 8 m / −7 → 16 m / −16 → 32 m / −32 → 60 m / −58 → 100 m / −96 |
| Low-Pass Filter（远处变闷） | 0 m / 0 % → 15 m / 20 % → 45 m / 60 % → 100 m / 100 % |
| Spread（声像扩散） | 0 m / 0 % → 20 m / 45 % → 60 m / 90 % → 100 m / 100 % |

音量曲线按对数衰减设计（每倍距离约 −6 dB），低通与扩散曲线让远处声源同时"变闷、变宽"，比单纯调音量更像真实的空气吸收。

## 四、如何预览

1. 启动 Audiokinetic Launcher，打开 Wwise **2025.1.11.9262**。
2. 打开工程 `Wwise/SHU261_CityIntersection/SHU261_CityIntersection.wproj`。
3. 菜单 `Window → Soundcaster`（或按 `Shift+S`），左下角切换到会话 **CityIntersection_Preview**。
4. 会话中有三个模块：基底、Random Container（驶过）、Random Container（鸣笛/喇叭）。逐个点播放键试听：
   - 基底应持续不断、循环处听不出接缝；
   - 每次触发 Random Container 会随机选一条，连续两次不会选中同一条（Avoid Repeating）；
   - 把 Game Object 拖远 / 改听者与声源距离，声音应同时变小、变闷、变宽。

## 五、素材是怎么来的（重要声明）

**本作业的全部声音素材由程序化合成生成，不是现场录音，也没有使用现成音效库。** 作业要求允许"其他你能想到的办法或途径"，这里选择用信号合成的方式实现，好处是每个参数都可解释、结果可完全复现。

复现命令（需要 Node.js，无第三方依赖）：

```bash
node tools/gen_assets.mjs   # 生成 9 个 wav 到 AudioAssets/Exported/
node tools/analyze.mjs      # 自检：格式、峰值、直流、循环接缝、频谱分布
```

Wwise 工程同样是用脚本建的（`tools/build_wwise.mjs`、`tools/configure_wwise.mjs`），通过 Wwise 自带的 WAAPI 完成建层级、导入素材、配置循环/随机容器/衰减，改场景或改参数后重跑即可重建，不需要手点。

## 六、图片版权

- 场景照片：Pixabay，Pixabay Content License（可免费使用、无需署名）。
- 声源布局示意图：本人绘制。
