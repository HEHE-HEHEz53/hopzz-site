/* ============================================================
   studio.hopzz.top — 图形化模块编辑器（modules.js）
   ------------------------------------------------------------
   对外只暴露：
     window.StudioModules = { has(uiId), render(container, ctx) }

   ctx（由 app.js 传入）：
     {
       projectId: string,
       moduleId:  string,
       ui:        string,              // piano-roll | chord-board | ...
       spec:      { label, types, ui, fields },
       data:      {},                  // 该模块的 modulesData
       onSave:    function(nextData)   // 每次改动把「整个模块数据对象」交回去
     }

   约束：
   - 原生 JS，无构建、无 CDN；不修改全局样式表，样式一次性注入 <style id="studio-modules-style">
   - 所有用户数据只用 createElement / textContent / setAttribute 写入，绝不拼 HTML
   - 画布内部可滚动，页面 375px 不横向滚动
   - 每个编辑器的交互都以 onSave(整个数据对象) 结束；本文件不发任何网络请求
   ============================================================ */
(function () {
  'use strict';

  if (window.StudioModules && typeof window.StudioModules.render === 'function') {
    return;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var STYLE_ID = 'studio-modules-style';

  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var BLACK_KEYS = [1, 3, 6, 8, 10];

  // 和弦/片段/事件默认配色（仅用于给新块挑一个顺眼的颜色）
  var PRESET_COLORS = ['#3f8b86', '#5b8fa8', '#c9a227', '#b2543f', '#7d6b9e', '#4b8ce0', '#7aa95c', '#d07a5a'];

  // ================================================================ 样式

  var CSS = `
.sm-editor {
  --sm-ink: var(--text, #232b33);
  --sm-soft: var(--text-dim, #4c5864);
  --sm-dim: var(--text-faint, #939ca7);
  --sm-line: var(--line, rgba(35, 43, 51, 0.09));
  --sm-line-strong: var(--line-strong, rgba(35, 43, 51, 0.17));
  --sm-accent: var(--accent, #3f8b86);
  --sm-accent-2: var(--accent-2, #5b8fa8);
  --sm-accent-soft: var(--accent-soft, rgba(63, 139, 134, 0.11));
  --sm-accent-softer: var(--accent-softer, rgba(63, 139, 134, 0.06));
  --sm-glass: var(--glass, rgba(255, 255, 255, 0.55));
  --sm-glass-soft: var(--glass-soft, rgba(255, 255, 255, 0.42));
  --sm-glass-strong: var(--glass-strong, rgba(255, 255, 255, 0.78));
  --sm-danger: var(--danger, #b2543f);
  --sm-warn: var(--warn, #a8792c);
  --sm-ok: var(--ok, #3f8a63);
  --sm-radius: 12px;
  --sm-radius-sm: 8px;

  position: relative;
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-width: 0;
  max-width: 100%;
  padding: 11px;
  border: 1px solid var(--sm-line);
  border-radius: var(--sm-radius);
  background: var(--sm-glass-soft);
  color: var(--sm-ink);
  font-size: 13px;
  line-height: 1.5;
  overflow: hidden;
}

.sm-editor * { box-sizing: border-box; }
.sm-editor button { font: inherit; }

.sm-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.sm-group {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.sm-spacer { flex: 1 1 auto; }

.sm-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 29px;
  padding: 3px 9px;
  border: 1px solid var(--sm-line-strong);
  border-radius: var(--sm-radius-sm);
  background: var(--sm-glass-strong);
  color: var(--sm-soft);
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
}
.sm-btn:hover { background: var(--sm-accent-softer); border-color: var(--sm-accent); color: var(--sm-ink); }
.sm-btn:active { transform: translateY(1px); }
.sm-btn:focus-visible { outline: 2px solid var(--sm-accent); outline-offset: 1px; }
.sm-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

.sm-btn--icon { width: 29px; padding: 0; font-size: 14px; }
.sm-btn--primary {
  border-color: var(--sm-accent);
  background: var(--sm-accent);
  color: var(--paper, #fff);
  font-weight: 600;
}
.sm-btn--primary:hover { background: var(--sm-accent); color: var(--paper, #fff); filter: brightness(1.05); }
.sm-btn--danger { border-color: var(--sm-danger); color: var(--sm-danger); background: transparent; }
.sm-btn--danger:hover { background: var(--sm-danger); color: var(--paper, #fff); border-color: var(--sm-danger); }
.sm-btn--mini { min-height: 24px; padding: 1px 6px; font-size: 11px; border-radius: 6px; }

.sm-select,
.sm-input {
  min-width: 0;
  max-width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--sm-line-strong);
  border-radius: var(--sm-radius-sm);
  background: var(--sm-glass-strong);
  color: var(--sm-ink);
  font-size: 12px;
  line-height: 1.4;
}
.sm-select:focus,
.sm-input:focus { outline: 2px solid var(--sm-accent); outline-offset: 0; border-color: var(--sm-accent); }
.sm-input--num { width: 68px; font-family: var(--font-mono, monospace); }
.sm-input--hex { width: 100px; font-family: var(--font-mono, monospace); }
.sm-input--time { width: 100%; min-width: 62px; font-family: var(--font-mono, monospace); font-size: 11.5px; }

.sm-field {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.sm-field-label { color: var(--sm-dim); font-size: 11px; white-space: nowrap; }

.sm-readout {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sm-dim);
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.sm-num-val {
  min-width: 20px;
  color: var(--sm-ink);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.sm-hint { margin: 0; color: var(--sm-dim); font-size: 11.5px; }
.sm-note { color: var(--sm-ok); font-size: 11.5px; }
.sm-note--error { color: var(--sm-danger); }

.sm-empty { padding: 18px 12px; text-align: center; color: var(--sm-dim); }
.sm-empty p { margin: 0 0 4px; }

.sm-scroll {
  min-width: 0;
  max-width: 100%;
  overflow: auto;
  border: 1px solid var(--sm-line);
  border-radius: 10px;
  background: var(--sm-glass-strong);
  overscroll-behavior: contain;
}
.sm-scroll--roll { max-height: 360px; }
.sm-scroll--shots { overflow-x: auto; }

.sm-canvas { display: block; max-width: none; }
.sm-canvas--roll { cursor: crosshair; }
.sm-canvas--roll:focus-visible { outline: 2px solid var(--sm-accent); outline-offset: -2px; }

/* ---------- 钢琴卷帘 ---------- */
.sm-pr-bg { fill: var(--sm-glass-strong); }
.sm-pr-left { fill: var(--sm-glass); }
.sm-pr-white { fill: transparent; }
.sm-pr-black { fill: var(--sm-accent-softer); }
.sm-pr-line { stroke: var(--sm-line); stroke-width: 1; }
.sm-pr-line--beat { stroke: var(--sm-line-strong); stroke-width: 1; }
.sm-pr-line--bar { stroke: var(--sm-accent); stroke-width: 1; opacity: 0.5; }
.sm-pr-label { fill: var(--sm-dim); font-family: var(--font-mono, monospace); font-size: 9px; }
.sm-pr-bar-num { fill: var(--sm-dim); font-family: var(--font-mono, monospace); font-size: 9px; }
.sm-pr-note {
  fill: var(--sm-accent);
  stroke: var(--sm-accent-2);
  stroke-width: 1;
  cursor: grab;
}
.sm-pr-note:hover { fill: var(--sm-accent-2); }
.sm-pr-note--selected { stroke: var(--sm-warn); stroke-width: 2; }
.sm-pr-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; min-height: 24px; }
.sm-range { width: 116px; max-width: 40vw; accent-color: var(--sm-accent); }

/* ---------- 和弦块 ---------- */
.sm-chords {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--sm-line);
  border-radius: 10px;
  background: var(--sm-glass-strong);
}
.sm-chord-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 64px;
  max-width: 160px;
  padding: 7px 10px;
  border: 1px solid var(--sm-line-strong);
  border-radius: 10px;
  background: var(--sm-glass-strong);
  color: var(--sm-ink);
  text-align: left;
  cursor: grab;
  touch-action: none;
}
.sm-chord-block:hover { border-color: var(--sm-accent); }
.sm-chord-block--selected { border-color: var(--sm-accent); box-shadow: 0 0 0 2px var(--sm-accent-soft); }
.sm-chord-name { font-size: 15px; font-weight: 600; line-height: 1.25; }
.sm-chord-beats { color: var(--sm-dim); font-size: 10px; }
.sm-chord-degree { color: var(--sm-accent); font-family: var(--font-mono, monospace); font-size: 10px; }
.sm-chord-edit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 7px 8px;
  border: 1px dashed var(--sm-line-strong);
  border-radius: 10px;
}

/* ---------- 片段时间轴 ---------- */
.sm-tl-ruler { position: relative; height: 15px; margin: 0 1px; }
.sm-tl-tick { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--sm-line); }
.sm-tl-tick-label {
  position: absolute;
  top: 0;
  padding-left: 2px;
  color: var(--sm-dim);
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  white-space: nowrap;
  transform: translateX(1px);
}
.sm-tl-track {
  position: relative;
  height: 74px;
  overflow: hidden;
  border: 1px solid var(--sm-line-strong);
  border-radius: 10px;
  background: var(--sm-glass-strong);
  background-image: linear-gradient(var(--sm-line) 1px, transparent 1px);
  background-size: 100% 25%;
}
.sm-tl-block {
  position: absolute;
  top: 8px;
  min-width: 24px;
  height: 56px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 1px;
  padding: 5px 7px;
  overflow: hidden;
  border: 1px solid var(--sm-line-strong);
  border-left: 4px solid var(--sm-block-color, var(--sm-accent));
  border-radius: 8px;
  background: var(--sm-glass-strong);
  color: var(--sm-ink);
  text-align: left;
  cursor: grab;
  touch-action: none;
}
.sm-tl-block:hover { border-color: var(--sm-accent); }
.sm-tl-block--selected { box-shadow: 0 0 0 2px var(--sm-accent-soft); border-color: var(--sm-accent); }
.sm-tl-name { max-width: 100%; overflow: hidden; font-size: 11.5px; font-weight: 600; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.sm-tl-meta { color: var(--sm-dim); font-family: var(--font-mono, monospace); font-size: 9px; white-space: nowrap; }
.sm-tl-selected { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 34px; }

/* 颜色圆点 / 色块通用 */
.sm-color-dot {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--sm-line-strong);
  border-radius: 50%;
  cursor: pointer;
}
.sm-color-dot--selected { outline: 2px solid var(--sm-ink); outline-offset: 1px; }

/* ---------- 色板 ---------- */
.sm-swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--sm-line);
  border-radius: 10px;
  background: var(--sm-glass-strong);
}
.sm-swatch {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  min-width: 0;
  padding: 5px;
  border: 1px solid var(--sm-line-strong);
  border-radius: 9px;
  background: var(--sm-glass-strong);
  color: var(--sm-ink);
  cursor: pointer;
}
.sm-swatch:hover { border-color: var(--sm-accent); }
.sm-swatch--selected { border-color: var(--sm-accent); box-shadow: 0 0 0 2px var(--sm-accent-soft); }
.sm-swatch-chip { height: 42px; border: 1px solid var(--sm-line); border-radius: 6px; }
.sm-swatch-hex {
  overflow: hidden;
  color: var(--sm-dim);
  font-family: var(--font-mono, monospace);
  font-size: 9.5px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-palette-edit { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; min-height: 34px; }
.sm-color-input {
  width: 34px;
  height: 30px;
  padding: 1px;
  border: 1px solid var(--sm-line-strong);
  border-radius: 7px;
  background: var(--sm-glass-strong);
  cursor: pointer;
}

/* ---------- 大纲树 ---------- */
.sm-outline {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border: 1px solid var(--sm-line);
  border-radius: 10px;
  background: var(--sm-glass-strong);
}
.sm-outline-row {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  padding: 2px 3px;
  border-radius: 7px;
}
.sm-outline-row:hover { background: var(--sm-accent-softer); }
.sm-outline-row--selected { background: var(--sm-accent-soft); }
.sm-outline-indent { flex: 0 0 auto; }
.sm-outline-toggle {
  flex: 0 0 auto;
  width: 20px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--sm-dim);
  font-size: 11px;
  cursor: pointer;
}
.sm-outline-toggle:hover { background: var(--sm-accent-softer); color: var(--sm-ink); }
.sm-outline-toggle:disabled { opacity: 0.35; cursor: default; }
.sm-tree-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--sm-ink);
  font: inherit;
  font-size: 12.5px;
}
.sm-tree-input:hover { border-color: var(--sm-line); }
.sm-tree-input:focus { outline: none; border-color: var(--sm-accent); background: var(--sm-glass-strong); }
.sm-outline-actions { display: inline-flex; flex-wrap: wrap; gap: 3px; flex: 0 0 auto; }
.sm-row-btn {
  min-height: 22px;
  padding: 0 6px;
  border: 1px solid var(--sm-line-strong);
  border-radius: 6px;
  background: var(--sm-glass-strong);
  color: var(--sm-soft);
  font-size: 10.5px;
  line-height: 1;
  cursor: pointer;
}
.sm-row-btn:hover { border-color: var(--sm-accent); color: var(--sm-ink); }
.sm-row-btn--danger:hover { border-color: var(--sm-danger); color: var(--sm-danger); }

/* ---------- 镜头表 ---------- */
.sm-shot-table { display: flex; flex-direction: column; min-width: 620px; }
.sm-shot-head,
.sm-shot-row {
  display: grid;
  grid-template-columns: 36px 132px minmax(0, 1fr) minmax(0, 0.8fr) 84px;
  gap: 6px;
  align-items: center;
  padding: 5px 8px;
}
.sm-shot-head {
  position: sticky;
  top: 0;
  z-index: 1;
  border-bottom: 1px solid var(--sm-line);
  background: var(--sm-glass-strong);
  color: var(--sm-dim);
  font-size: 10.5px;
}
.sm-shot-row + .sm-shot-row { border-top: 1px solid var(--sm-line); }
.sm-shot-idx { color: var(--sm-dim); font-family: var(--font-mono, monospace); font-size: 10.5px; text-align: center; }
.sm-shot-times { display: flex; align-items: center; gap: 3px; min-width: 0; }
.sm-shot-times span { color: var(--sm-dim); }
.sm-row-actions { display: flex; gap: 3px; justify-content: flex-end; }

/* ---------- 甘特 ---------- */
.sm-gantt { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.sm-g-ruler { position: relative; height: 15px; margin-left: 126px; }
.sm-g-tick { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--sm-line); }
.sm-g-tick-label {
  position: absolute;
  top: 0;
  padding-left: 2px;
  color: var(--sm-dim);
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  white-space: nowrap;
}
.sm-g-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sm-g-label { flex: 0 0 118px; width: 118px; min-width: 0; font-size: 12px; padding: 4px 7px; }
.sm-g-track {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: 34px;
  overflow: hidden;
  border: 1px solid var(--sm-line);
  border-radius: 8px;
  background: var(--sm-glass-strong);
}
.sm-g-bar {
  position: absolute;
  top: 4px;
  height: 24px;
  min-width: 16px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  overflow: hidden;
  border: 1px solid var(--sm-line-strong);
  border-left: 4px solid var(--sm-bar-color, var(--sm-accent));
  border-radius: 6px;
  background: var(--sm-accent-soft);
  color: var(--sm-ink);
  font-size: 10.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: grab;
  touch-action: none;
}
.sm-g-bar--selected { outline: 2px solid var(--sm-accent); outline-offset: 1px; }
.sm-g-extra { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin: -2px 0 4px 126px; }

.sm-input--invalid { border-color: var(--sm-danger) !important; }
.sm-g-bar:focus-visible { outline: 2px solid var(--sm-accent); outline-offset: 1px; }
.sm-outline-row:focus-within { background: var(--sm-accent-softer); }
.sm-tl-rename { background: var(--sm-glass-strong); border-color: var(--sm-accent); }

.sm-btn--active {
  border-color: var(--sm-accent);
  background: var(--sm-accent-soft);
  color: var(--sm-ink);
  font-weight: 600;
}

.sm-visually-hidden {
  position: absolute !important;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.sm-danger-text { color: var(--sm-danger); }
.sm-finish-warn { color: var(--sm-warn); }

/* ---------- 钢琴卷帘：片段 / 成曲 ---------- */
.sm-pr-content { min-width: 0; }
.sm-pr-layout { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
.sm-pr-parts {
  flex: 0 0 148px;
  width: 148px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--sm-line);
  border-radius: 10px;
  background: var(--sm-glass-strong);
}
.sm-pr-parts-head { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
.sm-pr-part-list { display: flex; flex-direction: column; gap: 3px; min-width: 0; max-height: 220px; overflow: auto; }
.sm-pr-part-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  min-width: 0;
  padding: 5px 7px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--sm-soft);
  text-align: left;
  cursor: pointer;
}
.sm-pr-part-btn:hover { background: var(--sm-accent-softer); color: var(--sm-ink); }
.sm-pr-part-btn--selected {
  border-color: var(--sm-accent);
  background: var(--sm-accent-soft);
  color: var(--sm-ink);
}
.sm-pr-part-name {
  max-width: 100%;
  overflow: hidden;
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-pr-part-meta { color: var(--sm-dim); font-size: 9.5px; font-family: var(--font-mono, monospace); }
.sm-pr-name-input { width: 100%; font-size: 11.5px; }
.sm-pr-parts-actions { display: flex; gap: 4px; flex-wrap: wrap; }
.sm-pr-main { flex: 1 1 auto; min-width: 0; }
.sm-pr-rollbox { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.sm-pr-arrange { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.sm-pr-palette {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 7px;
  border: 1px dashed var(--sm-line-strong);
  border-radius: 9px;
}
.sm-pr-part-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border: 1px solid var(--sm-line-strong);
  border-radius: var(--radius-chip, 999px);
  background: var(--sm-glass-strong);
  color: var(--sm-soft);
  font-size: 11.5px;
  white-space: nowrap;
  cursor: grab;
  touch-action: none;
}
.sm-pr-part-chip:hover { border-color: var(--sm-accent); color: var(--sm-ink); }
.sm-pr-song {
  display: flex;
  align-items: stretch;
  gap: 6px;
  min-height: 58px;
  min-width: 0;
  padding: 8px;
  overflow-x: auto;
  border: 1px solid var(--sm-line-strong);
  border-radius: 10px;
  background: var(--sm-glass-strong);
}
.sm-pr-song-block {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 1px;
  min-width: 78px;
  max-width: 150px;
  padding: 5px 9px;
  border: 1px solid var(--sm-line-strong);
  border-left: 4px solid var(--sm-accent);
  border-radius: 8px;
  background: var(--sm-glass-strong);
  color: var(--sm-ink);
  text-align: left;
  cursor: grab;
  touch-action: none;
}
.sm-pr-song-block:hover { border-color: var(--sm-accent); }
.sm-pr-song-block--selected { box-shadow: 0 0 0 2px var(--sm-accent-soft); border-color: var(--sm-accent); }
.sm-pr-song-name {
  max-width: 100%;
  overflow: hidden;
  font-size: 11.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-pr-song-meta { color: var(--sm-dim); font-family: var(--font-mono, monospace); font-size: 9.5px; white-space: nowrap; }
.sm-pr-empty { padding: 14px 8px; }
.sm-pr-arrange-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 30px; }

/* ---------- 完成 / 发布 ---------- */
.sm-finish-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.sm-finish-badge {
  padding: 3px 10px;
  border: 1px solid var(--sm-line-strong);
  border-radius: var(--radius-chip, 999px);
  background: var(--sm-glass-strong);
  color: var(--sm-dim);
  font-size: 11.5px;
  font-weight: 600;
}
.sm-finish-badge--done {
  border-color: var(--sm-ok);
  background: var(--ok-soft, rgba(63, 138, 99, 0.12));
  color: var(--sm-ok);
}
.sm-finished-at { color: var(--sm-dim); font-size: 10.5px; font-family: var(--font-mono, monospace); }
.sm-finish-body { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.sm-finish-note { width: 100%; resize: vertical; min-height: 46px; }
.sm-upload-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  border: 1px dashed var(--sm-line-strong);
  border-radius: 10px;
  background: var(--sm-glass-strong);
}
.sm-upload-card--filled { border-style: solid; border-color: var(--sm-line-strong); }
.sm-upload-head { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; min-width: 0; }
.sm-upload-title { color: var(--sm-soft); font-size: 12px; font-weight: 600; white-space: nowrap; }
.sm-upload-name {
  flex: 1 1 80px;
  min-width: 0;
  overflow: hidden;
  color: var(--sm-dim);
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-upload-path {
  overflow: hidden;
  color: var(--sm-dim);
  font-family: var(--font-mono, monospace);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-upload-hint { color: var(--sm-dim); font-size: 10.5px; }
.sm-cover-preview {
  max-width: 160px;
  max-height: 120px;
  border: 1px solid var(--sm-line);
  border-radius: 8px;
  object-fit: cover;
}
.sm-upload-video { width: 100%; max-height: 200px; border-radius: 8px; background: var(--sm-glass); }

/* ---------- 音频上传 ---------- */
.sm-audio-fields { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
.sm-audio-fields .sm-field { flex-direction: column; align-items: flex-start; gap: 3px; }
.sm-audio-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--sm-line);
  border-radius: 10px;
  background: var(--sm-glass-strong);
}
.sm-audio-upload { min-width: 0; }
.sm-audio-list { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.sm-audio-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 5px 7px;
  border-top: 1px solid var(--sm-line);
}
.sm-audio-name {
  flex: 1 1 120px;
  min-width: 0;
  overflow: hidden;
  color: var(--sm-soft);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-audio-size { flex: 0 0 auto; color: var(--sm-dim); font-size: 10px; font-family: var(--font-mono, monospace); }
.sm-audio-player { flex: 1 1 180px; min-width: 120px; height: 30px; }

/* ---------- 窄屏 ---------- */@media (max-width: 640px) {
  .sm-editor { padding: 9px; gap: 8px; }
  .sm-toolbar { gap: 5px; }
  .sm-btn { min-height: 27px; padding: 2px 8px; font-size: 11.5px; }
  .sm-btn--icon { width: 27px; }
  .sm-chord-block { min-width: 56px; padding: 6px 8px; }
  .sm-chords { gap: 6px; padding: 6px; }
  .sm-swatches { grid-template-columns: repeat(auto-fill, minmax(74px, 1fr)); gap: 6px; }
  .sm-outline-actions { max-width: 100%; }
  .sm-g-label { flex-basis: 88px; width: 88px; }
  .sm-g-ruler { margin-left: 96px; }
  .sm-g-extra { margin-left: 96px; }
  .sm-readout { font-size: 10px; }
  .sm-tl-block { padding: 4px 6px; }
  .sm-tl-name { font-size: 10.5px; }
  .sm-pr-layout { flex-direction: column; }
  .sm-pr-parts { flex-basis: auto; width: 100%; }
  .sm-pr-part-list { flex-direction: row; flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; max-height: none; }
  .sm-pr-part-btn { flex: 0 0 auto; max-width: 120px; }
  .sm-pr-name-input { width: 130px; }
  .sm-pr-song { min-height: 48px; }
  .sm-pr-song-block { min-width: 66px; }
  .sm-audio-row { align-items: flex-start; }
  .sm-finish-head { gap: 6px; }
}

@media (prefers-reduced-motion: reduce) {
  .sm-editor * { transition: none !important; }
}
`;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  // ================================================================ DOM 工具

  function clear(el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
  }

  function applyProps(el, props) {
    if (!props) return;
    Object.keys(props).forEach(function (key) {
      var value = props[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') { el.className = String(value); return; }
      if (key === 'text') { el.textContent = String(value); return; }
      if (key === 'dataset') {
        Object.keys(value).forEach(function (dataKey) { el.dataset[dataKey] = String(value[dataKey]); });
        return;
      }
      if (key === 'style') {
        if (typeof value === 'string') el.setAttribute('style', value);
        else Object.keys(value).forEach(function (styleKey) { el.style[styleKey] = String(value[styleKey]); });
        return;
      }
      if (key.length > 2 && key.slice(0, 2) === 'on' && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
        return;
      }
      if (key === 'value' || key === 'checked' || key === 'disabled' ||
          key === 'selected' || key === 'indeterminate') {
        el[key] = value;
        return;
      }
      el.setAttribute(key, value === true ? '' : String(value));
    });
  }

  function appendAll(el, children) {
    children.forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      if (Array.isArray(child)) { appendAll(el, child); return; }
      if (child instanceof Node) { el.appendChild(child); return; }
      el.appendChild(document.createTextNode(String(child)));
    });
  }

  function h(tag, props) {
    var el = document.createElement(tag);
    applyProps(el, props);
    appendAll(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (attrs[key] === null || attrs[key] === undefined) return;
        el.setAttribute(key, String(attrs[key]));
      });
    }
    appendAll(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  function setText(el, text) {
    if (el) el.textContent = text === null || text === undefined ? '' : String(text);
  }

  function btn(label, cls, onClick, title) {
    var el = h('button', {
      class: 'sm-btn ' + (cls || ''),
      type: 'button',
      text: label,
      title: title || label,
      'aria-label': title || label
    });
    if (onClick) el.addEventListener('click', onClick);
    return el;
  }

  function iconBtn(label, title, onClick, cls) {
    return btn(label, 'sm-btn--icon ' + (cls || ''), onClick, title);
  }

  function miniBtn(label, title, onClick, cls) {
    return btn(label, 'sm-btn--mini ' + (cls || ''), onClick, title);
  }

  function field(label, control) {
    return h('label', { class: 'sm-field' },
      h('span', { class: 'sm-field-label', text: label }),
      control
    );
  }

  function readoutEl() {
    return h('span', { class: 'sm-readout', role: 'status' });
  }

  function selectEl(options, value, onChange, ariaLabel) {
    var select = h('select', { class: 'sm-select', 'aria-label': ariaLabel || '选项' });
    options.forEach(function (option) {
      select.appendChild(h('option', { value: option.value, text: option.label }));
    });
    select.value = String(value);
    select.addEventListener('change', function () { onChange(select.value); });
    return select;
  }

  function inputEl(props, value, onChange, ariaLabel) {
    var input = h('input', Object.assign({ class: 'sm-input', 'aria-label': ariaLabel || '' }, props || {}));
    if (value !== undefined && value !== null) input.value = String(value);
    if (onChange) {
      input.addEventListener('input', function () { onChange(input.value); });
      input.addEventListener('change', function () { onChange(input.value); });
    }
    return input;
  }

  function numInput(value, onChange, ariaLabel, extra) {
    var input = h('input', Object.assign({
      class: 'sm-input sm-input--num',
      type: 'number',
      step: 'any',
      'aria-label': ariaLabel || '数值'
    }, extra || {}));
    input.value = value === undefined || value === null ? '' : String(value);
    input.addEventListener('input', function () { onChange(input.value); });
    input.addEventListener('change', function () { onChange(input.value); });
    return input;
  }

  // ================================================================ 通用工具

  function clamp(value, min, max) {
    var num = Number(value);
    if (!isFinite(num)) num = min;
    return Math.min(max, Math.max(min, num));
  }

  function toNum(value, fallback) {
    var num = Number(value);
    return isFinite(num) ? num : fallback;
  }

  function toInt(value, fallback) {
    var num = parseInt(value, 10);
    return isFinite(num) ? num : fallback;
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (err) {
      return value;
    }
  }

  function uid(prefix) {
    uiSeq += 1;
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + uiSeq;
  }
  var uiSeq = 0;

  function pad2(num) {
    return num < 10 ? '0' + num : String(num);
  }

  function fmtSec(seconds) {
    var total = Math.max(0, Math.round(toNum(seconds, 0)));
    var min = Math.floor(total / 60);
    var rest = total % 60;
    return min + ':' + pad2(rest);
  }

  var HEX_RE = /^#([0-9a-fA-F]{6})$/;

  function normalizeHex(value) {
    if (typeof value !== 'string') return null;
    var raw = value.trim();
    if (!raw) return null;
    if (raw.charAt(0) !== '#') raw = '#' + raw;
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      return '#' + raw.charAt(1) + raw.charAt(1) + raw.charAt(2) + raw.charAt(2) + raw.charAt(3) + raw.charAt(3);
    }
    raw = raw.toLowerCase();
    return HEX_RE.test(raw) ? raw : null;
  }

  function pickColor(index) {
    return PRESET_COLORS[Math.abs(index || 0) % PRESET_COLORS.length];
  }

  function makeSaver(saveFn, delay) {
    var timer = null;
    function run() {
      if (timer) { clearTimeout(timer); timer = null; }
      try { saveFn(); } catch (err) { if (window.console) window.console.error('[StudioModules] save failed', err); }
    }
    return {
      now: run,
      soon: function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(run, delay || 260);
      },
      cancel: function () {
        if (timer) { clearTimeout(timer); timer = null; }
      }
    };
  }

  var activeSavers = [];
  var saverSink = null;

  function trackSaver(saver) {
    if (saverSink) saverSink.push(saver);
    else activeSavers.push(saver);
    return saver;
  }

  // ================================================================ 拖拽

  var activeDrag = null;

  function cleanupDrag() {
    if (!activeDrag) return;
    try { activeDrag.cleanup(); } catch (err) { /* ignore */ }
    activeDrag = null;
  }

  function startDrag(ev, onMove, onUp) {
    cleanupDrag();
    if (ev && ev.preventDefault) ev.preventDefault();
    function move(moveEv) {
      if (onMove) onMove(moveEv);
    }
    function finish(upEv) {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      activeDrag = null;
      if (onUp) onUp(upEv);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    activeDrag = {
      cleanup: function () {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
      }
    };
  }

  function getRect(el) {
    if (el && typeof el.getBoundingClientRect === 'function') {
      var rect = el.getBoundingClientRect();
      if (rect && (rect.width || rect.height || rect.left || rect.top)) return rect;
      return rect;
    }
    return { left: 0, top: 0, width: 1, height: 1 };
  }

  function pointerPoint(el, ev) {
    var rect = getRect(el);
    return {
      x: (toNum(ev.clientX, 0) - (rect.left || 0)),
      y: (toNum(ev.clientY, 0) - (rect.top || 0)),
      width: rect.width || 1,
      height: rect.height || 1
    };
  }

  function svgPoint(svg, ev, logicalW, logicalH) {
    var rect = getRect(svg);
    var sx = rect.width ? logicalW / rect.width : 1;
    var sy = rect.height ? logicalH / rect.height : 1;
    return {
      x: (toNum(ev.clientX, 0) - (rect.left || 0)) * sx,
      y: (toNum(ev.clientY, 0) - (rect.top || 0)) * sy
    };
  }

  // ================================================================ 数据整理

  function buildPayload(original, patch) {
    var out = clone(original && typeof original === 'object' ? original : {});
    if (!out || typeof out !== 'object') out = {};
    Object.keys(patch || {}).forEach(function (key) { out[key] = patch[key]; });
    return out;
  }

  function normalizeNoteList(raw) {
    var notes = [];
    if (!Array.isArray(raw)) return notes;
    raw.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      notes.push({
        pitch: clamp(toInt(item.pitch, 60), 0, 127),
        start: Math.max(0, Math.round(toNum(item.start, 0))),
        len: Math.max(1, Math.round(toNum(item.len, 1))),
        vel: clamp(toInt(item.vel, 100), 0, 127)
      });
    });
    return notes;
  }

  function normalizeRollData(raw) {
    var data = raw && typeof raw === 'object' ? raw : {};
    var grid = Math.max(16, Math.round(toNum(data.grid, 32) / 16) * 16 || 32);

    var parts = [];
    if (Array.isArray(data.parts)) {
      data.parts.forEach(function (item, index) {
        if (!item || typeof item !== 'object') return;
        parts.push({
          id: String(item.id || uid('part')),
          name: String(item.name || ('片段' + (index + 1))).slice(0, 40),
          notes: normalizeNoteList(item.notes)
        });
      });
    }
    // part id 去重
    var usedIds = {};
    parts.forEach(function (part) {
      if (usedIds[part.id]) part.id = uid('part');
      usedIds[part.id] = true;
    });
    // 兼容旧数据：只有 notes 没有 parts 时，当作唯一片段
    if (!parts.length) {
      parts.push({ id: uid('part'), name: '片段1', notes: normalizeNoteList(data.notes) });
    }

    var partIds = {};
    parts.forEach(function (part) { partIds[part.id] = true; });
    var song = [];
    if (Array.isArray(data.song)) {
      data.song.forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        var partId = String(item.partId || '');
        if (!partIds[partId]) return;
        song.push({ partId: partId, repeat: clamp(toInt(item.repeat, 1), 1, 64) });
      });
    }
    if (!song.length) song.push({ partId: parts[0].id, repeat: 1 });

    return {
      bpm: toNum(data.bpm, 128) || 128,
      grid: grid,
      parts: parts,
      song: song
    };
  }

  function normalizeChordData(raw) {
    var data = raw && typeof raw === 'object' ? raw : {};
    var chords = [];
    if (Array.isArray(data.chords)) {
      data.chords.forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        chords.push({
          name: String(item.name || 'C').slice(0, 24),
          beats: Math.max(0.5, toNum(item.beats, 4))
        });
      });
    }
    return { key: String(data.key || 'C major').slice(0, 32), chords: chords };
  }

  function normalizeSectionData(raw) {
    var data = raw && typeof raw === 'object' ? raw : {};
    var duration = Math.max(10, Math.round(toNum(data.duration, 180)));
    var blocks = [];
    if (Array.isArray(data.blocks)) {
      data.blocks.forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        var start = clamp(Math.round(toNum(item.start, 0)), 0, duration);
        if (start >= duration) start = Math.max(0, duration - 1);
        var len = clamp(Math.round(toNum(item.len, 10)), 1, Math.max(1, duration - start));
        blocks.push({
          id: String(item.id || uid('blk')),
          name: String(item.name || '片段').slice(0, 40),
          start: start,
          len: len,
          color: normalizeHex(item.color) || pickColor(blocks.length)
        });
      });
    }
    blocks.sort(function (a, b) { return a.start - b.start; });
    return { duration: duration, blocks: blocks };
  }

  function normalizePaletteData(raw) {
    var data = raw && typeof raw === 'object' ? raw : {};
    var colors = [];
    if (Array.isArray(data.colors)) {
      data.colors.forEach(function (item) {
        var hex = normalizeHex(typeof item === 'string' ? item : String(item));
        if (hex) colors.push(hex);
      });
    }
    return { colors: colors };
  }

  function normalizeOutlineData(raw) {
    var data = raw && typeof raw === 'object' ? raw : {};
    var nodes = [];
    if (Array.isArray(data.nodes)) {
      data.nodes.forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        nodes.push({
          id: String(item.id || uid('node')),
          text: String(item.text === undefined ? '' : item.text).slice(0, 300),
          depth: clamp(toInt(item.depth, 0), 0, 8),
          collapsed: item.collapsed === true
        });
      });
    }
    return { nodes: nodes };
  }

  function normalizeShotData(raw) {
    var data = raw && typeof raw === 'object' ? raw : {};
    var shots = [];
    if (Array.isArray(data.shots)) {
      data.shots.forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        shots.push({
          id: String(item.id || uid('shot')),
          start: String(item.start === undefined ? '' : item.start).slice(0, 24),
          end: String(item.end === undefined ? '' : item.end).slice(0, 24),
          shot: String(item.shot === undefined ? '' : item.shot).slice(0, 500),
          note: String(item.note === undefined ? '' : item.note).slice(0, 500)
        });
      });
    }
    return { shots: shots };
  }

  function normalizeGanttData(raw) {
    var data = raw && typeof raw === 'object' ? raw : {};
    var events = [];
    if (Array.isArray(data.events)) {
      data.events.forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        var start = Math.max(0, Math.round(toNum(item.start, 0)));
        var end = Math.max(start + 1, Math.round(toNum(item.end, start + 10)));
        events.push({
          id: String(item.id || uid('evt')),
          label: String(item.label || '事件').slice(0, 80),
          start: start,
          end: end,
          color: normalizeHex(item.color) || pickColor(events.length)
        });
      });
    }
    return { events: events };
  }

  function parseTimecode(value) {
    if (value === null || value === undefined) return null;
    var raw = String(value).trim();
    if (!raw) return null;
    if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
    var parts = raw.split(':');
    if (parts.length < 2 || parts.length > 3) return null;
    var total = 0;
    for (var i = 0; i < parts.length; i += 1) {
      if (!/^\d+(\.\d+)?$/.test(parts[i].trim())) return null;
      total = total * 60 + Number(parts[i].trim());
    }
    return total;
  }

  function copyText(text) {
    return new Promise(function (resolve) {
      var wrote = false;
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(text).then(function () { resolve(true); }, function () { resolve(fallbackCopy(text)); });
          return;
        }
      } catch (err) { /* fallthrough */ }
      resolve(fallbackCopy(text));
    });
  }

  function fallbackCopy(text) {
    try {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      area.style.top = '0';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(area);
      return ok;
    } catch (err) {
      return false;
    }
  }

  function flashNote(el, text, isError) {
    if (!el) return;
    el.className = 'sm-note' + (isError ? ' sm-note--error' : '');
    el.textContent = text;
    if (el._smTimer) clearTimeout(el._smTimer);
    el._smTimer = setTimeout(function () {
      el.textContent = '';
    }, 2200);
  }

  // ================================================================ 上传 / 文件工具

  var AUDIO_EXTS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus', '.mid', '.midi'];
  var VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.mkv', '.m4v', '.avi'];
  var IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.svg', '.ico'];

  function extOfPath(path) {
    var name = String(path || '');
    var index = name.lastIndexOf('.');
    return index < 0 ? '' : name.slice(index).toLowerCase();
  }

  function fileBaseName(path) {
    var parts = String(path || '').split('/');
    return parts[parts.length - 1] || '';
  }

  function isAudioPath(path) { return AUDIO_EXTS.indexOf(extOfPath(path)) >= 0; }
  function isVideoPath(path) { return VIDEO_EXTS.indexOf(extOfPath(path)) >= 0; }
  function isImagePath(path) { return IMAGE_EXTS.indexOf(extOfPath(path)) >= 0; }

  function fmtSize(bytes) {
    var num = Number(bytes);
    if (!isFinite(num) || num <= 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var index = 0;
    while (num >= 1024 && index < units.length - 1) {
      num = num / 1024;
      index += 1;
    }
    return (index === 0 ? String(Math.round(num)) : num.toFixed(1)) + ' ' + units[index];
  }

  function fmtDateTime(value) {
    var date = new Date(value);
    if (!value || isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
      ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
  }

  function projectFileUrl(projectId, path) {
    return '/api/projects/' + encodeURIComponent(projectId) + '/file?path=' + encodeURIComponent(path);
  }

  function projectThumbUrl(projectId, path, size) {
    var url = '/api/projects/' + encodeURIComponent(projectId) + '/thumb?path=' + encodeURIComponent(path);
    if (size) url += '&size=' + encodeURIComponent(String(size));
    return url;
  }

  // 上传：POST /api/projects/{id}/upload?path=<目录>，multipart 字段名 files
  function uploadProjectFiles(projectId, files, targetPath) {
    return new Promise(function (resolve, reject) {
      if (!projectId) {
        reject(new Error('缺少项目 ID，无法上传'));
        return;
      }
      if (!files || !files.length) {
        reject(new Error('没有选择文件'));
        return;
      }
      var form = new FormData();
      files.forEach(function (file) { form.append('files', file, file.name); });
      var url = '/api/projects/' + encodeURIComponent(projectId) + '/upload?path=' +
        encodeURIComponent(targetPath || '');
      fetch(url, { method: 'POST', credentials: 'same-origin', body: form }).then(function (response) {
        return response.json().catch(function () { return null; }).then(function (data) {
          if (response.status === 401) {
            throw new Error('登录已过期，请刷新页面重新登录');
          }
          if (!response.ok) {
            throw new Error((data && (data.error || data.detail)) || ('上传失败（' + response.status + '）'));
          }
          if (data && data.ok === false) {
            throw new Error(data.error || '上传失败');
          }
          var uploaded = data && Array.isArray(data.uploaded) ? data.uploaded : [];
          var failed = data && Array.isArray(data.failed) ? data.failed : [];
          if (!uploaded.length) {
            var first = failed[0];
            throw new Error((first && (first.error || first.name)) || '上传失败');
          }
          resolve({ uploaded: uploaded, failed: failed });
        });
      }).catch(function (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  function pickFile(files) {
    var list = files && typeof files.length === 'number' ? Array.prototype.slice.call(files) : [];
    return list;
  }

  // ================================================================ 1. 钢琴卷帘

  function noteName(pitch) {
    var index = ((pitch % 12) + 12) % 12;
    return NOTE_NAMES[index] + (Math.floor(pitch / 12) - 1);
  }

  function renderPianoRoll(root, ctx) {
    var original = clone(ctx.data || {});
    var data = normalizeRollData(original);
    var state = {
      bpm: data.bpm,
      steps: Math.max(16, Math.round(data.grid / 16) * 16),
      snap: 1,
      mode: 'part',
      parts: data.parts,
      song: data.song,
      selectedPart: 0,
      selectedSong: data.song.length ? 0 : -1,
      selectedNote: -1
    };

    var LEFT = 46;
    var ROW = 13;
    var CELL = 14;
    var TOP = 22;
    var LOW = 36;
    var HIGH = 83;
    var ROWS = HIGH - LOW + 1;
    var justDragged = false;
    var suppressPaletteClick = false;
    var suppressSongClick = false;

    var saver = trackSaver(makeSaver(function () {
      var active = state.parts[state.selectedPart] || state.parts[0];
      ctx.save(clone(buildPayload(original, {
        bpm: state.bpm,
        grid: state.steps,
        notes: active ? active.notes.map(copyNote) : [],
        parts: state.parts.map(function (part) {
          return { id: part.id, name: part.name, notes: part.notes.map(copyNote) };
        }),
        song: state.song.map(function (item) {
          return { partId: item.partId, repeat: item.repeat };
        })
      })));
    }, 240));

    var modePartBtn = btn('编辑片段', '', function () { setMode('part'); });
    var modeSongBtn = btn('编排成曲', '', function () { setMode('arrange'); });
    var readout = readoutEl();
    var hint = h('p', { class: 'sm-hint' });
    var contentHost = h('div', { class: 'sm-pr-content' });
    var bpmInput = numInput(state.bpm, function (value) {
      state.bpm = clamp(toNum(value, 128), 30, 300);
      updateReadout();
      saver.soon();
    }, 'BPM', { min: '30', max: '300', step: '1' });
    bpmInput.addEventListener('change', function () { saver.now(); });

    function copyNote(note) {
      return { pitch: note.pitch, start: note.start, len: note.len, vel: note.vel };
    }

    function partById(id) {
      for (var i = 0; i < state.parts.length; i += 1) {
        if (state.parts[i].id === id) return state.parts[i];
      }
      return null;
    }

    function activeNotes() {
      var part = state.parts[state.selectedPart];
      return part ? part.notes : [];
    }

    function partLengthSteps(part) {
      var max = 0;
      (part && part.notes ? part.notes : []).forEach(function (note) {
        max = Math.max(max, note.start + note.len);
      });
      return Math.max(16, max);
    }

    function totalSongSteps() {
      var total = 0;
      state.song.forEach(function (item) {
        var part = partById(item.partId);
        if (part) total += partLengthSteps(part) * item.repeat;
      });
      return total;
    }

    function secondsFor(steps) {
      return steps * (60 / (state.bpm * 4));
    }

    function updateReadout() {
      if (state.mode === 'part') {
        var notes = activeNotes();
        var minPitch = null;
        var maxPitch = null;
        notes.forEach(function (note) {
          if (minPitch === null || note.pitch < minPitch) minPitch = note.pitch;
          if (maxPitch === null || note.pitch > maxPitch) maxPitch = note.pitch;
        });
        var range = minPitch === null ? '—' : (noteName(minPitch) + '–' + noteName(maxPitch));
        var part = state.parts[state.selectedPart];
        setText(readout, '片段「' + (part ? part.name : '—') + '」 · 音符 ' + notes.length + ' · 音域 ' + range + ' · ' + Math.max(1, Math.round(state.steps / 16)) + ' 小节');
      } else {
        var total = totalSongSteps();
        setText(readout, state.song.length + ' 段 · 总时长 ' + fmtSec(secondsFor(total)) + ' · ' + Math.max(1, Math.round(total / 16)) + ' 小节');
      }
    }

    function setMode(mode) {
      if (state.mode === mode) return;
      state.mode = mode;
      justDragged = false;
      renderContent();
      updateModeButtons();
    }

    function updateModeButtons() {
      modePartBtn.className = 'sm-btn' + (state.mode === 'part' ? ' sm-btn--active' : '');
      modeSongBtn.className = 'sm-btn' + (state.mode === 'arrange' ? ' sm-btn--active' : '');
      modePartBtn.setAttribute('aria-pressed', state.mode === 'part' ? 'true' : 'false');
      modeSongBtn.setAttribute('aria-pressed', state.mode === 'arrange' ? 'true' : 'false');
      setText(hint, state.mode === 'part'
        ? '点网格加音符 · 拖动移动 · 拖右边缘改长度 · 右键或 Delete 删除；左侧管理片段'
        : '把上方片段拖进轨道（或点「加入」）· 拖动块排序 · 选中后改重复次数 / 删除');
    }

    function renderContent() {
      clear(contentHost);
      contentHost.appendChild(state.mode === 'part' ? buildPartMode() : buildArrangeMode());
      updateReadout();
    }

    // ---------------------------------------------------------------- 片段模式

    function buildPartMode() {
      var wrap = h('div', { class: 'sm-pr-layout' });
      var panel = h('aside', { class: 'sm-pr-parts' });
      panel.appendChild(h('div', { class: 'sm-pr-parts-head' },
        h('span', { class: 'sm-field-label', text: '片段' }),
        iconBtn('+', '新增片段', addPart)
      ));

      var list = h('div', { class: 'sm-pr-part-list' });
      state.parts.forEach(function (part, index) {
        var item = h('button', {
          class: 'sm-pr-part-btn' + (index === state.selectedPart ? ' sm-pr-part-btn--selected' : ''),
          type: 'button',
          'data-part-index': String(index),
          'aria-pressed': index === state.selectedPart ? 'true' : 'false'
        },
          h('span', { class: 'sm-pr-part-name', text: part.name }),
          h('span', { class: 'sm-pr-part-meta', text: part.notes.length + ' 音符' })
        );
        item.addEventListener('click', function () {
          if (state.selectedPart === index) return;
          state.selectedPart = index;
          state.selectedNote = -1;
          renderContent();
        });
        list.appendChild(item);
      });
      panel.appendChild(list);

      var selected = state.parts[state.selectedPart];
      if (selected) {
        var nameInput = h('input', {
          class: 'sm-input sm-pr-name-input', type: 'text', maxlength: '40',
          'aria-label': '片段名称', value: selected.name
        });
        nameInput.addEventListener('input', function () {
          selected.name = nameInput.value;
          saver.soon();
          updateReadout();
        });
        nameInput.addEventListener('change', function () { saver.now(); });
        panel.appendChild(field('名称', nameInput));
      }

      panel.appendChild(h('div', { class: 'sm-pr-parts-actions' },
        miniBtn('复制', '复制片段', duplicatePart),
        miniBtn('删除', '删除片段', deletePart, 'sm-btn--danger')
      ));
      wrap.appendChild(panel);

      var main = h('div', { class: 'sm-pr-main' });
      main.appendChild(buildRoll());
      wrap.appendChild(main);
      return wrap;
    }

    function addPart() {
      state.parts.push({ id: uid('part'), name: '片段' + (state.parts.length + 1), notes: [] });
      state.selectedPart = state.parts.length - 1;
      state.selectedNote = -1;
      saver.now();
      renderContent();
    }

    function duplicatePart() {
      var part = state.parts[state.selectedPart];
      if (!part) return;
      var copy = {
        id: uid('part'),
        name: part.name + ' 副本',
        notes: part.notes.map(copyNote)
      };
      state.parts.splice(state.selectedPart + 1, 0, copy);
      state.selectedPart += 1;
      state.selectedNote = -1;
      saver.now();
      renderContent();
    }

    function deletePart() {
      if (state.parts.length <= 1) {
        var only = state.parts[0];
        if (only) only.notes = [];
        saver.now();
        renderContent();
        return;
      }
      var part = state.parts[state.selectedPart];
      state.parts.splice(state.selectedPart, 1);
      state.song = state.song.filter(function (item) { return item.partId !== part.id; });
      if (!state.song.length) {
        state.song.push({ partId: state.parts[0].id, repeat: 1 });
      }
      state.selectedPart = clamp(state.selectedPart, 0, state.parts.length - 1);
      state.selectedNote = -1;
      saver.now();
      renderContent();
    }

    // ---------------------------------------------------------------- 钢琴卷帘

    function buildRoll() {
      var box = h('div', { class: 'sm-pr-rollbox' });
      var barsValue = h('span', { class: 'sm-num-val', text: String(Math.max(1, Math.round(state.steps / 16))) });
      var snapSelect = selectEl([
        { value: '1', label: '1/16' },
        { value: '2', label: '1/8' },
        { value: '4', label: '1/4' }
      ], String(state.snap), function (value) {
        state.snap = Math.max(1, toInt(value, 1));
        updateReadout();
      }, '吸附精度');

      function setBars(count) {
        var bars = clamp(Math.round(count), 1, 64);
        state.steps = bars * 16;
        setText(barsValue, String(bars));
        draw();
        saver.now();
      }

      box.appendChild(h('div', { class: 'sm-toolbar' },
        h('div', { class: 'sm-group' },
          h('span', { class: 'sm-field-label', text: '小节' }),
          iconBtn('−', '减少小节', function () { setBars(Math.round(state.steps / 16) - 1); }),
          barsValue,
          iconBtn('+', '增加小节', function () { setBars(Math.round(state.steps / 16) + 1); })
        ),
        field('吸附', snapSelect),
        h('span', { class: 'sm-spacer' }),
        h('span', { class: 'sm-hint', text: '右键/Delete 删除' })
      ));

      var svg = svgEl('svg', {
        class: 'sm-canvas sm-canvas--roll',
        tabindex: '0',
        role: 'application',
        'aria-label': '钢琴卷帘'
      });
      box.appendChild(h('div', { class: 'sm-scroll sm-scroll--roll' }, svg));

      var velValue = h('span', { class: 'sm-readout', text: '100' });
      var velRange = h('input', {
        class: 'sm-range', type: 'range', min: '0', max: '127', step: '1', value: '100',
        'aria-label': '力度 velocity'
      });
      velRange.disabled = true;
      box.appendChild(h('div', { class: 'sm-pr-foot' },
        field('力度', velRange), velValue,
        h('span', { class: 'sm-hint', text: '0–127（选中音符后）' })
      ));

      function totalW() { return LEFT + state.steps * CELL + 10; }
      function totalH() { return TOP + ROWS * ROW + 10; }

      function snapStep(value) {
        return Math.max(0, Math.round(value / state.snap) * state.snap);
      }

      function noteIndexFromTarget(target) {
        var node = target;
        while (node && node !== svg) {
          if (node.getAttribute) {
            var attr = node.getAttribute('data-note');
            if (attr !== null && attr !== undefined && attr !== '') return Number(attr);
          }
          node = node.parentNode;
        }
        return -1;
      }

      function updateNoteEl(index) {
        var notes = activeNotes();
        var note = notes[index];
        if (!note) return;
        var el = svg.querySelector('[data-note="' + index + '"]');
        if (!el) return;
        el.setAttribute('x', String(LEFT + note.start * CELL));
        el.setAttribute('y', String(TOP + (HIGH - note.pitch) * ROW + 1));
        el.setAttribute('width', String(Math.max(3, note.len * CELL - 1)));
        el.setAttribute('opacity', String(0.35 + 0.65 * (note.vel / 127)));
      }

      function syncVelocity() {
        var note = activeNotes()[state.selectedNote];
        if (!note) {
          velRange.disabled = true;
          velRange.value = '100';
          setText(velValue, '—');
          return;
        }
        velRange.disabled = false;
        velRange.value = String(note.vel);
        setText(velValue, String(note.vel));
      }

      function draw() {
        var width = totalW();
        var height = totalH();
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        clear(svg);

        svg.appendChild(svgEl('rect', { x: 0, y: 0, width: width, height: height, class: 'sm-pr-bg' }));
        svg.appendChild(svgEl('rect', { x: 0, y: TOP, width: LEFT, height: ROWS * ROW, class: 'sm-pr-left' }));

        for (var pitch = HIGH; pitch >= LOW; pitch -= 1) {
          var y = TOP + (HIGH - pitch) * ROW;
          var black = BLACK_KEYS.indexOf(((pitch % 12) + 12) % 12) >= 0;
          svg.appendChild(svgEl('rect', {
            x: LEFT, y: y, width: state.steps * CELL, height: ROW,
            class: black ? 'sm-pr-black' : 'sm-pr-white'
          }));
          if (pitch % 12 === 0) {
            svg.appendChild(svgEl('text', { x: 5, y: y + ROW - 3, class: 'sm-pr-label' }, noteName(pitch)));
          }
        }

        for (var step = 0; step <= state.steps; step += 1) {
          var lineClass = 'sm-pr-line';
          if (step % 16 === 0) lineClass = 'sm-pr-line--bar';
          else if (step % 4 === 0) lineClass = 'sm-pr-line--beat';
          var x = LEFT + step * CELL;
          svg.appendChild(svgEl('line', {
            x1: x, y1: TOP, x2: x, y2: TOP + ROWS * ROW, class: lineClass
          }));
        }

        var bars = Math.max(1, Math.round(state.steps / 16));
        for (var bar = 0; bar < bars; bar += 1) {
          svg.appendChild(svgEl('text', {
            x: LEFT + bar * 16 * CELL + 2, y: 13, class: 'sm-pr-bar-num'
          }, String(bar + 1)));
        }

        activeNotes().forEach(function (note, index) {
          svg.appendChild(svgEl('rect', {
            x: LEFT + note.start * CELL,
            y: TOP + (HIGH - note.pitch) * ROW + 1,
            width: Math.max(3, note.len * CELL - 1),
            height: ROW - 2,
            rx: 3,
            ry: 3,
            'data-note': index,
            class: 'sm-pr-note' + (index === state.selectedNote ? ' sm-pr-note--selected' : ''),
            opacity: 0.35 + 0.65 * (note.vel / 127)
          }));
        });
      }

      svg.addEventListener('click', function (ev) {
        if (justDragged) { justDragged = false; return; }
        var index = noteIndexFromTarget(ev.target);
        if (index >= 0) {
          state.selectedNote = index;
          draw();
          syncVelocity();
          return;
        }
        var point = svgPoint(svg, ev, totalW(), totalH());
        if (point.x < LEFT || point.y < TOP) return;
        var step = snapStep(Math.floor((point.x - LEFT) / CELL));
        var pitch = HIGH - Math.floor((point.y - TOP) / ROW);
        if (pitch < LOW || pitch > HIGH) return;
        activeNotes().push({ pitch: pitch, start: step, len: state.snap, vel: 100 });
        state.selectedNote = activeNotes().length - 1;
        saver.now();
        draw();
        syncVelocity();
        try { if (svg.focus) svg.focus(); } catch (err) { /* ignore */ }
      });

      svg.addEventListener('pointerdown', function (ev) {
        var index = noteIndexFromTarget(ev.target);
        if (index < 0) return;
        var note = activeNotes()[index];
        if (!note) return;
        state.selectedNote = index;
        draw();
        syncVelocity();
        try { if (svg.focus) svg.focus(); } catch (err) { /* ignore */ }

        var point = svgPoint(svg, ev, totalW(), totalH());
        var noteX = LEFT + note.start * CELL;
        var noteW = note.len * CELL;
        var mode = point.x >= noteX + noteW - 8 ? 'resize' : 'move';
        var origin = { start: note.start, pitch: note.pitch, len: note.len };
        var anchor = { x: point.x, y: point.y };
        var moved = false;

        startDrag(ev, function (moveEv) {
          var next = svgPoint(svg, moveEv, totalW(), totalH());
          var dx = next.x - anchor.x;
          var dy = next.y - anchor.y;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
          if (mode === 'move') {
            note.start = snapStep(origin.start + dx / CELL);
            note.pitch = clamp(origin.pitch + Math.round(-dy / ROW), LOW, HIGH);
          } else {
            note.len = Math.max(state.snap, snapStep(origin.len + dx / CELL));
          }
          updateNoteEl(index);
          updateReadout();
        }, function () {
          if (moved) {
            justDragged = true;
            saver.now();
            updateReadout();
          }
        });
      });

      svg.addEventListener('contextmenu', function (ev) {
        var index = noteIndexFromTarget(ev.target);
        if (index < 0) return;
        ev.preventDefault();
        activeNotes().splice(index, 1);
        state.selectedNote = -1;
        saver.now();
        draw();
        syncVelocity();
        updateReadout();
      });

      svg.addEventListener('keydown', function (ev) {
        if (ev.key === 'Delete' || ev.key === 'Backspace') {
          if (state.selectedNote < 0) return;
          ev.preventDefault();
          activeNotes().splice(state.selectedNote, 1);
          state.selectedNote = -1;
          saver.now();
          draw();
          syncVelocity();
          updateReadout();
          return;
        }
        if (ev.key === 'Escape') {
          state.selectedNote = -1;
          draw();
          syncVelocity();
          return;
        }
        if (ev.key === 'Enter') {
          ev.preventDefault();
          var notes = activeNotes();
          var anchorNote = notes[state.selectedNote];
          notes.push({
            pitch: anchorNote ? anchorNote.pitch : 60,
            start: anchorNote ? anchorNote.start + anchorNote.len : 0,
            len: state.snap,
            vel: 100
          });
          state.selectedNote = notes.length - 1;
          saver.now();
          draw();
          syncVelocity();
          updateReadout();
          return;
        }
        if (state.selectedNote < 0) return;
        var note = activeNotes()[state.selectedNote];
        if (!note) return;
        if (ev.key === 'ArrowLeft') {
          ev.preventDefault();
          note.start = Math.max(0, note.start - state.snap);
        } else if (ev.key === 'ArrowRight') {
          ev.preventDefault();
          note.start = note.start + state.snap;
        } else if (ev.key === 'ArrowUp') {
          ev.preventDefault();
          note.pitch = clamp(note.pitch + 1, LOW, HIGH);
        } else if (ev.key === 'ArrowDown') {
          ev.preventDefault();
          note.pitch = clamp(note.pitch - 1, LOW, HIGH);
        } else {
          return;
        }
        saver.now();
        draw();
        syncVelocity();
        updateReadout();
      });

      velRange.addEventListener('input', function () {
        var note = activeNotes()[state.selectedNote];
        if (!note) return;
        note.vel = clamp(toInt(velRange.value, 100), 0, 127);
        setText(velValue, String(note.vel));
        updateNoteEl(state.selectedNote);
        saver.soon();
      });
      velRange.addEventListener('change', function () {
        if (state.selectedNote >= 0) saver.now();
      });

      draw();
      syncVelocity();
      updateReadout();
      return box;
    }

    // ---------------------------------------------------------------- 编排成曲

    function buildArrangeMode() {
      var wrap = h('div', { class: 'sm-pr-arrange' });

      var palette = h('div', { class: 'sm-pr-palette' },
        h('span', { class: 'sm-field-label', text: '片段' })
      );
      state.parts.forEach(function (part) {
        var chip = h('button', {
          class: 'sm-pr-part-chip',
          type: 'button',
          title: '拖进轨道，或点一下追加到结尾',
          'data-part-id': part.id
        },
          h('span', { text: part.name }),
          h('span', { class: 'sm-pr-part-meta', text: part.notes.length + ' 音符' })
        );
        chip.addEventListener('click', function () {
          if (suppressPaletteClick) { suppressPaletteClick = false; return; }
          appendSongEntry(part.id);
        });
        chip.addEventListener('pointerdown', function (ev) {
          beginPaletteDrag(ev, part);
        });
        palette.appendChild(chip);
      });
      wrap.appendChild(palette);

      var track = h('div', { class: 'sm-pr-song' });
      if (!state.song.length) {
        track.appendChild(h('p', { class: 'sm-hint sm-pr-empty', text: '轨道是空的：把上方片段拖进来，或点一下片段。' }));
      }
      state.song.forEach(function (item, index) {
        var part = partById(item.partId);
        var block = h('button', {
          class: 'sm-pr-song-block' + (index === state.selectedSong ? ' sm-pr-song-block--selected' : ''),
          type: 'button',
          'data-song-index': String(index),
          'aria-label': '第 ' + (index + 1) + ' 段 ' + (part ? part.name : '缺失片段')
        },
          h('span', { class: 'sm-pr-song-name', text: part ? part.name : '（片段缺失）' }),
          h('span', { class: 'sm-pr-song-meta', text: '×' + item.repeat + ' · ' + partLengthSteps(part || { notes: [] }) + ' 拍步' })
        );
        block.addEventListener('click', function () {
          if (suppressSongClick) { suppressSongClick = false; return; }
          state.selectedSong = index;
          renderContent();
        });
        block.addEventListener('pointerdown', function (ev) {
          beginSongDrag(ev, index);
        });
        track.appendChild(block);
      });
      wrap.appendChild(track);

      var controls = h('div', { class: 'sm-pr-arrange-controls' });
      var current = state.song[state.selectedSong];
      if (current) {
        var repeatInput = numInput(current.repeat, function (value) {
          current.repeat = clamp(toInt(value, 1), 1, 64);
          saver.soon();
          updateReadout();
        }, '重复次数', { min: '1', max: '64', step: '1' });
        repeatInput.addEventListener('change', function () {
          saver.now();
          renderContent();
        });
        controls.appendChild(field('重复', repeatInput));
        controls.appendChild(h('div', { class: 'sm-group' },
          miniBtn('←', '前移', function () { moveSong(state.selectedSong, -1); }),
          miniBtn('→', '后移', function () { moveSong(state.selectedSong, 1); }),
          miniBtn('删除', '删除该段', function () { removeSongEntry(state.selectedSong); }, 'sm-btn--danger')
        ));
        var total = totalSongSteps();
        controls.appendChild(h('span', {
          class: 'sm-readout',
          text: '总时长 ' + fmtSec(secondsFor(total)) + ' · ' + Math.max(1, Math.round(total / 16)) + ' 小节'
        }));
      } else {
        controls.appendChild(h('span', { class: 'sm-hint', text: '选中一段可改重复次数 / 删除。' }));
      }
      wrap.appendChild(controls);
      return wrap;
    }

    function appendSongEntry(partId) {
      if (!partById(partId)) return;
      state.song.push({ partId: partId, repeat: 1 });
      state.selectedSong = state.song.length - 1;
      saver.now();
      renderContent();
    }

    function moveSong(index, delta) {
      var to = index + delta;
      if (index < 0 || to < 0 || to >= state.song.length) return;
      var moved = state.song.splice(index, 1)[0];
      state.song.splice(to, 0, moved);
      state.selectedSong = to;
      saver.now();
      renderContent();
    }

    function removeSongEntry(index) {
      if (index < 0 || index >= state.song.length) return;
      state.song.splice(index, 1);
      state.selectedSong = clamp(index, 0, state.song.length - 1);
      saver.now();
      renderContent();
    }

    function beginPaletteDrag(ev, part) {
      var startX = toNum(ev.clientX, 0);
      var startY = toNum(ev.clientY, 0);
      var moved = false;
      startDrag(ev, function (moveEv) {
        var dx = toNum(moveEv.clientX, 0) - startX;
        var dy = toNum(moveEv.clientY, 0) - startY;
        if (!moved && Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      }, function (upEv) {
        if (!moved) return;
        var songEl = contentHost.querySelector('.sm-pr-song');
        if (!songEl) return;
        var rect = getRect(songEl);
        var x = toNum(upEv.clientX, 0);
        var y = toNum(upEv.clientY, 0);
        if (x < (rect.left || 0) || x > (rect.left || 0) + (rect.width || 0) ||
            y < (rect.top || 0) || y > (rect.top || 0) + (rect.height || 0)) {
          return;
        }
        var index = state.song.length;
        var blocks = songEl.querySelectorAll('.sm-pr-song-block');
        for (var i = 0; i < blocks.length; i += 1) {
          var blockRect = getRect(blocks[i]);
          if (x < (blockRect.left || 0) + (blockRect.width || 0) / 2) {
            index = i;
            break;
          }
        }
        state.song.splice(index, 0, { partId: part.id, repeat: 1 });
        state.selectedSong = index;
        suppressPaletteClick = true;
        setTimeout(function () { suppressPaletteClick = false; }, 0);
        saver.now();
        renderContent();
      });
    }

    function beginSongDrag(ev, index) {
      var current = index;
      var startX = toNum(ev.clientX, 0);
      var moved = false;
      startDrag(ev, function (moveEv) {
        var dx = toNum(moveEv.clientX, 0) - startX;
        if (!moved && Math.abs(dx) < 6) return;
        moved = true;
        var songEl = contentHost.querySelector('.sm-pr-song');
        if (!songEl) return;
        var blocks = songEl.querySelectorAll('.sm-pr-song-block');
        var target = current;
        for (var i = 0; i < blocks.length; i += 1) {
          var blockRect = getRect(blocks[i]);
          if (toNum(moveEv.clientX, 0) > (blockRect.left || 0) + (blockRect.width || 0) / 2) target = i;
        }
        if (target !== current) {
          var movedItem = state.song.splice(current, 1)[0];
          state.song.splice(target, 0, movedItem);
          current = target;
          state.selectedSong = target;
          renderContent();
        }
      }, function () {
        if (moved) {
          suppressSongClick = true;
          setTimeout(function () { suppressSongClick = false; }, 0);
          saver.now();
        }
      });
    }

    root.appendChild(h('div', { class: 'sm-toolbar' },
      h('div', { class: 'sm-group' }, modePartBtn, modeSongBtn),
      field('BPM', bpmInput),
      h('span', { class: 'sm-spacer' }),
      readout
    ));
    root.appendChild(hint);
    root.appendChild(contentHost);

    updateModeButtons();
    renderContent();
  }

  // ================================================================ 2. 和弦块

  var MAJOR_DEGREES = { 0: 'I', 2: 'ii', 4: 'iii', 5: 'IV', 7: 'V', 9: 'vi', 11: 'vii°' };
  var MINOR_DEGREES = { 0: 'i', 2: 'ii°', 3: 'III', 5: 'iv', 7: 'v', 8: 'VI', 10: 'VII' };

  function noteIndexFromName(name) {
    var match = String(name || '').trim().match(/^([A-Ga-g])([#b]?)/);
    if (!match) return null;
    var letter = match[1].toUpperCase();
    var index = NOTE_NAMES.indexOf(letter);
    if (index < 0) return null;
    if (match[2] === '#') index = (index + 1) % 12;
    if (match[2] === 'b') index = (index + 11) % 12;
    return index;
  }

  function degreeOf(chordName, keyName) {
    var chordRoot = noteIndexFromName(chordName);
    var keyRoot = noteIndexFromName(keyName);
    if (chordRoot === null || keyRoot === null) return String(chordName || '—');
    var diff = (chordRoot - keyRoot + 12) % 12;
    var minor = /(minor|\bmin\b|小调)/i.test(String(keyName || ''));
    var table = minor ? MINOR_DEGREES : MAJOR_DEGREES;
    return table[diff] || String(chordName || '—');
  }

  function renderChordBoard(root, ctx) {
    var original = clone(ctx.data || {});
    var data = normalizeChordData(original);
    var state = { key: data.key, chords: data.chords, selected: data.chords.length ? 0 : -1 };

    var saver = trackSaver(makeSaver(function () {
      ctx.save(clone(buildPayload(original, {
        key: state.key,
        chords: state.chords.map(function (chord) { return { name: chord.name, beats: chord.beats }; })
      })));
    }, 240));

    var keyInput = h('input', {
      class: 'sm-input', type: 'text', maxlength: '32', 'aria-label': '调性',
      placeholder: 'A minor'
    });
    keyInput.value = state.key;
    keyInput.addEventListener('input', function () {
      state.key = keyInput.value;
      renderBlocks();
      saver.soon();
    });
    keyInput.addEventListener('change', function () { saver.now(); });

    var readout = readoutEl();
    var blocksHost = h('div', { class: 'sm-chords' });
    var editHost = h('div', { class: 'sm-chord-edit' });
    var hint = h('p', { class: 'sm-hint', text: '点块编辑名称与拍数 · 拖动块排序 · 下方的级数按调性推算，推不出就显示和弦名' });

    function totalBeats() {
      var sum = 0;
      state.chords.forEach(function (chord) { sum += chord.beats; });
      return sum;
    }

    function updateReadout() {
      setText(readout, state.chords.length + ' 个和弦 · 共 ' + (Math.round(totalBeats() * 100) / 100) + ' 拍 · 调性 ' + (state.key || '—'));
    }

    function renderBlocks() {
      clear(blocksHost);
      state.chords.forEach(function (chord, index) {
        var degree = degreeOf(chord.name, state.key);
        var block = h('button', {
          class: 'sm-chord-block' + (index === state.selected ? ' sm-chord-block--selected' : ''),
          type: 'button',
          'data-index': String(index),
          'aria-label': '和弦 ' + chord.name + '，' + chord.beats + ' 拍'
        },
          h('span', { class: 'sm-chord-name', text: chord.name || '—' }),
          h('span', { class: 'sm-chord-beats', text: chord.beats + ' 拍' }),
          h('span', { class: 'sm-chord-degree', text: degree })
        );
        block.addEventListener('click', function () {
          state.selected = Number(block.getAttribute('data-index'));
          renderBlocks();
          renderEditor();
        });
        block.addEventListener('pointerdown', function (ev) {
          beginReorder(ev, index);
        });
        blocksHost.appendChild(block);
      });
      if (!state.chords.length) {
        blocksHost.appendChild(h('p', { class: 'sm-hint', text: '还没有和弦，点「＋ 和弦」添加。' }));
      }
      updateReadout();
    }

    function beginReorder(ev, index) {
      var startX = toNum(ev.clientX, 0);
      var dragging = false;
      var current = index;
      state.selected = index;
      renderBlocks();
      renderEditor();
      startDrag(ev, function (moveEv) {
        var dx = toNum(moveEv.clientX, 0) - startX;
        if (!dragging && Math.abs(dx) < 6) return;
        dragging = true;
        var blocks = blocksHost.querySelectorAll('.sm-chord-block');
        var target = current;
        for (var i = 0; i < blocks.length; i += 1) {
          var rect = getRect(blocks[i]);
          var center = (rect.left || 0) + (rect.width || 0) / 2;
          if (toNum(moveEv.clientX, 0) > center) target = i;
        }
        if (target !== current) {
          var moved = state.chords.splice(current, 1)[0];
          state.chords.splice(target, 0, moved);
          current = target;
          state.selected = target;
          renderBlocks();
          renderEditor();
        }
      }, function () {
        if (dragging) saver.now();
      });
    }

    function renderEditor() {
      clear(editHost);
      var chord = state.chords[state.selected];
      if (!chord) {
        editHost.appendChild(h('span', { class: 'sm-hint', text: '选中一个和弦后可编辑。' }));
        return;
      }
      var nameInput = h('input', {
        class: 'sm-input', type: 'text', maxlength: '24', 'aria-label': '和弦名称', placeholder: 'Am'
      });
      nameInput.value = chord.name;
      nameInput.addEventListener('input', function () {
        chord.name = nameInput.value;
        renderBlocks();
        saver.soon();
      });
      nameInput.addEventListener('change', function () { saver.now(); });

      var beatsInput = numInput(chord.beats, function (value) {
        chord.beats = Math.max(0.5, toNum(value, 4));
        renderBlocks();
        saver.soon();
      }, '拍数', { min: '0.5', step: '0.5' });
      beatsInput.addEventListener('change', function () { saver.now(); });

      var upBtn = miniBtn('←', '左移', function () { moveSelected(-1); });
      upBtn.disabled = state.selected <= 0;
      var downBtn = miniBtn('→', '右移', function () { moveSelected(1); });
      downBtn.disabled = state.selected >= state.chords.length - 1;
      var deleteBtn = miniBtn('删除', '删除和弦', function () {
        state.chords.splice(state.selected, 1);
        state.selected = Math.min(state.selected, state.chords.length - 1);
        renderBlocks();
        renderEditor();
        saver.now();
      }, 'sm-btn--danger');

      editHost.appendChild(field('名称', nameInput));
      editHost.appendChild(field('拍数', beatsInput));
      editHost.appendChild(h('div', { class: 'sm-group' }, upBtn, downBtn, deleteBtn));
    }

    function moveSelected(delta) {
      var from = state.selected;
      var to = from + delta;
      if (from < 0 || to < 0 || to >= state.chords.length) return;
      var moved = state.chords.splice(from, 1)[0];
      state.chords.splice(to, 0, moved);
      state.selected = to;
      renderBlocks();
      renderEditor();
      saver.now();
    }

    function addChord() {
      var cycle = ['C', 'G', 'Am', 'F', 'Dm', 'Em'];
      state.chords.push({ name: cycle[state.chords.length % cycle.length], beats: 4 });
      state.selected = state.chords.length - 1;
      renderBlocks();
      renderEditor();
      saver.now();
    }

    root.appendChild(h('div', { class: 'sm-toolbar' },
      field('调性', keyInput),
      h('div', { class: 'sm-group' }, btn('＋ 和弦', 'sm-btn--primary', addChord)),
      h('span', { class: 'sm-spacer' }),
      readout
    ));
    root.appendChild(blocksHost);
    root.appendChild(editHost);
    root.appendChild(hint);

    renderBlocks();
    renderEditor();
    updateReadout();
  }

  // ================================================================ 3. 片段时间轴

  function renderSectionTimeline(root, ctx) {
    var original = clone(ctx.data || {});
    var data = normalizeSectionData(original);
    var state = { duration: data.duration, blocks: data.blocks, selected: data.blocks.length ? 0 : -1 };

    var saver = trackSaver(makeSaver(function () {
      ctx.save(clone(buildPayload(original, {
        duration: state.duration,
        blocks: state.blocks.map(function (block) {
          return { id: block.id, name: block.name, start: block.start, len: block.len, color: block.color };
        })
      })));
    }, 220));

    var readout = readoutEl();
    var durationInput = numInput(state.duration, function (value) {
      state.duration = Math.max(10, Math.round(toNum(value, state.duration)));
      state.blocks.forEach(function (block) {
        block.start = clamp(block.start, 0, state.duration - 1);
        block.len = clamp(block.len, 1, state.duration - block.start);
      });
      renderAll();
      saver.soon();
    }, '总时长（秒）', { min: '10', step: '5' });
    durationInput.addEventListener('change', function () { saver.now(); });

    var ruler = h('div', { class: 'sm-tl-ruler' });
    var track = h('div', { class: 'sm-tl-track' });
    var selectedHost = h('div', { class: 'sm-tl-selected' });
    var hint = h('p', { class: 'sm-hint', text: '拖动块移动位置 · 拖右边缘改长度 · 双击块改名 · 下方可改色/删除' });

    function layout() {
      clear(ruler);
      var ticks = 6;
      for (var i = 0; i <= ticks; i += 1) {
        var ratio = i / ticks;
        var tick = h('div', { class: 'sm-tl-tick' });
        tick.style.left = (ratio * 100) + '%';
        ruler.appendChild(tick);
        var label = h('span', { class: 'sm-tl-tick-label', text: fmtSec(state.duration * ratio) });
        label.style.left = (ratio * 100) + '%';
        ruler.appendChild(label);
      }
    }

    function blockStyle(block) {
      var left = (block.start / state.duration) * 100;
      var width = (block.len / state.duration) * 100;
      return {
        left: clamp(left, 0, 99.5) + '%',
        width: clamp(width, 1.2, 100 - clamp(left, 0, 99.5)) + '%'
      };
    }

    function updateBlockGeometry(btnEl, block) {
      var style = blockStyle(block);
      btnEl.style.left = style.left;
      btnEl.style.width = style.width;
    }

    function renderTrack() {
      clear(track);
      state.blocks.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (block) {
        var btnEl = h('button', {
          class: 'sm-tl-block' + (state.selected >= 0 && state.blocks[state.selected] === block ? ' sm-tl-block--selected' : ''),
          type: 'button',
          'aria-label': '片段 ' + block.name
        },
          h('span', { class: 'sm-tl-name', text: block.name }),
          h('span', { class: 'sm-tl-meta', text: fmtSec(block.start) + ' · ' + block.len + 's' })
        );
        var style = blockStyle(block);
        btnEl.style.left = style.left;
        btnEl.style.width = style.width;
        btnEl.style.setProperty('--sm-block-color', block.color);
        btnEl.addEventListener('click', function (ev) {
          if (ev.target && ev.target.tagName === 'INPUT') return;
          ev.stopPropagation();
          state.selected = state.blocks.indexOf(block);
          renderAll();
        });
        btnEl.addEventListener('dblclick', function (ev) {
          ev.stopPropagation();
          inlineRename(btnEl, block);
        });
        btnEl.addEventListener('pointerdown', function (ev) {
          beginBlockDrag(ev, btnEl, block);
        });
        track.appendChild(btnEl);
      });
      if (!state.blocks.length) {
        track.appendChild(h('p', { class: 'sm-hint', style: { padding: '22px 10px' }, text: '还没有片段，点「＋ 片段」添加。' }));
      }
    }

    function beginBlockDrag(ev, btnEl, block) {
      if (ev.target && ev.target.tagName === 'INPUT') return;
      var blockRect = getRect(btnEl);
      var nearRight = toNum(ev.clientX, 0) >= (blockRect.left || 0) + (blockRect.width || 0) - 9;
      var origin = { start: block.start, len: block.len };
      var anchorX = toNum(ev.clientX, 0);
      var trackRect = getRect(track);
      var secPerPx = state.duration / (trackRect.width || 600);
      var moved = false;
      state.selected = state.blocks.indexOf(block);
      renderAll();
      startDrag(ev, function (moveEv) {
        var delta = (toNum(moveEv.clientX, 0) - anchorX) * secPerPx;
        if (Math.abs(delta) > 0.4) moved = true;
        if (nearRight) {
          block.len = clamp(Math.round((origin.len + delta) * 2) / 2, 0.5, state.duration - block.start);
        } else {
          block.start = clamp(Math.round((origin.start + delta) * 2) / 2, 0, state.duration - block.len);
        }
        // 刷新被拖块及其 meta 文本
        var currentBtn = track.querySelector('.sm-tl-block--selected') || btnEl;
        updateBlockGeometry(currentBtn, block);
        var meta = currentBtn.querySelector('.sm-tl-meta');
        if (meta) setText(meta, fmtSec(block.start) + ' · ' + block.len + 's');
      }, function () {
        if (moved) {
          saver.now();
          renderAll();
        }
      });
    }

    function inlineRename(btnEl, block) {
      var existing = track.querySelector('.sm-tl-rename');
      if (existing) return;
      var input = h('input', {
        class: 'sm-input sm-tl-rename', type: 'text', maxlength: '40',
        'aria-label': '片段名称', value: block.name
      });
      // 浮在块上方，避免把 <input> 塞进 <button> 里
      input.style.position = 'absolute';
      input.style.left = btnEl.style.left;
      input.style.top = btnEl.style.top;
      input.style.width = btnEl.style.width;
      input.style.height = btnEl.style.height;
      input.style.zIndex = '3';
      input.style.padding = '4px 6px';
      input.style.fontSize = '11.5px';
      track.appendChild(input);
      input.focus();
      try { input.select(); } catch (err) { /* ignore */ }

      var committed = false;
      function cleanup() {
        if (input.parentNode) input.parentNode.removeChild(input);
      }
      function commit() {
        if (committed) return;
        committed = true;
        block.name = input.value || '片段';
        cleanup();
        saver.now();
        renderAll();
      }
      function cancel() {
        if (committed) return;
        committed = true;
        cleanup();
        renderAll();
      }
      input.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
        else if (ev.key === 'Escape') { cancel(); }
      });
      input.addEventListener('blur', commit);
    }

    function renderSelected() {
      clear(selectedHost);
      var block = state.blocks[state.selected];
      if (!block) {
        selectedHost.appendChild(h('span', { class: 'sm-hint', text: '选中一个片段后可改名 / 改色 / 删除。' }));
        return;
      }
      var nameInput = h('input', {
        class: 'sm-input', type: 'text', maxlength: '40', 'aria-label': '选中片段名称'
      });
      nameInput.value = block.name;
      nameInput.addEventListener('input', function () {
        block.name = nameInput.value;
        renderTrack();
        saver.soon();
      });
      nameInput.addEventListener('change', function () { saver.now(); });

      var colors = h('div', { class: 'sm-group' });
      PRESET_COLORS.forEach(function (color) {
        var dot = h('button', {
          class: 'sm-color-dot' + (block.color === color ? ' sm-color-dot--selected' : ''),
          type: 'button',
          title: color,
          'aria-label': '颜色 ' + color
        });
        dot.style.backgroundColor = color;
        dot.addEventListener('click', function () {
          block.color = color;
          saver.now();
          renderAll();
        });
        colors.appendChild(dot);
      });

      var deleteBtn = miniBtn('删除片段', '删除片段', function () {
        state.blocks.splice(state.selected, 1);
        state.selected = Math.min(state.selected, state.blocks.length - 1);
        saver.now();
        renderAll();
      }, 'sm-btn--danger');

      selectedHost.appendChild(field('名称', nameInput));
      selectedHost.appendChild(colors);
      selectedHost.appendChild(deleteBtn);
    }

    function renderAll() {
      renderTrack();
      renderSelected();
      setText(readout, state.blocks.length + ' 个片段 · 总时长 ' + fmtSec(state.duration));
    }

    function addBlock() {
      var start = 0;
      state.blocks.forEach(function (block) { start = Math.max(start, block.start + block.len); });
      if (start >= state.duration - 1) start = 0;
      var len = Math.max(1, Math.min(30, state.duration - start));
      state.blocks.push({
        id: uid('blk'),
        name: '新片段',
        start: start,
        len: len,
        color: pickColor(state.blocks.length)
      });
      state.selected = state.blocks.length - 1;
      saver.now();
      renderAll();
    }

    track.addEventListener('click', function (ev) {
      if (ev.target === track) {
        state.selected = -1;
        renderAll();
      }
    });

    root.appendChild(h('div', { class: 'sm-toolbar' },
      field('总时长', durationInput),
      h('div', { class: 'sm-group' }, btn('＋ 片段', 'sm-btn--primary', addBlock)),
      h('span', { class: 'sm-spacer' }),
      readout
    ));
    root.appendChild(ruler);
    root.appendChild(track);
    root.appendChild(selectedHost);
    root.appendChild(hint);

    layout();
    renderAll();
  }

  // ================================================================ 4. 色板

  function renderPalette(root, ctx) {
    var original = clone(ctx.data || {});
    var data = normalizePaletteData(original);
    var state = { colors: data.colors, selected: data.colors.length ? 0 : -1 };

    var saver = trackSaver(makeSaver(function () {
      ctx.save(clone(buildPayload(original, {
        colors: state.colors.slice()
      })));
    }, 200));

    var readout = readoutEl();
    var note = h('span', { class: 'sm-note', role: 'status' });
    var grid = h('div', { class: 'sm-swatches' });
    var editHost = h('div', { class: 'sm-palette-edit' });
    var hint = h('p', { class: 'sm-hint', text: '点色块选中 · 用取色器或输入 HEX 改色 · 可删除 · 底部可一键复制全部 HEX' });

    function renderGrid() {
      clear(grid);
      state.colors.forEach(function (color, index) {
        var swatch = h('button', {
          class: 'sm-swatch' + (index === state.selected ? ' sm-swatch--selected' : ''),
          type: 'button',
          'aria-label': '颜色 ' + color
        },
          h('span', { class: 'sm-swatch-chip' }),
          h('span', { class: 'sm-swatch-hex', text: color })
        );
        swatch.querySelector('.sm-swatch-chip').style.backgroundColor = color;
        swatch.addEventListener('click', function () {
          state.selected = index;
          renderAll();
        });
        grid.appendChild(swatch);
      });
      if (!state.colors.length) {
        grid.appendChild(h('p', { class: 'sm-hint', text: '还没有颜色，点「＋ 颜色」添加。' }));
      }
      setText(readout, state.colors.length + ' 个色值');
    }

    function renderEditor() {
      clear(editHost);
      var color = state.colors[state.selected];
      if (!color) {
        editHost.appendChild(h('span', { class: 'sm-hint', text: '选中一个色块后可编辑。' }));
        return;
      }
      var picker = h('input', {
        class: 'sm-color-input', type: 'color', value: color, 'aria-label': '取色器'
      });
      picker.addEventListener('input', function () {
        var hex = normalizeHex(picker.value) || color;
        state.colors[state.selected] = hex;
        renderGrid();
        hexInput.value = hex;
        saver.soon();
      });
      picker.addEventListener('change', function () { saver.now(); });

      var hexInput = h('input', {
        class: 'sm-input sm-input--hex', type: 'text', maxlength: '9', 'aria-label': 'HEX 色值', value: color
      });
      function applyHex(value) {
        var hex = normalizeHex(value);
        if (!hex) {
          hexInput.classList.add('sm-input--invalid');
          flashNote(note, 'HEX 格式不对，例如 #0b1220', true);
          return false;
        }
        hexInput.classList.remove('sm-input--invalid');
        state.colors[state.selected] = hex;
        picker.value = hex;
        hexInput.value = hex;
        renderGrid();
        saver.soon();
        return true;
      }
      hexInput.addEventListener('change', function () {
        if (applyHex(hexInput.value)) saver.now();
      });
      hexInput.addEventListener('input', function () {
        if (normalizeHex(hexInput.value)) applyHex(hexInput.value);
      });

      var deleteBtn = miniBtn('删除', '删除颜色', function () {
        state.colors.splice(state.selected, 1);
        state.selected = Math.min(state.selected, state.colors.length - 1);
        saver.now();
        renderAll();
      }, 'sm-btn--danger');

      editHost.appendChild(field('取色', picker));
      editHost.appendChild(field('HEX', hexInput));
      editHost.appendChild(deleteBtn);
    }

    function renderAll() {
      renderGrid();
      renderEditor();
    }

    function addColor() {
      var next = pickColor(state.colors.length);
      state.colors.push(next);
      state.selected = state.colors.length - 1;
      saver.now();
      renderAll();
    }

    var addBtn = btn('＋ 颜色', 'sm-btn--primary', addColor);
    var copyBtn = btn('复制全部 HEX', '', function () {
      if (!state.colors.length) {
        flashNote(note, '还没有色值可复制', true);
        return;
      }
      copyText(state.colors.join('\n')).then(function (ok) {
        if (ok) flashNote(note, '已复制 ' + state.colors.length + ' 个色值');
        else flashNote(note, '复制失败，请手动选择色值', true);
      });
    });

    root.appendChild(h('div', { class: 'sm-toolbar' },
      h('div', { class: 'sm-group' }, addBtn, copyBtn),
      h('span', { class: 'sm-spacer' }),
      readout
    ));
    root.appendChild(grid);
    root.appendChild(editHost);
    root.appendChild(h('div', { class: 'sm-toolbar' }, note));
    root.appendChild(hint);

    renderAll();
  }

  // ================================================================ 5. 大纲树

  function subtreeEnd(nodes, index) {
    var depth = nodes[index].depth;
    var end = index + 1;
    while (end < nodes.length && nodes[end].depth > depth) end += 1;
    return end;
  }

  function renderOutlineTree(root, ctx) {
    var original = clone(ctx.data || {});
    var data = normalizeOutlineData(original);
    var state = { nodes: data.nodes, selected: data.nodes.length ? 0 : -1 };

    var saver = trackSaver(makeSaver(function () {
      ctx.save(clone(buildPayload(original, {
        nodes: state.nodes.map(function (node) {
          return { id: node.id, text: node.text, depth: node.depth, collapsed: node.collapsed };
        })
      })));
    }, 240));

    var readout = readoutEl();
    var list = h('div', { class: 'sm-outline' });
    var hint = h('p', { class: 'sm-hint', text: '点子节点前的箭头折叠 · 选中行后可缩进/反缩进/加同级/加子级/删除 · 文本直接改' });
    var status = h('span', { class: 'sm-note', role: 'status' });

    function updateReadout() {
      var maxDepth = 0;
      state.nodes.forEach(function (node) { maxDepth = Math.max(maxDepth, node.depth); });
      setText(readout, state.nodes.length + ' 个节点 · 最大缩进 ' + maxDepth);
    }

    function isHidden(index) {
      var depth = state.nodes[index].depth;
      for (var i = index - 1; i >= 0; i -= 1) {
        if (state.nodes[i].depth < depth) {
          if (state.nodes[i].collapsed) return true;
          depth = state.nodes[i].depth;
        }
      }
      return false;
    }

    function hasChildren(index) {
      return index + 1 < state.nodes.length && state.nodes[index + 1].depth > state.nodes[index].depth;
    }

    function renderList() {
      clear(list);
      state.nodes.forEach(function (node, index) {
        if (isHidden(index)) return;
        var selected = index === state.selected;
        var row = h('div', {
          class: 'sm-outline-row' + (selected ? ' sm-outline-row--selected' : ''),
          'data-index': String(index)
        });

        var indent = h('span', { class: 'sm-outline-indent' });
        indent.style.width = (node.depth * 16) + 'px';
        row.appendChild(indent);

        var toggle = h('button', {
          class: 'sm-outline-toggle',
          type: 'button',
          text: node.collapsed ? '▸' : '▾',
          'aria-label': (node.collapsed ? '展开' : '折叠') + '节点',
          'aria-expanded': node.collapsed ? 'false' : 'true'
        });
        toggle.disabled = !hasChildren(index);
        if (!hasChildren(index)) toggle.textContent = '·';
        toggle.addEventListener('click', function (ev) {
          ev.stopPropagation();
          node.collapsed = !node.collapsed;
          saver.now();
          renderList();
        });
        row.appendChild(toggle);

        var textInput = h('input', {
          class: 'sm-tree-input', type: 'text', maxlength: '300', 'aria-label': '节点文本', value: node.text
        });
        textInput.addEventListener('focus', function () {
          if (state.selected === index) return;
          state.selected = index;
          renderList();
          var target = list.querySelector('[data-index="' + index + '"] .sm-tree-input');
          if (target && target.focus) {
            try { target.focus(); } catch (err) { /* ignore */ }
          }
        });
        textInput.addEventListener('input', function () {
          node.text = textInput.value;
          saver.soon();
        });
        textInput.addEventListener('change', function () { saver.now(); });
        row.appendChild(textInput);

        if (selected) {
          var actions = h('div', { class: 'sm-outline-actions' },
            miniBtn('缩进', '缩进', function () { shiftDepth(index, 1); }),
            miniBtn('反缩进', '反缩进', function () { shiftDepth(index, -1); }),
            miniBtn('＋同级', '添加同级节点', function () { addSibling(index); }),
            miniBtn('＋子级', '添加子级节点', function () { addChild(index); }),
            miniBtn('删除', '删除节点', function () { removeNode(index); }, 'sm-btn--danger')
          );
          row.appendChild(actions);
        }

        row.addEventListener('click', function (ev) {
          if (ev.target && ev.target.tagName === 'INPUT') return;
          state.selected = index;
          renderList();
          renderActionsHint();
        });
        list.appendChild(row);
      });

      if (!state.nodes.length) {
        list.appendChild(h('p', { class: 'sm-hint', text: '还没有节点，点「＋ 节点」开始写大纲。' }));
      }
      updateReadout();
    }

    function markSelected(index) {
      var rows = list.querySelectorAll('.sm-outline-row');
      for (var i = 0; i < rows.length; i += 1) {
        var rowIndex = Number(rows[i].getAttribute('data-index'));
        rows[i].classList.toggle('sm-outline-row--selected', rowIndex === index);
      }
    }

    function renderActionsHint() {
      setText(status, '');
    }

    function shiftDepth(index, delta) {
      var node = state.nodes[index];
      if (!node) return;
      var minDepth = 0;
      var end = subtreeEnd(state.nodes, index);
      if (delta > 0) {
        if (node.depth >= 8) return;
        for (var i = index; i < end; i += 1) state.nodes[i].depth = clamp(state.nodes[i].depth + 1, 0, 8);
      } else {
        if (node.depth <= 0) return;
        for (var j = index; j < end; j += 1) state.nodes[j].depth = clamp(state.nodes[j].depth - 1, Math.max(0, minDepth), 8);
      }
      saver.now();
      renderList();
    }

    function addSibling(index) {
      var node = state.nodes[index];
      if (!node) return;
      var end = subtreeEnd(state.nodes, index);
      state.nodes.splice(end, 0, { id: uid('node'), text: '新节点', depth: node.depth, collapsed: false });
      state.selected = end;
      saver.now();
      renderList();
    }

    function addChild(index) {
      var node = state.nodes[index];
      if (!node) return;
      node.collapsed = false;
      state.nodes.splice(index + 1, 0, { id: uid('node'), text: '新子节点', depth: clamp(node.depth + 1, 0, 8), collapsed: false });
      state.selected = index + 1;
      saver.now();
      renderList();
    }

    function removeNode(index) {
      var node = state.nodes[index];
      if (!node) return;
      var end = subtreeEnd(state.nodes, index);
      state.nodes.splice(index, end - index);
      state.selected = clamp(index, 0, state.nodes.length - 1);
      saver.now();
      renderList();
    }

    function addRoot() {
      state.nodes.push({ id: uid('node'), text: '新节点', depth: 0, collapsed: false });
      state.selected = state.nodes.length - 1;
      saver.now();
      renderList();
    }

    var addBtn = btn('＋ 节点', 'sm-btn--primary', addRoot);

    root.appendChild(h('div', { class: 'sm-toolbar' },
      h('div', { class: 'sm-group' }, addBtn),
      h('span', { class: 'sm-spacer' }),
      readout
    ));
    root.appendChild(list);
    root.appendChild(hint);
    root.appendChild(status);

    renderList();
  }

  // ================================================================ 6. 镜头表

  function renderShotList(root, ctx) {
    var original = clone(ctx.data || {});
    var data = normalizeShotData(original);
    var state = { shots: data.shots };

    var saver = trackSaver(makeSaver(function () {
      ctx.save(clone(buildPayload(original, {
        shots: state.shots.map(function (shot) {
          return { id: shot.id, start: shot.start, end: shot.end, shot: shot.shot, note: shot.note };
        })
      })));
    }, 260));

    var readout = readoutEl();
    var scroll = h('div', { class: 'sm-scroll sm-scroll--shots' });
    var table = h('div', { class: 'sm-shot-table' });
    var hint = h('p', { class: 'sm-hint', text: '起止可写 00:12 或秒数 · 描述/备注直接改 · 用 ↑ ↓ 调顺序' });

    table.appendChild(h('div', { class: 'sm-shot-head' },
      h('span', { class: 'sm-shot-idx', text: '#' }),
      h('span', { text: '起止' }),
      h('span', { text: '描述' }),
      h('span', { text: '备注' }),
      h('span', { text: '操作' })
    ));

    function totalDuration() {
      var sum = 0;
      state.shots.forEach(function (shot) {
        var start = parseTimecode(shot.start);
        var end = parseTimecode(shot.end);
        if (start !== null && end !== null && end > start) sum += end - start;
      });
      return sum;
    }

    function updateReadout() {
      setText(readout, state.shots.length + ' 个镜头 · 合计 ' + fmtSec(totalDuration()));
    }

    function renderRows() {
      while (table.children.length > 1) table.removeChild(table.lastChild);
      state.shots.forEach(function (shot, index) {
        var startInput = h('input', {
          class: 'sm-input sm-input--time', type: 'text', maxlength: '24',
          'aria-label': '镜头 ' + (index + 1) + ' 开始', placeholder: '00:00', value: shot.start
        });
        startInput.addEventListener('input', function () { shot.start = startInput.value; saver.soon(); updateReadout(); });
        startInput.addEventListener('change', function () { saver.now(); });

        var endInput = h('input', {
          class: 'sm-input sm-input--time', type: 'text', maxlength: '24',
          'aria-label': '镜头 ' + (index + 1) + ' 结束', placeholder: '00:05', value: shot.end
        });
        endInput.addEventListener('input', function () { shot.end = endInput.value; saver.soon(); updateReadout(); });
        endInput.addEventListener('change', function () { saver.now(); });

        var shotInput = h('input', {
          class: 'sm-input', type: 'text', maxlength: '500',
          'aria-label': '镜头 ' + (index + 1) + ' 描述', placeholder: '画面描述', value: shot.shot
        });
        shotInput.addEventListener('input', function () { shot.shot = shotInput.value; saver.soon(); });
        shotInput.addEventListener('change', function () { saver.now(); });

        var noteInput = h('input', {
          class: 'sm-input', type: 'text', maxlength: '500',
          'aria-label': '镜头 ' + (index + 1) + ' 备注', placeholder: '备注', value: shot.note
        });
        noteInput.addEventListener('input', function () { shot.note = noteInput.value; saver.soon(); });
        noteInput.addEventListener('change', function () { saver.now(); });

        var upBtn = miniBtn('↑', '上移', function () { move(index, -1); });
        upBtn.disabled = index === 0;
        var downBtn = miniBtn('↓', '下移', function () { move(index, 1); });
        downBtn.disabled = index === state.shots.length - 1;
        var deleteBtn = miniBtn('×', '删除镜头', function () {
          state.shots.splice(index, 1);
          saver.now();
          renderRows();
        }, 'sm-btn--danger');

        var row = h('div', { class: 'sm-shot-row' },
          h('span', { class: 'sm-shot-idx', text: String(index + 1) }),
          h('div', { class: 'sm-shot-times' }, startInput, h('span', { text: '→' }), endInput),
          shotInput,
          noteInput,
          h('div', { class: 'sm-row-actions' }, upBtn, downBtn, deleteBtn)
        );
        table.appendChild(row);
      });
      if (!state.shots.length) {
        table.appendChild(h('p', { class: 'sm-hint', style: { padding: '18px 10px' }, text: '还没有镜头，点「＋ 镜头」开始。' }));
      }
      updateReadout();
    }

    function move(index, delta) {
      var to = index + delta;
      if (to < 0 || to >= state.shots.length) return;
      var moved = state.shots.splice(index, 1)[0];
      state.shots.splice(to, 0, moved);
      saver.now();
      renderRows();
    }

    function addShot() {
      state.shots.push({ id: uid('shot'), start: '00:00', end: '00:05', shot: '', note: '' });
      saver.now();
      renderRows();
    }

    scroll.appendChild(table);
    root.appendChild(h('div', { class: 'sm-toolbar' },
      h('div', { class: 'sm-group' }, btn('＋ 镜头', 'sm-btn--primary', addShot)),
      h('span', { class: 'sm-spacer' }),
      readout
    ));
    root.appendChild(scroll);
    root.appendChild(hint);

    renderRows();
  }

  // ================================================================ 7. 甘特时间线

  function renderTimelineTrack(root, ctx) {
    var original = clone(ctx.data || {});
    var data = normalizeGanttData(original);
    var state = { events: data.events, selected: data.events.length ? 0 : -1 };

    var saver = trackSaver(makeSaver(function () {
      ctx.save(clone(buildPayload(original, {
        events: state.events.map(function (event) {
          return { id: event.id, label: event.label, start: event.start, end: event.end, color: event.color };
        })
      })));
    }, 240));

    var readout = readoutEl();
    var gantt = h('div', { class: 'sm-gantt' });
    var ruler = h('div', { class: 'sm-g-ruler' });
    var rowsHost = h('div', { class: 'sm-gantt' });
    var hint = h('p', { class: 'sm-hint', text: '拖条移动 · 拖右边缘拉伸 · 改名字 · 点色点换颜色' });

    function domain() {
      var max = 30;
      state.events.forEach(function (event) { max = Math.max(max, event.end); });
      return Math.ceil((max * 1.1) / 10) * 10;
    }

    function updateReadout() {
      setText(readout, state.events.length + ' 个事件 · 跨度 ' + domain() + ' 单位');
    }

    function renderRuler() {
      clear(ruler);
      var total = domain();
      var ticks = 6;
      for (var i = 0; i <= ticks; i += 1) {
        var ratio = i / ticks;
        var tick = h('div', { class: 'sm-g-tick' });
        tick.style.left = (ratio * 100) + '%';
        ruler.appendChild(tick);
        var label = h('span', { class: 'sm-g-tick-label', text: String(Math.round(total * ratio)) });
        label.style.left = (ratio * 100) + '%';
        ruler.appendChild(label);
      }
    }

    function renderRows() {
      clear(rowsHost);
      var total = domain();
      state.events.forEach(function (event, index) {
        var labelInput = h('input', {
          class: 'sm-input sm-g-label', type: 'text', maxlength: '80',
          'aria-label': '事件 ' + (index + 1) + ' 名称', value: event.label
        });
        labelInput.addEventListener('input', function () {
          event.label = labelInput.value;
          var barLabel = rowsHost.querySelector('.sm-g-bar--selected .sm-g-bar-label');
          if (barLabel && state.events[state.selected] === event) setText(barLabel, event.label);
          saver.soon();
        });
        labelInput.addEventListener('change', function () { saver.now(); });

        var track = h('div', { class: 'sm-g-track' });
        var bar = h('div', {
          class: 'sm-g-bar' + (state.selected === index ? ' sm-g-bar--selected' : ''),
          'data-index': String(index),
          role: 'button',
          tabindex: '0',
          'aria-label': '拖动事件 ' + event.label
        }, h('span', { class: 'sm-g-bar-label', text: event.label }));
        function positionBar() {
          var left = (event.start / total) * 100;
          var width = ((event.end - event.start) / total) * 100;
          bar.style.left = clamp(left, 0, 99) + '%';
          bar.style.width = clamp(width, 1.5, 100 - clamp(left, 0, 99)) + '%';
          bar.style.setProperty('--sm-bar-color', event.color);
        }
        positionBar();
        bar.addEventListener('pointerdown', function (ev) {
          beginDrag(ev, bar, track, event);
        });
        bar.addEventListener('click', function () {
          state.selected = state.events.indexOf(event);
          renderRows();
          renderExtra();
        });
        bar.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            state.selected = state.events.indexOf(event);
            renderRows();
            renderExtra();
          } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
            ev.preventDefault();
            var step = ev.key === 'ArrowLeft' ? -1 : 1;
            var len = event.end - event.start;
            event.start = Math.max(0, event.start + step);
            event.end = event.start + len;
            state.selected = state.events.indexOf(event);
            saver.now();
            renderRows();
            renderExtra();
          }
        });
        track.appendChild(bar);

        var deleteBtn = miniBtn('×', '删除事件', function () {
          state.events.splice(state.events.indexOf(event), 1);
          state.selected = Math.min(state.selected, state.events.length - 1);
          saver.now();
          renderRows();
          renderExtra();
        }, 'sm-btn--danger');

        rowsHost.appendChild(h('div', { class: 'sm-g-row' }, labelInput, track, deleteBtn));
      });

      if (!state.events.length) {
        rowsHost.appendChild(h('p', { class: 'sm-hint', text: '还没有事件，点「＋ 事件」添加。' }));
      }
      updateReadout();
    }

    function beginDrag(ev, bar, trackEl, event) {
      var barRect = getRect(bar);
      var nearRight = toNum(ev.clientX, 0) >= (barRect.left || 0) + (barRect.width || 0) - 8;
      var anchorX = toNum(ev.clientX, 0);
      var trackRect = getRect(trackEl);
      var total = domain();
      var perPx = total / (trackRect.width || 600);
      var origin = { start: event.start, end: event.end };
      var moved = false;
      state.selected = state.events.indexOf(event);
      startDrag(ev, function (moveEv) {
        var delta = (toNum(moveEv.clientX, 0) - anchorX) * perPx;
        if (Math.abs(delta) > 0.5) moved = true;
        if (nearRight) {
          event.end = clamp(Math.round(origin.end + delta), origin.start + 1, total);
        } else {
          var len = origin.end - origin.start;
          event.start = clamp(Math.round(origin.start + delta), 0, total - len);
          event.end = event.start + len;
        }
        renderRows();
      }, function () {
        if (moved) {
          saver.now();
          renderExtra();
        }
      });
    }

    function renderExtra() {
      var old = rowsHost.querySelector('.sm-g-extra');
      if (old) old.parentNode.removeChild(old);
      var event = state.events[state.selected];
      if (!event) return;
      var extra = h('div', { class: 'sm-g-extra' });
      PRESET_COLORS.forEach(function (color) {
        var dot = h('button', {
          class: 'sm-color-dot' + (event.color === color ? ' sm-color-dot--selected' : ''),
          type: 'button',
          title: color,
          'aria-label': '颜色 ' + color
        });
        dot.style.backgroundColor = color;
        dot.addEventListener('click', function () {
          event.color = color;
          saver.now();
          renderRows();
          renderExtra();
        });
        extra.appendChild(dot);
      });
      rowsHost.appendChild(extra);
    }

    function addEvent() {
      var total = domain();
      state.events.push({
        id: uid('evt'),
        label: '新事件',
        start: 0,
        end: Math.max(10, Math.round(total / 4)),
        color: pickColor(state.events.length)
      });
      state.selected = state.events.length - 1;
      saver.now();
      renderRows();
      renderExtra();
    }

    gantt.appendChild(ruler);
    rowsHost.className = 'sm-gantt';
    gantt.appendChild(rowsHost);
    root.appendChild(h('div', { class: 'sm-toolbar' },
      h('div', { class: 'sm-group' }, btn('＋ 事件', 'sm-btn--primary', addEvent)),
      h('span', { class: 'sm-spacer' }),
      readout
    ));
    root.appendChild(gantt);
    root.appendChild(hint);

    renderRuler();
    renderRows();
    renderExtra();  }

  // ================================================================ 8. 完成 / 发布

  function normalizeFinishData(raw) {
    var data = raw && typeof raw === 'object' ? raw : {};
    return {
      audio: String(data.audio || ''),
      cover: String(data.cover || ''),
      note: String(data.note === undefined ? '' : data.note).slice(0, 2000),
      finishedAt: String(data.finishedAt || '')
    };
  }

  function renderFinishBoard(root, ctx) {
    var original = clone(ctx.data || {});
    var data = normalizeFinishData(original);
    var state = {
      audio: data.audio,
      cover: data.cover,
      note: data.note,
      finishedAt: data.finishedAt,
      busy: ''
    };

    var saver = trackSaver(makeSaver(function () {
      ctx.save(clone(buildPayload(original, {
        audio: state.audio,
        cover: state.cover,
        note: state.note,
        finishedAt: state.finishedAt
      })));
    }, 200));

    var statusHost = h('div', { class: 'sm-finish-head' });
    var body = h('div', { class: 'sm-finish-body' });
    var statusNote = h('span', { class: 'sm-note', role: 'status' });
    var noteInput = h('textarea', {
      class: 'sm-input sm-finish-note', rows: '2', maxlength: '2000',
      'aria-label': '完成备注', placeholder: '发布说明 / 作品简介（可选）'
    });
    noteInput.value = state.note;
    noteInput.addEventListener('input', function () { state.note = noteInput.value; saver.soon(); });
    noteInput.addEventListener('change', function () { saver.now(); });

    function isDone() { return !!state.audio; }

    function syncFinished() {
      if (state.audio && !state.finishedAt) state.finishedAt = new Date().toISOString();
      if (!state.audio && !state.cover) state.finishedAt = '';
    }

    function uploadInto(kind, files) {
      state.busy = kind;
      render();
      uploadProjectFiles(ctx.projectId, files, 'assets').then(function (result) {
        var first = result.uploaded[0];
        var path = String(first.path || '');
        if (!path) throw new Error('服务端没有返回文件路径');
        if (kind === 'audio') {
          state.audio = path;
        } else {
          state.cover = path;
        }
        syncFinished();
        state.busy = '';
        saver.now();
        render();
        flashNote(statusNote, (kind === 'audio' ? '成品已上传：' : '封面上传：') +
          (first.name || fileBaseName(path)));
      }).catch(function (err) {
        state.busy = '';
        render();
        flashNote(statusNote, '上传失败：' + (err && err.message ? err.message : String(err)), true);
      });
    }

    function buildUploadCard(kind, title, accept) {
      var path = kind === 'audio' ? state.audio : state.cover;
      var busy = state.busy === kind;
      var card = h('div', { class: 'sm-upload-card' + (path ? ' sm-upload-card--filled' : '') });
      var input = h('input', {
        type: 'file',
        accept: accept,
        class: 'sm-visually-hidden',
        'aria-hidden': 'true',
        tabindex: '-1'
      });
      var uploadBtn = btn(busy ? '上传中…' : (path ? '替换文件' : '上传文件'), 'sm-btn--primary sm-btn--mini', function () {
        if (!busy) input.click();
      });
      uploadBtn.disabled = busy || !ctx.projectId;

      input.addEventListener('change', function () {
        var files = pickFile(input.files);
        input.value = '';
        if (files.length) uploadInto(kind, files);
      });

      card.appendChild(h('div', { class: 'sm-upload-head' },
        h('span', { class: 'sm-upload-title', text: title }),
        h('span', { class: 'sm-upload-name', text: path ? fileBaseName(path) : '未上传' }),
        uploadBtn,
        input
      ));

      if (path) {
        if (kind === 'audio' && isAudioPath(path)) {
          card.appendChild(h('audio', {
            class: 'sm-audio-player', controls: true, preload: 'none',
            src: projectFileUrl(ctx.projectId, path)
          }));
        } else if (kind === 'audio' && isVideoPath(path)) {
          card.appendChild(h('video', {
            class: 'sm-upload-video', controls: true, preload: 'metadata',
            src: projectFileUrl(ctx.projectId, path)
          }));
        } else if (kind === 'cover' && isImagePath(path)) {
          var img = h('img', { class: 'sm-cover-preview', alt: '封面预览' });
          img.addEventListener('error', function () {
            img.src = projectFileUrl(ctx.projectId, path);
          });
          img.src = projectThumbUrl(ctx.projectId, path, 480);
          card.appendChild(img);
        }
        card.appendChild(h('span', { class: 'sm-upload-path', text: path }));
      } else {
        card.appendChild(h('span', {
          class: 'sm-upload-hint',
          text: kind === 'audio' ? '音频优先，也接受视频 / 图片 / 压缩包' : '建议 JPG / PNG / WEBP 方图'
        }));
      }

      if (!ctx.projectId) {
        card.appendChild(h('p', { class: 'sm-hint sm-danger-text', text: '缺少项目 ID，无法上传。' }));
      }
      return card;
    }

    function render() {
      clear(statusHost);
      clear(body);

      statusHost.appendChild(h('span', {
        class: 'sm-finish-badge' + (isDone() ? ' sm-finish-badge--done' : ''),
        text: isDone() ? '已完成' : '未完成'
      }));
      if (state.finishedAt) {
        statusHost.appendChild(h('span', {
          class: 'sm-finished-at',
          text: '完成时间 ' + fmtDateTime(state.finishedAt)
        }));
      }
      statusHost.appendChild(h('span', { class: 'sm-spacer' }));
      var cancelBtn = btn('取消完成', 'sm-btn--danger', function () {
        state.audio = '';
        state.cover = '';
        state.finishedAt = '';
        state.busy = '';
        saver.now();
        render();
        flashNote(statusNote, '已取消完成，并清空成品与封面路径');
      });
      cancelBtn.disabled = !state.audio && !state.cover;
      statusHost.appendChild(cancelBtn);

      body.appendChild(buildUploadCard('audio', '成品文件', 'audio/*,video/*,image/*,.mp3,.wav,.flac,.m4a,.ogg,.zip,.7z,.rar,.tar,.gz'));
      body.appendChild(buildUploadCard('cover', '封面图', 'image/*,.png,.jpg,.jpeg,.webp,.gif'));
      body.appendChild(field('备注', noteInput));
      body.appendChild(h('p', {
        class: 'sm-hint sm-finish-warn',
        text: '只有这里上传了成品文件，项目才会出现在 hopzz.top 的作品列表。'
      }));
    }

    root.appendChild(statusHost);
    root.appendChild(body);
    root.appendChild(statusNote);
    render();
  }

  // ================================================================ 9. 音频上传（audio 模块）

  function normalizeAudioData(raw) {
    var data = raw && typeof raw === 'object' ? raw : {};
    var files = [];
    if (Array.isArray(data.files)) {
      data.files.forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        var path = String(item.path || '');
        if (!path) return;
        files.push({
          path: path,
          name: String(item.name || fileBaseName(path)),
          size: Number(item.size) || 0
        });
      });
    }
    return {
      bpm: data.bpm === undefined || data.bpm === null ? '' : data.bpm,
      key: String(data.key || ''),
      style: String(data.style || ''),
      duration: String(data.duration || ''),
      files: files
    };
  }

  function renderAudioUpload(root, ctx) {
    var original = clone(ctx.data || {});
    var data = normalizeAudioData(original);
    var state = {
      bpm: data.bpm,
      key: data.key,
      style: data.style,
      duration: data.duration,
      files: data.files,
      busy: false
    };

    var saver = trackSaver(makeSaver(function () {
      ctx.save(clone(buildPayload(original, {
        bpm: state.bpm,
        key: state.key,
        style: state.style,
        duration: state.duration,
        files: state.files.map(function (file) {
          return { path: file.path, name: file.name, size: file.size };
        })
      })));
    }, 260));

    var statusNote = h('span', { class: 'sm-note', role: 'status' });
    var fieldsHost = h('div', { class: 'sm-audio-fields' });
    var uploadHost = h('div', { class: 'sm-audio-upload' });
    var listHost = h('div', { class: 'sm-audio-list' });

    function specField(key, fallbackLabel, type) {
      var fields = ctx.spec && Array.isArray(ctx.spec.fields) ? ctx.spec.fields : [];
      for (var i = 0; i < fields.length; i += 1) {
        if (String(fields[i].key) === key) {
          return { label: String(fields[i].label || fallbackLabel), type: String(fields[i].type || type) };
        }
      }
      return { label: fallbackLabel, type: type };
    }

    function saveSoon() { saver.soon(); }

    function renderFields() {
      clear(fieldsHost);
      var bpmField = specField('bpm', 'BPM', 'number');
      var bpmControl = numInput(state.bpm, function (value) {
        state.bpm = value === '' ? '' : Number(value);
        saveSoon();
      }, 'BPM', { min: '20', max: '400', step: '1' });
      bpmControl.addEventListener('change', function () { saver.now(); });
      fieldsHost.appendChild(field(bpmField.label, bpmControl));

      [['key', '调性'], ['style', '风格'], ['duration', '时长']].forEach(function (pair) {
        var key = pair[0];
        var def = specField(key, pair[1], 'text');
        var input = h('input', {
          class: 'sm-input', type: 'text', maxlength: '80',
          'aria-label': def.label, placeholder: def.label
        });
        input.value = state[key] === undefined || state[key] === null ? '' : String(state[key]);
        input.addEventListener('input', function () {
          state[key] = input.value;
          saveSoon();
        });
        input.addEventListener('change', function () { saver.now(); });
        fieldsHost.appendChild(field(def.label, input));
      });
    }

    function uploadFiles(files) {
      state.busy = true;
      renderUpload();
      uploadProjectFiles(ctx.projectId, files, 'assets').then(function (result) {
        result.uploaded.forEach(function (uploaded) {
          var path = String(uploaded.path || '');
          if (!path) return;
          state.files.push({
            path: path,
            name: String(uploaded.name || fileBaseName(path)),
            size: Number(uploaded.size) || 0
          });
        });
        state.busy = false;
        saver.now();
        renderUpload();
        renderList();
        flashNote(statusNote, '已上传 ' + result.uploaded.length + ' 个音频文件');
      }).catch(function (err) {
        state.busy = false;
        renderUpload();
        flashNote(statusNote, '上传失败：' + (err && err.message ? err.message : String(err)), true);
      });
    }

    function renderUpload() {
      clear(uploadHost);
      var input = h('input', {
        type: 'file',
        accept: '.mp3,.wav,.flac,.ogg,.m4a,.aac,.opus,audio/*',
        class: 'sm-visually-hidden',
        'aria-hidden': 'true',
        tabindex: '-1'
      });
      input.addEventListener('change', function () {
        var files = pickFile(input.files);
        input.value = '';
        if (files.length) uploadFiles(files);
      });
      var uploadBtn = btn(state.busy ? '上传中…' : '↑ 上传音频', 'sm-btn--primary sm-btn--mini', function () {
        if (!state.busy) input.click();
      });
      uploadBtn.disabled = state.busy || !ctx.projectId;
      uploadHost.appendChild(h('div', { class: 'sm-toolbar' },
        h('div', { class: 'sm-group' }, uploadBtn, input),
        h('span', { class: 'sm-spacer' }),
        h('span', { class: 'sm-hint', text: 'mp3 / wav / flac / m4a / ogg' })
      ));
      if (!ctx.projectId) {
        uploadHost.appendChild(h('p', { class: 'sm-hint sm-danger-text', text: '缺少项目 ID，无法上传。' }));
      }
    }

    function renderList() {
      clear(listHost);
      if (!state.files.length) {
        listHost.appendChild(h('p', { class: 'sm-hint', text: '还没有上传音频。上传后可以在这里试听、移除。' }));
        return;
      }
      state.files.forEach(function (file, index) {
        var row = h('div', { class: 'sm-audio-row' },
          h('span', { class: 'sm-audio-name', title: file.path, text: file.name }),
          h('span', { class: 'sm-audio-size', text: fmtSize(file.size) }),
          isAudioPath(file.path)
            ? h('audio', {
              class: 'sm-audio-player', controls: true, preload: 'none',
              src: projectFileUrl(ctx.projectId, file.path)
            })
            : h('span', { class: 'sm-hint', text: '无法预览' })
        );
        var removeBtn = miniBtn('×', '从列表移除（不删仓库文件）', function () {
          state.files.splice(index, 1);
          saver.now();
          renderList();
          flashNote(statusNote, '已从列表移除：' + file.name);
        }, 'sm-btn--danger');
        row.appendChild(removeBtn);
        listHost.appendChild(row);
      });
    }

    renderFields();
    renderUpload();
    renderList();

    root.appendChild(fieldsHost);
    root.appendChild(h('div', { class: 'sm-audio-block' },
      h('div', { class: 'sm-toolbar' }, h('span', { class: 'sm-field-label', text: '音频文件' })),
      uploadHost,
      listHost
    ));
    root.appendChild(statusNote);
  }

  // ================================================================ 注册表 / 对外接口

  var EDITORS = {
    'piano-roll': renderPianoRoll,
    'chord-board': renderChordBoard,
    'section-timeline': renderSectionTimeline,
    'palette-swatches': renderPalette,
    'outline-tree': renderOutlineTree,
    'shot-list': renderShotList,
    'timeline-track': renderTimelineTrack,
    'finish-board': renderFinishBoard,
    'audio-upload': renderAudioUpload
  };

  function has(uiId) {
    return typeof uiId === 'string' && Object.prototype.hasOwnProperty.call(EDITORS, uiId);
  }

  function normalizeCtx(ctx) {
    var source = ctx && typeof ctx === 'object' ? ctx : {};
    var data = source.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
    var spec = source.spec;
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) spec = {};
    var onSave = typeof source.onSave === 'function' ? source.onSave : function () {};
    return {
      projectId: source.projectId === undefined ? '' : String(source.projectId),
      moduleId: source.moduleId === undefined ? '' : String(source.moduleId),
      ui: source.ui === undefined ? '' : String(source.ui),
      spec: spec,
      data: data,
      save: function (nextData) {
        try {
          onSave(nextData);
        } catch (err) {
          if (window.console) window.console.error('[StudioModules] onSave failed', err);
        }
      }
    };
  }

  function render(container, ctx) {
    if (!container || container.nodeType !== 1) return;
    if (typeof document === 'undefined') return;
    cleanupDrag();
    // 每个容器自己管自己的待保存计时器：重新渲染一个模块不能取消别的模块的保存
    var saverList = container._smSavers;
    if (Array.isArray(saverList)) {
      saverList.forEach(function (saver) {
        try { saver.cancel(); } catch (err) { /* ignore */ }
      });
    }
    saverList = [];
    container._smSavers = saverList;
    ensureStyle();
    clear(container);

    var context = normalizeCtx(ctx);
    var editor = has(context.ui) ? EDITORS[context.ui] : null;

    if (!editor) {
      var emptyRoot = h('div', { class: 'sm-editor' },
        h('div', { class: 'sm-empty' },
          h('p', { class: 'sm-hint', text: context.ui ? ('暂时没有「' + context.ui + '」对应的图形编辑器。') : '这个模块没有图形界面，使用上方字段表单编辑即可。' })
        )
      );
      container.appendChild(emptyRoot);
      return;
    }

    var root = h('div', { class: 'sm-editor', 'data-ui': context.ui });
    container.appendChild(root);
    saverSink = saverList;
    try {
      editor(root, context);
    } catch (err) {
      clear(root);
      root.appendChild(h('div', { class: 'sm-empty' },
        h('p', { class: 'sm-hint', text: '编辑器渲染失败，可以先用字段表单编辑。' })
      ));
      if (window.console) window.console.error('[StudioModules] render failed:', context.ui, err);
    } finally {
      saverSink = null;
    }
  }

  window.StudioModules = {
    has: has,
    render: render
  };
})();
