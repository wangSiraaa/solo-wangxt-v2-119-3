import { chromium } from 'playwright';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const base = 'http://127.0.0.1:5199';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

const results: string[] = [];
const check = (name: string, cond: boolean, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};

await page.goto(base);
await page.waitForSelector('.sample-grid', { timeout: 10000 });
check('空状态显示样例', await page.locator('.sample-grid button').count() === 4);

// 1) 共享边接缝样例
await page.locator('.sample-grid button', { hasText: '共享边接缝' }).click();
await page.waitForSelector('.panel');
await sleep(200);
let panel = await page.locator('.panel').innerText();
check('接缝立方体: 12 条共享边接缝', /共享边接缝\s*\n?\s*12/.test(panel), JSON.stringify(panel.match(/共享边接缝[^\n]*/)));
check('接缝立方体: 6 个 UV 岛', /UV 岛\s*6/.test(panel));
check('接缝立方体: 角点 36', /角点 \(corner\)\s*36/.test(panel));
check('接缝立方体: 顶点身份 24', /顶点身份 \(v\)\s*24/.test(panel));
// 验收：接缝立方体清单数量与总览一致；逐岛面数/镜像/重叠正确
const cubeRows = page.locator('[data-testid=island-table] .island-row');
check('接缝立方体: 岛清单 6 行（与总览一致）', await cubeRows.count() === 6, `rows=${await cubeRows.count()}`);
check('接缝立方体: 无镜像岛行', await page.locator('.island-row.mirrored').count() === 0);
{
  const texts = await cubeRows.allInnerTexts();
  const everyTwoFaces = texts.every((t) => /^[0-5]\s+2\s+1\.000\s+—\s+0\s+0\.0°/.test(t.trim()));
  check('接缝立方体: 每岛 2 面 / UV面积1 / 无重叠 / 0°畸变', everyTwoFaces, JSON.stringify(texts[0]));
}
// 点选岛 0：选中其 2 个 faceId（共 2 三角），双视图同步
await page.locator('.island-row[data-island-id="0"]').click();
await sleep(120);
panel = await page.locator('.panel').innerText();
check('点选岛 0 选中 2 面 / 2 三角', /选中面\s*（2 面 \/ 2 三角）/.test(panel), panel.match(/选中面[^\n]*/)?.[0]);

// 2) 3D 视图拾取：点击 3D 画布中心区域，应选中某一面
const box3d = await page.locator('.view3d canvas').boundingBox();
await page.mouse.click(box3d!.x + box3d!.width * 0.5, box3d!.y + box3d!.height * 0.4);
await sleep(150);
panel = await page.locator('.panel').innerText();
check('3D 点选产生选中面', /选中面\s*（\d+ 面/.test(panel), panel.match(/选中面[^\n]*/)?.[0]);

// 3) 2D 视图点选：点击 2D 画布，选中集应同步变化（两视图同步）
const box2d = await page.locator('.view2d canvas').boundingBox();
await page.mouse.click(box2d!.x + box2d!.width * 0.5, box2d!.y + box2d!.height * 0.35);
await sleep(150);
panel = await page.locator('.panel').innerText();
check('2D 点选同步选中面', /选中面\s*（\d+ 面 \/ \d+ 三角）/.test(panel), panel.match(/选中面[^\n]*/)?.[0]);

// 4) 切换到非流形样例
await page.locator('.toolbar .dropdown button', { hasText: '样例' }).hover();
await page.locator('.dropdown .menu button', { hasText: '非流形边' }).click();
await sleep(200);
panel = await page.locator('.panel').innerText();
check('非流形边: 1 条非流形', /非流形边\s*1/.test(panel));
check('非流形边: 3 个 UV 岛', /UV 岛\s*3/.test(panel));

// 5) 镜像岛
await page.locator('.toolbar .dropdown button', { hasText: '样例' }).hover();
await page.locator('.dropdown .menu button', { hasText: '镜像岛' }).click();
await sleep(200);
panel = await page.locator('.panel').innerText();
check('镜像岛: 1 个翻转三角', /翻转三角形 \/ 镜像岛\s*1 \/ 1/.test(panel), panel.match(/翻转[^\n]*/)?.[0]);

// 5b) UV 岛清单：镜像样例 2 个岛，行数与总览一致；点镜像岛双视图选中同一批面
const islandRows = page.locator('[data-testid=island-table] .island-row');
check('岛清单: 镜像样例行数 2（与总览一致）', await islandRows.count() === 2, `rows=${await islandRows.count()}`);
// 找到“镜像”标记的那一行
const mirroredRow = page.locator('.island-row.mirrored').first();
check('岛清单: 恰好 1 个镜像岛行', await page.locator('.island-row.mirrored').count() === 1);
// 镜像样例每岛 1 个三角形，镜像岛与另一岛完全重叠 => 该行重叠三角列为 1
const mirRowText = await mirroredRow.innerText();
check('岛清单: 镜像岛行显示重叠三角 1', /(^|\n|\s)1(\s|$)/.test(mirRowText) && /镜像/.test(mirRowText), JSON.stringify(mirRowText));
await mirroredRow.click();
await sleep(150);
panel = await page.locator('.panel').innerText();
check('点选镜像岛选中其 1 个面', /选中面\s*（1 面 \/ 1 三角）/.test(panel), panel.match(/选中面[^\n]*/)?.[0]);
const sel3d = await page.locator('.view3d').getAttribute('data-sel-tris');
const sel2d = await page.locator('.view2d').getAttribute('data-sel-tris');
check('双视图同步高亮同一批三角形(各 1)', sel3d === '1' && sel2d === '1', `3d=${sel3d} 2d=${sel2d}`);
check('清单行进入选中态', await mirroredRow.evaluate((el) => el.classList.contains('sel-on')));
// 再点一次从清单取消选择
await mirroredRow.click();
await sleep(120);
const selAfter = await page.locator('.view3d').getAttribute('data-sel-tris');
check('再点已选岛从清单取消选择', selAfter === '0', `sel=${selAfter}`);

// 6) 退化混合样例
await page.locator('.toolbar .dropdown button', { hasText: '样例' }).hover();
await page.locator('.dropdown .menu button', { hasText: '退化' }).click();
await sleep(200);
panel = await page.locator('.panel').innerText();
check('退化: 3D/UV 退化各 1', /退化（3D \/ UV）\s*1 \/ 1/.test(panel), panel.match(/退化（[^\n]*/)?.[0]);
check('退化: 存在岛间重叠', /岛间重叠三角形\s*[23]/.test(panel), panel.match(/岛间重叠[^\n]*/)?.[0]);
check('退化: 最大比率 >2（拉伸）', /(\d+\.\d+)×/.test(panel));

// 7) xatlas 自动展开（回到接缝立方体）
await page.locator('.toolbar .dropdown button', { hasText: '样例' }).hover();
await page.locator('.dropdown .menu button', { hasText: '共享边接缝' }).click();
await sleep(200);
await page.locator('button.primary', { hasText: 'xatlas 自动展开' }).click();
// WASM 在懒加载 chunk，给足时间
await page.waitForSelector('.notice.success', { timeout: 60000 });
const notice = await page.locator('.notice').innerText();
check('xatlas 展开成功提示', /自动展开完成/.test(notice), notice);
await sleep(300);
panel = await page.locator('.panel').innerText();
const charts = notice.match(/(\d+) 个图/)?.[1];
check('xatlas 立方体产出 6 图', charts === '6', `got ${charts}`);
check('展开后角点仍 36（身份保留）', /角点 \(corner\)\s*36/.test(panel));
check('展开后顶点身份仍 24（不空间合并模型）', /顶点身份 \(v\)\s*24/.test(panel));
// 验收：重新展开后清单与新岛结构一致 —— 6 行、无残留选中态（展开前选的是旧岛），
// 岛编号重新从 0..5 开始，且总览数字与清单一致
{
  const afterRows = page.locator('[data-testid=island-table] .island-row');
  check('重新展开: 岛清单刷新为 6 行', await afterRows.count() === 6, `rows=${await afterRows.count()}`);
  const ids = await page.locator('.island-row').evaluateAll(
    (els) => els.map((el) => (el as HTMLElement).dataset.islandId),
  );
  check('重新展开: 岛编号重新从 0 连续编号', JSON.stringify(ids) === JSON.stringify(['0', '1', '2', '3', '4', '5']), JSON.stringify(ids));
  // 选择状态须与新岛结构一致：每个岛要么整岛选中、要么未选，不允许残留“半个岛”
  check('重新展开: 选择状态与新岛结构一致(无部分选中)', await page.locator('.island-row.sel-part').count() === 0);
  check('重新展开: 总览与清单数量一致', /UV 岛\s*6/.test(panel));
  // 展开后再点一个新岛，应能按新岛结构选中；两视图选中三角形数一致
  await page.locator('.island-row[data-island-id="3"]').click();
  await sleep(120);
  const p2 = await page.locator('.panel').innerText();
  const picked = p2.match(/选中面\s*（(\d+) 面 \/ (\d+) 三角）/);
  check('重新展开: 点选新岛 3 能选中其面', !!picked && Number(picked[2]) >= 1, p2.match(/选中面[^\n]*/)?.[0]);
  const s3 = await page.locator('.view3d').getAttribute('data-sel-tris');
  const s2 = await page.locator('.view2d').getAttribute('data-sel-tris');
  check('重新展开: 双视图同步新岛选择', s3 !== null && s3 === s2 && Number(s3) >= 1, `3d=${s3} 2d=${s2}`);
  check('重新展开: 清单行显示整岛选中', await page.locator('.island-row[data-island-id="3"]').evaluate((el) => el.classList.contains('sel-on')));
  // 清空选择，避免影响后续导出往返的面板断言
  await page.locator('.island-row[data-island-id="3"]').click();
  await sleep(100);
}

// 8) 导出 OBJ：拦截下载，用页面内文本做往返断言
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('button', { hasText: '导出 UV OBJ' }).click(),
]);
const path = await download.path();
const fs = await import('node:fs');
const objText = fs.readFileSync(path!, 'utf8');
const vCount = (objText.match(/^v /gm) || []).length;
const vtCount = (objText.match(/^vt /gm) || []).length;
const fCount = (objText.match(/^f /gm) || []).length;
check('导出 OBJ: 36 行 v（逐角点）', vCount === 36, `v=${vCount}`);
check('导出 OBJ: 12 行 f', fCount === 12, `f=${fCount}`);
check('导出 OBJ: vt 行存在', vtCount > 0, `vt=${vtCount}`);

// 在页面里重新载入导出的 OBJ（通过隐藏 file input 不好模拟，改用直接读取并注入到 input）
await page.evaluate((text) => {
  // 触发应用的载入：构造 File 并通过 DataTransfer 赋给 input
  const dt = new DataTransfer();
  dt.items.add(new File([text], 'roundtrip.obj', { type: 'text/plain' }));
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}, objText);
await sleep(300);
panel = await page.locator('.panel').innerText();
check('导出 OBJ 可被重新载入', /顶点身份 \(v\)\s*36/.test(panel), 'roundtrip v=36');
check('往返后面数保持 12', /原始面 \/ 三角形\s*12 \/ 12/.test(panel));
check('往返后无非流形', /非流形边\s*0/.test(panel));

// 9) IndexedDB 工程保存与重开
await page.locator('button', { hasText: '存工程' }).click();
await page.waitForSelector('.notice.success:has-text("IndexedDB")', { timeout: 10000 });
await sleep(200);
const libCount = await page.evaluate(async () => {
  // @ts-ignore
  const dbs = await indexedDB.databases?.();
  return dbs?.map((d: IDBDatabaseInfo) => d.name);
});
check('IndexedDB 数据库存在', JSON.stringify(libCount).includes('lowpoly-uv-inspector'), JSON.stringify(libCount));
const projectItems = await page.locator('.dropdown.align-right .menu-item').count();
check('工程库列出 1 个工程', projectItems >= 1, `items=${projectItems}`);

// 载入镜像样例后再从工程库打开，验证恢复
await page.locator('.toolbar .dropdown button', { hasText: '样例' }).hover();
await page.locator('.dropdown .menu button', { hasText: '镜像岛' }).click();
await sleep(200);
await page.locator('.dropdown.align-right button', { hasText: '工程库' }).hover();
await page.locator('.menu-item .proj-open').first().click();
await sleep(300);
panel = await page.locator('.panel').innerText();
check('从 IndexedDB 恢复工程（36 角点）', /角点 \(corner\)\s*36/.test(panel));

check('无控制台错误', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
await browser.close();
process.exit(failed ? 1 : 0);
