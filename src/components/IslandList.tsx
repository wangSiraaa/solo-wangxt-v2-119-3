import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import type { IslandInfo } from '../core/types';

type SortKey =
  | 'id'
  | 'faceCount'
  | 'uvArea'
  | 'mirrored'
  | 'overlapTriCount'
  | 'maxAngleDistortion';

/** 数字列统一格式；UV 面积可跨数量级，小值用科学计数法。 */
function fmtArea(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n !== 0 && n < 1e-3) return n.toExponential(1);
  return n.toFixed(3);
}

/**
 * 可排序的 UV 岛清单：逐岛列面数、UV 面积、镜像、与其他岛重叠的三角形
 * 数、最大角度畸变。点击行即选中该岛全部 faceId，2D/3D 视图同步高亮；
 * 再次点击已选岛可从清单取消选择，Shift+点击做并集增删。
 *
 * 清单数据来自 props 的 stats（analyzeMesh 对当前网格的结果）：载入新 OBJ
 * 走 'load'、自动展开走 'replace-mesh'，都会带上全新的 stats 与从 0 开始
 * 重新编号的岛，不会沿用上一个模型的岛编号。
 */
export function IslandList() {
  const { state, selectFaces } = useApp();
  const { mesh, stats, selectedFaceIds } = state;
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortAsc, setSortAsc] = useState(true);

  // 换模型/重新展开（stats 身份变化）时排序回到按编号，避免清单停在
  // 上个模型的排序状态造成“编号乱序”的错觉。
  useEffect(() => {
    setSortKey('id');
    setSortAsc(true);
  }, [stats]);

  const rows = useMemo(() => {
    if (!stats) return [];
    const val = (isl: IslandInfo): number => {
      switch (sortKey) {
        case 'id': return isl.id;
        case 'faceCount': return isl.faceCount;
        case 'uvArea': return isl.uvArea;
        case 'mirrored': return isl.mirrored ? 1 : 0;
        case 'overlapTriCount': return isl.overlapTriCount;
        // null 排到末尾（无论升降序）
        case 'maxAngleDistortion': return isl.maxAngleDistortion ?? Infinity;
      }
    };
    const sorted = [...stats.islands].sort((a, b) => {
      const d = val(a) - val(b);
      return sortAsc ? d : -d;
    });
    return sorted;
  }, [stats, sortKey, sortAsc]);

  // 每个岛相对当前选择集的状态：全部选中 / 部分 / 未选
  const selectionOf = useMemo(() => {
    const map = new Map<number, 'on' | 'part' | 'off'>();
    if (!stats) return map;
    for (const isl of stats.islands) {
      let hit = 0;
      for (const f of isl.faceIds) if (selectedFaceIds.has(f)) hit++;
      map.set(
        isl.id,
        hit === 0 ? 'off' : hit === isl.faceIds.length ? 'on' : 'part',
      );
    }
    return map;
  }, [stats, selectedFaceIds]);

  if (!mesh || !stats) return null;

  const onHeader = (key: SortKey) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      // 编号默认升序；异常指标默认从大到小，便于先看到问题岛
      setSortAsc(key === 'id');
    }
  };

  const onRowClick = (isl: IslandInfo, additive: boolean) => {
    const islandFaces = new Set(isl.faceIds);
    if (additive) {
      // Shift：该岛面已全部在选择集中 => 移除；否则并集加入
      const allIn = isl.faceIds.every((f) => selectedFaceIds.has(f));
      const next = new Set(selectedFaceIds);
      for (const f of islandFaces) {
        if (allIn) next.delete(f);
        else next.add(f);
      }
      selectFaces(next);
      return;
    }
    // 普通点击：已完整选中的岛再点一次 = 取消选择；否则只选该岛
    if (selectionOf.get(isl.id) === 'on') selectFaces(new Set());
    else selectFaces(islandFaces);
  };

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : '';

  return (
    <section className="islands">
      <h3>
        UV 岛清单（{stats.islands.length}）
        <span className="hint" style={{ textTransform: 'none', letterSpacing: 'normal', marginLeft: 6 }}>
          点选岛定位面 · Shift+点选增删
        </span>
      </h3>
      <div
        className="island-table"
        data-testid="island-table"
        role="table"
        aria-label="UV 岛清单"
      >
        <div className="island-head" role="row">
          <button type="button" onClick={() => onHeader('id')}>
            编号{arrow('id')}
          </button>
          <button type="button" title="原始面数" onClick={() => onHeader('faceCount')}>
            面数{arrow('faceCount')}
          </button>
          <button type="button" title="岛内三角形 UV 面积之和" onClick={() => onHeader('uvArea')}>
            UV面积{arrow('uvArea')}
          </button>
          <button type="button" title="是否镜像（岛内存在翻转三角形）" onClick={() => onHeader('mirrored')}>
            镜像{arrow('mirrored')}
          </button>
          <button type="button" title="与其他岛重叠的三角形数" onClick={() => onHeader('overlapTriCount')}>
            重叠三角{arrow('overlapTriCount')}
          </button>
          <button type="button" title="岛内最大 3D/UV 内角偏差" onClick={() => onHeader('maxAngleDistortion')}>
            最大角畸{arrow('maxAngleDistortion')}
          </button>
        </div>
        {rows.map((isl) => {
          const sel = selectionOf.get(isl.id) ?? 'off';
          return (
            <div
              key={isl.id}
              role="row"
              className={`island-row sel-${sel}${isl.mirrored ? ' mirrored' : ''}${
                isl.overlapTriCount > 0 ? ' overlap' : ''
              }`}
              data-island-id={isl.id}
              title={`岛 ${isl.id}：${isl.faceCount} 面 / ${isl.triIds.length} 三角`}
              onClick={(e) => onRowClick(isl, e.shiftKey)}
            >
              <span className="c-id">{isl.id}</span>
              <span>{isl.faceCount}</span>
              <span>{fmtArea(isl.uvArea)}</span>
              <span className={isl.mirrored ? 'tag-bad' : 'tag-none'}>
                {isl.mirrored ? '镜像' : '—'}
              </span>
              <span className={isl.overlapTriCount > 0 ? 'tag-warn' : ''}>
                {isl.overlapTriCount}
              </span>
              <span>
                {isl.maxAngleDistortion === null
                  ? '—'
                  : `${isl.maxAngleDistortion.toFixed(1)}°`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
