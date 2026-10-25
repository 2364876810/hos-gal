"use client";

// 菜单按钮组件
// 对应 index.html 里 .menu-wrap 下的四个 .menu-btn：
//   开始咨询 / 我的存档 / 角色选择 / 问题反馈
// 对应 script/style.js 里给 #start-btn、#role-btn 绑定的点击行为：
//   开始咨询 → openGamePanel()
//   角色选择 → openRolePanel()
// React 版本改成 props 回调；不传回调时自动回落到上面两个全局函数，
// 方便和还没迁移完的原生脚本共存。
// 注意：组件只输出四个按钮（Fragment），外层 .menu-wrap 由父组件提供，
// 以便和 <Title /> 一起构成原来的纵向菜单布局。
const DEFAULT_ITEMS = [
  { key: "start", label: "开始咨询" },
  { key: "save", label: "我的存档" },
  { key: "role", label: "角色选择" },
  { key: "feedback", label: "问题反馈" },
];

export default function Menu({
  items = DEFAULT_ITEMS,
  onStart,
  onSave,
  onRole,
  onFeedback,
}) {
  const actions = {
    start: onStart ?? (() => window.openGamePanel?.()),
    save: onSave,
    role: onRole ?? (() => window.openRolePanel?.()),
    feedback: onFeedback,
  };

  return (
    <>
      {items.map(item => (
        <div
          key={item.key}
          className="menu-btn"
          onClick={actions[item.key]}
        >
          {item.label}
        </div>
      ))}
    </>
  );
}
