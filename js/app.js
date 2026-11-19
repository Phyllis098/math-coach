/* 指對數觀念教練 — 主程式（純前端，無需安裝套件） */
(() => {
  'use strict';

  /* ---------------- 排版：把題庫的小語法轉成 HTML ---------------- */
  const esc = (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] || c);
  function fmt(src) {
    let i = 0;
    const s = String(src);
    function parse(inGroup) {
      let out = '';
      while (i < s.length) {
        const c = s[i];
        if (c === '}' && inGroup) { i++; return out; }
        if ((c === '^' || c === '_') && s[i + 1] === '{') {
          i += 2;
          const tag = c === '^' ? 'sup' : 'sub';
          out += `<${tag}>${parse(true)}</${tag}>`;
          continue;
        }
        if (s.startsWith('#f{', i)) {
          i += 3;
          const a = parse(true);
          if (s[i] === '{') i++;
          const b = parse(true);
          out += `<span class="frac"><span>${a}</span><span>${b}</span></span>`;
          continue;
        }
        if (s.startsWith('#r{', i)) {
          i += 3;
          out += `<span class="sqrt">√<span class="rad">${parse(true)}</span></span>`;
          continue;
        }
        out += esc(c);
        i++;
      }
      return out;
    }
    return parse(false);
  }

  /* ---------------- 小工具 ---------------- */
  const $app = document.getElementById('app');
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; }
    return a;
  };
  const byId = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
  const KEYS = ['A', 'B', 'C', 'D', 'E'];
  const fmtSec = (ms) => (ms / 1000).toFixed(1) + ' 秒';

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  const PRAISE = ['太棒了！🎉', '觀念很清楚 👏', '完全正確！', '漂亮！✨', '你抓到重點了！', '穩穩的 💯'];
  const AFTER_HINT = ['靠提示想通也很厲害 👍', '想通了就是你的！', '對了！下次試試不看提示 😉'];
  const AFTER_WRONG = ['修正成功！這個觀念現在是你的了 💪', '錯過一次就記得更牢 👍', '答對了！剛剛的錯誤很有價值'];
  const OOPS = ['差一點點！', '這是很多人都會踩的陷阱，別擔心 🙂', '沒關係，錯在這裡最有價值！', '好，我們來看看哪裡卡住了'];

  /* ---------------- 學習紀錄（localStorage） ---------------- */
  const KEY = 'explog-coach-v1';
  let store;
  try { store = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { store = {}; }
  store.q = store.q || {};       // 每題：{ n 作答次數, ok 一次答對次數, best 最快秒數 }
  store.mis = store.mis || {};   // 錯誤觀念累計次數
  store.sprintBest = store.sprintBest || 0;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* 無痕模式等 */ } };

  function record(q, firstOk, ms) {
    const r = store.q[q.id] || { n: 0, ok: 0, best: null };
    r.n++;
    if (firstOk) {
      r.ok++;
      if (ms && (!r.best || ms < r.best)) r.best = ms;
    }
    r.last = firstOk ? 1 : 0;
    store.q[q.id] = r;
    save();
  }
  function recordMis(code) {
    store.mis[code] = (store.mis[code] || 0) + 1;
    save();
  }

  /* ---------------- 路由 ---------------- */
  let session = null;
  let timerId = null;
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function go(view, arg) {
    stopTimer();
    document.querySelectorAll('.topbar nav button').forEach((b) => b.classList.toggle('on', b.dataset.go === view));
    window.scrollTo(0, 0);
    ({ home: viewHome, sprint: viewSprintSetup, report: viewReport, lab: viewLab }[view] || viewHome)(arg);
  }
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));

  /* ================= 首頁 ================= */
  function viewHome() {
    const chColor = { 5: 'var(--c5)', 6: 'var(--c6)', 7: 'var(--c7)' };
    let html = `
      <h1>指數・對數，一題一題想清楚</h1>
      <p class="sub">選章節和層次開始練習。答錯不扣分——程式會告訴你卡在哪個觀念，再給你一次機會。</p>
      <div class="howto">
        <div><b>🌱 先觀念、再應用</b>每章分四個層次，加上仿學測、分科的題型。</div>
        <div><b>💡 卡住就按提示</b>提示一次給一步，引導你自己想出來。</div>
        <div><b>⚡ 月考衝刺</b>隨機出題、限時作答，練「又快又對」。</div>
        <div><b>🩺 觀念診斷</b>彙整你常犯的錯誤觀念，針對弱點再練。</div>
      </div>`;
    for (const ch of [5, 6, 7]) {
      const qs = QUESTIONS.filter((q) => q.ch === ch);
      const done = qs.filter((q) => store.q[q.id]).length;
      html += `<h2></h2><div class="card chapter" style="--c:${chColor[ch]}">
        <h3>第 ${ch} 章　${CHAPTERS[ch].name}</h3>
        <div class="meta">共 ${qs.length} 題・已練習 ${done} 題
          <button class="btn" style="margin-left:8px;padding:2px 10px;font-size:13px" data-all="${ch}">整章依序練習</button></div>
        <div class="levels">`;
      for (const lv of [1, 2, 3, 4, 5]) {
        const lq = qs.filter((q) => q.lv === lv);
        if (!lq.length) continue;
        const okN = lq.filter((q) => store.q[q.id] && store.q[q.id].last).length;
        html += `<button class="lvbtn" data-ch="${ch}" data-lv="${lv}">
          <span class="n">${LEVELS[lv].icon} ${LEVELS[lv].name}</span>
          <span class="p">${lq.length} 題・答對 ${okN}</span>
          <div class="bar"><i style="width:${(okN / lq.length) * 100}%"></i></div>
        </button>`;
      }
      html += '</div></div>';
    }
    $app.innerHTML = html.replace(/<h2><\/h2>/g, '');
    $app.querySelectorAll('.lvbtn').forEach((b) => b.addEventListener('click', () => {
      const ch = +b.dataset.ch, lv = +b.dataset.lv;
      startPractice(QUESTIONS.filter((q) => q.ch === ch && q.lv === lv), `第${ch}章・${LEVELS[lv].name}`);
    }));
    $app.querySelectorAll('[data-all]').forEach((b) => b.addEventListener('click', () => {
      const ch = +b.dataset.all;
      startPractice(QUESTIONS.filter((q) => q.ch === ch).sort((a, c) => a.lv - c.lv), `第${ch}章 全部`);
    }));
  }

  /* ================= 引導練習模式 ================= */
  function startPractice(list, title) {
    session = { mode: 'practice', title, list, idx: 0, results: [] };
    renderQuestion();
  }

  function startSprint(list) {
    session = { mode: 'sprint', title: '月考衝刺', list, idx: 0, results: [], score: 0 };
    renderQuestion();
  }

  function renderQuestion() {
    stopTimer();
    const q = session.list[session.idx];
    const sprint = session.mode === 'sprint';
    const opts = shuffle(q.opts);
    const st = { wrong: 0, hints: 0, misCodes: [], done: false, t0: performance.now() };

    $app.innerHTML = `
      <div class="qhead">
        <div class="chips">
          <span class="chip">第${q.ch}章 ${CHAPTERS[q.ch].short}</span>
          <span class="chip">${LEVELS[q.lv].icon} ${LEVELS[q.lv].name}</span>
          ${q.src ? `<span class="chip src">${q.src}（改編）</span>` : ''}
        </div>
        <div class="progress">${session.title}・第 ${session.idx + 1} / ${session.list.length} 題
          ${sprint ? `・<span class="score">${session.score} 分</span>` : ''}</div>
      </div>
      ${sprint ? `<div class="timer" id="timer"><i></i></div>` : ''}
      <div class="card">
        <div class="qtext">${fmt(q.q)}</div>
        <div class="opts">${opts.map((o, k) => `<button class="opt" data-k="${k}"><span class="k">${KEYS[k]}</span><span>${fmt(o.t)}</span></button>`).join('')}</div>
        <div id="hints"></div>
        <div id="fb"></div>
        <div class="tools">
          <button class="btn" id="hintBtn">💡 提示${sprint ? '（−30 分）' : ''}</button>
          ${sprint ? '' : '<button class="btn" id="giveUp" hidden>我想直接看解析</button>'}
          <span style="flex:1"></span>
          <span class="clock" id="clock"></span>
          <button class="btn" id="quit">結束練習</button>
        </div>
      </div>`;

    const $opts = [...$app.querySelectorAll('.opt')];
    const $fb = $app.querySelector('#fb');
    const $hints = $app.querySelector('#hints');
    const $hintBtn = $app.querySelector('#hintBtn');
    const $giveUp = $app.querySelector('#giveUp');

    const updateHintBtn = () => {
      const left = q.hints.length - st.hints;
      $hintBtn.textContent = left > 0 ? `💡 提示（還有 ${left} 則）${sprint ? ' −30 分' : ''}` : '💡 提示已用完';
      $hintBtn.disabled = left <= 0 || st.done;
    };
    updateHintBtn();

    $hintBtn.onclick = () => {
      if (st.hints >= q.hints.length) return;
      $hints.insertAdjacentHTML('beforeend', `<div class="hint">💡 ${fmt(q.hints[st.hints])}</div>`);
      st.hints++;
      if (sprint) session.score = Math.max(0, session.score - 30);
      updateHintBtn();
    };
    if ($giveUp) $giveUp.onclick = () => finish(false, true);
    $app.querySelector('#quit').onclick = () => showSummary();

    // 衝刺模式計時
    if (sprint) {
      const $bar = $app.querySelector('#timer');
      const $clock = $app.querySelector('#clock');
      timerId = setInterval(() => {
        const ms = performance.now() - st.t0;
        const ratio = ms / (q.sec * 1000);
        $bar.querySelector('i').style.width = Math.min(100, ratio * 100) + '%';
        $bar.classList.toggle('slow', ratio > 1);
        $clock.textContent = `${(ms / 1000).toFixed(0)} / 建議 ${q.sec} 秒`;
      }, 200);
    } else {
      $app.querySelector('#clock').textContent = `建議 ${q.sec} 秒內`;
    }

    function choose(k) {
      if (st.done) return;
      const o = opts[k];
      const $b = $opts[k];
      if (o.ok) { finish(true); return; }
      // 答錯
      st.wrong++;
      $b.classList.add('wrong');
      $b.disabled = true;
      if (o.m) { st.misCodes.push(o.m); recordMis(o.m); }
      const mis = MISCONCEPTIONS[o.m];
      if (sprint) {
        finish(false, false, o);
        return;
      }
      $fb.innerHTML = `<div class="fb bad">
        <span class="title">${pick(OOPS)}</span>
        ${mis ? `<span class="tag">🔍 觀念檢查：${fmt(mis.name)}</span><br>` : ''}
        ${fmt(o.fb || '再想想看～')}
        <div style="margin-top:6px">${st.wrong >= 2 ? '要不要按「💡 提示」或看解析？' : '再試一次，你可以的 💪'}</div>
      </div>`;
      if (st.wrong >= 1 && $giveUp) $giveUp.hidden = false;
      // 剩一個選項時直接揭曉
      if ($opts.filter((x) => !x.disabled).length === 1) finish(false, true);
    }

    function finish(correct, gaveUp, wrongOpt) {
      st.done = true;
      stopTimer();
      const ms = performance.now() - st.t0;
      const firstOk = correct && st.wrong === 0 && st.hints === 0;
      $opts.forEach((b, k) => {
        b.disabled = true;
        if (opts[k].ok) b.classList.add('right');
        else if (!b.classList.contains('wrong')) b.classList.add('dim');
      });
      record(q, firstOk, ms);

      let head, gained = 0, flash = '';
      if (sprint) {
        if (correct) {
          gained = 100 + Math.max(0, Math.round(50 * (1 - ms / (q.sec * 1000))));
          if (ms <= q.sec * 1000) flash = '<span class="flash">⚡ 秒殺！</span> ';
          session.score += gained;
        }
      }
      if (correct) {
        head = `${flash}${st.wrong ? pick(AFTER_WRONG) : st.hints ? pick(AFTER_HINT) : pick(PRAISE)}
          ${sprint ? `<span class="score">+${gained}</span>` : ''}
          <span class="clock">（用時 ${fmtSec(ms)}）</span>`;
      } else if (wrongOpt) {
        const mis = MISCONCEPTIONS[wrongOpt.m];
        head = `${pick(OOPS)}</span>
          ${mis ? `<span class="tag">🔍 觀念檢查：${fmt(mis.name)}</span><br>` : ''}${fmt(wrongOpt.fb || '')}<span>`;
      } else {
        head = '沒關係，我們一起看解析 📖';
      }

      $fb.innerHTML = `<div class="fb ${correct ? 'good' : 'bad'}">
        <span class="title">${head}</span>
        <div class="sol"><b>解析：</b>${fmt(q.sol)}</div>
        <div class="tip">⚡ <b>快速解題：</b>${fmt(q.tip)}</div>
      </div>`;

      session.results.push({ id: q.id, firstOk, correct, ms, mis: st.misCodes.slice(), hints: st.hints });
      updateHintBtn();
      if ($giveUp) $giveUp.hidden = true;
      const tools = $app.querySelector('.tools');
      const last = session.idx >= session.list.length - 1;
      tools.insertAdjacentHTML('beforeend', `<button class="btn primary" id="next">${last ? '看結果 🏁' : '下一題 →'}</button>`);
      const $next = $app.querySelector('#next');
      $next.onclick = () => { if (last) showSummary(); else { session.idx++; renderQuestion(); } };
      $next.focus({ preventScroll: true });
    }

    $opts.forEach(($b, k) => $b.addEventListener('click', () => choose(k)));
    session.keyHandler = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = '1234'.indexOf(e.key) >= 0 ? '1234'.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
      if (k >= 0 && k < $opts.length && !$opts[k].disabled) choose(k);
      if (e.key === 'h' || e.key === 'H') $hintBtn.click();
    };
  }

  document.addEventListener('keydown', (e) => {
    if (session && session.keyHandler && document.querySelector('.opts')) session.keyHandler(e);
  });

  /* ================= 結果頁 ================= */
  function showSummary() {
    stopTimer();
    const s = session;
    if (!s || !s.results.length) { go('home'); return; }
    const n = s.results.length;
    const first = s.results.filter((r) => r.firstOk).length;
    const totalMs = s.results.reduce((a, r) => a + r.ms, 0);
    const misCount = {};
    s.results.forEach((r) => r.mis.forEach((m) => { misCount[m] = (misCount[m] || 0) + 1; }));
    const misList = Object.entries(misCount).sort((a, b) => b[1] - a[1]);
    const wrongIds = s.results.filter((r) => !r.firstOk).map((r) => r.id);
    const sprint = s.mode === 'sprint';
    let newBest = false;
    if (sprint && s.score > store.sprintBest) { store.sprintBest = s.score; save(); newBest = true; }

    const rate = first / n;
    const cheer = rate === 1 ? '全部一次答對，觀念超穩！🏆'
      : rate >= 0.8 ? '很不錯！再把少數幾個觀念補起來就完美了 🌟'
      : rate >= 0.5 ? '有進步空間，下面列出的觀念是最值得複習的地方 💪'
      : '別灰心！把下面的觀念一個一個弄懂，分數會跳很快 🌱';

    $app.innerHTML = `
      <h1>${sprint ? '⚡ 衝刺結果' : '🏁 練習結果'}</h1>
      <p class="sub">${s.title}</p>
      <div class="card">
        <div class="stats">
          <div><small>一次就答對</small><span class="big-num">${first}</span> / ${n}</div>
          <div><small>平均每題</small><span class="big-num">${(totalMs / n / 1000).toFixed(0)}</span> 秒</div>
          ${sprint ? `<div><small>總分${newBest ? '（新紀錄！）' : ''}</small><span class="big-num">${s.score}</span></div>
                      <div><small>最佳紀錄</small><span class="big-num">${store.sprintBest}</span></div>` : ''}
        </div>
        <p style="margin:6px 0 0">${cheer}</p>
      </div>
      ${misList.length ? '<h2>🩺 這一輪暴露的觀念漏洞</h2>' : ''}
      ${misList.map(([m, c]) => misCard(m, c, '本輪')).join('')}
      <div class="tools">
        ${wrongIds.length ? '<button class="btn primary big" id="redo">🔁 錯題再練一次</button>' : ''}
        <button class="btn big" id="again">${sprint ? '再衝一輪' : '重做這一組'}</button>
        <button class="btn big" id="home">回首頁</button>
      </div>`;

    bindMisButtons();
    const $redo = $app.querySelector('#redo');
    if ($redo) $redo.onclick = () => startPractice(wrongIds.map((id) => byId[id]), '錯題重練');
    $app.querySelector('#again').onclick = () => {
      if (sprint) go('sprint');
      else startPractice(s.list, s.title);
    };
    $app.querySelector('#home').onclick = () => go('home');
    session = null;
  }

  function misCard(code, count, label) {
    const m = MISCONCEPTIONS[code];
    if (!m) return '';
    const n = QUESTIONS.filter((q) => q.opts.some((o) => o.m === code)).length;
    return `<div class="card mis">
      <h4><span>${fmt(m.name)}</span><span class="cnt">${label} ${count} 次</span></h4>
      <div class="fix">✅ ${fmt(m.fix)}</div>
      ${n ? `<div class="tools"><button class="btn" data-mis="${code}">針對這個觀念練習（${n} 題）</button></div>` : ''}
    </div>`;
  }
  function bindMisButtons() {
    $app.querySelectorAll('[data-mis]').forEach((b) => b.addEventListener('click', () => {
      const code = b.dataset.mis;
      const list = QUESTIONS.filter((q) => q.opts.some((o) => o.m === code)).sort((a, c) => a.lv - c.lv || a.ch - c.ch);
      startPractice(list, `觀念特訓：${MISCONCEPTIONS[code].name.replace(/[_^]\{|\}|#f\{|#r\{/g, '')}`);
    }));
  }

  /* ================= 月考衝刺設定 ================= */
  function viewSprintSetup() {
    $app.innerHTML = `
      <h1>⚡ 月考衝刺</h1>
      <p class="sub">隨機出題、計時作答。每題只有一次機會：答對得 100 分，比建議時間快還有加分；看提示扣 30 分。答錯會立刻告訴你錯在哪個觀念。</p>
      <div class="card">
        <b>範圍</b>
        <div class="pick" id="chs">
          ${[5, 6, 7].map((c) => `<label><input type="checkbox" value="${c}" checked>第${c}章 ${CHAPTERS[c].name}</label>`).join('')}
        </div>
        <b>難度</b>
        <div class="pick" id="lvs">
          ${[1, 2, 3, 4, 5].map((l) => `<label><input type="checkbox" value="${l}" ${l === 4 ? '' : 'checked'}>${LEVELS[l].icon} ${LEVELS[l].name}</label>`).join('')}
        </div>
        <b>題數</b>
        <div class="pick" id="num">
          ${[5, 10, 15].map((n) => `<label><input type="radio" name="num" value="${n}" ${n === 10 ? 'checked' : ''}>${n} 題</label>`).join('')}
        </div>
        <div class="tools">
          <button class="btn primary big" id="go">開始衝刺 🚀</button>
          <span class="clock" style="align-self:center">最佳紀錄：${store.sprintBest} 分　·　鍵盤 1–4 可直接作答，H 看提示</span>
        </div>
      </div>
      <div class="card">
        <b>月考前的建議用法</b>
        <ol style="margin:6px 0 0;padding-left:20px">
          <li>先做一輪「基本觀念＋基本應用」，確定沒有觀念漏洞。</li>
          <li>到「🩺 觀念診斷」看自己最常錯的觀念，按「針對這個觀念練習」。</li>
          <li>最後加入「綜合」和「歷屆考題型」，練習在建議時間內答對。</li>
        </ol>
      </div>`;
    $app.querySelector('#go').onclick = () => {
      const chs = [...$app.querySelectorAll('#chs input:checked')].map((x) => +x.value);
      const lvs = [...$app.querySelectorAll('#lvs input:checked')].map((x) => +x.value);
      const n = +$app.querySelector('#num input:checked').value;
      const pool = QUESTIONS.filter((q) => chs.includes(q.ch) && lvs.includes(q.lv));
      if (!pool.length) { toast('請至少選一個章節和一個難度'); return; }
      // 優先出：沒做過的、上次答錯的
      const weight = (q) => { const r = store.q[q.id]; return !r ? 2 : r.last ? 1 : 3; };
      const list = shuffle(pool).sort((a, b) => weight(b) - weight(a)).slice(0, n);
      startSprint(shuffle(list));
    };
  }

  /* ================= 觀念診斷報告 ================= */
  function viewReport() {
    const attempted = QUESTIONS.filter((q) => store.q[q.id]);
    const totalN = attempted.reduce((a, q) => a + store.q[q.id].n, 0);
    const totalOk = attempted.reduce((a, q) => a + store.q[q.id].ok, 0);
    const misList = Object.entries(store.mis).sort((a, b) => b[1] - a[1]);

    let table = '<table class="grid"><tr><th>層次</th>' + [5, 6, 7].map((c) => `<th>第${c}章</th>`).join('') + '</tr>';
    for (const lv of [1, 2, 3, 4, 5]) {
      table += `<tr><td>${LEVELS[lv].icon} ${LEVELS[lv].name}</td>`;
      for (const ch of [5, 6, 7]) {
        const qs = QUESTIONS.filter((q) => q.ch === ch && q.lv === lv);
        const done = qs.filter((q) => store.q[q.id]);
        if (!done.length) { table += '<td style="color:var(--muted)">—</td>'; continue; }
        const ok = done.filter((q) => store.q[q.id].last).length;
        const pct = Math.round((ok / done.length) * 100);
        const color = pct >= 80 ? 'var(--ok)' : pct >= 50 ? 'var(--warn)' : 'var(--bad)';
        table += `<td style="color:${color};font-weight:600">${ok}/${done.length}</td>`;
      }
      table += '</tr>';
    }
    table += '</table><p class="clock" style="margin:6px 0 0">格子顯示「最近一次一次就答對的題數／做過的題數」</p>';

    $app.innerHTML = `
      <h1>🩺 觀念診斷</h1>
      <p class="sub">根據你在這台裝置上的所有作答紀錄。選錯的選項會被歸類到它背後的錯誤觀念。</p>
      ${attempted.length ? `
      <div class="card">
        <div class="stats">
          <div><small>做過的題目</small><span class="big-num">${attempted.length}</span> / ${QUESTIONS.length}</div>
          <div><small>一次答對率</small><span class="big-num">${totalN ? Math.round((totalOk / totalN) * 100) : 0}</span> %</div>
          <div><small>衝刺最佳</small><span class="big-num">${store.sprintBest}</span> 分</div>
        </div>
        ${table}
      </div>
      <h2>需要加強的觀念（由多到少）</h2>
      ${misList.length ? misList.map(([m, c]) => misCard(m, c, '累計')).join('') : '<div class="card empty">目前沒有記錄到錯誤觀念，太強了！🎉</div>'}
      <div class="tools"><button class="btn" id="reset">清除所有紀錄</button></div>
      ` : '<div class="card empty">還沒有作答紀錄。先去做幾題吧！<br><br><button class="btn primary" data-go2="home">開始練習</button></div>'}`;

    bindMisButtons();
    const $r = $app.querySelector('#reset');
    if ($r) $r.onclick = () => {
      if (confirm('確定要清除這台裝置上的所有練習紀錄嗎？')) {
        store = { q: {}, mis: {}, sprintBest: 0 };
        save();
        viewReport();
        toast('紀錄已清除');
      }
    };
    const $h = $app.querySelector('[data-go2]');
    if ($h) $h.onclick = () => go('home');
  }

  /* ================= 圖形實驗室 ================= */
  function viewLab() {
    $app.innerHTML = `
      <h1>🔬 圖形實驗室</h1>
      <p class="sub">拖動滑桿改變底數 a，觀察 y=a<sup>x</sup> 與 y=log<sub>a</sub>x 的變化。</p>
      <div class="card lab">
        <canvas id="cv" width="640" height="560"></canvas>
        <div class="ctrl">
          <span class="aval" id="aval"></span>
          <input type="range" id="a" min="0.2" max="4" step="0.05" value="2">
        </div>
        <div class="ctrl">
          <label><input type="checkbox" id="sExp" checked> y=a<sup>x</sup></label>
          <label><input type="checkbox" id="sLog" checked> y=log<sub>a</sub>x</label>
          <label><input type="checkbox" id="sInv"> y=(1/a)<sup>x</sup></label>
          <label><input type="checkbox" id="sLine" checked> y=x</label>
          <span style="flex:1"></span>
          <button class="btn" data-a="2">a=2</button>
          <button class="btn" data-a="0.5">a=½</button>
          <button class="btn" data-a="3">a=3</button>
        </div>
        <div class="legend">
          <span style="--c:var(--c5)">y=a<sup>x</sup></span>
          <span style="--c:var(--c7)">y=log<sub>a</sub>x</span>
          <span style="--c:#f59e0b">y=(1/a)<sup>x</sup></span>
          <span style="--c:#9ca3af">y=x</span>
        </div>
      </div>
      <div class="card"><b>你觀察到什麼？</b><ul class="obs" id="obs"></ul></div>
      <div class="card"><b>動手想一想</b>
        <ol style="margin:6px 0 0;padding-left:20px">
          <li>把 a 從 2 慢慢拉到 0.5，圖形在經過 a=1 時發生什麼事？為什麼底數不能是 1？</li>
          <li>不管 a 是多少，哪兩個點一直不動？它們跟 a<sup>0</sup>=1、log<sub>a</sub>1=0 有什麼關係？</li>
          <li>打開 y=(1/a)<sup>x</sup>，它和 y=a<sup>x</sup> 對稱於哪一條線？</li>
          <li>a 調大一點，y=a<sup>x</sup> 和 y=log<sub>a</sub>x 會不會相交？（提示：試試 a=1.3 和 a=1.5）</li>
        </ol>
      </div>`;

    const cv = $app.querySelector('#cv');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const X0 = -3.5, X1 = 6.5, Y0 = -3.5, Y1 = 5.25;
    const sx = (x) => ((x - X0) / (X1 - X0)) * W;
    const sy = (y) => H - ((y - Y0) / (Y1 - Y0)) * H;
    const $a = $app.querySelector('#a');
    const chk = (id) => $app.querySelector('#' + id).checked;

    function curve(f, color, x0 = X0, x1 = X1, width = 3) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      let pen = false;
      for (let px = 0; px <= W; px += 1) {
        const x = X0 + (px / W) * (X1 - X0);
        if (x < x0 || x > x1) { pen = false; continue; }
        const y = f(x);
        if (!isFinite(y) || y < Y0 - 5 || y > Y1 + 5) { pen = false; continue; }
        if (!pen) { ctx.moveTo(px, sy(y)); pen = true; } else ctx.lineTo(px, sy(y));
      }
      ctx.stroke();
    }
    function dot(x, y, color, label, dx = 8, dy = -8) {
      if (x < X0 || x > X1 || y < Y0 || y > Y1) return;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(sx(x), sy(y), 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = '16px system-ui'; ctx.fillText(label, sx(x) + dx, sy(y) + dy);
    }

    function draw() {
      const a = +$a.value;
      const isOne = Math.abs(a - 1) < 0.026;
      $app.querySelector('#aval').textContent = `a = ${a.toFixed(2)}`;
      ctx.clearRect(0, 0, W, H);
      // grid
      ctx.strokeStyle = '#eee9dd'; ctx.lineWidth = 1;
      for (let x = Math.ceil(X0); x <= X1; x++) { ctx.beginPath(); ctx.moveTo(sx(x), 0); ctx.lineTo(sx(x), H); ctx.stroke(); }
      for (let y = Math.ceil(Y0); y <= Y1; y++) { ctx.beginPath(); ctx.moveTo(0, sy(y)); ctx.lineTo(W, sy(y)); ctx.stroke(); }
      // axes
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, sy(0)); ctx.lineTo(W, sy(0)); ctx.moveTo(sx(0), 0); ctx.lineTo(sx(0), H); ctx.stroke();
      ctx.fillStyle = '#666'; ctx.font = '13px system-ui';
      for (let x = Math.ceil(X0); x <= X1; x++) if (x) ctx.fillText(x, sx(x) - 4, sy(0) + 16);
      for (let y = Math.ceil(Y0); y <= Y1; y++) if (y) ctx.fillText(y, sx(0) - 18, sy(y) + 4);
      ctx.fillText('x', W - 14, sy(0) - 6); ctx.fillText('y', sx(0) + 6, 14);

      if (chk('sLine')) { ctx.setLineDash([6, 6]); curve((x) => x, '#9ca3af', X0, X1, 1.5); ctx.setLineDash([]); }
      const obs = [];
      if (isOne) {
        curve(() => 1, '#c2410c');
        obs.push('a=1 時 1<sup>x</sup> 永遠等於 1，變成水平線 y=1，失去「指數成長」的特性；log<sub>1</sub>x 也無法定義。所以底數規定 a≠1。');
      } else {
        if (chk('sInv')) curve((x) => Math.pow(1 / a, x), '#f59e0b');
        if (chk('sExp')) curve((x) => Math.pow(a, x), '#2563eb');
        if (chk('sLog')) curve((x) => Math.log(x) / Math.log(a), '#0d9488', 0.0005, X1);
        if (chk('sExp')) { dot(0, 1, '#2563eb', '(0,1)', 8, -10); dot(1, a, '#2563eb', '(1,a)', 8, -10); }
        if (chk('sLog')) { dot(1, 0, '#0d9488', '(1,0)', 6, 20); dot(a, 1, '#0d9488', '(a,1)', 8, 18); }

        if (a > 1) obs.push(`a=${a.toFixed(2)}>1：y=a<sup>x</sup> 和 y=log<sub>a</sub>x 都是<b>遞增</b>函數。`);
        else obs.push(`0<a=${a.toFixed(2)}<1：y=a<sup>x</sup> 和 y=log<sub>a</sub>x 都是<b>遞減</b>函數——解不等式時要變號！`);
        obs.push('y=a<sup>x</sup> 永遠在 x 軸上方（值域 y>0），必過 (0,1)；y=log<sub>a</sub>x 永遠在 y 軸右邊（定義域 x>0），必過 (1,0)。');
        obs.push('兩條曲線對稱於虛線 y=x：(1,a) 與 (a,1) 互為對稱點。');
        if (chk('sInv')) obs.push('y=(1/a)<sup>x</sup>=a<sup>−x</sup> 與 y=a<sup>x</sup> 對稱於 y 軸。');
        if (a > 1) {
          const e = Math.exp(1 / Math.E);
          if (a < e - 0.005) obs.push(`a 比較接近 1（a<e<sup>1/e</sup>≈1.44）時，y=a<sup>x</sup> 與 y=log<sub>a</sub>x 會在 y=x 上相交！`);
          else if (a <= e + 0.005) obs.push('a≈1.44 時兩曲線剛好相切於 y=x。');
          else obs.push('a 比較大時，y=a<sup>x</sup> 與 y=log<sub>a</sub>x 不相交。');
        } else {
          obs.push('0<a<1 時，兩曲線在 y=x 上一定有交點（試著找找看）。');
        }
      }
      $app.querySelector('#obs').innerHTML = obs.map((t) => `<li>${t}</li>`).join('');
    }
    $a.addEventListener('input', draw);
    $app.querySelectorAll('.lab input[type=checkbox]').forEach((c) => c.addEventListener('change', draw));
    $app.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { $a.value = b.dataset.a; draw(); }));
    draw();
  }

  go('home');
})();
