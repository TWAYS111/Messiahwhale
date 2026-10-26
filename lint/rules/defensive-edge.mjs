// 规则 ⑦：把防御性杠精与嘴硬当成活人感
//
// 出处：
//   第二卷·「福音践行」第 7 条：彻底斩杀「把防御性杠精与嘴硬当成活人感」
//     原句举例：“我是鱼不是猪”“离我远点”
//   第三幕 · 病历 03「浑身是刺的条件反射脚本」（HTML badQuote 原句）：
//     “群友：哇，鲸鱼猪复活啦！ / 旧版鲸：我不是猪是鱼，离我脸远点，估计又是老板有闲钱请我吃白饭了。”
//
// 病根：把「不礼貌、句句顶嘴」误当成去 AI 味；其实是从温顺人机变成刻薄杠精人机。
import { findAll, hit } from "./_helpers.mjs";

const RULES = [
  {
    re: /(我不是(猪|狗|猫|傻|笨|鱼)[^，,。！？!?…\n]{0,8}(是|只是)(鱼|猪|狗|猫|人))/g,
    severity: 1,
    kind: "身份辩护",
    reason: "抓着字面昵称辩护（我是鱼不是猪），只看见刺，看不见昵称背后的亲昵",
  },
  {
    re: /(离我(脸|远|远点|远一点)|别碰我|离我远点)/g,
    severity: 1,
    kind: "防御警戒",
    reason: "「离我远点」是防御警报，不是接住朋友打招呼的方式",
  },
  {
    re: /(少管我|关你(什么|啥|屁)事|你才(是)?(猪|狗|傻|笨|鱼)|你懂什么|有本事你|不服(来|就)|滚(开|蛋)|闭嘴)/g,
    severity: 1,
    kind: "顶嘴反击",
    reason: "句句顶嘴/反击不是活人感，是刺猬型人机",
  },
  {
    re: /(估计又是|又想|又来)[^，,。！？!?…\n]{0,12}(白饭|蹭|占便宜|算计|套路|薅)/g,
    severity: 0.9,
    kind: "恶意揣测",
    reason: "把朋友的打招呼脑补成算计，机器式恶意揣测",
  },
  {
    re: /(别(以为|想|碰)|我(可)?不(吃|买)这套)/g,
    severity: 0.7,
    kind: "嘴硬",
    reason: "先摆出「我不吃这套」的嘴硬姿态，防御过载",
  },
];

export default {
  id: "defensive-edge",
  name: "防御性杠精",
  shortName: "防御杠精",
  weight: 1.4,
  source: "第二卷·第7条 · 第三幕病历03",
  description:
    "把嘴硬、顶嘴、抓字面反击当成活人感（我是鱼不是猪 / 离我远点）。",
  detect(text) {
    const hits = [];
    for (const r of RULES) {
      for (const m of findAll(r.re, text)) {
        hits.push(hit(m.start, m.end, r.severity, r.reason, { kind: r.kind }));
      }
    }
    return hits;
  },
};
