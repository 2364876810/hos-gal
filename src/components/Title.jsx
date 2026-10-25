"use client";

// 标题「健康诊室」组件
// 对应原来 index.html 里的：
//   <div class="game-title"><span>健</span><span>康</span><span>诊</span><span>室</span></div>
// 标题本身没有 JS 逻辑——田字布局、左右倾斜、绿/蓝配色、悬停弹起全部由
// css/box.css 的 .game-title 和 :nth-child 规则完成，所以组件只负责输出结构。
const DEFAULT_TITLE = "健康诊室";

export default function Title({ title = DEFAULT_TITLE, className = "game-title" }) {
  return (
    <div className={className}>
      {[...title].map((char, index) => (
        <span key={index}>{char}</span>
      ))}
    </div>
  );
}
