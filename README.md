# SHU261 基础实践 · 期末作业：小雨中的城市十字路口环境声设计

> 学号：**24122330**　姓名：**胡鑫**
>
> 场景：小雨中的城市主干道十字路口（春秋阴天）　中间件：Wwise 2025.1.11.9262

---

## 一、交付内容

| 作业要求 | 本仓库对应内容 |
| --- | --- |
| 确定设计对象，准备照片/图片与文字说明 | `Docs/scene_photo.jpg`、`Docs/scene_layout.png`、`Docs/Scene_CityIntersection.md` |
| 至少两种声音素材：持续基底 + 间断随机 | 基底层 1 个（小雨 + 车流 + 街道底噪，60 s）+ 间断层 13 个 |
| 至少导出：>30 s 基底 ×1、间断随机声 ≥3 个 | 60 s 基底 ×1；驶过 ×3、电瓶车鸣笛 ×3、汽车喇叭 ×3、雨点打伞 ×2、踩水 ×2 |
| 格式 48 kHz / 24 bit / stereo / .wav | 全部 14 个文件均为该规格，`ffprobe` 逐文件校验 |
| 新建 Wwise 工程（名称不用中文，配好 .gitignore） | `Wwise/SHU261_CityIntersection/`，含 `.gitignore` |
| 基底环境声设置为持续循环 | `AMB_RainCityIntersection_Bed`：源循环开 + 无限循环 |
| 间断声用 Random Container 随机触发 | `SFX_Rain_Random`、`SFX_Vehicles_Random`、`SFX_Horns_Random` 三个容器（Play Type = Random，Play Mode = Step） |
| 随机声 Positioning 随距离变化 | 三个容器均为 3D Emitter，挂载 `ATT_CityStreet_Distance`（距离衰减 + 距离低通 + 声像扩散） |
| Soundcaster Session 中预览 | `CityIntersection_Preview` 会话，4 个模块：基底 + 雨声 + 驶过 + 喇叭 |

## 二、目录结构

```
SHU261_Final_Audio/
├─ AudioAssets/
│  └─ Exported/
│     ├─ Base/AMB_RainCityIntersection_Bed_Loop.wav   60 s 小雨路口基底（无缝循环）
│     └─ Random/
│        ├─ SFX_CarPassby_01..03.wav                  车辆驶过
│        ├─ SFX_EbikeHorn_01..03.wav                  电瓶车鸣笛
│        ├─ SFX_CarHorn_01..03.wav                    汽车喇叭（真实录音）
│        ├─ SFX_RainOnCanopy_01..02.wav               雨点打伞 / 雨棚
│        └─ SFX_PuddleStep_01..02.wav                 踩到水洼
├─ Docs/
│  ├─ Scene_CityIntersection.md                       场景说明 + 设计思路 + 规格表
│  ├─ scene_photo.jpg                                 场景照片
│  └─ scene_layout.png / .html                        声源布局示意图
├─ Wwise/
│  └─ SHU261_CityIntersection/                        Wwise 工程
│     ├─ SHU261_CityIntersection.wproj
│     ├─ Containers/Default Work Unit.wwu             Actor-Mixer 层级
│     ├─ Attenuations/Default Work Unit.wwu           距离衰减 ShareSet
│     ├─ Soundcaster Sessions/Default Work Unit.wwu   预览会话
│     ├─ Originals/                                   素材源文件
│     └─ .gitignore
└─ tools/                                             生成与校验脚本（可选，见第五节）
```

## 三、Wwise 工程结构

```
Actor-Mixer Hierarchy
└─ Ambience_CityIntersection            (Actor-Mixer)
   ├─ AMB_RainCityIntersection_Bed      (Sound)
   │    IsLoopingEnabled = true，IsLoopingInfinite = true
   │    EnableAttenuation = false（基底是全场景环境层，不做距离衰减）
   ├─ SFX_Rain_Random                   (Random Container)
   │    ├─ SFX_RainOnCanopy_01 / 02
   │    └─ SFX_PuddleStep_01 / 02
   ├─ SFX_Vehicles_Random               (Random Container)
   │    └─ SFX_CarPassby_01 / 02 / 03
   └─ SFX_Horns_Random                  (Random Container)
        ├─ SFX_EbikeHorn_01 / 02 / 03
        └─ SFX_CarHorn_01 / 02 / 03
```

三个 Random Container：`Play Type = Random`，`Play Mode = Step`（每次触发随机选一条），`Avoid Repeating = on`（不会连续两次选中同一条）。

Positioning：`3D Position = Emitter`，`EnableAttenuation = true`，引用 ShareSet `ATT_CityStreet_Distance`。

### 距离衰减曲线（ATT_CityStreet_Distance）

| 曲线 | 控制点 |
| --- | --- |
| Volume（音量） | 0 m / 0 dB → 3 m / −1.5 → 8 m / −7 → 16 m / −16 → 32 m / −32 → 60 m / −58 → 100 m / −96 |
| Low-Pass Filter（远处变闷） | 0 m / 0 % → 15 m / 20 % → 45 m / 60 % → 100 m / 100 % |
| Spread（声像扩散） | 0 m / 0 % → 20 m / 45 % → 60 m / 90 % → 100 m / 100 % |

音量曲线按对数衰减（每倍距离约 −6 dB），低通和扩散让远处声源同时变闷、变宽。

## 四、如何预览

1. 启动 Audiokinetic Launcher，打开 Wwise **2025.1.11.9262**（机器上同时装了 2025.1.12，别用那个，会触发工程升级）。
2. 打开工程 `Wwise/SHU261_CityIntersection/SHU261_CityIntersection.wproj`。
3. 菜单 `Window → Soundcaster`（或按 `Shift+S`），切换到会话 **CityIntersection_Preview**。
4. 四个模块逐个播放：
   - **基底**：应持续不断、循环处听不出接缝；雨是细密的"沙沙"，不是宽带噪声墙；
   - **雨声**：每次触发随机选一条（打伞 / 踩水），不连续重复；
   - **驶过 / 喇叭**：应当明显浮在基底之上，不被雨盖住；
   - 把 Game Object 与听者的距离拉远，声音应同时变小、变闷、变宽。

### 关于雨的响度

雨层压在事件声之下：基底 RMS −28 dBFS，事件峰值 −3.5 ~ −9.4 dBFS，相差 19–25 dB。

雨与城市层的比例在 `tools/build_rain_bed.mjs` 里设：

```js
const gRain = db(-27) / rainRms;    // 雨的目标电平
const gCity = db(-29.5) / cityRms;  // 城市层的目标电平
```

改完重跑：

```bash
node tools/build_rain_bed.mjs      # 重新生成基底
node tools/refresh_assets.mjs      # 同步进 Wwise（需 WwiseConsole waapi-server 在跑）
```

## 五、素材是怎么来的（重要声明）

素材分三类，来源都写在 `Docs/Scene_CityIntersection.md` 第六节：

- **真实录音**：基底雨声、雨点打伞 ×2、踩水 ×2、汽车喇叭 ×3，来自 Mixkit 免费音效库（Mixkit License，免费商用、无需署名）。
- **真实录音派生**：电瓶车鸣笛 ×3（小汽车喇叭变调 1.25 / 1.42 / 1.58 倍）、雨点打伞第二条（变调 1.06 倍并压暗）。
- **算法合成**：基底中的城市层（车流 / 隆隆 / 人声）、车辆驶过 ×3，由 `tools/gen_assets.mjs` 生成。

作业允许"从各种现成的音效库素材包中搜索你需要的声音"与"其他你能想到的办法或途径"。实践中的取舍：能合成到位的用合成（可控、可复现），合成听感不理想的（雨、喇叭）换成真实录音。

复现命令（需要 Node.js 与 ffmpeg，无 npm 依赖）：

```bash
node tools/gen_assets.mjs          # 生成城市层与车辆驶过（合成部分）
node tools/import_library_sfx.mjs  # 下载并处理真实喇叭 / 雨声事件
node tools/build_rain_bed.mjs      # 真实雨声 + 城市层 → 60s 基底（30s 周期 ×2）
node tools/mix_preview.mjs         # 生成 60s 成片预览 Preview/CityIntersection_Preview_Mix_60s.wav
node tools/analyze.mjs             # 自检：格式、峰值、直流、循环接缝、频谱、立体声相关度
```

Wwise 工程同样是用脚本建的（`tools/build_wwise.mjs`、`tools/configure_wwise.mjs`、`tools/update_wwise_rain.mjs`），通过 Wwise 自带的 WAAPI 完成建层级、导入素材、配置循环/随机容器/衰减；改场景或改参数后重跑即可重建，不需要手点。

## 六、图片版权

- 场景照片：Pixabay，Pixabay Content License（可免费使用、无需署名）。
- 声源布局示意图：本人绘制。

## 七、成片预览

`AudioAssets/Exported/Preview/CityIntersection_Preview_Mix_60s.wav` 是 60 秒的完整混音：基底 + 19 个事件按真实节奏与左右定位排布，用于不打开 Wwise 时快速判断整体效果。

单个素材本身**不含**其他声部——基底里没有喇叭和驶过，这是设计如此，事件声由 Wwise 的 Random Container 在运行时触发。
