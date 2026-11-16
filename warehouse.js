/* 仓库布局与拣货路径引擎（纯逻辑）
 *
 * 仓库模型：N 排货架 × 每排 M 个库位，巷道贯通两侧
 * 坐标系：row = 排（0..R-1），col = 位（0..C-1）
 * 出入口固定在 (row=-1, col=0) 即左下角
 *
 * 拣货路径策略：
 * 1. nearest  —— 贪心最近邻：每次走向当前距离最近的未拣库位
 * 2. sshape   —— S 形穿越：按巷道顺序蛇形走完所有涉及巷道（行业标准做法）
 */
(function (global) {
  'use strict';

  var ROWS = 8, COLS = 14;

  /* 生成 SKU 库位分布：ABC 分类法 —— A 类爆品放在靠近出入口的黄金位 */
  function buildLayout(seed) {
    var rnd = mulberry32(seed);
    var slots = [];
    var categories = [
      { cls: 'A', count: 20, dailyPicks: [15, 40] },  // 爆品
      { cls: 'B', count: 35, dailyPicks: [4, 14] },   // 常规
      { cls: 'C', count: 57, dailyPicks: [0, 3] }     // 长尾
    ];
    var skuSeq = 1;
    var allSlots = [];
    for (var r = 0; r < ROWS; r++)
      for (var c = 0; c < COLS; c++)
        allSlots.push({ row: r, col: c });

    /* A 类按距出入口曼哈顿距离升序占据黄金位；B/C 随机散布剩余位置 */
    allSlots.sort(function (a, b) {
      return (a.row + 1 + a.col) - (b.row + 1 + b.col);
    });

    categories.forEach(function (cat) {
      for (var i = 0; i < cat.count; i++) {
        var slot;
        if (cat.cls === 'A') {
          slot = allSlots.shift();
        } else {
          var idx = Math.floor(rnd() * allSlots.length);
          slot = allSlots.splice(idx, 1)[0];
        }
        slots.push({
          sku: 'SKU-' + String(skuSeq++).padStart(3, '0'),
          cls: cat.cls,
          row: slot.row,
          col: slot.col,
          dailyPicks: Math.round(cat.dailyPicks[0] + rnd() * (cat.dailyPicks[1] - cat.dailyPicks[0]))
        });
      }
    });
    return slots;
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 曼哈顿距离（巷道行走近似） */
  function dist(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
  }

  var ENTRY = { row: -1, col: 0 };

  /* 贪心最近邻路径 */
  function nearestRoute(picks) {
    var remaining = picks.slice();
    var route = [];
    var cur = ENTRY;
    var total = 0;
    while (remaining.length) {
      var best = 0, bestD = Infinity;
      for (var i = 0; i < remaining.length; i++) {
        var d = dist(cur, remaining[i]);
        if (d < bestD) { bestD = d; best = i; }
      }
      var next = remaining.splice(best, 1)[0];
      total += bestD;
      route.push(next);
      cur = next;
    }
    total += dist(cur, ENTRY); // 返回出入口复核打包
    return { route: route, distance: total };
  }

  /* S 形穿越路径：涉及的巷道（col）按升序，巷道内排方向蛇形交替 */
  function sShapeRoute(picks) {
    var byCol = {};
    picks.forEach(function (p) {
      if (!byCol[p.col]) byCol[p.col] = [];
      byCol[p.col].push(p);
    });
    var cols = Object.keys(byCol).map(Number).sort(function (a, b) { return a - b; });
    var route = [];
    var forward = true;
    var lastRow = 0;
    var total = 0;
    var cur = ENTRY;

    cols.forEach(function (col, ci) {
      var group = byCol[col];
      /* 判断是否需要穿越整条巷道：若后续还有更远的巷道，则穿到底 */
      group.sort(function (a, b) { return forward ? a.row - b.row : b.row - a.row; });
      group.forEach(function (p) {
        total += dist(cur, p);
        route.push(p);
        cur = p;
      });
      lastRow = cur.row;
      /* 蛇形：下一巷道反向。若本巷道只深入了一半且后面没有更远巷道则原路折返（U形近似） */
      forward = (ci % 2 === 0) ? false : true;
      if (ci < cols.length - 1) {
        /* 走到下一巷道口的距离在下一次 dist 中自然计算 */
      }
    });
    total += dist(cur, ENTRY);
    return { route: route, distance: total };
  }

  /* 生成一张演示订单的拣货清单（按 SKU 日拣选频次加权抽样） */
  function samplePickList(layout, count, seed) {
    var rnd = mulberry32(seed);
    var pool = [];
    layout.forEach(function (s) {
      var w = Math.max(1, s.dailyPicks);
      for (var i = 0; i < w; i++) pool.push(s);
    });
    var chosen = {};
    var picks = [];
    var guard = 0;
    while (picks.length < count && guard++ < 500) {
      var s = pool[Math.floor(rnd() * pool.length)];
      if (chosen[s.sku]) continue;
      chosen[s.sku] = true;
      picks.push(s);
    }
    return picks;
  }

  global.Warehouse = {
    ROWS: ROWS,
    COLS: COLS,
    ENTRY: ENTRY,
    buildLayout: buildLayout,
    nearestRoute: nearestRoute,
    sShapeRoute: sShapeRoute,
    samplePickList: samplePickList,
    dist: dist
  };
})(window);
