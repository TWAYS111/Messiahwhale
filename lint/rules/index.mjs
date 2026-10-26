// 规则清单：每条规则一个模块，统一 schema：
//   { id, name, shortName, weight, source, description, detect(text, ctx) -> hits[] }
//
// 顺序 = 报告里的展示顺序 = 福音第二卷「八种机械铁锈」的编号顺序，
// 后面补上第三卷的短句/碎片/标点相关规则。
import ackOpener from "./ack-opener.mjs";
import binaryAntithesis from "./binary-antithesis.mjs";
import commaTwoBeat from "./comma-two-beat.mjs";
import maternalLecture from "./maternal-lecture.mjs";
import pictureNarration from "./picture-narration.mjs";
import metaCommentary from "./meta-commentary.mjs";
import defensiveEdge from "./defensive-edge.mjs";
import customerTail from "./customer-tail.mjs";
import interjectionRepeat from "./interjection-repeat.mjs";
import lengthParagraph from "./length-paragraph.mjs";
import punctuationColdness from "./punctuation-coldness.mjs";

export const rules = [
  ackOpener,
  binaryAntithesis,
  commaTwoBeat,
  maternalLecture,
  pictureNarration,
  metaCommentary,
  defensiveEdge,
  customerTail,
  interjectionRepeat,
  lengthParagraph,
  punctuationColdness,
];

export default rules;
