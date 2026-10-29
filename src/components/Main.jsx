// 主页面总组件
// 按 index.html 的原始结构组装五个子组件：
//   Background（全屏视频+遮罩） → 看板娘 Charicter → 右上信息栏 User
//   → 左侧标题 Title + 菜单 Menu（共用 .menu-wrap）
// 场景切换沿用原 style.js 的流程：
//   开始咨询 → openGamePanel() 背景选择面板 → startGame() 隐藏视频/看板娘
//   返回菜单 → exitGame() 恢复显示
// 这里不做额外状态管理，startGame/exitGame 继续用 DOM 方式控制显隐，
// React 不参与（无状态变化就不会重渲染，二者互不干扰）。
import Background from "./Background";
import Charicter from "./Charicter";
import Menu from "./Menu";
import Title from "./Title";
import User from "./User";

export default function Main() {
  return (
    <>
      {/* 全屏背景视频 + 半透明遮罩（startGame/exitGame 控制显隐） */}
      <Background />

      {/* 右下角看板娘 */}
      <Charicter />

      {/* 右上角 用户/余额/关于我们 */}
      <User />

      {/* 左侧标题 + 菜单按钮 */}
      <div className="menu-wrap">
        <Title />
        <Menu
          onStart={() => window.openGamePanel?.()}
          onRole={() => window.openRolePanel?.()}
        />
      </div>
    </>
  );
}
