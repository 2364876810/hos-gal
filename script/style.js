// ================== 角色选择面板 ==================
// 角色以"角色素材"里的子文件夹为单位：
// 每个子文件夹 = 一个角色，文件夹名 = 角色名，文件夹里的第一张图片 = 封面

let dirHandle = null;   // 用户授权过的"角色素材"文件夹句柄（刷新页面后失效，需重新选择）
let currentRole = null; // 当前选中的角色名
try {
    currentRole = localStorage.getItem('currentRole'); // 恢复上次选择的角色
} catch (e) { /* 隐私模式等情况下 localStorage 可能不可用 */ }

// 点击"角色选择"按钮 → 打开面板
document.getElementById('role-btn').addEventListener('click', openRolePanel);
// 点击"开始咨询"按钮 → 打开游戏背景选择面板
document.getElementById('start-btn').addEventListener('click', openGamePanel);

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
    // 2. 服务器自动扫描（本地服务器环境，能发现最新文件夹）
    // 3. 静态清单 roles.js（双击打开 file:// 时唯一可用，由 compress_roles.py 生成）
    let roles;
    if (dirHandle) {
        roles = await listFromHandle(dirHandle);
    } else {
        roles = await listFromFetch();
        if (roles === null && Array.isArray(window.ROLE_LIST)) {
            roles = window.ROLE_LIST;
            console.log('[角色面板] 使用静态清单 roles.js，角色数:', roles.length);
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

    // 优先用静态清单（file:// 可用）；没有清单时尝试服务器目录扫描
    let list = Array.isArray(window.BG_LIST) ? window.BG_LIST : null;
    if (!list) {
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

// 根据当前选中的角色名，从清单里找出封面图路径
function getRoleCover() {
    if (!currentRole || !Array.isArray(window.ROLE_LIST)) return null;
    const role = window.ROLE_LIST.find(r => r.name === currentRole);
    return role ? role.cover : null;
}

function startGame(bgPath) {
    // 隐藏主菜单的背景视频和看板娘，给游戏场景让位
    const video = document.querySelector('.bg-video');
    if (video) video.style.display = 'none';
    const girl = document.querySelector('.kanban-girl');
    if (girl) girl.style.display = 'none';

    let scene = document.querySelector('.game-scene');
    if (!scene) {
        scene = document.createElement('div');
        scene.className = 'game-scene';
        scene.innerHTML = `
            <img class="game-bg" alt="游戏背景">
            <div class="game-sprite-wrap"><img class="game-sprite" alt="角色立绘"></div>
            <div class="game-dialog">
                <div class="game-name"></div>
                <div class="game-text"></div>
            </div>
            <div class="game-exit">返回菜单</div>`;
        document.body.appendChild(scene);
        scene.querySelector('.game-exit').addEventListener('click', exitGame);
    }

    scene.querySelector('.game-bg').src = './' + bgPath;

    // 右下角放当前选中角色的图片
    const sprite = scene.querySelector('.game-sprite');
    const wrap = scene.querySelector('.game-sprite-wrap');
    const cover = getRoleCover();
    if (cover) {
        sprite.src = './' + cover;
        wrap.style.display = '';
    } else {
        wrap.style.display = 'none'; // 该角色文件夹里还没有图片
    }

    scene.querySelector('.game-name').textContent = currentRole;
    scene.querySelector('.game-text').textContent = '（对话内容待接入……）';
    scene.style.display = 'block';
}

function exitGame() {
    const scene = document.querySelector('.game-scene');
    if (scene) scene.style.display = 'none';
    const video = document.querySelector('.bg-video');
    if (video) video.style.display = '';
    const girl = document.querySelector('.kanban-girl');
    if (girl) girl.style.display = '';
}
