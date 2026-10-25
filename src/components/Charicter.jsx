"use client";

// 看板娘组件
// 对应原来 index.html 里的 <img class="kanban-girl"> 和 script/style.js 开头的
// 悬停换图 + 预加载逻辑，这里改成 React 的受控写法：
//   - src 由 useState 管理，鼠标移入切到悬停图，移出恢复默认图
//   - 首次渲染时用 new Image() 预下载悬停图，避免第一次悬停时等待加载
// 样式仍复用 css/box.css 里的 .kanban-girl（定位、大小、--fit 缩放都在那边），
// 所以组件本身不写内联样式，只负责 HTML 结构和交互。
import { useEffect, useState } from "react";

const DEFAULT_SRC = "./image/看板娘/看板娘_small.webp";
const HOVER_SRC = "./image/看板娘/点击触发.png";

export default function Charicter({
  defaultSrc = DEFAULT_SRC,
  hoverSrc = HOVER_SRC,
  alt = "看板娘",
  className = "kanban-girl",
  ...rest
}) {
  const [src, setSrc] = useState(defaultSrc);

  // 传入的图片路径变化时，重置回默认图
  useEffect(() => {
    setSrc(defaultSrc);
  }, [defaultSrc]);

  // 预加载悬停图
  useEffect(() => {
    if (!hoverSrc) return;
    const preloader = new Image();
    preloader.src = hoverSrc;
  }, [hoverSrc]);

  return (
    <img
      {...rest}
      className={className}
      src={src}
      alt={alt}
      data-hover-src={hoverSrc}
      data-default-src={defaultSrc}
      onMouseEnter={hoverSrc ? () => setSrc(hoverSrc) : undefined}
      onMouseLeave={() => setSrc(defaultSrc)}
    />
  );
}
