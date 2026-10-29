// React 入口：把 Main 总组件挂载到 index.html 的 #root 上
import { createRoot } from "react-dom/client";
import Main from "./components/Main";

// 样式保持引用原有的 box.css，与静态页面共用同一套规则
import "../css/box.css";

createRoot(document.getElementById("root")).render(<Main />);
