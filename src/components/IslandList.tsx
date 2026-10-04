import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import type { IslandInfo } from '../core/types';

type SortKey = 'id' | 'faceCount' | 'uvArea' | 'mirrored' | 'overlapTriCount' | 'maxAngle';

const COLUMNS: Array<{ key: SortKey; label: string; title: string }> = [
  { key: 'id', label: '#', title: '岛编号（每次载入/展开重新编号）' },
  { key: 'faceCount', label: '面', title: '原始面数（n 边形按一个面计）' },
  { key: 'uvArea', label: 'UV 面积', title: '岛内三角形 UV 面积之和' },
  { key: 'mirrored', label: '镜像', title: '岛内存在翻转三角形即标记镜像' },
  { key: 'overlapTriCount', label: '重叠△', title: '与其他岛重叠的三角形数' },
  { key: 'maxAngle', label: '最大角畸', title: '岛内 3D/UV 对应内角最大差值（度）' },
];

/** 镜像/重叠等标记置前的小岛排序值，null 一律排到最后（升/降序都在末尾）。 */
function valueOf(isl: IslandInfo, key: SortKey): boolean | number | null {
  switch (key) {
    case 'maxAngle': return isl.maxAngleDistortion;
    default: return isl[key];
  }
}

function cmpValues(a: IslandInfo, b: IslandInfo, key: SortKey): number {
  const va = valueOf(a, key);
  const vb = valueOf(b, key);
  if (va === null || vb === null) {
    if (va === null && vb === null) return 0;
    return va === null ? 1 : -1;
  }
  if (typeof va === 'boolean' && typeof vb === 'boolean') {
    // true（异常）视为“更大”：降序（问题列默认）时镜像行居首。
    return (va === vb ? 0 : va ? 1 : -1);
  }
  return (va as number) - (vb as number);
}

export function IslandList() {
  const { state, selectFaces } = useApp();
  const { stats, selectedFaceIds } = state;
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  // stats 直接来自当前网格：载入新 OBJ / 重新展开都会产生新的 MeshStats，
  // 岛编号随之重建，不会沿用上一个模型的编号。
  const islands = stats?.islands ?? [];

  const rows = useMemo(() => {
    // 主键排序，同值以 id 兜底（Array.prototype.sort 稳定，结果可复现）。
    return [...islands].sort((a, b) => {
      const d = cmpValues(a, b, sortKey);
      return (d !== 0 ? d : a.id - b.id) * sortDir;
    });
  }, [islands, sortKey, sortDir]);

  if (!stats) return null;

  const onHeader = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      // 编号默认升序；问题类列默认把异常排到前面（降序）
      setSortDir(key === 'id' ? 1 : -1);
    }
  };

  const selectIsland = (isl: IslandInfo, additive: boolean) => {
    const islandFaces = new Set(isl.faceIds);
    // 非加选且当前选择恰好是该岛 => 再次点击取消选择（可从清单取消）。
    if (!additive && selectedFaceIds.size === islandFaces.size
      && [...islandFaces].every((f) => selectedFaceIds.has(f))) {
      selectFaces(new Set());
      return;
    }
    if (additive) {
      const next = new Set(selectedFaceIds);
      const allIn = [...islandFaces].every((f) => next.has(f));
      if (allIn) islandFaces.forEach((f) => next.delete(f));
      else islandFaces.forEach((f) => next.add(f));
      selectFaces(next);
    } else {
      selectFaces(islandFaces);
    }
  };

  const selStatus = (isl: IslandInfo): 'all' | 'part' | 'none' => {
    let hit = 0;
    for (const f of isl.faceIds) if (selectedFaceIds.has(f)) hit++;
    if (hit === 0) return 'none';
    return hit === isl.faceIds.length ? 'all' : 'part';
  };

  return (
    <section className="island-list">
      <h3>
        UV 岛清单（{islands.length}）
        {selectedFaceIds.size > 0 && (
          <button className="clear-sel" onClick={() => selectFaces(new Set())}>
            取消选择（{selectedFaceIds.size} 面）
          </button>
        )}
      </h3>
      <div className="isl-table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={`col-${c.key} ${sortKey === c.key ? 'active' : ''}`}
                  title={c.title}
                  onClick={() => onHeader(c.key)}
                >
                  {c.label}
                  {sortKey === c.key && (
                    <span className="sort-arrow">{sortDir === 1 ? '▲' : '▼'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((isl) => {
              const status = selStatus(isl);
              return (
                <tr
                  key={isl.id}
                  className={`isl-row ${status === 'all' ? 'selected' : ''} ${status === 'part' ? 'partial' : ''}`}
                  onClick={(e) => selectIsland(isl, e.shiftKey)}
                  title={[
                    `#${isl.id + 1}：${isl.faceCount} 面 / ${isl.triIds.length} 三角形`,
                    isl.mirrored ? '镜像岛' : '',
                    isl.overlapTriCount ? `${isl.overlapTriCount} 个三角形与其他岛重叠` : '',
                    '点击选中该岛全部面，Shift+点击加选，再次点击取消',
                  ].filter(Boolean).join('\n')}
                >
                  <td className="col-id">
                    <span className={`isl-check ${status}`}>{status === 'all' ? '✓' : status === 'part' ? '–' : ''}</span>
                    {isl.id + 1}
                  </td>
                  <td className="col-faceCount num">{isl.faceCount}</td>
                  <td className="col-uvArea num">{fmtArea(isl.uvArea)}</td>
                  <td className="col-mirrored">
                    {isl.mirrored && <span className="tag bad">镜像</span>}
                  </td>
                  <td className={`col-overlapTriCount num ${isl.overlapTriCount ? 'warn' : ''}`}>
                    {isl.overlapTriCount || ''}
                  </td>
                  <td className={`col-maxAngle num ${isBadAngle(isl.maxAngleDistortion) ? 'warn' : ''}`}>
                    {isl.maxAngleDistortion === null ? '—' : `${isl.maxAngleDistortion.toFixed(1)}°`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        点击行选中该岛全部 faceId（3D 与 2D 同步高亮）；Shift+点击增减；再次点击当前岛或点上方按钮取消。
      </p>
    </section>
  );
}

function isBadAngle(a: number | null): boolean {
  return a !== null && a > 15;
}

function fmtArea(a: number): string {
  if (!Number.isFinite(a)) return '—';
  if (a !== 0 && (a < 0.001 || a >= 1000)) return a.toExponential(2);
  return a.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}
