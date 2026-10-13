// 「運営者から届いた情報」と「見張り役が自動で見つけた候補」を、別々の枠に置く（KV）。
//   x:tips  … 運営者が送った情報（URLや本文）。自動の候補では消えない。
//   x:cands … 見張り役が自動で拾った候補（未確認）。数の上限があり、同じ記事は1回だけ。
// 以前は1つの枠（x:tips・50件）に混ぜていたため、自動の候補が10分ごとに入って、運営者の情報が約50分で押し出されていた。
// 自動更新が読む一覧（/api/xdraft?op=tips）は、これまでと同じ形（運営者の情報が先、自動の候補があと）で返す。
export const MANUAL_MAX = 50;
export const AUTO_MAX = 30;
export const AUTO_PREFIX = "【自動で見つけた候補・未確認】";

async function rd(env, k) {
  try { const v = JSON.parse((await env.REPORTS.get(k)) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

// 自動更新に見せる一覧：運営者の情報 → 自動の候補 → 旧形式で x:tips に混ざっていた自動候補
export async function listTips(env) {
  const t = await rd(env, "x:tips"), c = await rd(env, "x:cands");
  return [...t.filter(x => !x.auto), ...c.map(x => ({ ...x, auto: true })), ...t.filter(x => x.auto)];
}

// 運営者が送った情報を追加する。旧形式で混ざっていた自動候補は、このとき取り除く
export async function addManualTip(env, tip) {
  const manual = (await rd(env, "x:tips")).filter(x => !x.auto);
  manual.push(tip);
  await env.REPORTS.put("x:tips", JSON.stringify(manual.slice(-MANUAL_MAX)));
  return manual.length;
}

// 対応済みにする（どちらの枠にあっても消す。変わった枠だけ書く）
export async function doneTip(env, id) {
  const t = await rd(env, "x:tips"), c = await rd(env, "x:cands");
  const t2 = t.filter(x => x.id !== id), c2 = c.filter(x => x.id !== id);
  if (t2.length !== t.length) await env.REPORTS.put("x:tips", JSON.stringify(t2));
  if (c2.length !== c.length) await env.REPORTS.put("x:cands", JSON.stringify(c2));
  return { removed: (t.length - t2.length) + (c.length - c2.length), left: t2.length + c2.length };
}

// 自動の候補を追加する。同じ記事（key）は1回だけ。運営者がすでに送った記事も入れない。新しく入ったときだけ書く
// entries: [{ key: 記事の識別子, text: 本文 }]  at: 表示用の日時
export async function addAutoCandidates(env, entries, at, now = Date.now()) {
  if (!entries.length) return 0;
  const c = await rd(env, "x:cands");
  const manualText = (await rd(env, "x:tips")).filter(x => !x.auto).map(x => String(x.text || "")).join("\n");
  const have = new Set(c.map(x => x.k).filter(Boolean));
  let n = 0;
  for (const e of entries) {
    if (e.key) {
      if (have.has(e.key)) continue;
      if (manualText.includes(e.key)) continue;
      have.add(e.key);
    }
    c.push({ id: (now + n).toString(36), at, auto: true, k: e.key || "", text: AUTO_PREFIX + e.text });
    n++;
  }
  if (n) await env.REPORTS.put("x:cands", JSON.stringify(c.slice(-AUTO_MAX)));
  return n;
}
