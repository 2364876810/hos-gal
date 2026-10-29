// 主页面背景组件
// 对应原 index.html 里的：
//   <video class="bg-video" autoplay muted loop playsinline>
//     <source src="./image/背景.mp4" type="video/mp4">
//   </video>
//   <div class="mask"></div>
// 对应 script/style.js 里 startGame()/exitGame() 对背景视频的显示/隐藏：
//   进入游戏场景 → .bg-video 设为 display:none
//   返回菜单     → 恢复显示
// React 版本不直接操作 DOM；视频始终挂载，只切换 display，
// 避免重新加载和播放进度丢失。
// muted 通过 ref 回调写入 DOM：React 的 muted prop 有已知缺陷
// （属性/property 不同步），会导致自动播放策略触发 ERR_ABORTED。
import { useCallback } from "react";

const DEFAULT_SRC = "./image/背景.mp4";

export default function Background({
  src = DEFAULT_SRC,
  visible = true,
  showMask = true,
}) {
  // 挂载时强制开启静音，绕过 React muted prop 的同步缺陷，保证自动播放
  const videoRef = useCallback(node => {
    if (node) {
      node.muted = true;
      node.defaultMuted = true;
    }
  }, []);

  return (
    <>
      <video
        ref={videoRef}
        className="bg-video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        style={visible ? undefined : { display: "none" }}
      >
        <source src={src} type="video/mp4" />
      </video>
      {showMask && <div className="mask" />}
    </>
  );
}
