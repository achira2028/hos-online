// กติกาหมากฮอสไทย + บอท — ใช้ร่วมกันทั้งเซิร์ฟเวอร์และเบราว์เซอร์
(function (root) {
  const DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const fwd = color => color === 'w' ? -1 : 1;
  const other = color => color === 'w' ? 'b' : 'w';
  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  const sqName = ([r, c]) => 'abcdefgh'[c] + (8 - r);

  function newBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(null));
    let id = 0;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if ((r + c) % 2 === 1) {
          if (r < 2) b[r][c] = { id: id++, color: 'b', king: false };
          if (r > 5) b[r][c] = { id: id++, color: 'w', king: false };
        }
    return b;
  }

  function newGame() {
    return { board: newBoard(), turn: 'w', chain: null, winner: null, last: null, history: [], moveNo: 0 };
  }

  // การเดินของหมากหนึ่งตัว: [{to, cap}]
  function movesFor(b, r, c) {
    const p = b[r][c], out = [];
    for (const [dr, dc] of DIRS) {
      if (p.king) {
        let rr = r + dr, cc = c + dc;
        while (inB(rr, cc) && !b[rr][cc]) { out.push({ to: [rr, cc], cap: null }); rr += dr; cc += dc; }
        if (inB(rr, cc) && b[rr][cc].color !== p.color && inB(rr + dr, cc + dc) && !b[rr + dr][cc + dc])
          out.push({ to: [rr + dr, cc + dc], cap: [rr, cc] });
      } else {
        if (dr !== fwd(p.color)) continue;
        const rr = r + dr, cc = c + dc;
        if (!inB(rr, cc)) continue;
        if (!b[rr][cc]) out.push({ to: [rr, cc], cap: null });
        else if (b[rr][cc].color !== p.color && inB(rr + dr, cc + dc) && !b[rr + dr][cc + dc])
          out.push({ to: [rr + dr, cc + dc], cap: [rr, cc] });
      }
    }
    return out;
  }

  function allMoves(b, color) {
    const list = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
      if (b[r][c] && b[r][c].color === color) movesFor(b, r, c).forEach(m => list.push({ from: [r, c], to: m.to, cap: m.cap }));
    const caps = list.filter(m => m.cap);
    return caps.length ? caps : list;
  }

  function legalMoves(g) {
    if (g.winner) return [];
    if (g.chain) {
      const [r, c] = g.chain;
      return movesFor(g.board, r, c).filter(m => m.cap).map(m => ({ from: [r, c], to: m.to, cap: m.cap }));
    }
    return allMoves(g.board, g.turn);
  }

  // เดินหนึ่งก้าว คืนค่า true ถ้าถูกกติกา (แก้ไข g โดยตรง)
  function applyMove(g, from, to) {
    const m = legalMoves(g).find(m => same(m.from, from) && same(m.to, to));
    if (!m) return false;
    const b = g.board, p = b[from[0]][from[1]], wasChain = !!g.chain;
    b[from[0]][from[1]] = null;
    b[to[0]][to[1]] = p;
    if (m.cap) b[m.cap[0]][m.cap[1]] = null;
    let promoted = false;
    if (!p.king && (to[0] === 0 || to[0] === 7)) { p.king = true; promoted = true; }
    g.moveNo = (g.moveNo || 0) + 1;
    g.last = { from, to, cap: m.cap, color: p.color, promoted, id: g.moveNo };
    if (g.history) {
      const h = g.history;
      if (wasChain && h.length) h[h.length - 1].text += '×' + sqName(to);
      else h.push({ color: p.color, text: sqName(from) + (m.cap ? '×' : '–') + sqName(to) });
      if (promoted) h[h.length - 1].text += ' 👑';
    }
    if (m.cap && !promoted && movesFor(b, to[0], to[1]).some(x => x.cap)) { g.chain = to; return true; }
    g.chain = null;
    g.turn = other(g.turn);
    if (!allMoves(b, g.turn).length) g.winner = other(g.turn);
    return true;
  }

  // ---------- บอท ----------
  function lite(g) {
    return { board: g.board.map(row => row.map(p => p && { id: p.id, color: p.color, king: p.king })), turn: g.turn, chain: g.chain, winner: g.winner, moveNo: g.moveNo };
  }

  // ทุกลำดับการเดินครบหนึ่งตา (รวมการกินต่อ)
  function turnSequences(g) {
    const out = [], me = g.turn;
    (function rec(gs, steps) {
      for (const m of legalMoves(gs)) {
        const n = lite(gs);
        applyMove(n, m.from, m.to);
        const s = steps.concat([[m.from, m.to]]);
        if (n.chain && n.turn === me && !n.winner) rec(n, s);
        else out.push({ steps: s, game: n });
      }
    })(g, []);
    return out;
  }

  function evaluate(g, color) {
    let s = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = g.board[r][c];
      if (!p) continue;
      let v = p.king ? 32 : 10 + (p.color === 'w' ? 7 - r : r) * 0.6;
      if (c === 0 || c === 7) v += 0.4; // ขอบกระดานปลอดภัยกว่า
      s += p.color === color ? v : -v;
    }
    return s;
  }

  function negamax(g, depth, alpha, beta) {
    if (g.winner) return g.winner === g.turn ? 1000 + depth : -1000 - depth;
    if (depth === 0) return evaluate(g, g.turn);
    const seqs = turnSequences(g);
    if (!seqs.length) return -1000 - depth;
    let best = -Infinity;
    for (const s of seqs) {
      const v = -negamax(s.game, depth - 1, -beta, -alpha);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  // คืนลำดับก้าว [[from,to],...] ที่ดีที่สุด
  function bestMove(g, depth, noise = 0) {
    const seqs = turnSequences(lite(g));
    if (!seqs.length) return null;
    let best = null, bestV = -Infinity;
    for (const s of seqs.sort(() => Math.random() - 0.5)) {
      const v = -negamax(s.game, depth - 1, -Infinity, Infinity) + Math.random() * noise;
      if (v > bestV) { bestV = v; best = s.steps; }
    }
    return best;
  }

  const api = { newGame, newBoard, movesFor, allMoves, legalMoves, applyMove, bestMove, other, same, sqName };
  if (typeof module !== 'undefined') module.exports = api; else root.Rules = api;
})(this);
