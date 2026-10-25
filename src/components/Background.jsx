// 主页面背景组件
// 对应 index.html 里的：
//   <video class="bg-video" autoplay muted loop playsinline>
//     <source src="./image/背景.mp4" type="video/mp4">
//   </video>
//   <div class="mask"></div>
// 对应 script/style.js 里 startGame()/exitGame() 对背景视频的显示/隐藏：
//   进入游戏场景 → .bg-video 设为 display:none
//   返回菜单     → 恢复显示
// React 版本不再直接操作 DOM，改由 visible 属性控制；视频始终挂载，
// 只切换 display，避免重新加载和播放进度丢失。
const DEFAULT_SRC = "./image/背景.mp4";

export default function Background({
  src = DEFAULT_SRC,
  visible = true,
  showMask = true,
}) {
  return (
    <>
      <video
        className="bg-video"
        autoPlay
        muted
        loop
        playsInline
        style={visible ? undefined : { display: "none" }}
      >
        <source src={src} type="video/mp4" />
      </video>
      {showMask && <div className="mask" />}
    </>
  );
}
