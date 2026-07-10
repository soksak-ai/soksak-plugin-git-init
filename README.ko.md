# soksak-plugin-git-init

새 프로젝트의 루트에 `.git` 이 없으면 자동으로 `git init` 하는 soksak
플러그인. 기존 이벤트(`project.created`)와 명령(`git.init`)만 조합한다 —
자체 백엔드 0줄.

## 동작

프로젝트가 생성되면(`project.created`) 루트를 `git.init` 명령에 넘긴다.
`.git` 이 이미 있으면 no-op(멱등).

## 커맨드

정책의 상태와 수동 실행 지점을 헤드리스 커맨드로 노출한다.

```bash
sok plugin.soksak-plugin-git-init.status   # 정책 상태: 관찰 이벤트·위임 명령·실행 횟수·마지막 결과
sok plugin.soksak-plugin-git-init.run '{"path":"/Users/me/work"}'   # 지금 이 디렉토리에 정책 적용
```

- `status` 는 `{ active, event, delegate, autoRuns, manualRuns, last }` 를 반환한다.
  `last` 는 마지막 위임 결과(`source` 가 `auto` 면 이벤트 발동, `manual` 이면 `run`).
- `run` 은 `path` 필수, `git.init` 에 위임한다(`.git` 없을 때만 초기화). 실행은 정책
  상태에 기록된다.

코어 명령은 그대로 직접 쓸 수 있다:

```bash
sok git.init '{"path":"/Users/me/work"}'   # 생략 시 활성 프로젝트 루트(정책 상태에 기록되지 않음)
```

## 테스트

```bash
node --test   # 커맨드 표면 conformance + 정책 동작(mock 호스트, 앱 불요)
```

## 권한

- `commands` — `git.init` 명령 실행 + 자기 커맨드 등록
