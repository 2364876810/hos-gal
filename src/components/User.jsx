// 顶部信息栏组件
// 对应 index.html 里的：
//   <div class="wrap">
//     <div class="box_1">用户</div>
//     <div class="box_1">余额</div>
//     <div class="box_1">关于我们</div>
//   </div>
// 这三个盒子没有 JS 逻辑，定位（贴右上）、等比缩放（--fit）和配色
// 全部由 css/box.css 的 .wrap / .box_1 完成，所以组件只负责输出结构。
const DEFAULT_ITEMS = ["用户", "余额", "关于我们"];

export default function User({ items = DEFAULT_ITEMS, className = "wrap" }) {
  return (
    <div className={className}>
      {items.map((item, index) => (
        <div key={index} className="box_1">
          {item}
        </div>
      ))}
    </div>
  );
}
