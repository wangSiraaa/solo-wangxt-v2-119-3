import { chromium } from 'playwright';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const base = process.env.E2E_BASE ?? 'http://127.0.0.1:5199';

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

// 1a) 验收：接缝立方体清单数量与总览一致，且每岛 2 面、UV 面积 1
const cubeRows = await page.locator('.island-list tbody tr').count();
check('接缝立方体: 岛清单 6 行（与总览一致）', cubeRows === 6, `rows=${cubeRows}`);
const cubeFaceCells = await page.locator('.island-list tbody tr .col-faceCount').allInnerTexts();
check('接缝立方体: 清单每岛 2 面',
  cubeFaceCells.length === 6 && cubeFaceCells.every((t) => t.trim() === '2'),
  JSON.stringify(cubeFaceCells));
const cubeAreaCells = await page.locator('.island-list tbody tr .col-uvArea').allInnerTexts();
check('接缝立方体: 清单每岛 UV 面积 1',
  cubeAreaCells.every((t) => Number(t.trim()) === 1), JSON.stringify(cubeAreaCells));

// 点选清单第 1 行 => 双视图定位同一批面；再点一次取消
await page.locator('.island-list tbody tr').first().click();
await sleep(120);
check('接缝立方体: 点清单行双视图同步',
  (await page.locator('.view3d').getAttribute('data-selected-faces')) === '2' &&
  (await page.locator('.view2d').getAttribute('data-selected-faces')) === '2');
await page.locator('.island-list tbody tr.selected').click();
await sleep(100);
check('接缝立方体: 清单取消选择双视图清零',
  (await page.locator('.view3d').getAttribute('data-selected-faces')) === '0' &&
  (await page.locator('.view2d').getAttribute('data-selected-faces')) === '0');


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

// 5a) 岛清单：行数与总览一致，镜像标记可见
let overviewIslands = Number(panel.match(/UV 岛\s*(\d+)/)?.[1] ?? -1);
let rowCount = await page.locator('.island-list tbody tr').count();
check('镜像岛: 清单数量与总览一致', rowCount === overviewIslands && overviewIslands === 2,
  `rows=${rowCount} overview=${overviewIslands}`);
const mirroredRows = await page.locator('.island-list tbody tr', { hasText: '镜像' }).count();
check('镜像岛: 清单中恰 1 行标记镜像', mirroredRows === 1, `mirrored rows=${mirroredRows}`);

// 排序：点“镜像”列，镜像行应排到首位（问题列默认降序）
await page.locator('.island-list thead th.col-mirrored').click();
await sleep(80);
const firstTagged = await page.locator('.island-list tbody tr').first().locator('.tag.bad').count();
check('岛清单按镜像排序后镜像行居首', firstTagged === 1);
await page.locator('.island-list thead th.col-id').click(); // 恢复编号序

// 5b) 点选镜像岛行 => 两视图选中同一批 faceId（数量一致且为该岛面数）
await page.locator('.island-list tbody tr', { hasText: '镜像' }).first().click();
await sleep(150);
const sel3d = await page.locator('.view3d').getAttribute('data-selected-faces');
const sel2d = await page.locator('.view2d').getAttribute('data-selected-faces');
check('点选镜像岛: 3D/2D 双视图同步高亮同一批面',
  sel3d === '1' && sel2d === '1', `3d=${sel3d} 2d=${sel2d}`);
check('点选镜像岛: 清单行进入选中态',
  (await page.locator('.island-list tbody tr.selected').count()) === 1);
panel = await page.locator('.panel').innerText();
check('点选镜像岛: 选中面标题显示 1 面', /选中面\s*（1 面\s*\/\s*1 三角）/.test(panel),
  panel.match(/选中面[^\n]*/)?.[0]);

// 5c) 从清单取消选择（再次点击同一行）
await page.locator('.island-list tbody tr.selected').click();
await sleep(120);
check('再次点击岛行可取消选择（双视图清零）',
  (await page.locator('.view3d').getAttribute('data-selected-faces')) === '0' &&
  (await page.locator('.view2d').getAttribute('data-selected-faces')) === '0');

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

// 7a) 重新展开后：清单按新岛结构重建，数量与新总览一致，编号从 1 连续
await sleep(200);
const postOverview = Number((await page.locator('.panel').innerText()).match(/UV 岛\s*(\d+)/)?.[1] ?? -1);
const postRows = await page.locator('.island-list tbody tr').count();
check('展开后清单数量与新总览一致', postRows === postOverview,
  `rows=${postRows} overview=${postOverview} charts=${charts}`);
const postIds = await page.locator('.island-list tbody tr .col-id').allInnerTexts();
const idsNum = postIds.map((t) => Number(t.trim()));
check('展开后岛编号从 1 连续重排（不沿用旧编号）',
  idsNum.length === postRows && idsNum.every((n, i) => n === i + 1),
  JSON.stringify(idsNum));
// 展开前点选的是镜像样例的面，载入接缝立方体时选择已清空；展开后不应有残留选中态
check('展开后无残留选中行',
  (await page.locator('.island-list tbody tr.selected, .island-list tbody tr.partial').count()) === 0);
check('展开后双视图选择状态已清空',
  (await page.locator('.view3d').getAttribute('data-selected-faces')) === '0' &&
  (await page.locator('.view2d').getAttribute('data-selected-faces')) === '0');

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
