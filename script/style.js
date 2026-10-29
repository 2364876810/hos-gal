// 看板娘悬停换图已由 React 组件 src/components/Charicter.jsx 实现
// ================== 页面自适应：按 1920x1080 设计稿等比缩放 ==================
// 窗口任何比例下，UI 都按 min(宽比, 高比) 缩放，不溢出不变形
const PAGE_ZOOM = 1.5; // 所有元素统一放大倍数（贴边角为基准，向页面中心方向膨胀）
function fitPageScale() {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080) * PAGE_ZOOM;
    document.documentElement.style.setProperty('--fit', s);
}
window.addEventListener('resize', fitPageScale);
fitPageScale();

// ================== 角色选择面板 ==================
// 角色以"角色素材"里的子文件夹为单位：
// 每个子文件夹 = 一个角色，文件夹名 = 角色名，文件夹里的第一张图片 = 封面

let dirHandle = null;   // 用户授权过的"角色素材"文件夹句柄（刷新页面后失效，需重新选择）
let currentRole = null; // 当前选中的角色名
try {
    currentRole = localStorage.getItem('currentRole'); // 恢复上次选择的角色
} catch (e) { /* 隐私模式等情况下 localStorage 可能不可用 */ }

// 菜单按钮的点击已由 React 的 Menu 组件通过回调触发（onStart/onRole），
// 这里只需把面板函数暴露到 window 供其调用（module 作用域不会自动挂 window）
window.openGamePanel = openGamePanel;
window.openRolePanel = openRolePanel;

// ---------- 面板结构 ----------

function openRolePanel() {
    if (document.querySelector('.role-mask')) return; // 防止重复打开

    const mask = document.createElement('div');
    mask.className = 'role-mask';
    mask.innerHTML = `
        <div class="role-panel">
            <div class="role-head">
                <span class="role-title">角色选择</span>
                <span class="role-close" title="关闭">×</span>
            </div>
            <div class="role-grid"></div>
            <div class="role-foot"></div>
        </div>`;
    document.body.appendChild(mask);

    // 关闭面板：点 × 或点面板外的暗色区域
    mask.querySelector('.role-close').addEventListener('click', () => mask.remove());
    mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });

    updateRoleFoot(mask);
    loadRoles(mask.querySelector('.role-grid'));
}

// ---------- 读取角色（子文件夹）列表 ----------

async function loadRoles(grid) {
    grid.innerHTML = '<div class="role-tip">正在读取角色素材...</div>';

    // 读取优先级：
    // 1. 文件夹句柄（用户在本页手动选过）
    // 2. 后端实时扫描 /api/roles（新增素材刷新页面即可，需启动 server.py）
    // 3. 静态清单 roles.js（file:// 打开时的兜底，由 compress_roles.py 生成）
    let roles;
    if (dirHandle) {
        roles = await listFromHandle(dirHandle);
    } else {
        // 优先用后端实时扫描（/api/roles），新增素材后刷新页面即可看到
        const api = await fetchAssetApi();
        if (api && Array.isArray(api.roles) && api.roles.length) {
            roles = api.roles;
            window.ROLE_LIST = roles; // 覆盖静态清单，立绘和预加载也使用实时结果
            console.log('[角色面板] 使用后端实时扫描，角色数:', roles.length);
        } else if (Array.isArray(window.ROLE_LIST)) {
            roles = window.ROLE_LIST;
            console.log('[角色面板] 使用静态清单 roles.js，角色数:', roles.length);
        } else {
            roles = await listFromFetch();
        }
    }
    console.log('[角色面板] 最终角色数:', roles === null ? '读取失败' : roles.length);

    grid.innerHTML = '';
    if (roles === null) {
        // 既没有清单也读不到服务器：给出手动选择文件夹的入口
        addPickFolderCard(grid);
        addNewRoleCard(grid);
        return;
    }

    // 服务器扫描到 0 个角色，但静态清单里有：说明目录扫描不可用（如 Vite 开发服务器），
    // 退回清单，别让角色面板变成空的
    if (roles.length === 0 && Array.isArray(window.ROLE_LIST) && window.ROLE_LIST.length) {
        roles = window.ROLE_LIST;
    }

    if (roles.length === 0) {
        grid.innerHTML = '<div class="role-tip">角色素材里还没有角色文件夹，请先在 角色素材/ 下新建角色文件夹并放入图片</div>';
    }
    for (const role of roles) await addRoleCard(grid, role);
    addNewRoleCard(grid);
}

// 用文件系统 API 列出"角色素材"下所有子文件夹，并找出每个文件夹里的封面图
async function listFromHandle(handle) {
    const roles = [];
    for await (const entry of handle.values()) {
        if (entry.kind !== 'directory') continue;
        const cover = await findCoverInDir(entry);
        roles.push({ name: entry.name, cover }); // cover: Blob 或 null
    }
    return roles;
}

// 在文件夹里找第一张图片作为封面
async function findCoverInDir(handle) {
    for await (const entry of handle.values()) {
        if (entry.kind === 'file' && /\.(png|jpe?g|gif|webp|bmp)$/i.test(entry.name)) {
            return await entry.getFile(); // 返回 File 对象（Blob）
        }
    }
    return null; // 文件夹里没有图片
}

// 请求后端实时素材清单；后端未启动或 file:// 打开时返回 null
async function fetchAssetApi() {
    try {
        const res = await fetch('/api/roles');
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// fetch 请求"角色素材/"目录列表页，解析出子文件夹及其封面
// 注意：只有通过本地服务器访问时才有效，直接双击打开会因安全限制失败
async function listFromFetch() {
    try {
        const res = await fetch('./角色素材/');
        if (!res.ok) return null;
        const html = await res.text();
        const dirs = parseListing(html).dirs;

        // 逐个文件夹找封面图片
        const roles = [];
        for (const dir of dirs) {
            let cover = null;
            try {
                const sub = await fetch('./角色素材/' + encodeURIComponent(dir) + '/');
                if (sub.ok) {
                    const imgs = parseListing(await sub.text()).files
                        .filter(f => /\.(png|jpe?g|gif|webp|bmp)$/i.test(f));
                    if (imgs.length) {
                        cover = './角色素材/' + encodeURIComponent(dir) + '/'
                              + encodeURIComponent(imgs[0]);
                    }
                }
            } catch { /* 单个文件夹读取失败不影响其他角色 */ }
            roles.push({ name: dir, cover }); // cover: 图片 URL 或 null
        }
        return roles;
    } catch {
        return null; // file:// 直接打开时 fetch 会被浏览器拦截
    }
}

// 解析服务器目录列表页：分离出文件名和子文件夹名
function parseListing(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const files = [], dirs = [];
    for (const a of doc.querySelectorAll('a')) {
        const href = decodeURIComponent(a.getAttribute('href') || '');
        if (!href || href.startsWith('?') || href.startsWith('../')) continue;
        if (href.endsWith('/')) {
            const name = href.replace(/\/+$/, '').split('/').pop();
            if (name) dirs.push(name);
        } else {
            const name = href.split('/').pop();
            if (name) files.push(name);
        }
    }
    return { files, dirs };
}

// ---------- 卡片 ----------

async function addRoleCard(grid, role) {
    const card = document.createElement('div');
    card.className = 'role-card' + (role.name === currentRole ? ' selected' : '');

    if (role.cover) {
        const img = document.createElement('img');
        // cover 可能是 Blob（文件夹句柄方式）或 URL（服务器方式）
        img.src = role.cover instanceof Blob ? URL.createObjectURL(role.cover) : role.cover;
        card.appendChild(img);
    } else {
        // 文件夹里还没有图片：显示占位图
        const ph = document.createElement('div');
        ph.className = 'role-cover-ph';
        ph.textContent = '🧑';
        card.appendChild(ph);
    }

    const label = document.createElement('div');
    label.className = 'role-name';
    label.textContent = role.name;
    card.appendChild(label);

    // 点击卡片 → 选中该角色并记录
    card.addEventListener('click', () => {
        currentRole = role.name;
        try {
            localStorage.setItem('currentRole', role.name); // 持久保存，刷新后仍生效
        } catch (e) { /* 存储不可用时仅本次会话生效 */ }
        grid.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        showToast('已选择角色：' + role.name);
        updateRoleFoot(grid.closest('.role-mask'));
    });

    grid.appendChild(card);
}

// 更新面板底部的"当前角色"显示
function updateRoleFoot(mask) {
    if (!mask) return;
    mask.querySelector('.role-foot').textContent = '当前角色：' + (currentRole || '未选择');
}

// 页面底部弹出提示，2 秒后自动消失
function showToast(msg) {
    const old = document.querySelector('.role-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'role-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
}

// "选择角色素材文件夹"卡片：仅在无法自动读取时出现
function addPickFolderCard(grid) {
    const card = document.createElement('div');
    card.className = 'role-card role-new';
    if (window.showDirectoryPicker) {
        card.textContent = '📁 选择角色素材文件夹';
        card.addEventListener('click', async () => {
            try {
                dirHandle = await window.showDirectoryPicker(); // 弹出系统文件夹选择框
            } catch {
                return; // 用户取消了选择
            }
            loadRoles(grid); // 重新加载列表
        });
    } else {
        card.textContent = '当前浏览器不支持读取本地文件夹，请改用 Chrome / Edge';
        card.style.cursor = 'default';
    }
    grid.appendChild(card);
}

// "新建角色"卡片
function addNewRoleCard(grid) {
    const card = document.createElement('div');
    card.className = 'role-card role-new';
    card.textContent = '＋ 新建角色';
    card.addEventListener('click', async () => {
        const name = (prompt('请输入新角色的名字：') || '').trim();
        if (!name) return;

        if (dirHandle) {
            // 已连接素材文件夹：真实创建一个以角色名命名的子文件夹
            try {
                await dirHandle.getDirectoryHandle(name, { create: true });
                await addRoleCard(grid, { name, cover: null }); // 新文件夹暂无封面
            } catch (e) {
                alert('创建失败：' + e.message);
            }
        } else {
            // 未连接文件夹：只在本次页面里临时添加
            await addRoleCard(grid, { name, cover: null });
        }
    });
    grid.appendChild(card);
}

// ================== 开始游戏（背景选择 + 游戏场景） ==================
// 读取 image 文件夹里的图片（清单 BG_LIST 由 compress_roles.py 生成），
// 以图片文件名（去扩展名）作为每个选项的名字。
// 选中后出现"开始"按钮；"取消"按钮始终存在。

let selectedBg = null; // 本次面板里选中的背景图片路径

function openGamePanel() {
    if (document.querySelector('.role-mask')) return; // 防止重复打开

    const mask = document.createElement('div');
    mask.className = 'role-mask';
    mask.innerHTML = `
        <div class="role-panel">
            <div class="role-head">
                <span class="role-title">选择游戏背景</span>
                <span class="role-close" title="关闭">×</span>
            </div>
            <div class="role-grid"></div>
            <div class="game-actions">
                <button class="game-btn cancel">取消</button>
                <button class="game-btn start" style="display:none">开始</button>
            </div>
        </div>`;
    document.body.appendChild(mask);

    mask.querySelector('.role-close').addEventListener('click', () => mask.remove());
    mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
    mask.querySelector('.game-btn.cancel').addEventListener('click', () => mask.remove());
    mask.querySelector('.game-btn.start').addEventListener('click', () => {
        if (!selectedBg) return;
        if (!currentRole) {
            showToast('请先在角色选择中选择角色');
            return;
        }
        mask.remove();
        startGame(selectedBg);
    });

    selectedBg = null; // 每次打开都重置选择
    loadBackgrounds(mask.querySelector('.role-grid'));
}

async function loadBackgrounds(grid) {
    grid.innerHTML = '<div class="role-tip">正在读取背景素材...</div>';

    // 优先用后端实时扫描（/api/roles）；不可用时退回静态清单 / 目录扫描
    let list = null;
    const api = await fetchAssetApi();
    if (api && Array.isArray(api.backgrounds) && api.backgrounds.length) {
        list = api.backgrounds;
    } else if (Array.isArray(window.BG_LIST)) {
        list = window.BG_LIST;
    } else {
        try {
            const res = await fetch('./image/背景图选择/');
            if (res.ok) {
                list = parseListing(await res.text()).files
                    .filter(f => /\.(png|jpe?g|gif|webp|bmp)$/i.test(f))
                    .map(f => 'image/背景图选择/' + f);
            }
        } catch { /* file:// 环境且无清单 */ }
    }

    grid.innerHTML = '';
    if (!list || list.length === 0) {
        grid.innerHTML = '<div class="role-tip">image 文件夹里还没有图片。放入图片后运行 python script/compress_roles.py 更新清单</div>';
        return;
    }
    for (const path of list) addBgCard(grid, path);
}

function addBgCard(grid, path) {
    const name = path.split('/').pop().replace(/\.[^.]+$/, ''); // 文件名去扩展名
    const card = document.createElement('div');
    card.className = 'role-card';

    const img = document.createElement('img');
    img.src = './' + path;
    img.alt = name;
    card.appendChild(img);

    const label = document.createElement('div');
    label.className = 'role-name';
    label.textContent = name;
    card.appendChild(label);

    card.addEventListener('click', () => {
        selectedBg = path;
        grid.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        // 选好后显示"开始"按钮
        card.closest('.role-panel').querySelector('.game-btn.start').style.display = '';
    });

    grid.appendChild(card);
}

// 根据好感度范围从当前角色的图片列表里选一张
// 规则：<45 随机选名字为 1 或 2 的 → 45~55 选名字为「角色」的 → >55 随机选 3 或 4
// 没有匹配图时回退到第一张
function pickSpriteByAffection(roleName, affection) {
    if (!roleName || !Array.isArray(window.ROLE_LIST)) return null;
    const role = window.ROLE_LIST.find(r => r.name === roleName);
    if (!role || !Array.isArray(role.images) || role.images.length === 0) return role?.cover || null;

    // 文件名去扩展名后小写
    const base = role.images.map(p => ({ path: p, base: p.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase() }));

    let pool;
    if (affection < 45) {
        pool = base.filter(b => b.base === '1' || b.base === '2');
    } else if (affection > 55) {
        pool = base.filter(b => b.base === '3' || b.base === '4');
    } else {
        pool = base.filter(b => b.base.includes('角色'));
    }

    // 没有匹配图 → 放宽到任意图片
    if (pool.length === 0) pool = base;
    // 随机挑一张
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    return chosen.path;
}

// 给当前角色选一张立绘（按当前好感度），应用到 DOM
function applySpriteToScene() {
    const src = pickSpriteByAffection(currentRole, affectionValue);
    if (!src) return;
    const sprite = document.querySelector('.game-sprite');
    if (sprite) sprite.src = './' + src;
}

// 根据当前选中的角色名，从清单里找出封面图路径（角色选择面板用，不参与好感度选图）
function getRoleCover() {
    if (!currentRole || !Array.isArray(window.ROLE_LIST)) return null;
    const role = window.ROLE_LIST.find(r => r.name === currentRole);
    return role ? role.cover : null;
}

// ================== 场景路由（hash） ==================
// 剧情界面 = #/game，主菜单 = #/ 。刷新时按 URL 恢复对应界面，不会退回菜单。
const GAME_ROUTE = '#/game';
const GAME_BG_KEY = 'gameBg'; // 当前剧情背景的 localStorage 键

let gameActive = false; // 当前是否处于剧情界面

function isGameRoute() {
    return location.hash === GAME_ROUTE;
}

// ================== 场景加载 ==================
// 点"开始"后先显示遮罩，把背景图和角色素材里的图片全部载入缓存，再渲染场景
let gameLoading = false; // 加载中，防止重复触发

function setGameLoading(on) {
    const el = document.querySelector('.game-loading');
    if (el) el.style.display = on ? 'flex' : 'none';
}

// 预加载单张图片：成功或失败都继续，避免一张坏图卡住整个流程
function preloadImage(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            // 解码完成后再算缓存好，进入场景时不会出现图片闪一下
            if (img.decode) img.decode().then(resolve, resolve);
            else resolve();
        };
        img.onerror = resolve;
        img.src = src;
    });
}

// 待缓存清单：当前背景 + 当前角色的图片（不再预加载所有角色，避免卡顿）
function gameAssetUrls(bgPath) {
    const urls = ['./' + bgPath];
    if (Array.isArray(window.ROLE_LIST) && currentRole) {
        const role = window.ROLE_LIST.find(r => r.name === currentRole);
        if (role) {
            if (Array.isArray(role.images) && role.images.length) {
                for (const p of role.images) urls.push('./' + p);
            } else if (role.cover) {
                urls.push('./' + role.cover);
            }
        }
    }
    return [...new Set(urls)];
}

// 开始游戏：记录背景 → 显示加载遮罩 → 缓存素材 → 渲染场景 → 切换路由
// 全局好感度（跨角色共享），缓存值；实际以 /api/affection 返回为准
let affectionValue = 50;

// 更新好感度条 UI（可选：显示本次变化 "+5" / "-3"）
function renderAffection(value, delta) {
    affectionValue = value;
    const bar = document.querySelector('.game-love-fill');
    const num = document.querySelector('.game-love-num');
    if (bar) bar.style.width = Math.max(0, Math.min(100, value)) + '%';
    if (num) num.textContent = value;

    // 显示 "+5" / "-3" 变化提示，1.2 秒后自动消失
    const oldTip = document.querySelector('.game-love-delta');
    if (oldTip) oldTip.remove();
    if (typeof delta === 'number' && delta !== 0) {
        const tip = document.createElement('span');
        tip.className = 'game-love-delta';
        tip.textContent = (delta > 0 ? '+' : '') + delta;
        tip.style.color = delta > 0 ? '#77ff99' : '#ff7777';
        document.querySelector('.game-love')?.appendChild(tip);
        setTimeout(() => tip.remove(), 1200);
    }
}

// 从后端拉当前好感度（刷新恢复时用）
async function fetchAffection() {
    try {
        const res = await fetch('/api/affection');
        if (res.ok) {
            const d = await res.json();
            if (typeof d.affection === 'number') {
                affectionValue = d.affection;
                renderAffection(affectionValue);
            }
        }
    } catch { /* 后端不可用时保持默认值 */ }
}

// 向后端推送好感度修改（set / change / reset），UI 本地先改再同步
async function adjustAffection(action, payload) {
    let optimistic = affectionValue;
    if (action === 'set') optimistic = Math.max(0, Math.min(100, payload.value));
    else if (action === 'change') optimistic = Math.max(0, Math.min(100, affectionValue + payload.delta));
    else if (action === 'reset') optimistic = 50;

    // 先乐观更新 UI（带 delta 动效）
    const delta = (action === 'change') ? payload.delta : (optimistic - affectionValue);
    renderAffection(optimistic, delta);
    applySpriteToScene();

    // 再同步后端
    try {
        const res = await fetch('/api/affection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...payload }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.warn('[好感度] 后端同步失败:', err.error || res.status);
        }
    } catch (e) {
        console.warn('[好感度] 后端不可用，已本地修改');
    }
}

// 给好感度条绑定自定义交互：点击数字 → 直接输入；右键 → 重置；hover 出 +/-
function bindLoveEditor() {
    const wrap = document.querySelector('.game-love');
    if (!wrap || wrap.dataset.boundEdit === '1') return;
    wrap.dataset.boundEdit = '1';

    const numEl = wrap.querySelector('.game-love-num');
    const barEl = wrap.querySelector('.game-love-bar');

    // 点击数字 → 弹出输入框直接设置
    numEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const v = parseInt(prompt('设置好感度（0~100）：', affectionValue), 10);
        if (isNaN(v)) return;
        adjustAffection('set', { value: v });
    });

    // 右键 → 重置为 50
    wrap.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (confirm('确定重置好感度为 50 吗？')) adjustAffection('reset', {});
    });

    // 点击进度条 → 跳到对应比例
    barEl.addEventListener('click', (e) => {
        const rect = barEl.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        const v = Math.round(pct * 100);
        adjustAffection('set', { value: v });
    });

    // hover 时出现 +/- 按钮
    const btnWrap = document.createElement('span');
    btnWrap.className = 'game-love-btns';
    btnWrap.innerHTML = '<button class="love-btn minus" title="-10">－</button><button class="love-btn plus" title="+10">＋</button>';
    wrap.appendChild(btnWrap);
    btnWrap.querySelector('.love-btn.minus').addEventListener('click', (e) => { e.stopPropagation(); adjustAffection('change', { delta: -10 }); });
    btnWrap.querySelector('.love-btn.plus').addEventListener('click', (e) => { e.stopPropagation(); adjustAffection('change', { delta: +10 }); });
}

async function startGame(bgPath) {
    if (gameLoading) return;
    gameLoading = true;
    try {
        try {
            localStorage.setItem(GAME_BG_KEY, bgPath); // 刷新后据此恢复剧情界面
        } catch (e) { /* 存储不可用时无法跨刷新恢复 */ }

        // 先切到剧情路由，加载途中刷新也能恢复到剧情界面
        if (!isGameRoute()) location.hash = GAME_ROUTE.slice(1);

        setGameLoading(true);
        await Promise.all(gameAssetUrls(bgPath).map(preloadImage));

        if (!isGameRoute()) return; // 加载期间用户已退回菜单
        gameActive = true;
        renderGame(bgPath);

        // 等场景完成首次绘制再撤掉遮罩，避免闪出主菜单
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    } finally {
        setGameLoading(false);
        gameLoading = false;
    }
}

function renderGame(bgPath) {
    // 隐藏主菜单的背景视频和看板娘，给游戏场景让位
    const video = document.querySelector('.bg-video');
    if (video) video.style.display = 'none';
    const girl = document.querySelector('.kanban-girl');
    if (girl) girl.style.display = 'none';

    // 场景结构已静态写在 index.html 里，这里直接取用
    const scene = document.querySelector('.game-scene');
    if (!scene) return;

    // 事件只绑定一次
    if (!scene.dataset.bound) {
        scene.dataset.bound = '1';
        scene.querySelector('.game-exit').addEventListener('click', exitGame);
        const input = scene.querySelector('.game-input');
        const sendBtn = scene.querySelector('.game-send');
        const send = () => sendUserMessage(scene, input, sendBtn);
        sendBtn.addEventListener('click', send);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    }

    scene.querySelector('.game-bg').src = './' + bgPath;

    // 右下角立绘：按当前好感度选图
    const sprite = scene.querySelector('.game-sprite');
    const wrap = scene.querySelector('.game-sprite-wrap');
    const role = currentRole && Array.isArray(window.ROLE_LIST) ? window.ROLE_LIST.find(r => r.name === currentRole) : null;
    const hasImages = role && ((Array.isArray(role.images) && role.images.length) || role.cover);
    if (hasImages) {
        applySpriteToScene(); // 按好感度选图并应用到 DOM
        wrap.style.display = '';
    } else {
        wrap.style.display = 'none';
    }

    scene.querySelector('.game-chat-history').innerHTML = ''; // 每次开局清空对话
    // 云朵气泡同步复位：隐藏并清空上一次的回复
    const cloud = scene.querySelector('.game-cloud');
    if (cloud) {
        cloud.style.display = 'none';
        cloud.querySelector('.game-cloud-text').textContent = '';
    }
    scene.style.display = 'block';

    // 初始化好感度条：先用缓存值渲染，再异步从后端拉最新的；绑定自定义交互
    renderAffection(affectionValue);
    fetchAffection();
    bindLoveEditor();
}

// 分发一条对话：角色回复 → 立绘旁的云朵气泡；用户消息 → 底部历史区
function appendChatLine(scene, text, type) {
    if (type === 'bot') {
        showCloudReply(scene, text);
    } else {
        appendUserBubble(scene, text);
    }
}

// 云朵气泡：显示角色最新回复，大小随内容自适应（宽度 max-content + max-width）
function showCloudReply(scene, text) {
    const cloud = scene.querySelector('.game-cloud');
    if (!cloud) return;
    cloud.querySelector('.game-cloud-text').textContent = text;
    cloud.style.display = 'block';

    // 重新触发弹出动画：先清空再强制回流后恢复
    const box = cloud.querySelector('.game-cloud-box');
    box.style.animation = 'none';
    void box.offsetWidth;
    box.style.animation = '';
}

// 底部历史区：用户消息气泡（名字标签 + 绿色气泡，靠右）
function appendUserBubble(scene, text) {
    const box = scene.querySelector('.game-chat-history');
    const row = document.createElement('div');
    row.className = 'game-chat-line user';

    const name = document.createElement('span');
    name.className = 'game-bubble-name';
    name.textContent = '你';

    const bubble = document.createElement('div');
    bubble.className = 'game-bubble';
    bubble.textContent = text;

    row.appendChild(name);
    row.appendChild(bubble);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight; // 滚到底部
}

// 发送用户消息 → 调用后端 /api/chat
async function sendUserMessage(scene, input, sendBtn) {
    const userText = input.value.trim();
    if (!userText) return;

    appendChatLine(scene, userText, 'user');
    input.value = '';
    sendBtn.disabled = true;

    try {
        const resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_text: userText,
                role_name: currentRole,
            }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || '请求失败');
        appendChatLine(scene, data.reply, 'bot');
        // 更新好感度条：后端返回新值和变化量
        if (typeof data.affection === 'number') {
            renderAffection(data.affection, data.delta);
            applySpriteToScene(); // 立绘随新好感度范围切换
        }
    } catch (err) {
        appendChatLine(scene, '（后端未启动或出错）' + err.message, 'bot');
    } finally {
        sendBtn.disabled = false;
        input.focus();
    }
}

function exitGame() {
    const scene = document.querySelector('.game-scene');
    if (scene) scene.style.display = 'none';
    const video = document.querySelector('.bg-video');
    if (video) video.style.display = '';
    const girl = document.querySelector('.kanban-girl');
    if (girl) girl.style.display = '';

    gameActive = false;
    // 回到菜单路由（replace 不新增历史记录，避免多按一次后退）
    if (location.hash) location.replace('#/');
}

// URL ↔ 界面同步：首屏加载、浏览器前进/后退时都按 URL 恢复
function syncRoute() {
    if (isGameRoute() === gameActive) return; // 已处于对应界面，无需处理

    if (!isGameRoute()) {
        exitGame();
        return;
    }

    let bgPath = null;
    try {
        bgPath = localStorage.getItem(GAME_BG_KEY);
    } catch (e) { /* 存储不可用则无法恢复 */ }

    if (bgPath) {
        startGame(bgPath); // 走同一套加载流程，刷新后也先缓存再进场景
    } else {
        location.replace('#/'); // 没有可恢复的背景，回到主菜单
    }
}

window.addEventListener('hashchange', syncRoute);

// 首屏先拉一次实时素材清单，确保刷新恢复剧情时立绘与预缓存都用最新数据
const startupAssets = await fetchAssetApi();
if (startupAssets && Array.isArray(startupAssets.roles) && startupAssets.roles.length) {
    window.ROLE_LIST = startupAssets.roles;
}

syncRoute(); // 首屏：URL 是 #/game 时直接进入剧情界面
