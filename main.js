// git 자동 초기화 — 새 프로젝트(project.created)의 루트에 .git 이 없으면
// git.init 명령을 실행한다(있으면 명령이 no-op, 멱등). 기존 명령+이벤트만
// 조합 — 자체 백엔드 0줄.
// C2 투명성(command 축): 뷰 없는 정책 플러그인도 커맨드 표면을 노출한다 —
// status(정책 관찰면: 무엇을 보고 어디에 위임하며 몇 번 실행했는가)와
// run(같은 위임 경로의 수동 실행, git.init 멱등이라 안전).

const EVENT = "project.created";
const DELEGATE = "git.init";

export default {
  activate(ctx) {
    const app = ctx.app;

    // 정책 실행 장부(세션-로컬, 비영속) — status 가 반환하는 관찰면.
    // 정책 자체가 무상태 위임이라 영속할 상태가 없다. last 는 마지막 위임 결과 1건.
    const stats = { autoRuns: 0, manualRuns: 0, last: null };
    const record = (source, path, r) => {
      if (source === "auto") stats.autoRuns += 1;
      else stats.manualRuns += 1;
      stats.last = {
        source, // "auto"(이벤트) | "manual"(run 커맨드)
        path,
        ok: r.ok,
        code: r.code,
        // 성공 시 위임 응답의 initialized(실제 init 수행 여부, false=이미 저장소).
        initialized: r.ok ? r.data?.initialized === true : null,
        at: Date.now(),
      };
    };

    // 정책 본체 — 이벤트 관찰 → git.init 위임(.git 존재 시 위임 명령이 no-op).
    ctx.subscriptions.push(
      app.events.on(EVENT, (p) => {
        if (!p || !p.root) return; // 루트 없는 프로젝트는 대상 아님
        void app.commands.execute(DELEGATE, { path: p.root }).then((r) => {
          record("auto", p.root, r);
          if (!r.ok) console.error("[soksak-git-init]", r.message);
        });
      }),
    );

    const reg = (name, spec) =>
      ctx.subscriptions.push(app.commands.register(name, spec));

    reg("status", {
      description:
        "Report the auto git init policy state: which event it observes, which command it delegates to, per-session run counts (auto via project.created, manual via run), and the last delegation result. Use to verify the policy is active and inspect what it did.",
      triggers: { ko: "자동 깃 초기화 정책 상태 조회 확인" },
      params: {},
      returns:
        "{ active, event, delegate, autoRuns, manualRuns, last: {source,path,ok,code,initialized,at}|null }",
      examples: ["sok plugin.soksak-plugin-git-init.status"],
      message: (d) =>
        `자동 git init 정책 활성 — 이번 세션 자동 ${d.autoRuns}회·수동 ${d.manualRuns}회 실행.`,
      handler: () => ({
        active: true, // 이 커맨드가 응답한다 = activate 가 구독을 배선했다
        event: EVENT,
        delegate: DELEGATE,
        autoRuns: stats.autoRuns,
        manualRuns: stats.manualRuns,
        last: stats.last,
      }),
    });

    reg("run", {
      description:
        "Apply the git init policy to a directory now: delegates to git.init, which initializes only when .git is absent (no-op otherwise, idempotent). Use for projects that existed before the policy or were created without a root event. The run is recorded in the policy status.",
      triggers: { ko: "깃 저장소 수동 초기화 지금 실행" },
      params: {
        path: {
          type: "string",
          required: true,
          description: "대상 디렉토리(절대 경로)",
        },
      },
      returns: "{ initialized: whether init was performed, path }",
      examples: [
        'sok plugin.soksak-plugin-git-init.run \'{"path":"/Users/me/work"}\'',
      ],
      message: (d) =>
        d.initialized
          ? `git 저장소를 초기화했습니다 — ${d.path}`
          : `이미 git 저장소입니다 — ${d.path}`,
      handler: async (p, inv) => {
        const path =
          typeof p.path === "string" && p.path.trim() ? p.path : null;
        if (!path) {
          return {
            ok: false,
            code: "INVALID_PARAMS",
            message: "path 필요 — 대상 디렉토리 절대 경로를 지정하세요",
          };
        }
        // 중첩 실행은 inv.execute(유래·상관 상속) — 구버전 호스트만 app.commands.execute 폴백.
        const exec = inv?.execute ?? ((n, prm) => app.commands.execute(n, prm));
        const r = await exec(DELEGATE, { path });
        record("manual", path, r);
        if (!r.ok) return { ok: false, code: r.code, message: r.message };
        return { initialized: r.data?.initialized === true, path };
      },
    });
  },

  deactivate() {
    // 구독·커맨드는 ctx.subscriptions/호스트 tracker 가 자동 해제 — 별도 정리 없음.
  },
};
