/* 仓库热力图 Canvas 渲染与交互 */
(function () {
  'use strict';

  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var CELL_W = 72, CELL_H = 62, GAP = 6, MARGIN_X = 60, MARGIN_Y = 50;

  var layout = Warehouse.buildLayout(20260601);
  var slotMap = {};
  layout.forEach(function (s) { slotMap[s.row + '-' + s.col] = s; });

  var picks = [];
  var mode = 'compare'; // compare | nearest | sshape
  var orderSeed = 1;

  /* ---------- 颜色 ---------- */
  function heatColor(cls) {
    if (cls === 'A') return '#e64545';
    if (cls === 'B') return '#f2a33c';
    return '#9db8d2';
  }

  function cellX(col) { return MARGIN_X + col * (CELL_W + GAP); }
  function cellY(row) { return MARGIN_Y + row * (CELL_H + GAP); }
  function centerOf(p) {
    return { x: cellX(p.col) + CELL_W / 2, y: cellY(p.row) + CELL_H / 2 };
  }
  function entryPoint() {
    return { x: cellX(0) + CELL_W / 2, y: MARGIN_Y - 24 };
  }

  /* ---------- 绘制 ---------- */
  function draw() {
    ctx.clearRect(0, 0, cv.width, cv.height);

    /* 出入口 */
    var ep = entryPoint();
    ctx.fillStyle = '#12233f';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⬆ 出入口 / 打包台', ep.x, ep.y - 8);

    /* 库位 */
    for (var r = 0; r < Warehouse.ROWS; r++) {
      for (var c = 0; c < Warehouse.COLS; c++) {
        var s = slotMap[r + '-' + c];
        var x = cellX(c), y = cellY(r);
        var isPick = picks.indexOf(s) >= 0;

        ctx.fillStyle = s ? heatColor(s.cls) : '#eceff3';
        if (isPick) ctx.fillStyle = '#2f7a4d';
        ctx.globalAlpha = s ? Math.min(0.45 + s.dailyPicks / 40, 1) : 1;
        roundRect(x, y, CELL_W, CELL_H, 6);
        ctx.fill();
        ctx.globalAlpha = 1;

        if (isPick) {
          ctx.strokeStyle = '#1a4d2e';
          ctx.lineWidth = 3;
          roundRect(x, y, CELL_W, CELL_H, 6);
          ctx.stroke();
        }

        ctx.fillStyle = isPick ? '#fff' : '#20293a';
        ctx.font = '10px sans-serif';
        if (s) {
          ctx.fillText(s.sku, x + CELL_W / 2, y + 20);
          ctx.fillText('日拣 ' + s.dailyPicks, x + CELL_W / 2, y + 38);
        } else {
          ctx.fillStyle = '#b8c1cd';
          ctx.fillText('空', x + CELL_W / 2, y + 32);
        }
      }
    }

    /* 巷道编号 */
    ctx.fillStyle = '#8894a8';
    ctx.font = '11px sans-serif';
    for (var c2 = 0; c2 < Warehouse.COLS; c2++) {
      ctx.fillText('巷 ' + (c2 + 1), cellX(c2) + CELL_W / 2, MARGIN_Y + Warehouse.ROWS * (CELL_H + GAP) + 8);
    }

    /* 路径 */
    if (picks.length) {
      var nr = Warehouse.nearestRoute(picks);
      var sr = Warehouse.sShapeRoute(picks);
      if (mode === 'compare' || mode === 'sshape') drawPath(sr.route, '#d6336c', true);
      if (mode === 'compare' || mode === 'nearest') drawPath(nr.route, '#3a6df0', false);

      /* 拣货顺序编号 */
      var seqRoute = (mode === 'sshape') ? sr.route : nr.route;
      seqRoute.forEach(function (p, i) {
        var c = centerOf(p);
        ctx.fillStyle = '#12233f';
        ctx.beginPath();
        ctx.arc(c.x + 22, c.y - 18, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(String(i + 1), c.x + 22, c.y - 14);
      });

      renderStats(nr, sr);
    }
  }

  function drawPath(route, color, dashed) {
    if (!route.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash(dashed ? [7, 5] : []);
    ctx.beginPath();
    var ep = entryPoint();
    ctx.moveTo(ep.x, ep.y);
    route.forEach(function (p) {
      var c = centerOf(p);
      ctx.lineTo(c.x, c.y);
    });
    ctx.lineTo(ep.x, ep.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- 统计 ---------- */
  function renderStats(nr, sr) {
    var box = document.getElementById('stat-box');
    var diff = sr.distance - nr.distance;
    var pct = ((diff / sr.distance) * 100).toFixed(1);
    box.innerHTML =
      '<div class="stat">最近邻 <b>' + nr.distance + '</b> 格</div>' +
      '<div class="stat">S 形 <b>' + sr.distance + '</b> 格</div>' +
      '<div class="stat">' + (diff > 0
        ? '最近邻省 <span class="save">' + diff + ' 格（' + pct + '%）</span>'
        : 'S 形更优（密集拣选场景）') + '</div>';
  }

  /* ---------- 交互 ---------- */
  document.getElementById('btn-new-order').onclick = function () {
    picks = Warehouse.samplePickList(layout, 8, 20260601 + (orderSeed++) * 97);
    draw();
  };

  document.querySelectorAll('.seg-btn').forEach(function (btn) {
    btn.onclick = function () {
      document.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      mode = btn.dataset.mode;
      draw();
    };
  });

  draw();
})();
